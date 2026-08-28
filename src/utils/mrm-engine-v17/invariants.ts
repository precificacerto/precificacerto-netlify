/**
 * mrm-engine-v17/invariants.ts — Asserções matemáticas I-V17-1..10
 *
 * EPIC-MRM-V17 (2026-05-28)
 *
 * Lista de invariantes (Aria spec):
 *   I-V17-1:  Σ pesos componentes (commission+lucro+csll+irpj) = 1 (±1e-9) quando há componente > 0
 *   I-V17-2:  rb_total ≥ 0 e peso_op_interna_ponderado ∈ [0,1]
 *   I-V17-3:  imp_dentro_total = icms + iss + pis_cofins (±0,01)
 *   I-V17-4:  rro = ancora − imp_dentro − cp_efetivo − mod − dop (identidade contábil)
 *   I-V17-5:  cascade_trace.length === 17
 *   I-V17-6:  new_commission + new_profit + new_csll + new_irpj = rro (±0,01)
 *   I-V17-7:  Em RRO_PROPORTIONAL, pesos somam 1
 *   I-V17-8:  Em COMMISSION_PROTECTED com floor aplicado, new_commission = Σ commission_original
 *   I-V17-9:  valor_final = ancora + Σ taxes_outside (±0,01)
 *   I-V17-10: ICMS/ISS/PIS/COFINS bit-exact entre os 2 flavors da Camada 2
 *
 * Em produção, retorna ValidationMap (não throw). Em testes, expõe helpers
 * `assertInvariant*` para uso direto.
 */

import type { ValidationMap, ConsolidatedView, MotorOutput, FinalDistribution } from '@/types/mrm'

const EPS = 0.01      // R$ tolerância
const EPS_RATIO = 1e-9 // pesos/ratios

/**
 * Verifica todas as invariantes e retorna o mapa V1..V7 esperado pelo tipo legacy.
 *
 * Map para `ValidationMap`:
 *   V1 = I-V17-1 (pesos somam 1)
 *   V2 = I-V17-2 (ranges válidos)
 *   V3 = I-V17-3 (cascata tributária soma)
 *   V4 = I-V17-4 (identidade contábil RRO)
 *   V5 = I-V17-5 (17 etapas)
 *   V6 = I-V17-6 (distribuição = RRO)
 *   V7 = I-V17-9 (valor final correto)
 */
export function checkAllInvariantsV17(args: {
  view: ConsolidatedView
  motor: MotorOutput
  distribution: FinalDistribution
}): ValidationMap {
  const { view, motor, distribution } = args
  return {
    V1: checkI1Pesos(view),
    V2: checkI2Ranges(view),
    V3: checkI3CascataSoma(motor),
    V4: checkI4IdentidadeRRO(motor),
    V5: checkI5CascadeTrace17(motor),
    V6: checkI6DistribuicaoSoma(motor, distribution),
    V7: checkI7ValorFinal(motor, distribution),
  }
}

// ─────────────────────────── Asserções individuais ───────────────────────────

export function checkI1Pesos(view: ConsolidatedView): boolean {
  const soma = view.peso_comissao_original + view.peso_lucro_original + view.peso_csll_original + view.peso_irpj_original
  return Math.abs(soma - 1) < EPS_RATIO * 100
}

export function checkI2Ranges(view: ConsolidatedView): boolean {
  if (view.rb_total < 0) return false
  if (view.peso_op_interna_ponderado < 0 || view.peso_op_interna_ponderado > 1) return false
  return true
}

export function checkI3CascataSoma(motor: MotorOutput): boolean {
  // EPIC-DAS: o total por dentro passa a somar QUATRO parcelas. Em qualquer regime três
  // delas são zero por construção (SN/MEI ⇒ só DAS; demais ⇒ DAS = 0), então a soma
  // continua batendo e o invariante segue válido nos dois ramos.
  const soma = motor.icms + motor.iss + motor.pis_cofins + (Number(motor.das) || 0)
  return Math.abs(motor.imp_dentro_total - soma) < EPS
}

export function checkI4IdentidadeRRO(motor: MotorOutput): boolean {
  // EPIC-RT (Cascata RT 14/07): o RRO é LÍQUIDO de RT — a identidade inclui o RT abatido.
  const calc = motor.ancora - motor.imp_dentro_total - motor.cp_efetivo - motor.mod - motor.dop - (Number(motor.rt_value) || 0)
  return Math.abs(motor.rro - calc) < EPS
}

export function checkI5CascadeTrace17(motor: MotorOutput): boolean {
  // 17 etapas (sem RT) ou 19 (com RT: + Consolidação do RT pré-desconto 5.5 e pós-desconto 14.5).
  return Array.isArray(motor.cascade_trace) && (motor.cascade_trace.length === 17 || motor.cascade_trace.length === 19)
}

export function checkI6DistribuicaoSoma(motor: MotorOutput, dist: FinalDistribution): boolean {
  const soma = dist.new_commission + dist.new_profit + dist.new_csll + dist.new_irpj
  return Math.abs(soma - motor.rro) < EPS
}

export function checkI7ValorFinal(motor: MotorOutput, dist: FinalDistribution): boolean {
  const desp = Number(dist.desp_acessorias) || 0
  return Math.abs(dist.valor_final - (motor.ancora + desp + dist.taxes_outside_total)) < EPS
}
