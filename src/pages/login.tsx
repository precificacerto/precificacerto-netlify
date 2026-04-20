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
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="login-main">
        {/* Branding panel — full-width banner on mobile, 50% left panel on desktop */}
        <div className="login-brand">
          <div className="login-brand-glow login-brand-glow--tl" />
          <div className="login-brand-glow login-brand-glow--br" />

          <div className="login-brand-content">
            <div className="login-brand-logo">
              <Image
                src="/logo-dark.svg"
                alt="Precifica Certo"
                width={260}
                height={170}
                priority
                sizes="(max-width: 640px) 160px, 260px"
                style={{ width: '100%', height: 'auto', maxWidth: 260 }}
              />
            </div>
            <h2 className="login-brand-title">
              Precifique com precisão,<br />lucre com inteligência
            </h2>
            <p className="login-brand-subtitle">
              A plataforma completa para gestão e precificação do seu negócio
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div className="login-panel">
          <section className="login-card">
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

            <h1 className="login-card-title">Bem-vindo de volta</h1>
            <p className="login-card-subtitle">
              Entre com suas credenciais para acessar a plataforma
            </p>

            <SignInWithEmailPassword />
          </section>

          <p className="login-footer">
            © {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.
          </p>
        </div>
      </main>

      <style jsx>{`
        .login-main {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          min-height: 100dvh;
          background: #0a1628;
        }

        /* ========== BRAND PANEL (mobile-first: compact top banner) ========== */
        .login-brand {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          background: linear-gradient(160deg, #0a1628 0%, #0f2318 50%, #0a1628 100%);
          padding: 32px 20px 20px;
          overflow: hidden;
        }

        .login-brand-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          display: none;
        }

        .login-brand-glow--tl {
          top: -15%;
          left: -10%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(34, 197, 94, 0.08) 0%, transparent 70%);
        }

        .login-brand-glow--br {
          bottom: -10%;
          right: -5%;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%);
        }

        .login-brand-content {
          position: relative;
          z-index: 1;
          text-align: center;
          max-width: 420px;
        }

        .login-brand-logo {
          display: inline-flex;
          width: 160px;
          height: auto;
        }

        .login-brand-title {
          font-size: 18px;
          font-weight: 700;
          color: #f1f5f9;
          margin-top: 12px;
          margin-bottom: 4px;
          line-height: 1.3;
        }

        .login-brand-subtitle {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0 auto;
          max-width: 340px;
        }

        /* ========== FORM PANEL (mobile-first: full width) ========== */
        .login-panel {
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: center;
          padding: 20px 16px 32px;
          background: #0a1628;
        }

        .login-card {
          width: 100%;
          max-width: 440px;
          background: #111c2e;
          border-radius: 16px;
          padding: 24px 20px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .login-card-title {
          font-size: 22px;
          font-weight: 700;
          color: #f1f5f9;
          margin: 0 0 4px;
          text-align: center;
        }

        .login-card-subtitle {
          font-size: 13px;
          color: #94a3b8;
          margin: 0 0 24px;
          text-align: center;
        }

        .login-footer {
          margin-top: 20px;
          font-size: 12px;
          color: #64748b;
          text-align: center;
          padding: 0 16px;
        }

        /* ========== TABLET (>= 640px): mais respiro ========== */
        @media (min-width: 640px) {
          .login-brand {
            padding: 48px 32px 32px;
          }
          .login-brand-logo {
            width: 200px;
          }
          .login-brand-title {
            font-size: 22px;
          }
          .login-brand-subtitle {
            font-size: 14px;
          }
          .login-card {
            padding: 32px 28px;
          }
          .login-card-title {
            font-size: 24px;
          }
          .login-panel {
            padding: 24px 24px 32px;
            justify-content: center;
          }
        }

        /* ========== DESKTOP (>= 1024px): split 50/50 ========== */
        @media (min-width: 1024px) {
          .login-main {
            flex-direction: row;
          }

          .login-brand {
            flex: 1 1 50%;
            padding: 48px;
            justify-content: center;
            align-items: center;
          }
          .login-brand-glow {
            display: block;
          }
          .login-brand-content {
            max-width: none;
          }
          .login-brand-logo {
            width: 260px;
          }
          .login-brand-title {
            font-size: 28px;
            margin-top: 32px;
            margin-bottom: 12px;
          }
          .login-brand-subtitle {
            font-size: 16px;
            line-height: 1.6;
            max-width: 380px;
          }

          .login-panel {
            flex: 1 1 50%;
            padding: 48px 32px;
            justify-content: center;
            align-items: center;
          }
          .login-card {
            max-width: 420px;
            padding: 40px 32px;
          }
          .login-card-title {
            font-size: 24px;
          }
          .login-card-subtitle {
            font-size: 14px;
            margin-bottom: 32px;
          }
        }
      `}</style>

      {/* Global overrides: Ant Design sizing no form de login (touch-friendly 48px em mobile) */}
      <style jsx global>{`
        .login-card .ant-form-item {
          margin-bottom: 18px;
        }
        .login-card .ant-input,
        .login-card .ant-input-affix-wrapper,
        .login-card .ant-input-password {
          min-height: 48px;
          font-size: 16px; /* Evita zoom no iOS ao focar input */
        }
        .login-card .ant-input-affix-wrapper > .ant-input {
          font-size: 16px;
          min-height: auto;
        }
        .login-card .ant-btn {
          min-height: 48px;
          font-size: 15px;
          font-weight: 600;
        }
        .login-card .ant-form-item-label > label {
          font-size: 14px;
        }

        @media (min-width: 1024px) {
          .login-card .ant-input,
          .login-card .ant-input-affix-wrapper,
          .login-card .ant-input-password {
            min-height: 44px;
          }
          .login-card .ant-btn {
            min-height: 44px;
          }
        }
      `}</style>
    </>
  )
}
