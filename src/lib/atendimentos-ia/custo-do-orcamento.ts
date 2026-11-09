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
 *   - O CRÉDITO NÃO APURADO NÃO BARATEIA: quando o bloco do código não fecha a cascata (o dado "vem depois", dono do produto,
 *     09/11/2026), nenhum crédito é aplicado — o líquido da unidade é o bruto — e a linha diz o que faltou (`credito_nao_apurado`). A
 *     CHECK `orcamentista_orcamento_item_material_sem_credito_nao_barateia` prende o mesmo no banco.
 *   - FALTA DE PREÇO OU DE TEMPO: NADA EVOLUI. O cálculo recusa nomeando a referência e a falta (`faltou-dado-recusa-nomeada.md`).
 *   - A ENTRADA DA PRECIFICAÇÃO (decisão D2, 09/11/2026): ao motor vai o custo LÍQUIDO DOS MATERIAIS somado e os MINUTOS somados; a mão de
 *     obra sai pelo caminho de sempre. Somar a fabricação no custo seria contá-la duas vezes — `entradaDaPrecificacao` é o único lugar
 *     que monta essa entrada, e o teste de reconciliação prende a igualdade.
 */
import { recalcularBloco, custoLiquidoDaFracao, blocoVazio } from '@/utils/atendimentos-ia-bloco-tributario'

export const MODO_DO_FALLBACK = 'SEM' as const
export const ORIGEM_DO_FALLBACK = 'fallback_barra_inteira' as const
export const MOTIVO_DO_FALLBACK = 'a base de conhecimento ainda nao tem o modo de aproveitamento: barra inteira, que nunca barateia'

/** Os seis percentuais do bloco que o item e o material guardam, com os nomes de `orcamentista_tabela_item`. */
export const PERCENTUAIS = ['cred_icms_pct', 'cred_pis_cofins_pct', 'cred_ipi_pct', 'nc_ipi_pct', 'cred_ibs_pct', 'cred_cbs_pct'] as const
export type Percentual = (typeof PERCENTUAIS)[number]
export type Percentuais = Record<Percentual, number | null>

export type MaterialDaTabela = {
    codigo: string
    descricao: string | null
    unidade: string | null
    /** A medida da unidade de compra, em metros (a barra). */
    medida_barra_m: number | null
    /** O custo BRUTO da unidade de compra (a barra inteira). */
    valor_barra_interno: number | null
    bloco: Percentuais
}
export type ItemDoCalculo = {
    /** As peças do item, com a quantidade TOTAL (a da esquadria vezes a do item). */
    pecas: ReadonlyArray<{ codigo: string; comprimento_mm: number; quantidade: number }>
    /** O tempo de fabricação do item inteiro, em minutos; nulo quando a tipologia não tem tempo. */
    minutos: number | null
    /** Para a frase da recusa: como o vendedor reconhece o item. */
    referencia: string
}
export type EntradaDoCusto = {
    itens: readonly ItemDoCalculo[]
    /** As barras inteiras do pedido, por código (`TotalDoLevantamento.barras_por_codigo`). */
    barras_por_codigo: Readonly<Record<string, number>>
    materiais: Readonly<Record<string, MaterialDaTabela>>
    /** O valor do minuto (`valorDoMinuto`); nulo quando a empresa não tem a configuração da mão de obra. */
    valor_minuto: number | null
}

