import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { data: tenants } = await supabaseAdmin.from('tenants').select('*').eq('id', caller.tenant_id)
  const { data: users } = await supabaseAdmin.from('users').select('*').eq('tenant_id', caller.tenant_id)
  const { data: settings } = await supabaseAdmin.from('tenant_settings').select('*').eq('tenant_id', caller.tenant_id)
  const { data: expense } = await supabaseAdmin.from('tenant_expense_config').select('*').eq('tenant_id', caller.tenant_id)

  return res.json({ tenants, users, settings, expense })
}
