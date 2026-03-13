import Head from 'next/head'
import Image from 'next/image'
import { useState } from 'react'
import { Button, Alert, Radio, Card, Spin } from 'antd'
import { useAuth } from '@/hooks/use-auth.hook'
import {
  getPlansByTier,
  formatPrice,
  type RevenueTier,
  type PlanSlug,
  type PlanOption,
} from '@/constants/plans'
import { CheckOutlined, ArrowLeftOutlined, GiftOutlined } from '@ant-design/icons'

const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_STRIPE_TRIAL_DAYS) || 7

export default function Assinar() {
  const { currentUser } = useAuth()
  const [step, setStep] = useState<1 | 2>(1)
  const [revenueTier, setRevenueTier] = useState<RevenueTier | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
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

  const handleVoltarFaturamento = () => {
    setStep(1)
    setRevenueTier(null)
    setSelectedPlan(null)
    setErrorMessage('')
  }

  const handleCheckout = async () => {
    if (!revenueTier || !selectedPlan) return
    setLoading(true)
    setErrorMessage('')
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentUser.name || currentUser.email,
          email: currentUser.email,
          revenueTier,
          planSlug: selectedPlan.slug as PlanSlug,
          tenantId: currentUser.tenant_id,
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
    } catch {
      setErrorMessage('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const maxWidth = step === 2 ? 720 : 420

  return (
    <>
      <Head>
        <title>Escolher plano | Precifica Certo</title>
        <meta name="description" content="Escolha seu plano para acessar o Precifica Certo" />
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
            maxWidth,
            background: '#111c2e',
            borderRadius: '16px',
            padding: '40px 32px',
            boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {step === 1 && (
            <>
              <h1
                style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px', textAlign: 'center' }}
              >
                Qual seu faturamento mensal?
              </h1>
              <p
                style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '24px', textAlign: 'center' }}
              >
                Para acessar a plataforma, escolha um plano de assinatura.
              </p>
              <Radio.Group size="large" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <h1
                style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px', textAlign: 'center' }}
              >
                Escolha seu plano
              </h1>
              <p
                style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '12px', textAlign: 'center' }}
              >
                {revenueTier === 'ate_200k'
                  ? 'Planos para faturamento até R$ 200.000,00/mês'
                  : 'Planos para faturamento acima de R$ 200.000,00/mês'}
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: 8,
                  padding: '10px 16px',
                  marginBottom: '24px',
                }}
              >
                <GiftOutlined style={{ color: '#22C55E', fontSize: 18 }} />
                <span style={{ fontSize: 14, color: '#4ade80', fontWeight: 600 }}>
                  Teste grátis por {TRIAL_DAYS} dias — sem cobrança agora!
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                {plans.map((plan) => (
                  <Card
                    key={plan.slug}
                    hoverable
                    onClick={() => handlePlanSelect(plan)}
                    style={{
                      width: 200,
                      border: selectedPlan?.slug === plan.slug ? '2px solid #22C55E' : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{plan.name}</div>
                      <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>{plan.description}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#22C55E' }}>
                        {formatPrice(plan.price)}
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>/mês</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        Pagamento recorrente mensal — cancele quando quiser
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          textAlign: 'left',
                        }}
                      >
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
              {errorMessage && (
                <Alert message={errorMessage} type="error" showIcon style={{ marginTop: 16 }} />
              )}
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Button
                  type="primary"
                  size="large"
                  disabled={!selectedPlan}
                  loading={loading}
                  onClick={handleCheckout}
                >
                  Iniciar teste grátis de {TRIAL_DAYS} dias
                </Button>
              </div>
            </>
          )}
        </section>

        <p
          style={{ marginTop: '24px', fontSize: '12px', color: '#64748b', position: 'relative', zIndex: 1 }}
        >
          © {new Date().getFullYear()} Precifica Certo. Todos os direitos reservados.
        </p>
      </main>
    </>
  )
}
