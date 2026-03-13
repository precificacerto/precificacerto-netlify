import { supabaseAdmin } from '@/supabase/admin'
import type { NextApiRequest, NextApiResponse } from 'next'

export type CallerContext = {
  user_id: string
  tenant_id: string
  role: string
  is_super_admin: boolean
}

export async function getCallerContext(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<CallerContext | null> {
  const token = req.cookies.token
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('tenant_id, role, is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile) {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }

  return {
    user_id: user.id,
    tenant_id: profile.tenant_id,
    role: profile.role,
    is_super_admin: profile.is_super_admin ?? false,
  }
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
