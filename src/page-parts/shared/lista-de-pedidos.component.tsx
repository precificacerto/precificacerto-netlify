/**
 * A LISTA DE PEDIDOS — os DOIS ramos, desktop e cartões mobile, num componente só.
 *
 * O desenho e as razões são os de `lista-de-vendas.component.tsx`; o que é próprio daqui:
 *
 * **A PERMISSÃO É LIDA DENTRO, e esta é a lista em que isso importa.** `canEditOrders` era
 * `canEdit(MODULES.ORDERS)` na página, e aparece em SEIS pontos entre os dois ramos:
 * desabilita Editar, Enviar para Aprovação e Cancelar no desktop, e os mesmos três no cartão
 * mobile. Recebê-lo por prop deixaria cada chamador passar a sua versão — e um chamador
 * distraído renderizaria ação habilitada que a permissão nega. Aqui ele é lido do hook, uma
 * vez, e o chamador não tem como errar.
 *
 * `isEvolved`, `canModify`, `canSendApproval`, `canDelete`, `canCancel` e `showActions` são
 * `const` LOCAIS do render de cada linha, derivados do `status` da própria linha. Eles nunca
 * atravessaram nada, e continuam não atravessando.
 */

import React, { useEffect, useState } from 'react'
import { Button, Dropdown, Empty, Space, Table, Tag } from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined, MoreOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { RequiresReviewBadge } from '@/components/mrm/RequiresReviewBadge'
import { METODOS_DE_PAGAMENTO_PEDIDO } from '@/constants/metodos-de-pagamento'
import { PAGE_SIZE } from '@/constants/pagination'
import { STATUS_DO_PEDIDO } from '@/constants/status-do-pedido'
import { useDevice } from '@/contexts/device.context'
import { MODULES, usePermissions } from '@/hooks/use-permissions.hook'
import { formatBRL } from '@/utils/formatters'

const formatCurrency = formatBRL

/** A linha da lista de pedidos. Era `interface Order` dentro da página. */
export interface Order {
    id: string
    tenant_id: string
    order_code: string
    customer_id: string
    employee_id?: string | null
    budget_id?: string | null
    sale_id?: string | null
    status: string
    total_value: number
    // D5: consolidados do pedido (espelham budgets/sales). `rt_amount` é a alíquota
    // efetiva de RT congelada em R$ sobre o total pós-desconto (EPIC-RT v8).
    commission_amount?: number | null
    profit_amount?: number | null
    rt_amount?: number | null
    discount_mode?: string | null
    discount_value?: number | null
    discount_percent?: number | null
    payment_method?: string | null
    installments?: number | null
    entry_value?: number | null
    notes?: string | null
    created_at: string
    updated_at: string
    customer_name?: string
    employee_name?: string
    budget_code?: string
    budget_status?: string | null
    items_count?: number
    // MRM S2.3: flag setada pela camada mrm-policies quando RRO ≤ 0 em orders.
    requires_review?: boolean
}
export type AcoesDaListaDePedidos = {
    onVer: (pedido: Order) => void
    onEditar: (pedido: Order) => void
    onEnviarParaAprovacao: (pedido: Order) => void
    onCancelar: (pedido: Order) => void
}

export type ListaDePedidosProps = {
    rows: Order[]
    actions: AcoesDaListaDePedidos
    /** MODO, não filtro: presente = a lista é de UM cliente, e o vazio diz isso. */
    customerId?: string
    estado?: { carregando?: boolean }
}

export function vazioDaListaDePedidos(customerId?: string): string {
    return customerId ? 'Este cliente não tem pedido em aberto' : 'Nenhum pedido em aberto'
}

