import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'

type RevenueTier = 'ate_200k' | 'acima_200k'
type PlanSlug = 'individual' | 'intermediario' | 'pro' | 'advanced'

/** Fallback: IDs dos preços criados no Stripe. Use env para produção. */
const PRICE_IDS_FALLBACK: Record<RevenueTier, Record<PlanSlug, string>> = {
  ate_200k: {
    individual: 'price_1TYZYcC91Syy1O80XCdZdF3h',    // R$ 99,90
    intermediario: 'price_1TYZYcC91Syy1O80JFpqEcsg', // R$ 239,90
    pro: 'price_1TYZYdC91Syy1O80yaiVO8PQ',           // R$ 299,90
    advanced: 'price_1TYZYdC91Syy1O80pWnr70WP',      // R$ 349,90
  },
  acima_200k: {
    individual: 'price_1TYZYdC91Syy1O80KC8tv9ZJ',    // R$ 299,90 (até 3 usuários)
    intermediario: 'price_1TYZYeC91Syy1O80kVRDudtx', // R$ 399,90 (até 5 usuários)
    pro: 'price_1TYZYeC91Syy1O80I6pMn3rj',           // R$ 499,90 (até 7 usuários)
    advanced: 'price_1TrH68C91Syy1O80CF0nxRsi',      // R$ 999,90 (ilimitado)
  },
}

function getPriceIds(): Record<RevenueTier, Record<PlanSlug, string>> {
  return {
    ate_200k: {
      individual: process.env.STRIPE_PRICE_ATE_200K_INDIVIDUAL ?? PRICE_IDS_FALLBACK.ate_200k.individual,
      intermediario: process.env.STRIPE_PRICE_ATE_200K_INTERMEDIARIO ?? PRICE_IDS_FALLBACK.ate_200k.intermediario,
      pro: process.env.STRIPE_PRICE_ATE_200K_PRO ?? PRICE_IDS_FALLBACK.ate_200k.pro,
      advanced: process.env.STRIPE_PRICE_ATE_200K_ADVANCED ?? PRICE_IDS_FALLBACK.ate_200k.advanced,
    },
    acima_200k: {
      individual: process.env.STRIPE_PRICE_ACIMA_200K_INDIVIDUAL ?? PRICE_IDS_FALLBACK.acima_200k.individual,
      intermediario: process.env.STRIPE_PRICE_ACIMA_200K_INTERMEDIARIO ?? PRICE_IDS_FALLBACK.acima_200k.intermediario,
      pro: process.env.STRIPE_PRICE_ACIMA_200K_PRO ?? PRICE_IDS_FALLBACK.acima_200k.pro,
      advanced: process.env.STRIPE_PRICE_ACIMA_200K_ADVANCED ?? PRICE_IDS_FALLBACK.acima_200k.advanced,
    },
  }
}

function getPriceId(revenueTier: RevenueTier, planSlug: PlanSlug): string | null {
  const ids = getPriceIds()
  const id = ids[revenueTier][planSlug]
  return id && id.startsWith('price_') ? id : null
}

