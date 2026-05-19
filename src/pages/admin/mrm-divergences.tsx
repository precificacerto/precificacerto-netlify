import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { useCachedFetch } from '@/hooks/use-cached-fetch.hook'

const { Text } = Typography
const { RangePicker } = DatePicker

type RecentRow = {
  id: string
  tenant_id: string | null
  document_id: string | null
  document_type: string | null
  divergence_type: 'numeric_divergence' | 'edge_unavailable' | 'shadow_exception'
  motor_version_client: string | null
  motor_version_edge: string | null
  diff_amount: number | null
  diff_percent: number | null
  fields_diverged: string[] | null
  edge_error: string | null
  shadow_duration_ms: number | null
  created_at: string
}

type TopTenantRow = {
  tenant_id: string | null
  count: number
  max_diff_percent: number
  max_diff_amount: number
}

type StatsPayload = {
  window: { from: string; to: string }
  stats: {
    total: number
    numericCount: number
    edgeUnavailableCount: number
    shadowExceptionCount: number
    p50: number
    p95: number
    p99: number
  }
  topTenants: TopTenantRow[]
  recent: RecentRow[]
}

const divergenceTypeColor: Record<string, string> = {
  numeric_divergence: 'orange',
  edge_unavailable: 'red',
  shadow_exception: 'magenta',
}

/**
 * /admin/mrm-divergences — Dashboard SUPER-ADMIN ONLY (S3.2).
 *
 * EXCEÇÃO autorizada à restrição "sem telas novas": ferramenta de debug
 * interna restrita (<=5 usuários), sem entrada em menu/sidebar, acessível
 * apenas via URL direta. Alimenta a decisão go/no-go S3.3 da deprecação
 * do edge legado (ADR-005).
 *
 * Reusa o padrão de guard das demais páginas super-admin do projeto
 * (currentUser.is_super_admin + router.replace, ver src/pages/super-admin/index.tsx).
 */
