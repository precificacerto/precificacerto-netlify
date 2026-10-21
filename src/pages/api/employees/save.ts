/**
 * POST /api/employees/save — cria ou edita um funcionário da conta do chamador, e (só para o admin
 * da conta) as permissões de acesso dele.
 *
 * ══ CORREÇÃO DE SEGURANÇA, 21/10/2026 ══
 * Regra do dono do produto, literal: nenhuma informação atravessa entre contas, nunca. Até esta
 * data a rota, com `supabaseAdmin` (service_role, que IGNORA a RLS):
 *   - editava pelo `editing_id` do corpo SEM filtrar a conta — o admin da conta A alterava o
 *     funcionário da conta B, o USUÁRIO dele (até promovê-lo a `admin` na conta B) e gravava
 *     permissões para ele;
 *   - aceitava qualquer usuário logado, sem conferir a permissão do módulo `employees`;
 *   - deixava qualquer um gravar permissões de acesso e `user_role` — inclusive as PRÓPRIAS: um
 *     vendedor se dava todos os módulos e virava `admin`.
 * Agora:
 *   - TODA leitura e escrita filtra pelo `tenant_id` do chamador (`getCallerContext`), nunca do
 *     corpo. Id de outra conta responde 404 — o MESMO de um id que não existe: não se confirma
 *     que o registro existe;
 *   - a rota exige poder EDITAR o módulo `employees` (`podeEditarModulo`);
 *   - mexer em permissão de acesso (`modulePermissions`, `itemAccessMode`, `selectedItemIds`,
 *     `employee.user_role`) exige ser ADMIN DA CONTA; senão, 403 e nada é gravado;
 *   - ninguém altera as PRÓPRIAS permissões: o admin que salva o próprio cadastro tem o cadastro
 *     gravado, e as permissões e o papel dele ficam como estavam — a resposta traz `aviso`.
 * Portão: `src/utils/__tests__/employees-save-nao-cruza-conta.test.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext, type CallerContext } from '@/lib/get-caller-tenant'
import { podeEditarModulo } from '@/lib/permissao-do-modulo'

/** `MODULES.EMPLOYEES` — escrito aqui porque o hook de permissões é código de navegador. */
const MODULO_DE_FUNCIONARIOS = 'employees'
const NAO_ENCONTRADO = 'Funcionário não encontrado.'
export const AVISO_PROPRIAS_PERMISSOES =
    'As suas próprias permissões de acesso não foram alteradas: ninguém altera as próprias permissões.'

