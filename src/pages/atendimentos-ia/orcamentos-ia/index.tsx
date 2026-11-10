/**
 * /atendimentos-ia/orcamentos-ia — os ORÇAMENTOS I.A. (dono do produto, 09/11/2026), em Agentes I.A., ao lado de "Conectividade I.A.".
 *
 * A tela espelha a lista de Produtos (`src/pages/produtos/index.tsx`): a busca e o botão de criar no alto, uma linha por orçamento, e na linha a
 * ação Editar. Das ações de Produtos ficam só as que fazem sentido no orçamento — Buscar, Editar e Criar ("Adicionar produto" vira "Criar
 * orçamento"). Ficam de fora, por decisão: Excluir (o orçamento não se apaga), Excluir quantidade do estoque (não há estoque), Tabela de preços,
 * Criar Tabela, Criar Seção, Atualizar produto e Atualizar todos (é cálculo de preço, que não entra nesta entrega).
 *
 * TODOS os orçamentos da empresa aparecem: os do agente e os manuais, com a origem dita na linha (é a coluna `origem` do banco, nunca deduzida).
 * Sem a migração `20261109000001`, a rota responde 503 e a tela diz que a estrutura não foi aplicada.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Card, Input, Modal, Select, Spin, Table, Tag, Tooltip, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, PlusOutlined, SearchOutlined, SwapRightOutlined } from '@ant-design/icons'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'

export type LinhaDoOrcamento = {
    id: string
    numero: number
    origem: 'agente' | 'manual'
    nome: string
    itens: number
    editado_manualmente_em: string | null
    criado_em: string
}
type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'desligada' }
    | { tipo: 'sem-permissao' }
    | { tipo: 'sem-migracao'; mensagem: string }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; orcamentos: LinhaDoOrcamento[] }

/** O levantamento COMPLETO da empresa, com o orçamento dele (nulo enquanto não atravessou) — a lista da ação manual. */
export type LevantamentoParaAtravessar = { id: string; numero: number; nome: string; orcamento: { id: string; numero: number } | null }
/** O que a travessia grava, dito ANTES do clique (dono do produto, 10/11/2026: um levantamento por vez, nada alterado nele). */
export const O_QUE_A_TRAVESSIA_GRAVA = [
    'Um orçamento do agente, com o nome do cliente e os percentuais (comissão, reserva técnica e lucro): os do levantamento; o que ele não tem vem da pré-definição do vendedor na base de conhecimento; o que nenhum dos dois tem é ZERO, e a tela do orçamento mostra de onde cada um veio.',
    'Um item do orçamento por esquadria do levantamento: tipologia, medidas, quantidade, cor, vidro, ambientes e escolhas.',
    'O aproveitamento SEM (barra inteira), porque a base de conhecimento ainda não tem o modo.',
    'Sem preço: o valor de venda fica vazio até a precificação. O levantamento não é alterado. O custo só é calculado no botão Calcular do orçamento.',
] as const

