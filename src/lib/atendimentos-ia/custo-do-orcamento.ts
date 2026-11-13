/**
 * O CUSTO DO ORÇAMENTO I.A., POR ITEM — o 1a da entrega do dono do produto (09/11/2026). Puro: recebe o que o cálculo do levantamento já
 * produz (as peças de cada esquadria e as barras inteiras por código, de `levantarBarras`; o tempo e o valor do minuto, de `lerMaosDeObra`)
 * e o preço e o bloco tributário de cada código da tabela, e devolve, por item, a relação de materiais (a terceira tabela,
 * `orcamentista_orcamento_item_material`, migração 20261109000003) e os valores do item (as colunas da 20261109000002).
 *
 * As regras, e de onde vem cada uma:
 *   - O TOTAL DO ITEM (`Regra_Do_Levantamento_Ao_Produto`, colada pelo dono do produto em 09/11/2026):
 *       custo de fabricação do item = tempo do item (min) × valor do minuto
 *       total do item               = custo de fabricação + custo líquido do item
 *   - O VALOR DO MINUTO é o da tela de produto: custo mensal da mão de obra ÷ minutos produtivos do mês — o `costPerMinute` de
 *     `calculatePricing` (`pricing-engine.ts:544`). Na De Paula, 40.813,03 ÷ 52.800 = 0,772974. NÃO é `productive_value_per_minute`.
 *   - O MODO É SEM APROVEITAMENTO (barra inteira), com origem `fallback_barra_inteira`: a base de conhecimento ainda não tem o campo do
 *     modo (medido em 09/11/2026), e "o fallback nunca pode ser o que barateia" (dono do produto). O rateio é POR CÓDIGO, na proporção
 *     do consumo daquele código em cada item, nunca por metro global nem pelo aproveitamento em metros (`custo-liquido-por-fracao.md`).
 *   - O LÍQUIDO DA UNIDADE é a CASCATA de `recalcularBloco` (ICMS sobre o bruto, PIS/COFINS sobre o saldo, IPI creditável com base
 *     própria, IPI sem crédito no custo), na unidade de compra; a fração divide depois (`custoLiquidoDaFracao`).
 *   - A FALTA SEMPRE VISÍVEL, E O FALLBACK QUE NÃO BARATEIA (decisão (b), 09/11/2026): IBS/CBS nulos não travam; ICMS e PIS/COFINS em
 *     cascata parcial (sem PIS/COFINS para depois do ICMS; sem ICMS, o líquido é o bruto); a linha nomeia QUAL crédito faltou. As
 *     CHECKs `..._falta_nomeada` e `..._sem_credito_nao_barateia` (migração 20261109000003) prendem o mesmo no banco.
 *   - OS TRÊS CAMINHOS (dono do produto, 12/11/2026, o comando único), separados aqui e em nenhum outro lugar:
 *       PERFIL → a barra inteira rateada por milímetro (o de sempre);
 *       INSUMO → a quantidade × o custo da unidade (`custo` do item: "para item vendido por unidade, o bruto é custo") × a cascata;
 *       VIDRO  → os m² × o preço por m² (`custo` do item) × a cascata. O `custo` da categoria VIDRO é R$/m² PELA CATEGORIA: `unidade = 'PC'` e
 *                `vendido_por = 'unidade'` nos itens da Estrela estão errados (`docs/regras/vidro-por-metro-quadrado.md`).
 *   - FALTA DE PREÇO NÃO IMPEDE A EVOLUÇÃO (12/11/2026, substitui o "nada evolui"): o código sem preço fica FORA do custo e sai em `faltas`,
 *     nomeado; o orçamento é parcial. A falta de TEMPO e a do valor do minuto continuam recusa (`faltou-dado-recusa-nomeada.md`).
 *   - A ENTRADA DA PRECIFICAÇÃO (decisão D2, 09/11/2026): ao motor vai o custo LÍQUIDO DOS MATERIAIS somado e os MINUTOS somados; a mão de
 *     obra sai pelo caminho de sempre. Somar a fabricação no custo seria contá-la duas vezes — `entradaDaPrecificacao` é o único lugar
 *     que monta essa entrada, e o teste de reconciliação prende a igualdade.
 */
