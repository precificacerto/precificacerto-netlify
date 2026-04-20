import Head from 'next/head'
import Image from 'next/image'
import { Button, Form, Input, Alert } from 'antd'
import { PAGE_TITLES } from '@/constants/page-titles'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROUTES } from '@/constants/routes'
import Link from 'next/link'
import type { AuthType } from '@/types/auth.type'

export default function SuperAdminLogin() {
  const { currentUser, loading, login, logout } = useAuth()
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [loadingSubmit, setLoadingSubmit] = useState(false)
  const [notSuperAdmin, setNotSuperAdmin] = useState(false)

  useEffect(() => {
    if (!currentUser || loading) return
    const isSuperAdmin =
      currentUser.is_super_admin ||
      (currentUser.role && String(currentUser.role).toLowerCase() === 'super_admin')
    if (isSuperAdmin) {
      router.replace(ROUTES.SUPER_ADMIN_PANEL)
    } else {
      setNotSuperAdmin(true)
    }
  }, [currentUser, loading, router])

  const onFinish = async (values: AuthType) => {
    const { email, password } = values
    const trimmedEmail = email.trim().toLowerCase()
    setErrorMessage('')
    setNotSuperAdmin(false)
    setLoadingSubmit(true)
    try {
      await login({ email: trimmedEmail, password })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : ''
      if (msg?.includes('Email not confirmed')) {
        setErrorMessage('Email ainda não foi verificado. Confira sua caixa de entrada.')
      } else {
        setErrorMessage('Email ou senha incorretos.')
      }
    } finally {
      setLoadingSubmit(false)
    }
  }

  return (
    <>
      <Head>
        <title>{PAGE_TITLES.SUPER_ADMIN_LOGIN} | Precifica Certo</title>
        <meta name="description" content="Acesso restrito ao painel Super Admin" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="auth-page super-admin-auth">
        <div className="auth-page-glow auth-page-glow--tl super-admin-glow" />
        <div className="auth-page-glow auth-page-glow--br super-admin-glow" />

        <div className="auth-page-logo">
          <Image
            src="/logo-dark.svg"
            alt="Precifica Certo"
            width={200}
            height={130}
            priority
            sizes="(max-width: 640px) 150px, 200px"
            style={{ width: '100%', height: 'auto', maxWidth: 200 }}
          />
        </div>

        <section className="auth-card">
          <h1 className="auth-card-title">Painel Super Admin</h1>
          <p className="auth-card-subtitle">Acesso restrito a super administradores</p>

          {notSuperAdmin && (
            <Alert
              message="Acesso negado"
              description="Apenas super administradores podem acessar este painel. Use o login normal para acessar sua conta."
              type="warning"
              showIcon
              style={{ marginBottom: 20 }}
              action={
                <Button size="small" onClick={() => logout().then(() => setNotSuperAdmin(false))}>
                  Sair e tentar outro
                </Button>
              }
            />
          )}

          <Form
            name="super-admin-login"
            initialValues={{ remember: true }}
            onFinish={onFinish}
            autoComplete="off"
            onChange={() => setErrorMessage('')}
            layout="vertical"
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Informe seu email' },
                { type: 'email', message: 'Email inválido' },
              ]}
            >
              <Input placeholder="seu@email.com" />
            </Form.Item>

            <Form.Item
              label="Senha"
              name="password"
              rules={[{ required: true, message: 'Informe sua senha' }]}
            >
              <Input.Password placeholder="Sua senha" />
            </Form.Item>

            {errorMessage && (
              <Alert
                message={errorMessage}
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Button
              htmlType="submit"
              type="primary"
              loading={loadingSubmit}
              block
              size="large"
              className="super-admin-submit"
              style={{ marginBottom: 16 }}
            >
              Entrar no painel
            </Button>
          </Form>

          <div className="auth-card-divider">
            <span>Não é super admin?{' '}</span>
            <Link href={ROUTES.LOGIN}>Fazer login normal</Link>
          </div>
        </section>

        <p className="auth-footer-text">
          © {new Date().getFullYear()} Precifica Certo. Acesso restrito.
        </p>
      </main>

      <style jsx>{`
        .auth-card-divider {
          text-align: center;
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 14px;
          color: #94a3b8;
        }
        .auth-card-divider :global(a) {
          font-weight: 600;
          color: #4f46e5;
        }
      `}</style>

      <style jsx global>{`
        /* Tint indigo apenas neste super-admin */
        .super-admin-auth {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
        }
        .super-admin-glow--tl,
        .super-admin-auth .auth-page-glow--tl {
          background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
        }
        .super-admin-glow--br,
        .super-admin-auth .auth-page-glow--br {
          background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%);
        }
        .super-admin-auth .ant-btn-primary.super-admin-submit {
          background: #4f46e5 !important;
          border-color: #4f46e5 !important;
        }
        .super-admin-auth .ant-btn-primary.super-admin-submit:hover {
          background: #4338ca !important;
          border-color: #4338ca !important;
        }
      `}</style>
    </>
  )
}
