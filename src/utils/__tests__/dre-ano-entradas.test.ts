/**
 * O BLOCO "CUSTO DOS PRODUTOS" NO DRE DO ANO — a apresentação muda, o resultado do mês NÃO.
 *
 * Comando do PO de 21/09/2026, §9:
 *
 *   > A linha "Impostos Recuperáveis sobre Compras" sai de dentro do custo e passa a ser essa
 *   > dedução, com o subtotal. O total do grupo continua igual ao caixa: o resultado do mês
 *   > NÃO pode mudar.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR <<<
 *
 * Um caso que só conferisse "as três linhas aparecem" ficaria verde com a implementação que
 * MUDA o resultado — as três linhas estariam lá do mesmo jeito. O que separa as duas é
 * `somaMensalDasLinhas`, e é por isso que ela é afirmada em todo caso com crédito, contra a
 * montagem ANTERIOR a esta etapa, recalculada aqui à mão.
 * (`teste-que-nao-exercita.md`, variante 3: afirmar passagem não é afirmar efeito.)
 */
import {
  processYearEntries,
  somaMensalDasLinhas,
  aggregateByCategory,
  averageWithoutCurrentMonth,
} from '@/utils/dre-ano-entradas'
import { LINHAS_DE_APRESENTACAO_DO_CUSTO } from '@/utils/custo-produtos-no-dre'

const CREDITOS = LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.label
const LIQUIDO = LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.label

/** Uma compra de R$ 1.000,00 paga em março, com os seis tributos abertos. */
const COMPRA = {
  type: 'EXPENSE',
  due_date: '2026-03-10',
  paid_date: '2026-03-10',
  amount: 1000,
  expense_group: 'CUSTO_PRODUTOS',
  expense_category: 'Fornecedores',
  valor_icms: 180, valor_pis: 16.5, valor_cofins: 76,
  valor_ipi: 50, valor_cbs: 88, valor_ibs: 1,
}
const TODOS = 180 + 16.5 + 76 + 50 + 88 + 1  // 411,50
const IVA = 88 + 1                            // 89,00

/** Uma venda de R$ 5.000,00 no mesmo mês, para o resultado ter os dois lados. */
const VENDA = {
  type: 'INCOME',
  due_date: '2026-03-20',
  paid_date: '2026-03-20',
  amount: 5000,
  expense_category: 'RECEITA_VENDAS',
  payment_method: 'PIX',
}

const linha = (r: ReturnType<typeof processYearEntries>, cat: string) =>
  r.expenseData.find((l) => l.category === cat)

describe('As três linhas do bloco', () => {
  const r = processYearEntries([COMPRA, VENDA], 2026, 'LUCRO_REAL')

  it('a categoria carrega o BRUTO — era o líquido antes desta etapa', () => {
    expect(linha(r, 'Fornecedores')?.mar).toBeCloseTo(1000, 2)
  })

  it('>>> a dedução é NEGATIVA e sai de dentro do custo <<<', () => {
    // Antes daqui existia "Impostos Recuperáveis sobre Compras" com +411,50, DENTRO do custo.
    expect(linha(r, 'Impostos Recuperáveis sobre Compras')).toBeUndefined()
    expect(linha(r, CREDITOS)?.mar).toBeCloseTo(-TODOS, 2)
  })

  it('o subtotal líquido existe e é bruto − créditos', () => {
    expect(linha(r, LIQUIDO)?.mar).toBeCloseTo(1000 - TODOS, 2)
  })

  it('>>> e as duas se DECLARAM apresentação — é o campo que impede a dupla contagem <<<', () => {
    expect(linha(r, 'Fornecedores')?.apenasApresentacao).toBeFalsy()
    expect(linha(r, CREDITOS)?.apenasApresentacao).toBe(true)
    expect(linha(r, LIQUIDO)?.apenasApresentacao).toBe(true)
  })

  it('as três saem na ordem do bloco, e não na do `localeCompare` do rótulo', () => {
    expect(linha(r, CREDITOS)!.ordem!).toBeLessThan(linha(r, LIQUIDO)!.ordem!)
    expect(linha(r, 'Fornecedores')?.ordem).toBeUndefined()
  })
})

