/**
 * Motor de Reapuração de Margem (MRM) — Orchestrator
 *
 * Camada entre a UI e o motor puro. Responsabilidades:
 *   1. Carregar alíquotas vigentes via mrm-rates-loader (quando necessário)
 *   2. Aplicar regra de snapshot (D2): se existir tax_breakdown válido com
 *      use_snapshot_rates=true, reaproveitar alíquotas dele; caso contrário,
 *      buscar do servidor com data efetiva.
 *   3. Resolver `peso_op_interna` via markup divisor da config do produto
 *      (Story MRM-V5-001 AC9) — ADR-004 preserva motor puro.
 *   4. Chamar o motor puro `calculateMarginReapuration`
 *   5. Retornar TaxBreakdown pronto para persistir em *_items.tax_breakdown
 *
 * Snapshot decision tree (D2):
 *   - prev_breakdown EXISTS && prev.use_snapshot_rates === true
 *       → reusa prev.taxes_inside + prev.taxes_outside como rates (alíquota
 *         preservada na criação do orçamento)
 *   - prev_breakdown NULL OR prev.use_snapshot_rates === false
 *       → busca alíquotas atuais via /api/tax-periods
 *
 * Peso Op Interna resolution (Story MRM-V5-001 AC9):
 *   Ordem de prioridade (3 fontes):
 *     1. Input explícito (`input.peso_op_interna`) — sobrescreve qualquer outra fonte
 *     2. Snapshot histórico (`options.prev_breakdown.peso_op_interna`) — ADR-003 imutabilidade
 *     3. Cálculo via markup divisor (`options.product_config`) — Excel I21
 *     4. Default conservador `1` — motor degrada para comportamento V4
 *
 * Edge function calc-tax-engine: NÃO consumida aqui (D3 consolidado no cliente).
 * A edge continua servindo precificação inicial (products/items), fora do escopo MRM.
 */

import { calculateMarginReapuration } from './margin-reapuration'
import { loadTaxRates } from './mrm-rates-loader'
import { runShadowComparison, type ShadowContext } from './mrm-shadow'
import type { ReapurationInput, TaxBreakdown, TaxRatePeriod, TaxType } from '@/types/mrm'

/**
 * Configuração de precificação original do produto/serviço — usada pelo orchestrator
 * para calcular `peso_op_interna` via markup divisor (Excel cenário canônico H21+H26).
 *
 * Não é input do motor puro (ADR-004). Apenas o orchestrator consome essa estrutura
 * para derivar o peso e injetá-lo como `ReapurationInput.peso_op_interna`.
 *
 * Story MRM-V5-001 AC9.
 */
export interface ProductPricingConfig {
  /** Custo unitário do produto (R$). Excel H4 = 53.509,92. */
  cost: number
  /**
   * Soma dos percentuais internos (decimal). Inclui:
   *   - Componentes distribuíveis: comissão + lucro + IRPJ + CSLL
   *   - Despesas: MO administrativa + despesa fixa + variável + financeira
   *   - Impostos por dentro: ICMS + ISS + PIS/COFINS
   * Excel C19 = SUM(C6:C17) = 0,697775 no cenário canônico.
   */
  internal_percentuals_sum: number
  /**
   * Soma das alíquotas tributárias por dentro (decimal): ICMS + ISS + PIS/COFINS.
   * Usada para calcular base reduzida dos tributos por fora (= Op_Interna − ICMS − PIS/COFINS).
   */
  internal_tax_rates_sum: number
  /**
   * Soma das alíquotas tributárias por fora (decimal): IBS + CBS + IPI + ICMS-ST + DIFAL + FCP.
   * Excel C23 + C24 = 1% + 8,75% = 0,0975 no cenário canônico.
   */
  external_tax_rates_sum: number
}

