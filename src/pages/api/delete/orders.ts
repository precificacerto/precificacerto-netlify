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
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, tenant_id, sale_id')
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' })

    const isAdmin = caller.is_super_admin || caller.role === 'admin'
    if (!isAdmin) {
      const requiredModules = order.sale_id ? ['orders', 'sales'] : ['orders']
      const { data: perms } = await supabaseAdmin
        .from('user_module_permissions')
        .select('module, can_edit')
        .eq('user_id', caller.user_id)
        .eq('tenant_id', caller.tenant_id)
        .in('module', requiredModules)

      const missing = requiredModules.filter(
        (m) => !perms?.find((p: any) => p.module === m)?.can_edit,
      )
      if (missing.length > 0) {
        return res.status(403).json({
          error: `Sem permissão para excluir pedidos (módulos requeridos: ${missing.join(', ')})`,
        })
      }
    }

    const { data, error } = await supabaseAdmin.rpc('delete_order_cascade', {
      p_order_id: id,
      p_tenant_id: caller.tenant_id,
    })

    if (error) throw error

    const result = data as any
    if (result?.blocked) {
      return res.status(409).json({
        error: result.message || 'Operação bloqueada',
        blocked_reason: result.blocked_reason,
        details: result,
      })
    }

    return res.status(200).json({ success: true, ...result })
  } catch (error: any) {
    console.error('Delete order cascade error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao excluir pedido' })
  }
}
