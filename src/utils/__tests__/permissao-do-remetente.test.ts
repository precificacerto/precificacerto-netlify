/**
 * PORTÃO — a PERMISSÃO DE ADMIN do remetente (`src/lib/atendimentos-ia/permissao-do-remetente.ts`).
 *
 * DECISÃO 2, REVISTA (dono do produto, 25/10/2026): altera um levantamento (a) o vendedor que o criou e
 * (b) quem tem permissão de admin NA EMPRESA. A permissão é `users.role = 'admin'`, pela cadeia
 *   orcamentista_remetente_autorizado.employee_id → employees.user_id → users.role
 * `employees.role` NÃO é permissão (é centro de custo: COMMERCIAL, PRODUCTIVE, ADMINISTRATIVE).
 *
 * FALHA FECHADA: elo nulo, elo não achado, papel nulo ou de outro tenant → NÃO admin. `super_admin` não
 * entra por aqui: o orçamentista roda sob a credencial do cliente.
 *
 * Cada caso de recusa difere do caso ADMIN em UM elo só — é o que faz cada um discriminar.
 */
export {}

/* eslint-disable @typescript-eslint/no-require-imports */
type Modulo = typeof import('@/lib/atendimentos-ia/permissao-do-remetente')
const P = () => require('@/lib/atendimentos-ia/permissao-do-remetente') as Modulo
/* eslint-enable @typescript-eslint/no-require-imports */

const TENANT = 'tenant-1'
const ADMIN = {
    remetente: { employee_id: 'e1' },
    employee: { user_id: 'u1', tenant_id: TENANT },
    user: { role: 'admin', tenant_id: TENANT },
}

describe('permissaoPelaCadeia — admin só com a cadeia inteira', () => {
    it('a cadeia inteira, no tenant, com role admin → ADMIN', () => {
        expect(P().permissaoPelaCadeia(TENANT, ADMIN)).toEqual({ admin: true })
    })

    it.each([
        ['remetente sem employee_id', { ...ADMIN, remetente: { employee_id: null } }, 'SEM_EMPLOYEE'],
        ['remetente não achado', { ...ADMIN, remetente: null }, 'SEM_EMPLOYEE'],
        ['employee não achado', { ...ADMIN, employee: null }, 'EMPLOYEE_NAO_ACHADO'],
        ['employees.user_id NULO (o caso medido do remetente de teste)', { ...ADMIN, employee: { user_id: null, tenant_id: TENANT } }, 'SEM_USER'],
        ['user não achado', { ...ADMIN, user: null }, 'USER_NAO_ACHADO'],
        ['users.role NULO — nunca vira admin', { ...ADMIN, user: { role: null, tenant_id: TENANT } }, 'NAO_E_ADMIN'],
        ['role user', { ...ADMIN, user: { role: 'user', tenant_id: TENANT } }, 'NAO_E_ADMIN'],
        ['role super_admin — não entra por aqui', { ...ADMIN, user: { role: 'super_admin', tenant_id: TENANT } }, 'NAO_E_ADMIN'],
        ['role "Admin" (outra caixa) — comparação exata', { ...ADMIN, user: { role: 'Admin', tenant_id: TENANT } }, 'NAO_E_ADMIN'],
        ['employee de OUTRO tenant', { ...ADMIN, employee: { user_id: 'u1', tenant_id: 'outro' } }, 'OUTRO_TENANT'],
        ['user admin de OUTRO tenant', { ...ADMIN, user: { role: 'admin', tenant_id: 'outro' } }, 'OUTRO_TENANT'],
        ['user sem tenant (o super admin não tem)', { ...ADMIN, user: { role: 'admin', tenant_id: null } }, 'OUTRO_TENANT'],
    ])('%s → NÃO admin (%s)', (_n, elos, motivo) => {
        expect(P().permissaoPelaCadeia(TENANT, elos as never)).toEqual({ admin: false, motivo })
    })
})
