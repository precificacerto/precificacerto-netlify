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
    const { data: rows, error } = await supabaseAdmin
      .from('tenant_billing')
      .select(`
        id,
        tenant_id,
        status,
        amount,
        due_date,
        paid_at,
        external_id,
        created_at,
        tenants ( id, name, email )
      `)
      .in('status', ['PENDING', 'OVERDUE'])
      .order('due_date', { ascending: true })

    if (error) throw error
    return res.status(200).json(rows ?? [])
  } catch (err: unknown) {
    console.error('super-admin billing:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao listar pagamentos',
    })
  }
}
