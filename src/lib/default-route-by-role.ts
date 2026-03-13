import { ROUTES } from '@/constants/routes'
import type { LoggedUser } from '@/types/logged-user.type'

/**
 * Retorna a rota padrão após login conforme o perfil do usuário:
 * - super_admin → Painel Super Admin
 * - admin ou user → Dashboard da tenant
 */
export function getDefaultRouteForUser(user: LoggedUser | null): string {
  if (!user) return ROUTES.DASHBOARD
  return user.is_super_admin === true ? ROUTES.SUPER_ADMIN_PANEL : ROUTES.DASHBOARD
}