describe('>>> O RESULTADO DO MÊS — é aqui que a implementação errada fica vermelha <<<', () => {
  it.each([
    ['LUCRO_REAL', TODOS],
    ['LUCRO_PRESUMIDO', TODOS],
    ['SIMPLES_HIBRIDO', IVA],
    ['SIMPLES_NACIONAL', 0],
    ['MEI', 0],
  ])('%s: saída de março = 1.000,00, IDÊNTICA à montagem anterior', (regime, credito) => {
    const r = processYearEntries([COMPRA, VENDA], 2026, regime)

    // A montagem ANTERIOR a esta etapa: categoria com (amount − taxSum) MAIS uma linha
    // positiva de "Impostos Recuperáveis sobre Compras" com taxSum. A soma das duas é amount.
    const comoEraAntes = (1000 - (credito as number)) + (credito as number)

    const saidas = somaMensalDasLinhas(r.expenseData)
    expect(saidas.mar).toBeCloseTo(comoEraAntes, 10)
    expect(saidas.mar).toBeCloseTo(1000, 10)

    const entradas = somaMensalDasLinhas(r.incomeData)
    expect(entradas.mar - saidas.mar).toBeCloseTo(4000, 10)
  })

  it('>>> somar TODAS as linhas devolveria outro número — a dupla contagem, medida <<<', () => {
    const r = processYearEntries([COMPRA, VENDA], 2026, 'LUCRO_REAL')
    const somaCega = r.expenseData.reduce((a, l) => a + (l.mar || 0), 0)
    // 1.000,00 − 411,50 + 588,50 = 1.177,00. Nem o bruto, nem o líquido.
    expect(somaCega).toBeCloseTo(1177, 2)
    expect(somaCega).not.toBeCloseTo(1000, 2)
  })
})

describe('O REGIME decide o que é deduzido — a decomposição LÊ, não infere', () => {
  it('>>> Híbrido: a MESMA compra deduz 89,00, não 411,50 <<<', () => {
    const r = processYearEntries([COMPRA, VENDA], 2026, 'SIMPLES_HIBRIDO')
    expect(linha(r, CREDITOS)?.mar).toBeCloseTo(-IVA, 2)
    expect(linha(r, LIQUIDO)?.mar).toBeCloseTo(1000 - IVA, 2)
  })

  it.each(['SIMPLES_NACIONAL', 'MEI'])('>>> %s: o bloco NÃO aparece <<<', (regime) => {
    const r = processYearEntries([COMPRA, VENDA], 2026, regime)
    expect(linha(r, CREDITOS)).toBeUndefined()
    expect(linha(r, LIQUIDO)).toBeUndefined()
    expect(linha(r, 'Fornecedores')?.mar).toBeCloseTo(1000, 2)
  })

  it('regime ausente = trata como discriminado, o comportamento de antes', () => {
    const r = processYearEntries([COMPRA, VENDA], 2026, null)
    expect(linha(r, CREDITOS)?.mar).toBeCloseTo(-TODOS, 2)
  })
})