export interface OrchestrateOptions {
  /** Quando true, reaproveita alíquotas do prev_breakdown (snapshot mode D2). */
  use_snapshot_rates: boolean
  /** TaxBreakdown anterior do item, quando existir (edição). */
  prev_breakdown?: TaxBreakdown | null
  /** Data efetiva para buscar alíquotas (default: hoje). */
  effective_date?: string
  /**
   * Story MRM-V2-S3.1: contexto opcional para shadow-mode (tenant_id,
   * document_id, document_type). Quando ausente, shadow ainda roda mas
   * sem rastreabilidade — útil para chamadas internas/testes.
   */
  shadow_context?: ShadowContext
  /**
   * Story MRM-V5-001 AC9: configuração de precificação original do produto.
   * Quando presente e snapshot ausente, orchestrator calcula `peso_op_interna`
   * via markup divisor. Quando ausente, motor usa default 1.
   */
  product_config?: ProductPricingConfig
}

export type OrchestrateInput = Omit<ReapurationInput, 'rates' | 'effective_date' | 'use_snapshot_rates'> & {
  options: OrchestrateOptions
}

/**
 * Calcula `peso_op_interna` via markup divisor da configuração do produto.
 *
 * Fórmula (Excel cenário canônico):
 *   Op_Interna_Original = custo / (1 − Σ percentuais_internos)   ← Excel H21
 *   base_externa         = Op_Interna × (1 − ICMS − PIS/COFINS)
 *   Op_Externa_Original  = base_externa × Σ alíquotas_externas    ← Excel H26
 *   peso_op_interna      = Op_Interna / (Op_Interna + Op_Externa) ← Excel I21
 *
 * Retorna 1 (default conservador) quando configuração é inválida ou degenerada.
 *
 * Story MRM-V5-001 AC2.
 */
export function calculatePesoOpInternaFromMarkup(config: ProductPricingConfig): number {
  const { cost, internal_percentuals_sum, internal_tax_rates_sum, external_tax_rates_sum } = config

  // Guard 1: configuração tributária inválida (Σ% internos ≥ 1 → denominador não-positivo)
  const denom = 1 - internal_percentuals_sum
  if (denom <= 0 || cost <= 0) return 1

  // Op Interna original (markup divisor) — Excel H21
  const op_interna_original = cost / denom

  // Op Externa original — Excel H26 (tributos por fora sobre base reduzida)
  const base_externa = op_interna_original * (1 - internal_tax_rates_sum)
  const op_externa_original = base_externa > 0 ? base_externa * external_tax_rates_sum : 0

  // Peso = Op_Interna / (Op_Interna + Op_Externa) — Excel I21
  const total = op_interna_original + op_externa_original
  if (total <= 0) return 1

  const peso = op_interna_original / total
  // Clamp defensivo [0, 1] para garantir invariante
  return Math.max(0, Math.min(1, peso))
}

/**
 * Resolve `peso_op_interna` para o motor RR conforme 3 fontes de prioridade.
 *
 * Ordem (Story MRM-V5-001 AC9):
 *   1. Input explícito (`peso_op_interna_input`) — sobrescreve outras fontes
 *   2. Snapshot histórico (`prev_breakdown.peso_op_interna`) — ADR-003 imutabilidade
 *   3. Markup divisor da configuração do produto — Excel I21
 *   4. Default conservador `1` — motor degrada para comportamento V4
 *
 * Esta função vive no orchestrator (não no motor puro) porque envolve cálculo
 * derivado de dados externos ao input do motor — ADR-004.
 */
