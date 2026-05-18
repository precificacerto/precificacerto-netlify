import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/supabase/admin'
import { checkCronAuth, mapStripeStatusToPlanStatus, type PlanStatus } from '@/lib/cron-helpers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

type TenantRow = {
  id: string
  plan_status: PlanStatus
  trial_ends_at: string | null
  stripe_subscription_id: string | null
}

type TenantResult = {
  tenant_id: string
  from: PlanStatus
  to: PlanStatus
  reason: string
}

/**
 * GET/POST /api/cron/expire-trials
 *
 * Schedule sugerido: 0 * * * * (a cada hora).
 * Para cada tenant em TRIAL com trial_ends_at < now:
 *   1. Se possui stripe_subscription_id, consulta status real no Stripe e atualiza.
 *   2. Se não possui (cadastro manual sem checkout), marca como SUSPENDED.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!checkCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' })

  const nowIso = new Date().toISOString()

  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, plan_status, trial_ends_at, stripe_subscription_id')
    .eq('plan_status', 'TRIAL')
    .lt('trial_ends_at', nowIso)
    .limit(200)

  if (error) {
    console.error('[cron/expire-trials] query error:', error.message)
    return res.status(500).json({ error: error.message })
  }

  const rows = (tenants ?? []) as TenantRow[]
  const results: TenantResult[] = []

  for (const t of rows) {
    let nextStatus: PlanStatus = 'SUSPENDED'
    let reason = 'no_subscription'

    if (t.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(t.stripe_subscription_id)
        nextStatus = mapStripeStatusToPlanStatus(sub.status)
        reason = 'stripe_status:' + sub.status
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'unknown'
        console.warn(`[cron/expire-trials] tenant ${t.id} stripe error:`, msg)
        nextStatus = 'SUSPENDED'
        reason = 'stripe_error'
      }
    }

    if (nextStatus === t.plan_status) continue

    const { error: updErr } = await supabaseAdmin
      .from('tenants')
      .update({ plan_status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', t.id)
      .eq('plan_status', 'TRIAL')

    if (updErr) {
      console.error(`[cron/expire-trials] update failed for tenant ${t.id}:`, updErr.message)
      continue
    }

    if (nextStatus === 'SUSPENDED' || nextStatus === 'CANCELLED') {
      await supabaseAdmin
        .from('users')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', t.id)
    }

    results.push({ tenant_id: t.id, from: t.plan_status, to: nextStatus, reason })
  }

  return res.status(200).json({
    scanned: rows.length,
    updated: results.length,
    results,
  })
}
