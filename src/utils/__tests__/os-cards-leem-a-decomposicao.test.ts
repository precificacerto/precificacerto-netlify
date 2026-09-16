/**
 * OS CARDS ERAM A SEGUNDA FONTE — e divergiam da decomposição em R$ 279,71.
 *
 * Medido na tela pelo dono do produto, no ATeste1509:
 *
 *   cards:      Comissão R$ 2.117,59 (6,188%) · Lucro R$ 4.235,18 (12,377%)
 *   cadastrado: 5,00% e 10,00%
 *   construção: R$ 1.837,88 e R$ 3.675,77
 *
 * "Os cards leem a Etapa 16 do cascade_trace — você mediu isso e está certo. Mas a Etapa 16
 *  do motor é calculada com a RECEITA LÍQUIDA da cascata antiga, não com a decomposição
 *  corrigida. Ou seja: os cards e a decomposição agora são DUAS FONTES, e divergem."
 *
 * >>> O QUE MUDA, E O QUE NÃO MUDA <<<
 *
 * O BUG-CARDS-RRO-001 dizia "a Etapa 16 é a FONTE DE VERDADE ABSOLUTA de Comissão e Lucro", e
 * ele estava CERTO PARA A ÉPOCA (`.claude/rules/decisao-sob-regra-da-epoca.md`): o que ele
 * proibia era o card RECALCULAR, e a Etapa 16 era a única apuração do RRO que existia. Hoje a
 * decomposição existe e corrige três coisas que a Etapa 16 não corrige — a ordem das deduções
 * da R19, o CMV do item e a escala do PIS/COFINS. O princípio não mudou: o card continua NÃO
 * calculando. Mudou a fonte de onde ele lê.
 *
 * >>> O ORÁCULO É O MESMO DO `decomposicao-igual-a-construcao.test.ts` <<<
 * ATeste1509, do banco. É o documento em que o defeito foi medido, e o RRO dele fecha ao
 * centavo com o reservado pela construção — sem isso, "o card bate com a decomposição" seria
 * verdade contra uma decomposição errada.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'
import { applyDecompositionToResidual } from '@/utils/residual-from-decomposition'
import { formatResidualLine, type ResidualDistribution } from '@/utils/residual-distribution'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

const PRODUTO_NO_BANCO = {
  name: 'ATeste1509', sale_price: 36757.67,
  icms_pct: 17, pis_cofins_pct: 7.6775, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0,
  commission_percent: 5, profit_percent: 10,
}
const MATERIAL = 7985.99
const MO_PRODUTIVA = 2576.58
const DESPESAS_PCT = 8424.85 / 36757.67

const item = (over: Partial<BudgetDecompositionItem> = {}): BudgetDecompositionItem => ({
  key: 'a', label: 'ATeste1509', quantity: 1, unitPrice: PRODUTO_NO_BANCO.sale_price,
  costUnit: MATERIAL, productiveLaborUnit: MO_PRODUTIVA,
  commissionPct: PRODUTO_NO_BANCO.commission_percent,
  profitPct: PRODUTO_NO_BANCO.profit_percent, rtPct: 0,
  rates: buildItemTaxRatesFromProduct(PRODUTO_NO_BANCO) as never,
  acrescimos: 0,
  ...over,
})

const montar = (items: BudgetDecompositionItem[], discountPct = 0) =>
  buildDecomposition(buildBudgetDecompositionInput({
    items, discountPct, despesasOperacionaisPct: DESPESAS_PCT,
  }).input)

/** A distribuição como a Etapa 16 a entrega — os números que o dono do produto mediu na tela. */
const DA_ETAPA_16: ResidualDistribution = {
  commission: { amount: 2117.59, originalPct: 6.188, effectivePct: 6.188 },
  profit: { amount: 4235.18, originalPct: 12.377, effectivePct: 12.377 },
  irpj: { amount: 635.28, originalPct: 1.856, effectivePct: 1.856 },
  csll: { amount: 381.17, originalPct: 1.114, effectivePct: 1.114 },
  total: { amount: 7369.22, originalPct: 21.535, effectivePct: 21.535 },
  hasDiscount: false, requiresReview: false, regime: 'LUCRO_REAL', hidesProfitTaxes: false,
}

const CONSTRUCAO = { comissao: 1837.88, lucro: 3675.77 }

describe('1. O CARD PASSA A SER A LINHA DA DECOMPOSIÇÃO', () => {
  const d = applyDecompositionToResidual(DA_ETAPA_16, montar([item()]))

  it('Comissão: R$ 1.837,88 — e NÃO os R$ 2.117,59 da Etapa 16', () => {
    expect(d.commission.amount).toBeCloseTo(CONSTRUCAO.comissao, 1)
    // O discriminante: a entrada carrega o número da outra fonte. Um caso em que os dois
    // coincidissem não distinguiria "leu a decomposição" de "devolveu o que recebeu".
    expect(d.commission.amount).not.toBeCloseTo(2117.59, 1)
  })

  it('Lucro: R$ 3.675,77 — e NÃO os R$ 4.235,18', () => {
    expect(d.profit.amount).toBeCloseTo(CONSTRUCAO.lucro, 1)
    expect(d.profit.amount).not.toBeCloseTo(4235.18, 1)
  })

  it('IRPJ e CSLL vão junto — as quatro rubricas são UMA repartição só', () => {
    // 15% e 9% do LUCRO (R6): deixar duas da decomposição e duas da Etapa 16 seria manter as
    // duas fontes, com a tela sem dizer qual é qual.
    expect(d.irpj.amount).toBeCloseTo(CONSTRUCAO.lucro * 0.15, 1)
    expect(d.csll.amount).toBeCloseTo(CONSTRUCAO.lucro * 0.09, 1)
    expect(d.irpj.amount).not.toBeCloseTo(635.28, 1)
  })

  it('e o TOTAL é a soma das quatro, não um número próprio', () => {
    expect(d.total.amount).toBeCloseTo(
      d.commission.amount + d.profit.amount + d.irpj.amount + d.csll.amount, 6,
    )
    // E ele bate com o RRO da decomposição — R$ 6.395,83 no oráculo.
    expect(d.total.amount).toBeCloseTo(6395.83, 1)
  })

  it('o resto da distribuição atravessa INTACTO', () => {
    // Regime, guard de MEI/SN e o aviso de revisão não são da decomposição; reescrevê-los
    // seria alargar a correção para fora do que foi medido.
    expect(d.regime).toBe('LUCRO_REAL')
    expect(d.hidesProfitTaxes).toBe(false)
    expect(d.requiresReview).toBe(false)
  })
})

