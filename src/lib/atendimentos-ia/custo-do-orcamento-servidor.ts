/**
 * O CUSTO DO ORÇAMENTO I.A. PELO CAMINHO COMPLETO (o 1b, dono do produto, 09/11/2026): as esquadrias do orçamento passam pelo MESMO
 * cálculo da conversa (`calcularOLevantamento` — a família, o motor, as barras por código, a mão de obra), e o resultado de cada família
 * vira a entrada de `custoDoOrcamento` (o 1a). Um caminho só: a conversa e o orçamento não calculam as barras de dois jeitos.
 *
 * FALTA DE PREÇO NÃO IMPEDE A EVOLUÇÃO (dono do produto, 12/11/2026): o perfil, o insumo e o vidro sem preço ficam FORA do custo e saem em
 * `faltas`, uma por (item, código), com o caminho, o motivo e a frase — o que `orcamentista_orcamento_falta` grava. Continuam recusa: a recusa
 * do levantamento (a frase que o vendedor leria), a família sem etapa de cálculo, a tipologia sem tempo e o valor do minuto ausente.
 *
 * OS ESCOPOS (1.2): o PERFIL resolve no fornecedor do MOTOR (o cálculo das barras já o fez); o INSUMO, nas tabelas do fornecedor PRINCIPAL da
 * CATEGORIA de cada tabela (`principaisDaConta`), fora das categorias PERFIL e VIDRO; o VIDRO, nas tabelas da categoria VIDRO do principal
 * dela, pelo código escolhido (`vidro_codigo`) ou pela tradução do texto (`traduzirVidro`).
 *
 * O VIDRO NOMEADO SEM ESPESSURA (dono do produto, 15/11/2026): "mini boreal" bate com vários itens da tabela. Quando EXATAMENTE UM dos
 * candidatos é um código que a empresa cadastrou como vidro padrão (`orcamentista_vidro_padrao`), ele desempata, e a resolução gravada é
 * `vidro_padrao` (a 20261115000002). Sem padrão entre eles, ou com mais de um, continua falta nomeada — nada se completa, nada se escolhe
 * por ser o mais barato. A tabela que não existe (`sem_migracao`) ou a leitura que falha deixam a lista vazia: o empate volta a ser falta.
 *
 * A DESCIDA DO INSUMO (dono do produto, 14/11/2026, tarefa 0010): não achando no principal, a busca DESCE os outros fornecedores da categoria
 * na ordem do cadastro (`niveisDoInsumo`, `resolverDescendo`) e para no primeiro que resolve. Duas candidatas no mesmo degrau continuam falta
 * nomeada, e a descida para ali; entre degraus, vence o de menor ordem. Não achando em nenhum, a falta diz em quantos fornecedores procurou.
 * O VIDRO não desce nesta tarefa (um fornecedor só de VIDRO na conta medida).
 *
 * O MODO é o fallback SEM aproveitamento: as barras de cada FAMÍLIA são rateadas entre as esquadrias dela (as barras de uma família não
 * entram na otimização da outra — a mesma regra da conversa).
 */
import type { PecaDoCorte } from './relatorio-de-corte'
import { calcularOLevantamento, mensagemDoCalculo, type EsquadriaGravada, type FamiliasDaEmpresa, type ItemDaFamilia } from './levantamento-da-conversa'
import { custoDoOrcamento, valorDoMinuto, chaveDoMaterial, PERCENTUAIS, type CaminhoDoCusto, type CustoDoItem, type MaterialDaTabela, type Percentuais, type ResolucaoGravada } from './custo-do-orcamento'
import type { ItemDaTabela } from './levantamento-de-barras'
import { resolverReferencia, GRUPO_DE_COR, type ContextoDaResolucao, type ReferenciaProcurada, type ResolucaoDeReferencia } from './resolucao-de-referencia'
import { traduzirVidro } from './vidro-da-tabela'
import { lerVidrosPadraoDaConta } from './vidro-padrao'
import { principaisDaConta, type PrincipaisDaConta } from './tabelas-da-conta'

