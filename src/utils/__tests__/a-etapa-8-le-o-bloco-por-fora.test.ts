/**
 * A ETAPA 8 EXIBIA UM NÚMERO DERIVADO POR DIVISÃO, E NÃO O BLOCO APURADO.
 *
 * "'Formação Op Externa' mostra R$ 0,00 e deveria mostrar o valor do bloco. Ela é a soma dos
 *  tributos por fora — IBS + CBS + IS + IPI — e tem que trazer o valor apurado, não o
 *  placeholder. Meça de onde ela lê hoje."
 *
 * >>> A MEDIÇÃO, FEITA ANTES DE MEXER, E O QUE ELA CORRIGIU NA PREMISSA <<<
 *
 * NÃO é o caso da etapa 17. A etapa 17 nasce com `amount: 0` e a Camada 2 a preenche; a
 * Camada 2 (`absorption.ts`) reescreve as etapas 9, 11, 12, 16 e 17 — a **8 nunca**. Ela não
 * é placeholder: é um número calculado de OUTRA COISA.
 *
 * `cascade-trace.ts:326` emite `amount = view.rb_total × (1 − peso_op_interna_ponderado)`, e
 * o `peso_op_interna` do item é redescoberto por divisão em `legacy-adapter.ts:776`
 * — `(sale_price_base − terceirizadas) ÷ (unit_price − terceirizadas)` —, com FALLBACK `= 1`
 * quando o produto não tem `sale_price_base`. Rodando o motor real nos dois lados:
 *
 *   | produto                                   | peso  | Etapa 8   | por fora apurado |
 *   | COM `sale_price_base`, SEM IBS/CBS        | 0,931 | R$ 69,00  | R$ 0,00          |
 *   | SEM `sale_price_base`, COM IBS 0,1%+CBS 0,9% | 1  | R$ 0,00   | > 0              |
 *
 * Os dois erram, em direções OPOSTAS — e é a aparição 2 de
 * `.claude/rules/regime-e-segmento-determinam-a-construcao.md`: a decomposição redescobre a
 * proporção em vez de LER o que a construção usou.
 *
 * >>> CADA CASO AQUI FALHA SEM A CORREÇÃO <<<
 * O discriminante é sempre o mesmo: o trace de entrada carrega um valor derivado que NÃO é o
 * apurado, e a asserção é sobre o apurado. Um caso em que os dois coincidissem seria a
 * variante 2 de `teste-que-nao-exercita.md` e não distinguiria nada.
 */

import { buildDecomposition, type DecompositionInput } from '@/utils/decomposition-dre'
import {
  ETAPA_DA_OPERACAO_POR_FORA,
  blocoPorForaDaDecomposicao,
  buildCascadeView,
} from '@/utils/cascade-display-view'
import type { CascadeStep } from '@/types/mrm'

const CATEGORIAS = {
  despesasOperacionaisPct: 0.20, rtPct: 0, comissaoPct: 0.05, lucroPct: 0.10,
  irpjPct: 0.015, csllPct: 0.009,
}

/**
 * DOIS produtos com fichas por fora DIFERENTES — 8,0% contra 2,0% de `c`.
 *
 * Com fichas iguais, "a coluna Total é a soma das colunas" seria trivialmente verdadeiro e o
 * caso não discriminaria a repartição por produto.
 */
const ENTRADA: DecompositionInput = {
  items: [
    {
      id: 'a', label: 'Produto A', totalProduto: 20000, custo: 9000, acrescimos: 0,
      taxes: {
        icmsPct: 0.17, issPct: 0, pisCofinsPct: 0.0925, externalOpsCoefficient: 0.08,
        externalByTax: { ibs: 0.005, cbs: 0.045, is: 0.01, ipi: 0.02 },
      },
    },
    {
      id: 'b', label: 'Produto B', totalProduto: 10000, custo: 4000, acrescimos: 0,
      taxes: {
        icmsPct: 0.12, issPct: 0, pisCofinsPct: 0.0925, externalOpsCoefficient: 0.02,
        externalByTax: { ibs: 0.001, cbs: 0.009, is: 0, ipi: 0.01 },
      },
    },
  ],
  categories: CATEGORIAS,
  discountPct: 0,
  itensManuaisComAcrescimos: 0,
}

