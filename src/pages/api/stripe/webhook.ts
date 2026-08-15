import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/supabase/admin'
import { notifySalesEvent } from '@/lib/sales-event-notifications'
import { sendContractEmail } from '@/lib/send-contract-email'

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
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session)
        break
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
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
  const adminPhone = metadata.admin_phone || null
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

  // Notifica a equipe + feed super-admin quando o checkout é concluído (venda
  // efetivada — trial ou pago, novo cadastro ou upgrade). Best-effort.
  const notifyCheckoutSuccess = (tid: string) =>
    notifySalesEvent({
      kind: 'SALE_SUCCESS',
      title: existingTenantId
        ? 'Upgrade de plano efetivado'
        : isTrial
          ? 'Novo cadastro (trial) efetivado'
          : 'Nova venda efetivada',
      lines: [
        `Cliente: ${adminName} <${adminEmail}>`,
        `Plano: ${planSlug || '—'} · Faixa: ${revenueTier || '—'}`,
        `Status: ${isTrial ? 'TRIAL (sem cobrança imediata)' : 'PAGO'}`,
        `Tipo: ${existingTenantId ? 'upgrade de plano' : 'novo cadastro'}`,
      ],
      tenantId: tid,
      amount: isTrial ? null : amountTotal,
      metadata: {
        session_id: session.id,
        subscription_id: stripeSubscriptionId,
        plan_slug: planSlug,
        revenue_tier: revenueTier,
        is_trial: isTrial,
      },
    })

  const rawOrigin = process.env.NEXT_PUBLIC_APP_URL
  const origin =
    rawOrigin && !rawOrigin.includes('localhost')
      ? rawOrigin
      : 'https://app.precificacerto.com'

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
    await notifyCheckoutSuccess(existingTenantId)
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

    // Roteiro v4/v5 §8: avisa a planilha do funil que este lead pagou (best-effort).
    // Fica após a criação do tenant e NUNCA quebra o webhook.
    await notifySheetLeadPaid(adminEmail)

    // Telefone do pré-cadastro: gravado por UPDATE (evita alterar a RPC/assinatura).
    // Best-effort — falha aqui não impede a criação do tenant.
    if (adminPhone) {
      const { error: phoneErr } = await supabaseAdmin
        .from('tenants')
        .update({ phone: adminPhone })
        .eq('id', tenantId)
      if (phoneErr) console.warn('checkout.session.completed: falha ao gravar telefone:', phoneErr.message)
    }

    // Evita e-mail duplicado: se webhook e confirm-checkout-session rodarem em paralelo, só o
    // primeiro tenant (por created_at) envia convite. O outro desiste.
    if (stripeSubscriptionId) {
      const { data: tenantsWithSub } = await supabaseAdmin
        .from('tenants')
        .select('id, created_at')
        .eq('stripe_subscription_id', stripeSubscriptionId)
        .order('created_at', { ascending: true })
        .limit(2)
      const firstTenantId = tenantsWithSub?.[0]?.id
      if (firstTenantId && firstTenantId !== tenantId) {
        if (process.env.NODE_ENV === 'development') console.log('checkout.session.completed: outro processo já criou tenant para esta subscription, skip invite (idempotente)')
        return
      }
    }

    // Não enviar convite de novo se o usuário já existe no Auth (já recebeu o e-mail antes).
    // Garante vínculo com a tenant (public.users + tenant_owners) sem mandar outro e-mail.
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const existingAuthUser = listData?.users?.find((u) => u.email?.toLowerCase() === adminEmail.trim().toLowerCase())
    if (existingAuthUser) {
      if (process.env.NODE_ENV === 'development') console.log('checkout.session.completed: usuário já existe no Auth, skip invite (evita e-mail duplicado)')
      await createAdminUserFallback(adminEmail, adminName, tenantId)
      if (!isTrial) {
        await insertBillingRecord(tenantId, amountTotal, stripeSubscriptionId, stripeCustomerId, session.id)
      }
      await notifyCheckoutSuccess(tenantId)
      return
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
    await notifyCheckoutSuccess(tenantId)
    if (process.env.NODE_ENV === 'development') console.log(`checkout.session.completed: created tenant (${planStatus})`)
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as any)?.id
  if (!subscriptionId) return

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, name, email, phone, cnpj_cpf, contract_sent_at')
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

  await notifySalesEvent({
    kind: 'SALE_SUCCESS',
    title: 'Renovação de assinatura paga',
    lines: [
      `Cliente: ${(tenant as any).name || tenant.id}`,
      `Fatura: ${invoice.id}`,
      'Status: PAGO (cobrança recorrente confirmada)',
    ],
    tenantId: tenant.id,
    amount,
    metadata: { invoice_id: invoice.id, subscription_id: subscriptionId },
  })

  // FEAT-CONTRACT-EMAIL: envia o Contrato de Licença de Uso ao cliente no PRIMEIRO
  // pagamento confirmado. Guarda de idempotência via tenants.contract_sent_at —
  // nunca reenvia em renovações. Best-effort: falha aqui não afeta o webhook.
  await maybeSendContractOnFirstPayment(invoice, tenant)

  if (process.env.NODE_ENV === 'development') console.log('invoice.paid: updated tenant')
}

