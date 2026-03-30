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

export interface HubTabProps {
    tenantId: string
}

// Tipo interno da tabela com suporte a children (hierarquia grupo → categoria)
type TableRow = {
    key: string
    label: string
    group: string
    isIncome?: boolean
    isTotal?: boolean
    isSubRow?: boolean   // categoria dentro do grupo
    values: Record<string, number>
    averagePct?: number
    averageRS?: number
    children?: TableRow[]
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

    // ── Constrói o dataSource com hierarquia grupo → sub-linhas de categoria ──

    const rows: TableRow[] = []

    // Linha de Faturamento (sem children)
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

    // Linhas de despesa com children por categoria
    for (const row of hubData.rows) {
        const children: TableRow[] = row.subRows.map((sub) => ({
            key: `${row.group}__${sub.categoryKey}`,
            label: sub.label,
            group: row.group,
            isSubRow: true,
            values: sub.values,
            averagePct: sub.averagePct,
            averageRS: sub.averageRS,
        }))

        rows.push({
            key: row.group,
            label: row.label,
            group: row.group,
            values: row.values,
            averagePct: row.averagePct,
            averageRS: row.averageRS,
            // Só inclui children se tiver mais de uma categoria (caso único, o grupo já resume)
            children: children.length > 1 ? children : undefined,
        })
    }

    // Linha Total Despesas
    const totalValues: Record<string, number> = {}
    for (const month of hubData.months) {
        totalValues[month] = hubData.rows.reduce((sum, r) => sum + (r.values[month] || 0), 0)
    }
    const totalAveragePct = hubData.rows.reduce((sum, r) => sum + r.averagePct, 0)
    rows.push({
        key: '__total__',
        label: 'Total Despesas',
        group: '__total__',
        isTotal: true,
        values: totalValues,
        averagePct: Math.round(totalAveragePct * 100) / 100,
    })

    // ── Colunas ──
    const avgColumnStyle: React.CSSProperties = {
        background: 'rgba(99, 102, 241, 0.08)',
        fontWeight: 700,
        minWidth: 100,
    }

    const columns: any[] = [
        {
            title: 'Grupo / Categoria',
            dataIndex: 'label',
            key: 'label',
            fixed: 'left' as const,
            width: 260,
            render: (text: string, record: TableRow) => {
                if (record.isIncome) {
                    return <span style={{ fontWeight: 700, color: '#12B76A' }}>{text}</span>
                }
                if (record.isTotal) {
                    return <strong style={{ color: '#F04438' }}>{text}</strong>
                }
                if (record.isSubRow) {
                    // Categoria dentro do grupo: sem tag, fonte menor, cor neutra
                    return (
                        <span style={{ fontSize: 12, color: '#94a3b8', paddingLeft: 4 }}>
                            {text}
                        </span>
                    )
                }
                // Cabeçalho do grupo
                const color = getExpenseGroupColor(record.group)
                return (
                    <span style={{ fontWeight: 600 }}>
                        <Tag color={color} style={{ marginRight: 6, fontSize: 10 }}>
                            {record.group.replace(/_/g, ' ')}
                        </Tag>
                        <span style={{ fontSize: 13 }}>{text}</span>
                    </span>
                )
            },
        },
        // Uma coluna por mês encerrado
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
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{pct.toFixed(2)}%</div>
                        </div>
                    )
                }

                if (amount === 0) return <span style={{ color: '#334155', fontSize: 11 }}>—</span>

                const income = hubData.incomeByMonth[monthKey] || 0
                const pct = income > 0 ? (amount / income) * 100 : 0

                if (record.isSubRow) {
                    // Sub-linha de categoria: valores menores, estilo discreto
                    return (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatCurrency(amount)}</div>
                            <div style={{ fontSize: 10, color: '#475569' }}>{pct.toFixed(1)}%</div>
                        </div>
                    )
                }

                return (
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0' }}>{formatCurrency(amount)}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{pct.toFixed(2)}%</div>
                    </div>
                )
            },
        })),
        // Coluna Média Total %
        {
            title: (
                <span style={{ color: '#a5b4fc', fontWeight: 700 }}>Média Total %</span>
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
                if (record.isSubRow) {
                    return (
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>
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

    // IDs dos grupos que devem começar expandidos (todos)
    const defaultExpandedKeys = hubData.rows
        .filter((r) => r.subRows.length > 1)
        .map((r) => r.group)

    return (
        <div>
            {contextHolder}

            {/* Barra de título e botão */}
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
                        Baseado em {hubData.months.length}{' '}
                        {hubData.months.length === 1 ? 'mês encerrado' : 'meses encerrados'}.
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
                expandable={{
                    defaultExpandedRowKeys: defaultExpandedKeys,
                    expandRowByClick: false,
                    indentSize: 16,
                }}
                rowClassName={(record: TableRow) => {
                    if (record.isIncome) return 'hub-row--income'
                    if (record.isTotal) return 'hub-row--total'
                    if (record.isSubRow) return 'hub-row--sub'
                    return 'hub-row--group'
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
                .hub-row--group td {
                    background: rgba(99, 102, 241, 0.04) !important;
                }
                .hub-row--sub td {
                    background: transparent !important;
                }
            `}</style>
        </div>
    )
}
