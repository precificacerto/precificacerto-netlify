import Head from 'next/head'
import Image from 'next/image'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import { Form, Input, Button, Alert, Spin, Result } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { supabase } from '@/supabase/client'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import Link from 'next/link'

type PageView = 'loading' | 'set-password' | 'expired'

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

export default function CriarSenha() {
  const router = useRouter()
  const { refreshUser } = useAuth()
  const [view, setView] = useState<PageView>('loading')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const readyRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash || ''
    const hp = parseHashParams(hash)

    if (hp.error || hp.error_code) {
      const desc = hp.error_description?.replace(/\+/g, ' ') || ''
      const isExpired = hp.error_code === 'otp_expired' ||
        desc.toLowerCase().includes('expired') ||
        desc.toLowerCase().includes('invalid')

      setLinkError(
        isExpired
          ? 'O link expirou ou já foi utilizado. Peça ao administrador para enviar um novo convite.'
          : desc || 'Erro ao processar o link. Peça ao administrador para enviar um novo convite.'
      )
      setView('expired')
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setUserEmail(session.user.email)
        readyRef.current = true
        setView('set-password')
      } else if (!readyRef.current) {
        setView('expired')
        setLinkError('Nenhuma sessão encontrada. O link pode ter expirado. Peça ao administrador para enviar um novo convite.')
      }
    })
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user?.email) {
        setUserEmail(session.user.email)
        readyRef.current = true
        setView('set-password')
      }
      if (event === 'SIGNED_IN' && session?.user?.email && !readyRef.current) {
        setUserEmail(session.user.email)
        readyRef.current = true
        setView('set-password')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSuccess = useCallback(async () => {
    const profile = await refreshUser()
    if (profile?.is_super_admin) {
      router.replace(ROUTES.SUPER_ADMIN_PANEL)
      return
    }
    // Só manda para assinatura se o plano não for TRIAL/ACTIVE (ex.: SUSPENDED, CANCELLED).
    // Admin que acabou de pagar (TRIAL/ACTIVE) deve ir para onboarding.
    if (profile && !profile.isFree && profile.planStatus !== 'ACTIVE' && profile.planStatus !== 'TRIAL') {
      router.replace(ROUTES.BILLING)
      return
    }
    // Sem perfil (ex.: ainda não propagou) ou onboarding não concluído → onboarding.
    // Fluxo pós-pagamento: definir senha → onboarding → preencher despesas e usar o sistema.
    if (!profile || !profile.onboardingCompleted) {
      router.replace(ROUTES.ONBOARDING)
      return
    }
    router.replace(ROUTES.DASHBOARD)
  }, [router, refreshUser])

  return (
    <>
      <Head>
        <title>Definir Senha | Precifica Certo</title>
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
          background: '#0a1628',
          padding: '16px',
        }}
      >
        <div style={{ marginBottom: '32px', position: 'relative', zIndex: 1 }}>
          <Image src="/logo-dark.svg" alt="Precifica Certo" width={200} height={130} priority />
        </div>

        <section
          style={{
            width: '100%',
            maxWidth: '420px',
            background: '#111c2e',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {view === 'loading' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin size="large" />
              <p style={{ marginTop: 16, color: '#94a3b8', fontSize: 14 }}>Verificando link...</p>
            </div>
          )}

          {view === 'expired' && (
            <Result
              status="warning"
              title="Link expirado"
              subTitle={linkError}
              extra={
                <Button type="primary" onClick={() => router.push(ROUTES.LOGIN)}>
                  Voltar ao login
                </Button>
              }
              style={{ padding: 0 }}
            />
          )}

          {view === 'set-password' && (
            <SetPasswordForm email={userEmail} onSuccess={handleSuccess} />
          )}

          {view !== 'expired' && (
            <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <Link href={ROUTES.LOGIN} style={{ fontSize: '14px', color: '#94a3b8' }}>
                Voltar ao login
              </Link>
            </div>
          )}
        </section>

        <p style={{ marginTop: '24px', fontSize: '12px', color: '#64748b', position: 'relative', zIndex: 1 }}>
          © {new Date().getFullYear()} Precifica Certo
        </p>
      </main>
    </>
  )
}

function SetPasswordForm({ email, onSuccess }: { email: string | null; onSuccess: () => void }) {
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
      setError(e instanceof Error ? e.message : 'Erro ao definir senha. Tente novamente.')
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

      <Form name="set-password" layout="vertical" onFinish={onFinish} autoComplete="off" onChange={() => setError(null)}>
        {email && (
          <Form.Item label="Email" style={{ marginBottom: 16 }}>
            <Input
              value={email}
              disabled
              prefix={<MailOutlined style={{ color: '#64748b' }} />}
              style={{ background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 500 }}
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
          <Input.Password prefix={<LockOutlined style={{ color: '#64748b' }} />} placeholder="Sua nova senha" />
        </Form.Item>

        <Form.Item
          label="Confirmar senha"
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Confirme a nova senha' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve()
                return Promise.reject(new Error('As senhas não coincidem'))
              },
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined style={{ color: '#64748b' }} />} placeholder="Repita a nova senha" />
        </Form.Item>

        {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

        <Button htmlType="submit" type="primary" loading={loading} block size="large" style={{ marginTop: 8 }}>
          Definir senha e continuar
        </Button>
      </Form>
    </>
  )
}
