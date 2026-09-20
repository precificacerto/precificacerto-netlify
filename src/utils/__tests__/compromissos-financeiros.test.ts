/**
 * COMPROMISSOS FINANCEIROS NO RATEIO · INVESTIMENTO FORA DELE — o oráculo do §8.
 *
 * Comando do PO de 21/09/2026:
 *
 *   > Parcela de financiamento, empréstimo, consórcio e amortização de principal vencem mesmo
 *   > sem venda: são compromisso assumido. Investimento não — ele só acontece se sobrar
 *   > dinheiro, então sai do lucro e não entra no preço.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR <<<
 *
 * Um caso que só afirmasse "o percentual mudou" ficaria verde com a implementação que também
 * joga o INVESTIMENTO na base — o número subiria do mesmo jeito, e mais ainda. Por isso todo
 * cenário tem investimento lançado E afirma que ele NÃO mexeu no percentual.
 * (`teste-que-nao-exercita.md`, variante 2: o caso escolhido tem de DISCRIMINAR.)
 */
import { extractStructurePercents } from '@/utils/hub-engine'
import type { HubData, HubRow } from '@/utils/hub-engine'
import {
  separarJurosEPrincipal,
  ehCompromissoFinanceiro,
  CATEGORIAS_DO_BLOCO,
  CATEGORIAS_OFERECIDAS_DO_BLOCO,
  CATEGORIAS_DE_INVESTIMENTO,
  GRUPOS_DA_BASE_DA_DESPESA_FIXA,
  LEGADO_PARA_ATUAL,
} from '@/utils/compromissos-financeiros'

/** Faturamento de referência do §8. */
const FATURAMENTO = 100000

function row(group: string, totalSum: number): HubRow {
  return {
    group,
    label: group,
    values: { '2026-01': totalSum },
    totalSum,
    closedMonthsWithData: 1,
    averageRS: totalSum,
    averagePct: (totalSum / FATURAMENTO) * 100,
    subRows: [],
  }
}

function hub(rows: HubRow[]): HubData {
  return {
    months: ['2026-01'],
    rows,
    incomeByMonth: { '2026-01': FATURAMENTO },
    totalIncome: FATURAMENTO,
    totalIncomeMonthsCount: 1,
  }
}

const pctFixa = (data: HubData) => extractStructurePercents(data).fixed_expense_percent * 100

// ── O cenário do §8 ────────────────────────────────────────────────────────────────────────
// Despesas fixas comuns 20.000,00.
// Compromissos: financiamento 3.000,00 (juros 500,00 + principal 2.500,00), empréstimo
// 1.000,00, consórcio 800,00, aplicações 200,00. Investimento 10.000,00.
const FIXAS_COMUNS = 20000
const EMPRESTIMO = 1000
const CONSORCIO = 800
const APLICACOES = 200
const PARCELA_FINANCIAMENTO = 3000
const JUROS = 500
const PRINCIPAL = PARCELA_FINANCIAMENTO - JUROS   // 2.500,00
const INVESTIMENTO = 10000

/** ANTES: o financiamento e a amortização ficavam FORA do rateio. */
const ANTES = hub([
  row('DESPESA_FIXA', FIXAS_COMUNS + EMPRESTIMO + CONSORCIO + APLICACOES), // 22.000,00
  row('AMORTIZACAO', PRINCIPAL),
  row('DESPESA_FINANCEIRA', JUROS),
  row('LUCRO', INVESTIMENTO),
])

/** DEPOIS: o principal do financiamento entra pelo grupo `AMORTIZACAO`, e o juros não. */
const DEPOIS = hub([
  row('DESPESA_FIXA', FIXAS_COMUNS + EMPRESTIMO + CONSORCIO + APLICACOES),
  row('AMORTIZACAO', PRINCIPAL),
  row('DESPESA_FINANCEIRA', JUROS),
  row('INVESTIMENTO', INVESTIMENTO),
])

