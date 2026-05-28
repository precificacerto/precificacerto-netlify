import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'

/**
 * Cria sessão do Stripe Checkout via API REST (sem pacote 'stripe').
 * Price IDs lidos em tempo de requisição (env) com fallback dos IDs criados no Stripe.
 *
 * Bifurcação de fluxo (CRÍT-5, Founder 2026-05-27):
 *   - Cadastro novo (sem tenantId no body): público, webhook cria tenant após pagamento.
 *   - Upgrade tenant existente (com tenantId): exige sessão autenticada, tenantId
 *     deve corresponder ao caller.tenant_id (derivado do JWT). Caso contrário 401/403.
 */
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
    individual: 'price_1TYZYdC91Syy1O80KC8tv9ZJ',    // R$ 299,90
    intermediario: 'price_1TYZYeC91Syy1O80kVRDudtx', // R$ 399,90
    pro: 'price_1TYZYeC91Syy1O80I6pMn3rj',           // R$ 499,90
    advanced: 'price_1TYZYeC91Syy1O807wLJnMOp',      // R$ 549,90
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, revenueTier, planSlug, tenantId } = req.body as {
    name?: string
    email?: string
    revenueTier?: RevenueTier
    planSlug?: PlanSlug
    tenantId?: string
  }

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios.' })
  }
  if (!revenueTier || !planSlug) {
    return res.status(400).json({ error: 'Faixa de faturamento e plano são obrigatórios.' })
  }
  if (revenueTier !== 'ate_200k' && revenueTier !== 'acima_200k') {
    return res.status(400).json({ error: 'Faixa de faturamento inválida.' })
  }

  // CRÍT-5 (Founder 2026-05-27): bifurcação inteligente.
  //   A) Cadastro novo (sem tenantId) — público; webhook cria tenant após pagamento.
  //   B) Upgrade tenant existente (com tenantId) — autenticado; tenantId deve bater
  //      com o caller.tenant_id derivado da sessão JWT.
  // Sem essa validação, atacante poderia passar tenantId alheio e via webhook
  // substituir stripe_customer_id/stripe_subscription_id da vítima.
  let effectiveTenantId: string | undefined
  const hasTenantId = typeof tenantId === 'string' && tenantId.length > 0
  if (hasTenantId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(tenantId!)) {
      return res.status(400).json({ error: 'tenantId inválido' })
    }
    const caller = await getCallerContext(req, res)
    if (!caller) return // getCallerContext já enviou 401/403
    if (caller.tenant_id !== tenantId) {
      // eslint-disable-next-line no-console
      console.warn('[CRÍT-5] Tentativa de cross-tenant checkout', {
        caller_tenant: caller.tenant_id,
        body_tenant: tenantId,
        caller_user: caller.user_id,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      })
      return res.status(403).json({
        error: 'tenant_id no body diverge da sessão autenticada',
      })
    }
    effectiveTenantId = caller.tenant_id
  }

  const priceId = getPriceId(revenueTier, planSlug)
  if (!priceId) {
    return res.status(400).json({ error: 'Plano não encontrado. Tente novamente.' })
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return res.status(500).json({ error: 'Stripe não configurado (STRIPE_SECRET_KEY).' })
  }

  const rawOrigin = process.env.NEXT_PUBLIC_APP_URL
  const origin =
    rawOrigin && !rawOrigin.includes('localhost')
      ? rawOrigin
      : 'https://app.precificacerto.com'
  const adminEmail = email.trim().toLowerCase()
  const adminName = name.trim()

  const cancelUrl = effectiveTenantId ? `${origin}/assinar` : `${origin}/cadastro`

  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    customer_email: adminEmail,
    success_url: `${origin}/cadastro/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    'metadata[admin_name]': adminName,
    'metadata[admin_email]': adminEmail,
    'metadata[revenue_tier]': revenueTier,
    'metadata[plan_slug]': planSlug,
    'subscription_data[metadata][admin_name]': adminName,
    'subscription_data[metadata][admin_email]': adminEmail,
    'subscription_data[metadata][revenue_tier]': revenueTier,
    'subscription_data[metadata][plan_slug]': planSlug,
    'subscription_data[trial_period_days]': String(
      Number(process.env.STRIPE_TRIAL_DAYS) || 7
    ),
  })

  if (effectiveTenantId) {
    params.set('metadata[tenant_id]', effectiveTenantId)
    params.set('subscription_data[metadata][tenant_id]', effectiveTenantId)
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
      console.error('Stripe API error:', data.error?.type || 'Unknown')
      return res.status(500).json({
        error: data.error.message || 'Erro ao criar sessão de pagamento.',
      })
    }

    if (!data.url) {
      return res.status(500).json({ error: 'Stripe não retornou URL de checkout.' })
    }

    return res.status(200).json({ url: data.url })
  } catch (err: unknown) {
    console.error('Stripe create-checkout-session:', err instanceof Error ? err.message : 'Unknown')
    const message = err instanceof Error ? err.message : 'Erro ao criar sessão de pagamento.'
    return res.status(500).json({ error: message })
  }
}
