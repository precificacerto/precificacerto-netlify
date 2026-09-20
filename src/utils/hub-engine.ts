import { supabase } from '@/supabase/client'
import {
  creditoRecuperavelDaCompra,
  montarBlocoDeCustoDosProdutos,
  ordemDaLinhaDeApresentacao,
  ehLinhaDeApresentacao,
  LINHAS_DE_APRESENTACAO_DO_CUSTO,
  type RegimeDoBloco,
} from '@/utils/custo-produtos-no-dre'
import { HUB_GROUPS as HUB_GROUPS_FONTE } from '@/constants/expense-groups'
import { CASHIER_CATEGORY } from '@/constants/cashier-category'
import {
  GRUPOS_DA_BASE_DA_DESPESA_FIXA,
  GRUPO_INVESTIMENTO,
  LABEL_DO_BLOCO,
  CATEGORIAS_DO_BLOCO,
  ehCompromissoFinanceiro,
  classificarLancamentoDeDespesa,
  ordemNoBloco,
} from '@/utils/compromissos-financeiros'

export interface HubMonthData {
  [monthKey: string]: number // ex: '2025-01': 1500.00
}

export interface HubSubRow {
  categoryKey: string  // ex: 'FORNECEDORES'
  label: string        // ex: 'Fornecedores - Produtos para Revenda'
  values: HubMonthData
  totalSum: number
  closedMonthsWithData: number
  averageRS: number
  averagePct: number
  /**
   * `true` = SUBTOTAL de apresentação. Não é uma categoria: é a soma de outras sub-rows do
   * mesmo grupo, e somá-la junto contaria o bloco duas vezes.
   *
   * Hoje nada soma sub-rows — o total do grupo vem de `expenseByGroupByMonth` — e o campo
   * existe para que continue assim quando alguém escrever o próximo consumidor.
   */
  apenasApresentacao?: boolean
}

export interface HubRow {
  group: string
  label: string
  values: HubMonthData       // R$ por mês (total do grupo)
  totalSum: number           // soma total nos meses encerrados
  closedMonthsWithData: number // quantos meses tiveram valor > 0 neste grupo
  averageRS: number          // totalSum / closedMonthsWithData
  averagePct: number         // (totalSum / totalIncomeInSameMonths) × 100
  subRows: HubSubRow[]       // detalhamento por categoria dentro do grupo
}

export interface HubData {
  months: string[]           // ex: ['2025-01', '2025-02', ...]
  rows: HubRow[]
  incomeByMonth: HubMonthData
  totalIncome: number
  totalIncomeMonthsCount: number
}

// Mapa de categoryKey → label a partir das constantes do projeto
const CATEGORY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  Object.values(CASHIER_CATEGORY.EXPENSE).map((c: any) => [c.key, c.value])
)

/** A chave do grupo, uma vez só. Não é lista de grupos — a lista vive em `expense-groups.ts`. */
const GRUPO_CUSTO_PRODUTOS = 'CUSTO_PRODUTOS'

// Rótulos das duas SUB-ROWS DE APRESENTAÇÃO do bloco Custo dos Produtos.
//
// Antes daqui havia SEIS sub-rows, uma por tributo (`LR_ICMS_CUSTO` e companhia), e a
// categoria carregava o custo JÁ LÍQUIDO. O comando do PO de 21/09/2026, §9, troca isso por
// bloco de três linhas: a categoria volta a carregar o BRUTO, e a dedução e o subtotal são
// duas linhas próprias. O total do grupo não muda em nenhum dos dois desenhos — ele vem de
// `expenseByGroupByMonth`, que sempre somou o `amount` cheio.
const LR_TAX_CATEGORY_LABELS: Record<string, string> = {
  [LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.key]: LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.label,
  [LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.key]: LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.label,
}

/**
 * Acrescenta ao mapa de categorias as DUAS LINHAS DE APRESENTAÇÃO do bloco Custo dos Produtos.
 *
 * >>> O QUE ESTA FUNÇÃO NÃO FAZ <<<
 *
 * Ela não toca `expenseByGroupByMonth`, que é de onde saem o total do grupo e o "Total
 * Despesas" da tela. É essa separação que garante a restrição do §9: **o resultado do mês não
 * pode mudar**. As duas linhas são detalhe dentro do grupo, como as categorias já eram.
 *
 * O bloco só existe quando há crédito a mostrar — em Simples e MEI, `creditoRecuperavelDaCompra`
 * devolve zero e nada é acrescentado.
 */
