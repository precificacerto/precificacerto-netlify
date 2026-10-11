import { DreListItem } from '@/shared/enums/dre-year-base'
import type { TaxPreviewBreakdown } from '@/utils/calc-tax-preview'

/**
 * Simplified calc base for the pricing engine (V2).
 * All percentages are display values (0-100) to match tenant_expense_config storage.
 * The pricing-engine expects decimals 0-1; the UI layer converts before calling it.
 */
export interface CalcBaseType {
  /** Monthly labor cost in R$ (production_labor_cost). */
  laborCostMonthly: number
  /**
   * MO ADMINISTRATIVA em R$/mês — `admin_salary_total + admin_fgts_total + admin_other_costs`.
   *
   * OBRIGATÓRIO, e não opcional com default, porque participa do RESULTADO NUMÉRICO: no
   * segmento SERVIÇO ele entra no custo por minuto. `construtor-empobrecido.md` — "campo
   * opcional com default neutro num contrato de cálculo é um defeito à espera de produtor", e
   * o custo de torná-lo obrigatório é exatamente o benefício: o compilador enumera quem não o
   * preenche.
   *
   * Acrescentado em 11/10/2026: a tela de produto tirava a administrativa e a fixa do divisor
   * (segmento SERVIÇO) e NÃO as somava ao custo, porque não tinha de onde ler os valores
   * mensais — `calcBase` só carregava os PERCENTUAIS. As duas desapareciam do preço.
   */
  adminLaborCostMonthly: number
  /** DESPESA FIXA em R$/mês — `fixed_expense_monthly`. Obrigatório pela mesma razão. */
  fixedExpenseMonthly: number
  /** Labor as % of revenue — used by REVENDA (included in structurePct). */
  laborPercent: number
  /**
   * Sum of fixed + variable + financial expenses + CAPITAL COMMITMENT (display %, 0-100).
   * IndirectLabor is separate. O compromisso entra aqui porque saiu de `fixedExpensePct` — a
   * soma é a de antes de 02/10/2026, e é ela que mantém o preço idêntico.
   */
  structurePct: number
  /** Individual breakdowns kept for display in product-price table. */
  indirectLaborPct: number
  fixedExpensePct: number
  /**
   * COMPROMISSOS FINANCEIROS em % do faturamento — §0 do comando de 02/10/2026.
   *
   * OBRIGATÓRIO por `construtor-empobrecido.md`: é campo de CÁLCULO (ele entra em
   * `structurePct`), e opcional com default neutro seria um defeito à espera de produtor — um
   * segundo construtor que o esquecesse faria o preço CAIR sem nada falhar. Obrigatório, o
   * compilador enumera quem esquecer.
   */
  financialCommitmentsPct: number
  variableExpensePct: number
  financialExpensePct: number
  /** Single effective tax rate (display %, 0-100). */
  taxPct: number
  /**
   * Tributos POR DENTRO discriminados (Parte 0 + R5), em DECIMAL. Presente só nos regimes
   * cuja matriz está escrita — hoje, Lucro Real. Ausente = sem matriz, nunca alíquota zero.
   */
  taxBreakdown?: TaxPreviewBreakdown
  /**
   * SIMPLES HÍBRIDO — a dedução da base de IBS/CBS (LC 214 art. 12 §2º V), DECIMAL.
   *
   * `undefined` nos demais regimes. Ela viaja ao lado de `taxPct` (que ali é o DAS
   * reduzido) porque os dois saem da mesma faixa do mesmo anexo, e separá-los em duas
   * travessias é como as duas metades passam a divergir.
   */
  deducaoBaseIbsCbsPct?: number
  /** Human-readable tax regime label. */
  taxLabel: string
  isMei: boolean
  /** Productive labor value per minute (R$/min) from tenant_expense_config. */
  productiveValuePerMinute: number

  // -------------------------------------------------------------------------
  // New fields for pricing-engine V2 (Fase 1 interface)
  // -------------------------------------------------------------------------
  /**
   * Total productive minutes available per month (company-wide).
   * = totalEmployees × hoursPerMonth × 60
   * Populated by callers (content.component) from currentUser data.
   * buildCalcBase defaults to 0; override in component before calling calculatePricing.
   */
  monthlyWorkloadMinutes: number
  /**
   * Number of productive employees.
   * Populated by callers from currentUser data.
   * buildCalcBase defaults to 1.
   */
  numProductiveEmployees: number

  // -------------------------------------------------------------------------
  // Legacy fields — kept for backward compat during migration (PR 3).
  // These will be removed once all consumers are updated.
  // -------------------------------------------------------------------------
  /** @deprecated Use laborCostMonthly */
  productionLaborCostAveragePrice: number
  /** @deprecated Use indirectLaborPct */
  indirectLaborExpensePercent: number
  /** @deprecated Use fixedExpensePct */
  fixedExpensePercent: number
  /** @deprecated Use variableExpensePct */
  variableExpensePercent: number
  /** @deprecated Use financialExpensePct */
  financialExpensePercent: number
  /** @deprecated Use taxPct */
  taxesPercent: number
  /** @deprecated Use laborPercent */
  productionLaborCostAveragePercent: number
  /** @deprecated Use laborCostMonthly */
  productionLaborCostPricePlusPercentIndirectLaborExpensePrice: number
  /** @deprecated Not used in pricing-engine V2 */
  profitBasePercent: number
  /** @deprecated Not used in pricing-engine V2 */
  dre: DreListItem[]
  /** @deprecated Not used in pricing-engine V2 */
  yearIncomeAverage: number
  /** @deprecated Not used in pricing-engine V2 */
  productCostPercent: number
  /** @deprecated Not used in pricing-engine V2 */
  sumIncomeYearAverageByCategory: number
  /** @deprecated Use taxPct (unified) */
  taxableRegimeAutoPercent?: number
  /** @deprecated Use taxLabel */
  regimeLabel?: string
}
