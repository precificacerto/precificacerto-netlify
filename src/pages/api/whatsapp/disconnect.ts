import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

const WUZAPI_BASE = process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  try {
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('wuzapi_token')
      .eq('id', caller.user_id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    const token = userRow?.wuzapi_token
    if (token) {
      try {
        await fetch(`${WUZAPI_BASE}/session/logout`, {
          method: 'POST',
          headers: { token },
        })
      } catch {
        // ignore WUZAPI errors on logout
      }
    }

    await supabaseAdmin
      .from('users')
      .update({ wuzapi_token: null })
      .eq('id', caller.user_id)
      .eq('tenant_id', caller.tenant_id)

    return res.status(200).json({ ok: true })
  } catch (error: any) {
    console.error('WhatsApp disconnect error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao desconectar.' })
  }
}