const PLAN_ORDER: Record<RevenueTier, PlanSlug[]> = {
  ate_200k: ['individual', 'intermediario', 'pro', 'advanced'],
  acima_200k: ['individual', 'intermediario', 'pro', 'advanced'],
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // CRÍT-5 (Founder 2026-05-27): endpoint serve EXCLUSIVAMENTE upgrade —
  // auth obrigatória ANTES de qualquer leitura do body. tenantId é derivado
  // SEMPRE da sessão JWT, nunca do body. Body.tenantId é parseado apenas
  // pra logar divergência (frontend desatualizado ou tentativa maliciosa).
  const caller = await getCallerContext(req, res)
  if (!caller) return // getCallerContext já enviou 401/403

  const { newPlanSlug, tenantId: bodyTenantId } = req.body as {
    newPlanSlug?: PlanSlug
    tenantId?: string // ignorado; apenas pra logar divergência
  }

  if (!newPlanSlug) {
    return res.status(400).json({ error: 'newPlanSlug é obrigatório.' })
  }

  // Log estruturado se body.tenantId divergir da sessão (não falha — apenas alerta)
  if (bodyTenantId && bodyTenantId !== caller.tenant_id) {
    // eslint-disable-next-line no-console
    console.warn('[CRÍT-5] body.tenantId divergente do session.tenant_id em upgrade-session', {
      caller_tenant: caller.tenant_id,
      body_tenant: bodyTenantId,
      caller_user: caller.user_id,
    })
  }
  const tenantId = caller.tenant_id

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, email, plan_slug, revenue_tier, stripe_customer_id, stripe_subscription_id')
    .eq('id', tenantId)
    .single()

  if (tenantError || !tenant) {
    return res.status(404).json({ error: 'Tenant não encontrado.' })
  }

  const revenueTier = (tenant as any).revenue_tier as RevenueTier
  if (!revenueTier) {
    return res.status(400).json({ error: 'Faixa de faturamento não configurada. Entre em contato com o suporte.' })
  }

  const currentSlug = (tenant as any).plan_slug as PlanSlug
  const order = PLAN_ORDER[revenueTier] || []
  const currentIdx = order.indexOf(currentSlug)
  const newIdx = order.indexOf(newPlanSlug)

  if (newIdx < 0) {
    return res.status(400).json({ error: 'Plano de destino inválido para sua faixa de faturamento.' })
  }
  if (currentIdx >= 0 && newIdx <= currentIdx) {
    return res.status(400).json({ error: 'Você só pode fazer upgrade para um plano superior.' })
  }

  const priceId = getPriceId(revenueTier, newPlanSlug)
  if (!priceId) {
    return res.status(400).json({ error: 'Preço do plano não encontrado.' })
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return res.status(500).json({ error: 'Stripe não configurado.' })
  }

  const rawOrigin = process.env.NEXT_PUBLIC_APP_URL
  const origin =
    rawOrigin && !rawOrigin.includes('localhost')
      ? rawOrigin
      : 'https://app.precificacerto.com'
  const adminEmail = ((tenant as any).email || '').trim().toLowerCase()

  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/planos?upgrade=success`,
    cancel_url: `${origin}/planos`,
    'metadata[admin_email]': adminEmail,
    'metadata[admin_name]': (tenant as any).name || adminEmail,
    'metadata[revenue_tier]': revenueTier,
    'metadata[plan_slug]': newPlanSlug,
    'metadata[tenant_id]': tenantId,
    'metadata[is_upgrade]': 'true',
    'metadata[old_subscription_id]': (tenant as any).stripe_subscription_id || '',
    'subscription_data[metadata][admin_email]': adminEmail,
    'subscription_data[metadata][revenue_tier]': revenueTier,
    'subscription_data[metadata][plan_slug]': newPlanSlug,
    'subscription_data[metadata][tenant_id]': tenantId,
    'subscription_data[metadata][is_upgrade]': 'true',
  })

  if (adminEmail) {
    params.set('customer_email', adminEmail)
  }

  const stripeCustomerId = (tenant as any).stripe_customer_id
  if (stripeCustomerId) {
    params.delete('customer_email')
    params.set('customer', stripeCustomerId)
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await response.json()

    if (data.error) {
      console.error('Stripe upgrade error:', data.error?.type || 'Unknown')
      return res.status(500).json({ error: data.error.message || 'Erro ao criar sessão de upgrade.' })
    }

    if (!data.url) {
      return res.status(500).json({ error: 'Stripe não retornou URL de checkout.' })
    }

    return res.status(200).json({ url: data.url })
  } catch (err: unknown) {
    console.error('Stripe create-upgrade-session:', err instanceof Error ? err.message : 'Unknown')
    const message = err instanceof Error ? err.message : 'Erro ao criar sessão de upgrade.'
    return res.status(500).json({ error: message })
  }
}
