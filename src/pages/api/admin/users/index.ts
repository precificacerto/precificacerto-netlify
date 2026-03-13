import type { NextApiRequest, NextApiResponse } from 'next'
import { requireTenantAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const caller = await requireTenantAdmin(req, res)
  if (!caller) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, email, role, is_active, is_super_admin, name')
    .eq('tenant_id', caller.tenant_id)
    .order('email')

  if (error) {
    console.error('admin users list:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message })
  }

  const { data: owners } = await supabaseAdmin
    .from('tenant_owners')
    .select('user_id')
    .eq('tenant_id', caller.tenant_id)
  const ownerIds = new Set((owners || []).map((o: any) => o.user_id))

  const list = (users || []).map((u: any) => ({
    ...u,
    is_tenant_owner: ownerIds.has(u.id),
  }))

  return res.status(200).json(list)
}