describe('§8 — a base do rateio de despesa fixa', () => {
  it('>>> o principal do compromisso ENTRA: 22.000,00 → 24.500,00, 22,00% → 24,50% <<<', () => {
    // O "antes" é reproduzido excluindo o grupo AMORTIZACAO da base, que é o que a
    // implementação anterior fazia — `findPct('DESPESA_FIXA')` e nada mais.
    const comoEraAntes = (ANTES.rows.find((r) => r.group === 'DESPESA_FIXA')!.totalSum / FATURAMENTO) * 100
    expect(comoEraAntes).toBeCloseTo(22.0, 2)

    expect(pctFixa(DEPOIS)).toBeCloseTo(24.5, 2)
    expect(pctFixa(DEPOIS) * FATURAMENTO / 100).toBeCloseTo(24500, 2)
  })

  it('>>> os JUROS ficam de fora — eles são despesa financeira, e contá-los seria duas vezes <<<', () => {
    // 25,00% exigiria a parcela INTEIRA (3.000,00) na base, com os 500,00 de juros contados
    // aqui E em despesa financeira. O §6 é explícito: "Juros → DESPESA_FINANCEIRA".
    expect(pctFixa(DEPOIS)).not.toBeCloseTo(25.0, 2)
    expect(extractStructurePercents(DEPOIS).financial_expense_percent * 100).toBeCloseTo(0.5, 4)
  })

  it('o percentual é o mesmo lendo a base folded ou unfolded — a conta é idempotente', () => {
    // `calculateHubData` dobra a amortização dentro de DESPESA_FIXA para a tela; um HubData
    // já dobrado tem de dar o MESMO número que um com os dois grupos separados.
    const dobrado = hub([
      row('DESPESA_FIXA', FIXAS_COMUNS + EMPRESTIMO + CONSORCIO + APLICACOES + PRINCIPAL),
      row('DESPESA_FINANCEIRA', JUROS),
      row('INVESTIMENTO', INVESTIMENTO),
    ])
    expect(pctFixa(dobrado)).toBeCloseTo(pctFixa(DEPOIS), 10)
  })
})

describe('>>> (b) INVESTIMENTO nunca entra no rateio <<<', () => {
  it('lançar 10.000,00 de investimento não mexe em percentual nenhum', () => {
    const semInvestimento = hub(DEPOIS.rows.filter((r) => r.group !== 'INVESTIMENTO'))
    expect(extractStructurePercents(DEPOIS)).toEqual(extractStructurePercents(semInvestimento))
  })

  it('>>> e 10.000,00 num faturamento de 100.000,00 seriam DEZ pontos — o caso discrimina <<<', () => {
    const seEntrasse = hub([
      row('DESPESA_FIXA', FIXAS_COMUNS + EMPRESTIMO + CONSORCIO + APLICACOES + INVESTIMENTO),
      row('AMORTIZACAO', PRINCIPAL),
      row('DESPESA_FINANCEIRA', JUROS),
    ])
    expect(pctFixa(seEntrasse)).toBeCloseTo(34.5, 2)
    expect(pctFixa(DEPOIS)).toBeCloseTo(24.5, 2)
  })

  it('a constante do grupo não está na lista de grupos da base', () => {
    expect(GRUPOS_DA_BASE_DA_DESPESA_FIXA).toEqual(['DESPESA_FIXA', 'AMORTIZACAO'])
    expect(GRUPOS_DA_BASE_DA_DESPESA_FIXA as readonly string[]).not.toContain('INVESTIMENTO')
    expect(GRUPOS_DA_BASE_DA_DESPESA_FIXA as readonly string[]).not.toContain('LUCRO')
  })
})

