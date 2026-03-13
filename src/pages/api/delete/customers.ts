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
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, tenant_id, owner_id')
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' })

    const roleLower = (caller.role || '').toLowerCase()
    const isAdmin = caller.is_super_admin || roleLower === 'admin'
    if (!isAdmin && customer.owner_id && customer.owner_id !== caller.user_id) {
      return res.status(403).json({ error: 'Sem permissão para excluir este cliente' })
    }

    const { error } = await supabaseAdmin
      .from('customers')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
    if (error) throw error

    return res.status(200).json({ success: true })
  } catch (error: any) {
    console.error('Deactivate customer error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao desativar cliente' })
  }
}
