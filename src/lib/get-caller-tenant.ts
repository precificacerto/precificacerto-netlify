import { supabaseAdmin } from '@/supabase/admin'
import type { NextApiRequest, NextApiResponse } from 'next'

export type CallerContext = {
  user_id: string
  tenant_id: string
  role: string
  is_super_admin: boolean
}

/**
 * O NÚCLEO de `getCallerContext`, sem escrever resposta: quem chama decide o que responder.
 * Extraído para as rotas da base de conhecimento, que respondem 404 a quem não é super admin. As
 * rotas antigas seguem por `getCallerContext`, com as mesmas respostas de sempre — o portão
 * `get-caller-tenant-portao-404.test.ts` prova o contraste.
 */
export type LeituraDoChamador = { contexto: CallerContext | null; status: 401 | 403 | null; erro: string | null }

export async function lerCallerContext(req: NextApiRequest): Promise<LeituraDoChamador> {
  const token = req.cookies.token
  if (!token) return { contexto: null, status: 401, erro: 'Unauthorized' }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { contexto: null, status: 401, erro: 'Unauthorized' }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('tenant_id, role, is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile) return { contexto: null, status: 403, erro: 'Forbidden' }

  return {
    contexto: {
      user_id: user.id,
      tenant_id: profile.tenant_id,
      role: profile.role,
      is_super_admin: profile.is_super_admin ?? false,
    },
    status: null,
    erro: null,
  }
}

export async function getCallerContext(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<CallerContext | null> {
  const leitura = await lerCallerContext(req)
  if (!leitura.contexto) {
    res.status(leitura.status ?? 403).json({ error: leitura.erro ?? 'Forbidden' })
    return null
  }
  return leitura.contexto
}

/**
 * O corpo do 404 de quem não passa: genérico, sem dizer o que a rota é nem por que recusou. NÃO é
 * byte a byte o 404 do Next para rota inexistente (aquele é a página HTML de 404).
 */
export const RESPOSTA_NAO_ENCONTRADA = { error: 'Not found' }

/**
 * Super admin, ou 404 — sem sessão, sem perfil, admin de tenant ou usuário comum, todos recebem o
 * MESMO 404, entre si: a rota não diz quem é recusado nem por quê, e não responde 401/403, que
 * confirmariam que ela existe. O super admin vem do PERFIL gravado
 * (`users.is_super_admin`), nunca do corpo, de e-mail ou de lista.
 */
export async function superAdminOu404(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<CallerContext | null> {
  const { contexto } = await lerCallerContext(req)
  if (!contexto || contexto.is_super_admin !== true) {
    res.status(404).json(RESPOSTA_NAO_ENCONTRADA)
    return null
  }
  return contexto
}

export async function requireSuperAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<CallerContext | null> {
  const caller = await getCallerContext(req, res)
  if (!caller) return null
  if (!caller.is_super_admin) {
    res.status(403).json({ error: 'Forbidden: Super Admin only' })
    return null
  }
  return caller
}

/** Tenant admin only (role === 'admin' and not super_admin). For managing users of the same tenant. */
export async function requireTenantAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<CallerContext | null> {
  const caller = await getCallerContext(req, res)
  if (!caller) return null
  if (caller.is_super_admin) {
    res.status(403).json({ error: 'Use Super Admin panel for this action' })
    return null
  }
  const roleLower = (caller.role ?? '').toLowerCase()
  if (roleLower !== 'admin') {
    res.status(403).json({ error: 'Apenas administradores do tenant podem realizar esta ação' })
    return null
  }
  return caller
}
