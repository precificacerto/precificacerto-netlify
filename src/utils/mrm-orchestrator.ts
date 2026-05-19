/**
 * Motor de Reapuração de Margem (MRM) — Orchestrator
 *
 * Camada entre a UI e o motor puro. Responsabilidades:
 *   1. Carregar alíquotas vigentes via mrm-rates-loader (quando necessário)
 *   2. Aplicar regra de snapshot (D2): se existir tax_breakdown válido com
 *      use_snapshot_rates=true, reaproveitar alíquotas dele; caso contrário,
 *      buscar do servidor com data efetiva.
 *   3. Chamar o motor puro `calculateMarginReapuration`
 *   4. Retornar TaxBreakdown pronto para persistir em *_items.tax_breakdown
 *
 * Snapshot decision tree (D2):
 *   - prev_breakdown EXISTS && prev.use_snapshot_rates === true
 *       → reusa prev.taxes_inside + prev.taxes_outside como rates (alíquota
 *         preservada na criação do orçamento)
 *   - prev_breakdown NULL OR prev.use_snapshot_rates === false
 *       → busca alíquotas atuais via /api/tax-periods
 *
 * Edge function calc-tax-engine: NÃO consumida aqui (D3 consolidado no cliente).
 * A edge continua servindo precificação inicial (products/items), fora do escopo MRM.
 */

import { calculateMarginReapuration } from './margin-reapuration'
import { loadTaxRates } from './mrm-rates-loader'
import { runShadowComparison, type ShadowContext } from './mrm-shadow'
import type { ReapurationInput, TaxBreakdown, TaxRatePeriod, TaxType } from '@/types/mrm'

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
}

export type OrchestrateInput = Omit<ReapurationInput, 'rates' | 'effective_date' | 'use_snapshot_rates'> & {
  options: OrchestrateOptions
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

  const motorInput: ReapurationInput = {
    ...rest,
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

  const motorInput: ReapurationInput = {
    ...rest,
    rates: finalRates,
    effective_date,
    use_snapshot_rates: options.use_snapshot_rates,
  }
  const result = calculateMarginReapuration(motorInput)

  // Story MRM-V2-S3.1: fire-and-forget shadow comparison (ADR-001).
  void runShadowComparison(motorInput, result, options.shadow_context)

  return result
}