describe('2. O PERCENTUAL VOLTA A SER O CADASTRADO', () => {
  it('sem desconto, o apurado É o cadastrado — 5,00% e 10,00%', () => {
    const d = applyDecompositionToResidual(DA_ETAPA_16, montar([item()]))
    expect(d.commission.originalPct).toBeCloseTo(5, 3)
    expect(d.commission.effectivePct).toBeCloseTo(5, 2)
    expect(d.profit.originalPct).toBeCloseTo(10, 3)
    // Os 6,188% e 12,377% da Etapa 16 eram o número que não batia com a tela de cadastro.
    expect(d.commission.effectivePct).not.toBeCloseTo(6.188, 2)
  })

  it('COM desconto, o original fica e o apurado cai — a corrosão aparece', () => {
    const d = applyDecompositionToResidual(
      { ...DA_ETAPA_16, hasDiscount: true }, montar([item()], 0.05),
    )
    // O cadastrado não se move: ele é o que o usuário digitou.
    expect(d.commission.originalPct).toBeCloseTo(5, 3)
    // O apurado cai, e é essa diferença que a decomposição existe para mostrar.
    expect(d.commission.effectivePct).toBeLessThan(5)
    expect(d.commission.effectivePct).toBeGreaterThan(4)
    expect(d.commission.amount).toBeLessThan(CONSTRUCAO.comissao)
  })

  it('DOIS produtos com percentuais diferentes: o cadastrado é PONDERADO', () => {
    // Com um produto só, "o cadastrado é 5%" é trivialmente verdadeiro e não discrimina
    // ponderação nenhuma — variante 2 de `teste-que-nao-exercita.md`.
    const d = applyDecompositionToResidual(DA_ETAPA_16, montar([
      item(),
      item({ key: 'b', label: 'Metade', unitPrice: PRODUTO_NO_BANCO.sale_price / 2,
        costUnit: MATERIAL / 2, productiveLaborUnit: MO_PRODUTIVA / 2, commissionPct: 11 }),
    ]))
    // Pesos 2/3 e 1/3 pela receita de produtos: 5 × ⅔ + 11 × ⅓ = 7,00%.
    expect(d.commission.originalPct).toBeCloseTo(7, 2)
    // A média SIMPLES daria 8,00% — é o que separa ponderar de somar e dividir por dois.
    expect(d.commission.originalPct).not.toBeCloseTo(8, 1)
  })

  it('a BASE dos percentuais é nomeada na linha do card', () => {
    const d = applyDecompositionToResidual(
      { ...DA_ETAPA_16, hasDiscount: true }, montar([item()], 0.05),
    )
    // Sem o rótulo, a linha continuaria dizendo "sobre a operação interna", que é a base da
    // Etapa 16 e não a destes números.
    expect(formatResidualLine(d.commission, true)).toContain('sobre a receita de produtos')
    expect(formatResidualLine(d.commission, true)).not.toContain('operação interna')
    // E a linha de sempre continua a de sempre, quando não há `baseLabel`.
    expect(formatResidualLine(DA_ETAPA_16.commission, true)).toContain('sobre a operação interna')
  })
})

describe('3. SEM DECOMPOSIÇÃO, a Etapa 16 continua', () => {
  it('pedido e venda ainda não a montam — melhor a Etapa 16 que card nenhum', () => {
    expect(applyDecompositionToResidual(DA_ETAPA_16, null)).toBe(DA_ETAPA_16)
    expect(applyDecompositionToResidual(DA_ETAPA_16, undefined)).toBe(DA_ETAPA_16)
  })

  it('documento sem produto também: `rroCadastrado` nulo não vira 0,00%', () => {
    // Zero afirmaria que a comissão cadastrada é zero. A decomposição vazia não afirma nada.
    const vazia = montar([])
    expect(vazia.rroCadastrado).toBeNull()
    expect(applyDecompositionToResidual(DA_ETAPA_16, vazia)).toBe(DA_ETAPA_16)
  })
})

describe('4. A JUNTA — a tela usa a distribuição corrigida, não a crua', () => {
  const orc = ler('pages/orcamentos/index.tsx')

  it('o bloco recebe `residualExibido`, e o `residualDistribution` cru não chega nele', () => {
    // É a quinta vez nesta cadeia que o módulo nasce certo e a tela continua no antigo. A
    // asserção é sobre a PROP que o bloco recebe, que é o ponto onde a troca acontece.
    expect(orc).toContain('distribution={residualExibido}')
    expect(orc).not.toContain('distribution={residualDistribution}')
  })

  it('e a NOTA muda junto com a fonte', () => {
    expect(orc).toContain('footerNote={decomposition?.result ? NOTA_DA_DECOMPOSICAO : undefined}')
    expect(ler('utils/residual-from-decomposition.ts')).toContain('RECEITA DE PRODUTOS')
  })
})