export const ROTULO_DA_ORIGEM: Record<LinhaDoOrcamento['origem'], string> = { agente: 'Agente I.A.', manual: 'Manual' }
export const TEXTO_DA_LISTA_VAZIA = 'Nenhum orçamento ainda. Os orçamentos do agente e os criados aqui aparecem nesta lista.'
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** A busca: pelo nome do cliente (sem caixa nem acento) ou pelo número. */
export function filtrarOrcamentos(lista: readonly LinhaDoOrcamento[], busca: string): LinhaDoOrcamento[] {
    const b = semAcento(busca.trim())
    if (b === '') return [...lista]
    return lista.filter((o) => semAcento(o.nome).includes(b) || String(o.numero) === b.replace(/^#/, ''))
}

function OrcamentosIA() {
    const router = useRouter()
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    const [busca, setBusca] = useState('')
    const [criando, setCriando] = useState(false)
    const [nome, setNome] = useState('')
    const [salvando, setSalvando] = useState(false)
    const [erroDoCriar, setErroDoCriar] = useState<string | null>(null)
    const [atravessando, setAtravessando] = useState(false)
    const [levantamentos, setLevantamentos] = useState<LevantamentoParaAtravessar[] | null>(null)
    const [escolhido, setEscolhido] = useState<string | null>(null)
    const [enviandoTravessia, setEnviandoTravessia] = useState(false)
    const [respostaDaTravessia, setRespostaDaTravessia] = useState<{ tipo: 'erro'; linhas: string[] } | null>(null)

    const carregar = useCallback(async () => {
        try {
            const r = await fetch('/api/atendimentos-ia/orcamentos')
            const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>
            if (r.status === 404) return setEstado({ tipo: 'desligada' })
            if (r.status === 403) return setEstado({ tipo: 'sem-permissao' })
            if (r.status === 503) return setEstado({ tipo: 'sem-migracao', mensagem: String(corpo.error ?? '') })
            if (!r.ok) return setEstado({ tipo: 'erro', mensagem: String(corpo.error ?? 'Não foi possível ler os orçamentos.') })
            setEstado({ tipo: 'pronto', orcamentos: (corpo.orcamentos ?? []) as LinhaDoOrcamento[] })
        } catch {
            setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler os orçamentos.' })
        }
    }, [])
    useEffect(() => { void carregar() }, [carregar])

    const visiveis = useMemo(() => (estado.tipo === 'pronto' ? filtrarOrcamentos(estado.orcamentos, busca) : []), [estado, busca])
    const abrir = (id: string) => router.push(`${ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}/${id}`)

    async function criar() {
        setSalvando(true)
        setErroDoCriar(null)
        try {
            const r = await fetch('/api/atendimentos-ia/orcamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) })
            const corpo = (await r.json().catch(() => ({}))) as { orcamento?: { id: string }; error?: string }
            if (!r.ok || !corpo.orcamento) { setErroDoCriar(corpo.error ?? 'Não foi possível criar o orçamento.'); return }
            message.success('Orçamento criado.')
            setCriando(false)
            setNome('')
            await abrir(corpo.orcamento.id)
        } finally {
            setSalvando(false)
        }
    }

    async function abrirTravessia() {
        setRespostaDaTravessia(null)
        setEscolhido(null)
        setLevantamentos(null)
        setAtravessando(true)
        const r = await fetch('/api/atendimentos-ia/orcamentos/atravessar')
        const corpo = (await r.json().catch(() => ({}))) as { levantamentos?: LevantamentoParaAtravessar[]; error?: string }
        if (!r.ok) { setRespostaDaTravessia({ tipo: 'erro', linhas: [corpo.error ?? 'Não foi possível ler os levantamentos.'] }); setLevantamentos([]); return }
        setLevantamentos(corpo.levantamentos ?? [])
    }

    async function atravessar() {
        if (!escolhido) return
        setEnviandoTravessia(true)
        setRespostaDaTravessia(null)
        try {
            const r = await fetch('/api/atendimentos-ia/orcamentos/atravessar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ levantamento_id: escolhido }) })
            const corpo = (await r.json().catch(() => ({}))) as { orcamento?: { id: string; numero: number }; faltas?: string[]; error?: string; recusas?: string[] }
            if (!r.ok || !corpo.orcamento || r.status === 409) {
                setRespostaDaTravessia({ tipo: 'erro', linhas: [corpo.error ?? 'Não foi possível atravessar o levantamento.', ...(corpo.recusas ?? [])] })
                return
            }
            const faltas = corpo.faltas ?? []
            message.success(`Orçamento ${corpo.orcamento.numero} criado${faltas.length ? ` — ${faltas.length} falta(s) a completar na precificação` : ''}.`)
            setAtravessando(false)
            await carregar()
            await abrir(corpo.orcamento.id)
        } finally {
            setEnviandoTravessia(false)
        }
    }
    const semOrcamento = (levantamentos ?? []).filter((l) => l.orcamento === null)

    const colunas: ColumnsType<LinhaDoOrcamento> = [
        { title: 'Nº', dataIndex: 'numero', key: 'numero', width: 80 },
        { title: 'Cliente', dataIndex: 'nome', key: 'nome' },
        {
            title: 'Origem', dataIndex: 'origem', key: 'origem', width: 130,
            render: (o: LinhaDoOrcamento['origem']) => <Tag color={o === 'agente' ? 'blue' : 'default'} data-origem={o}>{ROTULO_DA_ORIGEM[o]}</Tag>,
        },
        { title: 'Itens', dataIndex: 'itens', key: 'itens', width: 80, align: 'center' },
        {
            title: 'Editado à mão', dataIndex: 'editado_manualmente_em', key: 'editado', width: 160,
            render: (v: string | null) => (v ? <span data-editado="">{quando(v)}</span> : '—'),
        },
        { title: 'Criado em', dataIndex: 'criado_em', key: 'criado_em', width: 160, render: (v: string) => quando(v) },
        {
            title: '', key: 'acoes', width: 70, align: 'center',
            render: (_: unknown, o: LinhaDoOrcamento) => (
                <Tooltip title="Editar">
                    <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Editar o orçamento ${o.numero}`} onClick={() => abrir(o.id)} />
                </Tooltip>
            ),
        },
    ]

    return (
        <Layout title={PAGE_TITLES.ORCAMENTOS_IA} subtitle="Agentes I.A.">
            <div data-pagina-dos-orcamentos-ia="" data-estado={estado.tipo}>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'desligada' && <Alert type="info" showIcon message="O Atendimentos I.A. não está ligado nesta conta." />}
                {estado.tipo === 'sem-permissao' && <Alert type="warning" showIcon message="Você não tem permissão para ver os Orçamentos I.A." />}
                {estado.tipo === 'sem-migracao' && <Alert type="warning" showIcon message={estado.mensagem} />}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {estado.tipo === 'pronto' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                            <Input
                                placeholder="Buscar orçamento..."
                                prefix={<SearchOutlined style={{ color: '#D0D5DD' }} />}
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                style={{ maxWidth: 320 }}
                                allowClear
                            />
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Button icon={<SwapRightOutlined />} onClick={abrirTravessia}>Atravessar levantamento</Button>
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setErroDoCriar(null); setCriando(true) }}>Criar orçamento</Button>
                            </div>
                        </div>
                        <Card size="small">
                            <Table
                                rowKey="id"
                                columns={colunas}
                                dataSource={visiveis}
                                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                                locale={{ emptyText: <Typography.Text type="secondary">{estado.orcamentos.length === 0 ? TEXTO_DA_LISTA_VAZIA : 'Nenhum orçamento com essa busca.'}</Typography.Text> }}
                                scroll={{ x: 760 }}
                                onRow={(o) => ({ onDoubleClick: () => abrir(o.id) })}
                            />
                        </Card>
                    </>
                )}
                <Modal
                    open={atravessando}
                    title="Atravessar levantamento para orçamento"
                    okText="Atravessar"
                    cancelText="Cancelar"
                    onCancel={() => setAtravessando(false)}
                    onOk={atravessar}
                    okButtonProps={{ loading: enviandoTravessia, disabled: escolhido === null }}
                >
                    <div data-travessia="">
                        <Typography.Paragraph type="secondary">Escolha UM levantamento completo. O que será gravado:</Typography.Paragraph>
                        <ul style={{ paddingLeft: 18, marginTop: 0 }}>
                            {O_QUE_A_TRAVESSIA_GRAVA.map((t) => <li key={t}><Typography.Text type="secondary">{t}</Typography.Text></li>)}
                        </ul>
                        {levantamentos === null ? <Spin /> : semOrcamento.length === 0 ? (
                            <Alert type="info" showIcon message="Nenhum levantamento completo sem orçamento." />
                        ) : (
                            <Select
                                style={{ width: '100%' }}
                                placeholder="Levantamento"
                                aria-label="Levantamento"
                                value={escolhido ?? undefined}
                                onChange={(v: string) => setEscolhido(v)}
                                options={semOrcamento.map((l) => ({ value: l.id, label: `Levantamento ${l.numero} — ${l.nome}` }))}
                            />
                        )}
                        {respostaDaTravessia && (
                            <Alert style={{ marginTop: 12 }} type="error" showIcon message={respostaDaTravessia.linhas[0]}
                                description={respostaDaTravessia.linhas.length > 1 ? <ul style={{ margin: 0, paddingLeft: 18 }}>{respostaDaTravessia.linhas.slice(1).map((l) => <li key={l}>{l}</li>)}</ul> : undefined} />
                        )}
                    </div>
                </Modal>
                <Modal
                    open={criando}
                    title="Criar orçamento"
                    okText="Criar"
                    cancelText="Cancelar"
                    onCancel={() => setCriando(false)}
                    onOk={criar}
                    okButtonProps={{ loading: salvando, disabled: nome.trim() === '' }}
                >
                    <Typography.Paragraph type="secondary">O orçamento criado aqui é manual: não vem de um levantamento do agente.</Typography.Paragraph>
                    <Input placeholder="Nome do cliente" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} aria-label="Nome do cliente" />
                    {erroDoCriar && <Alert style={{ marginTop: 12 }} type="error" showIcon message={erroDoCriar} />}
                </Modal>
            </div>
        </Layout>
    )
}

export default OrcamentosIA
