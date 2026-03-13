import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id: tenantId } = req.query as { id: string }
  if (!tenantId) {
    return res.status(400).json({ error: 'id da tenant obrigatório' })
  }

  try {
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ approved_by_super_admin: true, updated_at: new Date().toISOString() })
      .eq('id', tenantId)

    if (error) throw error
    return res.status(200).json({ success: true, message: 'Cadastro aprovado' })
  } catch (err: unknown) {
    console.error('super-admin approve:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao aprovar cadastro',
    })
  }
}
