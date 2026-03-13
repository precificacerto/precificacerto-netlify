import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Cria sessão do Stripe Checkout via API REST (sem pacote 'stripe').
 * Price IDs lidos em tempo de requisição (env) com fallback dos IDs criados no Stripe.
 */
type RevenueTier = 'ate_200k' | 'acima_200k'
type PlanSlug = 'individual' | 'intermediario' | 'ilimitado' | 'pro' | 'advanced'

/** Fallback: IDs dos preços criados no Stripe (modo test). Use env para produção. */
const PRICE_IDS_FALLBACK: Record<RevenueTier, Record<PlanSlug, string>> = {
  ate_200k: {
    individual: 'price_1T6Z67CRrj974uSyqMtm7Bbl',   // R$ 69,90
    intermediario: 'price_1T6Z66CRrj974uSy8y69g4iP', // R$ 99,90
    ilimitado: 'price_1T6Z68CRrj974uSyizldYhiG',    // R$ 149,90
    pro: '',
    advanced: '',
  },
  acima_200k: {
    individual: '',
    intermediario: '',
    ilimitado: 'price_1T6Z6ACRrj974uSyCWz9X4Uj',    // R$ 499,90
    pro: 'price_1T6Z69CRrj974uSyf7QOL0Gc',          // R$ 299,90
    advanced: 'price_1T6Z69CRrj974uSyijqimaE2',     // R$ 399,90
  },
}

function getPriceIds(): Record<RevenueTier, Record<PlanSlug, string>> {
  return {
    ate_200k: {
      individual: process.env.STRIPE_PRICE_ATE_200K_INDIVIDUAL ?? PRICE_IDS_FALLBACK.ate_200k.individual,
      intermediario: process.env.STRIPE_PRICE_ATE_200K_INTERMEDIARIO ?? PRICE_IDS_FALLBACK.ate_200k.intermediario,
      ilimitado: process.env.STRIPE_PRICE_ATE_200K_ILIMITADO ?? PRICE_IDS_FALLBACK.ate_200k.ilimitado,
      pro: '',
      advanced: '',
    },
    acima_200k: {
      individual: '',
      intermediario: '',
      ilimitado: process.env.STRIPE_PRICE_ACIMA_200K_ILIMITADO ?? PRICE_IDS_FALLBACK.acima_200k.ilimitado,
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

  const priceId = getPriceId(revenueTier, planSlug)
  if (!priceId) {
    return res.status(400).json({ error: 'Plano não encontrado. Tente novamente.' })
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return res.status(500).json({ error: 'Stripe não configurado (STRIPE_SECRET_KEY).' })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const adminEmail = email.trim().toLowerCase()
  const adminName = name.trim()

  const cancelUrl = tenantId ? `${origin}/assinar` : `${origin}/cadastro`

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

  if (tenantId) {
    params.set('metadata[tenant_id]', tenantId)
    params.set('subscription_data[metadata][tenant_id]', tenantId)
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
