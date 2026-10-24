/**
 * O cartão "Matérias-primas e seus fornecedores" — o miolo dos TRÊS NÍVEIS da base de conhecimento,
 * na maquete aprovada pelo dono do produto: um bloco por matéria-prima; dentro dele as seis
 * categorias, na ordem do catálogo, cada uma com os fornecedores (o primeiro é o principal) e o corpo
 * que a categoria pede — a grade de campos do catálogo, ou a tabela de vidros, de ferragens ou de
 * instalação.
 *
 * O componente só DESENHA e EDITA o formulário. A árvore do PUT, as regras da função e a leitura do
 * `depois` estão em `arvore.ts`; o botão é o único da tela, no topo (`base-de-conhecimento.component`).
 *
 * TRÊS ESTADOS, SEMPRE: todo booleano é sim / não / não informado — `usa` NULL não é "não", e voltar
 * para "não informado" é um clique. Não há caixa de marcar: ela só tem dois estados.
 *
 * O ERRO DA FUNÇÃO aparece INTEIRO: a mensagem traz o caminho ("materia-prima Aço, categoria PERFIL,
 * fornecedores: ..."), e é isso que diz ao super admin o que arrumar. Com caminho reconhecível ela vai
 * para o cartão da categoria; sem, para o topo do cartão.
 */
import React from 'react'
import { Alert, AutoComplete, Button, Card, Input, InputNumber, Radio, Select, Space, Tag, Typography } from 'antd'
import type { ErroNomeado } from '@/lib/atendimentos-ia/base-de-conhecimento'
import { ROTULO_DOS_TRES_ESTADOS, deTresEstados, paraTresEstados, type Par, type TresEstados } from '@/page-parts/atendimentos-ia/base-de-conhecimento/formulario'
import {
    ADICIONAR_FERRAGEM, ADICIONAR_MATERIA_PRIMA, ADICIONAR_VIDRO, CAMPO_DA_LINHA, LISTA_DA_CATEGORIA, NOVO_FORNECEDOR, POSICOES_DA_FERRAGEM, PRODUTOS_DA_INSTALACAO,
    ROTULO_DA_POSICAO, ROTULO_DO_PRODUTO, SEM_PRINCIPAL_DO_PERFIL, TITULO_DO_CARTAO,
    camposDa, categoriasConfiguradas, desfazerRemocao, estadoDaLinha, fraseDasCategorias, fraseLinhaForaDaTabela, fraseLinhaSemFormula, fraseSemTabelaEmUso,
    fraseTabelaSemLinha, nomeDoFornecedor, novaMateriaPrima, novoLocal, ondeEstaOErro, origemDaLinha,
    type ArvoreLida, type CategoriaDoFormulario, type EstadoDaArvore, type ItemDaLista, type MateriaPrimaDoFormulario, type TipoDoCampo,
} from '@/page-parts/atendimentos-ia/base-de-conhecimento/arvore'

type Linha = Record<string, unknown>
type Mudar = (f: (e: EstadoDaArvore) => EstadoDaArvore) => void

// ── O controle de um campo, pelo TIPO do catálogo ─────────────────────────────────────────────
/**
 * `nome` é o `name` dos três rádios, ÚNICO por campo: sem ele o antd usa o mesmo nome para todos os
 * grupos da página em teste, e marcar um desmarcaria o vizinho no DOM.
 */
function TresEstadosDoCampo({ valor, mudar, rotulo, nome }: { valor: unknown; mudar: (v: boolean | null) => void; rotulo: string; nome: string }) {
    return (
        <Radio.Group optionType="button" name={nome} aria-label={rotulo} value={paraTresEstados(valor)} onChange={(e) => mudar(deTresEstados(e.target.value as TresEstados))}
            options={(['sim', 'nao', 'nao_informado'] as const).map((e) => ({ value: e, label: ROTULO_DOS_TRES_ESTADOS[e] }))} />
    )
}

