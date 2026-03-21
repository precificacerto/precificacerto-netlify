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
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    if (!product) return res.status(404).json({ error: 'Produto não encontrado' })

    const isAdmin = caller.is_super_admin || caller.role === 'admin'
    const hasEditPerm = isAdmin // users need admin role to delete products
    if (!hasEditPerm) {
      const { data: perms } = await supabaseAdmin
        .from('user_module_permissions')
        .select('can_edit')
        .eq('user_id', caller.user_id)
        .eq('tenant_id', caller.tenant_id)
        .eq('module', 'products')
        .single()
      if (!perms?.can_edit) {
        return res.status(403).json({ error: 'Sem permissão para excluir produtos' })
      }
    }

    // Clean up references before deleting
    await supabaseAdmin.from('budget_items').update({ product_id: null }).eq('product_id', id)
    await supabaseAdmin.from('product_items').delete().eq('product_id', id)
    await supabaseAdmin.from('pricing_calculations').delete().eq('product_id', id)
    await supabaseAdmin.from('stock_movements').delete().in('stock_id',
      (await supabaseAdmin.from('stock').select('id').eq('product_id', id)).data?.map((s: any) => s.id) || []
    )
    await supabaseAdmin.from('stock').delete().eq('product_id', id)
    await supabaseAdmin.from('labor_costs').delete().eq('product_id', id)
    await supabaseAdmin.from('production_items').delete().in('production_id',
      (await supabaseAdmin.from('productions').select('id').eq('product_id', id)).data?.map((p: any) => p.id) || []
    )
    await supabaseAdmin.from('productions').delete().eq('product_id', id)

    const { error } = await supabaseAdmin.from('products').delete().eq('id', id).eq('tenant_id', caller.tenant_id)
    if (error) throw error

    return res.status(200).json({ success: true })
  } catch (error: any) {
    console.error('Delete product error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao excluir produto' })
  }
}
