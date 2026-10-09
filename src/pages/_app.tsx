import { useEffect, useRef, useState, ReactNode } from 'react'
import { useRouter } from 'next/router'
import App, { AppContext, AppProps } from 'next/app'
import { SWRConfig } from 'swr'
import { AuthProvider } from '@/contexts/auth.context'
import { DeviceProvider, DeviceType, useDevice } from '@/contexts/device.context'
import { useAuth } from '@/hooks/use-auth.hook'
import '../styles/globals.scss'
import { App as AntdApp, ConfigProvider, Spin } from 'antd'
import ptBR from 'antd/locale/pt_BR'
import { Loader } from '@/components/loader.component'
import { inter } from '@/styles/fonts'
import { antThemeToken } from '@/styles/design-tokens'
import { ROUTES } from '@/constants/routes'
import { rotaEhPublica, rotaSemConta } from '@/constants/rotas-publicas'
import { sessionStorageCacheProvider } from '@/lib/swr-cache-provider'
import { initMobileTableLabels } from '@/lib/mobile-table-labels'

/**
 * >>> `PUBLIC_ROUTES` SAIU DAQUI EM 09/10/2026, PARA `@/constants/rotas-publicas` <<<
 *
 * Ela era:
 *     const PUBLIC_ROUTES = [ROUTES.LOGIN, ROUTES.RESET_PASSWORD, ROUTES.SUPER_ADMIN_LOGIN,
 *                            '/cadastro', '/criar-senha']
 *
 * e `/agendar/[token]` nunca entrou nela — por isso a página pública do agendamento pedia
 * login em produção, com o link ligado. A lista foi para um módulo com FUNÇÃO PURA, de modo
 * que o portão exercite CAMINHOS (`/agendar/x`, `/agenda`, `/admin/agendar/x`) em vez de
 * componentes: todos os casos da página a renderizavam sozinha, nunca através deste guarda.
 *
 * Os membros não mudaram. O que entrou são os dois prefixos sem conta, naquele arquivo.
 */
const ONBOARDING_ROUTE = '/onboarding'
const BILLING_ROUTE = '/assinar'
const PLANS_ROUTE = '/planos'
const SUPER_ADMIN_PREFIX = '/super-admin'

// Shell interno ao DeviceProvider: aplica `data-device` de forma REATIVA (o CSS
// `[data-device='mobile']` oculta a sidebar). Consome `useDevice()`, que no cliente
// reflete a largura real da viewport — antes o atributo vinha só do user-agent (SSR)
// e podia ficar preso em 'tablet'/'desktop' num aparelho estreito. No 1º paint o
// contexto ainda vale `initialDevice` (SSR), então não há hydration mismatch.
function AppShell({ loading, children }: { loading: boolean; children: ReactNode }) {
  const { device } = useDevice()
  return (
    <div className={inter.variable} data-device={device} style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {loading && <Loader />}
      <AuthGuard>{children}</AuthGuard>
    </div>
  )
}

/**
 * >>> EXPORTADO EM 09/10/2026 PARA QUE O PORTÃO ALCANCE O GUARDA <<<
 *
 * Ele era local. Com isso, o único jeito de testar "a página pública abre" era renderizar a
 * PÁGINA — e era exatamente o que os 4.138 casos faziam, nunca passando por aqui. É o
 * precedente de `applyTotalACobrarToStep11`, registrado em `teste-que-nao-exercita.md`: *"o
 * custo é uma linha, e o que se compra é poder afirmar efeito em vez de passagem."*
 *
 * `rotas-publicas.test.tsx` renderiza ESTE componente com `currentUser = null` e afirma, por
 * caminho, se `router.replace` foi chamado. Sem a exportação, o caso do defeito desta rodada
 * não existiria.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useAuth()
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    if (loading) return

    const isSuperAdminUser = !!(
      currentUser?.is_super_admin ||
      (currentUser?.role && String(currentUser.role).toLowerCase() === 'super_admin')
    )

    // A decisão inteira mora em `rotaEhPublica`, e é ela que o portão exercita.
    const isPublicRoute = rotaEhPublica(router.pathname)
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

type PcAppProps = AppProps & { initialDevice: DeviceType }

function PcApp({ Component, pageProps, initialDevice }: PcAppProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const teardown = initMobileTableLabels()
    return teardown
  }, [])

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

  // ══ A PÁGINA SEM CONTA NÃO ENTRA NO ENVOLTÓRIO. NENHUMA PARTE DELE. ════════════════════
  //
  // Requisito 3 da correção de 09/10/2026: *"A pagina publica NAO pode receber o layout
  // logado: nem menu, nem barra lateral, nem nada que leia sessao."*
  //
  // >>> O `AuthProvider` LÊ SESSÃO E CONSULTA O BANCO AO MONTAR <<<
  //
  // Ele importa `@/supabase/client` e, com sessão, consulta `users`, `tenants`,
  // `tenant_settings`, `tenant_expense_config`, `user_module_permissions`, `user_item_access`
  // e `employees`. Um cliente de barbearia — que não tem conta e nunca vai ter — não pode
  // montar nada disso. Deixá-lo dentro e só liberar o `AuthGuard` resolveria o redirect e
  // manteria o resto: o `<Spin>` piscando, o provedor consultando, e o custo de tudo isso no
  // telefone de quem só queria marcar um horário.
  //
  // O `AuthGuard` também fica de fora por consequência — e é por isso que o redirect não
  // acontece nem por um instante.
  //
  // >>> AS TELAS DE AUTENTICAÇÃO **CONTINUAM** DENTRO, E ISSO É A OUTRA METADE DA REGRA <<<
  //
  // `rotaSemConta` é só os dois prefixos; `/login` e `/cadastro` NÃO estão nela. Tirar o
  // `AuthProvider` do login quebraria o login — é a distinção nomeada em
  // `@/constants/rotas-publicas`, e cada uma das duas funções tem o seu uso aqui.
  //
  // A página sem conta não usa antd: ela é HTML com estilo inline, de propósito, desde a Fase
  // 2. O `ConfigProvider`/`AntdApp` também sai, então.
  if (rotaSemConta(router.pathname)) {
    return (
      <div className={inter.variable} style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <Component {...pageProps} />
      </div>
    )
  }

  return (
    <SWRConfig value={{ provider: sessionStorageCacheProvider }}>
    <DeviceProvider initialDevice={initialDevice}>
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
        <AntdApp>
          <AppShell loading={loading}>
            <Component {...pageProps} />
          </AppShell>
        </AntdApp>
      </ConfigProvider>
    </AuthProvider>
    </DeviceProvider>
    </SWRConfig>
  )
}

PcApp.getInitialProps = async (appContext: AppContext) => {
  const appProps = await App.getInitialProps(appContext)
  const req = appContext.ctx.req
  const header = (req?.headers['x-pc-device'] as string) || ''
  let initialDevice: DeviceType = 'desktop'
  if (header === 'mobile' || header === 'tablet') {
    initialDevice = header
  } else {
    const cookie = (req?.headers.cookie || '').match(/pc-device=(mobile|tablet|desktop)/)
    if (cookie) initialDevice = cookie[1] as DeviceType
  }
  return { ...appProps, initialDevice }
}

export default PcApp