function ControleDoTipo({ tipo, valor, mudar, rotulo, nome }: { tipo: TipoDoCampo; valor: unknown; mudar: (v: unknown) => void; rotulo: string; nome: string }) {
    switch (tipo) {
        case 'texto':
            return <Input allowClear aria-label={rotulo} value={typeof valor === 'string' ? valor : ''} onChange={(e) => mudar(e.target.value)} />
        case 'inteiro':
        case 'numero':
            return (
                <InputNumber aria-label={rotulo} style={{ width: '100%' }} precision={tipo === 'inteiro' ? 0 : undefined}
                    value={typeof valor === 'number' ? valor : null} onChange={(n) => mudar(typeof n === 'number' ? n : null)} />
            )
        case 'booleano':
            return <TresEstadosDoCampo nome={nome} rotulo={rotulo} valor={valor} mudar={mudar} />
        case 'lista_texto':
            // esvaziar a lista é limpar: null. A lista vazia só existe se veio assim do banco, e fica intocada.
            return (
                <Select mode="tags" allowClear aria-label={rotulo} placeholder="Digite e tecle Enter" style={{ width: '100%' }} tokenSeparators={[',']}
                    value={Array.isArray(valor) ? (valor as string[]) : []} onChange={(v: string[]) => mudar(v.length ? v : null)} />
            )
        case 'mapa': {
            const pares = Array.isArray(valor) ? (valor as Par[]) : []
            const trocar = (i: number, p: Partial<Par>) => mudar(pares.map((x, j) => (j === i ? { ...x, ...p } : x)))
            return (
                <Space direction="vertical" style={{ width: '100%' }}>
                    {pares.map((p, i) => (
                        <Space key={i} wrap>
                            <Input aria-label={`Chave ${i + 1}`} placeholder="Cor do perfil" value={p.perfil} onChange={(e) => trocar(i, { perfil: e.target.value })} />
                            <span>→</span>
                            <Input aria-label={`Valor ${i + 1}`} placeholder="Cor do acessório" value={p.acessorio} onChange={(e) => trocar(i, { acessorio: e.target.value })} />
                            <Button onClick={() => mudar(pares.filter((_, j) => j !== i))}>Remover</Button>
                        </Space>
                    ))}
                    <Button onClick={() => mudar([...pares, { perfil: '', acessorio: '' }])}>Acrescentar par</Button>
                </Space>
            )
        }
    }
}

/**
 * PERFIL.linha — COMBOBOX: a lista é a da tabela em uso do fornecedor principal, e o super admin pode
 * digitar outra. Três estados, dois avisos DIFERENTES (ver `CAMPO_DA_LINHA` em `arvore.ts`): só com
 * regra (a tabela não dimensiona) e fora da tabela (digitada). Nenhum bloqueia. Sem principal ou sem
 * tabela, diz por quê.
 */
function LinhaDaTabela({ c, arvore, valor, mudar, rotulo }: { c: CategoriaDoFormulario; arvore: ArvoreLida; valor: unknown; mudar: (v: unknown) => void; rotulo: string }) {
    const origem = origemDaLinha(arvore, c)
    const atual = typeof valor === 'string' ? valor : ''
    const digitada = atual.trim()
    const frase = origem.estado === 'sem_principal' ? SEM_PRINCIPAL_DO_PERFIL
        : origem.estado === 'sem_tabela' ? fraseSemTabelaEmUso(origem.fornecedor)
            : origem.estado === 'tabela_sem_linha' ? fraseTabelaSemLinha(origem.fornecedor) : null
    const estado = origem.estado === 'lista' && digitada !== '' ? estadoDaLinha(origem, digitada) : null
    return (
        <>
            <AutoComplete aria-label={rotulo} style={{ width: '100%' }} allowClear value={atual} filterOption={false}
                onChange={(v: string | undefined) => mudar(v ?? '')}
                options={origem.estado === 'lista' ? origem.linhas.map((l) => ({ value: l, label: l })) : []} />
            {frase && <Typography.Text data-origem-da-linha type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>{frase}</Typography.Text>}
            {estado === 'sem_formula' && origem.estado === 'lista' && (
                <div data-linha-sem-formula style={{ marginTop: 6 }}><Alert type="warning" showIcon message={fraseLinhaSemFormula(digitada, origem.fornecedor)} /></div>
            )}
            {estado === 'fora_da_tabela' && origem.estado === 'lista' && (
                <div data-linha-fora-da-tabela style={{ marginTop: 6 }}><Alert type="warning" showIcon message={fraseLinhaForaDaTabela(digitada, origem.fornecedor)} /></div>
            )}
        </>
    )
}