function MrmDivergencesPage() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const isSA = currentUser?.is_super_admin === true

  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().subtract(7, 'day'),
    dayjs(),
  ])

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      from: range[0].toDate().toISOString(),
      to: range[1].toDate().toISOString(),
    })
    return params.toString()
  }, [range])

  const { data, isLoading, error } = useCachedFetch<StatsPayload>(
    isSA ? `/api/admin/mrm-divergences/stats?${queryString}` : null
  )

  // Guard: redireciona quem não é super-admin
  if (currentUser && !isSA) {
    router.replace(ROUTES.DASHBOARD)
    return null
  }
  if (!isSA) return null

  const stats = data?.stats
  const topTenants = data?.topTenants ?? []
  const recent = data?.recent ?? []

  const recentColumns: ColumnsType<RecentRow> = [
    {
      title: 'Quando',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('pt-BR'),
      sorter: (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Tipo',
      dataIndex: 'divergence_type',
      key: 'divergence_type',
      width: 170,
      render: (v: string) => (
        <Tag color={divergenceTypeColor[v] ?? 'default'}>{v}</Tag>
      ),
    },
    {
      title: 'Doc',
      key: 'doc',
      width: 120,
      render: (_, r) =>
        r.document_type ? (
          <span style={{ fontSize: 12 }}>{r.document_type}</span>
        ) : (
          '—'
        ),
    },
    {
      title: 'Tenant',
      dataIndex: 'tenant_id',
      key: 'tenant_id',
      width: 250,
      render: (v: string | null) =>
        v ? <code style={{ fontSize: 11 }}>{v}</code> : '—',
    },
    {
      title: 'Diff R$',
      dataIndex: 'diff_amount',
      key: 'diff_amount',
      width: 110,
      align: 'right',
      render: (v: number | null) =>
        v == null ? '—' : `R$ ${Number(v).toFixed(2)}`,
      sorter: (a, b) => Number(a.diff_amount ?? 0) - Number(b.diff_amount ?? 0),
    },
    {
      title: 'Diff %',
      dataIndex: 'diff_percent',
      key: 'diff_percent',
      width: 110,
      align: 'right',
      render: (v: number | null) =>
        v == null ? '—' : `${Number(v).toFixed(4)}%`,
      sorter: (a, b) =>
        Number(a.diff_percent ?? 0) - Number(b.diff_percent ?? 0),
    },
    {
      title: 'Fields',
      dataIndex: 'fields_diverged',
      key: 'fields_diverged',
      render: (v: string[] | null) =>
        v && v.length > 0 ? (
          <Space size={4} wrap>
            {v.slice(0, 6).map((f) => (
              <Tag key={f}>{f}</Tag>
            ))}
            {v.length > 6 && <Tag>+{v.length - 6}</Tag>}
          </Space>
        ) : (
          '—'
        ),
    },
    {
      title: 'Edge err',
      dataIndex: 'edge_error',
      key: 'edge_error',
      ellipsis: true,
      render: (v: string | null) =>
        v ? <Text type="danger" style={{ fontSize: 11 }}>{v}</Text> : '—',
    },
    {
      title: 'ms',
      dataIndex: 'shadow_duration_ms',
      key: 'shadow_duration_ms',
      width: 70,
      align: 'right',
      render: (v: number | null) => (v == null ? '—' : v),
    },
  ]

  const topColumns: ColumnsType<TopTenantRow> = [
    {
      title: 'Tenant',
      dataIndex: 'tenant_id',
      key: 'tenant_id',
      render: (v: string | null) =>
        v ? <code style={{ fontSize: 11 }}>{v}</code> : '—',
    },
    {
      title: 'Divergências',
      dataIndex: 'count',
      key: 'count',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.count - b.count,
      defaultSortOrder: 'descend',
    },
    {
      title: 'Max diff %',
      dataIndex: 'max_diff_percent',
      key: 'max_diff_percent',
      width: 130,
      align: 'right',
      render: (v: number) => `${Number(v).toFixed(4)}%`,
    },
    {
      title: 'Max diff R$',
      dataIndex: 'max_diff_amount',
      key: 'max_diff_amount',
      width: 130,
      align: 'right',
      render: (v: number) => `R$ ${Number(v).toFixed(2)}`,
    },
  ]

  return (
    <Layout
      title="MRM Engine Divergences"
      subtitle="INTERNAL DEBUG TOOL — Super Admin"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Shadow-mode observability (MRM S3.2 / ADR-005)"
        description={
          <span>
            Esta página compara o motor cliente V2 (TypeScript) com a edge function legada durante a janela de 30d de shadow-mode. Os dados aqui alimentam a decisão go/no-go de deprecação do edge. <strong>Não é uma funcionalidade do produto</strong> — debug interno.
          </span>
        }
      />

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text strong>Janela:</Text>
          <RangePicker
            value={range}
            onChange={(vals) => {
              if (vals && vals[0] && vals[1]) setRange([vals[0], vals[1]])
            }}
            allowClear={false}
            showTime
            format="DD/MM/YYYY HH:mm"
          />
          {data?.window && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(data.window.from).toLocaleString('pt-BR')} →{' '}
              {new Date(data.window.to).toLocaleString('pt-BR')}
            </Text>
          )}
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Erro ao carregar estatísticas"
          description={error.message}
          style={{ marginBottom: 16 }}
        />
      )}

      {isLoading && !data ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Total" value={stats?.total ?? 0} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Numéricas"
                  value={stats?.numericCount ?? 0}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Edge unavailable"
                  value={stats?.edgeUnavailableCount ?? 0}
                  valueStyle={{ color: '#cf1322' }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="Shadow exceptions"
                  value={stats?.shadowExceptionCount ?? 0}
                  valueStyle={{ color: '#c41d7f' }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic
                  title="p50 diff %"
                  value={stats?.p50 ?? 0}
                  precision={4}
                  suffix="%"
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic
                  title="p95 diff %"
                  value={stats?.p95 ?? 0}
                  precision={4}
                  suffix="%"
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic
                  title="p99 diff %"
                  value={stats?.p99 ?? 0}
                  precision={4}
                  suffix="%"
                />
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            title={
              <Space>
                <span>Top 10 Tenants</span>
                <Tag>contagem desc</Tag>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Table<TopTenantRow>
              size="small"
              dataSource={topTenants}
              columns={topColumns}
              rowKey={(r) => r.tenant_id ?? '__null__'}
              pagination={false}
              locale={{ emptyText: 'Sem divergências na janela.' }}
            />
          </Card>

          <Card
            size="small"
            title={
              <Space>
                <span>Últimas divergências</span>
                <Tag>até 100 mais recentes</Tag>
              </Space>
            }
          >
            <Table<RecentRow>
              size="small"
              dataSource={recent}
              columns={recentColumns}
              rowKey="id"
              pagination={{ pageSize: 25, showSizeChanger: true }}
              scroll={{ x: 1300 }}
              locale={{ emptyText: 'Sem divergências na janela.' }}
            />
          </Card>
        </>
      )}
    </Layout>
  )
}

export default MrmDivergencesPage
