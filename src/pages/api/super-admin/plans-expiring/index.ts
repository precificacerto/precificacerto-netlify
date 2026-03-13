import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { days = '30' } = req.query as { days?: string }
  const daysNum = Math.min(90, Math.max(1, parseInt(days, 10) || 30))

  try {
    const now = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + daysNum)
    const nowISO = now.toISOString()
    const endISO = endDate.toISOString()

    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('id, name, email, plan_status, trial_ends_at, plan_ends_at')
      .or('trial_ends_at.not.is.null,plan_ends_at.not.is.null')
      .in('plan_status', ['TRIAL', 'ACTIVE'])
      .order('created_at', { ascending: false })

    if (error) throw error

    type TenantRow = { trial_ends_at?: string | null; plan_ends_at?: string | null }
    const filtered = (tenants ?? []).filter((t: TenantRow) => {
      const trialExpiring = t.trial_ends_at && t.trial_ends_at >= nowISO && t.trial_ends_at <= endISO
      const planExpiring = t.plan_ends_at && t.plan_ends_at >= nowISO && t.plan_ends_at <= endISO
      return trialExpiring || planExpiring
    })

    return res.status(200).json(filtered)
  } catch (err: unknown) {
    console.error('super-admin plans-expiring:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao listar planos expirando',
    })
  }
}