const DECOMPOSICAO = buildDecomposition(ENTRADA)

/** O apurado, calculado À MÃO a partir da entrada — nunca lido do resultado sob teste. */
const POR_FORA_A = 20000 * (0.005 + 0.045 + 0.01 + 0.02) // R$ 1.600,00
const POR_FORA_B = 10000 * (0.001 + 0.009 + 0 + 0.01)    // R$    200,00
const POR_FORA_TOTAL = POR_FORA_A + POR_FORA_B           // R$ 1.800,00

/** O trace do motor, com a etapa 8 no estado MEDIDO: peso 1 ⇒ R$ 0,00. */
const TRACE_PESO_UM: CascadeStep[] = [
  { step: 7, label: 'Formação Op Interna', base: 30000, rate: 1, amount: 30000, formula: '', source: 'ITEMS' },
  { step: 8, label: 'Formação Op Externa', base: 34220, rate: 0, amount: 0, formula: 'rb_total × (1 − peso_op_interna)', source: 'CONSOLIDADO' },
  { step: 9, label: 'Venda consolidada', base: null, rate: null, amount: 30000, formula: '', source: 'CONSOLIDADO' },
] as unknown as CascadeStep[]

/** O MESMO trace com o outro lado do defeito: peso 0,931 ⇒ R$ 2.070,00, que também não é o apurado. */
const TRACE_PESO_DERIVADO: CascadeStep[] = [
  { step: 7, label: 'Formação Op Interna', base: 30000, rate: 0.931, amount: 27930, formula: '', source: 'ITEMS' },
  { step: 8, label: 'Formação Op Externa', base: 34220, rate: 0.069, amount: 2070, formula: 'rb_total × (1 − peso_op_interna)', source: 'CONSOLIDADO' },
  { step: 9, label: 'Venda consolidada', base: null, rate: null, amount: 30000, formula: '', source: 'CONSOLIDADO' },
] as unknown as CascadeStep[]

const etapa8 = (trace: CascadeStep[], d = DECOMPOSICAO) =>
  buildCascadeView(trace, d).find((r) => r.numero === ETAPA_DA_OPERACAO_POR_FORA)

describe('1. O BLOCO APURADO — a soma das quatro linhas da decomposição', () => {
  it('soma IBS + CBS + IS + IPI, e o sinal é o de VALOR, não o de dedução', () => {
    const bloco = blocoPorForaDaDecomposicao(DECOMPOSICAO)!
    // As linhas do DRE saem NEGATIVAS; a etapa da construção exibe valor positivo.
    expect(bloco.valor).toBeCloseTo(POR_FORA_TOTAL, 6)
    expect(bloco.valor).toBeGreaterThan(0)
  })

  it('e abre POR PRODUTO, com a coluna Total sendo a SOMA das colunas (R16)', () => {
    const bloco = blocoPorForaDaDecomposicao(DECOMPOSICAO)!
    expect(bloco.perItem).toHaveLength(2)
    expect(bloco.perItem[0]).toBeCloseTo(POR_FORA_A, 6)
    expect(bloco.perItem[1]).toBeCloseTo(POR_FORA_B, 6)
    expect(bloco.perItem[0] + bloco.perItem[1]).toBeCloseTo(bloco.valor, 6)
    // O discriminante da coluna: os dois produtos têm `c` DIFERENTE, então uma repartição
    // por média devolveria R$ 900,00 em cada um.
    expect(bloco.perItem[0]).not.toBeCloseTo(POR_FORA_TOTAL / 2, 2)
  })

  it('o percentual é `valor ÷ base`, e a base é a receita de produtos', () => {
    const bloco = blocoPorForaDaDecomposicao(DECOMPOSICAO)!
    expect(bloco.base).toBeCloseTo(30000, 6)
    expect(bloco.pct).toBeCloseTo(POR_FORA_TOTAL / 30000, 8)
  })

  it('decomposição SEM linha por fora devolve `null` — ausência, nunca R$ 0,00', () => {
    // Zero afirmaria que o documento não tem operação por fora; `null` não afirma nada.
    expect(blocoPorForaDaDecomposicao({ ...DECOMPOSICAO, rows: [] })).toBeNull()
  })
})

