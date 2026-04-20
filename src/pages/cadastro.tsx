import Head from 'next/head'
import Image from 'next/image'
import { useState } from 'react'
import { Button, Form, Input, Alert, Radio, Card } from 'antd'
import { useRouter } from 'next/router'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROUTES } from '@/constants/routes'
import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import Link from 'next/link'
import {
  getPlansByTier,
  formatPrice,
  type RevenueTier,
  type PlanSlug,
  type PlanOption,
} from '@/constants/plans'
import { CheckOutlined, ArrowLeftOutlined, GiftOutlined } from '@ant-design/icons'

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_STRIPE_TRIAL_DAYS) || 7

export default function Cadastro() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [revenueTier, setRevenueTier] = useState<RevenueTier | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()
  const { currentUser } = useAuth()
  const router = useRouter()

  if (currentUser) {
    router.push(getDefaultRouteForUser(currentUser))
    return null
  }

  const plans = revenueTier ? getPlansByTier(revenueTier) : []

  const handleFaturamentoSelect = (tier: RevenueTier) => {
    setRevenueTier(tier)
    setSelectedPlan(null)
    setStep(2)
    setErrorMessage('')
  }

  const handlePlanSelect = (plan: PlanOption) => {
    setSelectedPlan(plan)
    setErrorMessage('')
  }

  const handleVoltarPlanos = () => {
    setStep(2)
    setSelectedPlan(null)
    setErrorMessage('')
  }

  const handleVoltarFaturamento = () => {
    setStep(1)
    setRevenueTier(null)
    setSelectedPlan(null)
    setErrorMessage('')
  }

  const onFinishDados = async (values: { name: string; email: string }) => {
    if (!revenueTier || !selectedPlan) return
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          revenueTier,
          planSlug: selectedPlan.slug as PlanSlug,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMessage(data.error || 'Erro ao criar sessão de pagamento.')
        return
      }
      if (data.url) {
        window.location.href = data.url
        return
      }
      setErrorMessage('Resposta inválida do servidor.')
    } catch (e) {
      setErrorMessage('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const cardSizeClass = step === 2 ? 'auth-card--wide' : ''

  return (
    <>
      <Head>
        <title>Assinar | Precifica Certo</title>
        <meta name="description" content="Assine o Precifica Certo e comece a precificar com precisão" />
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

        <section className={`auth-card ${cardSizeClass}`}>
          {/* Passo 1: Faturamento mensal */}
          {step === 1 && (
            <>
              <h1 className="auth-card-title">Qual seu faturamento mensal?</h1>
              <p className="auth-card-subtitle">
                Com base nisso, exibimos os planos e valores disponíveis para você.
              </p>
              <Radio.Group
                size="large"
                style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <Radio.Button
                  value="ate_200k"
                  onClick={() => handleFaturamentoSelect('ate_200k')}
                  style={{ height: 48, lineHeight: '48px', textAlign: 'center' }}
                >
                  Até R$ 200.000,00
                </Radio.Button>
                <Radio.Button
                  value="acima_200k"
                  onClick={() => handleFaturamentoSelect('acima_200k')}
                  style={{ height: 48, lineHeight: '48px', textAlign: 'center' }}
                >
                  Acima de R$ 200.000,00
                </Radio.Button>
              </Radio.Group>
            </>
          )}

          {/* Passo 2: Escolha do plano */}
          {step === 2 && (
            <>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={handleVoltarFaturamento}
                style={{ marginBottom: 16, padding: 0 }}
              >
                Voltar
              </Button>
              <h1 className="auth-card-title">Escolha seu plano</h1>
              <p className="auth-card-subtitle" style={{ marginBottom: 12 }}>
                {revenueTier === 'ate_200k'
                  ? 'Planos para faturamento até R$ 200.000,00/mês'
                  : 'Planos para faturamento acima de R$ 200.000,00/mês'}
              </p>
              <div className="cadastro-trial-banner">
                <GiftOutlined style={{ color: '#22C55E', fontSize: 18 }} />
                <span>Teste grátis por {TRIAL_DAYS} dias — sem cobrança agora!</span>
              </div>

              <div className="cadastro-plans-grid">
                {plans.map((plan) => (
                  <Card
                    key={plan.slug}
                    hoverable
                    onClick={() => handlePlanSelect(plan)}
                    className="cadastro-plan-card"
                    style={{
                      border:
                        selectedPlan?.slug === plan.slug
                          ? '2px solid #22C55E'
                          : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{plan.name}</div>
                      <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>
                        {plan.description}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#22C55E' }}>
                        {formatPrice(plan.price)}
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>/mês</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        Pagamento recorrente mensal — cancele quando quiser
                      </div>
                      <div style={{ marginTop: 10, textAlign: 'left' }}>
                        {plan.features.slice(0, 5).map((feature) => (
                          <div
                            key={feature}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              color: '#9ca3af',
                              marginBottom: 4,
                            }}
                          >
                            <CheckOutlined style={{ color: '#22C55E', fontSize: 10 }} />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>
                      <Button
                        type={selectedPlan?.slug === plan.slug ? 'primary' : 'default'}
                        size="small"
                        style={{ marginTop: 12 }}
                        icon={selectedPlan?.slug === plan.slug ? <CheckOutlined /> : undefined}
                      >
                        {selectedPlan?.slug === plan.slug ? 'Selecionado' : 'Selecionar'}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Button
                  type="primary"
                  size="large"
                  disabled={!selectedPlan}
                  onClick={() => selectedPlan && setStep(3)}
                  block
                  className="cadastro-cta"
                >
                  Começar teste grátis{selectedPlan ? ` — ${selectedPlan.name}` : ''}
                </Button>
              </div>
            </>
          )}

          {/* Passo 3: Nome e email → Checkout */}
          {step === 3 && selectedPlan && (
            <>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={handleVoltarPlanos}
                style={{ marginBottom: 16, padding: 0 }}
              >
                Voltar
              </Button>
              <h1 className="auth-card-title">Comece seu teste grátis</h1>
              <p className="auth-card-subtitle" style={{ marginBottom: 12 }}>
                Plano <strong>{selectedPlan.name}</strong> — {formatPrice(selectedPlan.price)}/mês após o período de teste.
              </p>
              <div className="cadastro-trial-banner" style={{ marginBottom: 24 }}>
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <p style={{ fontSize: 14, color: '#4ade80', margin: 0, fontWeight: 600 }}>
                    {TRIAL_DAYS} dias grátis para testar a plataforma
                  </p>
                  <p style={{ fontSize: 12, color: '#86efac', margin: '4px 0 0' }}>
                    Cadastre seu cartão para começar. Você só será cobrado após {TRIAL_DAYS} dias.
                  </p>
                </div>
              </div>
              <Form
                form={form}
                name="dados-checkout"
                onFinish={onFinishDados}
                layout="vertical"
                autoComplete="off"
                onChange={() => setErrorMessage('')}
              >
                <Form.Item
                  label="Nome"
                  name="name"
                  rules={[{ required: true, message: 'Informe seu nome' }]}
                >
                  <Input placeholder="Seu nome completo" />
                </Form.Item>
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
                  loading={loading}
                  block
                  size="large"
                  style={{ marginBottom: 16 }}
                >
                  Iniciar teste grátis de {TRIAL_DAYS} dias
                </Button>
              </Form>
            </>
          )}

          {step !== 3 && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <span style={{ fontSize: '14px', color: '#94a3b8' }}>Já tem uma conta? </span>
              <Link href={ROUTES.LOGIN} style={{ fontSize: '14px', fontWeight: 600 }}>
                Faça login
              </Link>
            </div>
          )}
        </section>

        <p className="auth-footer-text">
          © {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.
        </p>
      </main>

      <style jsx>{`
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

        .cadastro-plans-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        @media (min-width: 520px) {
          .cadastro-plans-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
        }

        @media (min-width: 900px) {
          .cadastro-plans-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>

      <style jsx global>{`
        .cadastro-plan-card {
          width: 100% !important;
        }
        .cadastro-plan-card .ant-card-body {
          padding: 16px !important;
        }
      `}</style>
    </>
  )
}