export function resolvePesoOpInterna(args: {
  peso_op_interna_input?: number
  prev_breakdown?: TaxBreakdown | null
  product_config?: ProductPricingConfig
}): number {
  // Fonte 1: input explícito (e.g. caller pré-calculado)
  if (args.peso_op_interna_input != null && Number.isFinite(args.peso_op_interna_input)) {
    return Math.max(0, Math.min(1, args.peso_op_interna_input))
  }
  // Fonte 2: snapshot histórico (ADR-003)
  const snapshot_peso = args.prev_breakdown?.peso_op_interna
  if (snapshot_peso != null && Number.isFinite(snapshot_peso)) {
    return Math.max(0, Math.min(1, snapshot_peso))
  }
  // Fonte 3: cálculo via markup divisor
  if (args.product_config) {
    return calculatePesoOpInternaFromMarkup(args.product_config)
  }
  // Fonte 4: default conservador (motor V4 equivalente)
  return 1
}

/**
 * Extrai alíquotas de um TaxBreakdown anterior (snapshot reuse).
 * Reconstitui apenas o necessário: tax_type + rate_pct.
 * tenant_id e demais campos são placeholders — o motor só lê rate_pct e tax_type.
 */
function snapshotToRates(prev: TaxBreakdown): TaxRatePeriod[] {
  const allLines = [...prev.taxes_inside, ...prev.taxes_outside]
  return allLines.map((line): TaxRatePeriod => ({
    id: `snapshot-${line.type}`,
    tenant_id: 'snapshot',
    tax_type: line.type as TaxType,
    origin_state: null,
    dest_state: null,
    rate_pct: line.rate_pct,
    valid_from: prev.effective_date,
    valid_until: null,
    notes: 'reconstructed from prev snapshot',
  }))
}

export async function orchestrateReapuration(input: OrchestrateInput): Promise<TaxBreakdown> {
  const { options, ...rest } = input
  const effective_date = options.effective_date ?? new Date().toISOString().slice(0, 10)

  let rates: TaxRatePeriod[]
  if (options.use_snapshot_rates && options.prev_breakdown && options.prev_breakdown.valid) {
    rates = snapshotToRates(options.prev_breakdown)
  } else {
    rates = await loadTaxRates({ date: effective_date })
  }

  // Story MRM-V5-001 AC9: resolver peso_op_interna via 3 fontes de prioridade
  const peso_op_interna = resolvePesoOpInterna({
    peso_op_interna_input: rest.peso_op_interna,
    prev_breakdown: options.prev_breakdown,
    product_config: options.product_config,
  })

  const motorInput: ReapurationInput = {
    ...rest,
    peso_op_interna,
    rates,
    effective_date,
    use_snapshot_rates: options.use_snapshot_rates,
  }
  const result = calculateMarginReapuration(motorInput)

  // Story MRM-V2-S3.1: fire-and-forget shadow comparison (ADR-001).
  void runShadowComparison(motorInput, result, options.shadow_context)

  return result
}

/**
 * Versão síncrona quando o caller já tem as alíquotas (e.g. SWR pré-carregou).
 * Útil em React render-pure paths para evitar Suspense.
 */
export function orchestrateReapurationSync(
  input: OrchestrateInput & { rates: TaxRatePeriod[] }
): TaxBreakdown {
  const { options, rates, ...rest } = input
  const effective_date = options.effective_date ?? new Date().toISOString().slice(0, 10)

  const finalRates =
    options.use_snapshot_rates && options.prev_breakdown && options.prev_breakdown.valid
      ? snapshotToRates(options.prev_breakdown)
      : rates

  // Story MRM-V5-001 AC9: resolver peso_op_interna via 3 fontes de prioridade
  const peso_op_interna = resolvePesoOpInterna({
    peso_op_interna_input: rest.peso_op_interna,
    prev_breakdown: options.prev_breakdown,
    product_config: options.product_config,
  })

  const motorInput: ReapurationInput = {
    ...rest,
    peso_op_interna,
    rates: finalRates,
    effective_date,
    use_snapshot_rates: options.use_snapshot_rates,
  }
  const result = calculateMarginReapuration(motorInput)

  // Story MRM-V2-S3.1: fire-and-forget shadow comparison (ADR-001).
  void runShadowComparison(motorInput, result, options.shadow_context)

  return result
}
