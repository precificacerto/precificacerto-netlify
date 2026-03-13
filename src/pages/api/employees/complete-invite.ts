import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'

/**
 * Chamado quando o funcionário aceita o convite e completa o cadastro (nome, profissão).
 * Atualiza public.users e public.employees com os dados informados.
 * Tudo permanece vinculado ao tenant_id do admin que convidou (já definido no convite).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const caller = await getCallerContext(req, res)
    if (!caller) return

    const { name, position } = req.body as { name?: string; position?: string }

    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Nome é obrigatório' })
    }

    const nameTrim = name.trim()
    const positionTrim = position && typeof position === 'string' ? position.trim() : null

    try {
        const userId = caller.user_id
        const tenantId = caller.tenant_id

        const { data: empRow } = await supabaseAdmin
            .from('employees')
            .select('id, pending_permissions')
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)
            .single()

        const pending = (empRow as any)?.pending_permissions
        const desiredRole = pending?.user_role === 'admin' ? 'admin' : 'user'

        const { error: userError } = await supabaseAdmin
            .from('users')
            .update({ name: nameTrim, role: desiredRole })
            .eq('id', userId)
            .eq('tenant_id', tenantId)

        if (userError) {
            console.error('Complete invite update users:', userError)
            return res.status(500).json({ error: 'Erro ao atualizar perfil' })
        }

        const { error: empError } = await supabaseAdmin
            .from('employees')
            .update({
                name: nameTrim,
                ...(positionTrim !== null && positionTrim !== undefined && { position: positionTrim }),
            })
            .eq('user_id', userId)
            .eq('tenant_id', tenantId)

        if (empError) {
            console.error('Complete invite update employees:', empError)
            return res.status(500).json({ error: 'Erro ao atualizar cadastro do funcionário' })
        }

        // Copiar pending_permissions para user_module_permissions para que o admin veja/edite em Usuários > Permissões
        if (pending?.modules && typeof pending.modules === 'object') {
            await supabaseAdmin.from('user_module_permissions').delete().eq('user_id', userId).eq('tenant_id', tenantId)
            const moduleRows = Object.entries(pending.modules).map(([mod, p]: [string, any]) => ({
                tenant_id: tenantId,
                user_id: userId,
                module: mod,
                can_view: p.can_view ?? false,
                can_edit: p.can_edit ?? false,
                granted_by: pending.granted_by ?? null,
            }))
            if (moduleRows.length > 0) {
                await supabaseAdmin.from('user_module_permissions').insert(moduleRows)
            }
            await supabaseAdmin.from('employees').update({ pending_permissions: null }).eq('user_id', userId).eq('tenant_id', tenantId)
        }

        return res.status(200).json({
            success: true,
            message: 'Cadastro concluído. Você já pode usar a plataforma.',
        })
    } catch (error: any) {
        console.error('Complete invite error:', error?.message || 'Unknown error')
        return res.status(500).json({ error: error.message || 'Falha ao concluir cadastro' })
    }
}
