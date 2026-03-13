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
    const { data: item } = await supabaseAdmin
      .from('items')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    if (!item) return res.status(404).json({ error: 'Item não encontrado' })

    const isAdmin = caller.is_super_admin || caller.role === 'admin'
    if (!isAdmin) {
      const { data: perms } = await supabaseAdmin
        .from('user_module_permissions')
        .select('can_edit')
        .eq('user_id', caller.user_id)
        .eq('tenant_id', caller.tenant_id)
        .eq('module', 'items')
        .single()
      if (!perms?.can_edit) {
        return res.status(403).json({ error: 'Sem permissão para excluir itens' })
      }
    }

    // product_items.item_id has RESTRICT — delete first
    await supabaseAdmin.from('product_items').delete().eq('item_id', id)
    // service_items.item_id has NO ACTION — delete first
    await supabaseAdmin.from('service_items').delete().eq('item_id', id)
    // user_item_access.item_id has NO ACTION — delete first
    await supabaseAdmin.from('user_item_access').delete().eq('item_id', id)
    // stock, item_tax_credits, item_tax_details, production_items cascade
    // products.base_item_id SET NULL

    const { error } = await supabaseAdmin.from('items').delete().eq('id', id).eq('tenant_id', caller.tenant_id)
    if (error) throw error

    return res.status(200).json({ success: true })
  } catch (error: any) {
    console.error('Delete item error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao excluir item' })
  }
}
