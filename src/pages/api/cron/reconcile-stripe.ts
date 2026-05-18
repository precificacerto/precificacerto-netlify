import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/supabase/admin'
import { checkCronAuth, mapStripeStatusToPlanStatus, type PlanStatus } from '@/lib/cron-helpers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

type TenantRow = {
  id: string
  plan_status: PlanStatus
  stripe_subscription_id: string
  plan_ends_at: string | null
}

type DivergenceResult = {
  tenant_id: string
  subscription_id: string
  from: PlanStatus
  to: PlanStatus
  stripe_status: string
}

/**
 * GET/POST /api/cron/reconcile-stripe
 *
 * Schedule sugerido: 0 3 * * * (diariamente às 3h UTC).
 * Varre tenants com stripe_subscription_id e compara plan_status com o status
 * real da subscription no Stripe. Atualiza apenas se divergente.
 *
 * Cobre cenários onde o webhook falhou: subscription cancelada manualmente no
 * Stripe Dashboard, falha de rede no webhook, retries esgotados, etc.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!checkCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' })

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, plan_status, stripe_subscription_id, plan_ends_at')
    .not('stripe_subscription_id', 'is', null)
    .neq('plan_status', 'CANCELLED')
    .limit(500)

  if (error) {
    console.error('[cron/reconcile-stripe] query error:', error.message)
    return res.status(500).json({ error: error.message })
  }

  const rows = (tenants ?? []) as TenantRow[]
  const divergences: DivergenceResult[] = []
  const errors: { tenant_id: string; subscription_id: string; error: string }[] = []

  for (const t of rows) {
    try {
      const sub = await stripe.subscriptions.retrieve(t.stripe_subscription_id)
      const nextStatus = mapStripeStatusToPlanStatus(sub.status)

      if (nextStatus === t.plan_status) continue

      const updatePayload: Record<string, unknown> = {
        plan_status: nextStatus,
        updated_at: new Date().toISOString(),
      }

      if (nextStatus === 'ACTIVE' && sub.current_period_end) {
        updatePayload.plan_ends_at = new Date(sub.current_period_end * 1000).toISOString()
      }
      if (nextStatus === 'TRIAL' && sub.trial_end) {
        updatePayload.trial_ends_at = new Date(sub.trial_end * 1000).toISOString()
      }

      const { error: updErr } = await supabaseAdmin
        .from('tenants')
        .update(updatePayload)
        .eq('id', t.id)

      if (updErr) {
        errors.push({ tenant_id: t.id, subscription_id: t.stripe_subscription_id, error: updErr.message })
        continue
      }

      if (nextStatus === 'ACTIVE' || nextStatus === 'TRIAL') {
        await supabaseAdmin
          .from('users')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('tenant_id', t.id)
      } else if (nextStatus === 'SUSPENDED' || nextStatus === 'CANCELLED') {
        await supabaseAdmin
          .from('users')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('tenant_id', t.id)
      }

      divergences.push({
        tenant_id: t.id,
        subscription_id: t.stripe_subscription_id,
        from: t.plan_status,
        to: nextStatus,
        stripe_status: sub.status,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown'
      errors.push({ tenant_id: t.id, subscription_id: t.stripe_subscription_id, error: msg })
    }
  }

  return res.status(200).json({
    scanned: rows.length,
    divergences_fixed: divergences.length,
    errors: errors.length,
    divergences,
    errors_detail: errors,
  })
}
