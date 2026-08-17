import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import { usePermissions } from './use-permissions.hook'
import { useAuth } from './use-auth.hook'

/**
 * Correções de Menu V9 (item 3): guarda de rota para as telas de "definições da conta"
 * (Minha Conta, Configurações, Planos).
 *
 * Um funcionário comum NUNCA deve acessar essas telas — nem pelo menu (que oculta os itens)
 * nem digitando a URL diretamente. Este hook redireciona para o Dashboard quem não for
 * admin da conta (ou super admin) e expõe `allowed` para o componente evitar renderizar
 * qualquer conteúdo sensível durante o redirecionamento.
 *
 * Uso:
 *   const { allowed } = useRequireAccountAdmin()
 *   // ...demais hooks da página...
 *   if (!allowed) return null   // logo antes do return principal (após todos os hooks)
 */
export function useRequireAccountAdmin(): { allowed: boolean; checking: boolean } {
  const router = useRouter()
  const { currentUser } = useAuth()
  const { isAdmin, isSuperAdmin } = usePermissions()

  const checking = !currentUser
  const allowed = !!currentUser && (isAdmin || isSuperAdmin)

  useEffect(() => {
    if (currentUser && !isAdmin && !isSuperAdmin) {
      router.replace(ROUTES.DASHBOARD)
    }
  }, [currentUser, isAdmin, isSuperAdmin, router])

  return { allowed, checking }
}
