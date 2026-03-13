import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/supabase/admin'

export const config = { api: { bodyParser: false } }

// Usa a versão padrão definida na conta Stripe (sem apiVersion fixa).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

/** Gera senha temporária; o usuário pode usar "Esqueci minha senha" para redefinir. */
function randomPassword(): string {
  return crypto.randomBytes(24).toString('base64url')
}

/**
 * Fallback quando inviteUserByEmail falha (ex.: rate limit): cria usuário admin com createUser.
 * O trigger handle_new_auth_user popula public.users e tenant_owners.
 * Se o usuário já existir (convite criou auth mas falhou no envio), garante vínculo na tenant.
 */
async function createAdminUserFallback(
  adminEmail: string,
  adminName: string,
  tenantId: string
): Promise<boolean> {
  const email = adminEmail.trim().toLowerCase()
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: {
      tenant_id: tenantId,
      role: 'admin',
      from_admin_invite: 'true',
      name: adminName || email,
    },
  })

  if (!createError) {
    return true
  }

  const msg = (createError?.message ?? '').toLowerCase()
  const alreadyExists =
    msg.includes('already registered') ||
    msg.includes('already exists') ||
    msg.includes('user already exists')

  if (!alreadyExists) {
    console.error('createAdminUserFallback: createUser failed', createError?.message)
    return false
  }

  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const authUser = list?.users?.find((u) => u.email?.toLowerCase() === email)
  if (!authUser?.id) {
    console.error('createAdminUserFallback: user exists but could not list by email')
    return false
  }

  const { data: existingRow } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle()

  if (!existingRow) {
    const { error: insertUserErr } = await supabaseAdmin.from('users').insert({
      id: authUser.id,
      tenant_id: tenantId,
      email,
      name: adminName || '',
      role: 'admin',
      is_super_admin: false,
    })
    if (insertUserErr) {
      console.error('createAdminUserFallback: insert users failed', insertUserErr?.message)
      return false
    }
  }

  const { error: ownerErr } = await supabaseAdmin.from('tenant_owners').upsert(
    { tenant_id: tenantId, user_id: authUser.id },
    { onConflict: 'tenant_id' }
  )
  if (ownerErr) {
    console.error('createAdminUserFallback: tenant_owners upsert failed', ownerErr?.message)
    return false
  }

  return true
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sig = req.headers['stripe-signature']
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' })
  }

  let event: Stripe.Event
  try {
    const rawBody = await getRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed'
    console.error('Stripe webhook signature error')
    return res.status(400).json({ error: message })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      default:
        if (process.env.NODE_ENV === 'development') console.log(`Stripe webhook: unhandled event type ${event.type}`)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown'
    console.error(`Stripe webhook handler error (${event.type}):`, message)
    // Expor a mensagem real de erro ajuda a diagnosticar problemas de integração
    return res.status(500).json({ error: message })
  }

  return res.status(200).json({ received: true })
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {}
  const adminEmail = metadata.admin_email
  const adminName = metadata.admin_name || adminEmail
  const revenueTier = metadata.revenue_tier
  const planSlug = metadata.plan_slug
  const existingTenantId = metadata.tenant_id
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription as any)?.id

  if (!adminEmail) {
    console.error('checkout.session.completed: missing admin_email in metadata')
    return
  }

  let isTrial = false
  let trialEndsAt: string | null = null

  if (stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
    if (sub.trial_end) {
      isTrial = true
      trialEndsAt = new Date(sub.trial_end * 1000).toISOString()
    }
  }

  const planStatus = isTrial ? 'TRIAL' : 'ACTIVE'
  const amountTotal = (session.amount_total ?? 0) / 100
  const rawOrigin = process.env.NEXT_PUBLIC_APP_URL
  const origin =
    rawOrigin && !rawOrigin.includes('localhost')
      ? rawOrigin
      : 'https://precificav2.netlify.app'

  if (existingTenantId) {
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('stripe_subscription_id')
      .eq('id', existingTenantId)
      .single()
    const oldSubscriptionId = (existingTenant as any)?.stripe_subscription_id

    const updatePayload: Record<string, unknown> = {
      plan_status: planStatus,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      revenue_tier: revenueTier,
      plan_slug: planSlug,
      updated_at: new Date().toISOString(),
    }

    if (isTrial && trialEndsAt) {
      updatePayload.trial_ends_at = trialEndsAt
    } else {
      updatePayload.plan_ends_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }

    const { error: updateError } = await supabaseAdmin
      .from('tenants')
      .update(updatePayload)
      .eq('id', existingTenantId)

    if (updateError) {
      console.error('checkout.session.completed: error updating tenant', updateError?.message)
      throw updateError
    }

    if (oldSubscriptionId && oldSubscriptionId !== stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(oldSubscriptionId)
        if (process.env.NODE_ENV === 'development') console.log('checkout.session.completed: cancelled old subscription')
      } catch (cancelErr) {
        console.warn('checkout.session.completed: failed to cancel old subscription')
      }
    }

    if (!isTrial) {
      await insertBillingRecord(existingTenantId, amountTotal, stripeSubscriptionId, stripeCustomerId, session.id)
    }
    if (process.env.NODE_ENV === 'development') console.log(`checkout.session.completed: updated existing tenant to ${planStatus}`)
  } else {
    if (stripeSubscriptionId) {
      const { data: existing } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .limit(1)
        .maybeSingle()
      if (existing?.id) {
        if (process.env.NODE_ENV === 'development') console.log('checkout.session.completed: already processed (idempotent skip)')
        return
      }
    }

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('create_tenant_from_stripe', {
      p_name: adminName,
      p_admin_email: adminEmail,
      p_admin_name: adminName,
      p_stripe_customer_id: stripeCustomerId,
      p_stripe_subscription_id: stripeSubscriptionId,
      p_revenue_tier: revenueTier,
      p_plan_slug: planSlug,
      p_plan_status: planStatus,
      p_trial_ends_at: trialEndsAt,
    })

    if (rpcError) {
      console.error('checkout.session.completed: error creating tenant', rpcError?.message)
      throw rpcError
    }

    const tenantId = (rpcData as { tenant_id?: string })?.tenant_id
    if (!tenantId) {
      throw new Error('create_tenant_from_stripe did not return tenant_id')
    }

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(adminEmail, {
      data: {
        tenant_id: tenantId,
        role: 'admin',
        from_admin_invite: 'true',
        name: adminName,
      },
      redirectTo: `${origin}/criar-senha`,
    })

    if (inviteError) {
      const msg = inviteError?.message ?? ''
      const isRateLimit =
        msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('email rate limit')

      if (isRateLimit) {
        console.warn('checkout.session.completed: email rate limit exceeded, invite not sent. Falling back to createUser.')
      } else {
        console.warn('checkout.session.completed: invite failed:', msg, '- falling back to createUser.')
      }

      // Fallback: criar usuário admin e vincular à tenant para o trigger popular public.users e tenant_owners.
      // O usuário pode usar "Esqueci minha senha" na tela de login para receber o e-mail de redefinição.
      const fallbackOk = await createAdminUserFallback(adminEmail, adminName, tenantId)
      if (!fallbackOk) {
        console.error('checkout.session.completed: createUser fallback failed. Tenant exists but admin not linked.')
        throw inviteError
      }
    }

    if (!isTrial) {
      await insertBillingRecord(tenantId, amountTotal, stripeSubscriptionId, stripeCustomerId, session.id)
    }
    if (process.env.NODE_ENV === 'development') console.log(`checkout.session.completed: created tenant (${planStatus})`)
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as any)?.id
  if (!subscriptionId) return

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .limit(1)

  const tenant = tenants?.[0]
  if (!tenant) {
    if (process.env.NODE_ENV === 'development') console.log('invoice.paid: no tenant found for subscription')
    return
  }

  const now = new Date().toISOString()

  await supabaseAdmin
    .from('tenants')
    .update({
      plan_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      plan_status: 'ACTIVE',
      updated_at: now,
    })
    .eq('id', tenant.id)

  // Reativa todos os usuários da tenant quando o pagamento é confirmado.
  await supabaseAdmin
    .from('users')
    .update({ is_active: true, updated_at: now })
    .eq('tenant_id', tenant.id)

  const amount = (invoice.amount_paid ?? 0) / 100
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id
  await insertBillingRecord(tenant.id, amount, subscriptionId, customerId, invoice.id)

  if (process.env.NODE_ENV === 'development') console.log('invoice.paid: updated tenant')
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as any)?.id
  if (!subscriptionId) return

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .limit(1)

  const tenant = tenants?.[0]
  if (!tenant) return

  const amount = (invoice.amount_due ?? 0) / 100
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id

  await supabaseAdmin.from('tenant_billing').insert({
    tenant_id: tenant.id,
    status: 'OVERDUE',
    amount,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    external_id: invoice.id,
  })

  await supabaseAdmin
    .from('tenants')
    .update({ plan_status: 'SUSPENDED', updated_at: new Date().toISOString() })
    .eq('id', tenant.id)

  if (process.env.NODE_ENV === 'development') console.log('invoice.payment_failed: marked OVERDUE and SUSPENDED')
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, stripe_subscription_id')
    .eq('stripe_subscription_id', subscriptionId)
    .limit(1)

  const tenant = tenants?.[0]
  if (!tenant) {
    if (process.env.NODE_ENV === 'development') console.log('customer.subscription.deleted: no tenant found (possibly upgraded)')
    return
  }

  await supabaseAdmin
    .from('tenants')
    .update({
      plan_status: 'CANCELLED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenant.id)
    .eq('stripe_subscription_id', subscriptionId)

  if (process.env.NODE_ENV === 'development') console.log('customer.subscription.deleted: cancelled tenant')
}

async function insertBillingRecord(
  tenantId: string,
  amount: number,
  subscriptionId?: string,
  customerId?: string,
  externalId?: string
) {
  await supabaseAdmin.from('tenant_billing').insert({
    tenant_id: tenantId,
    status: 'PAID',
    amount,
    paid_at: new Date().toISOString(),
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    external_id: externalId,
  })
}