/** O valor do minuto e a configuração da empresa de onde ele saiu — o mesmo par que a precificação final usa. */
export type MaoDeObraDaEmpresa = { custoMensal: number; minutosDaEmpresa: number; valorDoMinuto: number }
/**
 * Uma FALTA NOMEADA, como `orcamentista_orcamento_falta` a grava (20261112000006): `item` é o índice em `lev.itens`; `esquadria`, o número dela
 * no levantamento (a partir de 1).
 */
export type FaltaDoOrcamento = {
    item: number
    caminho: CaminhoDoCusto
    codigo_do_motor: string
    descricao_do_motor: string | null
    cor: string | null
    tipologia: string
    esquadria: number
    motivo: string
    frase: string
    candidatas: Array<{ codigo: string; descricao: string | null }>
}
export type CustoDoLevantamento =
    | {
        ok: true; itens: CustoDoItem[]; maoDeObra: MaoDeObraDaEmpresa; faltas: FaltaDoOrcamento[]
        /** As peças de perfil de cada item, na ordem de `itens` (o relatório de corte, 16/11/2026): o que o cálculo levantou e com que barra e serra. */
        pecasPorItem: PecaDoCorte[][]
    }
    | { ok: false; recusas: string[] }

export const fraseDaFamiliaSemCalculo = (rotulo: string) =>
    `a etapa de cálculo da família ${rotulo}: sem ela as barras e a mão de obra não saem, e o orçamento não tem custo`
export const CATEGORIAS_FORA_DO_INSUMO: ReadonlySet<string> = new Set(['PERFIL', 'VIDRO'])
export const fraseDaCategoriaSemPrincipal = (categoria: string) => `a categoria ${categoria} tem mais de um fornecedor principal na base de conhecimento`

const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/**
 * O item da tabela como o custo o lê: o bloco pelos nomes da tabela; o que não veio é nulo, nunca 0. `codigo` é o DO MOTOR (o que as peças
 * citam; no vidro, o do item); o do item vai em `codigo_na_tabela`, e `resolucao` diz como ele foi achado.
 */
export function materialDoItem(caminho: CaminhoDoCusto, codigoDoMotor: string, i: ItemDaTabela, como: ResolucaoGravada): MaterialDaTabela {
    const bloco = Object.fromEntries(PERCENTUAIS.map((p) => [p, numeroOuNulo((i as Record<string, unknown>)[p])])) as Percentuais
    return {
        caminho, codigo: codigoDoMotor, codigo_na_tabela: i.codigo, resolucao: como, descricao: i.descricao ?? null, unidade: i.unidade ?? null,
        medida_barra_m: numeroOuNulo(i.medida_barra_m), valor_barra_interno: numeroOuNulo(i.valor_barra_interno), custo: numeroOuNulo(i.custo), bloco,
        vendido_por: typeof i.vendido_por === 'string' && i.vendido_por.trim() !== '' ? i.vendido_por.trim().toLowerCase() : null,
    }
}

/** Os itens do escopo do INSUMO: as tabelas de cada categoria (fora PERFIL e VIDRO) do fornecedor principal dela. */
export function escopoDoInsumo<I extends ItemDaFamilia>(todos: readonly I[], p: PrincipaisDaConta): I[] {
    return todos.filter((i) => i.categoria !== null && !CATEGORIAS_FORA_DO_INSUMO.has(i.categoria) && p.principais.get(i.categoria) === i.fornecedor_id)
}
/**
 * Os DEGRAUS da descida do insumo: o primeiro é `escopoDoInsumo` (os principais); o k-ésimo seguinte junta, de cada categoria, o k-ésimo grupo
 * de `seguintes` (os fornecedores daquela ordem). Uma categoria com menos grupos simplesmente não entra nos degraus de baixo.
 */
export function niveisDoInsumo<I extends ItemDaFamilia>(todos: readonly I[], p: PrincipaisDaConta): I[][] {
    const profundidade = Math.max(0, ...[...p.seguintes.values()].map((g) => g.length))
    const niveis: I[][] = [escopoDoInsumo(todos, p)]
    for (let k = 0; k < profundidade; k++) {
        niveis.push(todos.filter((i) => i.categoria !== null && !CATEGORIAS_FORA_DO_INSUMO.has(i.categoria) && (p.seguintes.get(i.categoria)?.[k] ?? []).includes(i.fornecedor_id)))
    }
    return niveis
}
/** "procurado em 3 fornecedores, na ordem cadastrada" — o que a falta da descida acrescenta à frase. */
export const fraseDosFornecedoresProcurados = (n: number) =>
    n === 0 ? 'nenhum fornecedor das categorias do insumo tem tabela com itens' : `procurado em ${n} fornecedor${n === 1 ? '' : 'es'}, na ordem cadastrada`