describe('Compra SEM breakdown: ausente não é zero', () => {
  const semTributos: Record<string, unknown> = {
    ...COMPRA,
    valor_icms: null, valor_pis: null, valor_cofins: null,
    valor_ipi: null, valor_cbs: null, valor_ibs: null,
  }

  it('>>> entra no custo CHEIA, e sem bloco — não afirma que o crédito foi zero <<<', () => {
    const r = processYearEntries([semTributos, VENDA], 2026, 'LUCRO_REAL')
    expect(linha(r, 'Fornecedores')?.mar).toBeCloseTo(1000, 2)
    expect(linha(r, CREDITOS)).toBeUndefined()
    expect(somaMensalDasLinhas(r.expenseData).mar).toBeCloseTo(1000, 10)
  })

  it('>>> o subtotal é do GRUPO no mês: a compra sem breakdown entra nele <<<', () => {
    const r = processYearEntries([COMPRA, semTributos, VENDA], 2026, 'LUCRO_REAL')
    expect(linha(r, 'Fornecedores')?.mar).toBeCloseTo(2000, 2)
    expect(linha(r, CREDITOS)?.mar).toBeCloseTo(-TODOS, 2)
    expect(linha(r, LIQUIDO)?.mar).toBeCloseTo(2000 - TODOS, 2)
    expect(somaMensalDasLinhas(r.expenseData).mar).toBeCloseTo(2000, 10)
  })
})

describe('A linha negativa não vira travessão', () => {
  it('>>> `> 0` na contagem dos meses zeraria o somatório da dedução <<<', () => {
    const linhas = aggregateByCategory([
      { category: CREDITOS, expenseGroup: 'CUSTO_PRODUTOS', price: -411.5, month: 'mar', apenasApresentacao: true },
      { category: CREDITOS, expenseGroup: 'CUSTO_PRODUTOS', price: -200, month: 'apr', apenasApresentacao: true },
    ])
    expect(linhas[0].totalSum).toBeCloseTo(-611.5, 2)
    expect(linhas[0].average).toBeCloseTo(-305.75, 2)
  })

  it('e a regra de sempre vale para as linhas normais: negativo não conta', () => {
    const linhas = aggregateByCategory([
      { category: 'Fornecedores', expenseGroup: 'CUSTO_PRODUTOS', price: 100, month: 'mar' },
      { category: 'Fornecedores', expenseGroup: 'CUSTO_PRODUTOS', price: 0, month: 'apr' },
    ])
    expect(linhas[0].average).toBeCloseTo(100, 2)
  })
})

describe('Despesa NÃO paga continua fora, e o bloco não a inventa', () => {
  it('compra sem `paid_date` não entra em nada', () => {
    const r = processYearEntries([{ ...COMPRA, paid_date: null }, VENDA], 2026, 'LUCRO_REAL')
    expect(linha(r, 'Fornecedores')).toBeUndefined()
    expect(linha(r, CREDITOS)).toBeUndefined()
    expect(somaMensalDasLinhas(r.expenseData).mar ?? 0).toBeCloseTo(0, 10)
  })
})

describe('>>> As chaves que NÃO são mês — `+true` vale 1, e `ordem` vale 9.998 <<<', () => {
  /**
   * `averageWithoutCurrentMonth` percorre TODAS as chaves da linha e faz `Number(obj[key])`.
   * Tirar `apenasApresentacao` e `ordem` de `CHAVES_QUE_NAO_SAO_MES` não quebra nada
   * visivelmente — só soma um real e quase dez mil ao somatório da linha, em silêncio.
   */
  const r = processYearEntries([COMPRA, VENDA], 2026, 'LUCRO_REAL')

  it('o somatório da dedução é exatamente os meses, sem carona da flag nem da ordem', () => {
    const [deducao] = averageWithoutCurrentMonth(r.expenseData.filter((l) => l.category === CREDITOS), 2026)
    expect(deducao.totalSum).toBeCloseTo(-TODOS, 2)
    expect(deducao.totalSum).not.toBeCloseTo(-TODOS + 1, 2)
    expect(deducao.totalSum).not.toBeCloseTo(-TODOS + LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.ordem, 2)
    expect(deducao.monthsBiggerThanZero).toBe(1)
  })

  it('e o subtotal líquido também', () => {
    const [liquido] = averageWithoutCurrentMonth(r.expenseData.filter((l) => l.category === LIQUIDO), 2026)
    expect(liquido.totalSum).toBeCloseTo(1000 - TODOS, 2)
    expect(liquido.monthsBiggerThanZero).toBe(1)
  })
})
