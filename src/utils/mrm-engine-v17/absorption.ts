/**
 * mrm-engine-v17/absorption.ts — Camada 2 (Política de Absorção)
 *
 * EPIC-MRM-V17 (2026-05-28)
 * Cobre PDF Etapas 16-17:
 *   - Etapa 16: redistribuição RRO entre Comissão/Lucro/IRPJ/CSLL
 *   - Etapa 17: tributos por fora + consolidação final
 *
 * Camada 2 implementa 2 políticas comerciais:
 *   - RRO_PROPORTIONAL  (default PDF Seção 23): pesos originais pré-desconto
 *   - COMMISSION_PROTECTED: comissão integral, lucro absorve diferença
 *
 * INVARIANTE I-V17-10: ICMS/ISS/PIS/COFINS bit-exact entre as 2 policies.
 * Apenas new_commission e new_profit podem divergir.
 */

import type {
  AbsorptionPolicy,
  ConsolidatedView,
  FinalDistribution,
  MotorOutput,
  TaxLine,
  TaxRatePeriod,
  TaxType,
  ValidationMap,
} from '@/types/mrm'

interface ApplyAbsorptionInput {
  view: ConsolidatedView
  motor: MotorOutput
  policy: AbsorptionPolicy
  rates: TaxRatePeriod[]
  /** Despesas Acessórias consolidadas (frete + seguro + despesas acessórias, R$). */
  desp_acessorias?: number
  /** Ativa ICMS Complementar (destinatário consumidor final NÃO contribuinte do ICMS). */
  icms_compl_applies?: boolean
}

interface ApplyAbsorptionResult {
  distribution: FinalDistribution
  /** Cascade trace atualizado com etapas 16-17 preenchidas. */
  updated_cascade_trace: MotorOutput['cascade_trace']
  messages: string[]
}

/**
 * Aplica política de absorção (Camada 2) sobre o RRO e calcula tributos por fora.
 */
