import React, { useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Card, Tag, Alert, Spin, message } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { useAuth } from '@/hooks/use-auth.hook'
import {
  CrownOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  CalendarOutlined,
  ArrowRightOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import {
  getPlanBySlug,
  getUpgradeOptions,
  formatPrice,
  type RevenueTier,
  type PlanSlug,
  type PlanOption,
} from '@/constants/plans'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativo', color: 'success' },
  TRIAL: { label: 'Período de teste', color: 'processing' },
  SUSPENDED: { label: 'Suspenso', color: 'error' },
  CANCELLED: { label: 'Cancelado', color: 'error' },
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default function PlanosPage() {
  const { currentUser } = useAuth()
  const router = useRouter()
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const upgradeSuccess = router.query.upgrade === 'success'

  if (!currentUser) {
    return (
      <Layout title="Planos" subtitle="Gerencie seu plano de assinatura">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </Layout>
    )
  }

  const planSlug = currentUser.planSlug as PlanSlug | undefined
  const revenueTier = currentUser.revenueTier as RevenueTier | undefined
  const planStatus = currentUser.planStatus || 'TRIAL'
  const statusInfo = STATUS_MAP[planStatus] || STATUS_MAP.TRIAL

  const currentPlan = planSlug && revenueTier
    ? getPlanBySlug(planSlug, revenueTier)
    : undefined

  const upgradeOptions = planSlug && revenueTier
    ? getUpgradeOptions(planSlug, revenueTier)
    : []

  async function handleUpgrade(targetPlan: PlanOption) {
    if (!currentUser?.tenant_id) return
    setLoadingSlug(targetPlan.slug)
    try {
      const res = await fetch('/api/stripe/create-upgrade-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: currentUser.tenant_id,
          newPlanSlug: targetPlan.slug,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.url) {
        window.location.href = data.url
        return
      }
      throw new Error('Resposta inválida do servidor.')
    } catch (err: any) {
      messageApi.error(err.message || 'Erro ao iniciar upgrade.')
    } finally {
      setLoadingSlug(null)
    }
  }

  const hasNoPlan = !currentPlan && !currentUser.isFree

  return (
    <Layout title="Planos" subtitle="Gerencie seu plano de assinatura">
      {contextHolder}

      {upgradeSuccess && (
        <Alert
          message="Upgrade realizado com sucesso!"
          description="Seu plano foi atualizado. As alterações podem levar alguns instantes para refletir."
          type="success"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      {planStatus === 'SUSPENDED' && (
        <Alert
          message="Assinatura suspensa"
          description="Seu pagamento não foi reconhecido. Regularize sua situação para continuar utilizando a plataforma."
          type="error"
          showIcon
          style={{ marginBottom: 24 }}
          action={
            <Button type="primary" danger onClick={() => router.push('/assinar')}>
              Regularizar pagamento
            </Button>
          }
        />
      )}

      {planStatus === 'CANCELLED' && (
        <Alert
          message="Assinatura cancelada"
          description="Sua assinatura foi cancelada. Escolha um novo plano para voltar a utilizar a plataforma."
          type="error"
          showIcon
          style={{ marginBottom: 24 }}
          action={
            <Button type="primary" onClick={() => router.push('/assinar')}>
              Assinar novo plano
            </Button>
          }
        />
      )}

      {/* Plano Atual */}
      <Card
        style={{
          marginBottom: 32,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.05) 0%, rgba(16, 185, 129, 0.02) 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <CrownOutlined style={{ fontSize: 24, color: '#22C55E' }} />
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                {currentPlan?.name || (currentUser.isFree ? 'Plano Gratuito' : 'Sem plano ativo')}
              </h2>
              <Tag color={statusInfo.color}>{statusInfo.label}</Tag>
            </div>

            {currentPlan && (
              <div style={{ fontSize: 28, fontWeight: 700, color: '#22C55E', marginBottom: 4 }}>
                {formatPrice(currentPlan.price)}
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-neutral-400)' }}>/mês</span>
              </div>
            )}

            {currentUser.isFree && (
              <div style={{ fontSize: 14, color: 'var(--color-neutral-400)', marginBottom: 4 }}>
                Plano gratuito — sem cobrança
              </div>
            )}

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
              {planStatus === 'TRIAL' && currentUser.trialEndsAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-neutral-400)' }}>
                  <CalendarOutlined />
                  <span>Teste grátis até <strong style={{ color: 'var(--color-neutral-200)' }}>{formatDate(currentUser.trialEndsAt)}</strong></span>
                </div>
              )}
              {planStatus === 'ACTIVE' && currentUser.planEndsAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-neutral-400)' }}>
                  <CalendarOutlined />
                  <span>Próxima renovação: <strong style={{ color: 'var(--color-neutral-200)' }}>{formatDate(currentUser.planEndsAt)}</strong></span>
                </div>
              )}
              {revenueTier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-neutral-400)' }}>
                  <RocketOutlined />
                  <span>Faixa: {revenueTier === 'ate_200k' ? 'Até R$ 200k' : 'Acima de R$ 200k'}</span>
                </div>
              )}
            </div>
          </div>

          {currentPlan && (
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-neutral-300)' }}>
                Recursos do seu plano
              </div>
              {currentPlan.features.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6, color: 'var(--color-neutral-400)' }}>
                  <CheckCircleOutlined style={{ color: '#22C55E', fontSize: 14 }} />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Opcoes de Upgrade */}
      {upgradeOptions.length > 0 && !currentUser.isFree && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
            <RocketOutlined style={{ marginRight: 8 }} />
            Opções de upgrade
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {upgradeOptions.map((plan) => (
              <Card
                key={plan.slug}
                hoverable
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  transition: 'border-color 0.2s',
                }}
                styles={{
                  body: { padding: 24 },
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-neutral-400)', marginBottom: 12 }}>{plan.description}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#22C55E' }}>
                    {formatPrice(plan.price)}
                    <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-neutral-400)' }}>/mês</span>
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  {plan.features.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6, color: 'var(--color-neutral-400)' }}>
                      <CheckOutlined style={{ color: '#22C55E', fontSize: 12 }} />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                {currentPlan && (
                  <div style={{
                    fontSize: 12,
                    color: 'var(--color-neutral-500)',
                    textAlign: 'center',
                    marginBottom: 12,
                  }}>
                    + {formatPrice(plan.price - currentPlan.price)}/mês em relação ao seu plano atual
                  </div>
                )}

                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<ArrowRightOutlined />}
                  loading={loadingSlug === plan.slug}
                  disabled={!!loadingSlug}
                  onClick={() => handleUpgrade(plan)}
                >
                  Fazer upgrade
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}

      {upgradeOptions.length === 0 && currentPlan && !currentUser.isFree && (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#22C55E', marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Você está no melhor plano!</h3>
          <p style={{ color: 'var(--color-neutral-400)', fontSize: 14 }}>
            Seu plano <strong>{currentPlan.name}</strong> é o mais completo da sua faixa de faturamento.
          </p>
        </Card>
      )}

      {hasNoPlan && (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <RocketOutlined style={{ fontSize: 48, color: '#f59e0b', marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhum plano ativo</h3>
          <p style={{ color: 'var(--color-neutral-400)', fontSize: 14, marginBottom: 24 }}>
            Escolha um plano para começar a usar a plataforma.
          </p>
          <Button type="primary" size="large" onClick={() => router.push('/assinar')}>
            Escolher plano
          </Button>
        </Card>
      )}
    </Layout>
  )
}
