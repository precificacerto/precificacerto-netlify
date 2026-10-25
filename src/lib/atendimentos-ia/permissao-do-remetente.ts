/**
 * A PERMISSÃO DE ADMIN de um remetente do WhatsApp — quem, além do criador, altera um levantamento.
 *
 * DECISÃO 2, REVISTA (dono do produto, 25/10/2026): altera (a) o vendedor que criou e (b) quem tem
 * permissão de admin NA EMPRESA. A permissão é `users.role = 'admin'`, pela cadeia medida em produção:
 *   orcamentista_remetente_autorizado.employee_id → employees.user_id → users.role
 *
 * `employees.role` NÃO é permissão: guarda COMMERCIAL, PRODUCTIVE e ADMINISTRATIVE, que é centro de
 * custo. `super_admin` não entra por aqui: o orçamentista roda sob a credencial do cliente, e super
 * admin não altera levantamento de tenant por WhatsApp.
 *
 * FALHA FECHADA, sem exceção: elo nulo, elo não achado, elo de outro tenant, papel nulo ou diferente
 * de 'admin' → NÃO admin. Erro de banco também — a permissão não se presume.
 *
 * Portão: `src/utils/__tests__/permissao-do-remetente.test.ts` e o bloco (12) de
 * `atendimentos-ia-levantamento-por-nome.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'

/** O valor de `users.role` (enum `user_role`) que dá a permissão. Exato. */
export const PAPEL_DE_ADMIN = 'admin'

export type MotivoDeNaoAdmin =
    | 'SEM_EMPLOYEE' | 'EMPLOYEE_NAO_ACHADO' | 'SEM_USER' | 'USER_NAO_ACHADO' | 'OUTRO_TENANT' | 'NAO_E_ADMIN' | 'ERRO_DE_LEITURA'
export type Permissao = { admin: true } | { admin: false; motivo: MotivoDeNaoAdmin }

export type ElosDaPermissao = {
    remetente: { employee_id: string | null } | null
    employee: { user_id: string | null; tenant_id: string } | null
    user: { role: string | null; tenant_id: string | null } | null
}

/** A decisão, sobre os elos lidos. Função pura. */
export function permissaoPelaCadeia(tenantId: string, e: ElosDaPermissao): Permissao {
    const nao = (motivo: MotivoDeNaoAdmin): Permissao => ({ admin: false, motivo })
    if (!e.remetente?.employee_id) return nao('SEM_EMPLOYEE')
    if (!e.employee) return nao('EMPLOYEE_NAO_ACHADO')
    if (e.employee.tenant_id !== tenantId) return nao('OUTRO_TENANT')
    if (!e.employee.user_id) return nao('SEM_USER')
    if (!e.user) return nao('USER_NAO_ACHADO')
    if (e.user.tenant_id !== tenantId) return nao('OUTRO_TENANT')
    return e.user.role === PAPEL_DE_ADMIN ? { admin: true } : nao('NAO_E_ADMIN')
}

/** Lê a cadeia do remetente, cada elo filtrado pelo tenant da conexão, e decide. Nunca lança. */
export async function permissaoDoRemetente(tenantId: string, remetenteId: string): Promise<Permissao> {
    try {
        const { data: remetente, error: e1 } = await supabaseAdmin.from('orcamentista_remetente_autorizado')
            .select('employee_id').eq('id', remetenteId).eq('tenant_id', tenantId).maybeSingle()
        if (e1) return { admin: false, motivo: 'ERRO_DE_LEITURA' }
        const employeeId = (remetente as { employee_id: string | null } | null)?.employee_id ?? null
        if (!employeeId) return permissaoPelaCadeia(tenantId, { remetente: null, employee: null, user: null })

        const { data: employee, error: e2 } = await supabaseAdmin.from('employees')
            .select('user_id, tenant_id').eq('id', employeeId).eq('tenant_id', tenantId).maybeSingle()
        if (e2) return { admin: false, motivo: 'ERRO_DE_LEITURA' }
        const emp = employee as { user_id: string | null; tenant_id: string } | null
        if (!emp?.user_id) return permissaoPelaCadeia(tenantId, { remetente: { employee_id: employeeId }, employee: emp, user: null })

        const { data: user, error: e3 } = await supabaseAdmin.from('users')
            .select('role, tenant_id').eq('id', emp.user_id).eq('tenant_id', tenantId).maybeSingle()
        if (e3) return { admin: false, motivo: 'ERRO_DE_LEITURA' }
        return permissaoPelaCadeia(tenantId, { remetente: { employee_id: employeeId }, employee: emp, user: user as { role: string | null; tenant_id: string | null } | null })
    } catch {
        return { admin: false, motivo: 'ERRO_DE_LEITURA' }
    }
}