function acrescentaBlocoDeCustoDosProdutos(
  expenseByCategoryByMonth: Record<string, { group: string; values: HubMonthData }>,
  brutoPorMes: HubMonthData,
  creditoPorMes: HubMonthData,
  regime: RegimeDoBloco,
) {
  for (const monthKey of Object.keys(brutoPorMes)) {
    const bloco = montarBlocoDeCustoDosProdutos({
      valorBrutoPago: brutoPorMes[monthKey] || 0,
      creditoRecuperavel: creditoPorMes[monthKey] || 0,
      regime,
    })
    // Uma linha só = não há crédito naquele mês, e o bloco não se decompõe.
    if (bloco.linhas.length < 3) continue

    const add = (key: string, val: number) => {
      if (!expenseByCategoryByMonth[key]) {
        expenseByCategoryByMonth[key] = { group: GRUPO_CUSTO_PRODUTOS, values: {} }
      }
      expenseByCategoryByMonth[key].values[monthKey] =
        (expenseByCategoryByMonth[key].values[monthKey] || 0) + val
    }
    add(LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.key, bloco.linhas[1].valor)
    add(LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.key, bloco.linhas[2].valor)
  }
}

/**
 * Acrescenta o SUBTOTAL do bloco Compromissos Financeiros dentro de Despesa Fixa — §7.
 *
 * >>> ELE NÃO ENTRA EM SOMA NENHUMA <<<
 * O total do grupo vem de `expenseByGroupByMonth`, que já tem o valor das categorias. Esta
 * linha é a soma DELAS, marcada com `apenasApresentacao` para que o próximo consumidor que
 * resolver somar sub-rows não conte o bloco duas vezes.
 *
 * Sem compromisso lançado no período, nada é acrescentado: um subtotal de R$ 0,00 afirmaria
 * que a empresa não tem compromisso, quando o que há é ausência de lançamento
 * (`ausente-vs-falso.md`).
 */
function acrescentaSubtotalDoBloco(
  expenseByCategoryByMonth: Record<string, { group: string; values: HubMonthData }>,
) {
  const subtotal: HubMonthData = {}
  for (const c of CATEGORIAS_DO_BLOCO) {
    const dados = expenseByCategoryByMonth[c.category]
    if (!dados) continue
    for (const [m, v] of Object.entries(dados.values)) subtotal[m] = (subtotal[m] || 0) + v
  }
  if (Object.keys(subtotal).length === 0) return
  expenseByCategoryByMonth[LABEL_DO_BLOCO] = { group: 'DESPESA_FIXA', values: subtotal }
}

// Mapa de categoryKey → order (para ordenação)
const CATEGORY_ORDER_MAP: Record<string, number> = Object.fromEntries(
  Object.values(CASHIER_CATEGORY.EXPENSE).map((c: any) => [c.key, c.order ?? 999])
)

// Ordem e labels dos grupos exibidos no Hub — DERIVADOS de `expense-groups.ts`, a fonte única.
// Esta lista era uma das CINCO cópias divergentes, e era a única que tinha `DEDUCAO_RECEITA` e
// `OUTROS`. `.claude/rules/copia-divergente.md`.
const HUB_GROUPS = HUB_GROUPS_FONTE

/**
 * Calcula os dados do Hub incluindo o mês atual (até o fim do mês corrente).
 * Exigência: EXPENSE deve ter paid_date (confirmada) para ser contabilizada.
 * INCOME com BOLETO/CHEQUE_PRE_DATADO também exige paid_date.
 *
 * Fórmula do percentual:
 *   averagePct = (soma_grupo / soma_INCOME) × 100
 */
