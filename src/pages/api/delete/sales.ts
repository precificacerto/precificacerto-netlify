import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await getCallerContext(req, res)
  if (!caller) return

  const { id } = req.body
  if (!id) return res.status(400).json({ error: 'id é obrigatório' })

  try {
    const { data: sale } = await supabaseAdmin
      .from('sales')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    if (!sale) return res.status(404).json({ error: 'Venda não encontrada' })

    const isAdmin = caller.is_super_admin || caller.role === 'admin'
    if (!isAdmin) {
      const { data: perms } = await supabaseAdmin
        .from('user_module_permissions')
        .select('can_edit')
        .eq('user_id', caller.user_id)
        .eq('tenant_id', caller.tenant_id)
        .eq('module', 'sales')
        .single()
      if (!perms?.can_edit) {
        return res.status(403).json({ error: 'Sem permissão para excluir vendas' })
      }
    }

    const { error } = await supabaseAdmin
      .from('sales')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
    if (error) throw error

    // Remove os lançamentos de caixa vinculados a esta venda
    await supabaseAdmin
      .from('cash_entries')
      .update({ is_active: false })
      .eq('origin_type', 'SALE')
      .eq('origin_id', id)
      .eq('tenant_id', caller.tenant_id)

    return res.status(200).json({ success: true })
  } catch (error: any) {
    console.error('Deactivate sale error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao desativar venda' })
  }
}
