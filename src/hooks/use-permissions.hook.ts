import { useAuth } from './use-auth.hook'
import { PERMISSIONS } from '@/shared/enums/permissions'

export const MODULES = {
  HOME:             'home',
  CUSTOMERS:        'customers',
  ITEMS:            'items',
  PRODUCTS:         'products',
  BUDGETS:          'budgets',
  ORDERS:           'orders',
  SALES:            'sales',
  STOCK:            'stock',
  CASHIER:          'cashier',
  CASH_FLOW:        'cash_flow',
  EMPLOYEES:        'employees',
  REPORTS:          'reports',
  AGENDA:           'agenda',
  SERVICES:         'services',
  CONNECTIVITY:     'connectivity',
  DFC:              'dfc',
  COMMISSION:       'commission',
  USERS_MANAGEMENT: 'users_management',
  SALES_REPORT:     'sales_report',
  RECURRENCE:       'recurrence',
  // Correções de Menu V9 (itens 2/6): módulos próprios, restringíveis isoladamente.
  // "Relatório de Comissões" (Comercial) e "RT Comissões" (Financeiro) deixam de
  // reaproveitar sales_report/commission para poderem ser bloqueados por funcionário.
  COMMISSIONS_REPORT: 'commissions_report',
  RT_COMMISSION:      'rt_commission',
  // Orçamentista: a chave nasceu no bloco 1 (18/10/2026) fora das concedíveis, e ENTROU nelas em
  // 21/10/2026, no mesmo commit em que o item entrou no menu (seção Atendimentos I.A.). Ligado
  // por conta pelo super admin em `orcamentista_config`; a permissão diz QUEM da conta o vê.
  ORCAMENTISTA:       'orcamentista',
} as const

export type ModuleKey = typeof MODULES[keyof typeof MODULES]

/**
 * Os módulos que NÃO aparecem nas telas de permissão nem são aceitos pela rota que as grava.
 *
 * `users_management` nunca foi concedível por funcionário. `orcamentista` entrou em 18/10/2026
 * (bloco 1) e ficou FORA até o bloco 2, que traz JUNTOS a aba no menu e a entrada nas
 * permissões — decisão do dono do produto, para que a paridade menu ↔ permissões
 * (`cascata-lucro-real.md`, Parte 4, "inviolável") se cumprisse por construção, sem exceção.
 * SAIU DESTA LISTA em 21/10/2026, no mesmo commit em que entrou no menu, como a decisão mandava.
 * `user_module_permissions.module` é text sem CHECK (consulta do dono do produto, 21/10/2026):
 * a chave grava sem migração.
 *
 * UMA lista para as quatro leituras (`admin/usuarios.tsx`, `funcionarios/[id]/permissoes.tsx`
 * duas vezes e `api/admin/users/[id]/permissions.ts`). Antes cada uma escrevia o próprio
 * `!== MODULES.USERS_MANAGEMENT` — acrescentar o segundo módulo em quatro lugares seria
 * `copia-divergente.md` nascendo.
 */
export const MODULOS_NAO_CONCEDIVEIS: readonly ModuleKey[] = [MODULES.USERS_MANAGEMENT]

/** Os módulos que as telas de permissão listam e a rota aceita. */
export const MODULOS_CONCEDIVEIS: string[] = (Object.values(MODULES) as ModuleKey[]).filter((m) => !MODULOS_NAO_CONCEDIVEIS.includes(m))

export function usePermissions() {
  const { currentUser } = useAuth()

  const isSuperAdmin = currentUser?.is_super_admin === true
  const isAdmin = currentUser?.permissions?.includes(PERMISSIONS.ADMIN) ?? false

  function canView(module: ModuleKey): boolean {
    if (isSuperAdmin) return true
    // Admin (owner) tem acesso total a todos os módulos
    if (isAdmin) return true
    return currentUser?.modulePermissions?.[module]?.can_view ?? false
  }

  function canEdit(module: ModuleKey): boolean {
    if (isSuperAdmin) return true
    if (isAdmin) return true
    return currentUser?.modulePermissions?.[module]?.can_edit ?? false
  }

  function canUseItem(itemId: string): boolean {
    if (isSuperAdmin) return true
    if (isAdmin) return true
    if (currentUser?.itemAccess?.all) return true
    return currentUser?.itemAccess?.itemIds?.includes(itemId) ?? false
  }

  return { isSuperAdmin, isAdmin, canView, canEdit, canUseItem }
}
