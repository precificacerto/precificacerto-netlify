/**
 * ficha-do-cliente.component.tsx — a ficha, que é PÁGINA e não modal.
 *
 * A razão não é estética, e está na Parte II.1 da especificação: de um orçamento se tem de
 * alcançar o cliente; alcançar é link; link precisa de URL. Modal não tem endereço, não
 * recarrega e não abre em outra aba.
 *
 * AS ABAS VIVEM NA URL (`?aba=dados|orcamentos|pedidos|vendas`), e a edição também
 * (`?aba=dados&editar=1`). Não existe segunda tela de edição: o `<Drawer>` que havia em
 * `clientes/index.tsx:1269` deixou de existir.
 *
 * O HISTÓRICO NÃO É CONSULTA NOVA. É `carregarHistoricoDoCliente`, extraído literal do
 * `fetchTimeline` que já rodava no Drawer de Histórico — as mesmas 8 consultas, nas mesmas
 * 4 ondas, com a mesma visibilidade. O que mudou é que o resultado se reparte em três abas
 * por TIPO, em vez de cinco grupos empilhados num Drawer de 480px.
 *
 * O CLIENTE É CARREGADO POR ID, FORA DO `useCustomers`, e isto é decisão medida: aquele hook
 * filtra `is_active = true`, e **14 dos 116 clientes da base estão inativos**. Lê-lo dali
 * faria a ficha de um cliente inativo exibir "não encontrado" — que é afirmação falsa, e a
 * pior das duas possíveis, porque o documento dele continua existindo e sendo alcançável.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Spin, Tabs, Tag } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'

import { supabase } from '@/supabase/client'
import type { Customer } from '@/supabase/types'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { ROUTES } from '@/constants/routes'
import {
    HistoricoDoCliente,
    carregarHistoricoDoCliente,
    type TimelineEntry,
} from '@/page-parts/clientes/historico-do-cliente.component'
import { FormularioDoCliente } from '@/page-parts/clientes/formulario-do-cliente.component'
import { PARAM_DE_VOLTA, lerEnderecoDeVolta } from '@/utils/endereco-de-volta'

export const ABAS_DA_FICHA = ['dados', 'orcamentos', 'pedidos', 'vendas'] as const
export type AbaDaFicha = (typeof ABAS_DA_FICHA)[number]

/** A aba decide QUAL grupo do histórico aparece. `dados` não mostra histórico nenhum. */
const GRUPO_DA_ABA: Record<Exclude<AbaDaFicha, 'dados'>, 'BUDGET' | 'ORDER' | 'SALE'> = {
    orcamentos: 'BUDGET',
    pedidos: 'ORDER',
    vendas: 'SALE',
}

export const TEXTO_NAO_ENCONTRADO = 'Cliente não encontrado.'

function abaDaQuery(valor: unknown): AbaDaFicha {
    const texto = Array.isArray(valor) ? valor[0] : valor
    return (ABAS_DA_FICHA as readonly string[]).includes(String(texto)) ? (String(texto) as AbaDaFicha) : 'dados'
}

export interface FichaDoClienteProps {
    /** `null` é o cadastro novo (`/clientes/novo`). */
    customerId: string | null
}

