/**
 * A LISTA DE VENDAS — os DOIS ramos, desktop e cartões mobile, num componente só.
 *
 * ══ POR QUE SÃO DOIS RAMOS, E POR QUE ISSO IMPORTA ══════════════════════════════════════
 *
 * Cada uma das três telas de COMERCIAL renderiza a sua lista DUAS vezes: a `<Table>` do
 * desktop e os cartões compactos do mobile, lado a lado num ternário sobre `isMobile`. São
 * SEIS renderizações nas três páginas, não três — e um portão que só olhasse o desktop
 * ficaria verde com o mobile intocado. `portao-que-nao-alcanca.md`, pergunta 2: o portão
 * alcança o arquivo, mas precisa alcançar os DOIS ramos dele.
 *
 * ══ A INTERFACE, E O QUE DELIBERADAMENTE NÃO ESTÁ NELA ══════════════════════════════════
 *
 * | entrada | o que é |
 * |---|---|
 * | `rows` | as linhas JÁ FILTRADAS. A página continua dona do pipeline de filtros |
 * | `estado` | o carregamento da lista |
 * | `actions` | os callbacks, passados de fora |
 * | `customerId?` | MODO, não filtro — ver abaixo |
 *
 * **`customerId` NÃO FILTRA.** Quem filtra é quem monta as `rows`. Ele tem dois efeitos e só
 * dois: suprime o filtro por nome de cliente e muda o texto do estado vazio. Nesta lista não
 * há filtro de coluna por cliente, então sobra o segundo — e ele é afirmado por caso.
 *
 * **FORA da interface, e isto é regra:**
 *
 *  - **permissão** é lida DENTRO, nunca recebida. Prop de permissão deixa o chamador passar a
 *    errada, e a tela renderiza ação que a permissão nega. Aqui quem decide é `canDeleteSale`,
 *    importado;
 *  - `formatBRL`, `canDeleteSale`, os tooltips e os métodos de pagamento vêm por IMPORT;
 *  - `isAwaitingOrder`, `podeExcluir` e `allowed` são `const` LOCAIS do render de cada linha.
 *
 * O `estado` é a QUARTA entrada. Ela entrou porque o ramo mobile exibe "Carregando vendas…" e
 * a `<Table>` recebe `loading`: sem ela o diff de comportamento NÃO seria vazio, que é
 * justamente o que o portão desta etapa exige. É DADO, da família de `rows`, não dependência —
 * e por isso não estava na enumeração dos identificadores contra a qual a interface foi
 * escrita pela primeira vez.
 *
 * ══ O QUE VEIO JUNTO DA PÁGINA E NÃO VOLTA ══════════════════════════════════════════════
 *
 * `openKebabId` e o efeito que o fecha ao rolar eram estado da PÁGINA usado só por esta
 * lista — as três páginas tinham a mesma cópia. Moram aqui desde esta extração.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, Empty, Space, Table, Tag, Tooltip } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { RequiresReviewBadge } from '@/components/mrm/RequiresReviewBadge'
import { METODOS_DE_PAGAMENTO_VENDA } from '@/constants/metodos-de-pagamento'
import { PAGE_SIZE } from '@/constants/pagination'
import { useDevice } from '@/contexts/device.context'
import { TOOLTIP_CANCELAR, TOOLTIP_EXCLUIR, canDeleteSale } from '@/utils/document-deleted'
import { formatBRL } from '@/utils/formatters'

const formatCurrency = formatBRL

/** A linha da lista de vendas. Era `interface SaleRow` dentro da página. */
export interface SaleRow {
    id: string
    sale_code: string | null
    budget_id: string | null
    productName: string
    quantity: number
    unitPrice: number
    finalValue: number
    commissionAmount: number
    customerName: string
    sellerName: string
    description: string
    saleDate: string
    status: string
    paymentMethod: string
    installments: number
    saleType: string
    receiptUrl: string | null
    // MRM S2.3: TRUE quando a venda foi salva com RRO ≤ 0 (caso edge —
    // venda legada migrada ou tenant override permissive).
    requiresReview: boolean
}
/** Os callbacks que a lista dispara. COMERCIAL passa os quatro; a ficha passará só `onVer`. */
export type AcoesDaListaDeVendas = {
    onVer: (venda: SaleRow) => void
    onLancarPagamento: (venda: SaleRow) => void
    onCancelar: (venda: SaleRow) => void
    onExcluir: (venda: SaleRow) => void
}

