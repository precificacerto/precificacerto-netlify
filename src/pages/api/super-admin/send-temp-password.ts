import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { userId } = req.body as { userId?: string }
  if (!userId) {
    return res.status(400).json({ error: 'userId obrigatório' })
  }

  try {
    const tempPassword = crypto.randomBytes(8).toString('hex')

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    )
    if (updateError) throw updateError

    // TODO: enviar email com tempPassword (Supabase generateLink recovery ou Resend/SendGrid)
    // Por ora retornamos a senha para o super_admin exibir uma vez (não persistir em log)
    return res.status(200).json({
      success: true,
      message: 'Senha temporária definida. Envie ao usuário por canal seguro.',
      tempPassword,
    })
  } catch (err: unknown) {
    console.error('super-admin send-temp-password:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao definir senha temporária',
    })
  }
}
