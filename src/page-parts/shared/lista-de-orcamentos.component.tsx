/**
 * A LISTA DE ORÇAMENTOS — os DOIS ramos, desktop e cartões mobile, num componente só.
 *
 * O desenho e as razões são os de `lista-de-vendas.component.tsx`; o que é próprio daqui:
 *
 * ══ `customerId` É MODO, E NESTA LISTA ELE TEM OS DOIS EFEITOS ═══════════════════════════
 *
 * Ele NÃO filtra — quem filtra é quem monta as `rows`. Os efeitos são dois:
 *
 *  1. **suprime o filtro da coluna Cliente.** Filtrar por nome de cliente numa lista de UM
 *     cliente é ruído: o dropdown teria uma opção só, e ela já está aplicada;
 *  2. **muda o texto do vazio** — "este cliente não tem orçamento", não "nenhum orçamento
 *     encontrado". Dizer a segunda coisa na ficha de um cliente afirma que a tela não achou
 *     nada, quando o que houve foi este cliente não ter nenhum.
 *
 * ══ OS FILTROS DE COLUNA DERIVAM DE `rows`, E ISSO MUDA UMA COISA ═══════════════════════
 *
 * `uniqueClients` e `dateFilterOptions` eram `useMemo` sobre `budgets` — a lista INTEIRA,
 * antes dos filtros da página. Agora derivam de `rows`, que já vem filtrada, porque é a
 * entrada que o componente tem.
 *
 * **Consequência observável, e ela é real:** as opções dos dropdowns de Cliente, Data e
 * Número passam a refletir só o conjunto visível, encolhendo quando outro filtro estreita a
 * lista. Antes ofereciam opções de linhas que o filtro de status já havia escondido — e
 * escolher uma delas devolvia lista vazia. É a única diferença de comportamento desta
 * extração, foi decidida na especificação da etapa, e está escrita aqui para não ser
 * descoberta como defeito.
 *
 * O RISCO que isso poderia abrir foi MEDIDO e não existe: o filtro de coluna do antd é
 * interno à `<Table>` e não toca `rows`, então escolher um cliente NÃO encolhe a lista de
 * opções. `o-filtro-de-coluna-nao-se-estrangula.test.tsx` exercita os cinco casos.
 *
 * ══ O `estado`, E POR QUE ELE EXISTE ════════════════════════════════════════════════════
 *
 * `enviandoWhatsAppId` e `segundosDeEsperaWhatsApp` são estado da PÁGINA: o
 * `handleSendWhatsApp` dela os escreve, e o drawer de detalhe também os lê. Não podem morar
 * aqui — mas a lista precisa deles, nos DOIS ramos: o botão do desktop mostra o contador
 * regressivo e o item do kebab mobile fica desabilitado. Sem eles o diff de comportamento
 * NÃO seria vazio.
 *
 * Eles são DADO, da família de `rows`, não dependência — e é por isso que não estavam na
 * enumeração dos identificadores contra a qual a interface foi escrita pela primeira vez. A
 * enumeração os perdeu porque o instrumento não via declaração por desestruturação
 * (`const [sendingWaId, setSendingWaId] = useState(...)`), e `instrumento-que-nao-enxerga.md`
 * manda refazer a medição quando o detector melhora.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, Empty, Popconfirm, Space, Table, Tag } from 'antd'
import { EditOutlined, MoreOutlined, SendOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { RequiresReviewBadge } from '@/components/mrm/RequiresReviewBadge'
import { PAGE_SIZE } from '@/constants/pagination'
import { STATUS_DO_ORCAMENTO } from '@/constants/status-do-orcamento'
import { useDevice } from '@/contexts/device.context'
import { formatBRL } from '@/utils/formatters'

const formatCurrency = formatBRL

/** Célula de cabeçalho que mantém título + ícone de ordenação + ícone de filtro agrupados à esquerda */
function TableHeaderCell(props: React.HTMLAttributes<HTMLTableCellElement> & { children?: React.ReactNode }) {
    const { children, ...rest } = props
    return (
        <th {...rest}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4, flexWrap: 'nowrap' }}>
                {children}
            </div>
        </th>
    )
}
/**
 * A linha da lista de orçamentos.
 *
 * O índice aberto é o que a página já tinha (`ColumnsType<any>`): o orçamento carrega dezenas
 * de colunas e a lista lê sete. Estreitar o tipo aqui seria mudança de outra natureza.
 */
export type BudgetRow = {
    id: string
    status: string
    created_at: string
    total_value?: number | string | null
    requires_review?: boolean
    customer?: { name?: string | null; phone?: string | null; whatsapp_phone?: string | null } | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [extra: string]: any
}

