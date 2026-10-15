import React, { useState, useEffect, useMemo } from 'react'
import {
    LIFECYCLE_STYLE,
    buildCarimboUltimaAlteracao,
    resolveDocumentLifecycle,
    resolveOrderStatusLabel,
    statusExibivelNoHistorico,
    type CarimboDeTempo,
    type DocumentLifecycle,
} from '@/utils/customer-history-status'
import { Button, Dropdown, Input, Modal, Space, Table, Tag, message, Popconfirm, Spin, Tooltip } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useRouter } from 'next/router'
import { PARAM_DE_VOLTA, enderecoDeVolta } from '@/utils/endereco-de-volta'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import type { Customer, CustomerType, CustomerStatus } from '@/supabase/types'
import { useCustomers } from '@/hooks/use-data.hooks'
import { useParcelasDeReceber } from '@/hooks/use-data.hooks'
import { useFiltrosDeCobrancaNaUrl } from '@/hooks/use-filtros-de-cobranca.hook'
import { montarParcelasDoCliente } from '@/utils/parcelas-do-cliente'
import { aplicarFiltrosDeCobranca, type FiltrosDeCobranca } from '@/utils/filtros-de-cobranca'
import { hojeNoFusoDoNegocio } from '@/utils/dia-de-hoje'
import { FiltrosDeCobrancaBar } from '@/page-parts/shared/filtros-de-cobranca.component'
import { colunasDeCobranca } from '@/page-parts/shared/colunas-de-cobranca.component'
import {
    TeamOutlined,
    UserAddOutlined,
    CheckCircleOutlined,
    ShopOutlined,
    SearchOutlined,
    PlusOutlined,
    WhatsAppOutlined,
    HistoryOutlined,
    PaperClipOutlined,
    FileTextOutlined,
    DownloadOutlined,
    ClockCircleOutlined,
    BookOutlined,
    ReloadOutlined,
    ShoppingCartOutlined,
    MoreOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { PAGE_SIZE } from '@/constants/pagination'
import { useAuth } from '@/hooks/use-auth.hook'
import { useDevice } from '@/contexts/device.context'

const segments = ['Alimentício', 'Varejo', 'Tecnologia', 'Serviços', 'Indústria', 'Beleza', 'Saúde', 'Outros']

const capitalizeFirst = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1)

const typeLabels: Record<CustomerType, { label: string; color: string }> = {
    PF: { label: 'Pessoa Física', color: 'green' },
    PJ: { label: 'Pessoa Jurídica', color: 'blue' },
}

const statusLabels: Record<CustomerStatus, { label: string; color: string }> = {
    ACTIVE: { label: 'Ativo', color: 'success' },
    INACTIVE: { label: 'Inativo', color: 'default' },
}

/**
 * Linhas que o histórico lê. Declaradas aqui porque os tipos gerados do Supabase não
 * expressam o embed `products(id, name)` / `services(id, name)` — e um `any` solto aqui
 * apagaria justamente os campos cuja presença o painel depende.
 */

