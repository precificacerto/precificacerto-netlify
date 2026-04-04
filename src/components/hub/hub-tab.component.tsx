import React, { useEffect, useState } from 'react'
import { Table, Button, Spin, Empty, message } from 'antd'
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
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
    }).format(v)
}

export interface HubTabProps {
    tenantId: string
}

type RowKind = 'income' | 'group-header' | 'category' | 'total'

type TableRow = {
    key: string
    label: string
    kind: RowKind
    group: string
    values: Record<string, number>
    averagePct?: number
    averageRS?: number
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
            .catch(() => messageApi.error('Erro ao carregar dados do Hub'))
            .finally(() => setLoadingData(false))
    }, [tenantId])

    const handleSync = async () => {
        setSyncing(true)
        try {
            await mergeExpenseConfig(tenantId)
            messageApi.success('Precificação atualizada com sucesso!')
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
                <Empty description="Nenhum mês encerrado encontrado. Os dados aparecerão após o fechamento do primeiro mês." />
            </div>
        )
    }

    // ── Lista flat: linha de faturamento → para cada grupo: header + categorias → total ──
    const rows: TableRow[] = []

    // Faturamento
    rows.push({
        key: '__income__',
        label: 'Faturamento',
        kind: 'income',
        group: 'INCOME',
        values: hubData.incomeByMonth,
        averageRS: hubData.totalIncomeMonthsCount > 0
            ? hubData.totalIncome / hubData.totalIncomeMonthsCount
            : 0,
    })

    for (const row of hubData.rows) {
        // Linha header do grupo (sem valores nas colunas de mês — só label e média total)
        rows.push({
            key: `__grp__${row.group}`,
            label: row.label,
            kind: 'group-header',
            group: row.group,
            values: row.values,
            averagePct: row.averagePct,
            averageRS: row.averageRS,
        })

        // Linhas de cada categoria com valores lançados
        for (const sub of row.subRows) {
            rows.push({
                key: `${row.group}__${sub.categoryKey}`,
                label: sub.label,
                kind: 'category',
                group: row.group,
                values: sub.values,
                averagePct: sub.averagePct,
                averageRS: sub.averageRS,
            })
        }
    }

    // Total despesas
    const totalValues: Record<string, number> = {}
    for (const month of hubData.months) {
        totalValues[month] = hubData.rows.reduce((s, r) => s + (r.values[month] || 0), 0)
    }
    rows.push({
        key: '__total__',
        label: 'Total Despesas',
        kind: 'total',
        group: '__total__',
        values: totalValues,
        averagePct: Math.round(hubData.rows.reduce((s, r) => s + r.averagePct, 0) * 100) / 100,
    })

    // ── Colunas ──
    const columns: any[] = [
        {
            title: 'Despesa / Tipo',
            dataIndex: 'label',
            key: 'label',
            fixed: 'left' as const,
            width: 280,
            render: (text: string, record: TableRow) => {
                switch (record.kind) {
                    case 'income':
                        return <span style={{ fontWeight: 700, color: '#12B76A' }}>{text}</span>

                    case 'total':
                        return <strong style={{ color: '#F04438' }}>{text}</strong>

                    case 'group-header': {
                        const color = getExpenseGroupColor(record.group)
                        const dot = (
                            <span style={{
                                display: 'inline-block',
                                width: 10, height: 10,
                                borderRadius: '50%',
                                background: color,
                                marginRight: 8,
                                flexShrink: 0,
                            }} />
                        )
                        return (
                            <span style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center' }}>
                                {dot}{text}
                            </span>
                        )
                    }

                    case 'category':
                        return (
                            <span style={{ fontSize: 12, color: '#94a3b8', paddingLeft: 18 }}>
                                — {text}
                            </span>
                        )

                    default:
                        return text
                }
            },
        },

        // Uma coluna por mês encerrado
        ...hubData.months.map((monthKey) => ({
            title: formatMonthKey(monthKey),
            key: monthKey,
            align: 'right' as const,
            width: 110,
            render: (_: unknown, record: TableRow) => {
                const amount = record.values[monthKey] || 0

                if (record.kind === 'income') {
                    return (
                        <div style={{ textAlign: 'right', fontWeight: 600, color: '#12B76A', fontSize: 13 }}>
                            {formatCurrency(amount)}
                        </div>
                    )
                }

                if (record.kind === 'total') {
                    const income = hubData.incomeByMonth[monthKey] || 0
                    const pct = income > 0 ? (amount / income) * 100 : 0
                    return (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#F04438' }}>{formatCurrency(amount)}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                        </div>
                    )
                }

                if (record.kind === 'group-header') {
                    // Linha de grupo: mostra o total acumulado em cinza, sem destaque
                    const income = hubData.incomeByMonth[monthKey] || 0
                    const pct = income > 0 ? (amount / income) * 100 : 0
                    return amount > 0 ? (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{formatCurrency(amount)}</div>
                            <div style={{ fontSize: 10, color: '#475569' }}>{pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</div>
                        </div>
                    ) : <span style={{ color: '#334155', fontSize: 11 }}>—</span>
                }

                // Categoria
                if (amount === 0) return <span style={{ color: '#334155', fontSize: 11 }}>—</span>
                const income = hubData.incomeByMonth[monthKey] || 0
                const pct = income > 0 ? (amount / income) * 100 : 0
                return (
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0' }}>{formatCurrency(amount)}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                    </div>
                )
            },
        })),

        // Coluna Média Total %
        {
            title: <span style={{ color: '#a5b4fc', fontWeight: 700 }}>Média %</span>,
            key: '__avg__',
            fixed: 'right' as const,
            align: 'right' as const,
            width: 110,
            onHeaderCell: () => ({ style: { background: 'rgba(99,102,241,0.08)', fontWeight: 700 } }),
            onCell: () => ({ style: { background: 'rgba(99,102,241,0.06)' } }),
            render: (_: unknown, record: TableRow) => {
                switch (record.kind) {
                    case 'income':
                        return <div style={{ textAlign: 'right', fontWeight: 700, color: '#12B76A' }}>{formatCurrency(record.averageRS ?? 0)}</div>
                    case 'total':
                        return <div style={{ textAlign: 'right', fontWeight: 700, color: '#F04438' }}>{(record.averagePct ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                    case 'group-header':
                        return <div style={{ textAlign: 'right', fontWeight: 700, color: '#a5b4fc' }}>{(record.averagePct ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                    case 'category':
                        return <div style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>{(record.averagePct ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                    default:
                        return null
                }
            },
        },
    ]

    return (
        <div>
            {contextHolder}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>Hub de Despesas</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {hubData.months.length} {hubData.months.length === 1 ? 'mês encerrado' : 'meses encerrados'} ·
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
                style={{ borderRadius: 8 }}
                rowClassName={(record: TableRow) => {
                    if (record.kind === 'income') return 'hub-row--income'
                    if (record.kind === 'total') return 'hub-row--total'
                    if (record.kind === 'group-header') return 'hub-row--group'
                    return 'hub-row--cat'
                }}
            />

            <style>{`
                .hub-row--income td { background: rgba(18,183,106,0.06) !important; border-bottom: 2px solid rgba(18,183,106,0.2) !important; }
                .hub-row--total td  { background: rgba(240,68,56,0.06) !important; border-top: 2px solid rgba(240,68,56,0.2) !important; font-weight:700 !important; }
                .hub-row--group td  { background: rgba(99,102,241,0.06) !important; border-top: 1px solid rgba(99,102,241,0.15) !important; }
                .hub-row--cat td    { background: transparent !important; }
            `}</style>
        </div>
    )
}
