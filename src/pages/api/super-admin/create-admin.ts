import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

const getAppOrigin = () =>
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { email, name, tenantId, isNewTenant, tenantName, isFree } = req.body as {
    email?: string
    name?: string
    tenantId?: string
    isNewTenant?: boolean
    tenantName?: string
    isFree?: boolean
  }

  if (!email?.trim()) {
    return res.status(400).json({ error: 'email obrigatório' })
  }

  const normalizedEmail = email.trim().toLowerCase()

  try {
    if (isNewTenant && tenantName) {
      // Nova tenant: RPC cria tenant; convite é enviado pelo Supabase (inviteUserByEmail)
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
        'create_tenant_with_admin',
        {
          p_name: tenantName.trim(),
          p_admin_email: normalizedEmail,
          p_admin_name: (name || '').trim() || undefined,
          p_caller_user_id: caller.user_id,
        }
      )
      if (rpcError) throw rpcError

      const tenantIdNew = (rpcData as { tenant_id?: string })?.tenant_id
      const adminEmail = (rpcData as { admin_email?: string })?.admin_email
      if (!tenantIdNew || !adminEmail) {
        return res.status(500).json({ error: 'Resposta inválida ao criar tenant' })
      }

      if (isFree) {
        await supabaseAdmin
          .from('tenants')
          .update({ is_free: true, plan_status: 'ACTIVE', updated_at: new Date().toISOString() })
          .eq('id', tenantIdNew)
      }

      await supabaseAdmin
        .from('tenant_invitations')
        .upsert({
          tenant_id: tenantIdNew,
          email: adminEmail,
          role: 'admin',
          invited_by: caller.user_id,
          accepted_at: null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'tenant_id,email' })

      // Admin deve cair em /criar-senha para definir senha; depois é redirecionado para onboarding ou /assinar conforme is_free
      const redirectTo = `${getAppOrigin()}/criar-senha`
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        adminEmail,
        {
          data: {
            tenant_id: tenantIdNew,
            from_admin_invite: 'true',
            role: 'admin',
            name: (name || '').trim() || adminEmail,
          },
          redirectTo,
        }
      )
      if (inviteError) throw inviteError

      if (isFree && inviteData?.user?.id) {
        await supabaseAdmin
          .from('users')
          .update({ is_free: true, updated_at: new Date().toISOString() })
          .eq('id', inviteData.user.id)
      }

      return res.status(200).json({
        success: true,
        tenant_id: tenantIdNew,
        user_id: inviteData?.user?.id,
        message: 'Tenant criada. O Supabase enviou um email ao admin para definir a senha e acessar a plataforma.',
      })
    }

    // Tenant existente: convite enviado pelo Supabase (inviteUserByEmail)
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId obrigatório para tenant existente' })
    }

    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('is_free')
      .eq('id', tenantId)
      .single()

    const tenantIsFree = tenantData?.is_free === true

    if (isFree && !tenantIsFree) {
      await supabaseAdmin
        .from('tenants')
        .update({ is_free: true, plan_status: 'ACTIVE', updated_at: new Date().toISOString() })
        .eq('id', tenantId)
    }

    const shouldBeFree = isFree || tenantIsFree

    await supabaseAdmin
      .from('tenant_invitations')
      .upsert({
        tenant_id: tenantId,
        email: normalizedEmail,
        role: 'admin',
        invited_by: caller.user_id,
        accepted_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'tenant_id,email' })

    // Admin deve cair em /criar-senha para definir senha; depois é redirecionado para onboarding ou /assinar conforme is_free
    const redirectTo = `${getAppOrigin()}/criar-senha`
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: {
          tenant_id: tenantId,
          from_admin_invite: 'true',
          role: 'admin',
          name: (name || '').trim() || normalizedEmail,
        },
        redirectTo,
      }
    )
    if (inviteError) {
      const msg = (inviteError as { message?: string }).message ?? ''
      if (msg.toLowerCase().includes('already') && (msg.toLowerCase().includes('registered') || msg.toLowerCase().includes('exist'))) {
        return res.status(400).json({ error: 'Este email já possui conta. Use o botão Convidar na lista de usuários para reenviar o link de redefinição.' })
      }
      throw inviteError
    }

    if (shouldBeFree && inviteData?.user?.id) {
      await supabaseAdmin
        .from('users')
        .update({ is_free: true, updated_at: new Date().toISOString() })
        .eq('id', inviteData.user.id)
    }

    return res.status(200).json({
      success: true,
      user_id: inviteData?.user?.id,
      message: 'Convite enviado por email pelo Supabase. O admin deve acessar o link para definir a senha.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao criar admin'
    const detail = err instanceof Error ? err.stack : String(err)
    console.error('super-admin create-admin:', message, detail)
    return res.status(500).json({
      error: message,
      ...(process.env.NODE_ENV === 'development' && { detail }),
    })
  }
}