export async function calculateHubData(tenantId: string): Promise<HubData> {
  // O REGIME decide QUAIS tributos da compra são recuperáveis — e sem ele o Híbrido deduziria
  // ICMS, PIS/COFINS e IPI, que ali estão dentro do DAS e COMPÕEM o custo. Ver
  // `custo-produtos-no-dre.ts`. Ausente = trata como regime discriminado, o comportamento
  // de antes.
  const { data: cfgRegime } = await supabase
    .from('tenant_settings')
    .select('tax_regime')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const regimeDoTenant = (cfgRegime as { tax_regime?: string } | null)?.tax_regime ?? null

  const now = new Date()
  // Limite: último dia do mês ANTERIOR (exclui mês corrente para não distorcer médias de precificação).
  const lastDayDate = new Date(now.getFullYear(), now.getMonth(), 0)
  const endCutoffStr = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth() + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`

  // Busca todos os lançamentos até o último dia do mês anterior (exclui mês corrente)
  const { data: entries, error } = await supabase
    .from('cash_entries')
    .select('type, amount, due_date, expense_group, expense_category, is_active, paid_date, payment_method, valor_nf, valor_icms, valor_pis, valor_cofins, valor_ipi, valor_cbs, valor_ibs')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .lte('due_date', endCutoffStr)
    .order('due_date', { ascending: true })

  if (error || !entries || entries.length === 0) {
    return { months: [], rows: [], incomeByMonth: {}, totalIncome: 0, totalIncomeMonthsCount: 0 }
  }

  // Agrupa dados por mês (YYYY-MM)
  const incomeByMonth: HubMonthData = {}
  const expenseByGroupByMonth: Record<string, HubMonthData> = {}
  // { categoryKey -> { group, values: { monthKey -> total } } }
  const expenseByCategoryByMonth: Record<string, { group: string; values: HubMonthData }> = {}
  // O bloco Custo dos Produtos é montado DEPOIS do laço, a partir destes dois acumuladores:
  // o subtotal líquido é do GRUPO INTEIRO no mês, não de uma entrada.
  const custoProdutosBrutoPorMes: HubMonthData = {}
  const creditoDeCompraPorMes: HubMonthData = {}

  for (const entry of entries) {
    // Extrai YYYY-MM direto da string para evitar problema de timezone:
    // new Date('2026-02-01') é interpretado como UTC, que no Brasil (UTC-3)
    // vira 2026-01-31 no horário local, causando o mês errado.
    const monthKey = (entry.due_date as string).substring(0, 7) // 'YYYY-MM'
    const amount = Number(entry.amount) || 0

    if (entry.type === 'INCOME') {
      // Excluir BOLETO/CHEQUE pendentes (sem paid_date = não confirmados)
      if ((entry.payment_method === 'BOLETO' || entry.payment_method === 'CHEQUE_PRE_DATADO') && !entry.paid_date) continue
      incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + amount
    } else if (entry.type === 'EXPENSE' && entry.expense_group) {
      // Somente despesas confirmadas (paid_date preenchido)
      if (!entry.paid_date) continue

      // Breakdown LR/Simples Híbrido: detectado por qualquer coluna de imposto preenchida
      const hasLrBreakdown = entry.valor_icms != null || entry.valor_pis != null || entry.valor_cofins != null || entry.valor_ipi != null
        || entry.valor_cbs != null || entry.valor_ibs != null

      // >>> COMPROMISSO FINANCEIRO — §5 e §6 do comando de 21/09/2026 <<<
      //
      // O lançamento se decompõe em juros (despesa financeira de verdade) e principal (que
      // entra no preço), e o que era `AMORTIZACAO` passa a ser lido DENTRO de Despesa Fixa —
      // o §7 exige que a amortização apareça uma vez só, no bloco. O `expense_group` GRAVADO
      // não muda: quem muda de lugar é esta leitura. A Análise Financeira contábil
      // (`pages/dfc/`) lê `cash_entries` direto e segue pondo a amortização depois do
      // resultado operacional.
      //
      // A regra mora em `compromissos-financeiros.ts`, e é a MESMA que o rateio usa — o §5
      // pede uma implementação só, e ela é chamada das duas cópias deste laço.
      if (ehCompromissoFinanceiro(entry.expense_category as string)) {
        const partes = classificarLancamentoDeDespesa({
          expense_group: entry.expense_group as string,
          expense_category: entry.expense_category as string,
          amount,
          juros_value: (entry as { juros_value?: number | null }).juros_value,
          principal_value: (entry as { principal_value?: number | null }).principal_value,
        })
        for (const parte of partes) {
          if (!expenseByGroupByMonth[parte.group]) expenseByGroupByMonth[parte.group] = {}
          expenseByGroupByMonth[parte.group][monthKey] =
            (expenseByGroupByMonth[parte.group][monthKey] || 0) + parte.amount

          if (!expenseByCategoryByMonth[parte.category]) {
            expenseByCategoryByMonth[parte.category] = { group: parte.group, values: {} }
          }
          expenseByCategoryByMonth[parte.category].values[monthKey] =
            (expenseByCategoryByMonth[parte.category].values[monthKey] || 0) + parte.amount
        }
        continue
      }

      // Nível grupo: sempre usa o amount total
      if (!expenseByGroupByMonth[entry.expense_group]) {
        expenseByGroupByMonth[entry.expense_group] = {}
      }
      expenseByGroupByMonth[entry.expense_group][monthKey] =
        (expenseByGroupByMonth[entry.expense_group][monthKey] || 0) + amount

      // Nível categoria (detalhe dentro do grupo)
      if (entry.expense_category) {
        const catKey = entry.expense_category as string
        if (!expenseByCategoryByMonth[catKey]) {
          expenseByCategoryByMonth[catKey] = { group: entry.expense_group, values: {} }
        }

        const isCustoProdutos = entry.expense_group === GRUPO_CUSTO_PRODUTOS

        // A CATEGORIA CARREGA O BRUTO. Antes ela carregava `amount − impostos`, e a dedução
        // aparecia como seis sub-rows POSITIVAS dentro do custo — o §9 do comando de
        // 21/09/2026 tira a dedução de dentro do custo e a transforma em linha própria, com
        // subtotal. Ver `custo-produtos-no-dre.ts`.
        expenseByCategoryByMonth[catKey].values[monthKey] =
          (expenseByCategoryByMonth[catKey].values[monthKey] || 0) + amount

        if (isCustoProdutos) {
          custoProdutosBrutoPorMes[monthKey] = (custoProdutosBrutoPorMes[monthKey] || 0) + amount
          // A SOMA SAI DA FONTE ÚNICA. Ela estava escrita à mão aqui E em
          // `pages/dre/[year].tsx`, somando os seis `valor_*` dos dois lados —
          // `copia-divergente.md` literal. Agora acrescentar um tributo ao crédito vale para as
          // duas leituras, e é o REGIME que decide quais entram.
          if (hasLrBreakdown) {
            creditoDeCompraPorMes[monthKey] = (creditoDeCompraPorMes[monthKey] || 0)
              + creditoRecuperavelDaCompra({
                icms: entry.valor_icms, pis: entry.valor_pis, cofins: entry.valor_cofins,
                ipi: entry.valor_ipi, cbs: entry.valor_cbs, ibs: entry.valor_ibs,
              }, regimeDoTenant)
          }
        }
      }
    }
  }

  // Merge PIS + COFINS em linha única PIS/COFINS
  // Os DOIS blocos de apresentação, e eles não se cruzam: um vive em Custo dos Produtos, o
  // outro em Despesa Fixa. Nenhum dos dois toca `expenseByGroupByMonth`, que é de onde saem o
  // total do grupo e o "Total Despesas" — é essa separação que mantém o resultado do mês.
  acrescentaBlocoDeCustoDosProdutos(
    expenseByCategoryByMonth, custoProdutosBrutoPorMes, creditoDeCompraPorMes, regimeDoTenant,
  )
  acrescentaSubtotalDoBloco(expenseByCategoryByMonth)

  // Lista de meses ordenados que tiveram algum lançamento
  const allMonthsSet = new Set<string>([
    ...Object.keys(incomeByMonth),
    ...Object.values(expenseByGroupByMonth).flatMap((m) => Object.keys(m)),
  ])
  const months = Array.from(allMonthsSet).sort()

  // Soma total de INCOME nos meses encerrados
  const totalIncome = Object.values(incomeByMonth).reduce((s, v) => s + v, 0)
  const totalIncomeMonthsCount = Object.keys(incomeByMonth).length

  // Monta rows para cada grupo configurado
  const rows: HubRow[] = HUB_GROUPS
    .filter((g) => expenseByGroupByMonth[g.group]) // só grupos com dados
    .map((g) => {
      const values = expenseByGroupByMonth[g.group] || {}
      const totalSum = Object.values(values).reduce((s, v) => s + v, 0)
      const closedMonthsWithData = Object.values(values).filter((v) => v > 0).length
      const averageRS = closedMonthsWithData > 0 ? totalSum / closedMonthsWithData : 0
      const averagePct = totalIncome > 0 ? (totalSum / totalIncome) * 100 : 0

      // Sub-rows: categorias com dados dentro deste grupo, ordenadas por order
      const subRows: HubSubRow[] = Object.entries(expenseByCategoryByMonth)
        .filter(([, cd]) => cd.group === g.group)
        // DOIS blocos têm ordem PRÓPRIA, e uma categoria pertence no máximo a um deles: as
        // duas linhas do Custo dos Produtos e as seis dos Compromissos Financeiros. Sem isso
        // elas caem todas no `?? 999` e saem intercaladas com o aluguel e a energia.
        .sort(([a], [b]) => (
          (ordemDaLinhaDeApresentacao(a) ?? ordemNoBloco(a) ?? CATEGORY_ORDER_MAP[a] ?? 999)
          - (ordemDaLinhaDeApresentacao(b) ?? ordemNoBloco(b) ?? CATEGORY_ORDER_MAP[b] ?? 999)
        ))
        .map(([catKey, cd]) => {
          const catValues = cd.values
          const catTotalSum = Object.values(catValues).reduce((s, v) => s + v, 0)
          const catClosedMonths = Object.values(catValues).filter((v) => v > 0).length
          const catAverageRS = catClosedMonths > 0 ? catTotalSum / catClosedMonths : 0
          const catAveragePct = totalIncome > 0 ? (catTotalSum / totalIncome) * 100 : 0
          return {
            categoryKey: catKey,
            label: CATEGORY_LABEL_MAP[catKey] || LR_TAX_CATEGORY_LABELS[catKey] || catKey,
            values: catValues,
            totalSum: catTotalSum,
            closedMonthsWithData: catClosedMonths,
            averageRS: Math.round(catAverageRS * 100) / 100,
            averagePct: Math.round(catAveragePct * 100) / 100,
            // Os DOIS blocos marcam as suas linhas de apresentação: as duas do Custo dos
            // Produtos (dedução e líquido) e o subtotal dos Compromissos Financeiros. Nada
            // soma sub-rows hoje — o total do grupo vem de `expenseByGroupByMonth` —, e o
            // campo existe para que continue assim no próximo consumidor.
            apenasApresentacao: catKey === LABEL_DO_BLOCO || ehLinhaDeApresentacao(catKey),
          }
        })

      return {
        group: g.group,
        label: g.label,
        values,
        totalSum,
        closedMonthsWithData,
        averageRS: Math.round(averageRS * 100) / 100,
        averagePct: Math.round(averagePct * 100) / 100,
        subRows,
      }
    })

  return { months, rows, incomeByMonth, totalIncome, totalIncomeMonthsCount }
}

/**
 * Calcula os dados do Hub baseando-se APENAS no mês anterior ao mês atual.
 * "Mês anterior" = mês imediatamente antes do mês corrente.
 *
 * Exemplo: se estamos em março/2026, busca apenas fevereiro/2026.
 *
 * Use esta função para recalcular percentuais automáticos de estrutura,
 * mantendo a base sempre no mês mais recente e completo.
 */
export async function calculateHubDataPrevMonth(tenantId: string): Promise<HubData> {
  // O REGIME decide QUAIS tributos da compra são recuperáveis — e sem ele o Híbrido deduziria
  // ICMS, PIS/COFINS e IPI, que ali estão dentro do DAS e COMPÕEM o custo. Ver
  // `custo-produtos-no-dre.ts`. Ausente = trata como regime discriminado, o comportamento
  // de antes.
  const { data: cfgRegime } = await supabase
    .from('tenant_settings')
    .select('tax_regime')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const regimeDoTenant = (cfgRegime as { tax_regime?: string } | null)?.tax_regime ?? null

  const now = new Date()
  // Cutoff: primeiro dia do mês atual (excluir mês em andamento)
  const cutoffStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  // Início do mês anterior: primeiro dia do mês anterior ao cutoff
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`

  // Busca lançamentos apenas do mês anterior (>= início mês anterior e < início mês atual)
  const { data: entries, error } = await supabase
    .from('cash_entries')
    .select('type, amount, due_date, expense_group, expense_category, is_active, valor_nf, valor_icms, valor_pis, valor_cofins, valor_ipi, valor_cbs, valor_ibs')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .gte('due_date', prevMonthStr)
    .lt('due_date', cutoffStr)
    .order('due_date', { ascending: true })

  if (error || !entries || entries.length === 0) {
    return { months: [], rows: [], incomeByMonth: {}, totalIncome: 0, totalIncomeMonthsCount: 0 }
  }

  // Agrupa dados por mês (YYYY-MM)
  const incomeByMonth: HubMonthData = {}
  const expenseByGroupByMonth: Record<string, HubMonthData> = {}
  const expenseByCategoryByMonth: Record<string, { group: string; values: HubMonthData }> = {}
  // O bloco Custo dos Produtos é montado DEPOIS do laço, a partir destes dois acumuladores:
  // o subtotal líquido é do GRUPO INTEIRO no mês, não de uma entrada.
  const custoProdutosBrutoPorMes: HubMonthData = {}
  const creditoDeCompraPorMes: HubMonthData = {}

  for (const entry of entries) {
    const monthKey = (entry.due_date as string).substring(0, 7) // 'YYYY-MM'
    const amount = Number(entry.amount) || 0

    if (entry.type === 'INCOME') {
      incomeByMonth[monthKey] = (incomeByMonth[monthKey] || 0) + amount
    } else if (entry.type === 'EXPENSE' && entry.expense_group) {
      const hasLrBreakdown = entry.valor_icms != null || entry.valor_pis != null || entry.valor_cofins != null || entry.valor_ipi != null
        || entry.valor_cbs != null || entry.valor_ibs != null

      // >>> COMPROMISSO FINANCEIRO — §5 e §6 do comando de 21/09/2026 <<<
      //
      // O lançamento se decompõe em juros (despesa financeira de verdade) e principal (que
      // entra no preço), e o que era `AMORTIZACAO` passa a ser lido DENTRO de Despesa Fixa —
      // o §7 exige que a amortização apareça uma vez só, no bloco. O `expense_group` GRAVADO
      // não muda: quem muda de lugar é esta leitura. A Análise Financeira contábil
      // (`pages/dfc/`) lê `cash_entries` direto e segue pondo a amortização depois do
      // resultado operacional.
      //
      // A regra mora em `compromissos-financeiros.ts`, e é a MESMA que o rateio usa — o §5
      // pede uma implementação só, e ela é chamada das duas cópias deste laço.
      if (ehCompromissoFinanceiro(entry.expense_category as string)) {
        const partes = classificarLancamentoDeDespesa({
          expense_group: entry.expense_group as string,
          expense_category: entry.expense_category as string,
          amount,
          juros_value: (entry as { juros_value?: number | null }).juros_value,
          principal_value: (entry as { principal_value?: number | null }).principal_value,
        })
        for (const parte of partes) {
          if (!expenseByGroupByMonth[parte.group]) expenseByGroupByMonth[parte.group] = {}
          expenseByGroupByMonth[parte.group][monthKey] =
            (expenseByGroupByMonth[parte.group][monthKey] || 0) + parte.amount

          if (!expenseByCategoryByMonth[parte.category]) {
            expenseByCategoryByMonth[parte.category] = { group: parte.group, values: {} }
          }
          expenseByCategoryByMonth[parte.category].values[monthKey] =
            (expenseByCategoryByMonth[parte.category].values[monthKey] || 0) + parte.amount
        }
        continue
      }

      // Nível grupo: sempre usa o amount total
      if (!expenseByGroupByMonth[entry.expense_group]) {
        expenseByGroupByMonth[entry.expense_group] = {}
      }
      expenseByGroupByMonth[entry.expense_group][monthKey] =
        (expenseByGroupByMonth[entry.expense_group][monthKey] || 0) + amount

      if (entry.expense_category) {
        const catKey = entry.expense_category as string
        if (!expenseByCategoryByMonth[catKey]) {
          expenseByCategoryByMonth[catKey] = { group: entry.expense_group, values: {} }
        }

        const isCustoProdutos = entry.expense_group === GRUPO_CUSTO_PRODUTOS

        // A CATEGORIA CARREGA O BRUTO. Antes ela carregava `amount − impostos`, e a dedução
        // aparecia como seis sub-rows POSITIVAS dentro do custo — o §9 do comando de
        // 21/09/2026 tira a dedução de dentro do custo e a transforma em linha própria, com
        // subtotal. Ver `custo-produtos-no-dre.ts`.
        expenseByCategoryByMonth[catKey].values[monthKey] =
          (expenseByCategoryByMonth[catKey].values[monthKey] || 0) + amount

        if (isCustoProdutos) {
          custoProdutosBrutoPorMes[monthKey] = (custoProdutosBrutoPorMes[monthKey] || 0) + amount
          // A SOMA SAI DA FONTE ÚNICA. Ela estava escrita à mão aqui E em
          // `pages/dre/[year].tsx`, somando os seis `valor_*` dos dois lados —
          // `copia-divergente.md` literal. Agora acrescentar um tributo ao crédito vale para as
          // duas leituras, e é o REGIME que decide quais entram.
          if (hasLrBreakdown) {
            creditoDeCompraPorMes[monthKey] = (creditoDeCompraPorMes[monthKey] || 0)
              + creditoRecuperavelDaCompra({
                icms: entry.valor_icms, pis: entry.valor_pis, cofins: entry.valor_cofins,
                ipi: entry.valor_ipi, cbs: entry.valor_cbs, ibs: entry.valor_ibs,
              }, regimeDoTenant)
          }
        }
      }
    }
  }

  // Os DOIS blocos de apresentação, e eles não se cruzam: um vive em Custo dos Produtos, o
  // outro em Despesa Fixa. Nenhum dos dois toca `expenseByGroupByMonth`, que é de onde saem o
  // total do grupo e o "Total Despesas" — é essa separação que mantém o resultado do mês.
  acrescentaBlocoDeCustoDosProdutos(
    expenseByCategoryByMonth, custoProdutosBrutoPorMes, creditoDeCompraPorMes, regimeDoTenant,
  )
  acrescentaSubtotalDoBloco(expenseByCategoryByMonth)

  const allMonthsSet = new Set<string>([
    ...Object.keys(incomeByMonth),
    ...Object.values(expenseByGroupByMonth).flatMap((m) => Object.keys(m)),
  ])
  const months = Array.from(allMonthsSet).sort()

  const totalIncome = Object.values(incomeByMonth).reduce((s, v) => s + v, 0)
  const totalIncomeMonthsCount = Object.keys(incomeByMonth).length

  const rows: HubRow[] = HUB_GROUPS
    .filter((g) => expenseByGroupByMonth[g.group])
    .map((g) => {
      const values = expenseByGroupByMonth[g.group] || {}
      const totalSum = Object.values(values).reduce((s, v) => s + v, 0)
      const closedMonthsWithData = Object.values(values).filter((v) => v > 0).length
      const averageRS = closedMonthsWithData > 0 ? totalSum / closedMonthsWithData : 0
      const averagePct = totalIncome > 0 ? (totalSum / totalIncome) * 100 : 0

      const subRows: HubSubRow[] = Object.entries(expenseByCategoryByMonth)
        .filter(([, cd]) => cd.group === g.group)
        // DOIS blocos têm ordem PRÓPRIA, e uma categoria pertence no máximo a um deles: as
        // duas linhas do Custo dos Produtos e as seis dos Compromissos Financeiros. Sem isso
        // elas caem todas no `?? 999` e saem intercaladas com o aluguel e a energia.
        .sort(([a], [b]) => (
          (ordemDaLinhaDeApresentacao(a) ?? ordemNoBloco(a) ?? CATEGORY_ORDER_MAP[a] ?? 999)
          - (ordemDaLinhaDeApresentacao(b) ?? ordemNoBloco(b) ?? CATEGORY_ORDER_MAP[b] ?? 999)
        ))
        .map(([catKey, cd]) => {
          const catValues = cd.values
          const catTotalSum = Object.values(catValues).reduce((s, v) => s + v, 0)
          const catClosedMonths = Object.values(catValues).filter((v) => v > 0).length
          const catAverageRS = catClosedMonths > 0 ? catTotalSum / catClosedMonths : 0
          const catAveragePct = totalIncome > 0 ? (catTotalSum / totalIncome) * 100 : 0
          return {
            categoryKey: catKey,
            label: CATEGORY_LABEL_MAP[catKey] || LR_TAX_CATEGORY_LABELS[catKey] || catKey,
            values: catValues,
            totalSum: catTotalSum,
            closedMonthsWithData: catClosedMonths,
            averageRS: Math.round(catAverageRS * 100) / 100,
            averagePct: Math.round(catAveragePct * 100) / 100,
            // Os DOIS blocos marcam as suas linhas de apresentação: as duas do Custo dos
            // Produtos (dedução e líquido) e o subtotal dos Compromissos Financeiros. Nada
            // soma sub-rows hoje — o total do grupo vem de `expenseByGroupByMonth` —, e o
            // campo existe para que continue assim no próximo consumidor.
            apenasApresentacao: catKey === LABEL_DO_BLOCO || ehLinhaDeApresentacao(catKey),
          }
        })

      return {
        group: g.group,
        label: g.label,
        values,
        totalSum,
        closedMonthsWithData,
        averageRS: Math.round(averageRS * 100) / 100,
        averagePct: Math.round(averagePct * 100) / 100,
        subRows,
      }
    })

  return { months, rows, incomeByMonth, totalIncome, totalIncomeMonthsCount }
}