import { recalcularBloco, custoLiquidoDaFracao, blocoVazio } from '@/utils/atendimentos-ia-bloco-tributario'
import type { ComoAchou } from '@/lib/atendimentos-ia/resolucao-de-referencia'

export const MODO_DO_FALLBACK = 'SEM' as const
export const ORIGEM_DO_FALLBACK = 'fallback_barra_inteira' as const
export const MOTIVO_DO_FALLBACK = 'a base de conhecimento ainda nao tem o modo de aproveitamento: barra inteira, que nunca barateia'

/** Os seis percentuais do bloco que o item e o material guardam, com os nomes de `orcamentista_tabela_item`. */
export const PERCENTUAIS = ['cred_icms_pct', 'cred_pis_cofins_pct', 'cred_ipi_pct', 'nc_ipi_pct', 'cred_ibs_pct', 'cred_cbs_pct'] as const
export type Percentual = (typeof PERCENTUAIS)[number]
export type Percentuais = Record<Percentual, number | null>

export type CaminhoDoCusto = 'perfil' | 'insumo' | 'vidro'
/** Como o preço foi achado: os degraus da resolução de referência e, no vidro, o código escolhido ou o texto traduzido (20261112000006). */
export type ResolucaoGravada = ComoAchou | 'vidro_escolhido' | 'vidro_traduzido'
/** A chave de um material: o mesmo código pode entrar por dois caminhos (a UNIQUE da 20261112000006 inclui o caminho). */
export const chaveDoMaterial = (caminho: CaminhoDoCusto, codigo: string) => `${caminho}:${codigo}`

export type MaterialDaTabela = {
    caminho: CaminhoDoCusto
    /** O código DO MOTOR — o que as peças citam (no vidro, o código do item da tabela de vidro). */
    codigo: string
    /** O código do item na tabela de preço, de onde veio o preço (12/11/2026): o mesmo, ou com/sem o sufixo do fornecedor, ou outro. */
    codigo_na_tabela: string
    /** Como o item foi achado: os degraus de `resolucao-de-referencia.ts`, ou o do vidro (`vidro-da-tabela.ts`). */
    resolucao: ResolucaoGravada
    descricao: string | null
    unidade: string | null
    /** A medida da unidade de compra, em metros (a barra). */
    medida_barra_m: number | null
    /** O custo BRUTO da unidade de compra (a barra inteira) — o caminho do perfil. */
    valor_barra_interno: number | null
    /** O custo BRUTO da unidade (insumo) ou do m² (vidro) — a coluna `custo` do item. */
    custo: number | null
    bloco: Percentuais
}
export type ItemDoCalculo = {
    /** As peças do item, com a quantidade TOTAL (a da esquadria vezes a do item). */
    pecas: ReadonlyArray<{ codigo: string; comprimento_mm: number; quantidade: number }>
    /** Os insumos do item, com a quantidade TOTAL (a da esquadria vezes a do item), pelo código do motor. */
    insumos?: ReadonlyArray<{ codigo: string; quantidade: number }>
    /** Os vidros do item, pelo código do item da tabela de vidro, com a área TOTAL em m². */
    vidros?: ReadonlyArray<{ codigo: string; m2: number }>
    /** O tempo de fabricação do item inteiro, em minutos; nulo quando a tipologia não tem tempo. */
    minutos: number | null
    /** Para a frase da recusa: como o vendedor reconhece o item. */
    referencia: string
}
export type EntradaDoCusto = {
    itens: readonly ItemDoCalculo[]
    /** As barras inteiras do pedido, por código (`TotalDoLevantamento.barras_por_codigo`). */
    barras_por_codigo: Readonly<Record<string, number>>
    /** Os materiais pela `chaveDoMaterial(caminho, codigo)`. O código sem material é falta (fora do custo), não recusa. */
    materiais: Readonly<Record<string, MaterialDaTabela>>
    /** O valor do minuto (`valorDoMinuto`); nulo quando a empresa não tem a configuração da mão de obra. */
    valor_minuto: number | null
}

