import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { getUserLimitForPlan, type PlanSlug, type RevenueTier } from '@/constants/plans'

const getAppOrigin = () => {
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    return 'https://precificav2.netlify.app'
}

// Link do convite leva para esta página; o funcionário define senha, nome e profissão
const INVITE_REDIRECT_PATH = '/aceitar-convite'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const caller = await getCallerContext(req, res)
    if (!caller) return

    const { email, name } = req.body

    if (!email) {
        return res.status(400).json({ error: 'Email is required' })
    }

    const { data: tenantData } = await supabaseAdmin
        .from('tenants')
        .select('plan_slug, revenue_tier, is_free')
        .eq('id', caller.tenant_id)
        .single()

    if (tenantData && !tenantData.is_free) {
        const planSlug = (tenantData as any).plan_slug as PlanSlug | undefined
        const revenueTier = (tenantData as any).revenue_tier as RevenueTier | undefined

        if (planSlug && revenueTier) {
            const maxUsers = getUserLimitForPlan(planSlug, revenueTier)

            if (maxUsers !== null) {
                const { count } = await supabaseAdmin
                    .from('users')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', caller.tenant_id)
                    .eq('is_active', true)

                if (count !== null && count >= maxUsers) {
                    return res.status(403).json({
                        error: `Seu plano permite no máximo ${maxUsers} usuário(s). Faça upgrade para adicionar mais.`,
                        upgradeRequired: true,
                        currentUsers: count,
                        maxUsers,
                    })
                }
            }
        }
    }

    const redirectTo = `${getAppOrigin()}${INVITE_REDIRECT_PATH}`

    try {
        // inviteUserByEmail envia email de CONVITE (não redefinição de senha); link leva para /aceitar-convite
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email.trim().toLowerCase(),
            {
                data: {
                    tenant_id: caller.tenant_id,
                    from_admin_invite: 'true',
                    is_employee: 'true',
                    name: name || '',
                },
                redirectTo,
            }
        )

        if (inviteError) {
            const msg = (inviteError.message || '').toLowerCase()
            if (msg.includes('already') && (msg.includes('registered') || msg.includes('exists'))) {
                return res.status(400).json({
                    error: 'Este email já possui conta na plataforma. O funcionário pode fazer login na tela de login.',
                })
            }
            throw inviteError
        }

        const userId = inviteData?.user?.id
        if (userId) {
            const normalizedEmail = email.trim().toLowerCase()
            await supabaseAdmin
                .from('employees')
                .update({ user_id: userId })
                .eq('tenant_id', caller.tenant_id)
                .eq('email', normalizedEmail)

            const { data: tenantRow } = await supabaseAdmin
                .from('tenants')
                .select('is_free')
                .eq('id', caller.tenant_id)
                .single()
            if (tenantRow?.is_free === true) {
                await supabaseAdmin
                    .from('users')
                    .update({ is_free: true, updated_at: new Date().toISOString() })
                    .eq('id', userId)
            }

            const { data: emp } = await supabaseAdmin
                .from('employees')
                .select('pending_permissions')
                .eq('tenant_id', caller.tenant_id)
                .eq('email', normalizedEmail)
                .single()

            if (emp?.pending_permissions?.modules) {
                const perms = emp.pending_permissions

                await supabaseAdmin.from('user_module_permissions').delete().eq('user_id', userId).eq('tenant_id', caller.tenant_id)
                await supabaseAdmin.from('user_item_access').delete().eq('user_id', userId).eq('tenant_id', caller.tenant_id)

                const moduleRows = Object.entries(perms.modules).map(([mod, p]: [string, any]) => ({
                    tenant_id: caller.tenant_id,
                    user_id: userId,
                    module: mod,
                    can_view: p.can_view ?? false,
                    can_edit: p.can_edit ?? false,
                    granted_by: perms.granted_by || null,
                }))
                if (moduleRows.length > 0) {
                    await supabaseAdmin.from('user_module_permissions').insert(moduleRows)
                }

                if (perms.item_access_mode === 'all') {
                    await supabaseAdmin.from('user_item_access').insert({
                        tenant_id: caller.tenant_id,
                        user_id: userId,
                        access_all_items: true,
                        item_id: null,
                        granted_by: perms.granted_by || null,
                    })
                } else if (perms.item_ids?.length > 0) {
                    const itemRows = perms.item_ids.map((itemId: string) => ({
                        tenant_id: caller.tenant_id,
                        user_id: userId,
                        item_id: itemId,
                        access_all_items: false,
                        granted_by: perms.granted_by || null,
                    }))
                    await supabaseAdmin.from('user_item_access').insert(itemRows)
                }

                await supabaseAdmin
                    .from('employees')
                    .update({ pending_permissions: null })
                    .eq('tenant_id', caller.tenant_id)
                    .eq('email', normalizedEmail)
            }
        }

        return res.status(200).json({
            success: true,
            message: `Convite enviado para ${name || email}. Verifique a caixa de entrada (e o spam).`,
        })
    } catch (error: any) {
        console.error('Send invite error:', error?.message || 'Unknown error')
        return res.status(500).json({ error: error.message || 'Falha ao enviar convite' })
    }
}
