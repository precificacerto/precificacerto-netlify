import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import { Form, Input, Button, Alert, Spin, Result } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROUTES } from '@/constants/routes'
import { PAGE_TITLES } from '@/constants/page-titles'
import ResetPasswordWithEmail from '@/components/reset-password-with-email/reset-password-with-email'
import Link from 'next/link'

const RECOVERY_FLAG = 'pc-recovery-mode'

type PageView = 'loading' | 'recovery' | 'expired' | 'request'

function parseHashParams(hash: string): Record<string, string> {
  if (!hash || hash.length < 2) return {}
  const params: Record<string, string> = {}
  const str = hash.startsWith('#') ? hash.slice(1) : hash
  str.split('&').forEach(pair => {
    const [k, ...rest] = pair.split('=')
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(rest.join('=') || '')
  })
  return params
}

export default function ResetPassword() {
  const { currentUser } = useAuth()
  const router = useRouter()
  const [view, setView] = useState<PageView>('loading')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const recoveryRef = useRef(false)

  const markRecovery = useCallback((email?: string) => {
    recoveryRef.current = true
    setView('recovery')
    if (email) setUserEmail(email)
    try { sessionStorage.setItem(RECOVERY_FLAG, '1') } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash || ''
    const hp = parseHashParams(hash)

    if (hp.error || hp.error_code) {
      const desc = hp.error_description?.replace(/\+/g, ' ') || ''
      const isExpired = hp.error_code === 'otp_expired' ||
        desc.toLowerCase().includes('expired') ||
        desc.toLowerCase().includes('invalid')

      if (isExpired) {
        setLinkError('O link expirou ou já foi utilizado. Solicite um novo link abaixo.')
      } else {
        setLinkError(desc || 'Erro ao processar o link. Solicite um novo link abaixo.')
      }
      setView('expired')
      return
    }

    if (hash.includes('type=recovery') || hash.includes('type=invite')) {
      markRecovery()
    }

    try {
      if (sessionStorage.getItem(RECOVERY_FLAG) === '1') {
        markRecovery()
      }
    } catch {}

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setUserEmail(session.user.email)
        if (hash.includes('access_token') || recoveryRef.current) {
          markRecovery(session.user.email)
        }
      }
      if (!recoveryRef.current && view === 'loading') {
        setView('request')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markRecovery])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        markRecovery(session?.user?.email ?? undefined)
      }
      if (
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
        session?.user?.email
      ) {
        setUserEmail(session.user.email)
        const h = typeof window !== 'undefined' ? window.location.hash || '' : ''
        if (h.includes('type=recovery') || h.includes('type=invite')) {
          markRecovery(session.user.email)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [markRecovery])

  useEffect(() => {
    if (view === 'loading' || view === 'recovery') return
    if (currentUser && !recoveryRef.current) {
      router.push(ROUTES.DASHBOARD)
    }
  }, [currentUser, view, router])

  const handlePasswordResetSuccess = useCallback(async () => {
    try { sessionStorage.removeItem(RECOVERY_FLAG) } catch {}
    await supabase.auth.signOut()
    router.push(`${ROUTES.LOGIN}?password_reset=true`)
  }, [router])

  const renderContent = () => {
    if (view === 'loading') {
      return <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /></div>
    }

    if (view === 'expired') {
      return (
        <>
          <Result
            status="warning"
            title="Link expirado"
            subTitle={linkError}
            style={{ padding: '0 0 16px' }}
          />
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 24 }}>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16, textAlign: 'center' }}>
              Informe seu email para receber um novo link:
            </p>
            <ResetPasswordWithEmail />
          </div>
        </>
      )
    }

    if (view === 'recovery') {
      return <RecoveryForm email={userEmail} onSuccess={handlePasswordResetSuccess} />
    }

    return (
      <>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px', textAlign: 'center' }}>
          Recuperar senha
        </h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '32px', textAlign: 'center' }}>
          Informe seu email e enviaremos um link para redefinir sua senha
        </p>
        <ResetPasswordWithEmail />
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{PAGE_TITLES.RESET_PASSWORD} | Precifica Certo</title>
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
          background: 'linear-gradient(135deg, #0a1628 0%, rgba(34, 197, 94, 0.1) 50%, #0a1628 100%)',
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
            background: 'radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%)',
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
            background: 'radial-gradient(circle, rgba(34, 197, 94, 0.05) 0%, transparent 70%)',
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
            background: '#111c2e',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.08), 0px 1px 3px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(255,255,255,0.06)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {renderContent()}

          <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <Link href={ROUTES.LOGIN} style={{ fontSize: '14px', color: '#94a3b8' }}>
              Voltar ao login
            </Link>
          </div>
        </section>

        <p style={{ marginTop: '24px', fontSize: '12px', color: '#64748b', position: 'relative', zIndex: 1 }}>
          © {new Date().getFullYear()} Precifica Certo
        </p>
      </main>
    </>
  )
}

function RecoveryForm({ email, onSuccess }: { email: string | null; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFinish = async (values: { password: string; confirmPassword: string }) => {
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: values.password })
      if (err) throw err
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao redefinir senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px', textAlign: 'center' }}>
        Definir senha
      </h1>
      <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px', textAlign: 'center' }}>
        Crie uma senha para acessar sua conta
      </p>

      <Form
        name="recovery"
        layout="vertical"
        onFinish={onFinish}
        autoComplete="off"
        onChange={() => setError(null)}
      >
        {email && (
          <Form.Item label="Email" style={{ marginBottom: 16 }}>
            <Input
              value={email}
              disabled
              prefix={<MailOutlined style={{ color: '#64748b' }} />}
              style={{ background: '#0a1628', color: '#e2e8f0', fontWeight: 500 }}
            />
          </Form.Item>
        )}

        <Form.Item
          label="Nova senha"
          name="password"
          rules={[
            { required: true, message: 'Informe a nova senha' },
            { min: 6, message: 'A senha deve ter pelo menos 6 caracteres' },
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#64748b' }} />}
            placeholder="Sua nova senha"
          />
        </Form.Item>

        <Form.Item
          label="Confirmar senha"
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Confirme a nova senha' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('As senhas não coincidem'))
              },
            }),
          ]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#64748b' }} />}
            placeholder="Repita a nova senha"
          />
        </Form.Item>

        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />
        )}

        <Button
          htmlType="submit"
          type="primary"
          loading={loading}
          block
          size="large"
          style={{ marginTop: 8 }}
        >
          Definir senha e continuar
        </Button>
      </Form>
    </>
  )
}
