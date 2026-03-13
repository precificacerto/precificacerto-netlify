import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'
import { sendWuzapiDocument } from '@/lib/wuzapi-send'

const THROTTLE_SECONDS = 60

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  const { tenant_id, user_id } = caller
  const { phone, fileName, documentBase64 } = req.body || {}

  if (!phone || !fileName || typeof documentBase64 !== 'string') {
    return res.status(400).json({
      error: 'Envie phone, fileName e documentBase64 no body (JSON).',
    })
  }

  const { data: settings } = await supabaseAdmin
    .from('tenant_settings')
    .select('whatsapp_instance_mode, whatsapp_shared_instance_user_id, last_whatsapp_send_at')
    .eq('tenant_id', tenant_id)
    .single()

  const lastSend = settings?.last_whatsapp_send_at ? new Date(settings.last_whatsapp_send_at).getTime() : 0
  const now = Date.now()
  if (lastSend && now - lastSend < THROTTLE_SECONDS * 1000) {
    const retryAfter = Math.ceil((THROTTLE_SECONDS * 1000 - (now - lastSend)) / 1000)
    return res.status(429).json({
      error: 'Aguarde 60 segundos entre envios.',
      retry_after_seconds: retryAfter,
    })
  }

  const mode = settings?.whatsapp_instance_mode || 'OWN'
  const sharedOwnerId = settings?.whatsapp_shared_instance_user_id ?? null
  const effectiveUserId = mode === 'SHARED' && sharedOwnerId ? sharedOwnerId : user_id

  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('wuzapi_token')
    .eq('id', effectiveUserId)
    .single()

  const token = userRow?.wuzapi_token
  if (!token) {
    return res.status(409).json({
      error:
        mode === 'SHARED'
          ? 'O administrador ainda não conectou o WhatsApp.'
          : 'Conecte seu WhatsApp via QR Code antes de enviar.',
    })
  }

  const result = await sendWuzapiDocument(token, String(phone), String(fileName), documentBase64)
  if (!result.success) {
    return res.status(502).json({ error: result.error })
  }

  await supabaseAdmin
    .from('tenant_settings')
    .update({ last_whatsapp_send_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('tenant_id', tenant_id)

  return res.status(200).json({ success: true })
}