export type LinhaDeMaterial = Percentuais & {
    ordem: number
    caminho: CaminhoDoCusto
    codigo: string
    /** A fotografia de COMO cada preço foi parar ali (12/11/2026): o código na tabela e o degrau da resolução. */
    codigo_na_tabela: string
    resolucao: ResolucaoGravada
    descricao: string | null
    unidade_compra: string | null
    medida_unidade: number | null
    custo_bruto_unidade: number
    credito_nao_apurado: string | null
    custo_liquido_unidade: number
    custo_liquido_fracao: number | null
    /** Na unidade da fração: metros (perfil), unidades (insumo), m² (vidro). */
    consumo_item: number
    custo_bruto_material: number
    custo_liquido_material: number
}
export type CustoDoItem = Percentuais & {
    materiais: LinhaDeMaterial[]
    custo_bruto_materiais: number
    custo_liquido_materiais: number
    tempo_fabricacao_min: number
    valor_minuto: number
    custo_fabricacao: number
    custo_liquido_total: number
}
/** O que ficou fora do custo por falta de preço: o item (índice em `itens`), o caminho, o código e a frase. */
export type FaltaDoCusto = { item: number; caminho: CaminhoDoCusto; codigo: string; motivo: 'SEM_MATERIAL' | 'SEM_VALOR'; frase: string }
/** Para separar as duas formas, use `'recusas' in r` (o tsconfig daqui não estreita pelo `ok`). */
export type CustoDoOrcamento =
    | { ok: true; modo: typeof MODO_DO_FALLBACK; origem: typeof ORIGEM_DO_FALLBACK; motivo: string; itens: CustoDoItem[]; faltas: FaltaDoCusto[] }
    | { ok: false; recusas: string[] }

/** O valor do minuto pelo caminho da tela (`calculatePricing`, `costPerMinute`); sem minutos produtivos não há valor. */
export function valorDoMinuto(custoMensal: number, minutosDaEmpresa: number): number | null {
    if (!(Number.isFinite(custoMensal) && custoMensal > 0) || !(Number.isFinite(minutosDaEmpresa) && minutosDaEmpresa > 0)) return null
    return custoMensal / minutosDaEmpresa
}

const NOME_DO_CAMINHO: Record<CaminhoDoCusto, string> = { perfil: 'perfil', insumo: 'insumo', vidro: 'vidro' }
const fraseSemMaterial = (caminho: CaminhoDoCusto, codigo: string) => `o ${NOME_DO_CAMINHO[caminho]} ${codigo} não tem item na tabela de preço: fica fora do custo`
const fraseSemValor = (caminho: CaminhoDoCusto, codigo: string) =>
    caminho === 'perfil' ? `o valor da barra do código ${codigo}, na tabela de preço: fica fora do custo`
        : caminho === 'insumo' ? `o custo da unidade do insumo ${codigo}, na tabela de preço: fica fora do custo`
            : `o preço por m² do vidro ${codigo}, na tabela de vidro: fica fora do custo`
const valido = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const fraseSemBarras = (codigo: string) => `as barras do código ${codigo} no cálculo do levantamento`
const fraseSemTempo = (referencia: string) => `o tempo de fabricação do ${referencia}`
const FRASE_SEM_VALOR_DO_MINUTO = 'o valor do minuto da mão de obra: a configuração de mão de obra da empresa não fecha'

/**
 * A cascata na unidade de compra, pela DECISÃO (b) do dono do produto (09/11/2026), que aplica o `Contrato_Tabela_Fornecedor`:
 *   - IBS e CBS têm BASE PRÓPRIA, fora da cascata do ICMS e do PIS/COFINS: NULOS, não há o que apurar e não travam nada; PREENCHIDOS E
 *     ACIMA DE ZERO, o código é NÃO RECALCULÁVEL (a regra ainda não diz onde entram — a parte da decisão de 02/11/2026 que permanece) — e
 *     isso é RECUSA do orçamento, porque a linha com ICMS e PIS/COFINS não pode guardar falta (CHECK `..._falta_nomeada`);
 *   - ICMS e PIS/COFINS fazem a cascata PARCIAL, como `recalcularBloco` (#252): sem PIS/COFINS ela PARA depois do ICMS (`ate_o_icms`);
 *     sem ICMS não começa — o líquido é o bruto, e o fallback nunca barateia;
 *   - `nao_apurado` nomeia QUAL crédito faltou, e é nulo EXATAMENTE quando o ICMS, o PIS/COFINS e o PAR DO IPI estão resolvidos (o
 *     espelho da CHECK `..._falta_nomeada`);
 *   - O PAR DO IPI (dono do produto, 09/11/2026): resolvido quando pelo menos um dos dois está preenchido; os dois nulos é DESCONHECIDO
 *     — nem ignorado nem recusado: NOMEADO. A conta segue sem IPI (nenhuma das 1.096 referências tem o par hoje), e a falta diz que o
 *     IPI é desconhecido. NÃO se lê a coluna antiga `ipi`: seriam duas fontes para o mesmo número; ela vira o par numa rodada de dado.
 */
