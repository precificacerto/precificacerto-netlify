/**
 * mrm-engine-v17/motor-rro.ts — Camada 1, Etapa 2
 *
 * EPIC-MRM-V17 (2026-05-28)
 * Cobre PDF Etapas 10-15: cascata tributária sequencial + RRO consolidado.
 *
 * Princípio cascata inviolável (PDF Seção 19):
 *   1º ICMS sobre Âncora
 *   2º ISS  sobre (Âncora − ICMS)
 *   3º PIS/COFINS sobre (Âncora − ICMS − ISS)   [ADR-016, 2026-05-29: REVOGA ADR-013.
 *      VALOR preservado da precificação (Σ Op Interna × pct); a alíquota é TRANSMUTADA
 *      para a base 13A → alíq_13B = alíq_precif / (1 − ICMS% − ISS%). Mantém o valor
 *      monetário idêntico ao da precificação e a base correta da cascata.]
 *
 * Princípio V16.3: despesas operacionais e MOD/CP imutáveis a desconto.
 */

import type {
  ConsolidatedView,
  DiscountV17,
  MotorOutput,
  ReapurationStatus,
  TaxRatePeriod,
  TaxType,
} from '@/types/mrm'
import {
  MRM_ERROR_RRO_NON_POSITIVE,
} from '@/types/mrm'

import { buildCascadeTrace17 } from './cascade-trace'

interface ApplyMotorRROInput {
  view: ConsolidatedView
  discount: DiscountV17
  rates: TaxRatePeriod[]
  tax_credits_recoverable_total: number
}

interface ApplyMotorRROResult {
  motor: MotorOutput
  messages: string[]
}

/**
 * Aplica cascata tributária + RRO sobre a visão consolidada.
 *
 * Output bit-exact entre os 2 flavors da Camada 2 — só `new_commission` e
 * `new_profit` divergem após Camada 2.
 */
