/**
 * Os QUATRO blocos da base de conhecimento de UMA empresa, na ordem: o cartão "Matérias-primas e seus
 * fornecedores" (os TRÊS NÍVEIS, em `materias-primas.component.tsx`), Padrão por ambiente, Vendedores
 * e Adicionais da empresa. Os cinco blocos de esquadrias de um nível saíram — ver `formulario.ts`.
 *
 * Só CONSOME as rotas de `src/pages/api/super-admin/base-de-conhecimento/`. A empresa chega pela
 * prop — ela vem do CAMINHO da URL (`contas/[tenantId]/base-de-conhecimento`), nunca de um seletor
 * dentro do formulário: é por um seletor assim que uma escrita cairia na empresa errada.
 *
 * UM BOTÃO SÓ para a tela inteira, "Salvar alterações", na barra do topo junto do nome da empresa
 * (dono do produto, 23/10/2026 — ver `planoDoSalvar`). Desabilitado sem alteração; com alteração,
 * diz quantas estão pendentes. Salvar chama TODAS as rotas necessárias (a árvore, os adicionais,
 * ambiente, vendedor), cada corpo com SÓ o que mudou; a árvore vai num PUT só, numa transação só. Se uma falhar e outra passar, a tela diz o que foi salvo
 * e o que não foi, nomeando o bloco; a recusa da rota fica também NO bloco, com a frase, o código e
 * os erros nomeados como vieram; e o que não passou CONTINUA pendente, para tentar de novo. Sair da
 * página com pendência avisa antes.
 *
 * A ÁRVORE, depois de salva, é redesenhada pelo `depois` que a função devolveu — o que vale é o que o
 * banco gravou, não o que estava digitado.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Card, Input, InputNumber, Select, Space, Tag, Typography, message } from 'antd'
import { ErroDaRota, chamarRota } from '@/page-parts/atendimentos-ia/api'
import type { ErroNomeado } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    ADICIONAIS, BASES, CAMPOS_DO_AMBIENTE, CAMPOS_DO_VENDEDOR, MODOS, MODOS_DA_COMISSAO, ORDEM_DOS_BLOCOS,
    ROTAS_DA_BASE, ROTULO_DO_CAMPO, ROTULO_DO_MODO, mesmoValor, trocarOModo, usaNoModo,
    TITULO_DO_BLOCO, fraseDasPendencias, planoDoSalvar, type Chamada,
    type ChaveDoBloco, type LinhaDaLista, type Modo,
} from '@/page-parts/atendimentos-ia/base-de-conhecimento/formulario'
import {
    arvoreDoDepois, formularioDaArvore, planoDaArvore, type ArvoreLida, type EstadoDaArvore,
} from '@/page-parts/atendimentos-ia/base-de-conhecimento/arvore'
import { MateriasPrimas } from '@/page-parts/atendimentos-ia/base-de-conhecimento/materias-primas.component'
import { EtapasDaFamilia } from '@/page-parts/atendimentos-ia/etapas-da-familia.component'

type Linha = Record<string, unknown>
export interface BaseDaEmpresa {
    tenant_id: string
    nicho: { id: string; modelo: string; nome: string } | null
    adicionais: Linha | null
    ambientes: Linha[]
    vendedores: Linha[]
}
type Funcionario = { id: string; nome: string }
type Linhas = Array<LinhaDaLista & { id: string; nome?: string }>
/** O que um bloco tem a dizer depois de tentar salvar: a recusa da rota, ou o que segurou na tela. */
type Aviso = { rota: ErroDaRota | Error } | { locais: ErroNomeado[] }

const rotulo = (c: string) => ROTULO_DO_CAMPO[c] ?? c

let proximoId = 0
const novoId = () => `n${++proximoId}`