/**
 * Envia o contrato ao cliente uma única vez, no 1º pagamento (invoice.paid).
 * Dados: snapshot da invoice do Stripe (nome/e-mail/telefone/CPF-CNPJ) com fallback
 * para o cadastro do tenant. Marca `contract_sent_at` só se o e-mail foi realmente
 * enviado, para permitir nova tentativa no próximo evento caso o SMTP esteja fora.
 */
async function maybeSendContractOnFirstPayment(
  invoice: Stripe.Invoice,
  tenant: { id: string; name?: string | null; email?: string | null; phone?: string | null; cnpj_cpf?: string | null; contract_sent_at?: string | null }
) {
  try {
    if (tenant.contract_sent_at) return // já enviado antes — idempotente

    const inv = invoice as any
    const taxIdFromStripe: string | null =
      Array.isArray(inv.customer_tax_ids) && inv.customer_tax_ids.length > 0
        ? (inv.customer_tax_ids[0]?.value ?? null)
        : null

    const name = inv.customer_name || tenant.name || ''
    const email = inv.customer_email || tenant.email || ''
    const phone = inv.customer_phone || tenant.phone || ''
    const cpfCnpj = taxIdFromStripe || tenant.cnpj_cpf || ''

    if (!email) {
      console.warn('invoice.paid: contrato não enviado — cliente sem e-mail')
      return
    }

    const { sent } = await sendContractEmail({
      name,
      email,
      phone,
      cpfCnpj,
      signatureDate: new Date(),
    })

    if (!sent) return // SMTP indisponível — tenta de novo no próximo evento

    const patch: Record<string, unknown> = { contract_sent_at: new Date().toISOString() }
    // Aproveita o CPF/CNPJ coletado no Stripe para completar o cadastro do tenant.
    if (taxIdFromStripe && !tenant.cnpj_cpf) patch.cnpj_cpf = taxIdFromStripe

    await supabaseAdmin.from('tenants').update(patch).eq('id', tenant.id)

    if (process.env.NODE_ENV === 'development') console.log('invoice.paid: contrato enviado ao cliente')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn('invoice.paid: falha ao enviar contrato:', msg)
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as any)?.id
  if (!subscriptionId) return

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, name')
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

  await notifySalesEvent({
    kind: 'PAYMENT_FAILED',
    title: 'Falha no pagamento da assinatura',
    lines: [
      `Cliente: ${(tenant as any).name || tenant.id}`,
      `Fatura: ${invoice.id}`,
      'Ação: tenant marcado como OVERDUE / SUSPENDED',
    ],
    tenantId: tenant.id,
    amount,
    metadata: { invoice_id: invoice.id, subscription_id: subscriptionId },
  })

  if (process.env.NODE_ENV === 'development') console.log('invoice.payment_failed: marked OVERDUE and SUSPENDED')
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const subscriptionId = subscription.id

  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id, name, stripe_subscription_id')
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

  await notifySalesEvent({
    kind: 'SUBSCRIPTION_CANCELLED',
    title: 'Assinatura cancelada',
    lines: [
      `Cliente: ${(tenant as any).name || tenant.id}`,
      `Assinatura: ${subscriptionId}`,
      'Ação: tenant marcado como CANCELLED',
    ],
    tenantId: tenant.id,
    metadata: { subscription_id: subscriptionId },
  })

  if (process.env.NODE_ENV === 'development') console.log('customer.subscription.deleted: cancelled tenant')
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {}
  const email = metadata.admin_email || session.customer_details?.email || session.customer_email || '—'
  const name = metadata.admin_name || email
  const amount = (session.amount_total ?? 0) / 100

  await notifySalesEvent({
    kind: 'CHECKOUT_ABANDONED',
    title: 'Tentativa de compra não concluída',
    lines: [
      `Cliente: ${name} <${email}>`,
      `Plano: ${metadata.plan_slug || '—'} · Faixa: ${metadata.revenue_tier || '—'}`,
      'Motivo: sessão de checkout expirou sem pagamento',
    ],
    tenantId: metadata.tenant_id || null,
    amount: amount || null,
    metadata: { session_id: session.id, plan_slug: metadata.plan_slug, revenue_tier: metadata.revenue_tier },
  })

  if (process.env.NODE_ENV === 'development') console.log('checkout.session.expired: notified abandoned checkout')
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const amount = (pi.amount ?? 0) / 100
  const email = pi.receipt_email || (pi.metadata && pi.metadata.admin_email) || '—'
  const reason = pi.last_payment_error?.message || 'Pagamento recusado pela operadora'

  await notifySalesEvent({
    kind: 'PAYMENT_FAILED',
    title: 'Tentativa de pagamento recusada',
    lines: [
      `Cliente: ${email}`,
      `Motivo: ${reason}`,
      `PaymentIntent: ${pi.id}`,
    ],
    tenantId: (pi.metadata && pi.metadata.tenant_id) || null,
    amount: amount || null,
    metadata: { payment_intent_id: pi.id, decline_code: pi.last_payment_error?.decline_code },
  })

  if (process.env.NODE_ENV === 'development') console.log('payment_intent.payment_failed: notified failed attempt')
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

/**
 * Best-effort: avisa a planilha do funil que este e-mail pagou (roteiro v4/v5 §8).
 * O Apps Script acha a linha pelo e-mail e marca Status=pagou + a data.
 *
 * NUNCA lança: pagamento e criação de conta têm prioridade absoluta sobre a planilha.
 * Planilha fora do ar → registra o erro e segue. Timeout curto (2500ms) para não somar
 * demais à resposta do webhook (a Stripe reenvia o evento se demorar). Variáveis ausentes
 * só geram um aviso no log.
 *
 * Respostas esperadas do Apps Script: 'marcado como pago' (ok),
 * 'lead nao encontrado' (e-mail do Stripe difere do da planilha),
 * 'nao autorizado' (token divergente entre os projetos). Qualquer coisa fora de
 * 'marcado como pago' é registrada para o diagnóstico não se perder.
 */
async function notifySheetLeadPaid(email: string): Promise<void> {
  const url = process.env.SHEETS_WEBHOOK_URL
  const token = process.env.SHEETS_WEBHOOK_TOKEN
  if (!url || !token) {
    console.warn('[sheets] SHEETS_WEBHOOK_URL/TOKEN ausentes — aviso de pagamento não enviado')
    return
  }
  const cleanEmail = (email || '').trim().toLowerCase()
  if (!cleanEmail) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2500)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, evento: 'pagou', email: cleanEmail }),
      signal: controller.signal,
    })
    const texto = (await resp.text()).trim()
    if (texto !== 'marcado como pago') {
      console.warn('[sheets] resposta inesperada ao marcar pagamento:', texto, '| email:', cleanEmail)
    }
  } catch (err: unknown) {
    console.warn('[sheets] falha ao avisar pagamento à planilha (ignorado):', err instanceof Error ? err.message : 'unknown')
  } finally {
    clearTimeout(timer)
  }
}