// ── Os pedaços de uma categoria ──────────────────────────────────────────────────────────────
function Fornecedores({ c, arvore, mudar }: { c: CategoriaDoFormulario; arvore: ArvoreLida; mudar: (f: (c: CategoriaDoFormulario) => CategoriaDoFormulario) => void }) {
    const doNicho = new Set(arvore.fornecedores_do_nicho.map((f) => f.id))
    const nome = (id: string) => nomeDoFornecedor(arvore, c, id)
    const { ids, principal } = c.fornecedores
    const tirar = (id: string) => mudar((x) => {
        const resto = x.fornecedores.ids.filter((y) => y !== id)
        return { ...x, fornecedores: { ids: resto, principal: x.fornecedores.principal === id ? resto[0] ?? null : x.fornecedores.principal } }
    })
    const tornarPrincipal = (id: string) => mudar((x) => ({ ...x, fornecedores: { ids: [id, ...x.fornecedores.ids.filter((y) => y !== id)], principal: id } }))
    const acrescentar = (id: string) => mudar((x) => ({ ...x, fornecedores: { ids: [...x.fornecedores.ids, id], principal: x.fornecedores.principal ?? id } }))
    return (
        <div data-fornecedores style={{ marginBottom: 12 }}>
            <Space size={6} wrap>
                <Typography.Text type="secondary">Fornecedores:</Typography.Text>
                {ids.map((id) => (
                    <span key={id} data-fornecedor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', border: '1px solid #d9d9d9', borderRadius: 12 }}>
                        <span data-nome-do-fornecedor>{nome(id)}</span>
                        {id === principal && <span data-principal><Tag color="blue" style={{ marginInlineEnd: 0 }}>principal</Tag></span>}
                        {!doNicho.has(id) && <span data-fora-do-nicho><Tag color="red" style={{ marginInlineEnd: 0 }}>fora do nicho</Tag></span>}
                        {id !== principal && <Button data-tornar-principal type="link" size="small" onClick={() => tornarPrincipal(id)}>tornar principal</Button>}
                        <Button data-remover-fornecedor type="link" size="small" danger aria-label={`Remover ${nome(id)}`} onClick={() => tirar(id)}>×</Button>
                    </span>
                ))}
                <span data-novo-fornecedor>
                    <Select style={{ minWidth: 170 }} placeholder={NOVO_FORNECEDOR} value={null} disabled={!arvore.nicho}
                        onChange={(v: string | null) => { if (v) acrescentar(v) }}
                        options={arvore.fornecedores_do_nicho.filter((f) => !ids.includes(f.id)).map((f) => ({ value: f.id, label: f.nome }))} />
                </span>
                {!arvore.nicho && <Typography.Text type="secondary">A empresa não tem nicho: nenhum fornecedor pode ser dela.</Typography.Text>}
            </Space>
        </div>
    )
}

const celula: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'top' }

