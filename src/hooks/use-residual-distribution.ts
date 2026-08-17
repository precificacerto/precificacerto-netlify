/**
 * useResidualDistribution — Hook React (wrapper memoizado).
 *
 * Função pura está em `src/utils/residual-distribution.ts`. Este hook apenas
 * memoiza a chamada para evitar recálculo em re-renders quando os inputs
 * não mudam.
 *
 * Para uso fora de React (PDF, WhatsApp, scripts), invocar diretamente
 * `computeResidualDistribution`.
 *
 * IMPORTANTE — Memoização e estabilidade de referência:
 *   A dependência `items` é comparada por referência. Se o caller construir
 *   o array a cada render (`items.map(...)` ou `items ?? []`), a memo será
 *   invalidada a cada ciclo e o recálculo acontecerá toda vez.
 *
 *   Padrão correto:
 *     const distItems = useMemo(() => budgetItems.map(toResidualInput), [budgetItems])
 *     const distribution = useResidualDistribution(distItems, totalGross, totalNet, regime, taxRates)
 *
 *   Padrão errado:
 *     // ❌ recria array a cada render
 *     const distribution = useResidualDistribution(budgetItems.map(toResidualInput), ...)
 */

import { useMemo } from 'react'

import {
  computeResidualDistribution,
  type ResidualBaselineInput,
  type ResidualDistribution,
  type ResidualItemInput,
  type TenantOriginalTaxRates,
} from '@/utils/residual-distribution'
import type { DiscountMode, TaxRegime } from '@/types/mrm'

export function useResidualDistribution(
  items: ResidualItemInput[],
  totalGross: number,
  totalNet: number,
  regime: TaxRegime | null,
  tenantTaxRates?: TenantOriginalTaxRates,
  discountPct?: number,
  discountMode?: DiscountMode,
  /**
   * Dossiê Julho 2026 (Correção 5): Âncora Gerencial (Op. Interna pós-desconto) — denominador
   * correto das alíquotas efetivas. Ausente → fallback para `totalNet` (retrocompat).
   */
  ancoraGerencial?: number,
  /**
   * Correção Card Percentual (Ago/2026): rodada baseline (motor com desconto=0) para o
   * `% original` dos cards. Deve ser memoizado pelo caller por itens/custos/parâmetros
   * (NÃO pelo desconto) — digitar desconto não pode alterar o baseline.
   */
  baseline?: ResidualBaselineInput,
): ResidualDistribution {
  return useMemo(
    () => computeResidualDistribution(items, totalGross, totalNet, regime, tenantTaxRates, discountPct, discountMode, ancoraGerencial, baseline),
    [items, totalGross, totalNet, regime, tenantTaxRates, discountPct, discountMode, ancoraGerencial, baseline],
  )
}