export const PAR_DO_IPI_DESCONHECIDO = 'o par do IPI (cred_ipi_pct ou nc_ipi_pct)'
export type UnidadeCalculada = { liquido: number; nao_apurado: string | null } | { recusa: string }
const fraseDoIvaSemLugar = (codigo: string, quais: readonly string[]) =>
    `o ${quais.join(' e o ')} do código ${codigo}: a regra ainda não diz onde o IBS e a CBS entram, e o código não é recalculável`
export function liquidoDaUnidade(codigo: string, bruto: number, bloco: Percentuais): UnidadeCalculada {
    const ivaAcimaDeZero = (['cred_ibs_pct', 'cred_cbs_pct'] as const).filter((c) => bloco[c] !== null && bloco[c] !== 0)
    if (ivaAcimaDeZero.length) return { recusa: fraseDoIvaSemLugar(codigo, ivaAcimaDeZero) }
    const semIpi = bloco.cred_ipi_pct === null && bloco.nc_ipi_pct === null
    const faltam: string[] = (['cred_icms_pct', 'cred_pis_cofins_pct'] as const).filter((c) => bloco[c] === null)
    if (semIpi) faltam.push(PAR_DO_IPI_DESCONHECIDO)
    const nao_apurado = faltam.length ? `faltou no bloco tributario: ${faltam.join(', ')}` : null
    if (bloco.cred_icms_pct === null) return { liquido: bruto, nao_apurado }
    const r = recalcularBloco(bruto, {
        ...blocoVazio(), ...bloco, cred_ibs_pct: bloco.cred_ibs_pct ?? 0, cred_cbs_pct: bloco.cred_cbs_pct ?? 0, cred_ipi_pct: semIpi ? 0 : bloco.cred_ipi_pct,
    })
    // `'faltam' in r`, e não `r.ok`: com `strictNullChecks: false` (o tsconfig daqui) o tsc não estreita a união pelo booleano
    // a cascata cheia do ICMS e do PIS/COFINS: a falta que resta é a do par do IPI, quando desconhecido
    if (!('faltam' in r)) return { liquido: r.custo_liquido, nao_apurado }
    // a cascata parou depois do ICMS: o saldo dela, e a falta nomeada
    if (r.ate_o_icms !== undefined) return { liquido: r.ate_o_icms, nao_apurado }
    throw new Error(`liquidoDaUnidade ${codigo}: a cascata recusou o que a guarda deixou passar: ${r.faltam.join(', ')}`)
}

/** Os percentuais EFETIVOS do item: o crédito aplicado ÷ o bruto. Nulos se algum material do item não teve o crédito apurado. */
function efetivosDoItem(linhas: readonly LinhaDeMaterial[], bruto: number): Percentuais {
    const nulos = Object.fromEntries(PERCENTUAIS.map((p): [Percentual, null] => [p, null])) as Percentuais
    if (bruto <= 0 || linhas.some((l) => l.credito_nao_apurado !== null)) return nulos
    const soma: Record<Percentual, number> = { cred_icms_pct: 0, cred_pis_cofins_pct: 0, cred_ipi_pct: 0, nc_ipi_pct: 0, cred_ibs_pct: 0, cred_cbs_pct: 0 }
    for (const l of linhas) {
        const b = l.custo_bruto_material
        const icms = (b * (l.cred_icms_pct ?? 0)) / 100
        soma.cred_icms_pct += icms
        soma.cred_pis_cofins_pct += ((b - icms) * (l.cred_pis_cofins_pct ?? 0)) / 100
        soma.cred_ipi_pct += (b * (l.cred_ipi_pct ?? 0)) / 100
        soma.nc_ipi_pct += (b * (l.nc_ipi_pct ?? 0)) / 100
        soma.cred_ibs_pct += (b * (l.cred_ibs_pct ?? 0)) / 100
        soma.cred_cbs_pct += (b * (l.cred_cbs_pct ?? 0)) / 100
    }
    // o percentual que NENHUM material do item informou é "não há o que apurar" no item também: nulo, nunca 0 (`ausente-vs-falso.md`)
    return Object.fromEntries(PERCENTUAIS.map((p): [Percentual, number | null] =>
        [p, linhas.every((l) => l[p] === null) ? null : (soma[p] / bruto) * 100])) as Percentuais
}

