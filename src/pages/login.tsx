import Head from 'next/head'
import Image from 'next/image'
import SignInWithEmailPassword from '@/components/sign-in-with-email-password/sign-in-with-email-password.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROUTES } from '@/constants/routes'
import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import { Alert } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'

export default function Login() {
  const { currentUser, loading, refreshUser } = useAuth()
  const router = useRouter()
  const retriedRef = useRef(false)

  const showPasswordResetSuccess = router.query.password_reset === 'true'

  useEffect(() => {
    if (!currentUser) return

    const isSuperAdmin =
      currentUser.is_super_admin ||
      (currentUser.role && String(currentUser.role).toLowerCase() === 'super_admin')

    const tenantStatus = currentUser.planStatus
    const isTenantBlocked = tenantStatus === 'SUSPENDED' || tenantStatus === 'CANCELLED'
    const isUserInactive = currentUser.isActive === false

    // Se a conta estiver bloqueada, não redireciona para dentro do app;
    // o AuthGuard já cuida de mandar para /acesso-bloqueado quando tentar navegar.
    if (!isSuperAdmin && (isTenantBlocked || isUserInactive)) {
      return
    }

    const redirect = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : null
    let target: string

    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      target = redirect
    } else {
      target = getDefaultRouteForUser(currentUser)
    }

    router.push(target)
  }, [currentUser, router])

  useEffect(() => {
    if (loading || currentUser || retriedRef.current) return
    retriedRef.current = true
    let cancelled = false
    refreshUser().then((profile) => {
      if (!cancelled && profile) {
        const isSuperAdmin =
          profile.is_super_admin ||
          (profile.role && String(profile.role).toLowerCase() === 'super_admin')
        const tenantStatus = profile.planStatus
        const isTenantBlocked = tenantStatus === 'SUSPENDED' || tenantStatus === 'CANCELLED'
        const isUserInactive = profile.isActive === false

        if (!isSuperAdmin && (isTenantBlocked || isUserInactive)) {
          // Mantém usuário na tela de login; AuthGuard bloqueia navegação interna.
          return
        }

        const target = getDefaultRouteForUser(profile)
        router.push(target)
      }
    })
    return () => { cancelled = true }
  }, [loading, currentUser, refreshUser, router])

  return (
    <>
      <Head>
        <title>{PAGE_TITLES.LOGIN} | Precifica Certo</title>
        <meta name="description" content="Faça login na sua conta Precifica Certo - Plataforma de gestão e precificação inteligente" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        style={{
          display: 'flex',
          minHeight: '100vh',
        }}
      >
        {/* Left panel — dark branded */}
        <div
          style={{
            flex: '1 1 50%',
            background: 'linear-gradient(160deg, #0a1628 0%, #0f2318 50%, #0a1628 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '48px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-15%',
            left: '-10%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-10%',
            right: '-5%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <Image
              src="/logo-dark.svg"
              alt="Precifica Certo"
              width={260}
              height={170}
              priority
            />
            <h2 style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#f1f5f9',
              marginTop: '32px',
              marginBottom: '12px',
              lineHeight: 1.3,
            }}>
              Precifique com precisão,<br />lucre com inteligência
            </h2>
            <p style={{
              fontSize: '16px',
              color: '#94a3b8',
              maxWidth: '380px',
              lineHeight: 1.6,
            }}>
              A plataforma completa para gestão e precificação do seu negócio
            </p>
          </div>
        </div>

        {/* Right panel — form on dark card */}
        <div
          style={{
            flex: '1 1 50%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '48px 32px',
            background: '#0a1628',
          }}
        >
          <section
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#111c2e',
              borderRadius: '16px',
              padding: '40px 32px',
              boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            {showPasswordResetSuccess && (
              <Alert
                message="Senha definida com sucesso!"
                description="Faça login com sua nova senha para continuar."
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginBottom: 24, borderRadius: 8 }}
              />
            )}

            <h1 style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#f1f5f9',
              marginBottom: '4px',
              textAlign: 'center',
            }}>
              Bem-vindo de volta
            </h1>
            <p style={{
              fontSize: '14px',
              color: '#94a3b8',
              marginBottom: '32px',
              textAlign: 'center',
            }}>
              Entre com suas credenciais para acessar a plataforma
            </p>

            <SignInWithEmailPassword />
          </section>

          <p style={{
            marginTop: '24px',
            fontSize: '12px',
            color: '#64748b',
          }}>
            © {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.
          </p>
        </div>
      </main>
    </>
  )
}