export function FichaDoCliente({ customerId }: FichaDoClienteProps) {
    const router = useRouter()
    const { tenantId, currentUser } = useAuth()
    const { canView, canEdit } = usePermissions()

    const [cliente, setCliente] = useState<Customer | null>(null)
    const [carregando, setCarregando] = useState(customerId !== null)
    const [naoEncontrado, setNaoEncontrado] = useState(false)
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
    const [timeline, setTimeline] = useState<TimelineEntry[]>([])
    const [timelineCarregando, setTimelineCarregando] = useState(false)
    const [expandidoId, setExpandidoId] = useState<string | null>(null)

    const aba = abaDaQuery(router.query.aba)
    /**
     * VOLTAR DEVOLVE A LISTA COM OS FILTROS. O endereço veio no `de`, montado pela lista no
     * momento do clique — não dependemos de `router.back()`, que falha quando a ficha foi
     * aberta por link colado. Ver `endereco-de-volta.ts`.
     */
    const voltarParaLista = () => {
        const query = lerEnderecoDeVolta(router.query[PARAM_DE_VOLTA])
        void router.push(Object.keys(query).length > 0 ? { pathname: ROUTES.CLIENTS, query } : ROUTES.CLIENTS)
    }
    const editando = customerId === null || String(router.query.editar ?? '') === '1'

    const employeeMap = useMemo(() => {
        const m = new Map<string, string>()
        employees.forEach((e) => m.set(e.id, e.name))
        return m
    }, [employees])

    useEffect(() => {
        let cancelado = false
        ;(async () => {
            const { data, error } = await supabase.from('employees').select('id, name').order('name')
            if (error) throw error
            if (!cancelado) setEmployees((data as { id: string; name: string }[]) ?? [])
        })().catch((e) => console.error('Erro ao carregar funcionários:', e))
        return () => { cancelado = true }
    }, [])

    // O cliente, POR ID. Sem `is_active` no filtro — ver o cabeçalho.
    const recarregarCliente = useCallback(async () => {
        if (!customerId) return
        setCarregando(true)
        const { data, error } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle()
        if (error) throw error
        // RLS já restringe ao tenant: um id de outro tenant volta vazio, e o estado é o
        // mesmo de um id inexistente. Os dois são "não encontrado" para quem olha, e
        // distingui-los na tela VAZARIA a existência do registro alheio.
        if (!data) { setNaoEncontrado(true); setCliente(null) } else { setNaoEncontrado(false); setCliente(data as Customer) }
        setCarregando(false)
    }, [customerId])

    useEffect(() => {
        if (!customerId || !tenantId) return
        recarregarCliente().catch((e) => {
            console.error('Erro ao carregar cliente:', e)
            setNaoEncontrado(true)
            setCarregando(false)
        })
    }, [customerId, tenantId, recarregarCliente])

    useEffect(() => {
        if (!customerId || !tenantId) return
        const sinal = { cancelled: false }
        setTimelineCarregando(true)
        carregarHistoricoDoCliente(customerId, employeeMap, sinal)
            .then((entradas) => {
                // `null` é CANCELAMENTO, não "nenhum registro". Sobrescrever com `[]` diria
                // que o cliente não tem histórico, e é outra afirmação.
                if (entradas !== null) setTimeline(entradas)
            })
            .catch((e) => console.error('Erro ao carregar histórico:', e))
            .finally(() => { if (!sinal.cancelled) setTimelineCarregando(false) })
        return () => { sinal.cancelled = true }
    }, [customerId, tenantId, employeeMap])

    const irParaAba = (proxima: AbaDaFicha) => {
        const query: Record<string, string> = { ...(router.query as Record<string, string>), aba: proxima }
        delete query.editar
        void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true })
    }

    const abrirEdicao = () => {
        void router.replace(
            { pathname: router.pathname, query: { ...(router.query as Record<string, string>), aba: 'dados', editar: '1' } },
            undefined,
            { shallow: true },
        )
    }

    const fecharEdicao = () => {
        const query = { ...(router.query as Record<string, string>) }
        delete query.editar
        void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true })
    }

    if (!canView(MODULES.CUSTOMERS)) {
        return <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
    }

    if (carregando) {
        return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
    }

    // Estado explícito, nunca página em branco nem redirecionamento silencioso: o usuário
    // precisa saber que o endereço não corresponde a nada, e continuar com uma saída.
    if (naoEncontrado) {
        return (
            <div style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{TEXTO_NAO_ENCONTRADO}</div>
                <div style={{ color: 'var(--color-neutral-400)', marginBottom: 20 }}>
                    O endereço aponta para um cliente que não existe ou não pertence a esta conta.
                </div>
                <Button icon={<ArrowLeftOutlined />} onClick={voltarParaLista}>
                    Voltar para Clientes
                </Button>
            </div>
        )
    }

    const podeEditar = canEdit(MODULES.CUSTOMERS)

    const abaDados = editando && podeEditar ? (
        <FormularioDoCliente
            cliente={cliente}
            employees={employees}
            aoSalvar={async (idSalvo) => {
                if (!customerId) { void router.replace(`${ROUTES.CLIENTS}/${idSalvo}?aba=dados`); return }
                await recarregarCliente()
                fecharEdicao()
            }}
            aoCancelar={() => { if (!customerId) voltarParaLista(); else fecharEdicao() }}
        />
    ) : (
        <DadosEmConsulta cliente={cliente} employeeMap={employeeMap} />
    )

    const abaDeHistorico = (chave: Exclude<AbaDaFicha, 'dados'>) =>
        timelineCarregando ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
            <HistoricoDoCliente
                entries={timeline}
                expandidoId={expandidoId}
                aoAlternar={setExpandidoId}
                tipos={[GRUPO_DA_ABA[chave]]}
            />
        )

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={voltarParaLista}>Voltar</Button>
                {customerId !== null && cliente && podeEditar && !editando && (
                    <Button icon={<EditOutlined />} onClick={abrirEdicao}>Editar</Button>
                )}
            </div>
            {customerId === null ? (
                abaDados
            ) : (
                <Tabs
                    activeKey={aba}
                    onChange={(k) => irParaAba(k as AbaDaFicha)}
                    items={[
                        { key: 'dados', label: 'Dados', children: abaDados },
                        { key: 'orcamentos', label: 'Orçamentos', children: abaDeHistorico('orcamentos') },
                        { key: 'pedidos', label: 'Pedidos', children: abaDeHistorico('pedidos') },
                        { key: 'vendas', label: 'Vendas', children: abaDeHistorico('vendas') },
                    ]}
                />
            )}
        </div>
    )
}

/** A aba DADOS em consulta — os mesmos campos do formulário, sem poder mexer. */
function DadosEmConsulta({ cliente, employeeMap }: { cliente: Customer | null; employeeMap: Map<string, string> }) {
    if (!cliente) return null
    const c = cliente as any
    const linha = (rotulo: string, valor: React.ReactNode) => (
        <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ minWidth: 170, color: 'var(--color-neutral-400)', fontSize: 13 }}>{rotulo}</span>
            <span style={{ fontSize: 13 }}>{valor}</span>
        </div>
    )
    // Travessão, nunca string vazia: campo em branco e campo não preenchido são o mesmo
    // pixel, e o travessão diz que não há valor (`ausente-vs-falso.md`).
    const ou = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))
    return (
        <div style={{ maxWidth: 720 }}>
            {linha('Nome / Razão Social', ou(c.name))}
            {linha('Tipo', <Tag>{c.customer_type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</Tag>)}
            {linha('Documento', ou(c.document))}
            {linha('E-mail', ou(c.email))}
            {linha('Telefone', ou(c.phone))}
            {linha('WhatsApp', ou(c.whatsapp_phone))}
            {linha('CEP', ou(c.cep))}
            {linha('Endereço', ou([c.address, c.complement].filter(Boolean).join(', ') || null))}
            {linha('Cidade / UF', ou([c.city, c.state_code].filter(Boolean).join(' - ') || null))}
            {linha('Segmento', ou(c.segment))}
            {linha('Responsável', ou(c.owner_id ? employeeMap.get(c.owner_id) ?? null : null))}
            {linha('Observações', ou(c.notes))}
        </div>
    )
}