function TabelaDeVidros({ c, mudar, prefixo }: { c: CategoriaDoFormulario; prefixo: string; mudar: (f: (c: CategoriaDoFormulario) => CategoriaDoFormulario) => void }) {
    const trocar = (local: string, campo: string, v: unknown) => mudar((x) => ({ ...x, vidros: x.vidros.map((it) => (it.local === local ? { ...it, valores: { ...it.valores, [campo]: v } } : it)) }))
    return (
        <>
            <table data-tabela="vidros" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={celula}>Vidro</th><th style={celula}>Referência</th><th style={celula}>Onde predomina</th><th style={celula}></th></tr></thead>
                <tbody>
                    {c.vidros.map((it, i) => (
                        <tr key={it.local} data-vidro={i}>
                            <td style={celula} data-coluna="descricao">
                                {it.gravado ? <Typography.Text>{String(it.gravado.descricao)}</Typography.Text>
                                    : <Input aria-label="Vidro" value={typeof it.valores.descricao === 'string' ? it.valores.descricao : ''} onChange={(e) => trocar(it.local, 'descricao', e.target.value)} />}
                            </td>
                            <td style={celula} data-coluna="referencia">
                                <Input allowClear aria-label="Referência do vidro" value={typeof it.valores.referencia === 'string' ? it.valores.referencia : ''} onChange={(e) => trocar(it.local, 'referencia', e.target.value)} />
                            </td>
                            <td style={celula} data-coluna="onde_predomina">
                                <ControleDoTipo tipo="lista_texto" nome={`${prefixo}.${it.local}.onde_predomina`} rotulo="Onde predomina" valor={it.valores.onde_predomina} mudar={(v) => trocar(it.local, 'onde_predomina', v)} />
                            </td>
                            <td style={celula}><Button onClick={() => mudar((x) => ({ ...x, vidros: x.vidros.filter((y) => y.local !== it.local) }))}>Remover</Button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Button style={{ marginTop: 8 }} onClick={() => mudar((x) => ({ ...x, vidros: [...x.vidros, { local: novoLocal(), gravado: null, valores: { descricao: '', referencia: null, onde_predomina: null } }] }))}>{ADICIONAR_VIDRO}</Button>
        </>
    )
}

function TabelaDeFerragens({ c, mudar }: { c: CategoriaDoFormulario; mudar: (f: (c: CategoriaDoFormulario) => CategoriaDoFormulario) => void }) {
    const trocar = (local: string, campo: string, v: unknown) => mudar((x) => ({ ...x, ferragens: x.ferragens.map((it) => (it.local === local ? { ...it, valores: { ...it.valores, [campo]: v } } : it)) }))
    const texto = (it: ItemDaLista, campo: string, rotulo: string) => (
        <Input aria-label={rotulo} value={typeof it.valores[campo] === 'string' ? (it.valores[campo] as string) : ''} onChange={(e) => trocar(it.local, campo, e.target.value)} />
    )
    return (
        <>
            <table data-tabela="ferragens" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={celula}>Tipologia</th><th style={celula}>Posição</th><th style={celula}>Referência</th><th style={celula}>Descrição</th><th style={celula}>Cor</th><th style={celula}>Par em inox</th><th style={celula}></th></tr></thead>
                <tbody>
                    {c.ferragens.map((it, i) => (
                        <tr key={it.local} data-ferragem={i}>
                            <td style={celula} data-coluna="tipologia">{texto(it, 'tipologia', 'Tipologia')}</td>
                            <td style={celula} data-coluna="posicao">
                                <Select allowClear aria-label="Posição" placeholder="Não informada" style={{ minWidth: 120 }} value={(it.valores.posicao as string | null) ?? undefined}
                                    onChange={(v: string | undefined) => trocar(it.local, 'posicao', v ?? null)}
                                    options={POSICOES_DA_FERRAGEM.map((p) => ({ value: p, label: ROTULO_DA_POSICAO[p] }))} />
                            </td>
                            <td style={celula} data-coluna="referencia">
                                {it.gravado ? <Typography.Text>{String(it.gravado.referencia)}</Typography.Text> : texto(it, 'referencia', 'Referência')}
                            </td>
                            <td style={celula} data-coluna="descricao">{texto(it, 'descricao', 'Descrição')}</td>
                            <td style={celula} data-coluna="cor">{texto(it, 'cor', 'Cor')}</td>
                            <td style={celula} data-coluna="par_inox_referencia">{texto(it, 'par_inox_referencia', 'Par em inox')}</td>
                            <td style={celula}><Button onClick={() => mudar((x) => ({ ...x, ferragens: x.ferragens.filter((y) => y.local !== it.local) }))}>Remover</Button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Button style={{ marginTop: 8 }} onClick={() => mudar((x) => ({
                ...x, ferragens: [...x.ferragens, { local: novoLocal(), gravado: null, valores: { referencia: '', tipologia: '', posicao: null, descricao: '', cor: '', par_inox_referencia: null } }],
            }))}>{ADICIONAR_FERRAGEM}</Button>
        </>
    )
}

function TabelaDeInstalacao({ c, mudar, prefixo }: { c: CategoriaDoFormulario; prefixo: string; mudar: (f: (c: CategoriaDoFormulario) => CategoriaDoFormulario) => void }) {
    const trocar = (p: string, campo: string, v: unknown) => mudar((x) => ({ ...x, instalacao: { ...x.instalacao, [p]: { ...x.instalacao[p], [campo]: v } } }))
    const texto = (p: string, v: Linha, campo: string, rotulo: string) => (
        <Input allowClear aria-label={rotulo} value={typeof v[campo] === 'string' ? (v[campo] as string) : ''} onChange={(e) => trocar(p, campo, e.target.value)} />
    )
    const numero = (p: string, v: Linha, campo: string, rotulo: string) => (
        <InputNumber aria-label={rotulo} placeholder={rotulo} precision={0} style={{ width: 100 }} value={typeof v[campo] === 'number' ? (v[campo] as number) : null}
            onChange={(n) => trocar(p, campo, typeof n === 'number' ? n : null)} />
    )
    return (
        <table data-tabela="instalacao" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={celula}>Produto</th><th style={celula}>Usa?</th><th style={celula}>Referência</th><th style={celula}>Descrição</th><th style={celula}>Medida/folga</th></tr></thead>
            <tbody>
                {PRODUTOS_DA_INSTALACAO.map((p) => {
                    const v = c.instalacao[p]
                    return (
                        <tr key={p} data-produto={p}>
                            <td style={celula}>{ROTULO_DO_PRODUTO[p]}</td>
                            <td style={celula} data-coluna="usa"><TresEstadosDoCampo nome={`${prefixo}.${p}.usa`} rotulo={`Usa ${ROTULO_DO_PRODUTO[p]}`} valor={v.usa} mudar={(x) => trocar(p, 'usa', x)} /></td>
                            <td style={celula} data-coluna="referencia">{texto(p, v, 'referencia', 'Referência')}</td>
                            <td style={celula} data-coluna="descricao">{texto(p, v, 'descricao', 'Descrição')}</td>
                            <td style={celula} data-coluna="medida">
                                <Space size={4} wrap>
                                    {texto(p, v, 'medida', 'Medida')}
                                    {numero(p, v, 'folga_x', 'Folga X (mm)')}
                                    {numero(p, v, 'folga_y', 'Folga Y (mm)')}
                                </Space>
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}

function CartaoDaCategoria({ c, arvore, mudar, erro, prefixo }: {
    c: CategoriaDoFormulario; arvore: ArvoreLida; prefixo: string; mudar: (f: (c: CategoriaDoFormulario) => CategoriaDoFormulario) => void; erro: string | null
}) {
    const doCatalogo = arvore.catalogo.categorias.find((k) => k.chave === c.chave)
    const lista = LISTA_DA_CATEGORIA[c.chave]
    const campos = camposDa(arvore.catalogo, c.chave)
    return (
        <Card size="small" data-categoria={c.chave} style={{ marginBottom: 12 }}
            title={<span data-titulo-da-categoria>{`${doCatalogo?.ordem ?? '?'} · ${doCatalogo?.rotulo ?? c.chave}`}</span>}>
            {erro && <div data-erro-da-arvore style={{ marginBottom: 12 }}><Alert type="error" showIcon message={erro} /></div>}
            <Fornecedores c={c} arvore={arvore} mudar={mudar} />
            {campos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {campos.map((x) => (
                        <div key={x.chave} data-campo={`${c.chave}.${x.chave}`}>
                            <Typography.Text strong data-rotulo-do-campo style={{ display: 'block', marginBottom: 4 }}>{x.rotulo}</Typography.Text>
                            {c.chave === CAMPO_DA_LINHA.categoria && x.chave === CAMPO_DA_LINHA.campo
                                ? <LinhaDaTabela c={c} arvore={arvore} rotulo={x.rotulo} valor={c.config[x.chave]} mudar={(v) => mudar((y) => ({ ...y, config: { ...y.config, [x.chave]: v } }))} />
                                : <ControleDoTipo tipo={x.tipo} nome={`${prefixo}.${c.chave}.${x.chave}`} rotulo={x.rotulo} valor={c.config[x.chave]} mudar={(v) => mudar((y) => ({ ...y, config: { ...y.config, [x.chave]: v } }))} />}
                        </div>
                    ))}
                </div>
            )}
            {lista === 'vidros' && <TabelaDeVidros c={c} mudar={mudar} prefixo={`${prefixo}.${c.chave}`} />}
            {lista === 'ferragens' && <TabelaDeFerragens c={c} mudar={mudar} />}
            {lista === 'instalacao' && <TabelaDeInstalacao c={c} mudar={mudar} prefixo={`${prefixo}.${c.chave}`} />}
        </Card>
    )
}

function BlocoDaMateriaPrima({ m, i, arvore, mudarEstado, erros, erroDaFuncao }: {
    m: MateriaPrimaDoFormulario; i: number; arvore: ArvoreLida; mudarEstado: Mudar; erros: string[]; erroDaFuncao: { categoria: string; mensagem: string } | null
}) {
    const mudarMp = (f: (x: MateriaPrimaDoFormulario) => MateriaPrimaDoFormulario) =>
        mudarEstado((e) => ({ ...e, materias: e.materias.map((x) => (x.local === m.local ? f(x) : x)) }))
    const remover = () => mudarEstado((e) => ({
        materias: e.materias.filter((x) => x.local !== m.local),
        removidas: m.id ? [...e.removidas, { id: m.id, nome: m.nome }] : e.removidas,
    }))
    return (
        <div data-materia-prima={i} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div data-cabecalho-da-materia-prima style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {m.id
                    ? <Typography.Title level={5} style={{ margin: 0 }}>{m.nome}</Typography.Title>
                    : <Input aria-label="Nome da matéria-prima" placeholder="Nome da matéria-prima" style={{ maxWidth: 260 }} value={m.nome} onChange={(e) => mudarMp((x) => ({ ...x, nome: e.target.value }))} />}
                <span data-categorias-configuradas>{fraseDasCategorias(categoriasConfiguradas(m, arvore.catalogo), arvore.catalogo.categorias.length)}</span>
                <Button danger onClick={remover}>Remover</Button>
            </div>
            {erros.length > 0 && (
                <Alert data-erros-da-materia-prima type="warning" showIcon style={{ marginBottom: 12 }}
                    description={<ul style={{ margin: 0, paddingLeft: 18 }}>{erros.map((e, j) => <li key={j}>{e}</li>)}</ul>} />
            )}
            {m.categorias.map((c) => (
                <CartaoDaCategoria key={c.chave} c={c} arvore={arvore} prefixo={m.local} erro={erroDaFuncao?.categoria === c.chave ? erroDaFuncao.mensagem : null}
                    mudar={(f) => mudarMp((x) => ({ ...x, categorias: x.categorias.map((y) => (y.chave === c.chave ? f(y) : y)) }))} />
            ))}
        </div>
    )
}

// ── O cartão ───────────────────────────────────────────────────────────────────────────────
export function MateriasPrimas({ arvore, erroAoLer, estado, mudar, erros, erroDaRota, naoEnviado }: {
    arvore: ArvoreLida | null
    erroAoLer: string | null
    estado: EstadoDaArvore
    mudar: Mudar
    /** Os erros de preenchimento, ao vivo — nomeados por `materia:<local>`. */
    erros: ErroNomeado[]
    /** A recusa da função no último salvar, ou null. */
    erroDaRota: Error | null
    /** O que o último salvar segurou na tela, ou null. */
    naoEnviado: ErroNomeado[] | null
}) {
    const onde = erroDaRota ? ondeEstaOErro(erroDaRota.message, estado) : null
    return (
        <Card data-bloco="materias" title={TITULO_DO_CARTAO} style={{ marginBottom: 16 }}>
            {erroAoLer && <Alert type="error" showIcon message="Não foi possível ler as matérias-primas." description={erroAoLer} />}
            {erroDaRota && !onde && <div data-erro-da-arvore style={{ marginBottom: 12 }}><Alert type="error" showIcon message={erroDaRota.message} /></div>}
            {naoEnviado && naoEnviado.length > 0 && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Não enviado — corrija antes de salvar:"
                    description={<ul data-nao-enviado style={{ margin: 0, paddingLeft: 18 }}>{naoEnviado.map((e, i) => <li key={i}>{e.mensagem}</li>)}</ul>} />
            )}
            {arvore && !erroAoLer && (
                <>
                    {estado.materias.length === 0 && <Typography.Paragraph type="secondary">Nenhuma matéria-prima.</Typography.Paragraph>}
                    {estado.materias.map((m, i) => (
                        <BlocoDaMateriaPrima key={m.local} m={m} i={i} arvore={arvore} mudarEstado={mudar}
                            erros={erros.filter((e) => e.campo === `materia:${m.local}`).map((e) => e.mensagem)}
                            erroDaFuncao={onde && onde.local === m.local && erroDaRota ? { categoria: onde.categoria, mensagem: erroDaRota.message } : null} />
                    ))}
                    {estado.removidas.length > 0 && (
                        <div data-removidas style={{ marginBottom: 12 }}>
                            {estado.removidas.map((r) => (
                                <Space key={r.id} size={6} style={{ display: 'flex' }}>
                                    <Typography.Text type="danger">{r.nome} será removida ao salvar, com tudo o que está nela.</Typography.Text>
                                    <Button size="small" onClick={() => mudar((e) => desfazerRemocao(e, arvore, r.id))}>Desfazer</Button>
                                </Space>
                            ))}
                        </div>
                    )}
                    <Button onClick={() => mudar((e) => ({ ...e, materias: [...e.materias, novaMateriaPrima(arvore.catalogo)] }))}>{ADICIONAR_MATERIA_PRIMA}</Button>
                </>
            )}
        </Card>
    )
}

