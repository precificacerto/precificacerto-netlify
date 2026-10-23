/**
 * Os OITO blocos da base de conhecimento de UMA empresa, na ordem: Perfil, Vidro, Guarnição e
 * contramarco, Acessórios, Padrão por ambiente, Produção, Vendedores, Adicionais da empresa.
 *
 * Só CONSOME as rotas de `src/pages/api/super-admin/base-de-conhecimento/`. A empresa chega pela
 * prop — ela vem do CAMINHO da URL (`contas/[tenantId]/base-de-conhecimento`), nunca de um seletor
 * dentro do formulário: é por um seletor assim que uma escrita cairia na empresa errada.
 *
 * Nada abre preenchido de fábrica: o formulário mostra o que a empresa GRAVOU; o que vem do nicho
 * aparece como herdado, com a ORIGEM que a rota devolveu ('empresa' | 'nicho' | 'sem valor'), e o
 * input do campo herdado fica vazio — preenchê-lo é a empresa passar a decidir.
 *
 * Cada bloco salva sozinho, e o corpo leva SÓ o que mudou (`formulario.ts`). A recusa da rota fica no
 * bloco que salvou, com a frase, o código e os erros nomeados como vieram.
 *
 * Booleanos têm TRÊS estados — sim, não, não informado — e não há caixa de marcar: uma caixa só
 * tem dois, e o terceiro ("não informado", que herda) sumiria.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Input, InputNumber, Radio, Select, Space, Tag, Typography, message } from 'antd'
import { ErroDaRota, chamarRota } from '@/page-parts/atendimentos-ia/api'
import type { Dominio, ErroNomeado, Origem } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    ADICIONAIS, BASES, BLOCOS_DE_ESQUADRIAS, CAMPOS_DO_AMBIENTE, CAMPOS_DO_VENDEDOR, MODOS, MODOS_DA_COMISSAO, ORDEM_DOS_BLOCOS,
    ROTAS_DA_BASE, ROTULO_DA_ORIGEM, ROTULO_DO_CAMPO, ROTULO_DO_MODO, ROTULO_DOS_TRES_ESTADOS,
    corpoDaLista, corpoDosAdicionais, deTresEstados, dominioDe, formularioDoValor, mesmoValor, mudancas, paraTresEstados,
    trocarOModo, usaNoModo, valorDoFormulario,
    type ChaveDoBloco, type LinhaDaLista, type Modo, type Par, type TresEstados,
} from '@/page-parts/atendimentos-ia/base-de-conhecimento/formulario'

type Linha = Record<string, unknown>
type Efetivo = Record<string, { valor: unknown; origem: Origem }>
export interface BaseDaEmpresa {
    tenant_id: string
    nicho: { id: string; modelo: string; nome: string } | null
    esquadrias: { empresa: Linha | null; nicho: Linha | null; efetivo: Efetivo }
    adicionais: Linha | null
    ambientes: Linha[]
    vendedores: Linha[]
}
type Funcionario = { id: string; nome: string }
type Linhas = Array<LinhaDaLista & { id: string; nome?: string }>
/** O que um bloco tem a dizer depois de tentar salvar: a recusa da rota, ou o que segurou na tela. */
type Aviso = { rota: ErroDaRota | Error } | { locais: ErroNomeado[] }

const COR_DA_ORIGEM: Record<Origem, string> = { empresa: 'blue', nicho: 'gold', 'sem valor': 'default' }
const BORDA_DA_ORIGEM: Record<Origem, string> = { empresa: '3px solid #1677ff', nicho: '3px dashed #d4a017', 'sem valor': '3px solid transparent' }

const rotulo = (c: string) => ROTULO_DO_CAMPO[c] ?? c
function textoDoValor(v: unknown): string {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'object') return Object.entries(v as Linha).map(([k, x]) => `${k} → ${x}`).join('; ')
    return String(v)
}

let proximoId = 0
const novoId = () => `n${++proximoId}`