/**
 * A RESOLUÇÃO QUE DESCE: degrau a degrau, a mesma `resolverReferencia` (com o guarda da descrição em cada um). Achou → para. `AMBIGUA` → para
 * com a falta (duas candidatas no mesmo degrau não se escolhem). Qualquer outra falta → desce. Sem achar em nenhum, a falta é a primeira que
 * não seja `NAO_ACHADA` (é ela que explica por que um fornecedor quase serviu), ou `NAO_ACHADA`; e a frase diz quantos fornecedores foram vistos.
 */
export function resolverDescendo<I extends ItemDaFamilia>(ref: ReferenciaProcurada, niveis: ReadonlyArray<readonly I[]>, ctx: ContextoDaResolucao): ResolucaoDeReferencia<I> {
    const vistos = new Set<string>()
    let primeira: Extract<ResolucaoDeReferencia<I>, { achada: false }> | null = null
    let explica: Extract<ResolucaoDeReferencia<I>, { achada: false }> | null = null
    const comContagem = (f: Extract<ResolucaoDeReferencia<I>, { achada: false }>) => ({ ...f, frase: `${f.frase} — ${fraseDosFornecedoresProcurados(vistos.size)}` })
    for (const nivel of niveis) {
        if (nivel.length === 0) continue
        for (const i of nivel) vistos.add(i.fornecedor_id)
        const r = resolverReferencia(ref, nivel, ctx)
        if ('item' in r) return r
        if (r.motivo === 'AMBIGUA') return comContagem(r)
        if (primeira === null) primeira = r
        if (explica === null && r.motivo !== 'NAO_ACHADA') explica = r
    }
    const f = explica ?? primeira ?? resolverReferencia(ref, [] as I[], ctx)
    return 'item' in f ? f : comContagem(f)
}
/** Os itens do escopo do VIDRO: as tabelas da categoria VIDRO do fornecedor principal dela. */
export function escopoDoVidro<I extends ItemDaFamilia>(todos: readonly I[], p: PrincipaisDaConta): I[] {
    const principal = p.principais.get('VIDRO')
    return principal === undefined ? [] : todos.filter((i) => i.categoria === 'VIDRO' && i.fornecedor_id === principal)
}
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * O custo de cada esquadria de `lev`, na ordem de `lev.itens`, e as faltas nomeadas; ou as recusas. `itens` do resultado tem o mesmo
 * comprimento e a mesma ordem de `lev.itens`.
 */
