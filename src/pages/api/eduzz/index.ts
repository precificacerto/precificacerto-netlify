import { METHODS } from '@/constants/http-methods'
import { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { supabaseAdmin } from '@/supabase/admin'

const EXPECTED_API_KEY = process.env.NEXT_PUBLIC_EDUZZ_API_KEY

export default async function webhook(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === METHODS.POST) {
    try {
      const { api_key, event_name, student_email } = req.body
      if (api_key !== EXPECTED_API_KEY) {
        return res.status(401).json({
          result: null,
          error: 'Acesso negado! API Key inválida',
        })
      }

      if (event_name !== 'invoice_paid') {
        return res.status(200).json({
          result: null,
          error: null,
          message: `Sem suporte a eventos do tipo '${event_name}'`,
        })
      }

      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', student_email)
        .maybeSingle()

      if (existingUser) {
        return res.status(200).json({
          result: null,
          error: 'Endereço de email já cadastrado!',
        })
      }

      const randomPassword = crypto.randomBytes(8).toString('hex')

      const { data: tenant, error: tenantError } = await supabaseAdmin
        .from('tenants')
        .insert({ name: student_email.split('@')[0], email: student_email })
        .select('id')
        .single()

      if (tenantError) throw tenantError

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: student_email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { tenant_id: tenant.id, role: 'admin' },
      })

      if (authError) throw authError

      const { data: newUser, error: userError } = await supabaseAdmin
        .from('users')
        .insert({
          id: authUser.user.id,
          tenant_id: tenant.id,
          email: student_email,
          role: 'admin',
          is_active: true,
          is_super_admin: true,
        })
        .select()
        .single()

      if (userError) throw userError

      await supabaseAdmin.from('tenant_settings').insert({ tenant_id: tenant.id })
      await supabaseAdmin.from('tenant_expense_config').insert({ tenant_id: tenant.id })

      res.json({
        result: { createdUser: newUser },
        error: null,
      })
    } catch (error) {
      console.error('Eduzz error:', error?.message || 'Unknown error')

      res.status(500).json({
        result: null,
        error: 'Erro inesperado!',
      })
    }
  } else {
    res.status(405).json({
      result: null,
      error: 'Método não autorizado!',
    })
  }
}
