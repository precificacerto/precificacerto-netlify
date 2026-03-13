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

  // Após login: se for super_admin, redireciona para o painel
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          padding: '16px',
        }}
      >
        <div
          style={{
            position: 'fixed',
            top: '-20%',
            right: '-10%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'fixed',
            bottom: '-15%',
            left: '-5%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ marginBottom: '32px', position: 'relative', zIndex: 1 }}>
          <Image
            src="/logo-dark.svg"
            alt="Precifica Certo"
            width={200}
            height={130}
            priority
          />
        </div>

        <section
          style={{
            width: '100%',
            maxWidth: '420px',
            background: 'rgba(255, 255, 255, 0.98)',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: '#f1f5f9',
              marginBottom: '4px',
              textAlign: 'center',
            }}
          >
            Painel Super Admin
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#64748b',
              marginBottom: '32px',
              textAlign: 'center',
            }}
          >
            Acesso restrito a super administradores
          </p>

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
            onChange={() => {
              setErrorMessage('')
            }}
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
              style={{ marginBottom: 16, background: '#4f46e5' }}
            >
              Entrar no painel
            </Button>
          </Form>

          <div
            style={{
              textAlign: 'center',
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <span style={{ fontSize: '14px', color: '#64748b' }}>
              Não é super admin?{' '}
            </span>
            <Link href={ROUTES.LOGIN} style={{ fontSize: '14px', fontWeight: 600 }}>
              Fazer login normal
            </Link>
          </div>
        </section>

        <p
          style={{
            marginTop: '24px',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.6)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          © {new Date().getFullYear()} Precifica Certo. Acesso restrito.
        </p>
      </main>
    </>
  )
}
