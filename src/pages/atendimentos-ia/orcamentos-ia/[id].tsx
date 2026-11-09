/**
 * /atendimentos-ia/orcamentos-ia/[id] — um ORÇAMENTO I.A., ALTERADO MANUALMENTE (dono do produto, 09/11/2026).
 *
 * Edita-se o cabeçalho (o nome do cliente e a observação) e os itens (tipologia, medidas, quantidade, cor do perfil, vidro, observação), e
 * acrescentam-se itens. NÃO se exclui item nem orçamento, e não há preço nesta entrega. Salvar grava a MARCA da edição manual: daí em diante o
 * agente não sobrescreve o orçamento calado — quando o levantamento mudar, ele avisa e pergunta (a regra fica com quem escrever esse caminho).
 *
 * O 1b (09/11/2026): "Calcular" passa as esquadrias pelo caminho completo e grava o custo no orçamento; "Precificar" abre a precificação final
 * (a tela de Produtos no modo "orçamento"). O estado do cálculo gravado aparece aqui: "cálculo incompleto — recalcule" quando algum item aponta
 * um cálculo e o orçamento está sem os totais.
 */
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Alert, Button, Card, Input, InputNumber, Space, Spin, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, CalculatorOutlined, DollarOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { estadoDoCalculo, FRASE_DO_ESTADO, type EstadoDoCalculo, type OrcamentoNaPrecificacao } from '@/lib/atendimentos-ia/precificacao-do-orcamento'

type Item = {
    chave: string
    id: string | null
    ordem: number | null
    tipologia: string | null
    largura_mm: number | null
    altura_mm: number | null
    quantidade: number | null
    cor_perfil: string | null
    vidro: string | null
    obs: string | null
}
type Orcamento = {
    id: string
    numero: number
    origem: 'agente' | 'manual'
    levantamento_id: string | null
    nome: string
    obs: string | null
    editado_manualmente_em: string | null
    criado_em: string
    itens: Array<Omit<Item, 'chave'>>
}
type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'desligada' }
    | { tipo: 'sem-permissao' }
    | { tipo: 'nao-encontrado' }
    | { tipo: 'sem-migracao'; mensagem: string }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; orcamento: Orcamento }

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
let sequencia = 0
const comChave = (i: Omit<Item, 'chave'>): Item => ({ ...i, chave: i.id ?? `novo-${++sequencia}` })
const itemNovo = (): Item => comChave({ id: null, ordem: null, tipologia: null, largura_mm: null, altura_mm: null, quantidade: 1, cor_perfil: null, vidro: null, obs: null })

/** O corpo do PATCH: o cabeçalho e TODOS os itens da tela — os gravados com `id`, os novos sem. Nenhum item some do corpo. */
export function corpoDaAlteracao(nome: string, obs: string | null, itens: readonly Item[]) {
    return {
        nome,
        obs,
        itens: itens.map(({ id, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, obs: o }) => ({
            ...(id ? { id } : {}), tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, obs: o,
        })),
    }
}

