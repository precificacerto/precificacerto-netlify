/**
 * MRM Display Extractor — Story MRM-V5-005 Integration Helper.
 *
 * Extrai campos do Epic V5 (cascade_trace, peso_op_interna, ancora_interna,
 * regime_guard_active) de uma lista de items com `tax_breakdown` para alimentar
 * os componentes `ConsolidatedDREBlock` e `ResidualDistributionBlock` nas
 * páginas de orçamentos / pedidos / vendas.
 *
 * Estratégia de agregação:
 *   - `peso_op_interna`: média ponderada pela RV de cada item (decimal 0..1)
 *   - `ancora_interna`: SOMA das âncoras (R$ é somável)
 *   - `cascade_trace`: trace agregado — labels/source do primeiro item,
 *     `amount` somado entre todos (faz sentido para R$ acumulado do documento)
 *   - `regime_guard_active`: baseado em tenant_settings (tax_regime + csll/irpj
 *     configurados); independe dos items.
 *
 * Quando ausência total de breakdowns válidos, retorna todos os campos como `null`
 * — componentes UI não renderizam (props opcionais).
 */

import type { CascadeStep, TaxBreakdown, TaxRegime } from '@/types/mrm'

export interface EpicV5DisplayData {
  cascadeTrace: CascadeStep[] | null
  pesoOpInterna: number | null
  ancoraInterna: number | null
  regimeGuardActive: {
    regime: 'MEI' | 'SIMPLES_NACIONAL'
    attempted_csll: number
    attempted_irpj: number
  } | null
}

interface ItemWithBreakdown {
  tax_breakdown?: TaxBreakdown | null
}

interface TenantContext {
  regime: TaxRegime
  csll_pct?: number
  irpj_pct?: number
}

/**
 * Agrega múltiplos `cascade_trace` em um único — preserva 13 steps fixos,
 * soma o `amount` de cada step entre os items. Labels/source do primeiro item.
 *
 * Quando há apenas 1 breakdown, retorna o trace direto.
 */
function aggregateCascadeTraces(traces: CascadeStep[][]): CascadeStep[] | null {
  if (traces.length === 0) return null
  if (traces.length === 1) return traces[0]

  // Template: primeiro trace (referência de labels/source/formula)
  const template = traces[0]
  if (template.length !== 13) return template // se não tem 13 etapas, devolve como está

  return template.map((step, idx) => {
    const aggregatedAmount = traces.reduce((sum, trace) => {
      const matchingStep = trace[idx]
      return sum + (matchingStep?.amount ?? 0)
    }, 0)
    return {
      ...step,
      amount: aggregatedAmount,
      // base/rate são referência do primeiro — agregação numérica de bases/rates
      // não faz sentido (são parâmetros, não acumuladores)
    }
  })
}

/**
 * Extrai dados do Epic V5 para exibição em DRE consolidada + distribuição
 * residual. Aceita lista de items (orçamento, pedido ou venda) e contexto
 * do tenant para construir o `regimeGuardActive`.
 *
 * Retorna `null` em todos os campos quando nenhum item tem `tax_breakdown`
 * válido com schema V5 (engine_version >= 2.2.0) — componentes degradam
 * silenciosamente para o comportamento V4.
 */
/** Fallback seguro retornado em qualquer erro inesperado. NUNCA quebra a UI. */
const EMPTY_DISPLAY_DATA: EpicV5DisplayData = {
  cascadeTrace: null,
  pesoOpInterna: null,
  ancoraInterna: null,
  regimeGuardActive: null,
}

export function extractEpicV5DisplayData(
  items: ItemWithBreakdown[] | null | undefined,
  tenantContext: TenantContext | null | undefined,
): EpicV5DisplayData {
  // Defensive guards — NUNCA throwar (tela branca seria pior que feature ausente)
  try {
    if (!Array.isArray(items) || items.length === 0) return EMPTY_DISPLAY_DATA
    if (!tenantContext || typeof tenantContext !== 'object') return EMPTY_DISPLAY_DATA

    // Filtra breakdowns válidos com schema V5
    const breakdowns: TaxBreakdown[] = []
    for (const it of items) {
      const b = it?.tax_breakdown
      if (!b || typeof b !== 'object') continue
      // Considera V5 quando tem cascade_trace OU ancora_interna ou peso_op_interna
      if (b.cascade_trace != null || b.ancora_interna != null || b.peso_op_interna != null) {
        breakdowns.push(b)
      }
    }

    // Regime guard (sempre calculado — depende apenas do tenant)
    const regime = tenantContext.regime
    const isRegimeCumulativo = regime === 'MEI' || regime === 'SIMPLES_NACIONAL'
    const attemptedCsll = Number(tenantContext.csll_pct) || 0
    const attemptedIrpj = Number(tenantContext.irpj_pct) || 0
    const hasAttemptedTaxes = attemptedCsll > 0 || attemptedIrpj > 0

    const regimeGuardActive =
      isRegimeCumulativo && hasAttemptedTaxes
        ? {
            regime: regime as 'MEI' | 'SIMPLES_NACIONAL',
            attempted_csll: attemptedCsll,
            attempted_irpj: attemptedIrpj,
          }
        : null

    if (breakdowns.length === 0) {
      return { cascadeTrace: null, pesoOpInterna: null, ancoraInterna: null, regimeGuardActive }
    }

    // Âncora SOMADA (R$ somável)
    const ancoraInterna = breakdowns.reduce((sum, b) => sum + (Number(b.ancora_interna) || 0), 0)

    // Peso ponderado pela RV
    const totalRv = breakdowns.reduce((sum, b) => sum + (Number(b.rv) || 0), 0)
    const pesoOpInterna =
      totalRv > 0
        ? breakdowns.reduce((sum, b) => sum + (Number(b.peso_op_interna) || 1) * (Number(b.rv) || 0), 0) / totalRv
        : null

    // Cascade trace agregado
    const tracesValidos: CascadeStep[][] = []
    for (const b of breakdowns) {
      if (Array.isArray(b.cascade_trace) && b.cascade_trace.length > 0) {
        tracesValidos.push(b.cascade_trace)
      }
    }
    const cascadeTrace = aggregateCascadeTraces(tracesValidos)

    return {
      cascadeTrace,
      pesoOpInterna: pesoOpInterna != null && Number.isFinite(pesoOpInterna) ? pesoOpInterna : null,
      ancoraInterna: ancoraInterna > 0 ? ancoraInterna : null,
      regimeGuardActive,
    }
  } catch (error) {
    // Caso impossível em runtime (qualquer exceção inesperada) — log e fallback seguro.
    // eslint-disable-next-line no-console
    console.warn('[extractEpicV5DisplayData] erro inesperado:', error)
    return EMPTY_DISPLAY_DATA
  }
}
