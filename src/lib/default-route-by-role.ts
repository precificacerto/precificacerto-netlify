import { ROUTES } from '@/constants/routes'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import type { LoggedUser } from '@/types/logged-user.type'

/**
 * Retorna a rota padrão após login conforme o perfil do usuário:
 * - super_admin → Painel Super Admin
 * - prestador de serviço (calcType=SERVICE) → Agenda
 * - demais admin/user → Dashboard da tenant
 */
export function getDefaultRouteForUser(user: LoggedUser | null): string {
  if (!user) return ROUTES.DASHBOARD
  if (user.is_super_admin === true) return ROUTES.SUPER_ADMIN_PANEL
  if (user.calcType === CALC_TYPE_ENUM.SERVICE) return ROUTES.SCHEDULE
  return ROUTES.DASHBOARD
}
