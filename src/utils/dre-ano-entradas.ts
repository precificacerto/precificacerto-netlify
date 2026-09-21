/**
 * dre-ano-entradas.ts — o processamento das entradas de caixa do HUB/DRE anual.
 *
 * Estava inteiro dentro de `src/pages/dre/[year].tsx`, onde nenhum caso podia alcançá-lo. Saiu
 * de lá pela razão de `teste-que-nao-exercita.md`: a pergunta "se eu desfizer a correção, este
 * caso fica vermelho?" não tinha resposta enquanto a função não fosse chamável.
 *
 * >>> A RESTRIÇÃO QUE ESTE MÓDULO CARREGA <<<
 *
 * O bloco CUSTO DOS PRODUTOS tem três linhas (bruto, dedução, líquido) e **só a primeira entra
 * no resultado do mês** — `custo-produtos-no-dre.ts` explica por quê. `somaMensalDasLinhas` é
 * a conta que monta o resultado, e é ela que filtra `apenasApresentacao`. Um caso afirma que o
 * número que ela devolve é IDÊNTICO ao da montagem anterior a esta etapa.
 */
import { CASHIER_CATEGORY, YEARLY_AVERAGE_CATEGORIES } from '@/constants/cashier-category'
import { ResultData, TableDataType } from '@/shared/enums/dre-year-base'
import {
  creditoRecuperavelDaCompra,
  montarBlocoDeCustoDosProdutos,
  detalheDoCreditoPorTributo,
  temBreakdownDeCompra,
  LINHAS_DE_APRESENTACAO_DO_CUSTO,
  type TributosDaCompra,
  type RegimeDoBloco,
} from '@/utils/custo-produtos-no-dre'
import {
  ehCompromissoFinanceiro,
  LABEL_DO_BLOCO,
  ordemNoBloco,
} from '@/utils/compromissos-financeiros'

/**
 * As chaves que NÃO são mês. `apenasApresentacao` e `ordem` PRECISAM estar aqui: quem soma os
 * meses itera sobre as chaves ausentes deste conjunto e faz `+value` — `+true` é 1, e a linha
 * entraria no resultado valendo um real.
 */
export const CHAVES_QUE_NAO_SAO_MES = new Set([
  'key', 'category', 'expenseGroup', 'apenasApresentacao', 'ordem',
  'totalSum', 'average', 'monthsBiggerThanZero', 'totalAverage', 'overallSum',
])

/**
 * A SOMA POR MÊS de um conjunto de linhas — é ela que produz o resultado do mês na tela.
 *
 * >>> O FILTRO ABAIXO É A RESTRIÇÃO DO §9 <<<
 * As duas linhas novas do bloco Custo dos Produtos decompõem um valor que JÁ está no caixa.
 * Somá-las contaria o crédito duas vezes e o lucro do mês subiria sozinho.
 */
export function somaMensalDasLinhas(entries: TableDataType[]): Record<string, number> {
  return entries
    .filter((e) => !e.apenasApresentacao)
    .reduce((acc, entry) => {
      for (const [key, value] of Object.entries(entry)) {
        if (!CHAVES_QUE_NAO_SAO_MES.has(key)) {
          acc[key] = (acc[key] || 0) + +(value as number)
        }
      }
      return acc
    }, {} as { [month: string]: number })
}

type ExtendedTableDataType = TableDataType & {
  [key: string]: number | string | boolean | undefined
}

export const months = [
  { key: 'JAN', value: 'jan' },
  { key: 'FEV', value: 'feb' },
  { key: 'MAR', value: 'mar' },
  { key: 'ABR', value: 'apr' },
  { key: 'MAI', value: 'may' },
  { key: 'JUN', value: 'jun' },
  { key: 'JUL', value: 'jul' },
  { key: 'AGO', value: 'ago' },
  { key: 'SET', value: 'sep' },
  { key: 'OUT', value: 'oct' },
  { key: 'NOV', value: 'nov' },
  { key: 'DEZ', value: 'dec' },
]