export type LinhaDeMaterial = Percentuais & {
    ordem: number
    codigo: string
    descricao: string | null
    unidade_compra: string | null
    medida_unidade: number | null
    custo_bruto_unidade: number
    credito_nao_apurado: string | null
    custo_liquido_unidade: number
    custo_liquido_fracao: number | null
    /** Na unidade da fração: metros. */
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
/** Para separar as duas formas, use `'recusas' in r` (o tsconfig daqui não estreita pelo `ok`). */
export type CustoDoOrcamento =
    | { ok: true; modo: typeof MODO_DO_FALLBACK; origem: typeof ORIGEM_DO_FALLBACK; motivo: string; itens: CustoDoItem[] }
    | { ok: false; recusas: string[] }

/** O valor do minuto pelo caminho da tela (`calculatePricing`, `costPerMinute`); sem minutos produtivos não há valor. */
export function valorDoMinuto(custoMensal: number, minutosDaEmpresa: number): number | null {
    if (!(Number.isFinite(custoMensal) && custoMensal > 0) || !(Number.isFinite(minutosDaEmpresa) && minutosDaEmpresa > 0)) return null
    return custoMensal / minutosDaEmpresa
}

const fraseSemPreco = (codigo: string) => `o valor da barra do código ${codigo}, na tabela de preço`
const fraseSemBarras = (codigo: string) => `as barras do código ${codigo} no cálculo do levantamento`
const fraseSemTempo = (referencia: string) => `o tempo de fabricação de ${referencia}`
const FRASE_SEM_VALOR_DO_MINUTO = 'o valor do minuto da mão de obra: a configuração de mão de obra da empresa não fecha'

/** A cascata na unidade de compra; sem o bloco completo, nenhum crédito — o líquido é o bruto, e a falta fica dita. */
function liquidoDaUnidade(bruto: number, bloco: Percentuais): { liquido: number; nao_apurado: string | null } {
    const r = recalcularBloco(bruto, { ...blocoVazio(), ...bloco })
    // `'faltam' in r`, e não `r.ok`: com `strictNullChecks: false` (o tsconfig daqui) o tsc não estreita a união pelo booleano
    if (!('faltam' in r)) return { liquido: r.custo_liquido, nao_apurado: null }
    return { liquido: bruto, nao_apurado: `faltou no bloco tributario: ${r.faltam.join(', ')}`.slice(0, 500) }
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
    return Object.fromEntries(PERCENTUAIS.map((p): [Percentual, number] => [p, (soma[p] / bruto) * 100])) as Percentuais
}

/**
 * O custo de cada item do orçamento, no modo SEM aproveitamento (barra inteira): por código, as barras inteiras do pedido × o custo da
 * barra, rateadas entre os itens na proporção do consumo (mm) daquele código em cada item. Recusa nomeada, e nada evolui, quando falta
 * o preço de um código, as barras de um código consumido, o tempo de um item ou o valor do minuto.
 */
export function custoDoOrcamento(e: EntradaDoCusto): CustoDoOrcamento {
    const recusas: string[] = []
    const consumoTotal = new Map<string, number>()
    for (const it of e.itens) for (const p of it.pecas) consumoTotal.set(p.codigo, (consumoTotal.get(p.codigo) ?? 0) + p.comprimento_mm * p.quantidade)
    const codigos = [...consumoTotal.keys()].sort()
    for (const c of codigos) {
        const m = e.materiais[c]
        if (!m || m.valor_barra_interno === null || !Number.isFinite(m.valor_barra_interno) || m.valor_barra_interno < 0) recusas.push(fraseSemPreco(c))
        const n = e.barras_por_codigo[c]
        if (!Number.isInteger(n) || n <= 0) recusas.push(fraseSemBarras(c))
    }
    for (const it of e.itens) if (it.minutos === null || !Number.isFinite(it.minutos) || it.minutos < 0) recusas.push(fraseSemTempo(it.referencia))
    if (e.valor_minuto === null || !Number.isFinite(e.valor_minuto) || e.valor_minuto < 0) recusas.push(FRASE_SEM_VALOR_DO_MINUTO)
    if (recusas.length) return { ok: false, recusas }

    const unidade = new Map(codigos.map((c) => {
        const m = e.materiais[c]
        return [c, { m, ...liquidoDaUnidade(m.valor_barra_interno as number, m.bloco) }]
    }))
    const itens = e.itens.map((it): CustoDoItem => {
        const doItem = new Map<string, number>()
        for (const p of it.pecas) doItem.set(p.codigo, (doItem.get(p.codigo) ?? 0) + p.comprimento_mm * p.quantidade)
        const materiais = [...doItem.keys()].sort().map((c, k): LinhaDeMaterial => {
            const u = unidade.get(c)!
            const parte = doItem.get(c)! / consumoTotal.get(c)!
            const barras = e.barras_por_codigo[c]
            const bruto = u.m.valor_barra_interno as number
            return {
                ordem: k + 1, codigo: c, descricao: u.m.descricao, unidade_compra: u.m.unidade, medida_unidade: u.m.medida_barra_m,
                custo_bruto_unidade: bruto,
                ...u.m.bloco,
                credito_nao_apurado: u.nao_apurado,
                custo_liquido_unidade: u.liquido,
                custo_liquido_fracao: custoLiquidoDaFracao(u.liquido, u.m.medida_barra_m),
                consumo_item: doItem.get(c)! / 1000,
                custo_bruto_material: barras * bruto * parte,
                custo_liquido_material: barras * u.liquido * parte,
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
    return { ok: true, modo: MODO_DO_FALLBACK, origem: ORIGEM_DO_FALLBACK, motivo: MOTIVO_DO_FALLBACK, itens }
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
