import React from 'react'
import { useRouter } from 'next/router'
import { Tag } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'
import {
  TeamOutlined,
  BankOutlined,
  ClockCircleOutlined,
  MailOutlined,
  UserAddOutlined,
} from '@ant-design/icons'

function SuperAdminDashboard() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin

  const { data: tenantsData, isLoading: l1 } = useCachedFetch<unknown[]>(isSA ? '/api/super-admin/tenants' : null)
  const { data: billingData, isLoading: l2 } = useCachedFetch<unknown[]>(isSA ? '/api/super-admin/billing' : null)
  const { data: plansData, isLoading: l3 } = useCachedFetch<unknown[]>(isSA ? '/api/super-admin/plans-expiring?days=30' : null)
  const { data: invitesData, isLoading: l4 } = useCachedFetch<unknown[]>(isSA ? '/api/super-admin/invitations' : null)
  const { data: cadastrosData, isLoading: l5 } = useCachedFetch<unknown[]>(isSA ? '/api/super-admin/cadastros-pendentes' : null)

  const loading = l1 || l2 || l3 || l4 || l5

  const pendingInvites = Array.isArray(invitesData)
    ? invitesData.filter((inv: Record<string, unknown>) =>
        !inv.accepted_at && new Date(inv.expires_at as string) > new Date()
      ).length
    : 0

  const stats = {
    tenants: Array.isArray(tenantsData) ? tenantsData.length : 0,
    billingPending: Array.isArray(billingData) ? billingData.length : 0,
    plansExpiring: Array.isArray(plansData) ? plansData.length : 0,
    invitations: pendingInvites,
    cadastrosPendentes: Array.isArray(cadastrosData) ? cadastrosData.length : 0,
  }

  if (!currentUser) return null
  if (!isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }

  return (
    <Layout
      title={PAGE_TITLES.SUPER_ADMIN_PANEL}
      subtitle={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color="blue">Super Admin</Tag>
          Visão geral do sistema
        </span>
      }
    >
      <div className="kpi-grid" style={{ opacity: loading && !tenantsData ? 0.7 : 1 }}>
        <div onClick={() => router.push(ROUTES.SUPER_ADMIN_TENANTS)} role="button" tabIndex={0}>
          <CardKPI
            title="Total de Tenants"
            value={loading && !tenantsData ? '—' : stats.tenants}
            icon={<TeamOutlined />}
            variant="green"
          />
        </div>
        <div onClick={() => router.push(ROUTES.SUPER_ADMIN_BILLING)} role="button" tabIndex={0}>
          <CardKPI
            title="Pagamentos Pendentes"
            value={loading && !billingData ? '—' : stats.billingPending}
            icon={<BankOutlined />}
            variant="orange"
          />
        </div>
        <div onClick={() => router.push(ROUTES.SUPER_ADMIN_PLANS_EXPIRING)} role="button" tabIndex={0}>
          <CardKPI
            title="Planos Expirando (30 dias)"
            value={loading && !plansData ? '—' : stats.plansExpiring}
            icon={<ClockCircleOutlined />}
            variant="red"
          />
        </div>
        <div onClick={() => router.push(ROUTES.SUPER_ADMIN_INVITES)} role="button" tabIndex={0}>
          <CardKPI
            title="Convites Pendentes"
            value={loading && !invitesData ? '—' : stats.invitations}
            icon={<MailOutlined />}
            variant="blue"
          />
        </div>
        <div onClick={() => router.push(ROUTES.SUPER_ADMIN_CADASTROS)} role="button" tabIndex={0}>
          <CardKPI
            title="Cadastros Pendentes"
            value={loading && !cadastrosData ? '—' : stats.cadastrosPendentes}
            icon={<UserAddOutlined />}
            variant="orange"
          />
        </div>
      </div>
    </Layout>
  )
}

export default SuperAdminDashboard
