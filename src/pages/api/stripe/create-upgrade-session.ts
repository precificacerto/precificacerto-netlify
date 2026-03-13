import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'

type RevenueTier = 'ate_200k' | 'acima_200k'
type PlanSlug = 'individual' | 'intermediario' | 'ilimitado' | 'pro' | 'advanced'

/** Fallback: IDs dos preços criados no Stripe. Use env para produção. */
const PRICE_IDS_FALLBACK: Record<RevenueTier, Record<PlanSlug, string>> = {
  ate_200k: {
    individual: 'price_1TADYpC91Syy1O804ICzZ7Sl',    // R$ 69,90
    intermediario: 'price_1TADYpC91Syy1O80fy6vq2KV', // R$ 99,90
    ilimitado: 'price_1TADYpC91Syy1O80ybS5Ga2B',     // R$ 149,90
    pro: '',
    advanced: '',
  },
  acima_200k: {
    individual: '',
    intermediario: '',
    ilimitado: 'price_1TADYqC91Syy1O80019m7TJ0',     // R$ 499,90
    pro: 'price_1TADYpC91Syy1O80SQXIwsHm',           // R$ 299,90
    advanced: 'price_1TADYpC91Syy1O80IqY1oKOK',      // R$ 399,90
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

const PLAN_ORDER: Record<RevenueTier, PlanSlug[]> = {
  ate_200k: ['individual', 'intermediario', 'ilimitado'],
  acima_200k: ['pro', 'advanced', 'ilimitado'],
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tenantId, newPlanSlug } = req.body as {
    tenantId?: string
    newPlanSlug?: PlanSlug
  }

  if (!tenantId || !newPlanSlug) {
    return res.status(400).json({ error: 'tenantId e newPlanSlug são obrigatórios.' })
  }

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

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://precificav2.netlify.app'
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
