/**
 * mrm-engine-v17.ts — Função pública unificada (EPIC-MRM-V17)
 *
 * Motor RRO aderente ao PDF Oficial RRO (2026-05-28).
 *
 * Arquitetura 2 camadas:
 *   Camada 1 — Motor matemático oficial
 *     1. consolidateItems()   → ConsolidatedView (Etapas 1-9)
 *     2. applyMotorRRO()      → MotorOutput (Etapas 10-15)
 *   Camada 2 — Política comercial
 *     3. applyAbsorptionPolicy() → FinalDistribution (Etapas 16-17)
 *
 * Princípios preservados de versões anteriores:
 *   - V9-I5: CMV canônico (cp + productive_labor) — invariante
 *   - V12 (ADR-013): PIS/COFINS sobre (Âncora − ICMS), ISS NÃO subtrai
 *   - V14: snapshots de despesa do produto têm precedência
 *   - V16.3: despesas operacionais imutáveis a desconto (base = RB pré-desconto)
 *
 * Cutover direto V16 → V17 (pré-lançamento — ADR-015 revisada).
 */

import type { MotorV17Input, MotorV17Result, ReapurationStatus } from '@/types/mrm'
import { MRM_ENGINE_VERSION_V17 } from '@/types/mrm'

import { consolidateItems } from './mrm-engine-v17/consolidate'
import { applyMotorRRO } from './mrm-engine-v17/motor-rro'
import { applyAbsorptionPolicy } from './mrm-engine-v17/absorption'
import { checkAllInvariantsV17 } from './mrm-engine-v17/invariants'

/**
 * Calcula o motor RRO V17 sobre um documento completo (orçamento/pedido/venda).
 *
 * Função pura — sem efeitos colaterais. Idempotente para o mesmo input.
 *
 * @example
 *   const result = calculateMotorV17({
 *     items: [{ item_id: 'a', rb: 1000, ... }],
 *     discount: { pct: 0.10 },
 *     policy: 'RRO_PROPORTIONAL',
 *     regime: 'LUCRO_REAL',
 *     rates: [...],
 *     effective_date: '2026-05-28',
 *     use_snapshot_rates: false,
 *   })
 *
 *   result.motor.rro                // RRO consolidado (R$)
 *   result.distribution.new_commission  // Comissão pós-distribuição (R$)
 *   result.motor.cascade_trace      // 17 etapas para auditoria
 */
export function calculateMotorV17(input: MotorV17Input): MotorV17Result {
  const messages: string[] = []

  // ───── Etapa 1: Consolidação cross-produto ─────
  const view = consolidateItems(input.items, input.discount)

  // ───── Pré-cálculo: total de créditos tributários recuperáveis ─────
  let tax_credits_recoverable_total = 0
  for (const item of input.items) {
    const rec = item.tax_credits?.recoverable
    if (Number.isFinite(rec) && rec! > 0) tax_credits_recoverable_total += rec!
  }

  // ───── Etapa 2: Motor RRO ─────
  const motorResult = applyMotorRRO({
    view,
    discount: input.discount,
    rates: input.rates,
    tax_credits_recoverable_total,
  })
  messages.push(...motorResult.messages)

  // ───── Etapa 3: Camada 2 — Política de absorção ─────
  const absorptionResult = applyAbsorptionPolicy({
    view,
    motor: motorResult.motor,
    policy: input.policy,
    rates: input.rates,
    desp_acessorias: input.desp_acessorias,
    icms_compl_applies: input.icms_compl_applies,
  })
  messages.push(...absorptionResult.messages)

  // Cascade trace final (etapas 16-17 atualizadas pela Camada 2)
  const finalMotor = {
    ...motorResult.motor,
    cascade_trace: absorptionResult.updated_cascade_trace,
  }

  // ───── Validação de invariantes ─────
  const validations = checkAllInvariantsV17({
    view,
    motor: finalMotor,
    distribution: absorptionResult.distribution,
  })

  // Substitui validations no distribution com a versão completa
  const distribution = {
    ...absorptionResult.distribution,
    validations,
  }

  // ───── Status final consolidado ─────
  let status: ReapurationStatus = finalMotor.rro_status
  let error_code: string | null = null
  if (status === 'RRO_NEGATIVE' || status === 'RRO_ZERO') {
    error_code = 'RRO_NON_POSITIVE'
  }

  return {
    engine_version: MRM_ENGINE_VERSION_V17,
    consolidated: view,
    motor: finalMotor,
    distribution,
    status,
    error_code,
    messages,
  }
}

/**
 * Re-exports para conveniência (callers podem importar tudo via mrm-engine-v17).
 */
export { consolidateItems } from './mrm-engine-v17/consolidate'
export { applyMotorRRO } from './mrm-engine-v17/motor-rro'
export { applyAbsorptionPolicy } from './mrm-engine-v17/absorption'
export { buildCascadeTrace17 } from './mrm-engine-v17/cascade-trace'
export { checkAllInvariantsV17 } from './mrm-engine-v17/invariants'