function OrcamentoIA() {
    const router = useRouter()
    const id = typeof router.query.id === 'string' ? router.query.id : null
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    const [nome, setNome] = useState('')
    const [obs, setObs] = useState<string | null>(null)
    const [itens, setItens] = useState<Item[]>([])
    const [salvando, setSalvando] = useState(false)
    const [erros, setErros] = useState<string[]>([])
    const [estadoDoCalculoGravado, setEstadoDoCalculoGravado] = useState<EstadoDoCalculo | null>(null)
    const [calculando, setCalculando] = useState(false)
    const [recusasDoCalculo, setRecusasDoCalculo] = useState<string[]>([])

    /** O estado do cálculo gravado, lido pela rota da precificação (ela traz os valores do cálculo). Sem ela, nada é dito. */
    const lerEstadoDoCalculo = useCallback(async () => {
        if (!id) return
        try {
            const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/precificacao`)
            if (!r.ok) { setEstadoDoCalculoGravado(null); return }
            const { orcamento } = (await r.json()) as { orcamento: OrcamentoNaPrecificacao }
            setEstadoDoCalculoGravado(estadoDoCalculo(orcamento))
        } catch { setEstadoDoCalculoGravado(null) }
    }, [id])
    useEffect(() => { void lerEstadoDoCalculo() }, [lerEstadoDoCalculo])

    async function calcular() {
        if (!id) return
        setCalculando(true)
        try {
            const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/calcular`, { method: 'POST' })
            const corpo = (await r.json().catch(() => ({}))) as { error?: string; recusas?: string[] }
            if (!r.ok) { setRecusasDoCalculo([corpo.error ?? 'Não foi possível calcular o orçamento.', ...(corpo.recusas ?? [])]); return }
            setRecusasDoCalculo([])
            message.success('Orçamento calculado.')
        } finally {
            setCalculando(false)
            void lerEstadoDoCalculo()
        }
    }

    const aplicar = (o: Orcamento) => {
        setEstado({ tipo: 'pronto', orcamento: o })
        setNome(o.nome)
        setObs(o.obs)
        setItens(o.itens.map(comChave))
    }

    const carregar = useCallback(async () => {
        if (!id) return
        try {
            const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}`)
            const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>
            if (r.status === 404 && String(corpo.error ?? '').startsWith('Orçamento')) return setEstado({ tipo: 'nao-encontrado' })
            if (r.status === 404) return setEstado({ tipo: 'desligada' })
            if (r.status === 403) return setEstado({ tipo: 'sem-permissao' })
            if (r.status === 503) return setEstado({ tipo: 'sem-migracao', mensagem: String(corpo.error ?? '') })
            if (!r.ok) return setEstado({ tipo: 'erro', mensagem: String(corpo.error ?? 'Não foi possível ler o orçamento.') })
            aplicar(corpo.orcamento as Orcamento)
        } catch {
            setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler o orçamento.' })
        }
    }, [id])
    useEffect(() => { void carregar() }, [carregar])

    const mudar = (chave: string, campo: keyof Item, valor: unknown) =>
        setItens((xs) => xs.map((x) => (x.chave === chave ? { ...x, [campo]: valor === '' ? null : valor } : x)))

    async function salvar() {
        if (!id) return
        setSalvando(true)
        setErros([])
        try {
            const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoDaAlteracao(nome, obs, itens)),
            })
            const corpo = (await r.json().catch(() => ({}))) as { orcamento?: Orcamento; error?: string; erros?: string[] }
            if (!r.ok || !corpo.orcamento) { setErros(corpo.erros ?? [corpo.error ?? 'Não foi possível salvar o orçamento.']); return }
            aplicar(corpo.orcamento)
            message.success('Orçamento salvo.')
            void lerEstadoDoCalculo()
        } finally {
            setSalvando(false)
        }
    }

    const texto = (campo: 'tipologia' | 'cor_perfil' | 'vidro' | 'obs', rotulo: string) => function CelulaDeTexto(_: unknown, i: Item) {
        return <Input size="small" value={i[campo] ?? ''} aria-label={rotulo} maxLength={campo === 'obs' ? 1000 : 120} onChange={(e) => mudar(i.chave, campo, e.target.value)} />
    }
    const numero = (campo: 'largura_mm' | 'altura_mm' | 'quantidade', rotulo: string) => function CelulaDeNumero(_: unknown, i: Item) {
        return <InputNumber size="small" min={1} precision={0} value={i[campo] ?? undefined} aria-label={rotulo} onChange={(v) => mudar(i.chave, campo, v ?? null)} style={{ width: '100%' }} />
    }
    const colunas: ColumnsType<Item> = [
        { title: 'Nº', key: 'ordem', width: 56, render: (_: unknown, i: Item, k: number) => i.ordem ?? k + 1 },
        { title: 'Tipologia', key: 'tipologia', width: 140, render: texto('tipologia', 'Tipologia') },
        { title: 'Largura (mm)', key: 'largura', width: 120, render: numero('largura_mm', 'Largura (mm)') },
        { title: 'Altura (mm)', key: 'altura', width: 120, render: numero('altura_mm', 'Altura (mm)') },
        { title: 'Quantidade', key: 'quantidade', width: 110, render: numero('quantidade', 'Quantidade') },
        { title: 'Cor do perfil', key: 'cor', width: 140, render: texto('cor_perfil', 'Cor do perfil') },
        { title: 'Vidro', key: 'vidro', width: 160, render: texto('vidro', 'Vidro') },
        { title: 'Observação', key: 'obs', render: texto('obs', 'Observação') },
    ]

    const voltar = <Link href={ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}><ArrowLeftOutlined /> Orçamentos I.A.</Link>
    return (
        <Layout title={PAGE_TITLES.ORCAMENTOS_IA} subtitle="Agentes I.A.">
            <div data-pagina-do-orcamento-ia="" data-estado={estado.tipo}>
                <div style={{ marginBottom: 12 }}>{voltar}</div>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'desligada' && <Alert type="info" showIcon message="O Atendimentos I.A. não está ligado nesta conta." />}
                {estado.tipo === 'sem-permissao' && <Alert type="warning" showIcon message="Você não tem permissão para ver os Orçamentos I.A." />}
                {estado.tipo === 'nao-encontrado' && <Alert type="warning" showIcon message="Orçamento não encontrado." />}
                {estado.tipo === 'sem-migracao' && <Alert type="warning" showIcon message={estado.mensagem} />}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {estado.tipo === 'pronto' && (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Card size="small" title={`Orçamento ${estado.orcamento.numero}`}
                            extra={<Tag color={estado.orcamento.origem === 'agente' ? 'blue' : 'default'} data-origem={estado.orcamento.origem}>
                                {estado.orcamento.origem === 'agente' ? 'Agente I.A.' : 'Manual'}
                            </Tag>}>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} addonBefore="Cliente" aria-label="Nome do cliente" />
                                <Input.TextArea value={obs ?? ''} onChange={(e) => setObs(e.target.value === '' ? null : e.target.value)} maxLength={1000} rows={2} placeholder="Observação" aria-label="Observação" />
                                <Typography.Text type="secondary" data-marca={estado.orcamento.editado_manualmente_em ? 'sim' : 'nao'}>
                                    Criado em {quando(estado.orcamento.criado_em)}
                                    {estado.orcamento.editado_manualmente_em
                                        ? ` · editado à mão em ${quando(estado.orcamento.editado_manualmente_em)}: o agente não sobrescreve sem perguntar`
                                        : ''}
                                </Typography.Text>
                            </Space>
                        </Card>
                        <Card size="small" title="Itens" extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setItens((xs) => [...xs, itemNovo()])}>Adicionar item</Button>}>
                            <Table rowKey="chave" columns={colunas} dataSource={itens} pagination={false} scroll={{ x: 960 }}
                                locale={{ emptyText: <Typography.Text type="secondary">Nenhum item ainda.</Typography.Text> }} />
                        </Card>
                        {estadoDoCalculoGravado !== null && estadoDoCalculoGravado !== 'completo' && (
                            <Alert type="warning" showIcon data-estado-do-calculo={estadoDoCalculoGravado} message={FRASE_DO_ESTADO[estadoDoCalculoGravado]} />
                        )}
                        {recusasDoCalculo.length > 0 && <Alert type="error" showIcon data-recusas-do-calculo="" message={recusasDoCalculo[0]} description={recusasDoCalculo.length > 1 ? <ul style={{ margin: 0, paddingLeft: 18 }}>{recusasDoCalculo.slice(1).map((e) => <li key={e}>{e}</li>)}</ul> : undefined} />}
                        {erros.length > 0 && <Alert type="error" showIcon message="O orçamento não foi salvo." description={<ul style={{ margin: 0, paddingLeft: 18 }}>{erros.map((e) => <li key={e}>{e}</li>)}</ul>} />}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                            <Button icon={<CalculatorOutlined />} loading={calculando} onClick={calcular}>Calcular</Button>
                            <Link href={`${ROUTES.ATENDIMENTOS_IA_ORCAMENTOS}/${estado.orcamento.id}/precificacao`}>
                                <Button icon={<DollarOutlined />} disabled={estadoDoCalculoGravado !== 'completo'}>Precificar</Button>
                            </Link>
                            <Button type="primary" icon={<SaveOutlined />} loading={salvando} disabled={nome.trim() === ''} onClick={salvar}>Salvar</Button>
                        </div>
                    </Space>
                )}
            </div>
        </Layout>
    )
}

export default OrcamentoIA