describe('>>> (a) parcela só com o valor cheio — tudo vai para o principal <<<', () => {
  it('e o `usouValorCheio` é o que a tela lê para avisar', () => {
    const r = separarJurosEPrincipal({ total: PARCELA_FINANCIAMENTO })
    expect(r.principal).toBeCloseTo(3000, 2)
    expect(r.usouValorCheio).toBe(true)
  })

  it('>>> juros NÃO informado grava `null`, nunca 0 — ausente não é zero <<<', () => {
    const r = separarJurosEPrincipal({ total: PARCELA_FINANCIAMENTO })
    expect(r.juros).toBeNull()
    expect(r.juros).not.toBe(0)
  })

  it('>>> e ZERO informado é afirmação: sobrevive como 0, distinguível do ausente <<<', () => {
    const r = separarJurosEPrincipal({ total: PARCELA_FINANCIAMENTO, juros: 0 })
    expect(r.juros).toBe(0)
    expect(r.usouValorCheio).toBe(false)
    expect(r.principal).toBeCloseTo(3000, 2)
  })

  it('separada: 500,00 de juros e 2.500,00 de principal, e o total fecha', () => {
    const r = separarJurosEPrincipal({ total: PARCELA_FINANCIAMENTO, juros: JUROS, principal: PRINCIPAL })
    expect(r.juros).toBeCloseTo(500, 2)
    expect(r.principal).toBeCloseTo(2500, 2)
    expect(r.divergeDoTotal).toBe(false)
  })

  it('só os juros informados: o principal é o RESTO do total, não zero', () => {
    const r = separarJurosEPrincipal({ total: PARCELA_FINANCIAMENTO, juros: JUROS })
    expect(r.principal).toBeCloseTo(2500, 2)
    expect(r.divergeDoTotal).toBe(false)
  })

  it('>>> soma que não fecha com o total é DECLARADA, não corrigida em silêncio <<<', () => {
    const r = separarJurosEPrincipal({ total: 3000, juros: 500, principal: 2000 })
    expect(r.divergeDoTotal).toBe(true)
    expect(r.principal).toBeCloseTo(2000, 2)
  })
})

describe('O bloco: as cinco, mais os rótulos que o banco já tem', () => {
  it('as cinco categorias oferecidas, na ordem do §3', () => {
    expect(CATEGORIAS_OFERECIDAS_DO_BLOCO.map((c) => c.category)).toEqual([
      'Amortização de Dívida (principal)',
      'Financiamentos',
      'Empréstimos',
      'Consórcios',
      'Aplicações',
    ])
  })

  it('>>> os três rótulos LEGADOS continuam sendo reconhecidos — 26 lançamentos no banco <<<', () => {
    // Medido em 21/09/2026: 'Empréstimos' 10 · 'Aplicações / Consórcios' 13 ·
    // 'Empréstimos / Financiamentos' 3. Somam R$ 108.353,95.
    for (const legado of ['Empréstimos', 'Aplicações / Consórcios', 'Empréstimos / Financiamentos']) {
      expect(ehCompromissoFinanceiro(legado)).toBe(true)
    }
  })

  it('o legado desmembrado aponta para a natureza certa', () => {
    expect(LEGADO_PARA_ATUAL['Aplicações / Consórcios']).toBe('Consórcios')
    expect(LEGADO_PARA_ATUAL['Empréstimos / Financiamentos']).toBe('Empréstimos')
  })

  it('categoria de fora, vazia ou nula não é compromisso', () => {
    expect(ehCompromissoFinanceiro('Aluguel')).toBe(false)
    expect(ehCompromissoFinanceiro('')).toBe(false)
    expect(ehCompromissoFinanceiro(null)).toBe(false)
    expect(ehCompromissoFinanceiro(undefined)).toBe(false)
  })

  it('>>> o grupo técnico de cada categoria NÃO muda — o DRE contábil depende dele <<<', () => {
    const porCategoria = Object.fromEntries(CATEGORIAS_DO_BLOCO.map((c) => [c.category, c.group]))
    expect(porCategoria['Amortização de Dívida (principal)']).toBe('AMORTIZACAO')
    expect(porCategoria['Financiamentos']).toBe('DESPESA_FIXA')
    expect(porCategoria['Empréstimos']).toBe('DESPESA_FIXA')
  })

  it('>>> TODA categoria do grupo AMORTIZACAO é do bloco — é o que autoriza somar o grupo <<<', () => {
    // A base do rateio soma o GRUPO `AMORTIZACAO` inteiro. Isso só é correto enquanto todas
    // as categorias dele forem compromisso. Este caso fica vermelho no dia em que alguém
    // criar uma que não seja — em vez de ela entrar no preço em silêncio.
    const doGrupo = CATEGORIAS_DO_BLOCO.filter((c) => c.group === 'AMORTIZACAO')
    expect(doGrupo).toHaveLength(1)
    expect(doGrupo[0].category).toBe('Amortização de Dívida (principal)')
  })

  it('nenhuma categoria de investimento entrou no bloco por engano', () => {
    for (const inv of CATEGORIAS_DE_INVESTIMENTO) {
      expect(ehCompromissoFinanceiro(inv.category)).toBe(false)
    }
    expect(CATEGORIAS_DE_INVESTIMENTO).toHaveLength(5)
  })
})
