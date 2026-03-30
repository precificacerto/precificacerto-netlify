import React, { useEffect, useState } from 'react'
import { Table, Button, Spin, Empty, Tag, message } from 'antd'
import { SyncOutlined } from '@ant-design/icons'
import { calculateHubData } from '@/utils/hub-engine'
import type { HubData } from '@/utils/hub-engine'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { getExpenseGroupColor } from '@/constants/cashier-category'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatMonthKey(key: string): string {
    const [y, m] = key.split('-')
    return `${MONTH_LABELS[Number(m) - 1]}/${String(y).slice(2)}`
}

function formatCurrency(v: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

// Ordered list of groups to display (matching hub-engine HUB_GROUPS)
const HUB_GROUP_ORDER = [
    'MAO_DE_OBRA_PRODUTIVA',
    'MAO_DE_OBRA_ADMINISTRATIVA',
    'MAO_DE_OBRA',
    'DESPESA_FIXA',
    'DESPESA_VARIAVEL',
    'DESPESA_FINANCEIRA',
    'IMPOSTO',
    'REGIME_TRIBUTARIO',
]

export interface HubTabProps {
    tenantId: string
}

export function HubTab({ tenantId }: HubTabProps) {
    const [hubData, setHubData] = useState<HubData | null>(null)
    const [loadingData, setLoadingData] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [messageApi, contextHolder] = message.useMessage()

    useEffect(() => {
        if (!tenantId) return
        setLoadingData(true)
        calculateHubData(tenantId)
            .then((data) => setHubData(data))
            .catch(() => {
                messageApi.error('Erro ao carregar dados do Hub')
            })
            .finally(() => setLoadingData(false))
    }, [tenantId])

    const handleSync = async () => {
        setSyncing(true)
        try {
            await mergeExpenseConfig(tenantId)
            messageApi.success('Precificação atualizada com sucesso!')
            // Recarrega os dados do Hub para refletir os percentuais atualizados
            const updated = await calculateHubData(tenantId)
            setHubData(updated)
        } catch {
            messageApi.error('Erro ao atualizar precificação')
        } finally {
            setSyncing(false)
        }
    }

    if (loadingData) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80 }}>
                <Spin size="large" />
            </div>
        )
    }

    if (!hubData || hubData.months.length === 0) {
        return (
            <div style={{ padding: '32px 0' }}>
                <Empty
                    description="Nenhum mês encerrado encontrado. Os dados aparecerão após o fechamento do primeiro mês."
                />
            </div>
        )
    }

    // Build table datasource
    // Row type for the table
    type TableRow = {
        key: string
        label: string
        group: string
        isIncome?: boolean
        isTotal?: boolean
        values: Record<string, number>
        averagePct?: number
        averageRS?: number
        totalSum?: number
    }

    const rows: TableRow[] = []

    // Row 0: Faturamento
    rows.push({
        key: '__income__',
        label: 'Faturamento',
        group: 'INCOME',
        isIncome: true,
        values: hubData.incomeByMonth,
        averageRS: hubData.totalIncomeMonthsCount > 0
            ? hubData.totalIncome / hubData.totalIncomeMonthsCount
            : 0,
    })

    // Expense rows in configured order
    const orderedRows = HUB_GROUP_ORDER
        .map((g) => hubData.rows.find((r) => r.group === g))
        .filter(Boolean) as typeof hubData.rows

    for (const row of orderedRows) {
        rows.push({
            key: row.group,
            label: row.label,
            group: row.group,
            values: row.values,
            averagePct: row.averagePct,
            averageRS: row.averageRS,
            totalSum: row.totalSum,
        })
    }

    // Total row: sum all expense rows per month
    const totalValues: Record<string, number> = {}
    for (const month of hubData.months) {
        totalValues[month] = orderedRows.reduce((sum, r) => sum + (r.values[month] || 0), 0)
    }
    const totalAveragePct = orderedRows.reduce((sum, r) => sum + r.averagePct, 0)
    rows.push({
        key: '__total__',
        label: 'Total Despesas',
        group: '__total__',
        isTotal: true,
        values: totalValues,
        averagePct: Math.round(totalAveragePct * 100) / 100,
    })

    // Build columns
    const avgColumnStyle: React.CSSProperties = {
        background: 'rgba(99, 102, 241, 0.08)',
        fontWeight: 700,
        minWidth: 100,
    }

    const columns: any[] = [
        {
            title: 'Grupo',
            dataIndex: 'label',
            key: 'label',
            fixed: 'left' as const,
            width: 220,
            render: (text: string, record: TableRow) => {
                if (record.isIncome) {
                    return (
                        <span style={{ fontWeight: 700, color: '#12B76A' }}>
                            {text}
                        </span>
                    )
                }
                if (record.isTotal) {
                    return <strong style={{ color: '#F04438' }}>{text}</strong>
                }
                const color = getExpenseGroupColor(record.group)
                return (
                    <span>
                        <Tag color={color} style={{ marginRight: 6, fontSize: 10 }}>
                            {record.group.replace(/_/g, ' ')}
                        </Tag>
                        <span style={{ fontSize: 13 }}>{text}</span>
                    </span>
                )
            },
        },
        // One column per month
        ...hubData.months.map((monthKey) => ({
            title: formatMonthKey(monthKey),
            key: monthKey,
            dataIndex: monthKey,
            align: 'right' as const,
            width: 110,
            render: (_: unknown, record: TableRow) => {
                const amount = record.values[monthKey] || 0

                if (record.isIncome) {
                    return (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#12B76A' }}>
                                {formatCurrency(amount)}
                            </div>
                        </div>
                    )
                }

                if (record.isTotal) {
                    const income = hubData.incomeByMonth[monthKey] || 0
                    const pct = income > 0 ? (amount / income) * 100 : 0
                    return (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#F04438' }}>
                                {formatCurrency(amount)}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                {pct.toFixed(2)}%
                            </div>
                        </div>
                    )
                }

                const income = hubData.incomeByMonth[monthKey] || 0
                const pct = income > 0 ? (amount / income) * 100 : 0
                return (
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                            {formatCurrency(amount)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>
                            {pct.toFixed(2)}%
                        </div>
                    </div>
                )
            },
        })),
        // Média Total %
        {
            title: (
                <span style={{ color: '#a5b4fc', fontWeight: 700 }}>
                    Média Total %
                </span>
            ),
            key: '__avg__',
            fixed: 'right' as const,
            align: 'right' as const,
            width: 120,
            onHeaderCell: () => ({ style: avgColumnStyle }),
            onCell: () => ({ style: { background: 'rgba(99, 102, 241, 0.08)' } }),
            render: (_: unknown, record: TableRow) => {
                if (record.isIncome) {
                    return (
                        <div style={{ textAlign: 'right', fontWeight: 700, color: '#12B76A' }}>
                            {formatCurrency(record.averageRS ?? 0)}
                        </div>
                    )
                }
                if (record.isTotal) {
                    return (
                        <div style={{ textAlign: 'right', fontWeight: 700, color: '#F04438' }}>
                            {(record.averagePct ?? 0).toFixed(2)}%
                        </div>
                    )
                }
                return (
                    <div style={{ textAlign: 'right', fontWeight: 700, color: '#a5b4fc' }}>
                        {(record.averagePct ?? 0).toFixed(2)}%
                    </div>
                )
            },
        },
    ]

    return (
        <div>
            {contextHolder}

            {/* Header toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
            }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>
                        Hub de Despesas
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        Baseado em {hubData.months.length} {hubData.months.length === 1 ? 'mês encerrado' : 'meses encerrados'}.
                        Faturamento total: {formatCurrency(hubData.totalIncome)}
                    </div>
                </div>
                <Button
                    type="primary"
                    icon={<SyncOutlined spin={syncing} />}
                    loading={syncing}
                    onClick={handleSync}
                    style={{ background: '#6366F1', borderColor: '#6366F1' }}
                >
                    Atualizar Precificação
                </Button>
            </div>

            <Table
                dataSource={rows}
                columns={columns}
                rowKey="key"
                pagination={false}
                scroll={{ x: 'max-content' }}
                size="small"
                rowClassName={(record: TableRow) => {
                    if (record.isIncome) return 'hub-row--income'
                    if (record.isTotal) return 'hub-row--total'
                    return ''
                }}
                style={{ borderRadius: 8 }}
            />

            <style>{`
                .hub-row--income td {
                    background: rgba(18, 183, 106, 0.06) !important;
                    border-bottom: 2px solid rgba(18, 183, 106, 0.2) !important;
                }
                .hub-row--total td {
                    background: rgba(240, 68, 56, 0.06) !important;
                    border-top: 2px solid rgba(240, 68, 56, 0.2) !important;
                    font-weight: 700 !important;
                }
            `}</style>
        </div>
    )
}