export type AcoesDaListaDeOrcamentos = {
    onVer: (orcamento: BudgetRow) => void
    onEditar: (orcamento: BudgetRow) => void
    onEnviarWhatsApp: (orcamento: BudgetRow) => void
    onEnviarParaVenda: (orcamento: BudgetRow) => void
    onEnviarParaPedido: (orcamento: BudgetRow) => void
    onFinalizar: (orcamento: BudgetRow) => void
    onExcluir: (orcamento: BudgetRow) => void
}

export type ListaDeOrcamentosProps = {
    rows: BudgetRow[]
    actions: AcoesDaListaDeOrcamentos
    /** MODO, não filtro: presente = a lista é de UM cliente. Ver o cabeçalho. */
    customerId?: string
    estado?: {
        carregando?: boolean
        enviandoWhatsAppId?: string | null
        segundosDeEsperaWhatsApp?: number
    }
}

export function vazioDaListaDeOrcamentos(customerId?: string): string {
    return customerId ? 'Este cliente não tem orçamento' : 'Nenhum orçamento encontrado'
}

export function ListaDeOrcamentos({ rows, actions, customerId, estado }: ListaDeOrcamentosProps) {
    const { isMobile } = useDevice()
    const carregando = estado?.carregando === true
    const enviandoWaId = estado?.enviandoWhatsAppId ?? null
    const waThrottleSecondsLeft = estado?.segundosDeEsperaWhatsApp ?? 0
    const [openKebabId, setOpenKebabId] = useState<string | null>(null)

    // Doc 29/07 (item 1.1.6): fecha o ⋮ aberto ao rolar qualquer container (fase de captura
    // pega o scroll da lista mobile, que tem overflow próprio e não borbulha).
    useEffect(() => {
        if (openKebabId == null) return
        const close = () => setOpenKebabId(null)
        window.addEventListener('scroll', close, true)
        return () => window.removeEventListener('scroll', close, true)
    }, [openKebabId])

    const vazio = vazioDaListaDeOrcamentos(customerId)

    /** As opções do filtro de Cliente. `null` = a coluna NÃO oferece o filtro. */
    const uniqueClients = useMemo(() => {
        if (customerId) return null
        const names = new Map<string, string>()
        rows.forEach((b) => {
            const n = b.customer?.name || 'Sem cliente'
            if (n) names.set(n, n)
        })
        return Array.from(names.entries()).map(([value, text]) => ({ text, value }))
    }, [rows, customerId])

    const dateFilterOptions = useMemo(() => {
        const set = new Set<string>()
        rows.forEach((b) => { set.add(new Date(b.created_at).toLocaleDateString('pt-BR')) })
        return Array.from(set).sort().map((d) => ({ text: d, value: d }))
    }, [rows])

    const columns: ColumnsType<BudgetRow> = [
        {
            title: 'Número orçamento',
            key: 'number',
            width: 130,
            filters: rows.slice(0, 30).map(r => ({ text: `ORC-${r.id.substring(0, 4).toUpperCase()}`, value: r.id })),
            onFilter: (value, record) => record.id === value,
            render: (_, r) => <span style={{ fontWeight: 600, color: 'var(--color-primary-700)' }}>ORC-{r.id.substring(0, 4).toUpperCase()}</span>,
        },
        {
            title: 'Cliente',
            key: 'client',
            sorter: (a, b) => (a.customer?.name || '').localeCompare(b.customer?.name || ''),
            // Suprimido no MODO ficha: filtrar por cliente numa lista de um cliente é ruído.
            ...(uniqueClients
                ? {
                    filters: uniqueClients,
                    onFilter: (value: boolean | React.Key, record: BudgetRow) =>
                        (record.customer?.name || 'Sem cliente') === value,
                }
                : {}),
            render: (_, r) => r.customer?.name || 'Sem cliente',
        },
        {
            title: 'Data',
            key: 'date',
            render: (_, r) => new Date(r.created_at).toLocaleDateString('pt-BR'),
            sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            defaultSortOrder: 'descend',
            filters: dateFilterOptions,
            onFilter: (value, record) => new Date(record.created_at).toLocaleDateString('pt-BR') === value,
        },
        {
            title: 'Valor Total',
            key: 'total',
            render: (_, r) => <span style={{ fontWeight: 600 }}>{formatCurrency(Number(r.total_value || 0))}</span>,
            sorter: (a, b) => Number(a.total_value) - Number(b.total_value),
            filters: [
                { text: 'Até R$ 100', value: '0-100' },
                { text: 'R$ 100 - R$ 500', value: '100-500' },
                { text: 'R$ 500 - R$ 1.000', value: '500-1000' },
                { text: 'Acima de R$ 1.000', value: '1000+' },
            ],
            onFilter: (value, record) => {
                const v = Number(record.total_value || 0)
                if (value === '0-100') return v <= 100
                if (value === '100-500') return v > 100 && v <= 500
                if (value === '500-1000') return v > 500 && v <= 1000
                if (value === '1000+') return v > 1000
                return false
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            filters: Object.entries(STATUS_DO_ORCAMENTO).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value, record) => record.status === value,
            render: (status: string, record: BudgetRow) => {
                const cfg = STATUS_DO_ORCAMENTO[status] || { color: 'default', label: status }
                return (
                    <span>
                        <Tag color={cfg.color}>{cfg.label}</Tag>
                        {/* MRM S2.3 — badge "Requer revisão" quando policy marcou RRO ≤ 0 */}
                        {record?.requires_review === true && <RequiresReviewBadge />}
                    </span>
                )
            },
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 320,
            filters: [
                { text: 'Com Editar', value: 'edit' },
                { text: 'Com Enviar WhatsApp', value: 'send' },
                { text: 'Com Excluir', value: 'delete' },
            ],
            onFilter: (value, record) => {
                if (value === 'edit') return true
                if (value === 'send') return !!(record.customer?.whatsapp_phone || record.customer?.phone)
                if (value === 'delete') return record.status !== 'CANCELLED'
                return false
            },
            render: (_, record) => {
                // Doc 29/07 (itens 1.2.7 / 2.1.2 — caso ORC-617A): registro já evoluído de etapa
                // (enviado para vendas/pedido ou pago) só permite "Ver" — abre o detalhe completo.
                const isEvolved = ['AWAITING_PAYMENT', 'SENT', 'APPROVED', 'SENT_TO_ORDER', 'PAID'].includes(record.status)
                if (isEvolved) {
                    return (
                        <Space wrap>
                            <Button type="link" size="small" onClick={() => actions.onVer(record)}>Ver</Button>
                        </Space>
                    )
                }
                return (
                <Space wrap>
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => actions.onEditar(record)}>Editar</Button>
                    <Button type="link" size="small" onClick={() => actions.onVer(record)}>Ver</Button>
                    <Button
                        type="link"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={() => actions.onEnviarWhatsApp(record)}
                        loading={enviandoWaId === record.id}
                        disabled={waThrottleSecondsLeft > 0}
                        title={waThrottleSecondsLeft > 0 ? `Aguarde ${waThrottleSecondsLeft}s entre envios` : undefined}
                    >
                        {waThrottleSecondsLeft > 0 ? `Enviar via WhatsApp (${waThrottleSecondsLeft}s)` : 'Enviar via WhatsApp'}
                    </Button>
                    {record.status === 'DRAFT' && (
                        <Popconfirm
                            title="Enviar para vendas?"
                            description="O orçamento irá para o status 'Aguardando pagamento' sem notificar o cliente."
                            okText="Enviar"
                            cancelText="Cancelar"
                            onConfirm={() => actions.onEnviarParaVenda(record)}
                        >
                            <Button
                                type="link"
                                size="small"
                                icon={<ShoppingCartOutlined />}
                                style={{ color: '#12B76A' }}
                                title="Enviar para vendas (aguardando pagamento), sem enviar ao cliente"
                            >
                                Enviar para vendas
                            </Button>
                        </Popconfirm>
                    )}
                    {record.status === 'DRAFT' && (
                        <Popconfirm
                            title="Enviar para pedido?"
                            description="Um pedido será criado a partir deste orçamento, com todos os itens e dados."
                            okText="Sim, enviar"
                            cancelText="Não"
                            onConfirm={() => actions.onEnviarParaPedido(record)}
                        >
                            <Button
                                type="link"
                                size="small"
                                icon={<ShoppingCartOutlined />}
                                style={{ color: '#2563eb' }}
                                title="Enviar para pedido"
                            >
                                Enviar para Pedido
                            </Button>
                        </Popconfirm>
                    )}
                    {(record.status === 'APPROVED' || record.status === 'AWAITING_PAYMENT') && (
                        <Button type="link" size="small" style={{ color: '#12B76A' }} onClick={() => actions.onFinalizar(record)}>
                            Finalizar
                        </Button>
                    )}
                    {record.status !== 'CANCELLED' && (
                        <Button
                            type="link"
                            size="small"
                            danger
                            onClick={() => actions.onExcluir(record)}
                        >
                            Excluir
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
                    rows.map((r: BudgetRow) => {
                        const cfg = STATUS_DO_ORCAMENTO[r.status] || { color: 'default', label: r.status }
                        const dataFmt = new Date(r.created_at).toLocaleDateString('pt-BR')
                        const orcCode = `ORC-${r.id.substring(0, 4).toUpperCase()}`
                        const hasPhone = !!(r.customer?.whatsapp_phone || r.customer?.phone)
                        const isDraft = r.status === 'DRAFT'
                        const canDelete = r.status !== 'CANCELLED'
                        // Doc 29/07 (itens 1.2.7 / 2.1.2 — ORC-617A): registro já evoluído de etapa
                        // (enviado para vendas/pedido ou pago) só permite "Ver" no ⋮.
                        const isEvolved = ['AWAITING_PAYMENT', 'SENT', 'APPROVED', 'SENT_TO_ORDER', 'PAID'].includes(r.status)
                        // Doc 28/07: uma vez enviado para Pedido, o card NÃO exibe mais nenhuma ação.
                        // Só o rascunho mostra a linha de ações (Enviar para Pedido + Editar).
                        const showActions = isDraft
                        // Doc 29/07: ⋮ = apenas "Ver" quando evoluído; no rascunho/estados finais mantém WhatsApp/Enviar/Excluir.
                        const kebabItems: any[] = [
                            { key: 'view', label: 'Ver', onClick: () => actions.onVer(r) },
                        ]
                        if (hasPhone && !isEvolved) {
                            kebabItems.push({ key: 'wa', label: 'Enviar via WhatsApp', disabled: waThrottleSecondsLeft > 0, onClick: () => { if (waThrottleSecondsLeft <= 0) actions.onEnviarWhatsApp(r) } })
                        }
                        if (isDraft) {
                            // ORC-002 (Relatório 24/07): a ação de avançar para o fluxo de venda
                            // (aguardando pagamento) é "Enviar para Venda" (onEnviarParaVenda).
                            // "Enviar para Pedido" (onEnviarParaPedido) vira o botão visível azul.
                            kebabItems.push({ key: 'sale', label: 'Enviar para Venda', onClick: () => actions.onEnviarParaVenda(r) })
                        }
                        if (canDelete && !isEvolved) {
                            kebabItems.push({ key: 'del', label: 'Excluir', danger: true, onClick: () => actions.onExcluir(r) })
                        }
                        return (
                            <React.Fragment key={r.id}>
                                <div
                                    className={showActions ? 'pc-row-compact pc-row-compact--has-actions' : 'pc-row-compact'}
                                    onClick={() => actions.onVer(r)}
                                >
                                    <div className="pc-row-compact__main">
                                        <span className="pc-row-compact__title">{r.customer?.name || 'Sem cliente'}</span>
                                        <span className="pc-row-compact__sub">{orcCode} · {dataFmt} · {cfg.label}</span>
                                    </div>
                                    <span className="pc-row-compact__value">{formatCurrency(Number(r.total_value || 0))}</span>
                                    <Dropdown menu={{ items: kebabItems }} trigger={['click']} placement="bottomRight" open={openKebabId === r.id} onOpenChange={(o) => setOpenKebabId(o ? r.id : null)}>
                                        <span className="pc-row-compact__kebab" onClick={(e) => e.stopPropagation()}><MoreOutlined /></span>
                                    </Dropdown>
                                </div>
                                {showActions && (
                                    <div className="pc-row-compact__actions" onClick={(e) => e.stopPropagation()}>
                                        {/* ORC-003 (Relatório 24/07): botão visível primário = "Enviar para
                                            Pedido" AZUL (onEnviarParaPedido); "Excluir" vira "Editar" (neutro).
                                            Verde fica reservado ao "Enviar para vendas" (agora no kebab como
                                            "Enviar para Venda"). Excluir permanece disponível no kebab. */}
                                        {/* Doc 28/07: o botão "Finalizar" NÃO pode existir na tela de
                                            Orçamentos (confirmação de recebimento é responsabilidade de
                                            Vendas). Rascunho exibe apenas Enviar para Pedido + Editar. */}
                                        {isDraft && (
                                            <Button size="small" type="primary" style={{ background: '#2563eb', borderColor: '#2563eb' }} onClick={(e) => { e.stopPropagation(); actions.onEnviarParaPedido(r) }}>Enviar para Pedido</Button>
                                        )}
                                        {isDraft && (
                                            <Button size="small" onClick={(e) => { e.stopPropagation(); actions.onEditar(r) }}>Editar</Button>
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
            columns={columns}
            dataSource={rows}
            rowKey="id"
            pagination={{ pageSize: PAGE_SIZE, showTotal: (t) => `${t} orçamentos` }}
            size="middle"
            loading={carregando}
            components={{ header: { cell: TableHeaderCell } }}
        />
    )
}
