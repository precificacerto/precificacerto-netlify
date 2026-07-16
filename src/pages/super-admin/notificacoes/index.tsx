import React from 'react'
import { useRouter } from 'next/router'
import { List, Tag, Button, Empty, Badge, message } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'

type AdminNotification = {
  id: string
  type: string
  severity: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string | null
  tenant_id: string | null
  amount: number | null
  metadata: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

type FeedResponse = { notifications: AdminNotification[]; unread: number }

const SEVERITY_CFG: Record<AdminNotification['severity'], { color: string; emoji: string }> = {
  success: { color: 'green', emoji: '✅' },
  error: { color: 'red', emoji: '❌' },
  warning: { color: 'gold', emoji: '⚠️' },
  info: { color: 'blue', emoji: 'ℹ️' },
}

const TYPE_LABEL: Record<string, string> = {
  SALE_SUCCESS: 'Venda',
  PAYMENT_FAILED: 'Falha de pagamento',
  CHECKOUT_ABANDONED: 'Tentativa não concluída',
  SUBSCRIPTION_CANCELLED: 'Cancelamento',
}

function formatBRL(v: number | null): string {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function SuperAdminNotifications() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin

  const { data, isLoading, mutate } = useCachedFetch<FeedResponse>(
    isSA ? '/api/super-admin/notifications?limit=100' : null
  )
  const notifications = data?.notifications ?? []
  const unread = data?.unread ?? 0

  if (currentUser && !isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }
  if (!isSA) return null

  async function patch(body: Record<string, unknown>) {
    try {
      const res = await fetch('/api/super-admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await mutate()
    } catch {
      message.error('Não foi possível atualizar a notificação.')
    }
  }

  return (
    <Layout
      title={PAGE_TITLES.SUPER_ADMIN_NOTIFICATIONS}
      subtitle="Eventos de venda e pagamento (Stripe)"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Tag color="blue">Super Admin</Tag>
          <Badge count={unread} style={{ backgroundColor: '#ef4444' }} /> não lidas
        </span>
        <Button
          icon={<CheckOutlined />}
          disabled={unread === 0}
          onClick={() => patch({ markAll: true })}
        >
          Marcar todas como lidas
        </Button>
      </div>

      <div className="pc-card--table">
        {notifications.length === 0 && !isLoading ? (
          <Empty description="Nenhuma notificação ainda." style={{ padding: 48 }} />
        ) : (
          <List
            loading={isLoading && notifications.length === 0}
            dataSource={notifications}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            renderItem={(n) => {
              const cfg = SEVERITY_CFG[n.severity] || SEVERITY_CFG.info
              return (
                <List.Item
                  style={{
                    background: n.is_read ? 'transparent' : 'rgba(59,130,246,0.08)',
                    borderLeft: `4px solid var(--pc-${n.severity}, ${n.is_read ? '#e5e7eb' : '#3b82f6'})`,
                    padding: '12px 16px',
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                  actions={[
                    !n.is_read ? (
                      <Button key="read" size="small" type="text" icon={<CheckOutlined />} onClick={() => patch({ id: n.id })}>
                        Marcar lida
                      </Button>
                    ) : (
                      <span key="read" style={{ color: '#9ca3af', fontSize: 12 }}>Lida</span>
                    ),
                  ]}
                >
                  <List.Item.Meta
                    avatar={<span style={{ fontSize: 22 }}>{cfg.emoji}</span>}
                    title={
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{n.title}</strong>
                        <Tag color={cfg.color}>{TYPE_LABEL[n.type] || n.type}</Tag>
                        {n.amount != null && <Tag color="cyan">{formatBRL(n.amount)}</Tag>}
                      </span>
                    }
                    description={
                      <div>
                        {n.message && (
                          <div style={{ whiteSpace: 'pre-line', color: '#4b5563', marginBottom: 4 }}>{n.message}</div>
                        )}
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>
                          {new Date(n.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
      </div>
    </Layout>
  )
}

export default SuperAdminNotifications
