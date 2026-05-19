/**
 * MRM Aggregate — Helpers de agregação de resultados do motor (Story S2.3)
 *
 * Quando um documento (budget/order/sale) tem N itens, cada um produz seu
 * próprio `TaxBreakdown` via `hydrateItemSnapshot`. A camada `mrm-policies`
 * precisa de UMA visão consolidada do documento (status + rro) para decidir
 * a ação (block/warn/allow).
 *
 * Regra de agregação (conservadora):
 *   - Status agregado = pior status entre os itens, na ordem:
 *       ERROR > RRO_NEGATIVE > RRO_ZERO > VALID > PENDING
 *   - RRO agregado = soma dos RROs dos itens (positivo se todos positivos;
 *     negativo se algum item zerou a margem do conjunto).
 *
 * Função PURA — sem I/O.
 */

import type {
  MotorResultLike,
} from './mrm-policies'
import type { ReapurationStatus, TaxBreakdown } from '@/types/mrm'

const STATUS_PRIORITY: Record<ReapurationStatus, number> = {
  ERROR: 5,
  RRO_NEGATIVE: 4,
  RRO_ZERO: 3,
  VALID: 1,
  PENDING: 0,
}

/**
 * Agrega N TaxBreakdowns em um único `MotorResultLike` para alimentar a
 * camada de policies. Items com `tax_breakdown = null` (modo legacy quando
 * `use_snapshot_rates=false`) são IGNORADOS — não influenciam a decisão.
 *
 * Quando a lista está vazia OU todos os items vieram com `null`, devolve
 * um resultado VALID/0 (não há sinal para acionar policy).
 */
export function aggregateMotorResults(
  breakdowns: (TaxBreakdown | null | undefined)[]
): MotorResultLike {
  const valid = breakdowns.filter((b): b is TaxBreakdown => Boolean(b))

  if (valid.length === 0) {
    return { status: 'VALID', rro: 0 }
  }

  let worstStatus: ReapurationStatus = 'VALID'
  let rroSum = 0

  for (const b of valid) {
    rroSum += Number(b.rro) || 0
    const cur = STATUS_PRIORITY[b.status] ?? 0
    const best = STATUS_PRIORITY[worstStatus] ?? 0
    if (cur > best) worstStatus = b.status
  }

  // Reconciliação: se RRO agregado <= 0 mas worstStatus ainda diz VALID
  // (caso teórico de pesos desbalanceados), promove para RRO_ZERO/NEGATIVE.
  if (worstStatus === 'VALID' && rroSum <= 0) {
    worstStatus = rroSum === 0 ? 'RRO_ZERO' : 'RRO_NEGATIVE'
  }

  return { status: worstStatus, rro: rroSum }
}
