import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id: userId } = req.query as { id: string }
  if (!userId) {
    return res.status(400).json({ error: 'user id obrigatório' })
  }

  if (req.method === 'PATCH') {
    const { is_active, is_free } = req.body as { is_active?: boolean; is_free?: boolean }
    if (typeof is_active !== 'boolean' && typeof is_free !== 'boolean') {
      return res.status(400).json({ error: 'is_active ou is_free (boolean) obrigatório' })
    }
    try {
      const { data: target } = await supabaseAdmin.from('users').select('is_super_admin, tenant_id').eq('id', userId).single()
      if (target?.is_super_admin) {
        return res.status(403).json({ error: 'Não é permitido alterar super admin' })
      }

      if (typeof is_active === 'boolean') {
        const { error } = await supabaseAdmin
          .from('users')
          .update({ is_active, updated_at: new Date().toISOString() })
          .eq('id', userId)
        if (error) throw error
      }

      if (typeof is_free === 'boolean') {
        const { error: userFreeErr } = await supabaseAdmin
          .from('users')
          .update({ is_free, updated_at: new Date().toISOString() })
          .eq('id', userId)
        if (userFreeErr) throw userFreeErr

        if (target?.tenant_id) {
          const tenantUpdate: Record<string, unknown> = {
            is_free,
            updated_at: new Date().toISOString(),
          }
          if (is_free) {
            tenantUpdate.plan_status = 'ACTIVE'
          } else {
            tenantUpdate.plan_status = 'TRIAL'
          }
          const { error } = await supabaseAdmin
            .from('tenants')
            .update(tenantUpdate)
            .eq('id', target.tenant_id)
          if (error) throw error
        }
      }

      return res.status(200).json({ success: true })
    } catch (err: unknown) {
      console.error('super-admin user update:', err)
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar usuário',
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
