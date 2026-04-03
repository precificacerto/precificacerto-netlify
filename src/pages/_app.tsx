import { useEffect, useRef, useState, ReactNode } from 'react'
import { useRouter } from 'next/router'
import { AppProps } from 'next/app'
import { SWRConfig } from 'swr'
import { AuthProvider } from '@/contexts/auth.context'
import { useAuth } from '@/hooks/use-auth.hook'
import '../styles/globals.scss'
import { ConfigProvider, Spin } from 'antd'
import ptBR from 'antd/locale/pt_BR'
import { Loader } from '@/components/loader.component'
import { inter } from '@/styles/fonts'
import { antThemeToken } from '@/styles/design-tokens'
import { ROUTES } from '@/constants/routes'
import { sessionStorageCacheProvider } from '@/lib/swr-cache-provider'

const PUBLIC_ROUTES = [ROUTES.LOGIN, ROUTES.RESET_PASSWORD, ROUTES.SUPER_ADMIN_LOGIN, '/cadastro', '/criar-senha']
const ONBOARDING_ROUTE = '/onboarding'
const BILLING_ROUTE = '/assinar'
const PLANS_ROUTE = '/planos'
const SUPER_ADMIN_PREFIX = '/super-admin'

function AuthGuard({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useAuth()
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    if (loading) return

    const isSuperAdminUser = !!(
      currentUser?.is_super_admin ||
      (currentUser?.role && String(currentUser.role).toLowerCase() === 'super_admin')
    )

    const isPublicRoute = PUBLIC_ROUTES.some(
      (route) => router.pathname === route || router.pathname.startsWith(route + '/')
    )
    const isOnboardingRoute = router.pathname === ONBOARDING_ROUTE
    const isSuperAdminRoute = router.pathname === SUPER_ADMIN_PREFIX || router.pathname.startsWith(SUPER_ADMIN_PREFIX + '/')
    const isSuperAdminProfileRoute = router.pathname === '/minha-conta'
    const isBlockedRoute = router.pathname === '/acesso-bloqueado'

    // Verificações de bloqueio de acesso (tenant/usuário inativos)
    if (currentUser && !isSuperAdminUser) {
      const tenantStatus = currentUser.planStatus
      const isTenantBlocked = tenantStatus === 'SUSPENDED' || tenantStatus === 'CANCELLED'
      const isUserInactive = currentUser.isActive === false

      if ((isTenantBlocked || isUserInactive) && !isPublicRoute && !isBlockedRoute) {
        setAuthorized(false)

        const reason = isTenantBlocked
          ? (tenantStatus === 'SUSPENDED' ? 'payment_overdue' : 'owner_block')
          : 'user_inactive'

        const url = `/acesso-bloqueado?reason=${reason}`
        router.replace(url)
        return
      }
    }

    if (!currentUser && !isPublicRoute) {
      setAuthorized(false)
      const redirect = encodeURIComponent(router.asPath || router.pathname)
      router.replace(`${ROUTES.LOGIN}?redirect=${redirect}`)
    } else if (isSuperAdminUser && router.pathname === ROUTES.SUPER_ADMIN_LOGIN) {
      setAuthorized(false)
      router.replace(ROUTES.SUPER_ADMIN_PANEL)
    } else if (isSuperAdminUser) {
      // Super_admin não tem tenant e não passa pelo onboarding:
      // acessa apenas rotas de /super-admin/* e a página de perfil (/minha-conta).
      if (!isSuperAdminRoute && !isSuperAdminProfileRoute) {
        setAuthorized(false)
        router.replace(ROUTES.SUPER_ADMIN_PANEL)
      } else {
        setAuthorized(true)
      }
    } else if (
      currentUser &&
      !currentUser.is_super_admin &&
      (currentUser.planStatus === 'TRIAL' || currentUser.planStatus === 'ACTIVE') === false &&
      !currentUser.isFree &&
      router.pathname !== BILLING_ROUTE &&
      router.pathname !== PLANS_ROUTE &&
      router.pathname !== ROUTES.RESET_PASSWORD &&
      !isPublicRoute &&
      !isBlockedRoute
    ) {
      // Plano não ativo/trial: envia para tela de assinatura,
      // exceto quando já estamos na tela de bloqueio ou de billing.
      setAuthorized(false)
      router.replace(BILLING_ROUTE)
    } else if (currentUser && !currentUser.onboardingCompleted && !isOnboardingRoute && router.pathname !== ROUTES.RESET_PASSWORD && router.pathname !== BILLING_ROUTE && router.pathname !== '/criar-senha') {
      setAuthorized(false)
      router.replace(ONBOARDING_ROUTE)
    } else if (currentUser && currentUser.onboardingCompleted && isOnboardingRoute) {
      setAuthorized(false)
      router.replace(ROUTES.DASHBOARD)
    } else {
      setAuthorized(true)
    }
  }, [currentUser, loading, router.pathname, router.asPath])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#0a1628',
      }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!authorized) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#0a1628',
      }}>
        <Spin size="large" />
      </div>
    )
  }

  return <>{children}</>
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const handleStart = () => {
      timerRef.current = setTimeout(() => setLoading(true), 1500)
    }

    const handleComplete = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setLoading(false)
    }

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleComplete)
    router.events.on('routeChangeError', handleComplete)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleComplete)
      router.events.off('routeChangeError', handleComplete)
    }
  }, [router])

  return (
    <SWRConfig value={{ provider: sessionStorageCacheProvider }}>
    <AuthProvider>
      <ConfigProvider
        theme={{
          token: antThemeToken,
          components: {
            Button: {
              borderRadius: 8,
              controlHeight: 40,
            },
            Input: {
              borderRadius: 8,
              controlHeight: 40,
            },
            Select: {
              borderRadius: 8,
              controlHeight: 40,
            },
            Table: {
              borderRadius: 12,
            },
            Card: {
              borderRadiusLG: 12,
            },
            Modal: {
              borderRadiusLG: 12,
            },
          },
        }}
        locale={ptBR}
      >
        <div className={inter.variable} style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          {loading && <Loader />}
          <AuthGuard>
            <Component {...pageProps} />
          </AuthGuard>
        </div>
      </ConfigProvider>
    </AuthProvider>
    </SWRConfig>
  )
}