const linhasDosAmbientes = (ambientes: Linha[]): Linhas => ambientes.map((a) => ({
    id: novoId(), chave: String(a.ambiente), valores: Object.fromEntries(CAMPOS_DO_AMBIENTE.map((c) => [c, a[c] ?? null])),
}))
const linhasDosVendedores = (vendedores: Linha[]): Linhas => vendedores.map((v) => ({
    id: novoId(), chave: String(v.employee_id), nome: typeof v.nome_do_funcionario === 'string' ? v.nome_do_funcionario : undefined,
    valores: Object.fromEntries(CAMPOS_DO_VENDEDOR.map((c) => [c, v[c] ?? null])),
}))

// ── O aviso do bloco ───────────────────────────────────────────────────────────────────────
function AvisoDoBloco({ aviso }: { aviso: Aviso | null }) {
    if (!aviso) return null
    if ('locais' in aviso) {
        return (
            <Alert type="warning" showIcon style={{ marginTop: 12 }} message="Não enviado — corrija antes de salvar:"
                description={<ul data-nao-enviado style={{ margin: 0, paddingLeft: 18 }}>{aviso.locais.map((e, i) => <li key={i}>{rotulo(e.campo)}: {e.mensagem}</li>)}</ul>} />
        )
    }
    const corpo = (aviso.rota instanceof ErroDaRota ? aviso.rota.corpo : null) as { codigo?: string; erros?: ErroNomeado[] } | null
    return (
        <Alert type="error" showIcon style={{ marginTop: 12 }} message={aviso.rota.message}
            description={(corpo?.codigo || corpo?.erros?.length) ? (
                <div data-recusa-da-rota>
                    {corpo?.codigo && <div>Código: <Typography.Text code>{corpo.codigo}</Typography.Text></div>}
                    {!!corpo?.erros?.length && (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>{corpo.erros.map((e, i) => <li key={i}><Typography.Text code>{e.campo}</Typography.Text> {e.mensagem}</li>)}</ul>
                    )}
                </div>
            ) : undefined} />
    )
}

// ── O componente ───────────────────────────────────────────────────────────────────────────
/** O que o último "Salvar alterações" conseguiu: os blocos salvos e, de cada falha, os blocos e o porquê. */
type Resultado = { salvos: ChaveDoBloco[]; naoSalvos: Array<{ blocos: ChaveDoBloco[]; motivo: string }> }
export const AVISO_AO_SAIR = 'Há alterações não salvas na base de conhecimento. Sair mesmo assim?'

/**
 * `topo` desenha a barra do topo da página com o botão de salvar dentro — a barra é da página (o nome
 * da empresa vem de lá), o botão é daqui (o estado do formulário mora aqui).
 */
