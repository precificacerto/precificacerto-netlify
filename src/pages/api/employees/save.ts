import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const caller = await getCallerContext(req, res)
    if (!caller) return

    const { employee, editing_id, modulePermissions, itemAccessMode, selectedItemIds } = req.body
    const tenant_id = caller.tenant_id

    if (!employee?.name) {
        return res.status(400).json({ error: 'employee.name is required' })
    }

    const pendingPerms = {
        modules: modulePermissions || null,
        item_access_mode: itemAccessMode || 'all',
        item_ids: selectedItemIds || [],
        granted_by: caller.user_id,
        user_role: (employee?.user_role === 'admin' ? 'admin' : 'user'),
    }

    try {
        if (editing_id) {
            return await handleUpdate(res, editing_id, employee, tenant_id, pendingPerms)
        } else {
            return await handleCreate(res, employee, tenant_id, pendingPerms)
        }
    } catch (error: any) {
        console.error('Employee save error:', error?.message || 'Unknown error')
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}

async function handleCreate(res: NextApiResponse, employee: any, tenant_id: string, pendingPerms: any) {
    const { data: newEmployee, error: empError } = await supabaseAdmin
        .from('employees')
        .insert({
            tenant_id,
            user_id: null,
            name: employee.name,
            email: employee.email || null,
            phone: employee.phone || null,
            document: employee.document || null,
            role: employee.role || 'PRODUCTIVE',
            position: employee.position || null,
            status: employee.status || 'ACTIVE',
            salary: employee.salary || 0,
            work_hours_per_day: employee.work_hours_per_day || 8,
            work_days_per_month: employee.work_days_per_month || 22,
            commission_percent: employee.commission_percent ?? 0,
            notes: employee.notes || null,
            pending_permissions: pendingPerms,
        })
        .select()
        .single()

    if (empError) throw empError

    return res.status(200).json({ success: true, employee: newEmployee })
}

async function applyPermissions(supabase: typeof supabaseAdmin, tenant_id: string, userId: string, perms: any) {
    if (!perms?.modules) return

    await supabase.from('user_module_permissions').delete().eq('user_id', userId).eq('tenant_id', tenant_id)
    await supabase.from('user_item_access').delete().eq('user_id', userId).eq('tenant_id', tenant_id)

    const moduleRows = Object.entries(perms.modules).map(([mod, p]: [string, any]) => ({
        tenant_id,
        user_id: userId,
        module: mod,
        can_view: p.can_view ?? false,
        can_edit: p.can_edit ?? false,
        granted_by: perms.granted_by || null,
    }))
    if (moduleRows.length > 0) {
        await supabase.from('user_module_permissions').insert(moduleRows)
    }

    if (perms.item_access_mode === 'all') {
        await supabase.from('user_item_access').insert({
            tenant_id,
            user_id: userId,
            access_all_items: true,
            item_id: null,
            granted_by: perms.granted_by || null,
        })
    } else if (perms.item_ids?.length > 0) {
        const itemRows = perms.item_ids.map((itemId: string) => ({
            tenant_id,
            user_id: userId,
            item_id: itemId,
            access_all_items: false,
            granted_by: perms.granted_by || null,
        }))
        await supabase.from('user_item_access').insert(itemRows)
    }
}

async function handleUpdate(res: NextApiResponse, editing_id: string, employee: any, tenant_id: string, pendingPerms: any) {
    const { data: current } = await supabaseAdmin
        .from('employees')
        .select('user_id, email')
        .eq('id', editing_id)
        .single()

    const user_id = current?.user_id || null

    // Ao editar, NUNCA criamos usuário no Auth. O usuário só é criado quando o funcionário aceita o convite.
    // Se já tem user_id (aceitou convite): aplicamos permissões em user_module_permissions.
    // Se não tem user_id: gravamos as permissões em pending_permissions para aplicar quando aceitar.

    if (user_id && employee.email) {
        const { data: u } = await supabaseAdmin.from('users').select('is_super_admin').eq('id', user_id).single()
        if (!u?.is_super_admin) {
            const nextRole = employee.user_role === 'admin' ? 'admin' : undefined
            await supabaseAdmin
                .from('users')
                .update({
                    name: employee.name,
                    phone: employee.phone || null,
                    cpf: employee.document || null,
                    ...(nextRole ? { role: nextRole } : {}),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', user_id)
        }
    }

    const updatePayload: Record<string, unknown> = {
        name: employee.name,
        email: employee.email || null,
        phone: employee.phone || null,
        document: employee.document || null,
        role: employee.role,
        position: employee.position || null,
        status: employee.status,
        salary: employee.salary || 0,
        work_hours_per_day: employee.work_hours_per_day || 8,
        work_days_per_month: employee.work_days_per_month || 22,
        commission_percent: employee.commission_percent ?? 0,
        notes: employee.notes || null,
        updated_at: new Date().toISOString(),
    }

    if (user_id) {
        updatePayload.user_id = user_id
    }

    if (!user_id && pendingPerms) {
        updatePayload.pending_permissions = pendingPerms
    } else if (user_id) {
        updatePayload.pending_permissions = null
    }

    const { data: updated, error: empError } = await supabaseAdmin
        .from('employees')
        .update(updatePayload)
        .eq('id', editing_id)
        .select()
        .single()

    if (empError) throw empError

    if (pendingPerms && user_id) {
        await applyPermissions(supabaseAdmin, tenant_id, user_id, pendingPerms)
        await supabaseAdmin.from('employees').update({ pending_permissions: null }).eq('id', editing_id)
    }

    return res.status(200).json({ success: true, employee: updated })
}
