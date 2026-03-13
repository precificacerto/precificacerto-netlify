import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  try {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        name,
        phone,
        role,
        is_active,
        is_super_admin,
        is_free,
        tenant_id,
        created_at,
        tenants ( id, name, phone, is_free )
      `)
      .order('email')

    if (error) throw error
    return res.status(200).json(users ?? [])
  } catch (err: unknown) {
    console.error('super-admin users:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao listar usuários',
    })
  }
}
