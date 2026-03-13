import { useAuth } from './use-auth.hook'

export const MODULES = {
  HOME:             'home',
  CUSTOMERS:        'customers',
  ITEMS:            'items',
  PRODUCTS:         'products',
  BUDGETS:          'budgets',
  SALES:            'sales',
  STOCK:            'stock',
  CASHIER:          'cashier',
  CASH_FLOW:        'cash_flow',
  EMPLOYEES:        'employees',
  REPORTS:          'reports',
  AGENDA:           'agenda',
  SERVICES:         'services',
  CONNECTIVITY:     'connectivity',
  USERS_MANAGEMENT: 'users_management',
} as const

export type ModuleKey = typeof MODULES[keyof typeof MODULES]

export function usePermissions() {
  const { currentUser } = useAuth()

  const isSuperAdmin = currentUser?.is_super_admin === true

  function canView(module: ModuleKey): boolean {
    if (isSuperAdmin) return true
    return currentUser?.modulePermissions?.[module]?.can_view ?? false
  }

  function canEdit(module: ModuleKey): boolean {
    if (isSuperAdmin) return true
    return currentUser?.modulePermissions?.[module]?.can_edit ?? false
  }

  function canUseItem(itemId: string): boolean {
    if (isSuperAdmin) return true
    if (currentUser?.itemAccess?.all) return true
    return currentUser?.itemAccess?.itemIds?.includes(itemId) ?? false
  }

  return { isSuperAdmin, canView, canEdit, canUseItem }
}
