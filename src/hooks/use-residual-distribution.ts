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
  type ResidualDistribution,
  type ResidualItemInput,
  type TenantOriginalTaxRates,
} from '@/utils/residual-distribution'
import type { TaxRegime } from '@/types/mrm'

export function useResidualDistribution(
  items: ResidualItemInput[],
  totalGross: number,
  totalNet: number,
  regime: TaxRegime | null,
  tenantTaxRates?: TenantOriginalTaxRates,
): ResidualDistribution {
  return useMemo(
    () => computeResidualDistribution(items, totalGross, totalNet, regime, tenantTaxRates),
    [items, totalGross, totalNet, regime, tenantTaxRates],
  )
}
