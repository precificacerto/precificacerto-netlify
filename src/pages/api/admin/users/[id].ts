import type { NextApiRequest, NextApiResponse } from 'next'
import { requireTenantAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

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

  if (!target) {
    return res.status(404).json({ error: 'Usuário não encontrado' })
  }
  if (target.is_super_admin) {
    return res.status(403).json({ error: 'Não é permitido alterar ou excluir super admin' })
  }
  if (target.tenant_id !== caller.tenant_id) {
    return res.status(403).json({ error: 'Só é possível gerenciar usuários do seu tenant' })
  }

  const { data: owner } = await supabaseAdmin
    .from('tenant_owners')
    .select('user_id')
    .eq('tenant_id', caller.tenant_id)
    .eq('user_id', userId)
    .maybeSingle()
  const isTenantOwner = !!owner

  if (req.method === 'PATCH') {
    if (isTenantOwner) {
      return res.status(403).json({ error: 'Não é permitido desativar o dono do tenant' })
    }
    const { is_active } = req.body as { is_active?: boolean }
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active (boolean) é obrigatório' })
    }
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (error) throw error
      return res.status(200).json({ success: true })
    } catch (err: unknown) {
      console.error('admin user update:', err)
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao atualizar usuário',
      })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
