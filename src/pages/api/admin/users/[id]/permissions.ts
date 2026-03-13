import type { NextApiRequest, NextApiResponse } from 'next'
import { requireTenantAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'
import { MODULES } from '@/hooks/use-permissions.hook'

const GRANTABLE_MODULES = (Object.values(MODULES) as string[]).filter(m => m !== MODULES.USERS_MANAGEMENT)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const caller = await requireTenantAdmin(req, res)
  if (!caller) return

  const { id: userId } = req.query as { id: string }
  if (!userId) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório' })
  }

  const { data: target } = await supabaseAdmin
    .from('users')
    .select('tenant_id, is_super_admin')
    .eq('id', userId)
    .single()

  if (!target || target.tenant_id !== caller.tenant_id || target.is_super_admin) {
    return res.status(403).json({ error: 'Usuário não encontrado ou não pertence ao seu tenant' })
  }

  if (req.method !== 'PUT' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (req.method === 'GET') {
    const { data } = await supabaseAdmin
      .from('user_module_permissions')
      .select('module, can_view, can_edit')
      .eq('user_id', userId)
      .eq('tenant_id', caller.tenant_id)
    const perms = (data || []).filter(p => GRANTABLE_MODULES.includes(p.module))
    return res.status(200).json(perms)
  }

  const body = req.body as { permissions?: Array<{ module: string; can_view: boolean; can_edit: boolean }> }
  const permissions = body?.permissions
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions (array) é obrigatório' })
  }

  const valid = permissions.filter(
    p => typeof p.module === 'string' && GRANTABLE_MODULES.includes(p.module) && typeof p.can_view === 'boolean' && typeof p.can_edit === 'boolean'
  )

  try {
    await supabaseAdmin.from('user_module_permissions').delete().eq('user_id', userId).eq('tenant_id', caller.tenant_id)
    if (valid.length > 0) {
      const rows = valid.map(p => ({
        tenant_id: caller.tenant_id,
        user_id: userId,
        module: p.module,
        can_view: p.can_view,
        can_edit: p.can_edit,
        granted_by: caller.user_id,
      }))
      const { error } = await supabaseAdmin.from('user_module_permissions').insert(rows)
      if (error) throw error
    }
    return res.status(200).json({ success: true })
  } catch (err: unknown) {
    console.error('admin user permissions:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao salvar permissões',
    })
  }
}
