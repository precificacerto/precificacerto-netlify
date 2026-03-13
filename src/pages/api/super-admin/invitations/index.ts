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
    const { data: invitations, error } = await supabaseAdmin
      .from('tenant_invitations')
      .select(`
        id,
        tenant_id,
        email,
        role,
        invited_by,
        accepted_at,
        expires_at,
        created_at,
        tenants ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    return res.status(200).json(invitations ?? [])
  } catch (err: unknown) {
    console.error('super-admin invitations:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao listar convites',
    })
  }
}
