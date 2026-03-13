import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const token = req.cookies.token
    if (!token) {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !caller) {
      return res.status(401).json({ error: 'Token inválido' })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('users')
      .select('tenant_id, role, is_super_admin')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || (!callerProfile.is_super_admin && callerProfile.role !== 'admin')) {
      return res.status(403).json({ error: 'Sem permissão para criar usuários' })
    }

    const { email, password, isActive } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' })
    }

    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        tenant_id: callerProfile.tenant_id,
        role: 'user',
      },
    })

    if (createError) throw createError

    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.user.id,
        tenant_id: callerProfile.tenant_id,
        email,
        role: 'user',
        is_active: isActive ?? true,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return res.json({ user: newUser })
  } catch (error: any) {
    console.error('Erro ao criar usuário:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro inesperado' })
  }
}
