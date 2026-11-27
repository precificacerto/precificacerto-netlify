/**
 * /atendimentos-ia/orcamentos-ia/[id] — um ORÇAMENTO I.A., ALTERADO MANUALMENTE (dono do produto, 09/11/2026).
 *
 * Edita-se o cabeçalho (o nome do cliente e a observação) e os itens (tipologia, medidas, quantidade, cor do perfil, vidro, observação), e
 * acrescentam-se itens. NÃO se exclui item nem orçamento, e não há preço nesta entrega. Salvar grava a MARCA da edição manual: daí em diante o
 * agente não sobrescreve o orçamento calado — quando o levantamento mudar, ele avisa e pergunta (a regra fica com quem escrever esse caminho).
 *
 * O 1b (09/11/2026): "Calcular" passa as esquadrias pelo caminho completo e grava o custo no orçamento. O estado do cálculo gravado aparece aqui:
 * "cálculo incompleto — recalcule" quando algum item aponta um cálculo e o orçamento está sem os totais.
 *
 * UMA PÁGINA SÓ (pedido 0051, 27/11/2026, regra inviolável do dono do produto), de cima para baixo: 1) os ITENS, com o Calcular; 2) a PRECIFICAÇÃO,
 * logo abaixo — o mesmo bloco da tela de Produtos no modo orçamento, com os tributos das credenciais da empresa editáveis à mão (0044); 3) o ARQUIVO
 * PDF no fim, para ver e baixar, regerado a cada cálculo e a cada salvamento. A página `/precificacao` segue como atalho do mesmo bloco.
 */
import { ROTULO_DA_ORIGEM_DO_PERCENTUAL, type ClienteDoLevantamento, type PercentualComZero, type PercentualNaTela } from '@/lib/atendimentos-ia/travessia-do-levantamento-plano'
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Alert, Button, Card, Input, InputNumber, Space, Spin, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, CalculatorOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { PrecificacaoDoOrcamento } from '@/page-parts/atendimentos-ia/precificacao-do-orcamento.component'
import { ArquivoDoOrcamentoNaTela } from '@/page-parts/atendimentos-ia/arquivo-do-orcamento-na-tela.component'
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
    numero_exibido?: string
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

export const ROTULO_DO_PERCENTUAL: Readonly<Record<PercentualComZero, string>> = {
    comissao_percentual: 'Comissão', reserva_tecnica_percentual: 'Reserva técnica', lucro_projetado_percentual: 'Lucro projetado',
}

