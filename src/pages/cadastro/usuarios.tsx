import Head from 'next/head'
import Image from 'next/image'
import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { Button, Alert, Spin } from 'antd'
import { MinusOutlined, PlusOutlined, GiftOutlined, CheckOutlined } from '@ant-design/icons'
import { useAuth } from '@/hooks/use-auth.hook'
import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import { formatPrice } from '@/constants/plans'
import {
  getSignupPlanByUsers,
  signupPlanRangeLabel,
  clampSignupUsers,
  MIN_SIGNUP_USERS,
  MAX_SIGNUP_USERS,
} from '@/constants/signup-plans'

/**
 * Etapa 2 do novo fluxo de cadastro (Escopo 13/08/2026): o usuário (já autenticado
 * na Etapa 1, tenant em PENDING_PAYMENT) escolhe a QUANTIDADE de usuários (1..30).
 * O plano é derivado automaticamente da faixa e o botão abre o Stripe Checkout.
 *
 * O tenant permanece PENDING_PAYMENT até o webhook confirmar o checkout — quem
 * vira TRIAL é o webhook, não esta tela.
 */

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_STRIPE_TRIAL_DAYS) || 7
const ETAPA1_ROUTE = '/cadastro/credenciais'

export default function CadastroUsuarios() {
  const [qtd, setQtd] = useState<number>(MIN_SIGNUP_USERS)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { currentUser, loading: authLoading } = useAuth()
  const router = useRouter()

  // Guarda de sessão própria (a rota é pública para o AuthGuard).
  useEffect(() => {
    if (authLoading) return
    if (!currentUser) {
      router.replace(ETAPA1_ROUTE)
    } else if (currentUser.planStatus && currentUser.planStatus !== 'PENDING_PAYMENT') {
      // Conta já ativa/trial não precisa desta etapa.
      router.replace(getDefaultRouteForUser(currentUser))
    }
  }, [authLoading, currentUser, router])

  const plan = useMemo(() => getSignupPlanByUsers(qtd), [qtd])

  const dec = () => setQtd((n) => clampSignupUsers(n - 1))
  const inc = () => setQtd((n) => clampSignupUsers(n + 1))

  const onCheckout = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qtd_usuarios: qtd }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMessage(data.error || 'Erro ao criar a sessão de pagamento.')
        return
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      setErrorMessage('Resposta inválida do servidor.')
    } catch {
      setErrorMessage('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Enquanto resolve a sessão / decide redirecionamento, mostra um spinner.
  if (authLoading || !currentUser || (currentUser.planStatus && currentUser.planStatus !== 'PENDING_PAYMENT')) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0a1628' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Quantos usuários? | Precifica Certo</title>
        <meta name="description" content="Escolha a quantidade de usuários e comece seu teste grátis" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="auth-page">
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
          <h1 className="auth-card-title">Quantas pessoas vão usar?</h1>

          {/* Indicador de etapas (1. Seus dados · 2. Usuários · 3. Acesso) */}
          <div className="signup-steps" aria-hidden>
            <span className="signup-step done" />
            <span className="signup-step on" />
            <span className="signup-step" />
          </div>
          <div className="signup-steps-lbl">
            <span>1. Seus dados</span>
            <strong>2. Usuários</strong>
            <span>3. Acesso</span>
          </div>

          <p className="auth-card-subtitle" style={{ marginBottom: 20 }}>
            Escolha quantos usuários terão acesso. O plano é ajustado automaticamente.
          </p>

          {/* Contador +/- */}
          <div className="qty-counter">
            <Button
              shape="circle"
              size="large"
              icon={<MinusOutlined />}
              onClick={dec}
              disabled={qtd <= MIN_SIGNUP_USERS}
              aria-label="Diminuir"
            />
            <div className="qty-value">
              <span className="qty-number">{qtd}</span>
              <span className="qty-label">{qtd === 1 ? 'usuário' : 'usuários'}</span>
            </div>
            <Button
              shape="circle"
              size="large"
              icon={<PlusOutlined />}
              onClick={inc}
              disabled={qtd >= MAX_SIGNUP_USERS}
              aria-label="Aumentar"
            />
          </div>

          {/* Plano derivado da faixa */}
          <div className="qty-plan">
            <div className="qty-plan-head">
              <span className="qty-plan-name">Plano {plan.name}</span>
              <span className="qty-plan-range">{signupPlanRangeLabel(plan)}</span>
            </div>
            <div className="qty-plan-price">
              {formatPrice(plan.price)}
              <span className="qty-plan-per">/mês após o teste</span>
            </div>
          </div>

          <div className="cadastro-trial-banner">
            <GiftOutlined style={{ color: '#22C55E', fontSize: 18 }} />
            <span>{TRIAL_DAYS} dias grátis — você só é cobrado depois</span>
          </div>

          {errorMessage && <Alert message={errorMessage} type="error" showIcon style={{ marginBottom: 16 }} />}

          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={onCheckout}
            icon={<CheckOutlined />}
          >
            Começar grátis agora
          </Button>
          <p className="signup-after">Próximo passo: cadastrar o cartão no ambiente seguro do Stripe.</p>
        </section>

        <p className="auth-footer-text">© {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.</p>
      </main>

      <style jsx>{`
        .signup-steps {
          display: flex;
          gap: 7px;
          margin-bottom: 9px;
        }
        .signup-step {
          flex: 1;
          height: 3px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.12);
        }
        .signup-step.on,
        .signup-step.done {
          background: #22c55e;
        }
        .signup-step.on {
          opacity: 1;
        }
        .signup-step.done {
          opacity: 0.55;
        }
        .signup-steps-lbl {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 24px;
        }
        .signup-steps-lbl strong {
          color: #e2e8f0;
          font-weight: 600;
        }
        .qty-counter {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 28px;
          margin-bottom: 20px;
        }
        .qty-value {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 92px;
        }
        .qty-number {
          font-size: 44px;
          font-weight: 700;
          line-height: 1;
          color: #f1f5f9;
        }
        .qty-label {
          font-size: 13px;
          color: #94a3b8;
          margin-top: 4px;
        }
        .qty-plan {
          border: 1px solid rgba(34, 197, 94, 0.35);
          background: rgba(34, 197, 94, 0.06);
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 16px;
        }
        .qty-plan-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .qty-plan-name {
          font-size: 16px;
          font-weight: 700;
          color: #f1f5f9;
        }
        .qty-plan-range {
          font-size: 12px;
          color: #94a3b8;
        }
        .qty-plan-price {
          font-size: 24px;
          font-weight: 700;
          color: #22c55e;
        }
        .qty-plan-per {
          font-size: 12px;
          font-weight: 400;
          color: #64748b;
          margin-left: 6px;
        }
        .cadastro-trial-banner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 20px;
          flex-wrap: wrap;
          text-align: center;
        }
        .cadastro-trial-banner span {
          font-size: 13px;
          color: #4ade80;
          font-weight: 600;
        }
        .signup-after {
          text-align: center;
          font-size: 12.5px;
          color: #94a3b8;
          margin-top: 12px;
        }
      `}</style>
    </>
  )
}