function Clients() {
    const { data: customers = [], isLoading, mutate: reloadCustomers } = useCustomers()
    const { data: dadosDeCobranca } = useParcelasDeReceber()
    // Os filtros moram na URL — ver `use-filtros-de-cobranca.hook.ts`. `searchText` deixou de
    // ser `useState` porque estado de componente morre na desmontagem, e "voltar da ficha com
    // os filtros como estavam" exige que eles já estejam no endereço ANTES de sair da lista.
    const { filtros, definirFiltros } = useFiltrosDeCobrancaNaUrl(ROUTES.CLIENTS)
    const searchText = filtros.busca
    // `hoje` é lido UMA vez por montagem, no fuso do negócio, e injetado nos dois módulos
    // puros. Nenhum deles chama `new Date()`.
    const hoje = useMemo(() => hojeNoFusoDoNegocio(), [])
    // A ordem do nome é controlada para que o `sorter` do antd NÃO brigue com a ordenação
    // por maior atraso: com EM ATRASO ligado, `sortOrder` vira `null` e quem manda é a
    // ordem do `dataSource`.
    const [ordemDoNome, setOrdemDoNome] = useState<'ascend' | 'descend' | null>('ascend')
    const [messageApi, contextHolder] = message.useMessage()
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])

    const router = useRouter()

    /**
     * O link da ficha, LEVANDO O ENDEREÇO DE VOLTA.
     *
     * Sem o `de`, o botão Voltar da ficha cairia numa lista sem filtro — ver
     * `endereco-de-volta.ts`. Ele é montado da query ATUAL da lista, que já é a fonte dos
     * filtros desde a 4a.
     */
    const linkDaFicha = (id: string, extra?: Record<string, string>) => ({
        pathname: `${ROUTES.CLIENTS}/[id]`,
        query: {
            id,
            aba: 'dados',
            ...extra,
            [PARAM_DE_VOLTA]: enderecoDeVolta(router.query as Record<string, string | string[] | undefined>),
        },
    })

    const { canView, canEdit } = usePermissions()
    const { isMobile } = useDevice()
    const { currentUser, tenantId } = useAuth()
    const isSuperAdmin = currentUser?.is_super_admin === true
    const isAdminRole = isSuperAdmin || (currentUser?.role && String(currentUser.role).toLowerCase() === 'admin')

    const canEditCustomer = (record: Customer): boolean => {
        if (isAdminRole) return true
        if (!record.owner_id) return true
        return record.owner_id === currentUser?.employee_id
    }

    if (!canView(MODULES.CUSTOMERS)) {
        return <Layout title={PAGE_TITLES.CLIENTS}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    const fetchEmployees = async () => {
        const { data } = await supabase
            .from('employees')
            .select('id, name, status')
            .eq('status', 'ACTIVE')
            .eq('is_active', true)
            .order('name')
        setEmployees((data || []).map((e: any) => ({ id: e.id, name: e.name })))
    }

    useEffect(() => {
        fetchEmployees()
    }, [])

    const employeeMap = useMemo(() => {
        const map = new Map<string, string>()
        employees.forEach(e => map.set(e.id, e.name))
        return map
    }, [employees])

    // As parcelas em ABERTO: é delas que saem os três filtros e as colunas partidas. O
    // bloco 4 do detalhe da compra usa `'TODAS'` sobre a MESMA carga — uma consulta, quatro
    // consumidores.
    const cobranca = useMemo(
        () =>
            montarParcelasDoCliente({
                parcelas: dadosDeCobranca?.parcelas ?? [],
                vendas: dadosDeCobranca?.vendas ?? [],
                hoje,
                escopo: 'ABERTAS',
            }),
        [dadosDeCobranca, hoje],
    )

    const filteredData = useMemo(() => {
        let base = customers as Customer[]

        if (searchText) {
            const lower = searchText.toLowerCase()
            base = base.filter(c =>
                c.name.toLowerCase().includes(lower) ||
                (c.document || '').includes(searchText) ||
                (c.email || '').toLowerCase().includes(lower) ||
                (c.phone || '').includes(searchText)
            )
        }

        // Situação e segmento são aplicados AQUI, no nível da página, e não só pelo `onFilter`
        // da coluna: o ramo MOBILE não usa `<Table>`, e um filtro que vivesse só na coluna
        // sairia na URL e seria ignorado no celular.
        if (filtros.situacao.length > 0) base = base.filter(c => filtros.situacao.includes(String(c.status)))
        if (filtros.segmento.length > 0) base = base.filter(c => filtros.segmento.includes(String(c.segment ?? '')))

        return aplicarFiltrosDeCobranca({
            clientes: base,
            porCliente: cobranca.porCliente,
            parcelas: cobranca.parcelas,
            filtros,
        })
    }, [customers, searchText, filtros, cobranca])

    // ── KPIs ──
    const totalClients = customers.length
    const activeClients = customers.filter(c => c.status === 'ACTIVE').length
    const pjClients = customers.filter(c => c.customer_type === 'PJ').length
    const withWhatsapp = customers.filter(c => c.whatsapp_phone).length

    const columns: ColumnsType<Customer> = [
        {
            title: 'Cliente',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            // Controlado: com EM ATRASO ligado vira `null`, e a ordem por MAIOR ATRASO que
            // `aplicarFiltrosDeCobranca` deu ao `dataSource` é a que vale.
            sortOrder: filtros.emAtraso ? null : ordemDoNome,
            render: (_, record) => (
                <div>
                    {/* O NOME É LINK. É por ele que se alcança a ficha, e é o que a Parte
                        II.1 exige: alcançar é link, link precisa de URL. */}
                    <a
                        style={{ fontWeight: 600 }}
                        onClick={(e) => { e.preventDefault(); void router.push(linkDaFicha(record.id)) }}
                        href={`${ROUTES.CLIENTS}/${record.id}`}
                    >
                        {record.name}
                    </a>
                    <div style={{ fontSize: 12, color: 'var(--color-neutral-400)' }}>
                        {record.city}{record.state_code ? ` - ${record.state_code}` : ''}
                    </div>
                </div>
            ),
        },
        {
            title: 'Documento',
            key: 'document',
            render: (_, record) => (
                <span>
                    <Tag color={typeLabels[record.customer_type]?.color || 'default'} style={{ marginRight: 6 }}>
                        {record.customer_type}
                    </Tag>
                    {record.document || '-'}
                </span>
            ),
        },
        {
            title: 'WhatsApp',
            key: 'whatsapp_phone',
            render: (_, record) => (
                <div>
                    {record.whatsapp_phone ? (
                        <div style={{ color: '#25D366', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <WhatsAppOutlined /> {record.whatsapp_phone}
                        </div>
                    ) : '-'}
                </div>
            ),
        },
        // As colunas de cobrança ficam ao lado do WhatsApp de propósito: a coluna partida
        // existe para fazer alguém pegar o telefone, e o telefone está logo à esquerda.
        ...colunasDeCobranca<Customer>(cobranca.porCliente),
        {
            title: 'Segmento',
            dataIndex: 'segment',
            key: 'segment',
            filters: segments.map(s => ({ text: s, value: s })),
            // CONTROLADO pela URL. Antes vivia dentro do `<Table>` e morria na desmontagem:
            // não existia como estado, então não havia o que pôr no endereço.
            filteredValue: filtros.segmento.length > 0 ? filtros.segmento : null,
            onFilter: (value, record) => record.segment === value,
        },
        {
            title: 'Responsável',
            key: 'owner',
            render: (_, record) => {
                if (!record.owner_id) return '—'
                const fromMap = employeeMap.get(record.owner_id)
                return fromMap || '—'
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            filters: Object.entries(statusLabels).map(([k, v]) => ({ text: v.label, value: k })),
            filteredValue: filtros.situacao.length > 0 ? filtros.situacao : null,
            onFilter: (value, record) => record.status === value,
            render: (status: CustomerStatus) => {
                const cfg = statusLabels[status]
                return <Tag color={cfg?.color || 'default'}>{cfg?.label || status}</Tag>
            },
        },
        {
            title: '',
            key: 'history',
            width: 48,
            render: (_, record) => (
                <Tooltip title="Histórico do cliente">
                    <Button
                        type="text"
                        size="small"
                        icon={<BookOutlined style={{ color: '#7A5AF8', fontSize: 16 }} />}
                        onClick={() => { void router.push(linkDaFicha(record.id, { aba: 'vendas' })) }}
                    />
                </Tooltip>
            ),
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 160,
            render: (_, record) => {
                const allowed = canEdit(MODULES.CUSTOMERS) && canEditCustomer(record)
                return (
                    <Space>
                        {allowed ? (
                            <Button type="link" size="small" onClick={() => handleEdit(record)}>Editar</Button>
                        ) : (
                            <Tooltip title="Somente o responsável pode editar este cliente">
                                <Button type="link" size="small" disabled>Editar</Button>
                            </Tooltip>
                        )}
                        {/* "Desativar" prometia REVERSIBILIDADE QUE NÃO EXISTE: a ação já era soft
                            delete (`is_active = false`, nunca DELETE físico) e já era irreversível na
                            prática, porque `useCustomers` filtra `is_active = true` e NÃO HÁ TELA DE
                            REATIVAÇÃO. Renomear não muda comportamento — TORNA O RÓTULO HONESTO SOBRE O
                            QUE JÁ ACONTECE. É `ausente-vs-falso.md` visto do lado do RÓTULO: ele afirmava
                            um estado reversível que o sistema não oferece.
                            Sinal de que a descrição já estava divergindo: o tooltip do ramo sem permissão
                            JÁ DIZIA "excluir" enquanto o botão dizia "Desativar". */}
                        {allowed ? (
                            <Popconfirm
                                title="Excluir cliente?"
                                description="O cliente sai das listagens e não há como reativá-lo. Os documentos dele permanecem."
                                okText="Excluir"
                                cancelText="Cancelar"
                                onConfirm={() => handleDelete(record.id)}
                            >
                                <Button type="link" size="small" danger>Excluir</Button>
                            </Popconfirm>
                        ) : (
                            <Tooltip title="Somente o responsável pode excluir este cliente">
                                <Button type="link" size="small" danger disabled>Excluir</Button>
                            </Tooltip>
                        )}
                    </Space>
                )
            },
        },
    ]

    function handleSearch(value: string) {
        definirFiltros({ ...filtros, busca: value })
    }

    /** EDITAR é a MESMA página da ficha, em modo de edição. Não há segunda tela. */
    function handleEdit(record: Customer) {
        void router.push(linkDaFicha(record.id, { editar: '1' }))
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch('/api/delete/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Erro ao excluir')
            await reloadCustomers()
            messageApi.success('Cliente excluído!')
        } catch (error: any) {
            console.error('Erro ao excluir:', error)
            messageApi.error('Erro ao excluir: ' + error.message)
        }
    }

    function handleAdd() {
        void router.push(ROUTES.CLIENTS + '/novo')
    }


    return (
        <Layout title={PAGE_TITLES.CLIENTS} subtitle="Gerenciamento de clientes e contatos">
            {contextHolder}

            {/* KPIs */}
            <div className="kpi-grid">
                <CardKPI title="Total de Clientes" value={totalClients} icon={<TeamOutlined />} variant="blue" />
                <CardKPI title="Clientes Ativos" value={activeClients} icon={<CheckCircleOutlined />} variant="green" />
                <CardKPI title="Pessoa Jurídica" value={pjClients} icon={<ShopOutlined />} variant="orange" />
                <CardKPI title="Com WhatsApp" value={withWhatsapp} icon={<WhatsAppOutlined />} variant="green" />
            </div>

            <div className="pc-card--table">
                <div className="filter-bar">
                    <Input
                        placeholder="Buscar por nome, documento, email ou telefone..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        style={{ maxWidth: 400 }}
                        allowClear
                    />
                    <div style={{ flex: 1 }} />
                    {canEdit(MODULES.CUSTOMERS) && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                            Novo Cliente
                        </Button>
                    )}
                </div>
                <div className="filter-bar" style={{ paddingTop: 0 }}>
                    <FiltrosDeCobrancaBar filtros={filtros} onChange={definirFiltros} hoje={hoje} />
                </div>
                {isMobile ? (
                    <div className="clientes-mobile-list">
                        {isLoading ? (
                            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
                        ) : filteredData.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Nenhum cliente encontrado.</div>
                        ) : (
                            (filteredData as Customer[]).map((record) => {
                                const allowed = canEdit(MODULES.CUSTOMERS) && canEditCustomer(record)
                                const subParts = [
                                    record.customer_type,
                                    record.document || undefined,
                                    record.whatsapp_phone || record.phone || undefined,
                                ].filter(Boolean)
                                const menuItems = [
                                    {
                                        key: 'history',
                                        label: 'Histórico',
                                        onClick: () => {
                                            void router.push(linkDaFicha(record.id, { aba: 'vendas' }))
                                        },
                                    },
                                    {
                                        key: 'edit',
                                        label: 'Editar',
                                        disabled: !allowed,
                                        onClick: () => { if (allowed) handleEdit(record) },
                                    },
                                    {
                                        key: 'del',
                                        label: 'Excluir',
                                        danger: true,
                                        disabled: !allowed,
                                        // O cartão mobile não tem Popconfirm; sem este `Modal.confirm` a
                                        // exclusão aconteceria SEM CONFIRMAÇÃO NENHUMA — e a ação é
                                        // irreversível. `copia-divergente.md`: são dois pontos montando a
                                        // mesma ação, e um deles não pode ficar sem a barreira do outro.
                                        onClick: () => {
                                            if (!allowed) return
                                            Modal.confirm({
                                                title: 'Excluir cliente?',
                                                content: 'O cliente sai das listagens e não há como reativá-lo. Os documentos dele permanecem.',
                                                okText: 'Excluir',
                                                okButtonProps: { danger: true },
                                                cancelText: 'Cancelar',
                                                onOk: () => handleDelete(record.id),
                                            })
                                        },
                                    },
                                ]
                                return (
                                    <div
                                        key={record.id}
                                        className="pc-row-compact"
                                        onClick={() => { if (allowed) handleEdit(record) }}
                                    >
                                        <div className="pc-row-compact__main">
                                            <span className="pc-row-compact__title">{record.name}</span>
                                            <span className="pc-row-compact__sub">{subParts.join(' · ')}</span>
                                        </div>
                                        <Dropdown
                                            menu={{ items: menuItems }}
                                            trigger={['click']}
                                            placement="bottomRight"
                                        >
                                            <span className="pc-row-compact__kebab" onClick={(e) => e.stopPropagation()}>
                                                <MoreOutlined />
                                            </span>
                                        </Dropdown>
                                    </div>
                                )
                            })
                        )}
                    </div>
                ) : (
                    <Table
                        columns={columns}
                        dataSource={filteredData}
                        rowKey="id"
                        pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true, showTotal: (t) => `${t} clientes` }}
                        size="middle"
                        loading={isLoading}
                        onChange={(_paginacao, filtrosDaTabela, ordenacao) => {
                            // Os dois filtros de coluna sobem para a URL. Sem isto eles
                            // continuariam existindo só dentro do `<Table>`.
                            const comoLista = (v: unknown): string[] =>
                                Array.isArray(v) ? v.map(String) : []
                            const proximos: FiltrosDeCobranca = {
                                ...filtros,
                                segmento: comoLista(filtrosDaTabela.segment),
                                situacao: comoLista(filtrosDaTabela.status),
                            }
                            if (
                                proximos.segmento.join(',') !== filtros.segmento.join(',') ||
                                proximos.situacao.join(',') !== filtros.situacao.join(',')
                            ) {
                                definirFiltros(proximos)
                            }
                            const ordem = Array.isArray(ordenacao) ? ordenacao[0] : ordenacao
                            if (ordem && ordem.columnKey === 'name') {
                                setOrdemDoNome((ordem.order as 'ascend' | 'descend' | undefined) ?? null)
                            }
                        }}
                    />
                )}
            </div>



        </Layout>
    )
}

export default Clients