function formularioDasEsquadrias(empresa: Linha | null): Linha {
    const f: Linha = {}
    for (const b of BLOCOS_DE_ESQUADRIAS) for (const c of b.campos) f[c] = formularioDoValor(dominioDe(c), empresa ? empresa[c] : null)
    return f
}
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

// ── Um campo das esquadrias ────────────────────────────────────────────────────────────────
function Editor({ c, d, valor, mudar, placeholder }: { c: string; d: Dominio; valor: unknown; mudar: (v: unknown) => void; placeholder?: string }) {
    switch (d.tipo) {
        case 'texto':
            return <Input allowClear aria-label={rotulo(c)} placeholder={placeholder} value={typeof valor === 'string' ? valor : ''} onChange={(e) => mudar(e.target.value)} />
        case 'textos':
            return (
                <Select mode="tags" allowClear aria-label={rotulo(c)} placeholder={placeholder ?? 'Digite e tecle Enter'} style={{ width: '100%' }}
                    value={Array.isArray(valor) ? (valor as string[]) : []} onChange={(v) => mudar(v)} tokenSeparators={[',']} />
            )
        case 'booleano':
            return (
                <Radio.Group optionType="button" value={paraTresEstados(valor)} onChange={(e) => mudar(deTresEstados(e.target.value as TresEstados))}
                    options={(['sim', 'nao', 'nao_informado'] as const).map((e) => ({ value: e, label: ROTULO_DOS_TRES_ESTADOS[e] }))} />
            )
        case 'inteiro':
        case 'numero':
            return (
                <InputNumber aria-label={rotulo(c)} placeholder={placeholder} style={{ width: '100%' }} precision={d.tipo === 'inteiro' ? 0 : undefined}
                    min={d.tipo === 'inteiro' ? (d.positivo ? 1 : undefined) : d.minimo} max={d.tipo === 'numero' && d.maximo !== null ? d.maximo : undefined}
                    value={typeof valor === 'number' ? valor : null} onChange={(n) => mudar(typeof n === 'number' ? n : null)} />
            )
        case 'mapaDeTexto': {
            const pares = Array.isArray(valor) ? (valor as Par[]) : []
            const trocar = (i: number, p: Partial<Par>) => mudar(pares.map((x, j) => (j === i ? { ...x, ...p } : x)))
            return (
                <Space direction="vertical" style={{ width: '100%' }}>
                    {pares.map((p, i) => (
                        <Space key={i} wrap>
                            <Input aria-label={`Cor do perfil ${i + 1}`} placeholder="Cor do perfil" value={p.perfil} onChange={(e) => trocar(i, { perfil: e.target.value })} />
                            <span>→</span>
                            <Input aria-label={`Cor do acessório ${i + 1}`} placeholder="Cor do acessório" value={p.acessorio} onChange={(e) => trocar(i, { acessorio: e.target.value })} />
                            <Button onClick={() => mudar(pares.filter((_, j) => j !== i))}>Remover</Button>
                        </Space>
                    ))}
                    <Button onClick={() => mudar([...pares, { perfil: '', acessorio: '' }])}>Acrescentar par</Button>
                </Space>
            )
        }
        case 'opcao':
            return null
    }
}

function CampoDaEsquadria({ c, efetivo, gravado, valor, mudar }: { c: string; efetivo: Efetivo; gravado: Linha | null; valor: unknown; mudar: (v: unknown) => void }) {
    const d = dominioDe(c)
    const { valor: herdado, origem } = efetivo[c] ?? { valor: null, origem: 'sem valor' as Origem }
    const normalizado = valorDoFormulario(d, valor)
    const alterado = normalizado.erro !== null || !mesmoValor(normalizado.valor, gravado ? gravado[c] : null)
    return (
        <div data-campo={c} data-origem-do-campo={origem} style={{ borderLeft: BORDA_DA_ORIGEM[origem], paddingLeft: 10 }}>
            <Space size={6} wrap style={{ marginBottom: 4 }}>
                <Typography.Text strong>{rotulo(c)}</Typography.Text>
                <Tag data-origem color={COR_DA_ORIGEM[origem]}>{ROTULO_DA_ORIGEM[origem]}</Tag>
                {alterado && <Tag color="purple">alterado — não salvo</Tag>}
            </Space>
            <Editor c={c} d={d} valor={valor} mudar={mudar} placeholder={origem === 'nicho' ? `herdado: ${textoDoValor(herdado)}` : undefined} />
            {origem === 'nicho' && (
                <Typography.Text type="secondary" italic style={{ display: 'block', fontSize: 12 }}>
                    Valor do nicho: {textoDoValor(herdado)}. Preencher aqui grava na empresa; deixar vazio continua herdando.
                </Typography.Text>
            )}
        </div>
    )
}