export async function custoDoLevantamento(tenantId: string, fonte: FamiliasDaEmpresa, lev: { nome: string; itens: EsquadriaGravada[] }): Promise<CustoDoLevantamento> {
    const c = await calcularOLevantamento(tenantId, fonte, lev)
    if ('recusa' in c) return { ok: false, recusas: [c.recusa.texto] }
    const mensagem = mensagemDoCalculo(c)
    if (mensagem.desfecho !== 'levantou') return { ok: false, recusas: [mensagem.texto] }
    const principais = await principaisDaConta(tenantId)
    // os CÓDIGOS que a empresa cadastrou como vidro padrão: desempatam o texto que bate com vários itens (nunca completam nem escolhem o mais barato)
    const padroes = await lerVidrosPadraoDaConta(tenantId)
    const codigosDoPadrao = padroes.ok ? [...new Set([...padroes.porFamilia.values()].flat().map((l) => l.item_codigo))] : []

    const porItem: Array<CustoDoItem | undefined> = new Array(lev.itens.length)
    const pecasPorItem: PecaDoCorte[][] = lev.itens.map((): PecaDoCorte[] => [])
    const recusas: string[] = []
    const faltas: FaltaDoOrcamento[] = []
    let maoDeObra: MaoDeObraDaEmpresa | null = null
    c.grupos.forEach((g, k) => {
        const calculo = c.calculos[k]
        if ('semCalculo' in calculo) { recusas.push(fraseDaFamiliaSemCalculo(g.familia.rotulo)); return }
        if ('faltas' in calculo) { recusas.push(...calculo.faltas); return }
        // o valor do minuto é da EMPRESA (o mesmo em toda mão de obra que fechou); sem nenhuma que fechou, não há valor
        const fechada = calculo.maos.find((m): m is Extract<typeof m, { ok: true }> => 'custoMensal' in m)
        const valor = fechada ? valorDoMinuto(fechada.custoMensal, fechada.minutosDaEmpresa) : null
        if (fechada && valor !== null) maoDeObra = { custoMensal: fechada.custoMensal, minutosDaEmpresa: fechada.minutosDaEmpresa, valorDoMinuto: valor }
        const cor = calculo.d.cor
        // a esquadria j do grupo (1 a n, a do levantamento da família) → o item do orçamento e o número dela no levantamento inteiro
        const doGrupo = (j: number) => ({ item: g.indices[j - 1], esquadria: calculo.d.esquadrias[j - 1]?.numero ?? j, tipologia: calculo.d.esquadrias[j - 1]?.tipologia ?? '' })
        const faltar = (j: number, f: Omit<FaltaDoOrcamento, 'item' | 'esquadria' | 'tipologia' | 'cor'>) => faltas.push({ ...doGrupo(j), cor, ...f })

        // PERFIL: a resolução do cálculo das barras (nenhuma segunda busca), e as faltas dela
        const materiais: Record<string, MaterialDaTabela> = {}
        for (const [codigo, { item, como }] of Object.entries(calculo.r.resolucoes)) materiais[chaveDoMaterial('perfil', codigo)] = materialDoItem('perfil', codigo, item, como)
        for (const f of calculo.r.faltas) faltar(f.esquadria, { caminho: 'perfil', codigo_do_motor: f.codigo_do_motor, descricao_do_motor: f.descricao_do_motor, motivo: f.motivo, frase: f.frase, candidatas: f.candidatas })

        // INSUMO: uma resolução por código, descendo a ordem dos fornecedores da categoria (o principal primeiro)
        const niveis = niveisDoInsumo(calculo.daFamilia.todos, principais)
        const contexto = { cores: calculo.cores, grupoDeCor: GRUPO_DE_COR.insumo }
        const resolvidos = new Map<string, ReturnType<typeof resolverReferencia<ItemDaFamilia>>>()
        calculo.r.esquadrias.forEach((e, j0) => {
            for (const i of e.insumos) {
                if (!resolvidos.has(i.codigo)) {
                    resolvidos.set(i.codigo, resolverDescendo({ codigoDoMotor: i.codigo, codigoDaPonte: null, ponteDoCodigo: [], descricaoDoMotor: i.descricao, corPedida: cor }, niveis, contexto))
                }
                const r = resolvidos.get(i.codigo)!
                if ('item' in r) materiais[chaveDoMaterial('insumo', i.codigo)] = materialDoItem('insumo', i.codigo, r.item, r.como)
                else if (!faltas.some((f) => f.caminho === 'insumo' && f.codigo_do_motor === i.codigo && f.item === g.indices[j0])) {
                    faltar(j0 + 1, { caminho: 'insumo', codigo_do_motor: i.codigo, descricao_do_motor: i.descricao, motivo: r.motivo, frase: r.frase,
                        candidatas: r.candidatas.map((x) => ({ codigo: x.item.codigo, descricao: x.item.descricao ?? null })) })
                }
            }
            // a linha de insumo ou de vidro que o avaliador não fechou: falta nomeada, sem código de tabela
            for (const f of e.faltasDoAvaliador) {
                faltar(j0 + 1, { caminho: f.aba === 'Vidros' ? 'vidro' : 'insumo', codigo_do_motor: f.codigo, descricao_do_motor: null, motivo: 'LINHA_NAO_AVALIADA', frase: f.mensagem, candidatas: [] })
            }
        })

        // VIDRO: o item de cada esquadria (o código escolhido vence o texto) e a área dos panos dela
        const vidros = escopoDoVidro(calculo.daFamilia.todos, principais)
        const vidroDoItem: Array<{ codigo: string } | null> = calculo.r.esquadrias.map((e, j0) => {
            if (e.vidros.length === 0) return null
            const gravada = lev.itens[g.indices[j0]]
            const texto = textoOuNulo(gravada?.vidro)
            if (principais.ambiguas.includes('VIDRO')) {
                faltar(j0 + 1, { caminho: 'vidro', codigo_do_motor: texto ?? 'VIDRO', descricao_do_motor: texto, motivo: 'VIDRO_PRINCIPAL_AMBIGUO', frase: fraseDaCategoriaSemPrincipal('VIDRO'), candidatas: [] })
                return null
            }
            const t = traduzirVidro(texto, textoOuNulo(gravada?.vidro_codigo), vidros, codigosDoPadrao)
            if (!('item' in t)) {
                faltar(j0 + 1, { caminho: 'vidro', codigo_do_motor: textoOuNulo(gravada?.vidro_codigo) ?? texto ?? 'VIDRO', descricao_do_motor: texto, motivo: t.motivo, frase: t.frase,
                    candidatas: t.candidatos.map((x) => ({ codigo: x.codigo, descricao: x.descricao ?? null })) })
                return null
            }
            materiais[chaveDoMaterial('vidro', t.item.codigo)] = materialDoItem('vidro', t.item.codigo, t.item, t.como === 'codigo' ? 'vidro_escolhido' : t.como === 'padrao' ? 'vidro_padrao' : 'vidro_traduzido')
            return { codigo: t.item.codigo }
        })

        const r = custoDoOrcamento({
            itens: calculo.r.esquadrias.map((e, j) => {
                const m = calculo.maos[j]
                const v = vidroDoItem[j]
                return {
                    referencia: `item ${calculo.d.esquadrias[j].numero} (${e.tipologia})`,
                    minutos: m && 'minutosPorUnidade' in m ? m.minutosPorUnidade * m.quantidade : null,
                    pecas: e.pecas.map((p) => ({ codigo: p.codigo, comprimento_mm: p.comprimento_mm, quantidade: p.quantidade })),
                    insumos: e.insumos.map((i) => ({ codigo: i.codigo, quantidade: i.quantidade * e.quantidade })),
                    // a área: largura × altura (mm → m²) × os panos por esquadria × as esquadrias
                    vidros: v === null ? [] : e.vidros.map((p) => ({ codigo: v.codigo, m2: (p.largura_mm * p.altura_mm / 1e6) * p.quantidade * e.quantidade })),
                }
            }),
            barras_por_codigo: calculo.r.total.barras_por_codigo,
            materiais,
            valor_minuto: valor,
        })
        if ('recusas' in r) { recusas.push(...r.recusas); return }
        r.itens.forEach((it, j) => { porItem[g.indices[j]] = it })
        // O CORTE (16/11/2026): as peças de cada esquadria como o motor as deu, com a barra do código e a serra com que o agrupador as juntou
        const barraDoCodigo = new Map(calculo.r.por_codigo.map((c) => [c.codigo, c.comprimento_barra_mm]))
        calculo.r.esquadrias.forEach((e, j) => {
            pecasPorItem[g.indices[j]] = e.pecas.map((p) => ({
                perfil: p.perfil, codigo: p.codigo, descricao: p.descricao, comprimento_mm: p.comprimento_mm,
                quantidade_por_esquadria: p.quantidade_por_esquadria, quantidade: p.quantidade, corte: p.corte, posicao: p.posicao,
                comprimento_barra_mm: barraDoCodigo.get(p.codigo) ?? null, serra_mm: calculo.r.serra_mm,
            }))
        })
        // o que o custo deixou de fora por valor ausente (o item existe, o número não)
        for (const f of r.faltas) {
            faltar(f.item + 1, { caminho: f.caminho, codigo_do_motor: f.codigo, descricao_do_motor: materiais[chaveDoMaterial(f.caminho, f.codigo)]?.descricao ?? null, motivo: f.motivo, frase: f.frase, candidatas: [] })
        }
    })
    if (recusas.length) return { ok: false, recusas }
    if (maoDeObra === null || porItem.some((i) => i === undefined)) return { ok: false, recusas: ['o custo de todos os itens: algum ficou sem cálculo'] }
    return { ok: true, itens: porItem as CustoDoItem[], maoDeObra, faltas, pecasPorItem }
}