export function effectiveIncomeAmount(entry: any): number {
  if (entry.payment_method === 'CARTAO_CREDITO' && entry.anticipated_amount != null && Number(entry.anticipated_amount) > 0) {
    return Math.max(0, Number(entry.amount) - Number(entry.anticipated_amount))
  }
  return Number(entry.amount) || 0
}

export type ProcessItem = {
  category: string
  expenseGroup?: string
  price: number
  month: string
  apenasApresentacao?: boolean
  ordem?: number
}

export function processYearEntries(entries: any[], _year: number, regime: RegimeDoBloco): ResultData {
  const incomeItems: ProcessItem[] = []
  const expenseItems: ProcessItem[] = []
  const custoProdutosBrutoPorMes: Record<string, number> = {}
  const creditoDeCompraPorMes: Record<string, number> = {}
  const tributosDaCompraPorMes: Record<string, TributosDaCompra> = {}
  const subtotalDoBlocoPorMes: Record<string, number> = {}

  entries.forEach((entry: any) => {
    const monthIdx = parseInt((entry.due_date || '').slice(5, 7), 10) - 1
    const monthDef = months[monthIdx]
    if (!monthDef) return
    const monthVal = monthDef.value

    if (entry.type === 'INCOME') {
      // Espelha a DFC: BOLETO/CHEQUE pendente (sem paid_date) não entra no HUB
      if ((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') && !entry.paid_date) return
      incomeItems.push({
        category: entry.expense_category || entry.description || 'RECEITA_VENDAS',
        expenseGroup: entry.expense_group || undefined,
        price: effectiveIncomeAmount(entry),
        month: monthVal,
      })
      return
    }

    // EXPENSE — só despesas efetivamente pagas contam no HUB/DRE (igual à DFC)
    if (!entry.paid_date) return

    const amount = Number(entry.amount) || 0
    const group = entry.expense_group || undefined
    const category = entry.expense_category || entry.description || 'DESPESA_GERAL'

    // CUSTO DOS PRODUTOS — a categoria carrega o BRUTO, e a dedução vira linha própria.
    //
    // Antes daqui a categoria recebia `amount − taxSum` e uma linha POSITIVA de "Impostos
    // Recuperáveis sobre Compras" recebia `taxSum` — a dedução ficava DENTRO do custo. O §9 do
    // comando de 21/09/2026 a tira de lá. A soma das linhas que entram no resultado era
    // `(amount − taxSum) + taxSum = amount` e passa a ser `amount`: o resultado do mês não muda.
    //
    // O crédito e o subtotal são acumulados por mês e só viram linha DEPOIS do laço, porque o
    // subtotal líquido é do GRUPO INTEIRO no mês, não de uma entrada.
    if (group === 'CUSTO_PRODUTOS') {
      const tributos = {
        icms: entry.valor_icms, pis: entry.valor_pis, cofins: entry.valor_cofins,
        ipi: entry.valor_ipi, cbs: entry.valor_cbs, ibs: entry.valor_ibs,
      }
      custoProdutosBrutoPorMes[monthVal] = (custoProdutosBrutoPorMes[monthVal] || 0) + amount
      if (temBreakdownDeCompra(tributos)) {
        creditoDeCompraPorMes[monthVal] =
          (creditoDeCompraPorMes[monthVal] || 0) + creditoRecuperavelDaCompra(tributos, regime)

        // Os seis abertos, para as sub-linhas por tributo.
        const acc = tributosDaCompraPorMes[monthVal] ?? (tributosDaCompraPorMes[monthVal] = {})
        for (const k of ['icms', 'pis', 'cofins', 'ipi', 'cbs', 'ibs'] as const) {
          const v = Number((tributos as Record<string, unknown>)[k])
          if (!Number.isFinite(v) || v === 0) continue
          acc[k] = (acc[k] ?? 0) + v
        }
      }
    }

    // >>> COMPROMISSOS FINANCEIROS — o bloco dentro de Despesa Fixa, §7 <<<
    //
    // A categoria é LIDA como `DESPESA_FIXA` mesmo quando o grupo gravado é `AMORTIZACAO`: o
    // §7 exige que a amortização apareça uma vez só, dentro do bloco. O grupo GRAVADO não
    // muda — a Análise Financeira contábil (`pages/dfc/`) continua pondo a amortização depois
    // do resultado operacional, e o valor dela lá não muda.
    //
    // É o mesmo desenho do bloco de cima: o subtotal é do GRUPO no mês, não de uma entrada, e
    // por isso só vira linha depois do laço.
    if (ehCompromissoFinanceiro(category)) {
      expenseItems.push({
        category, expenseGroup: 'DESPESA_FIXA', price: amount, month: monthVal,
        ordem: ordemNoBloco(category) ?? undefined,
      })
      subtotalDoBlocoPorMes[monthVal] = (subtotalDoBlocoPorMes[monthVal] || 0) + amount
      return
    }

    expenseItems.push({ category, expenseGroup: group, price: amount, month: monthVal })
  })

  // O SUBTOTAL do bloco. Ele NÃO entra no resultado do mês: é a soma de linhas que já estão
  // lá, e somá-lo contaria o bloco duas vezes. Sem compromisso lançado, nenhuma linha — um
  // subtotal de R$ 0,00 afirmaria que a empresa não tem compromisso (`ausente-vs-falso.md`).
  for (const [month, price] of Object.entries(subtotalDoBlocoPorMes)) {
    expenseItems.push({
      category: LABEL_DO_BLOCO, expenseGroup: 'DESPESA_FIXA', price, month,
      apenasApresentacao: true, ordem: ordemNoBloco(LABEL_DO_BLOCO) ?? undefined,
    })
  }

  for (const month of Object.keys(custoProdutosBrutoPorMes)) {
    const bloco = montarBlocoDeCustoDosProdutos({
      valorBrutoPago: custoProdutosBrutoPorMes[month],
      creditoRecuperavel: creditoDeCompraPorMes[month] || 0,
      regime,
    })
    // Uma linha só = sem crédito naquele mês (Simples, MEI, ou nenhum tributo informado).
    if (bloco.linhas.length < 3) continue

    const apresentar = (rotulo: string, price: number, ordem: number) => expenseItems.push({
      category: rotulo, expenseGroup: 'CUSTO_PRODUTOS', price, month,
      apenasApresentacao: true, ordem,
    })

    // >>> O LÍQUIDO VEM PRIMEIRO — §2 do comando de 21/09/2026 <<<
    // Aqui não há linha de cabeçalho de grupo, então a inversão é a ORDEM: o líquido é a
    // cabeça do bloco e as parcelas que o explicam vêm abaixo. As categorias reais
    // (Fornecedores, Matéria Prima…) continuam carregando o bruto e entrando no resultado —
    // a linha "Custo bruto" abaixo é o AGREGADO delas, e é apresentação como as outras.
    apresentar(LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.label, bloco.linhas[2].valor, LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.ordem)
    apresentar(LINHAS_DE_APRESENTACAO_DO_CUSTO.bruto.label, bloco.linhas[0].valor, LINHAS_DE_APRESENTACAO_DO_CUSTO.bruto.ordem)
    apresentar(LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.label, bloco.linhas[1].valor, LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.ordem)

    for (const d of detalheDoCreditoPorTributo(tributosDaCompraPorMes[month], regime)) {
      apresentar(d.label, -d.valor, d.ordem)
    }
  }

  return {
    incomeData: aggregateByCategory(incomeItems),
    expenseData: aggregateByCategory(expenseItems),
  }
}

export function aggregateByCategory(items: ProcessItem[]): TableDataType[] {
  const filteredItems = items.filter((item) => item.category !== CASHIER_CATEGORY.INCOME?.DEFICIT_FINANCEIRO?.key)

  const monthCatAgg: Record<string, {
    monthData: Record<string, number>
    expenseGroup?: string
    apenasApresentacao?: boolean
    ordem?: number
  }> = {}
  filteredItems.forEach((item) => {
    if (!monthCatAgg[item.category]) {
      monthCatAgg[item.category] = {
        monthData: {},
        expenseGroup: item.expenseGroup,
        apenasApresentacao: item.apenasApresentacao,
        ordem: item.ordem,
      }
    }
    if (!monthCatAgg[item.category].expenseGroup && item.expenseGroup) monthCatAgg[item.category].expenseGroup = item.expenseGroup
    const monthData = monthCatAgg[item.category].monthData
    monthData[item.month] = (monthData[item.month] || 0) + item.price
  })

  let keyIdx = 0
  return Object.entries(monthCatAgg).map(([category, { monthData, expenseGroup, apenasApresentacao, ordem }]) => {
    const row: any = {
      key: keyIdx++,
      category,
      expenseGroup,
      apenasApresentacao,
      ordem,
      jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
      jul: 0, ago: 0, sep: 0, oct: 0, nov: 0, dec: 0,
      totalSum: 0, average: 0, totalAverage: 0, overallSum: 0,
    }

    let monthsBiggerThanZero = 0
    for (const [month, value] of Object.entries(monthData)) {
      row[month] = value
      row.totalSum += value
      // A LINHA DE DEDUÇÃO É NEGATIVA, e `> 0` a deixaria com média zero e somatório zero —
      // exibindo travessão onde há valor. O `!== 0` vale SÓ para as linhas do bloco; para
      // todas as outras nada muda, porque `amount` de caixa nunca é negativo.
      if (apenasApresentacao ? value !== 0 : value > 0) monthsBiggerThanZero++
    }
    row.average = monthsBiggerThanZero > 0 ? +(row.totalSum / monthsBiggerThanZero).toFixed(2) : 0

    return row
  })
}

export function isCurrentMonthAndYear(monthKey: string, year: number): boolean {
  const now = new Date()
  const currentMonth = now.toLocaleString('en-US', { month: 'short' }).replace('.', '').toLowerCase()
  const currentYear = now.getFullYear()
  return monthKey === currentMonth && year === currentYear
}

/**
 * `totalSum`, `average` e `monthsBiggerThanZero` de cada linha, ignorando o mês corrente.
 *
 * >>> POR QUE `CHAVES_QUE_NAO_SAO_MES` É CRÍTICO AQUI <<<
 * Este laço percorre TODAS as chaves da linha e faz `Number(obj[key])`. `apenasApresentacao` é
 * booleano e `ordem` vale 9.998: fora daquele conjunto, `true` viraria 1 e a ordem viraria
 * quase dez mil reais somados ao somatório da linha.
 */
export function averageWithoutCurrentMonth(entries: TableDataType[], year: number) {
  return entries.map((obj: ExtendedTableDataType) => {
    let sum = 0
    let monthsCount = 0
    const isYearly = Object.values(YEARLY_AVERAGE_CATEGORIES).some(category => category.key === obj.category)

    for (const key in obj) {
      if (!CHAVES_QUE_NAO_SAO_MES.has(key)) {
        const v = Number(obj[key]) || 0
        // Ver a nota em `aggregateByCategory`: o `!== 0` vale só para a linha de dedução.
        const conta = obj.apenasApresentacao ? v !== 0 : v > 0
        if (!isCurrentMonthAndYear(key, year) && conta) {
          sum += v
          monthsCount = isYearly ? 12 : monthsCount + 1
        }
      }
    }

    return {
      ...obj,
      totalSum: sum,
      average: monthsCount === 0 ? 0 : sum / monthsCount,
      monthsBiggerThanZero: monthsCount,
    }
  })
}