export type ListaDeVendasProps = {
    rows: SaleRow[]
    actions: AcoesDaListaDeVendas
    /** MODO, não filtro: presente = a lista é de UM cliente, e o vazio diz isso. */
    customerId?: string
    estado?: { carregando?: boolean }
}

/** O texto do estado vazio. É o único efeito de `customerId` nesta lista. */
export function vazioDaListaDeVendas(customerId?: string): string {
    return customerId
        ? 'Este cliente não tem venda registrada.'
        : 'Nenhuma venda registrada. Vendas de orçamentos finalizados e vendas no balcão aparecem aqui.'
}

export function ListaDeVendas({ rows, actions, customerId, estado }: ListaDeVendasProps) {
    const { isMobile } = useDevice()
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

    const vazio = useMemo(() => vazioDaListaDeVendas(customerId), [customerId])

    const columns: ColumnsType<SaleRow> = [
        {
            title: 'Código',
            key: 'sale_code',
            width: 120,
            render: (_, record) => (
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#7A5AF8', fontWeight: 600 }}>
                    {record.sale_code || '—'}
                </span>
            ),
        },
        {
            title: 'Cliente',
            dataIndex: 'customerName',
            key: 'customerName',
        },
        {
            title: 'Vendedor',
            dataIndex: 'sellerName',
            key: 'sellerName',
            render: (text: string) => text && text !== '-' ? text : <span style={{ color: '#94a3b8' }}>Sem vendedor</span>,
        },
        {
            title: 'Valor',
            dataIndex: 'finalValue',
            key: 'finalValue',
            align: 'right',
            sorter: (a, b) => a.finalValue - b.finalValue,
            render: (v) => <strong style={{ color: '#12B76A' }}>{formatCurrency(v)}</strong>,
        },
        {
            title: 'Pagamento',
            key: 'payment',
            render: (_, r) => {
                const pm = METODOS_DE_PAGAMENTO_VENDA.find(p => p.value === r.paymentMethod)
                return (
                    <div>
                        <Tag>{pm?.label || r.paymentMethod}</Tag>
                        {r.installments > 1 && <Tag color="blue">{r.installments}x</Tag>}
                    </div>
                )
            },
        },
        {
            title: 'Status',
            key: 'status',
            width: 200,
            render: (_, r) => {
                const statusTag = (r.status === 'AWAITING_PAYMENT' && r.saleType === 'FROM_ORDER')
                    ? <Tag color="orange">⏳ Aguardando pagamento</Tag>
                    // Doc 29/07 (item 1.4.2): "Concluído" → "Lançado".
                    : <Tag color="green">✅ Lançado</Tag>
                return (
                    <span>
                        {statusTag}
                        {/* MRM S2.3 — badge "Requer revisão" (caso edge: tenant permissive ou venda legada) */}
                        {r.requiresReview && <RequiresReviewBadge />}
                    </span>
                )
            },
        },
        {
            title: 'Data',
            dataIndex: 'saleDate',
            key: 'saleDate',
            width: 100,
            sorter: (a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime(),
            defaultSortOrder: 'descend',
            render: (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-',
        },
        {
            title: 'Ações',
            key: 'action',
            width: 160,
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Button type="link" size="small" onClick={() => actions.onVer(record)}>Ver</Button>
                    {record.status === 'AWAITING_PAYMENT' && record.saleType === 'FROM_ORDER' && (
                        <Button
                            type="link"
                            size="small"
                            style={{ color: '#12B76A' }}
                            onClick={() => actions.onLancarPagamento(record)}
                        >
                            Lançar pagamento
                        </Button>
                    )}
                    <Tooltip title={TOOLTIP_CANCELAR}>
                        <Button type="link" size="small" danger onClick={() => actions.onCancelar(record)}>
                            Cancelar
                        </Button>
                    </Tooltip>
                    {(() => {
                        // O botão só fica desabilitado quando a venda JÁ foi excluída. A
                        // pré-condição de pagamento saiu — o tooltip agora AVISA o que vai
                        // acontecer em vez de anunciar um bloqueio que não existe mais.
                        const { allowed, reason } = canDeleteSale({ status: record.status })
                        return (
                            <Tooltip title={allowed ? TOOLTIP_EXCLUIR : reason}>
                                {/* `span` porque o Tooltip do antd não dispara sobre botão desabilitado. */}
                                <span>
                                    <Button
                                        type="link"
                                        size="small"
                                        danger
                                        disabled={!allowed}
                                        onClick={() => actions.onExcluir(record)}
                                    >
                                        Excluir
                                    </Button>
                                </span>
                            </Tooltip>
                        )
                    })()}
                </Space>
            ),
        },
    ]

    if (isMobile) {
        return (
            <div className="pc-row-compact-list">
                {carregando && (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Carregando vendas…</div>
                )}
                {!carregando && rows.length === 0 && (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={vazio} style={{ padding: '24px 0' }} />
                )}
                {!carregando && rows.map((r: SaleRow) => {
                    const dateLabel = r.saleDate ? new Date(r.saleDate).toLocaleDateString('pt-BR') : '—'
                    const isAwaitingOrder = r.status === 'AWAITING_PAYMENT' && r.saleType === 'FROM_ORDER'
                    const statusLabel = isAwaitingOrder ? 'Aguardando pagamento' : 'Lançado'
                    const codigo = r.sale_code || '—'
                    // Doc 28/07: o menu ⋮ contém apenas "Ver" e "Cancelar venda". O botão
                    // "Cancelar" solto no card foi removido — a ação vive só no kebab.
                    const kebabItems: any[] = [
                        { key: 'view', label: 'Ver', onClick: () => actions.onVer(r) },
                        { key: 'cancel', label: 'Cancelar venda', danger: true, onClick: () => actions.onCancelar(r) },
                    ]
                    const podeExcluir = canDeleteSale({ status: r.status })
                    kebabItems.push({
                        key: 'delete',
                        label: podeExcluir.allowed ? 'Excluir permanentemente' : 'Excluir (já excluída)',
                        danger: true,
                        disabled: !podeExcluir.allowed,
                        onClick: () => actions.onExcluir(r),
                    })
                    // A faixa inferior de ações só aparece p/ vendas aguardando pagamento
                    // (botão "Lançar pagamento"). Vendas concluídas não exibem ações no card.
                    return (
                        <React.Fragment key={r.id}>
                            <div className={isAwaitingOrder ? 'pc-row-compact pc-row-compact--has-actions' : 'pc-row-compact'} onClick={() => actions.onVer(r)}>
                                <div className="pc-row-compact__main">
                                    <span className="pc-row-compact__title">{r.customerName || 'Sem cliente'}</span>
                                    <span className="pc-row-compact__sub">{codigo} · {dateLabel} · {statusLabel}</span>
                                </div>
                                <span className="pc-row-compact__value pc-row-compact__value--in">{formatCurrency(r.finalValue)}</span>
                                <Dropdown menu={{ items: kebabItems }} trigger={['click']} placement="bottomRight" open={openKebabId === r.id} onOpenChange={(o) => setOpenKebabId(o ? r.id : null)}>
                                    <span className="pc-row-compact__kebab" onClick={(e) => e.stopPropagation()}><MoreOutlined /></span>
                                </Dropdown>
                            </div>
                            {isAwaitingOrder && (
                                <div className="pc-row-compact__actions" onClick={(e) => e.stopPropagation()}>
                                    <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); actions.onLancarPagamento(r) }}>Lançar pagamento</Button>
                                </div>
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        )
    }

    return (
        <Table columns={columns} dataSource={rows} rowKey="id"
            pagination={{ pageSize: PAGE_SIZE, showTotal: (t) => `${t} vendas` }}
            size="middle" loading={carregando}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={vazio} /> }}
        />
    )
}
