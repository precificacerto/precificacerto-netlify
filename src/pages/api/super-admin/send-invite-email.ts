import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

const getAppOrigin = () =>
  process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://precificav2.netlify.app'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { email } = req.body as { userId?: string; email?: string; name?: string; tenantName?: string }
  if (!email?.trim()) {
    return res.status(400).json({ error: 'email é obrigatório' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const redirectTo = `${getAppOrigin()}/criar-senha`

  try {
    // 1) Try sending recovery email via Supabase (sends actual email)
    const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
      normalizedEmail,
      { redirectTo }
    )

    if (!resetError) {
      return res.status(200).json({
        success: true,
        message: `Link de redefinição de senha enviado para ${normalizedEmail}.`,
      })
    }

    // 2) If email sending failed (rate limit, SMTP not configured, etc.),
    //    generate the link via Admin API and return it for manual sharing
    console.warn('resetPasswordForEmail failed, falling back to generateLink:', resetError.message)

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: { redirectTo },
    })

    if (linkError) {
      console.error('generateLink also failed:', linkError.message)
      return res.status(400).json({
        error: `Não foi possível enviar o email (${resetError.message}). Tente novamente em 60 segundos.`,
      })
    }

    const actionLink = linkData?.properties?.action_link
    return res.status(200).json({
      success: true,
      action_link: actionLink,
      message: `O email não pôde ser enviado automaticamente (limite de envio). Copie o link abaixo e envie manualmente ao usuário.`,
    })
  } catch (err: unknown) {
    console.error('super-admin send-invite-email:', err)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao enviar convite',
    })
  }
}
