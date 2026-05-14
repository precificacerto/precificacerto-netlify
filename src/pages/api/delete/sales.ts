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
        return res.status(403).json({ error: 'Sem permissão para cancelar vendas' })
      }
    }

    const { data, error } = await supabaseAdmin.rpc('cancel_sale_cascade', {
      p_sale_id: id,
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
    console.error('Cancel sale cascade error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao cancelar venda' })
  }
}