export function applyMotorRRO(input: ApplyMotorRROInput): ApplyMotorRROResult {
  const { view } = input
  const messages: string[] = []

  // ───── Resolver alíquotas relevantes (fallback quando produtos não consolidam) ─────
  const icms_rate = resolveRate(input.rates, 'ICMS')
  const iss_rate = resolveRate(input.rates, 'ISS')
  const pis_rate = resolveRate(input.rates, 'PIS')
  const cofins_rate = resolveRate(input.rates, 'COFINS')
  const pis_cofins_rate = pis_rate + cofins_rate

  // ───── PDF Etapa 13: cascata tributária ─────
  const ancora = view.ancora_interna

  // V17 (2026-05-28): se produtos forneceram taxes_inside_amounts (R$ consolidados),
  // usar valores direto + aplicar desconto proporcional. Multi-produto com alíquotas
  // distintas resulta em ICMS/ISS/PIS/COFINS efetivos diferentes da nominal do tenant.
  // Caso contrário, fallback ao cálculo via Âncora × pct_tenant (legado).
  const tit = view.taxes_inside_total
  const rb_total = view.rb_total
  const rv_total = view.rv_total
  // Fator de desconto proporcional: rv_total / rb_total (PDF Seção 23)
  const ancoraFactor = rb_total > 0 ? rv_total / rb_total : 1

  // ADR-016 (2026-05-29): Operação Interna Consolidada (pré-desconto) — usada como
  // denominador de fallback degenerado da alíquota. = peso_op_interna_ponderado × rb_total.
  const op_interna_consolidada = view.peso_op_interna_ponderado * rb_total

  let icms: number
  let iss: number
  let pis_cofins: number
  let pis_cofins_aliquota_efetiva: number

  if (tit) {
    // Consolidação por produto (R$ pré-desconto × desconto)
    icms = tit.icms * ancoraFactor
    iss = tit.iss * ancoraFactor
    // ADR-016 (transmutação, 2026-05-29): o VALOR do PIS/COFINS é o consolidado da
    // PRECIFICAÇÃO (Σ Op Interna × pct) — PRESERVADO, não reduzido pela base menor.
    // A base de incidência exibida é (Âncora − ICMS − ISS); a alíquota é TRANSMUTADA
    // para manter o valor: alíq_13B = pis_cofins / base_13A = alíq_precif/(1−ICMS%−ISS%).
    pis_cofins = tit.pis_cofins * ancoraFactor
    const base_13a = ancora - icms - iss
    pis_cofins_aliquota_efetiva = base_13a > 0
      ? pis_cofins / base_13a
      : (op_interna_consolidada > 0 ? tit.pis_cofins / op_interna_consolidada : pis_cofins_rate)
  } else {
    // Fallback (tenant uniforme): valor da precificação = Âncora × pis_cofins_rate
    // (sobre a operação interna), transmutado para a base (Âncora − ICMS − ISS).
    icms = ancora * icms_rate
    const base_pos_icms = ancora - icms
    iss = base_pos_icms * iss_rate
    pis_cofins = ancora * pis_cofins_rate
    const base_13a = base_pos_icms - iss
    pis_cofins_aliquota_efetiva = base_13a > 0 ? pis_cofins / base_13a : pis_cofins_rate
  }

  const imp_dentro_total = icms + iss + pis_cofins

  // ───── PDF Etapa 14: cascata custos e despesas ─────
  // V16.3 princípio: estes valores são IMUTÁVEIS a desconto.
  // CP efetivo = CP total − créditos recuperáveis (V5-004)
  const cp_efetivo = Math.max(0, view.cp_total - input.tax_credits_recoverable_total)
  const mod = view.mod_total
  const dop = view.dop_total

  // ───── PDF Etapa 15: RRO ─────
  const rro = ancora - imp_dentro_total - cp_efetivo - mod - dop

  // Status do RRO (R5 — não força a zero, apenas sinaliza)
  let rro_status: ReapurationStatus = 'VALID'
  if (Math.abs(rro) < 0.01) {
    rro_status = 'RRO_ZERO'
    messages.push(MRM_ERROR_RRO_NON_POSITIVE)
  } else if (rro < 0) {
    rro_status = 'RRO_NEGATIVE'
    messages.push(MRM_ERROR_RRO_NON_POSITIVE)
  }

  // ───── Limite mínimo operacional (Seção 4.5 Relatório Consolidado) ─────
  const soma_rates_internos = icms_rate + iss_rate + pis_cofins_rate
  const denom_lim = 1 - soma_rates_internos
  const limite_minimo = denom_lim > 0 ? (cp_efetivo + mod + dop) / denom_lim : null

  // ───── Cascade trace 17 etapas ─────
  const motorPartial: Omit<MotorOutput, 'cascade_trace'> = {
    rb: view.rb_total,
    desc_value: view.desc_value,
    rv: view.rv_total,
    ancora,
    icms,
    iss,
    pis_cofins,
    pis_cofins_aliquota_efetiva,
    imp_dentro_total,
    cp_efetivo,
    mod,
    dop,
    rro,
    rro_status,
    limite_minimo,
  }

  const cascade_trace = buildCascadeTrace17({
    view,
    motor: motorPartial,
    // ADR-016: passa a alíquota TRANSMUTADA do PIS/COFINS (alíq_precif/(1−ICMS%−ISS%)),
    // para a cascata 13B exibir a % coerente com o valor preservado da precificação.
    rates: { icms: icms_rate, iss: iss_rate, pis_cofins: pis_cofins_aliquota_efetiva },
  })

  const motor: MotorOutput = { ...motorPartial, cascade_trace }
  return { motor, messages }
}

// ─────────────────────────── Helpers internos ───────────────────────────

/**
 * Resolve alíquota agregada de um tipo de tributo entre os rates disponíveis.
 * Soma quando há múltiplos registros (e.g. ICMS por origin/dest distintos).
 */
function resolveRate(rates: TaxRatePeriod[] | null | undefined, type: TaxType): number {
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
