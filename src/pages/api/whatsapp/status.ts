import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  try {
    const { tenant_id, user_id } = caller
    const { data: settings } = await supabaseAdmin
      .from('tenant_settings')
      .select('whatsapp_instance_mode, whatsapp_shared_instance_user_id')
      .eq('tenant_id', tenant_id)
      .single()

    const mode = settings?.whatsapp_instance_mode || 'OWN'
    const sharedOwnerId = settings?.whatsapp_shared_instance_user_id ?? null
    const effectiveUserId = mode === 'SHARED' && sharedOwnerId ? sharedOwnerId : user_id

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('wuzapi_token')
      .eq('id', effectiveUserId)
      .single()

    const canSend = !!userRow?.wuzapi_token
    return res.status(200).json({ canSend })
  } catch (error: any) {
    console.error('WhatsApp status error:', error?.message || 'Unknown error')
    return res.status(500).json({ canSend: false })
  }
}
