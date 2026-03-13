import type { NextApiRequest, NextApiResponse } from 'next'

const TOKEN_NAME = 'token'
const IS_PROD = process.env.NODE_ENV === 'production'
const MAX_AGE = 30 * 24 * 60 * 60 // 30 days

function serializeCookie(name: string, value: string, maxAge: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${maxAge}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ]
  if (IS_PROD) parts.push('Secure')
  return parts.join('; ')
}

/**
 * POST /api/auth/session — sets httpOnly cookie with access token
 * DELETE /api/auth/session — clears the cookie (logout)
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { access_token } = req.body || {}
    if (!access_token || typeof access_token !== 'string') {
      return res.status(400).json({ error: 'access_token is required' })
    }

    res.setHeader('Set-Cookie', serializeCookie(TOKEN_NAME, access_token, MAX_AGE))
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', serializeCookie(TOKEN_NAME, '', 0))
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
