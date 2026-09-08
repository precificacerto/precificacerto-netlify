/**
 * /api/delete/sales-permanent — EXCLUIR venda (última instância).
 *
 * Rota SEPARADA de `/api/delete/sales`, que é o CANCELAR e continua existindo intacta. São
 * duas ações com semânticas opostas — cancelar permite retomar, excluir não — e um parâmetro
 * booleano numa rota só faria a diferença depender de quem chama.
 */
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

    const { data, error } = await supabaseAdmin.rpc('delete_sale_cascade', {
      p_sale_id: id,
      p_tenant_id: caller.tenant_id,
    })

    if (error) throw error

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = data as any
    if (result?.blocked) {
      // A tela já desabilita o botão nesse caso; chegar aqui significa que a UI foi contornada
      // ou que a parcela foi paga entre o render e o clique.
      return res.status(409).json({
        error: result.message || 'Operação bloqueada',
        blocked_reason: result.blocked_reason,
        details: result,
      })
    }

    return res.status(200).json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir venda'
    console.error('Delete sale cascade error:', message)
    return res.status(500).json({ error: message })
  }
}
