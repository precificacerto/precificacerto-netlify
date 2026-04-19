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
} as const

export type ModuleKey = typeof MODULES[keyof typeof MODULES]

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