export function BaseDeConhecimento({ tenantId, topo }: { tenantId: string; topo: (acao: React.ReactNode) => React.ReactNode }) {
    const router = useRouter()
    const [base, setBase] = useState<BaseDaEmpresa | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [funcionarios, setFuncionarios] = useState<Funcionario[] | null>(null)
    const [erroDosFuncionarios, setErroDosFuncionarios] = useState<string | null>(null)
    const [arvore, setArvore] = useState<ArvoreLida | null>(null)
    const [erroDaArvore, setErroDaArvore] = useState<string | null>(null)
    const [formArvore, setFormArvore] = useState<EstadoDaArvore>({ materias: [], removidas: [] })
    const [adicionais, setAdicionais] = useState<Linha>({})
    const [ambientes, setAmbientes] = useState<Linhas>([])
    const [vendedores, setVendedores] = useState<Linhas>([])
    const [vendedorNovo, setVendedorNovo] = useState<string | undefined>(undefined)
    const [avisos, setAvisos] = useState<Partial<Record<ChaveDoBloco, Aviso | null>>>({})
    const [salvando, setSalvando] = useState(false)
    const [resultado, setResultado] = useState<Resultado | null>(null)
    const [erroDaFamilia, setErroDaFamilia] = useState<{ materiaPrimaId: string; mensagem: string } | null>(null)
    const [erroDoNome, setErroDoNome] = useState<{ materiaPrimaId: string; mensagem: string } | null>(null)

    const ler = useCallback(async () => chamarRota<BaseDaEmpresa>(ROTAS_DA_BASE.base(tenantId)), [tenantId])

    useEffect(() => {
        let vivo = true
        ler().then((b) => {
            if (!vivo) return
            setBase(b)
            setAdicionais({ ...(b.adicionais ?? {}) })
            setAmbientes(linhasDosAmbientes(b.ambientes))
            setVendedores(linhasDosVendedores(b.vendedores))
            setErroAoLer(null)
        }).catch((e) => { if (vivo) setErroAoLer((e as Error).message) })
        // a árvore dos três níveis: leitura própria — falhar aqui é erro NO CARTÃO, não na tela inteira
        chamarRota<ArvoreLida>(ROTAS_DA_BASE.arvore(tenantId))
            .then((a) => { if (vivo) { setArvore(a); setFormArvore(formularioDaArvore(a)); setErroDaArvore(null) } })
            .catch((e) => { if (vivo) setErroDaArvore((e as Error).message) })
        chamarRota<{ funcionarios: Funcionario[] }>(ROTAS_DA_BASE.funcionarios(tenantId))
            .then((r) => { if (vivo) setFuncionarios(r.funcionarios) })
            .catch((e) => { if (vivo) setErroDosFuncionarios((e as Error).message) })
        return () => { vivo = false }
    }, [tenantId, ler])

    const plano = base
        ? planoDoSalvar({ adicionais: base.adicionais, ambientes: base.ambientes, vendedores: base.vendedores }, { adicionais, ambientes, vendedores })
        : null
    const planoArvore = arvore ? planoDaArvore(arvore, formArvore) : null
    const pendentes = (plano?.total ?? 0) + (planoArvore?.pendencias ?? 0)

    // Sair com pendência avisa antes: a navegação do Next pergunta; fechar ou recarregar a aba, o navegador.
    const pendentesAgora = useRef(0)
    pendentesAgora.current = pendentes
    useEffect(() => {
        const aoTrocarDeRota = () => {
            if (pendentesAgora.current > 0 && !window.confirm(AVISO_AO_SAIR)) {
                router.events?.emit?.('routeChangeError')
                // o Next só cancela a troca de rota se o ouvinte lançar
                throw new Error('Navegação cancelada: há alterações não salvas.')
            }
        }
        const aoFecharAAba = (e: BeforeUnloadEvent) => {
            if (pendentesAgora.current === 0) return
            e.preventDefault()
            e.returnValue = AVISO_AO_SAIR
        }
        router.events?.on?.('routeChangeStart', aoTrocarDeRota)
        window.addEventListener('beforeunload', aoFecharAAba)
        return () => {
            router.events?.off?.('routeChangeStart', aoTrocarDeRota)
            window.removeEventListener('beforeunload', aoFecharAAba)
        }
    }, [router])

    /** A família da matéria-prima grava na hora, por rota própria, e relê a árvore — por isso só sem alteração pendente. */
    async function mudarAFamilia(materiaPrimaId: string, familia: string | null) {
        setErroDaFamilia(null)
        try {
            await chamarRota(ROTAS_DA_BASE.familiaDaMateriaPrima(tenantId), 'PUT', { materia_prima: materiaPrimaId, familia })
            const nova = await chamarRota<ArvoreLida>(ROTAS_DA_BASE.arvore(tenantId))
            setArvore(nova)
            setFormArvore(formularioDaArvore(nova))
            message.success('Família da matéria-prima salva')
        } catch (e) {
            setErroDaFamilia({ materiaPrimaId, mensagem: (e as Error).message })
        }
    }

    /** O título da família é o nome da matéria-prima: grava na hora, por rota própria, e relê a árvore — só sem alteração pendente. */
    async function renomear(materiaPrimaId: string, nome: string) {
        setErroDoNome(null)
        try {
            await chamarRota(ROTAS_DA_BASE.nomeDaMateriaPrima(tenantId), 'PUT', { materia_prima: materiaPrimaId, nome })
            const nova = await chamarRota<ArvoreLida>(ROTAS_DA_BASE.arvore(tenantId))
            setArvore(nova)
            setFormArvore(formularioDaArvore(nova))
            message.success('Título salvo')
        } catch (e) {
            setErroDoNome({ materiaPrimaId, mensagem: (e as Error).message })
        }
    }

    const avisar = (b: ChaveDoBloco, a: Aviso | null) => setAvisos((x) => ({ ...x, [b]: a }))

    async function salvarTudo() {
        if (!base || !plano || pendentes === 0) return
        setSalvando(true)
        setResultado(null)
        // a árvore entra no MESMO botão: um PUT /arvore, quando ela mudou e nada a segura na tela
        const chamadas: Chamada[] = [...plano.chamadas, ...(planoArvore?.corpo ? [{ rota: 'arvore' as const, corpo: { arvore: planoArvore.corpo }, blocos: ['materias' as const] }] : [])]
        const naoEnviados = [...plano.naoEnviados, ...(planoArvore?.erros.length ? [{ bloco: 'materias' as const, erros: planoArvore.erros }] : [])]
        const blocosDoPlano = [...chamadas.flatMap((c) => c.blocos), ...naoEnviados.map((n) => n.bloco)]
        setAvisos((x) => ({ ...x, ...Object.fromEntries(blocosDoPlano.map((b): [ChaveDoBloco, null] => [b, null])) }))
        for (const n of naoEnviados) avisar(n.bloco, { locais: n.erros })
        const url = (c: Chamada) => ROTAS_DA_BASE[c.rota](tenantId)
        try {
            const respostas = await Promise.allSettled(chamadas.map((c) => chamarRota(url(c), 'PUT', c.corpo)))
            const passaram = chamadas.filter((_, i) => respostas[i].status === 'fulfilled')
            const falharam = chamadas
                .map((c, i) => ({ c, r: respostas[i] }))
                .filter((x): x is { c: Chamada; r: PromiseRejectedResult } => x.r.status === 'rejected')
            for (const f of falharam) for (const b of f.c.blocos) avisar(b, { rota: f.r.reason as Error })

            const naoSalvos: Resultado['naoSalvos'] = [
                ...falharam.map((f) => ({ blocos: f.c.blocos, motivo: (f.r.reason as Error).message })),
                ...naoEnviados.map((n) => ({ blocos: [n.bloco], motivo: 'não enviado — corrija os campos marcados no bloco.' })),
            ]
            // a árvore salva é redesenhada pelo `depois` da RESPOSTA — o que o banco gravou, sem reler
            const daArvore = chamadas.findIndex((c) => c.rota === 'arvore')
            if (daArvore !== -1 && respostas[daArvore].status === 'fulfilled' && arvore) {
                const { depois } = (respostas[daArvore] as PromiseFulfilledResult<{ depois: Record<string, Linha[]> }>).value
                const nova = arvoreDoDepois(depois, arvore)
                setArvore(nova)
                setFormArvore(formularioDaArvore(nova))
            }
            const daEmpresa = passaram.filter((c) => c.rota !== 'arvore')
            if (daEmpresa.length) {
                // relê UMA vez e recompõe SÓ o que foi salvo; o que falhou fica como está na tela
                try {
                    const nova = await ler()
                    setBase(nova)
                    const salvos = new Set(daEmpresa.flatMap((c) => c.blocos))
                    if (salvos.has('adicionais')) setAdicionais({ ...(nova.adicionais ?? {}) })
                    if (salvos.has('ambientes')) setAmbientes(linhasDosAmbientes(nova.ambientes))
                    if (salvos.has('vendedores')) setVendedores(linhasDosVendedores(nova.vendedores))
                } catch (e) {
                    naoSalvos.push({ blocos: [], motivo: `as alterações foram gravadas, mas a base não pôde ser relida: ${(e as Error).message}` })
                }
            }
            setResultado({ salvos: passaram.flatMap((c) => c.blocos), naoSalvos })
            if (naoSalvos.length === 0) message.success('Alterações salvas')
        } finally {
            setSalvando(false)
        }
    }

    const acao = (
        <Space size={8} wrap>
            <Typography.Text data-pendencias type={pendentes ? 'warning' : 'secondary'}>{fraseDasPendencias(pendentes)}</Typography.Text>
            <Button data-salvar-alteracoes type="primary" disabled={pendentes === 0 || salvando} loading={salvando} onClick={salvarTudo}>Salvar alterações</Button>
        </Space>
    )
    const nomes = (bs: ChaveDoBloco[]) => bs.map((b) => TITULO_DO_BLOCO[b]).join(', ')
    const painelDoResultado = resultado && (
        <Alert data-resultado-do-salvar showIcon style={{ marginBottom: 16 }}
            type={resultado.naoSalvos.length === 0 ? 'success' : resultado.salvos.length ? 'warning' : 'error'}
            message={resultado.naoSalvos.length === 0 ? 'Todas as alterações foram salvas.' : 'Nem todas as alterações foram salvas.'}
            description={(
                <div>
                    {resultado.salvos.length > 0 && <div data-salvos>Salvo: {nomes(resultado.salvos)}.</div>}
                    {resultado.naoSalvos.length > 0 && (
                        <div data-nao-salvos>
                            {resultado.naoSalvos.map((n, i) => (
                                <div key={i}>Não salvo{n.blocos.length ? ` — ${nomes(n.blocos)}` : ''}: {n.motivo}</div>
                            ))}
                            <div>As alterações que não passaram continuam na tela, pendentes.</div>
                        </div>
                    )}
                </div>
            )} />
    )

    if (erroAoLer) return <>{topo(acao)}<Alert type="error" showIcon message="Não foi possível ler a base de conhecimento." description={erroAoLer} /></>
    if (!base) return <>{topo(acao)}</>

    const rodape = (b: ChaveDoBloco) => <AvisoDoBloco aviso={avisos[b] ?? null} />

    const avisoDaArvore = avisos.materias ?? null
    const blocoDasMaterias = (
        <MateriasPrimas key="materias" arvore={arvore} erroAoLer={erroDaArvore} estado={formArvore} mudar={setFormArvore}
            erros={planoArvore?.erros ?? []}
            erroDaRota={avisoDaArvore && 'rota' in avisoDaArvore ? avisoDaArvore.rota : null}
            naoEnviado={avisoDaArvore && 'locais' in avisoDaArvore ? avisoDaArvore.locais : null}
            aoMudarAFamilia={mudarAFamilia} familiaTravada={pendentes > 0} erroDaFamilia={erroDaFamilia}
            aoRenomear={renomear} erroDoNome={erroDoNome} etapasDaFamilia={(m) => (
                <EtapasDaFamilia key={m.id} tenantId={tenantId} materiaPrimaId={m.id as string}
                    principais={m.categorias.map((c) => c.fornecedores.principal).filter((f): f is string => f !== null)}
                    rotuloDaCategoria={(c) => arvore?.catalogo.categorias.find((x) => x.chave === c)?.rotulo ?? c} />
            )} />
    )

    const mudarLinha = (set: React.Dispatch<React.SetStateAction<Linhas>>, id: string, p: Partial<LinhaDaLista> | { valor: [string, unknown] }) =>
        set((ls) => ls.map((l) => (l.id !== id ? l : 'valor' in p ? { ...l, valores: { ...l.valores, [p.valor[0]]: p.valor[1] } } : { ...l, ...p })))

    const blocoDosAmbientes = (
        <Card key="ambientes" data-bloco="ambientes" title="Padrão por ambiente" style={{ marginBottom: 16 }}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                A lista é o estado: o ambiente removido aqui sai ao salvar. O nome de um ambiente gravado não se edita — remova e acrescente outro.
            </Typography.Paragraph>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {ambientes.length === 0 && <Typography.Text type="secondary">Nenhum ambiente.</Typography.Text>}
                {ambientes.map((l) => {
                    const gravado = base.ambientes.some((a) => String(a.ambiente) === l.chave) && !l.id.startsWith('novo')
                    const prefixo = gravado ? `ambiente:${l.chave}` : `ambiente-novo:${l.id}`
                    return (
                        <div key={l.id} data-campo={prefixo}>
                            <Space wrap align="end">
                                {gravado
                                    ? <Typography.Text strong style={{ minWidth: 140, display: 'inline-block' }}>{l.chave}</Typography.Text>
                                    : <Input aria-label={rotulo('ambiente')} placeholder={rotulo('ambiente')} value={l.chave} onChange={(e) => mudarLinha(setAmbientes, l.id, { chave: e.target.value })} />}
                                {CAMPOS_DO_AMBIENTE.map((c) => (
                                    <div key={c} data-campo={`${prefixo}:${c}`}>
                                        <Input allowClear aria-label={rotulo(c)} placeholder={rotulo(c)} value={typeof l.valores[c] === 'string' ? (l.valores[c] as string) : ''}
                                            onChange={(e) => mudarLinha(setAmbientes, l.id, { valor: [c, e.target.value] })} />
                                    </div>
                                ))}
                                <Button onClick={() => setAmbientes((ls) => ls.filter((x) => x.id !== l.id))}>Remover</Button>
                            </Space>
                        </div>
                    )
                })}
                <Button onClick={() => setAmbientes((ls) => [...ls, { id: `novo${novoId()}`, chave: '', valores: { vidro_padrao: null, tipologia_usual: null } }])}>Acrescentar</Button>
            </Space>
            {rodape('ambientes')}
        </Card>
    )

    const comPerfil = new Set(vendedores.map((v) => v.chave))
    const nomeDoFuncionario = (l: Linhas[number]) => l.nome ?? funcionarios?.find((f) => f.id === l.chave)?.nome ?? l.chave
    const blocoDosVendedores = (
        <Card key="vendedores" data-bloco="vendedores" title="Vendedores" style={{ marginBottom: 16 }}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                A lista é o estado: o vendedor removido aqui perde o perfil ao salvar. O funcionário vem do cadastro desta empresa.
            </Typography.Paragraph>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                {vendedores.length === 0 && <Typography.Text type="secondary">Nenhum vendedor com perfil.</Typography.Text>}
                {vendedores.map((l) => (
                    <div key={l.id} data-campo={`vendedor:${l.chave}`}>
                        <Typography.Text strong style={{ display: 'block', marginBottom: 4 }}>{nomeDoFuncionario(l)}</Typography.Text>
                        <Space wrap align="end">
                            {CAMPOS_DO_VENDEDOR.map((c) => (
                                <div key={c} data-campo={`vendedor:${l.chave}:${c}`} style={{ minWidth: 150 }}>
                                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{rotulo(c)}</Typography.Text>
                                    {c === 'comissao_modo'
                                        ? <Select allowClear aria-label={rotulo(c)} style={{ width: 150 }} value={(l.valores[c] as string | null) ?? undefined}
                                            onChange={(v) => mudarLinha(setVendedores, l.id, { valor: [c, v ?? null] })}
                                            options={MODOS_DA_COMISSAO.map((m) => ({ value: m.valor, label: m.rotulo }))} />
                                        : <InputNumber aria-label={rotulo(c)} min={0} max={100} style={{ width: 150 }} value={typeof l.valores[c] === 'number' ? (l.valores[c] as number) : null}
                                            onChange={(n) => mudarLinha(setVendedores, l.id, { valor: [c, typeof n === 'number' ? n : null] })} />}
                                </div>
                            ))}
                            <Button onClick={() => setVendedores((ls) => ls.filter((x) => x.id !== l.id))}>Remover</Button>
                        </Space>
                    </div>
                ))}
                {erroDosFuncionarios
                    ? <Alert type="error" showIcon message="Não foi possível ler os funcionários da empresa." description={erroDosFuncionarios} />
                    : (
                        <Space wrap>
                            <div data-campo="vendedor-novo">
                                <Select aria-label="Funcionário" placeholder="Escolha o funcionário" style={{ width: 260 }} value={vendedorNovo} onChange={setVendedorNovo}
                                    loading={funcionarios === null}
                                    options={(funcionarios ?? []).filter((f) => !comPerfil.has(f.id)).map((f) => ({ value: f.id, label: f.nome }))} />
                            </div>
                            <Button disabled={!vendedorNovo} onClick={() => {
                                if (!vendedorNovo) return
                                const f = funcionarios?.find((x) => x.id === vendedorNovo)
                                setVendedores((ls) => [...ls, { id: novoId(), chave: vendedorNovo, nome: f?.nome, valores: Object.fromEntries(CAMPOS_DO_VENDEDOR.map((c): [string, null] => [c, null])) }])
                                setVendedorNovo(undefined)
                            }}>Acrescentar</Button>
                        </Space>
                    )}
            </Space>
            {rodape('vendedores')}
        </Card>
    )

    const gravadoDosAdicionais = base.adicionais
    const blocoDosAdicionais = (
        <Card key="adicionais" data-bloco="adicionais" title="Adicionais da empresa" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 560 }}>
                {ADICIONAIS.map((x) => {
                    const modo = adicionais[`${x}_modo`] ?? null
                    const usa = usaNoModo(modo)
                    const marca = (c: string) => (!mesmoValor(adicionais[c] ?? null, gravadoDosAdicionais ? gravadoDosAdicionais[c] ?? null : null)
                        ? <Tag color="purple">alterado — não salvo</Tag> : null)
                    const numero = (c: string) => (
                        <div data-campo={c}>
                            <Space size={6}><Typography.Text>{rotulo(c)}</Typography.Text>{marca(c)}</Space>
                            <InputNumber aria-label={rotulo(c)} min={0} style={{ width: '100%' }} value={typeof adicionais[c] === 'number' ? (adicionais[c] as number) : null}
                                onChange={(n) => setAdicionais((f) => ({ ...f, [c]: typeof n === 'number' ? n : null }))} />
                        </div>
                    )
                    return (
                        <div key={x}>
                            <Typography.Title level={5} style={{ marginTop: 0 }}>{x === 'frete' ? 'Frete' : 'Instalação'}</Typography.Title>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <div data-campo={`${x}_modo`}>
                                    <Space size={6}><Typography.Text>{rotulo(`${x}_modo`)}</Typography.Text>{marca(`${x}_modo`)}</Space>
                                    <Select allowClear aria-label={rotulo(`${x}_modo`)} placeholder="Não informado" style={{ width: '100%' }} value={(modo as string | null) ?? undefined}
                                        onChange={(v) => setAdicionais((f) => trocarOModo(f, x, (v as Modo | undefined) ?? null))}
                                        options={MODOS.map((m) => ({ value: m, label: ROTULO_DO_MODO[m] }))} />
                                </div>
                                {usa.valor && numero(`${x}_valor`)}
                                {usa.percentual && numero(`${x}_percentual`)}
                                {usa.base && (
                                    <div data-campo={`${x}_base`}>
                                        <Space size={6}><Typography.Text>{rotulo(`${x}_base`)}</Typography.Text>{marca(`${x}_base`)}</Space>
                                        <Select allowClear aria-label={rotulo(`${x}_base`)} placeholder="Escolha a base" style={{ width: '100%' }}
                                            value={(adicionais[`${x}_base`] as string | null) ?? undefined}
                                            onChange={(v) => setAdicionais((f) => ({ ...f, [`${x}_base`]: v ?? null }))}
                                            options={BASES[x].map((b) => ({ value: b.valor, label: b.rotulo }))} />
                                    </div>
                                )}
                            </Space>
                        </div>
                    )
                })}
            </Space>
            {rodape('adicionais')}
        </Card>
    )

    return (
        <div>
            {topo(acao)}
            {painelDoResultado}
            {ORDEM_DOS_BLOCOS.map((b) => (b === 'ambientes' ? blocoDosAmbientes
                : b === 'vendedores' ? blocoDosVendedores
                    : b === 'adicionais' ? blocoDosAdicionais
                        : blocoDasMaterias))}
        </div>
    )
}