// ── O componente ───────────────────────────────────────────────────────────────────────────
export function BaseDeConhecimento({ tenantId }: { tenantId: string }) {
    const [base, setBase] = useState<BaseDaEmpresa | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [funcionarios, setFuncionarios] = useState<Funcionario[] | null>(null)
    const [erroDosFuncionarios, setErroDosFuncionarios] = useState<string | null>(null)
    const [esquadrias, setEsquadrias] = useState<Linha>({})
    const [adicionais, setAdicionais] = useState<Linha>({})
    const [ambientes, setAmbientes] = useState<Linhas>([])
    const [vendedores, setVendedores] = useState<Linhas>([])
    const [vendedorNovo, setVendedorNovo] = useState<string | undefined>(undefined)
    const [avisos, setAvisos] = useState<Partial<Record<ChaveDoBloco, Aviso | null>>>({})
    const [salvando, setSalvando] = useState<ChaveDoBloco | null>(null)

    const ler = useCallback(async () => chamarRota<BaseDaEmpresa>(ROTAS_DA_BASE.base(tenantId)), [tenantId])

    useEffect(() => {
        let vivo = true
        ler().then((b) => {
            if (!vivo) return
            setBase(b)
            setEsquadrias(formularioDasEsquadrias(b.esquadrias.empresa))
            setAdicionais({ ...(b.adicionais ?? {}) })
            setAmbientes(linhasDosAmbientes(b.ambientes))
            setVendedores(linhasDosVendedores(b.vendedores))
            setErroAoLer(null)
        }).catch((e) => { if (vivo) setErroAoLer((e as Error).message) })
        chamarRota<{ funcionarios: Funcionario[] }>(ROTAS_DA_BASE.funcionarios(tenantId))
            .then((r) => { if (vivo) setFuncionarios(r.funcionarios) })
            .catch((e) => { if (vivo) setErroDosFuncionarios((e as Error).message) })
        return () => { vivo = false }
    }, [tenantId, ler])

    if (erroAoLer) return <Alert type="error" showIcon message="Não foi possível ler a base de conhecimento." description={erroAoLer} />
    if (!base) return null

    const avisar = (b: ChaveDoBloco, a: Aviso | null) => setAvisos((x) => ({ ...x, [b]: a }))

    /** Envia; no sucesso, relê e devolve a base nova para o bloco recompor SÓ o que é dele. */
    async function enviar(b: ChaveDoBloco, url: string, corpo: unknown): Promise<BaseDaEmpresa | null> {
        setSalvando(b)
        avisar(b, null)
        try {
            await chamarRota(url, 'PUT', corpo)
            const nova = await ler()
            setBase(nova)
            message.success('Salvo')
            return nova
        } catch (e) {
            avisar(b, { rota: e as Error })
            return null
        } finally {
            setSalvando(null)
        }
    }

    async function salvarEsquadrias(b: ChaveDoBloco, campos: readonly string[]) {
        if (!base) return
        const { corpo, erros } = mudancas(campos, dominioDe, base.esquadrias.empresa, esquadrias)
        if (erros.length) return avisar(b, { locais: erros })
        if (Object.keys(corpo).length === 0) { avisar(b, null); message.info('Nada mudou neste bloco.'); return }
        const nova = await enviar(b, ROTAS_DA_BASE.base(tenantId), { esquadrias: corpo })
        if (nova) {
            const recomposto = formularioDasEsquadrias(nova.esquadrias.empresa)
            setEsquadrias((f) => ({ ...f, ...Object.fromEntries(campos.map((c) => [c, recomposto[c]])) }))
        }
    }

    async function salvarAdicionais() {
        if (!base) return
        const { corpo, erros } = corpoDosAdicionais(base.adicionais, adicionais)
        if (erros.length) return avisar('adicionais', { locais: erros })
        if (Object.keys(corpo).length === 0) { avisar('adicionais', null); message.info('Nada mudou neste bloco.'); return }
        const nova = await enviar('adicionais', ROTAS_DA_BASE.base(tenantId), { adicionais: corpo })
        if (nova) setAdicionais({ ...(nova.adicionais ?? {}) })
    }

    async function salvarLista(b: 'ambientes' | 'vendedores') {
        if (!base) return
        const ehAmbiente = b === 'ambientes'
        const r = ehAmbiente
            ? corpoDaLista('ambiente', CAMPOS_DO_AMBIENTE, base.ambientes, ambientes)
            : corpoDaLista('employee_id', CAMPOS_DO_VENDEDOR, base.vendedores, vendedores)
        if (r.erros.length) return avisar(b, { locais: r.erros })
        if (!r.mudou) { avisar(b, null); message.info('Nada mudou neste bloco.'); return }
        const nova = await enviar(b, ehAmbiente ? ROTAS_DA_BASE.ambiente(tenantId) : ROTAS_DA_BASE.vendedor(tenantId), ehAmbiente ? { ambientes: r.itens } : { vendedores: r.itens })
        if (nova) {
            if (ehAmbiente) setAmbientes(linhasDosAmbientes(nova.ambientes))
            else setVendedores(linhasDosVendedores(nova.vendedores))
        }
    }

    const rodape = (b: ChaveDoBloco, salvar: () => void) => (
        <>
            <AvisoDoBloco aviso={avisos[b] ?? null} />
            <div style={{ marginTop: 12 }}><Button type="primary" loading={salvando === b} onClick={salvar}>Salvar</Button></div>
        </>
    )

    const blocoDeEsquadrias = (chave: ChaveDoBloco) => {
        const b = BLOCOS_DE_ESQUADRIAS.find((x) => x.chave === chave)!
        return (
            <Card key={chave} data-bloco={chave} title={b.titulo} style={{ marginBottom: 16 }}>
                <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 560 }}>
                    {b.campos.map((c) => (
                        <CampoDaEsquadria key={c} c={c} efetivo={base.esquadrias.efetivo} gravado={base.esquadrias.empresa} valor={esquadrias[c]}
                            mudar={(v) => setEsquadrias((f) => ({ ...f, [c]: v }))} />
                    ))}
                </Space>
                {rodape(chave, () => salvarEsquadrias(chave, b.campos))}
            </Card>
        )
    }

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
            {rodape('ambientes', () => salvarLista('ambientes'))}
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
                                setVendedores((ls) => [...ls, { id: novoId(), chave: vendedorNovo, nome: f?.nome, valores: Object.fromEntries(CAMPOS_DO_VENDEDOR.map((c) => [c, null])) }])
                                setVendedorNovo(undefined)
                            }}>Acrescentar</Button>
                        </Space>
                    )}
            </Space>
            {rodape('vendedores', () => salvarLista('vendedores'))}
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
            {rodape('adicionais', salvarAdicionais)}
        </Card>
    )

    return (
        <div>
            {ORDEM_DOS_BLOCOS.map((b) => (b === 'ambientes' ? blocoDosAmbientes
                : b === 'vendedores' ? blocoDosVendedores
                    : b === 'adicionais' ? blocoDosAdicionais
                        : blocoDeEsquadrias(b)))}
        </div>
    )
}
