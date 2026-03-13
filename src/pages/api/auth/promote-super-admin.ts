import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'

/**
 * Promove um usuário a super_admin pelo email.
 * Só funciona se a variável PROMOTE_SUPER_ADMIN_SECRET estiver definida e o body enviar o mesmo secret.
 * Uso único: após promover, defina is_super_admin no banco para outros usuários se necessário.
 */

// Rate limiting: max 5 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    // Cleanup expired entries to prevent memory leak
    for (const [key, val] of attempts.entries()) {
      if (now > val.resetAt) attempts.delete(key)
    }
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > MAX_ATTEMPTS
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em 15 minutos.' })
  }

  const secret = process.env.PROMOTE_SUPER_ADMIN_SECRET
  if (!secret || secret.length < 8) {
    return res.status(503).json({
      error: 'Promoção de super admin não está configurada. Defina PROMOTE_SUPER_ADMIN_SECRET no servidor.',
    })
  }

  const { email, secret: bodySecret } = req.body as { email?: string; secret?: string }
  if (bodySecret !== secret) {
    return res.status(403).json({ error: 'Secret inválido' })
  }

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email é obrigatório' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    return res.status(400).json({ error: 'email inválido' })
  }

  try {
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, is_super_admin')
      .eq('email', normalizedEmail)
      .single()

    if (fetchError || !user) {
      return res.status(404).json({ error: 'Usuário não encontrado com este email' })
    }

    await supabaseAdmin.from('tenant_owners').delete().eq('user_id', user.id)

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        is_super_admin: true,
        role: 'super_admin',
        tenant_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) throw updateError

    return res.status(200).json({
      success: true,
      message: `Usuário promovido a super_admin. Faça logout e login novamente para ver o painel.`,
    })
  } catch (err: unknown) {
    console.error('promote-super-admin:', err instanceof Error ? err.message : 'Unknown')
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao promover usuário',
    })
  }
}
