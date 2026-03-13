import Head from 'next/head'
import Image from 'next/image'
import { Button } from 'antd'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { ROUTES } from '@/constants/routes'
import { CheckCircleOutlined } from '@ant-design/icons'

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_STRIPE_TRIAL_DAYS) || 7

// Evita chamar confirm mais de uma vez por session_id (mesmo com remount/Strict Mode).
const confirmedSessionIds = new Set<string>()

export default function CadastroSucesso() {
  const router = useRouter()

  useEffect(() => {
    const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : null
    if (!sessionId) return
    if (confirmedSessionIds.has(sessionId)) return
    confirmedSessionIds.add(sessionId)

    let cancelled = false
    const confirm = async () => {
      try {
        const res = await fetch('/api/stripe/confirm-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        if (cancelled) return
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          console.error('Erro ao confirmar sessão Stripe:', data?.error)
        }
      } catch (err) {
        if (!cancelled) console.error('Erro ao chamar confirm-checkout-session:', err)
      }
    }

    void confirm()
    return () => { cancelled = true }
  }, [router.query.session_id])

  return (
    <>
      <Head>
        <title>Cadastro confirmado | Precifica Certo</title>
        <meta name="description" content="Seu cadastro foi confirmado. Verifique seu e-mail para acessar a plataforma." />
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
            maxWidth: 420,
            background: '#111c2e',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0px 4px 24px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22C55E 0%, #00A35E 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}
            >
              <CheckCircleOutlined style={{ fontSize: 32, color: '#FFFFFF' }} />
            </div>
            <h1
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: '#f1f5f9',
                marginBottom: '8px',
              }}
            >
              Teste gratuito ativado!
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: '#94a3b8',
                marginBottom: '16px',
                lineHeight: 1.6,
              }}
            >
              Seu período de teste de <strong>{TRIAL_DAYS} dias</strong> começou agora.
              Você não será cobrado durante este período.
            </p>
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: '16px',
              }}
            >
              <p style={{ fontSize: '13px', color: '#86efac', margin: 0, lineHeight: 1.5 }}>
                Após {TRIAL_DAYS} dias, o plano selecionado será cobrado automaticamente no cartão cadastrado.
              </p>
            </div>
            <p
              style={{
                fontSize: '14px',
                color: '#94a3b8',
                marginBottom: '24px',
                lineHeight: 1.6,
              }}
            >
              <strong>Próximo passo:</strong> abra seu e-mail e use o link que enviamos para definir sua senha e acessar a plataforma.
            </p>
            <p
              style={{
                fontSize: '13px',
                color: '#98A2B3',
                marginBottom: '24px',
                lineHeight: 1.5,
              }}
            >
              Depois de definir a senha, você fará o cadastro da empresa (onboarding) e poderá usar o sistema.
            </p>
            <Link href={ROUTES.LOGIN}>
              <Button type="primary" block size="large">
                Ir para o Login
              </Button>
            </Link>
          </div>
        </section>

        <p
          style={{
            marginTop: '24px',
            fontSize: '12px',
            color: '#98A2B3',
            position: 'relative',
            zIndex: 1,
          }}
        >
          © {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.
        </p>
      </main>
    </>
  )
}