/**
 * Extrai os percentuais de estrutura do Hub para alimentar tenant_expense_config.
 * Retorna os percentuais em DECIMAL 0-1 (ex: 0.1049 = 10,49%).
 *
 * @param customBase - Denominador alternativo (ex: receitaBrutaBase para LR/Híbrido).
 *   Se não informado, usa totalIncome (comportamento padrão).
 * @param segment - Segmentação do tenant (`tenant_settings.calc_type`). Em REVENDA a MO
 *   PRODUTIVA é AGRUPADA na mão de obra indireta e devolvida zerada — ver nota abaixo.
 *   Fora de REVENDA (e quando não informada) o retorno é BIT-EXACT ao anterior.
 */
export function extractStructurePercents(
  hubData: HubData,
  customBase?: number,
  segment?: 'INDUSTRIALIZACAO' | 'REVENDA' | 'SERVICO' | null,
): {
  indirect_labor_percent: number
  fixed_expense_percent: number
  variable_expense_percent: number
  financial_expense_percent: number
  production_labor_cost_percent: number
  /** IPD — Impostos POR DENTRO (IMPOSTO_FATURAMENTO_DENTRO + REGIME_TRIBUTARIO). Entra na MC. */
  tax_on_revenue_percent: number
  /** IPF — Impostos POR FORA (grupo IMPOSTO). Deduzem da RB para formar ROB. NÃO entra na MC. */
  external_taxes_percent: number
  /** AT — Atividades Operacionais de Entrega (grupo ATIVIDADES_TERCEIRIZADAS). Entra na MC. */
  outsourced_activities_percent: number
  /** DEDUCAO_RECEITA — devoluções, estornos, abatimentos. Deduzem da RB para formar ROB. */
  deducao_receita_percent: number
  /** Grupo COMISSOES do HUB. Entra na MC. */
  commission_percent_hub: number
} {
  const base = customBase != null && customBase > 0 ? customBase : null

  const findPct = (group: string) => {
    const row = hubData.rows.find((r) => r.group === group)
    if (!row) return 0
    if (base != null) {
      // Usa base customizada como denominador (ex: Receita Bruta para LR/Híbrido)
      return row.totalSum / base
    }
    return row.averagePct / 100 // converte % para decimal (usa totalIncome como base)
  }

  // MO Administrativa/Indireta (grupos que vão para o coeficiente).
  //
  // REVENDA: não existe mão de obra PRODUTIVA — quem revende não produz. A tela de
  // precificação já zera a MO produtiva nesse segmento (content.component.tsx:715,
  // `laborCostMonthly`/`productWorkloadMinutes` = 0 quando o calcType efetivo é REVENDA),
  // mas zerava SEM REALOCAR. Como a cascata do Motor RRO só tem QUATRO baldes de despesa
  // (MO indireta, fixa, variável, financeira), o custo lançado no Hub como MO produtiva
  // simplesmente SUMIA — não aparecia na precificação nem na cascata. Aqui ele é agrupado
  // na MO indireta, que é justamente o balde que sobrevive em REVENDA.
  //
  // Fora de REVENDA (INDUSTRIALIZACAO, SERVICO ou segmento não informado) a expressão é
  // literalmente a de antes: nada é somado e a MO produtiva volta pelo seu próprio campo.
  const isRevenda = segment === 'REVENDA'
  const moProdutiva = findPct('MAO_DE_OBRA_PRODUTIVA')
  const moAdminBase = findPct('MAO_DE_OBRA_ADMINISTRATIVA') + findPct('MAO_DE_OBRA')
  const moAdmin = isRevenda ? moAdminBase + moProdutiva : moAdminBase

  // IPD — Impostos POR DENTRO (entram na MC).
  // IMPOSTO_FATURAMENTO_DENTRO = ICMS próprio, PIS, COFINS, ISS operacional, FCP_ICMS_PROPRIO.
  // REGIME_TRIBUTARIO = DAS do Simples Nacional (alíquota efetiva consolidada).
  const taxesInside = findPct('IMPOSTO_FATURAMENTO_DENTRO') + findPct('REGIME_TRIBUTARIO')

  // IPF — Impostos POR FORA (deduzem da RB, NÃO entram na MC).
  // Grupo IMPOSTO inclui CBS, IBS, ICMS-ST, DIFAL, IPI destacado, ISS retido, FCP-ST, PIS/COFINS Monofásico.
  const taxesOutside = findPct('IMPOSTO')

  // AT — Atividades Operacionais de Entrega (entra na MC como variável).
  const outsourcedActivities = findPct('ATIVIDADES_TERCEIRIZADAS')

  // DEDUCAO_RECEITA (deduz da RB para formar ROB; NÃO entra na MC).
  const deducaoReceita = findPct('DEDUCAO_RECEITA')

  const commissionsHub = findPct('COMISSOES')

  return {
    indirect_labor_percent: Math.round(moAdmin * 10000) / 10000,
      // >>> A BASE DA DESPESA FIXA INCLUI OS COMPROMISSOS FINANCEIROS — §5 do comando <<<
    //
    // Parcela de financiamento, empréstimo, consórcio e amortização de principal VENCEM MESMO
    // SEM VENDA. O preço tem de cobri-las, e até aqui a amortização ficava de fora: o grupo
    // `AMORTIZACAO` existe desde 09/09/2026 e nunca entrou no rateio.
    //
    // Somar o GRUPO inteiro é correto porque TODAS as categorias de `AMORTIZACAO` são do
    // bloco — há caso afirmando isso, e ele fica vermelho no dia em que alguém criar uma que
    // não seja. As outras quatro categorias do bloco já são `DESPESA_FIXA`.
    //
    // A soma é IDEMPOTENTE de propósito: `calculateHubData` dobra a amortização dentro de
    // `DESPESA_FIXA` para a tela, e aí `findPct('AMORTIZACAO')` devolve zero. Um `HubData` com
    // os dois grupos separados e um já dobrado dão o MESMO número.
    //
    // `INVESTIMENTO` NUNCA entra: ele só acontece se sobrar dinheiro, e sai do lucro.
    fixed_expense_percent:
      Math.round(GRUPOS_DA_BASE_DA_DESPESA_FIXA.reduce((acc, g) => acc + findPct(g), 0) * 10000) / 10000,
    variable_expense_percent: Math.round(findPct('DESPESA_VARIAVEL') * 10000) / 10000,
    financial_expense_percent: Math.round(findPct('DESPESA_FINANCEIRA') * 10000) / 10000,
    // REVENDA: já contabilizada dentro de `indirect_labor_percent` — devolver aqui de novo
    // seria dupla contagem.
    production_labor_cost_percent: isRevenda ? 0 : Math.round(moProdutiva * 10000) / 10000,
    tax_on_revenue_percent: Math.round(taxesInside * 10000) / 10000,
    external_taxes_percent: Math.round(taxesOutside * 10000) / 10000,
    outsourced_activities_percent: Math.round(outsourcedActivities * 10000) / 10000,
    deducao_receita_percent: Math.round(deducaoReceita * 10000) / 10000,
    commission_percent_hub: Math.round(commissionsHub * 10000) / 10000,
  }
}
