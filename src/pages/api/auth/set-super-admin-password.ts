import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'

/**
 * Define a senha de um usuário (uso: super_admin) via Auth Admin.
 * Protegido por PROMOTE_SUPER_ADMIN_SECRET. Chamar uma vez para configurar a senha.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.PROMOTE_SUPER_ADMIN_SECRET
  if (!secret || secret.length < 8) {
    return res.status(503).json({
      error: 'Defina PROMOTE_SUPER_ADMIN_SECRET no servidor.',
    })
  }

  const { email, secret: bodySecret, password } = req.body as {
    email?: string
    secret?: string
    password?: string
  }

  if (bodySecret !== secret) {
    return res.status(403).json({ error: 'Secret inválido' })
  }

  const normalizedEmail = (email ?? '').trim().toLowerCase()
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'email é obrigatório' })
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password é obrigatório e deve ter no mínimo 8 caracteres' })
  }

  try {
    const { data: user, error: fetchError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const authUser = user?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail)
    if (!authUser?.id) {
      return res.status(404).json({ error: 'Usuário não encontrado no Auth com este email' })
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password,
    })

    if (updateError) {
      console.error('set-super-admin-password:', updateError.message)
      return res.status(400).json({
        error: 'Falha ao atualizar senha. Verifique se a senha atende aos requisitos (ex.: mínimo 8 caracteres).',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Senha atualizada. Faça login com o novo password.',
    })
  } catch (err: unknown) {
    console.error('set-super-admin-password:', err instanceof Error ? err.message : 'Unknown')
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao atualizar senha',
    })
  }
}