export function ListaDePedidos({ rows, actions, customerId, estado }: ListaDePedidosProps) {
    const { isMobile } = useDevice()
    const { canEdit } = usePermissions()
    const canEditOrders = canEdit(MODULES.ORDERS)
    const carregando = estado?.carregando === true
    const [openKebabId, setOpenKebabId] = useState<string | null>(null)

    // Doc 29/07 (item 1.1.6): fecha o ⋮ aberto ao rolar qualquer container (fase de captura
    // pega o scroll da lista mobile, que tem overflow próprio e não borbulha).
    useEffect(() => {
        if (openKebabId == null) return
        const close = () => setOpenKebabId(null)
        window.addEventListener('scroll', close, true)
        return () => window.removeEventListener('scroll', close, true)
    }, [openKebabId])

    const vazio = vazioDaListaDePedidos(customerId)

    const columns: ColumnsType<Order> = [
        {
            title: 'Código',
            dataIndex: 'order_code',
            key: 'order_code',
            width: 120,
            ellipsis: true,
            render: (v: string) => <Tag color="blue">{v}</Tag>,
        },
        {
            title: 'Cliente',
            dataIndex: 'customer_name',
            key: 'customer_name',
            ellipsis: true,
            sorter: (a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''),
        },
        {
            title: 'Vendedor',
            dataIndex: 'employee_name',
            key: 'employee_name',
            ellipsis: true,
            responsive: ['md'],
            sorter: (a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 200,
            ellipsis: true,
            render: (s: string, record: Order) => {
                const cfg = STATUS_DO_PEDIDO[s] || { color: 'default', label: s }
                return (
                    <span>
                        <Tag color={cfg.color}>{cfg.label}</Tag>
                        {/* MRM S2.3 — badge "Requer revisão" quando policy marcou RRO ≤ 0 */}
                        {record.requires_review === true && <RequiresReviewBadge />}
                    </span>
                )
            },
        },
        {
            title: 'Valor total',
            dataIndex: 'total_value',
            key: 'total_value',
            width: 130,
            align: 'right',
            render: (v: number) => <strong>{formatCurrency(v)}</strong>,
            sorter: (a, b) => (a.total_value || 0) - (b.total_value || 0),
        },
        {
            title: 'Pagamento',
            dataIndex: 'payment_method',
            key: 'payment_method',
            width: 150,
            ellipsis: true,
            responsive: ['lg'],
            render: (v: string) => {
                const pm = METODOS_DE_PAGAMENTO_PEDIDO.find((p) => p.value === v)
                return pm ? <Tag>{pm.label}</Tag> : '—'
            },
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 170,
            align: 'center',
            render: (_, record) => {
                // Pedido é "editável/reenviável" quando ainda não foi para venda OU
                // quando o orçamento espelho foi rejeitado/expirado/cancelado.
                const budgetBlocked = record.budget_status && ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(record.budget_status)
                const canModify = record.status !== 'SENT_TO_SALE' || budgetBlocked
                // Doc 29/07 (item 2.1.2): registro já evoluído (aguardando aprovação sem bloqueio, ou pago) → só "Ver".
                const isEvolved = (record.status === 'SENT_TO_SALE' && !budgetBlocked) || record.status === 'PAID'
                if (isEvolved) {
                    return (
                        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => actions.onVer(record)}>
                            Ver
                        </Button>
                    )
                }
                return (
                <Space direction="vertical" size={2}>
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => actions.onEditar(record)}
                        disabled={!canEditOrders || !canModify}
                    >
                        Editar
                    </Button>
                    {(record.status === 'DRAFT' || record.status === 'AWAITING_PAYMENT' || (record.status === 'SENT_TO_SALE' && budgetBlocked)) && (
                        <Button
                            type="link"
                            size="small"
                            icon={<ShoppingCartOutlined />}
                            style={{ color: '#12B76A' }}
                            onClick={() => actions.onEnviarParaAprovacao(record)}
                            disabled={!canEditOrders}
                        >
                            Enviar para Aprovação
                        </Button>
                    )}
                    {record.status !== 'CANCELLED' && (
                        // Doc 29/07 (item 1.2.1): "Excluir" → "Cancelar pedido" (volta a Orçamento).
                        <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={!canEditOrders}
                            onClick={() => actions.onCancelar(record)}
                        >
                            Cancelar pedido
                        </Button>
                    )}
                </Space>
                )
            },
        },
    ]

    if (isMobile) {
        return (
            <div className="pc-row-compact-list">
                {rows.length === 0 ? (
                    <Empty description={vazio} />
                ) : (
                    rows.map((r: Order) => {
                        const cfg = STATUS_DO_PEDIDO[r.status] || { color: 'default', label: r.status }
                        const dataFmt = new Date(r.created_at).toLocaleDateString('pt-BR')
                        const budgetBlocked = r.budget_status && ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(r.budget_status)
                        const canModify = r.status !== 'SENT_TO_SALE' || !!budgetBlocked
                        const canSendApproval = r.status === 'DRAFT' || r.status === 'AWAITING_PAYMENT' || (r.status === 'SENT_TO_SALE' && !!budgetBlocked)
                        const canDelete = r.status !== 'CANCELLED'
                        // Doc 29/07 (itens 1.2.4 / 1.2.7): pedido já evoluído (aguardando aprovação sem bloqueio, ou pago) só permite "Ver".
                        const isEvolved = (r.status === 'SENT_TO_SALE' && !budgetBlocked) || r.status === 'PAID'
                        const canCancel = canDelete && !isEvolved
                        const showActions = !isEvolved && (canSendApproval || canModify)
                        // ⋮: "Ver" sempre; "Cancelar pedido" (excluir renomeado, volta a Orçamento) só quando não evoluído. Item 1.2.1.
                        const kebabItems: any[] = [
                            { key: 'view', label: 'Ver', onClick: (info: any) => { info?.domEvent?.stopPropagation?.(); actions.onVer(r) } },
                        ]
                        if (canCancel) {
                            // Item 1.3 (Relatório 03/08): "Cancelar pedido" abre o popup de confirmação
                            // DIRETO sobre a lista. stopPropagation evita que o clique borbulhe para
                            // `openRow` e abra o drawer de edição por trás do modal.
                            kebabItems.push({ key: 'cancel', label: 'Cancelar pedido', danger: true, disabled: !canEditOrders, onClick: (info: any) => { info?.domEvent?.stopPropagation?.(); if (canEditOrders) actions.onCancelar(r) } })
                        }
                        const openRow = () => { if (isEvolved) { actions.onVer(r) } else if (canEditOrders && canModify) { actions.onEditar(r) } }
                        return (
                            <React.Fragment key={r.id}>
                                <div
                                    className={showActions ? 'pc-row-compact pc-row-compact--has-actions' : 'pc-row-compact'}
                                    onClick={openRow}
                                >
                                    <div className="pc-row-compact__main">
                                        <span className="pc-row-compact__title">{r.customer_name || 'Sem cliente'}</span>
                                        <span className="pc-row-compact__sub">{r.order_code} · {dataFmt} · {cfg.label}</span>
                                    </div>
                                    <span className="pc-row-compact__value">{formatCurrency(Number(r.total_value || 0))}</span>
                                    <Dropdown menu={{ items: kebabItems }} trigger={['click']} placement="bottomRight" open={openKebabId === r.id} onOpenChange={(o) => setOpenKebabId(o ? r.id : null)}>
                                        <span className="pc-row-compact__kebab" onClick={(e) => e.stopPropagation()}><MoreOutlined /></span>
                                    </Dropdown>
                                </div>
                                {showActions && (
                                    <div className="pc-row-compact__actions" onClick={(e) => e.stopPropagation()}>
                                        {/* Doc 29/07 (item 1.2.1): card mostra "Editar"; excluir foi p/ o ⋮ como "Cancelar pedido". */}
                                        {canModify && (
                                            <Button size="small" disabled={!canEditOrders} onClick={(e) => { e.stopPropagation(); actions.onEditar(r) }}>Editar</Button>
                                        )}
                                        {canSendApproval && (
                                            <Button size="small" type="primary" disabled={!canEditOrders} onClick={(e) => { e.stopPropagation(); actions.onEnviarParaAprovacao(r) }}>Enviar para Aprovação</Button>
                                        )}
                                    </div>
                                )}
                            </React.Fragment>
                        )
                    })
                )}
            </div>
        )
    }

    return (
        <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={carregando}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true }}
            locale={{ emptyText: <Empty description={vazio} /> }}
        />
    )
}
