import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id: tenantId } = req.query as { id: string }
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant id obrigatório' })
  }

  try {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, is_active, is_super_admin, created_at')
      .eq('tenant_id', tenantId)
      .order('email')

    if (error) throw error
    return res.status(200).json(users ?? [])
  } catch (err: unknown) {
    console.error('super-admin tenants users:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao listar usuários',
    })
  }
}