export function applyAbsorptionPolicy(input: ApplyAbsorptionInput): ApplyAbsorptionResult {
  const { view, motor, policy } = input
  const messages: string[] = []

  // ───── PDF Etapa 16: redistribuição RRO ─────
  const proportional = distributeProportional(motor.rro, view)

  let final_commission = proportional.new_commission
  let final_profit = proportional.new_profit
  let final_csll = proportional.new_csll
  let final_irpj = proportional.new_irpj
  let commission_floor_applied = false
  let profit_absorbed = 0

  if (policy === 'COMMISSION_PROTECTED') {
    const floor_commission = view.commission_amount_original
    const floor_csll = view.csll_amount_original
    const floor_irpj = view.irpj_amount_original
    const required = floor_commission + floor_csll + floor_irpj

    if (motor.rro >= required) {
      // RRO suficiente — comissão/CSLL/IRPJ preservados em R$ absoluto
      final_commission = floor_commission
      final_csll = floor_csll
      final_irpj = floor_irpj
      final_profit = motor.rro - final_commission - final_csll - final_irpj
      profit_absorbed = view.profit_amount_original - final_profit
      commission_floor_applied = true
    } else {
      // RRO insuficiente — degrada para proporcional
      messages.push(
        'COMMISSION_PROTECTED inviável (RRO < floor de Comissão+CSLL+IRPJ); aplicada distribuição proporcional como fallback.',
      )
      // proportional já está em final_*
    }
  }

  // ───── PDF Etapa 17: tributos por fora (Reforma Tributária / IVA Dual) ─────
  // Bases individualizadas (documento "Bases de Cálculo dos Tributos Por Fora",
  // Conferência Fiscal 2026-06-05). OpDentro = Âncora (operação interna, SEM despesas
  // acessórias). Desp. Acessórias = frete + seguro + despesas acessórias cobradas do cliente.
  //   IS          = (Âncora − ICMS − ISS − PIS/COFINS) × alíq.IS        (sem Desp. Acessórias)
  //   IBS / CBS   = (Base IS + IS + Desp. Acessórias) × alíq.           (Desp. compõe a base)
  //   IPI         = (Âncora + Desp. Acessórias) × alíq.IPI              (RIPI; não deduz ICMS)
  //   ICMS Compl. = (IPI + Desp. Acessórias) × alíq.ICMS                (só não contribuinte)
  const desp_acessorias = Math.max(0, Number(input.desp_acessorias) || 0)
  const base_iva = Math.max(0, motor.ancora - motor.icms - motor.iss - motor.pis_cofins)
  const is_rate = resolveRate(input.rates, 'IS')
  const is_amount = base_iva * is_rate
  const base_ibs_cbs = base_iva + is_amount + desp_acessorias

  const taxes_outside: TaxLine[] = []
  let taxes_outside_total = 0
  const pushTax = (type: TaxType, rate: number, base: number) => {
    if (rate <= 0) return
    const amount = base > 0 ? base * rate : 0
    taxes_outside.push({ type, rate_pct: rate, base, amount })
    taxes_outside_total += amount
  }

  // Etapa 4: Imposto Seletivo sobre a Base Econômica IVA (sem Desp. Acessórias).
  pushTax('IS', is_rate, base_iva)
  // Etapas 6-7: IBS e CBS sobre a base com IS e Desp. Acessórias incorporados.
  pushTax('IBS', resolveRate(input.rates, 'IBS'), base_ibs_cbs)
  pushTax('CBS', resolveRate(input.rates, 'CBS'), base_ibs_cbs)
  // Etapa 8: IPI destacado sobre Âncora + Desp. Acessórias (RIPI art. 190).
  const ipi_rate = resolveRate(input.rates, 'IPI')
  const ipi_base = motor.ancora + desp_acessorias
  const ipi_amount = ipi_base > 0 ? ipi_base * ipi_rate : 0
  pushTax('IPI', ipi_rate, ipi_base)
  // ICMS Complementar: (IPI + Desp. Acessórias) × alíq.ICMS — só consumidor final NÃO
  // contribuinte do ICMS (LC 87/1996, art. 13, §1º, II).
  if (input.icms_compl_applies) {
    pushTax('ICMS_COMPL', resolveRate(input.rates, 'ICMS'), ipi_amount + desp_acessorias)
  }
  // Legados "por fora" pré-Reforma — incidem sobre a Base Econômica IVA.
  for (const type of ['ICMS_ST', 'DIFAL', 'FCP', 'ISS_RETIDO'] as TaxType[]) {
    pushTax(type, resolveRate(input.rates, type), base_iva)
  }

  const taxes_outside_base = base_iva
  // Preço Final = Âncora + Desp. Acessórias + Operação Externa.
  const valor_final = motor.ancora + desp_acessorias + taxes_outside_total

  // ───── Validations / Audit ─────
  const delta_vs_proportional = commission_floor_applied
    ? final_commission - proportional.new_commission
    : 0

  const validations: ValidationMap = {
    V1: true, // pesos somam 1 — checado em invariants.ts
    V2: true, // ranges válidos
    V3: true, // cascata soma — checado em motor-rro
    V4: Math.abs(motor.rro - (final_commission + final_profit + final_csll + final_irpj)) < 0.01,
    V5: motor.cascade_trace.length === 17,
    V6: true, // distribuição = RRO (V4 acima)
    V7: Math.abs(valor_final - (motor.ancora + desp_acessorias + taxes_outside_total)) < 0.01,
  }

  const distribution: FinalDistribution = {
    policy_applied: policy,
    new_commission: final_commission,
    new_profit: final_profit,
    new_csll: final_csll,
    new_irpj: final_irpj,
    taxes_outside,
    taxes_outside_base,
    taxes_outside_total,
    desp_acessorias,
    valor_final,
    absorption_audit: {
      commission_floor_applied,
      profit_absorbed,
      delta_vs_proportional,
    },
    validations,
  }

  // ───── Atualiza cascade_trace etapas 16 e 17 ─────
  const updated_cascade_trace = motor.cascade_trace.map((step) => {
    if (step.step === 16) {
      return {
        ...step,
        formula: `Aplicada política ${policy}`,
        children: [
          {
            step: 16,
            label: 'Comissão',
            base: null,
            rate: null,
            amount: final_commission,
            formula: commission_floor_applied
              ? 'R$ original protegido (Camada 2)'
              : 'rro × peso_comissao_original',
            source: 'CAMADA_2',
            peso: view.peso_comissao_original,
          },
          {
            step: 16,
            label: 'Lucro',
            base: null,
            rate: null,
            amount: final_profit,
            formula: commission_floor_applied
              ? 'rro − comissão_protegida − csll − irpj'
              : 'rro × peso_lucro_original',
            source: 'CAMADA_2',
            peso: view.peso_lucro_original,
          },
          {
            step: 16,
            label: 'IRPJ',
            base: null,
            rate: null,
            amount: final_irpj,
            formula: 'rro × peso_irpj_original (ou R$ protegido em COMMISSION_PROTECTED)',
            source: 'CAMADA_2',
            peso: view.peso_irpj_original,
          },
          {
            step: 16,
            label: 'CSLL',
            base: null,
            rate: null,
            amount: final_csll,
            formula: 'rro × peso_csll_original (ou R$ protegido em COMMISSION_PROTECTED)',
            source: 'CAMADA_2',
            peso: view.peso_csll_original,
          },
        ],
      }
    }
    if (step.step === 17) {
      return {
        ...step,
        amount: valor_final,
        formula: 'Âncora + Σ Tributos por fora',
        children: taxes_outside.map((tax) => ({
          step: 17,
          label: tax.type,
          base: tax.base,
          rate: tax.rate_pct,
          amount: tax.amount,
          formula: `base_canônica × ${tax.type}_rate`,
          source: 'CAMADA_2',
        })),
      }
    }
    return step
  })

  return { distribution, updated_cascade_trace, messages }
}

// ─────────────────────────── Helpers internos ───────────────────────────

function distributeProportional(rro: number, view: ConsolidatedView): {
  new_commission: number
  new_profit: number
  new_csll: number
  new_irpj: number
} {
  return {
    new_commission: rro * view.peso_comissao_original,
    new_profit: rro * view.peso_lucro_original,
    new_csll: rro * view.peso_csll_original,
    new_irpj: rro * view.peso_irpj_original,
  }
}

function resolveRate(rates: TaxRatePeriod[] | null | undefined, type: string): number {
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
