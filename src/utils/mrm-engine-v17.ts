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

  // ───── Gargalo 3 (planilha "Motor RRO 11.06"): ajuste da âncora por Desp. Acessória FIXA ─────
  // No desconto, frete/seguro (Desp. Acessória) são contratuais e não sofrem desconto comercial;
  // o desconto que incidiria sobre eles é absorvido pela operação por dentro, reduzindo a âncora.
  // Ajuste (espaço consolidado) = desp × d × (1 + icms × [ICMS Compl. com frete na base]).
  // O termo de ICMS reflete o excesso da reapuração do ICMS Complementar (cuja base mantém a
  // Desp. Acessória FIXA): ICMSCompl_pós − ICMSCompl×(1−d) = desp × d × icms.
  const d = Math.max(0, Math.min(1, Number(input.discount?.pct) || 0))
  const despAcess = Math.max(0, Number(input.desp_acessorias) || 0)
  const icmsRate = resolveRateAgg(input.rates, 'ICMS')
  const complFreightInBase = icmsComplHasFreightInBase(input.icms_compl, input.icms_compl_applies)
  // Doc 31/07/2026 (oráculo "Aluminio"): a absorção do desconto da Desp. Acessória migrou
  // para `discount.discount_immune_base` na Etapa 9 (consolidate) — a desp entra no valor
  // imune e o termo base `desp × d` já reduz `rv_total`/âncora ali. Para NÃO dupla-contar,
  // `desp_pool_adjustment` retém APENAS o excesso do ICMS Complementar (`desp × d × icms`),
  // que a âncora não capta via rv. Quando a desp está no valor imune, o termo base (o `1×`)
  // é omitido. Fallback (sem valor imune) preserva o comportamento clássico (Gargalo 3).
  const despInImmuneBase =
    Math.max(0, Number(input.discount?.discount_immune_base) || 0) >= despAcess && despAcess > 0
  const desp_pool_base_term = despInImmuneBase ? 0 : 1
  const desp_pool_adjustment =
    despAcess * d * (desp_pool_base_term + (complFreightInBase ? icmsRate : 0))

  // ───── Etapa 2: Motor RRO ─────
  const motorResult = applyMotorRRO({
    view,
    discount: input.discount,
    rates: input.rates,
    tax_credits_recoverable_total,
    desp_pool_adjustment,
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
    icms_compl: input.icms_compl,
    effective_date: input.effective_date,
    outside_items: input.outside_items,
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

// ─────────────────────────── Helpers internos ───────────────────────────

/** Soma a alíquota (decimal) de um tipo de tributo entre os rates. */
function resolveRateAgg(rates: MotorV17Input['rates'] | null | undefined, type: string): number {
  if (!Array.isArray(rates)) return 0
  let acc = 0
  for (const r of rates) {
    if (r?.tax_type === type) {
      const v = Number(r.rate_pct)
      if (Number.isFinite(v) && v > 0) acc += v
    }
  }
  return acc
}

/**
 * Decide ESTRUTURALMENTE se o ICMS Complementar é cobrado COM a Desp. Acessória (frete) na base —
 * espelha os ramos de `resolveIcmsComplementar` (icms-st-difal.ts), sem depender do IPI. Usado só
 * para dimensionar o termo de ICMS no ajuste da âncora (gargalo 3).
 */
function icmsComplHasFreightInBase(
  icms_compl: MotorV17Input['icms_compl'] | null | undefined,
  icms_compl_applies: boolean | null | undefined,
): boolean {
  if (icms_compl) {
    if (icms_compl.override === 'FORCE_OFF') return false
    if (icms_compl.is_contributor == null) return false
    // Não contribuinte: cobra com frete na base, salvo bloqueio por ST/DIFAL.
    if (icms_compl.is_contributor === false) return !(icms_compl.st_active || icms_compl.difal_active)
    // Contribuinte FOB: frete fora da base → sem termo de frete.
    if (icms_compl.freight_mode === 'FOB') return false
    // Contribuinte CIF: ST ativo bloqueia; senão frete na base.
    if (icms_compl.st_active) return false
    return true
  }
  return !!icms_compl_applies // legado binário: assume frete na base
}

/**
 * Re-exports para conveniência (callers podem importar tudo via mrm-engine-v17).
 */
export { consolidateItems } from './mrm-engine-v17/consolidate'
export { applyMotorRRO } from './mrm-engine-v17/motor-rro'
export { applyAbsorptionPolicy } from './mrm-engine-v17/absorption'
export { buildCascadeTrace17 } from './mrm-engine-v17/cascade-trace'
export { checkAllInvariantsV17 } from './mrm-engine-v17/invariants'
