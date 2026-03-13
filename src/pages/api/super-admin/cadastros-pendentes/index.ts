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
    const { data: tenants, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('approved_by_super_admin', false)
      .order('created_at', { ascending: false })

    if (error) throw error
    return res.status(200).json(tenants ?? [])
  } catch (err: unknown) {
    console.error('super-admin cadastros-pendentes:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao listar cadastros pendentes',
    })
  }
}