/**
 * O custo de cada item do orçamento. PERFIL no modo SEM aproveitamento (barra inteira): por código, as barras inteiras do pedido × o custo da
 * barra, rateadas entre os itens na proporção do consumo (mm) daquele código em cada item. INSUMO: a quantidade do item × o custo da unidade.
 * VIDRO: os m² do item × o preço por m². O código sem material ou sem valor fica FORA e sai em `faltas`; recusa só a falta de tempo, a do
 * valor do minuto, a das barras de um perfil consumido (incoerência do cálculo) e o IBS/CBS sem lugar.
 */
export function custoDoOrcamento(e: EntradaDoCusto): CustoDoOrcamento {
    const recusas: string[] = []
    const faltas: FaltaDoCusto[] = []
    // o bruto da unidade de cada caminho: a barra no perfil, `custo` no insumo e no vidro
    const brutoDe = (m: MaterialDaTabela) => (m.caminho === 'perfil' ? m.valor_barra_interno : m.custo)
    const consumoTotal = new Map<string, number>()
    for (const it of e.itens) for (const p of it.pecas) consumoTotal.set(p.codigo, (consumoTotal.get(p.codigo) ?? 0) + p.comprimento_mm * p.quantidade)
    // o que cada item consome, por caminho e código; a falta é registrada uma vez por (item, caminho, código)
    const consumos = e.itens.map((it) => {
        const c = new Map<string, { caminho: CaminhoDoCusto; codigo: string; qtd: number }>()
        const somar = (caminho: CaminhoDoCusto, codigo: string, qtd: number) => {
            const k = chaveDoMaterial(caminho, codigo)
            const x = c.get(k)
            if (x) x.qtd += qtd
            else c.set(k, { caminho, codigo, qtd })
        }
        for (const p of it.pecas) somar('perfil', p.codigo, p.comprimento_mm * p.quantidade)
        for (const i of it.insumos ?? []) somar('insumo', i.codigo, i.quantidade)
        for (const v of it.vidros ?? []) somar('vidro', v.codigo, v.m2)
        return c
    })
    const precificavel = new Set<string>()
    consumos.forEach((c, k) => {
        for (const [chave, x] of c) {
            const m = e.materiais[chave]
            if (!m) faltas.push({ item: k, caminho: x.caminho, codigo: x.codigo, motivo: 'SEM_MATERIAL', frase: fraseSemMaterial(x.caminho, x.codigo) })
            else if (!valido(brutoDe(m))) faltas.push({ item: k, caminho: x.caminho, codigo: x.codigo, motivo: 'SEM_VALOR', frase: fraseSemValor(x.caminho, x.codigo) })
            else precificavel.add(chave)
        }
    })
    for (const chave of precificavel) {
        const m = e.materiais[chave]
        if (m.caminho !== 'perfil') continue
        const n = e.barras_por_codigo[m.codigo]
        if (!Number.isInteger(n) || n <= 0) recusas.push(fraseSemBarras(m.codigo))
    }
    for (const it of e.itens) if (it.minutos === null || !Number.isFinite(it.minutos) || it.minutos < 0) recusas.push(fraseSemTempo(it.referencia))
    if (e.valor_minuto === null || !Number.isFinite(e.valor_minuto) || e.valor_minuto < 0) recusas.push(FRASE_SEM_VALOR_DO_MINUTO)
    if (recusas.length) return { ok: false, recusas }

    const calculadas = [...precificavel].sort().map((chave) => {
        const m = e.materiais[chave]
        return { chave, m, u: liquidoDaUnidade(m.codigo, brutoDe(m) as number, m.bloco) }
    })
    const semLugar = calculadas.flatMap((x) => ('recusa' in x.u ? [x.u.recusa] : []))
    if (semLugar.length) return { ok: false, recusas: semLugar }
    const unidade = new Map(calculadas.map((x) => [x.chave, { m: x.m, ...(x.u as { liquido: number; nao_apurado: string | null }) }]))
    const ORDEM_DO_CAMINHO: Record<CaminhoDoCusto, number> = { perfil: 0, insumo: 1, vidro: 2 }
    const itens = e.itens.map((it, k): CustoDoItem => {
        const doItem = [...consumos[k].entries()].filter(([chave]) => unidade.has(chave))
            .sort(([, a], [, b]) => ORDEM_DO_CAMINHO[a.caminho] - ORDEM_DO_CAMINHO[b.caminho] || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0))
        const materiais = doItem.map(([chave, x], j): LinhaDeMaterial => {
            const u = unidade.get(chave)!
            const bruto = brutoDe(u.m) as number
            const base = {
                ordem: j + 1, caminho: x.caminho, codigo: x.codigo, codigo_na_tabela: u.m.codigo_na_tabela, resolucao: u.m.resolucao, descricao: u.m.descricao,
                custo_bruto_unidade: bruto, ...u.m.bloco, credito_nao_apurado: u.nao_apurado, custo_liquido_unidade: u.liquido,
            }
            if (x.caminho === 'perfil') {
                // a barra inteira rateada pelo milímetro: a parte deste item no consumo do código
                const parte = x.qtd / consumoTotal.get(x.codigo)!
                const barras = e.barras_por_codigo[x.codigo]
                return {
                    ...base, unidade_compra: u.m.unidade, medida_unidade: u.m.medida_barra_m,
                    custo_liquido_fracao: custoLiquidoDaFracao(u.liquido, u.m.medida_barra_m),
                    consumo_item: x.qtd / 1000, custo_bruto_material: barras * bruto * parte, custo_liquido_material: barras * u.liquido * parte,
                }
            }
            // insumo (unidades) e vidro (m²): a quantidade vezes a unidade; a unidade já é a fração
            return {
                ...base, unidade_compra: x.caminho === 'vidro' ? 'M2' : u.m.unidade, medida_unidade: null, custo_liquido_fracao: null,
                consumo_item: x.qtd, custo_bruto_material: x.qtd * bruto, custo_liquido_material: x.qtd * u.liquido,
            }
        })
        const bruto = materiais.reduce((t, l) => t + l.custo_bruto_material, 0)
        const liquido = materiais.reduce((t, l) => t + l.custo_liquido_material, 0)
        const minutos = it.minutos as number
        const fabricacao = minutos * (e.valor_minuto as number)
        return {
            materiais, ...efetivosDoItem(materiais, bruto),
            custo_bruto_materiais: bruto, custo_liquido_materiais: liquido,
            tempo_fabricacao_min: minutos, valor_minuto: e.valor_minuto as number,
            custo_fabricacao: fabricacao, custo_liquido_total: liquido + fabricacao,
        }
    })
    return { ok: true, modo: MODO_DO_FALLBACK, origem: ORIGEM_DO_FALLBACK, motivo: MOTIVO_DO_FALLBACK, itens, faltas }
}

/**
 * A ENTRADA DA PRECIFICAÇÃO FINAL (decisão D2): o custo LÍQUIDO DOS MATERIAIS somado e os MINUTOS somados. A mão de obra é o motor da
 * tela que calcula, pelos minutos — por isso a fabricação NÃO entra no custo. Único lugar que monta esta entrada.
 */
export function entradaDaPrecificacao(itens: readonly CustoDoItem[]): { totalItemsCost: number; productWorkloadMinutes: number } {
    return {
        totalItemsCost: itens.reduce((t, i) => t + i.custo_liquido_materiais, 0),
        productWorkloadMinutes: itens.reduce((t, i) => t + i.tempo_fabricacao_min, 0),
    }
}

/** A soma das linhas, como a borda direita as mostra: o líquido mais a fabricação de cada item. */
export const somaDosItens = (itens: readonly CustoDoItem[]) => itens.reduce((t, i) => t + i.custo_liquido_total, 0)