const ehAdminDaConta = (caller: CallerContext) => !caller.is_super_admin && (caller.role ?? '').toLowerCase() === 'admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const caller = await getCallerContext(req, res)
    if (!caller) return

    const { employee, editing_id, modulePermissions, itemAccessMode, selectedItemIds } = req.body ?? {}
    // A conta é SEMPRE a do chamador. Um `tenant_id` no corpo, ou dentro de `employee`, é ignorado.
    const tenant_id = caller.tenant_id

    if (!employee?.name) {
        return res.status(400).json({ error: 'employee.name is required' })
    }

    if (!(await podeEditarModulo(caller, MODULO_DE_FUNCIONARIOS))) {
        return res.status(403).json({ error: 'Sem permissão para editar funcionários.' })
    }

    const mexeEmPermissao = modulePermissions !== undefined || itemAccessMode !== undefined
        || selectedItemIds !== undefined || employee?.user_role !== undefined
    if (mexeEmPermissao && !ehAdminDaConta(caller)) {
        return res.status(403).json({ error: 'Só o administrador da conta altera permissões de acesso.' })
    }

    // Só existe quando um ADMIN DA CONTA mandou permissões; sem isso, nada de permissão é gravado.
    const pendingPerms = mexeEmPermissao ? {
        modules: modulePermissions || null,
        item_access_mode: itemAccessMode || 'all',
        item_ids: selectedItemIds || [],
        granted_by: caller.user_id,
        user_role: (employee?.user_role === 'admin' ? 'admin' : 'user'),
    } : null

    try {
        if (editing_id) {
            return await handleUpdate(res, editing_id, employee, tenant_id, pendingPerms, caller.user_id)
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
            commission_payment_mode: employee.commission_payment_mode || 'FULL',
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

    const { error: errMudo32 } = await supabase.from('user_module_permissions').delete().eq('user_id', userId).eq('tenant_id', tenant_id)
    if (errMudo32) throw errMudo32
    const { error: errMudo31 } = await supabase.from('user_item_access').delete().eq('user_id', userId).eq('tenant_id', tenant_id)
    if (errMudo31) throw errMudo31

    const moduleRows = Object.entries(perms.modules).map(([mod, p]: [string, any]) => ({
        tenant_id,
        user_id: userId,
        module: mod,
        can_view: p.can_view ?? false,
        can_edit: p.can_edit ?? false,
        granted_by: perms.granted_by || null,
    }))
    if (moduleRows.length > 0) {
        const { error: errMudo30 } = await supabase.from('user_module_permissions').insert(moduleRows)
        if (errMudo30) throw errMudo30
    }

    if (perms.item_access_mode === 'all') {
        const { error: errMudo29 } = await supabase.from('user_item_access').insert({
            tenant_id,
            user_id: userId,
            access_all_items: true,
            item_id: null,
            granted_by: perms.granted_by || null,
        })
        if (errMudo29) throw errMudo29
    } else if (perms.item_ids?.length > 0) {
        const itemRows = perms.item_ids.map((itemId: string) => ({
            tenant_id,
            user_id: userId,
            item_id: itemId,
            access_all_items: false,
            granted_by: perms.granted_by || null,
        }))
        const { error: errMudo28 } = await supabase.from('user_item_access').insert(itemRows)
        if (errMudo28) throw errMudo28
    }
}

async function handleUpdate(res: NextApiResponse, editing_id: string, employee: any, tenant_id: string, pendingPerms: any, callerUserId: string) {
    const { data: current } = await supabaseAdmin
        .from('employees')
        .select('user_id, email')
        .eq('id', editing_id)
        .eq('tenant_id', tenant_id)
        .maybeSingle()

    // De outra conta, ou inexistente: a MESMA resposta — não se confirma que o registro existe.
    if (!current) return res.status(404).json({ error: NAO_ENCONTRADO })

    const user_id = current.user_id || null
    // Ninguém altera as PRÓPRIAS permissões: o cadastro grava, as permissões e o papel não.
    const proprio = !!user_id && user_id === callerUserId
    const aplicarPermissoes = !!pendingPerms && !proprio

    // Ao editar, NUNCA criamos usuário no Auth. O usuário só é criado quando o funcionário aceita o convite.
    // Se já tem user_id (aceitou convite): aplicamos permissões em user_module_permissions.
    // Se não tem user_id: gravamos as permissões em pending_permissions para aplicar quando aceitar.

    if (user_id && employee.email) {
        const { data: u } = await supabaseAdmin.from('users').select('is_super_admin').eq('id', user_id).eq('tenant_id', tenant_id).maybeSingle()
        if (u && !u.is_super_admin) {
            const nextRole = aplicarPermissoes && employee.user_role === 'admin' ? 'admin' : undefined
            const { error: errMudo27 } = await supabaseAdmin
                .from('users')
                .update({
                    name: employee.name,
                    phone: employee.phone || null,
                    cpf: employee.document || null,
                    ...(nextRole ? { role: nextRole } : {}),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', user_id)
                .eq('tenant_id', tenant_id)
            if (errMudo27) throw errMudo27
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
        commission_payment_mode: employee.commission_payment_mode || 'FULL',
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
        .eq('tenant_id', tenant_id)
        .select()
        .single()

    if (empError) throw empError

    if (aplicarPermissoes && user_id) {
        await applyPermissions(supabaseAdmin, tenant_id, user_id, pendingPerms)
        const { error: errMudo26 } = await supabaseAdmin.from('employees').update({ pending_permissions: null }).eq('id', editing_id).eq('tenant_id', tenant_id)
        if (errMudo26) throw errMudo26
    }

    return res.status(200).json({
        success: true,
        employee: updated,
        ...(proprio && pendingPerms ? { aviso: AVISO_PROPRIAS_PERMISSOES } : {}),
    })
}
