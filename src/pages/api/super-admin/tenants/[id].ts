import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

type PlanStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id: tenantId } = req.query as { id: string }
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant id obrigatório' })
  }

  if (req.method === 'PATCH') {
    const { plan_status, is_free } = req.body as { plan_status?: PlanStatus; is_free?: boolean }

    if (typeof plan_status !== 'string' && typeof is_free !== 'boolean') {
      return res.status(400).json({ error: 'plan_status ou is_free obrigatório' })
    }

    if (typeof plan_status === 'string' && !['ACTIVE', 'SUSPENDED', 'CANCELLED', 'TRIAL'].includes(plan_status)) {
      return res.status(400).json({ error: 'plan_status inválido (ACTIVE, SUSPENDED, CANCELLED, TRIAL)' })
    }

    try {
      if (typeof plan_status === 'string') {
        const now = new Date().toISOString()
        const { error } = await supabaseAdmin
          .from('tenants')
          .update({ plan_status, updated_at: now })
          .eq('id', tenantId)
        if (error) throw error

        // Ao suspender/cancelar um tenant, desativa todos os usuários.
        // Ao ativar, reativa todos os usuários.
        if (plan_status === 'ACTIVE' || plan_status === 'TRIAL') {
          const { error: usersErr } = await supabaseAdmin
            .from('users')
            .update({ is_active: true, updated_at: now })
            .eq('tenant_id', tenantId)
          if (usersErr) throw usersErr
        } else if (plan_status === 'SUSPENDED' || plan_status === 'CANCELLED') {
          const { error: usersErr } = await supabaseAdmin
            .from('users')
            .update({ is_active: false, updated_at: now })
            .eq('tenant_id', tenantId)
          if (usersErr) throw usersErr
        }
      }

      if (typeof is_free === 'boolean') {
        const tenantUpdate: Record<string, unknown> = {
          is_free,
          updated_at: new Date().toISOString(),
        }
        if (is_free) {
          tenantUpdate.plan_status = 'ACTIVE'
        }
        const { error: tenantErr } = await supabaseAdmin
          .from('tenants')
          .update(tenantUpdate)
          .eq('id', tenantId)
        if (tenantErr) throw tenantErr

        const { error: usersErr } = await supabaseAdmin
          .from('users')
          .update({ is_free, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
        if (usersErr) throw usersErr
      }

      return res.status(200).json({ success: true })
    } catch (err: unknown) {
      console.error('super-admin tenant update:', err)
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar tenant',
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