/** As linhas do cartão do cliente: só o que o levantamento tem (o vazio não aparece — `ausente-vs-falso.md`). */
export function linhasDoCliente(c: ClienteDoLevantamento): Array<[string, string]> {
    const linhas: Array<[string, string | null]> = [
        ['Cliente', c.nome], ['Telefone', c.telefone], ['E-mail', c.email], ['Endereço', c.endereco], ['Edificação', c.edificacao],
        ['Obs. da obra', c.obs_obra], ['Data de entrega', c.data_entrega ? c.data_entrega.split('-').reverse().join('/') : null], ['Vendedor', c.vendedor_nome],
    ]
    return linhas.filter((l): l is [string, string] => typeof l[1] === 'string' && l[1].trim() !== '')
}

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
    // o cliente e o vendedor do orçamento do agente: LIDOS do levantamento de origem (nunca copiados); e as faltas do que ele congelou
    const [cliente, setCliente] = useState<ClienteDoLevantamento | null>(null)
    const [faltas, setFaltas] = useState<string[]>([])
    // os três percentuais com a origem (regra do zero, 11/11/2026): o zero por ausência é DESTACADO, nunca silencioso
    const [percentuais, setPercentuais] = useState<PercentualNaTela[]>([])
    // os avisos do último cálculo: a tabela congelada no levantamento que não é a vigente usada (não bloqueia)
    const [avisosDaTabela, setAvisosDaTabela] = useState<string[]>([])
    // `sinal` muda a cada cálculo e a cada salvamento: a precificação relê o gravado e o arquivo PDF é lido de novo (0051)
    const [sinal, setSinal] = useState(0)
    const [sinalDoArquivo, setSinalDoArquivo] = useState(0)
    const [recusasDoArquivo, setRecusasDoArquivo] = useState<string[]>([])
    const arquivoMudou = useCallback(() => setSinalDoArquivo((n) => n + 1), [])

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

    // O PEDIDO TOTAL (pedido 0034-B): o responsável escolhe aqui, e o servidor grava quem escolheu; o padrão é o consumo de cada item
    async function calcular(aproveitamento: 'consumo' | 'pedido_total' = 'consumo') {
        if (!id) return
        setCalculando(true)
        try {
            const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/calcular`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aproveitamento }),
            })
            const corpo = (await r.json().catch(() => ({}))) as { error?: string; recusas?: string[]; avisos?: string[] }
            setAvisosDaTabela(r.ok ? corpo.avisos ?? [] : [])
            if (!r.ok) { setRecusasDoCalculo([corpo.error ?? 'Não foi possível calcular o orçamento.', ...(corpo.recusas ?? [])]); return }
            setRecusasDoCalculo([])
            message.success(aproveitamento === 'pedido_total' ? 'Orçamento calculado pelo pedido total (as barras inteiras, rateadas).' : 'Orçamento calculado.')
            // o arquivo PDF é regerado a cada cálculo (0051): o preço se forma como o do "sim" da conversa, e o que faltar vem nomeado
            const a = await fetch(`/api/atendimentos-ia/orcamentos/${id}/arquivo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'precificar' }) })
            const ac = (await a.json().catch(() => ({}))) as { error?: string; recusas?: string[] }
            setRecusasDoArquivo(a.ok ? [] : [ac.error ?? 'O arquivo não foi regerado.', ...(ac.recusas ?? [])])
        } finally {
            setCalculando(false)
            void lerEstadoDoCalculo()
            setSinal((n) => n + 1)
            arquivoMudou()
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
            setCliente((corpo.cliente ?? null) as ClienteDoLevantamento | null)
            setFaltas(Array.isArray(corpo.faltas) ? (corpo.faltas as string[]) : [])
            setPercentuais(Array.isArray(corpo.percentuais) ? (corpo.percentuais as PercentualNaTela[]) : [])
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
                        <Card size="small" title={`Orçamento ${estado.orcamento.numero_exibido ?? estado.orcamento.numero}`}
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
                        {cliente && (
                            <Card size="small" title={`Cliente e vendedor (do levantamento ${cliente.levantamento_numero})`} data-cliente-do-levantamento="">
                                <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>Lidos do levantamento de origem; o que o cliente recebe fica registrado no arquivo do orçamento.</Typography.Paragraph>
                                {linhasDoCliente(cliente).map(([rotulo, valor]) => (
                                    <div key={rotulo} style={{ display: 'flex', gap: 8 }}><Typography.Text type="secondary" style={{ minWidth: 130 }}>{rotulo}</Typography.Text><Typography.Text>{valor}</Typography.Text></div>
                                ))}
                            </Card>
                        )}
                        {percentuais.length > 0 && (
                            <Card size="small" title="Comissão, reserva técnica e lucro (congelados na travessia)" data-percentuais-do-orcamento="">
                                {percentuais.map((p) => (
                                    <div key={p.campo} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} data-percentual={p.campo} data-origem={p.origem ?? ''}>
                                        <Typography.Text type="secondary" style={{ minWidth: 130 }}>{ROTULO_DO_PERCENTUAL[p.campo]}</Typography.Text>
                                        <Typography.Text strong>{p.valor === null ? '—' : `${p.valor.toLocaleString('pt-BR')}%`}</Typography.Text>
                                        {p.origem && <Tag color={p.origem === 'zero_por_ausencia' ? 'gold' : undefined}>{ROTULO_DA_ORIGEM_DO_PERCENTUAL[p.origem]}</Tag>}
                                    </div>
                                ))}
                            </Card>
                        )}
                        {faltas.length > 0 && (
                            <Alert type="warning" showIcon data-faltas-do-congelado="" message="O levantamento não tinha tudo o que muda o preço:"
                                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{faltas.map((f) => <li key={f}>{f}</li>)}</ul>} />
                        )}
                        <Card size="small" title="Itens" extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setItens((xs) => [...xs, itemNovo()])}>Adicionar item</Button>}>
                            <Table rowKey="chave" columns={colunas} dataSource={itens} pagination={false} scroll={{ x: 960 }}
                                locale={{ emptyText: <Typography.Text type="secondary">Nenhum item ainda.</Typography.Text> }} />
                        </Card>
                        {estadoDoCalculoGravado !== null && estadoDoCalculoGravado !== 'completo' && (
                            <Alert type="warning" showIcon data-estado-do-calculo={estadoDoCalculoGravado} message={FRASE_DO_ESTADO[estadoDoCalculoGravado]} />
                        )}
                        {avisosDaTabela.length > 0 && (
                            <Alert type="info" showIcon data-avisos-da-tabela="" message="A tabela de preço mudou desde o levantamento (o cálculo usou a vigente):"
                                description={<ul style={{ margin: 0, paddingLeft: 18 }}>{avisosDaTabela.map((a) => <li key={a}>{a}</li>)}</ul>} />
                        )}
                        {recusasDoCalculo.length > 0 && <Alert type="error" showIcon data-recusas-do-calculo="" message={recusasDoCalculo[0]} description={recusasDoCalculo.length > 1 ? <ul style={{ margin: 0, paddingLeft: 18 }}>{recusasDoCalculo.slice(1).map((e) => <li key={e}>{e}</li>)}</ul> : undefined} />}
                        {erros.length > 0 && <Alert type="error" showIcon message="O orçamento não foi salvo." description={<ul style={{ margin: 0, paddingLeft: 18 }}>{erros.map((e) => <li key={e}>{e}</li>)}</ul>} />}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                            <Button icon={<CalculatorOutlined />} loading={calculando} onClick={() => { void calcular('consumo') }}>Calcular</Button>
                            <Button loading={calculando} onClick={() => { void calcular('pedido_total') }}
                                title="As barras inteiras do pedido, rateadas entre os itens na proporção do consumo de cada um">Calcular pelo pedido total</Button>
                            <Button type="primary" icon={<SaveOutlined />} loading={salvando} disabled={nome.trim() === ''} onClick={salvar}>Salvar</Button>
                        </div>
                        {/* 2) A PRECIFICAÇÃO, logo abaixo dos itens (0051): só existe depois de um cálculo completo */}
                        {estadoDoCalculoGravado === 'completo'
                            ? <div data-bloco-da-precificacao=""><PrecificacaoDoOrcamento id={id} sinal={sinal} aoMudarOArquivo={arquivoMudou} comLinkDoArquivo={false} /></div>
                            : <Alert type="info" showIcon data-sem-precificacao="" message="A precificação aparece aqui depois do cálculo: use Calcular." />}
                        {/* 3) O ARQUIVO PDF, no fim da página (0051) */}
                        {id && <ArquivoDoOrcamentoNaTela id={id} numero={estado.orcamento.numero_exibido ?? estado.orcamento.numero} sinal={sinalDoArquivo} recusas={recusasDoArquivo} />}
                    </Space>
                )}
            </div>
        </Layout>
    )
}

export default OrcamentoIA