describe('2. A ETAPA 8 PASSA A EXIBIR O APURADO — nos DOIS estados do defeito', () => {
  it('com peso 1, ela exibia R$ 0,00 e passa a exibir o bloco', () => {
    const row = etapa8(TRACE_PESO_UM)!
    expect(row.valor).toBeCloseTo(POR_FORA_TOTAL, 6)
    // Sem a correção este é o número que sai — e é o que o dono do produto mediu na tela.
    expect(row.valor).not.toBeCloseTo(0, 2)
  })

  it('com peso 0,931, o derivado também não era o apurado — e some igual', () => {
    const row = etapa8(TRACE_PESO_DERIVADO)!
    expect(row.valor).toBeCloseTo(POR_FORA_TOTAL, 6)
    // R$ 2.070,00 é `rb_total × (1 − peso)`. Ele NÃO é R$ 1.800,00, e é por isso que este
    // caso distingue "leu a decomposição" de "leu o motor".
    expect(row.valor).not.toBeCloseTo(2070, 2)
  })

  it('a base e o percentual também saem da decomposição, não do peso estrutural', () => {
    const row = etapa8(TRACE_PESO_DERIVADO)!
    expect(row.pct).toBeCloseTo(POR_FORA_TOTAL / 30000, 8)
    // O peso derivado era 0,069 — o número que a etapa exibia na coluna de percentual.
    expect(row.pct).not.toBeCloseTo(0.069, 4)
    // E a BASE é a receita de produtos, não o `rb_total` do motor. Os dois divergem sempre
    // que há item manual ou acréscimo no documento — aqui R$ 34.220,00 contra R$ 30.000,00 —,
    // e uma base de R$ 34.220,00 com o valor apurado devolveria um percentual que nenhum dos
    // dois lados calculou.
    expect(row.base).toBeCloseTo(30000, 6)
    expect(row.base).not.toBeCloseTo(34220, 2)
  })

  it('e a etapa ganha COLUNA POR PRODUTO, que as demais da construção não têm', () => {
    const row = etapa8(TRACE_PESO_UM)!
    expect(row.perItem).toHaveLength(2)
    expect(row.perItem[0]).toBeCloseTo(POR_FORA_A, 6)
    // O contraste: a etapa 7 continua sem abertura por item — o trace é consolidado, e a
    // tela exibe travessão ali (`ausente-vs-falso.md`).
    const etapa7 = buildCascadeView(TRACE_PESO_UM, DECOMPOSICAO).find((r) => r.numero === 7)!
    expect(etapa7.perItem).toHaveLength(0)
  })

  it('as DEMAIS etapas da construção seguem intactas — o motor não foi tocado', () => {
    const rows = buildCascadeView(TRACE_PESO_DERIVADO, DECOMPOSICAO)
    expect(rows.find((r) => r.numero === 7)!.valor).toBeCloseTo(27930, 6)
    expect(rows.find((r) => r.numero === 9)!.valor).toBeCloseTo(30000, 6)
  })
})

describe('3. SEM decomposição, fica o número do motor', () => {
  it('pedido e venda ainda não a montam — melhor o derivado que nada', () => {
    const row = buildCascadeView(TRACE_PESO_DERIVADO, null)
      .find((r) => r.numero === ETAPA_DA_OPERACAO_POR_FORA)!
    expect(row.valor).toBeCloseTo(2070, 6)
    // O discriminante: se a substituição fosse incondicional, este caso daria R$ 1.800,00 —
    // ou quebraria, porque não há decomposição de onde ler.
    expect(row.valor).not.toBeCloseTo(POR_FORA_TOTAL, 2)
  })
})
