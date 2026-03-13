import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  try {
    const { whatsapp_instance_mode } = req.body || {}
    if (!whatsapp_instance_mode || !['OWN', 'SHARED'].includes(whatsapp_instance_mode)) {
      return res.status(400).json({ error: 'whatsapp_instance_mode deve ser OWN ou SHARED.' })
    }

    const payload: { whatsapp_instance_mode: string; whatsapp_shared_instance_user_id: string | null } = {
      whatsapp_instance_mode,
      whatsapp_shared_instance_user_id: whatsapp_instance_mode === 'SHARED' ? caller.user_id : null,
    }

    const { error } = await supabaseAdmin
      .from('tenant_settings')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', caller.tenant_id)

    if (error) {
      console.error('Update tenant_settings instance mode:', error?.message || 'Unknown error')
      return res.status(500).json({ error: error.message || 'Erro ao salvar.' })
    }

    return res.status(200).json({ ok: true, whatsapp_instance_mode: payload.whatsapp_instance_mode })
  } catch (error: any) {
    console.error('Instance mode error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro inesperado.' })
  }
}
