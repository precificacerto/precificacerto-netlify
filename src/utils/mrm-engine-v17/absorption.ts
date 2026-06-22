/**
 * mrm-engine-v17/absorption.ts — Camada 2 (Política de Absorção)
 *
 * EPIC-MRM-V17 (2026-05-28)
 * Cobre PDF Etapas 16-17:
 *   - Etapa 16: redistribuição RRO entre Comissão/Lucro/IRPJ/CSLL
 *   - Etapa 17: tributos por fora + consolidação final
 *
 * Camada 2 implementa 3 políticas comerciais (Relatório 20/06/2026, Item 2 — trava a
 * ALÍQUOTA %, nunca o R$; fallback proporcional se a parte protegida exceder o RRO):
 *   - RRO_PROPORTIONAL  (default PDF Seção 23): pesos originais pré-desconto
 *   - COMMISSION_PROTECTED ("Empresa absorve (Lucro)"): comissão protege a alíquota;
 *     lucro + CSLL + IRPJ absorvem a diferença proporcionalmente entre si
 *   - PROFIT_PROTECTED ("Vendedor absorve (Comissão)"): lucro protege a alíquota, com
 *     CSLL/IRPJ acompanhando-o; a comissão absorve a diferença
 *
 * INVARIANTE I-V17-10: ICMS/ISS/PIS/COFINS bit-exact entre as policies.
 * Apenas new_commission/new_profit/new_csll/new_irpj podem divergir (soma = RRO sempre).
 */

import type {
  AbsorptionPolicy,
  ConsolidatedView,
  FinalDistribution,
  IcmsComplMotorInput,
  MotorOutput,
  TaxLine,
  TaxRatePeriod,
  TaxType,
  ValidationMap,
} from '@/types/mrm'
import { computeIvaDualFromBase } from '@/utils/iva-dual-outside'
import { resolveIcmsComplementar } from '@/utils/icms-st-difal'

interface ApplyAbsorptionInput {
  view: ConsolidatedView
  motor: MotorOutput
  policy: AbsorptionPolicy
  rates: TaxRatePeriod[]
  /** Despesas Acessórias consolidadas (frete + seguro + despesas acessórias, R$). */
  desp_acessorias?: number
  /** Ativa ICMS Complementar (LEGADO binário — usado só quando `icms_compl` ausente). */
  icms_compl_applies?: boolean
  /** Hierarquia completa do ICMS Complementar (substitui o binário quando presente). */
  icms_compl?: IcmsComplMotorInput
  /** Data de vigência da operação (YYYY-MM-DD) — habilita IS na base do ICMS Compl. a partir de 2027. */
  effective_date?: string
  /** Fração de desconto aplicada (0..1). Usada para travar a ALÍQUOTA % nos modos protegidos. */
  discount_pct?: number
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

  // Relatório 20/06/2026, Item 2: nos modos protegidos trava-se a ALÍQUOTA (%), não o R$.
  // A parte protegida mantém sua participação na venda → escala por f = (1 − desconto);
  // a parte absorvedora fica com o resíduo do RRO. A soma sempre fecha o RRO (invariante V4).
  const f = 1 - Math.max(0, Math.min(1, Number(input.discount_pct) || 0))

  if (policy === 'COMMISSION_PROTECTED') {
    // "Empresa absorve (Lucro)": comissão protege a alíquota; lucro + CSLL + IRPJ absorvem
    // o resíduo proporcionalmente entre si (CSLL/IRPJ acompanham o lucro).
    const protected_commission = view.commission_amount_original * f
    const residual = motor.rro - protected_commission
    if (residual >= 0) {
      const l0 = view.profit_amount_original
      const s0 = view.csll_amount_original
      const i0 = view.irpj_amount_original
      const base_lsi = l0 + s0 + i0
      final_commission = protected_commission
      if (base_lsi > 0) {
        final_profit = residual * (l0 / base_lsi)
        final_csll = residual * (s0 / base_lsi)
        final_irpj = residual * (i0 / base_lsi)
      } else {
        final_profit = residual
        final_csll = 0
        final_irpj = 0
      }
      profit_absorbed = proportional.new_profit - final_profit
      commission_floor_applied = true
    } else {
      // Comissão protegida estoura o RRO — degrada para proporcional.
      messages.push(
        'COMMISSION_PROTECTED inviável (comissão protegida > RRO); aplicada distribuição proporcional como fallback.',
      )
    }
  } else if (policy === 'PROFIT_PROTECTED') {
    // "Vendedor absorve (Comissão)": lucro protege a alíquota e CSLL/IRPJ o acompanham
    // (também por alíquota); a comissão absorve todo o resíduo.
    const protected_profit = view.profit_amount_original * f
    const protected_csll = view.csll_amount_original * f
    const protected_irpj = view.irpj_amount_original * f
    const residual = motor.rro - protected_profit - protected_csll - protected_irpj
    if (residual >= 0) {
      final_profit = protected_profit
      final_csll = protected_csll
      final_irpj = protected_irpj
      final_commission = residual
      profit_absorbed = proportional.new_profit - final_profit
      commission_floor_applied = true
    } else {
      // Lucro protegido estoura o RRO (comissão não absorve sozinha) — degrada para proporcional.
      messages.push(
        'PROFIT_PROTECTED inviável (lucro protegido > RRO); aplicada distribuição proporcional como fallback.',
      )
    }
  }

  // ───── PDF Etapa 17: tributos por fora (Reforma Tributária / IVA Dual) ─────
  // Bases individualizadas (documento "Bases de Cálculo dos Tributos Por Fora",
  // Conferência Fiscal 2026-06-05). OpDentro = Âncora (operação interna, SEM despesas
  // acessórias). Desp. Acessórias = frete + seguro + despesas acessórias cobradas do cliente.
  //   Base IVA(X) = Âncora − ICMS − ISS − PIS/COFINS
  //   IS          = (X + Desp. Acessórias) × alíq.IS                    (EPIC-POR-FORA-V2 D1)
  //   IBS / CBS   = (X + IS + Desp. Acessórias) × alíq.                 (Desp. compõe a base)
  //   IPI         = (Âncora + Desp. Acessórias) × alíq.IPI              (RIPI; não deduz ICMS)
  //   ICMS Compl. = (IPI + Desp. Acessórias) × alíq.ICMS                (só não contribuinte)
  const desp_acessorias = Math.max(0, Number(input.desp_acessorias) || 0)
  const base_iva = Math.max(0, motor.ancora - motor.icms - motor.iss - motor.pis_cofins)
  const ipi_base = motor.ancora + desp_acessorias

  // Alíquotas do motor são DECIMAIS (0,009 = 0,9%); o núcleo IVA Dual usa base 100 (× 100).
  const is_rate = resolveRate(input.rates, 'IS')
  const ibs_rate = resolveRate(input.rates, 'IBS')
  const cbs_rate = resolveRate(input.rates, 'CBS')
  const ipi_rate = resolveRate(input.rates, 'IPI')
  const icms_rate = resolveRate(input.rates, 'ICMS')

  // NÚCLEO ÚNICO IVA Dual (ADR-017) — mesma matemática usada na formação do produto/modal.
  const iva = computeIvaDualFromBase({
    baseIVA: base_iva,
    ipiBase: ipi_base,
    despAcessorias: desp_acessorias,
    isPct: is_rate * 100,
    ibsPct: ibs_rate * 100,
    cbsPct: cbs_rate * 100,
    ipiPct: ipi_rate * 100,
    icmsPct: icms_rate * 100,
    icmsComplApplies: input.icms_compl_applies,
  })

  const taxes_outside: TaxLine[] = []
  let taxes_outside_total = 0
  const pushLine = (type: TaxType, rate: number, base: number, amount: number) => {
    if (rate <= 0) return
    taxes_outside.push({ type, rate_pct: rate, base, amount })
    taxes_outside_total += amount
  }

  // Etapa 4: IS sobre Base do IS (X + Desp. Acessórias) — D1.
  pushLine('IS', is_rate, iva.baseIS, iva.isValue)
  // Etapas 6-7: IBS e CBS sobre a base com IS e Desp. Acessórias.
  pushLine('IBS', ibs_rate, iva.baseIbsCbs, iva.ibsValue)
  pushLine('CBS', cbs_rate, iva.baseIbsCbs, iva.cbsValue)
  // Etapa 8: IPI destacado sobre Âncora + Desp. Acessórias (RIPI art. 190).
  pushLine('IPI', ipi_rate, iva.ipiBase, iva.ipiValue)
  // ICMS Complementar — hierarquia de ativação completa (documento oficial 2026-06-10):
  // destinatário (contribuinte?) + frete (CIF/FOB) + bloqueio ST/DIFAL + override. A alíquota é
  // herdada (icms_rate) e a base é apurada com o IPI e o IS já calculados (IS só vigora >= 2027).
  // Quando `input.icms_compl` está ausente, mantém o comportamento legado binário (retrocompat).
  const isVigente = (input.effective_date ?? '') >= '2027-01-01'
  const icmsCompl = input.icms_compl
    ? resolveIcmsComplementar({
        isContributor: input.icms_compl.is_contributor,
        freightMode: input.icms_compl.freight_mode,
        stActive: input.icms_compl.st_active,
        difalActive: input.icms_compl.difal_active,
        ipiValue: iva.ipiValue,
        freight: input.icms_compl.freight,
        accessory: input.icms_compl.accessory,
        isValue: iva.isValue,
        icmsRate: icms_rate * 100, // resolveIcmsComplementar usa base 100
        isVigente,
        override: input.icms_compl.override,
      })
    : input.icms_compl_applies
      ? { applies: iva.icmsComplValue > 0, base: iva.icmsComplBase, value: iva.icmsComplValue, reason: 'LEGACY_APPLIES' }
      : { applies: false, base: 0, value: 0, reason: 'LEGACY_OFF' }
  if (icmsCompl.applies) {
    pushLine('ICMS_COMPL', icms_rate, icmsCompl.base, icmsCompl.value)
  }
  // ICMS-ST / DIFAL / FCP: tributos avançados com base própria (BC própria + MVA + presumido−próprio
  // / base simples-dupla), recalculados sobre a âncora pós-desconto, que NÃO integram a cascata do
  // RRO. Vivem em src/utils/icms-st-difal.ts e são consolidados como linha lateral na fiação S4a
  // (orçamento), não aqui. ISS_RETIDO segue como % plano sobre a Base IVA.
  const iss_retido_rate = resolveRate(input.rates, 'ISS_RETIDO')
  pushLine('ISS_RETIDO', iss_retido_rate, base_iva, base_iva * iss_retido_rate)

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

  // ───── Linha 9 (Venda consolidada) — DISPLAY (regra das 3 camadas, 16/06/2026) ─────
  // `view.rb_total` JÁ É Op. Interna + Op. Externa (= base do RRO; após o fix de peso/desp,
  // rb = unit_price − terceirizadas). A "Venda consolidada" física soma a essa base, SEM
  // repetir Op. Interna nem Op. Externa: + Desp. Acessórias (fixa) + Tributos Complementares
  // (ICMS Complementar / ISS Retido). NÃO altera `view.rb_total`: o RRO e o desconto (steps
  // 11-12) seguem sobre a base; aqui só enriquecemos o amount + children EXIBIDOS. No cenário
  // sem desconto e sem complementares, coincide com Op.Interna+Op.Externa+Desp. ICMS-ST/DIFAL/
  // FCP vivem na fiação lateral do orçamento (computeTotalACobrar), fora do motor.
  // FIX duplicação Op. Externa (2026-06-16): `view.rb_total` JÁ É Op. Interna + Op. Externa
  // (após o fix de peso/desp no legacy-adapter, rb = unit_price − terceirizadas = op.interna +
  // op.externa). Logo a Venda Consolidada NÃO pode somar a "Op. por fora" outra vez — ela já
  // está embutida no rb_total; somar duplicava (inflava em ≈ Σ tributos por fora). Pela regra
  // das 3 camadas (16/06): Op.Interna+Op.Externa (= rb_total) → + Desp. Acessórias (fixa) →
  // + Tributos Complementares (ICMS Compl. / ISS Retido), sem repetir nenhum dos dois primeiros.
  const vc_icms_compl = taxes_outside.find((t) => t.type === 'ICMS_COMPL')?.amount ?? 0
  const vc_iss_retido = taxes_outside.find((t) => t.type === 'ISS_RETIDO')?.amount ?? 0
  const vc_adicionais = vc_icms_compl + vc_iss_retido
  const venda_consolidada = view.rb_total + desp_acessorias + vc_adicionais

  // ───── DISPLAY Etapas 11-12 (Engenharia Reversa, Base de Conhecimento Seção 8.10.2) ─────
  // O motor calcula o desconto sobre `rb_total` e absorve a Desp. Acessória via
  // `desp_pool_adjustment` (motor-rro) — a âncora REAL (`motor.ancora`) já está correta. Mas a
  // cascata EXIBIA o desconto sobre `rb_total` (152.117,75) e a âncora pré-absorção
  // (`view.ancora_interna`), contando a história errada de um cálculo certo. Aqui reescrevemos
  // SÓ o display, na ordem documentada: (1) desconto sobre a VENDA CONSOLIDADA total
  // (Op.Int+Op.Ext+Desp.); (2) isola a Desp. Acessória FIXA (imutável ao desconto); (3) o peso
  // incide sobre o Restante. Tudo derivado de `motor.ancora` para casar EXATAMENTE com a Etapa
  // 13 (que usa a âncora real) — base × rate = amount em toda a cadeia.
  const peso_int = view.peso_op_interna_ponderado
  const vc_base_desconto = view.rb_total + desp_acessorias // Venda Consolidada (sem complementares)
  const restante_distribuivel = peso_int > 0 ? motor.ancora / peso_int : motor.ancora
  const op_externa_pos = Math.max(0, restante_distribuivel - motor.ancora) // restante × (1 − peso)
  const pos_desconto_display = restante_distribuivel + desp_acessorias
  const desc_full_display = Math.max(0, vc_base_desconto - pos_desconto_display)
  const dpct_display = vc_base_desconto > 0 ? desc_full_display / vc_base_desconto : 0

  // ───── Atualiza cascade_trace etapas 9, 11, 12, 16 e 17 ─────
  const updated_cascade_trace = motor.cascade_trace.map((step) => {
    if (step.step === 9) {
      return {
        ...step,
        amount: venda_consolidada,
        formula: 'Op. consolidada (Interna+Externa) + Desp. Acessórias + Tributos complementares',
        children: [
          {
            step: 9,
            label: 'Operação consolidada (Op. Interna + Op. Externa)',
            base: null,
            rate: null,
            amount: view.rb_total,
            formula: 'Op Interna + Op Externa (rb_total) — Op. por fora já embutida',
            source: 'ETAPA_7+8',
          },
          ...(desp_acessorias > 0
            ? [{
                step: 9,
                label: 'Desp. Acessórias',
                base: null,
                rate: null,
                amount: desp_acessorias,
                formula: 'Frete + seguro + despesas acessórias',
                source: 'INPUT' as const,
              }]
            : []),
          ...(vc_adicionais > 0
            ? [{
                step: 9,
                label: 'Tributos adicionais (ICMS Compl. / ISS Retido)',
                base: null,
                rate: null,
                amount: vc_adicionais,
                formula: '(IPI + Desp.) × ICMS  +  ISS retido',
                source: 'CAMADA_2' as const,
              }]
            : []),
        ],
      }
    }
    if (step.step === 11) {
      // Desconto sobre a VENDA CONSOLIDADA total (Op.Int + Op.Ext + Desp.), não só rb_total.
      return {
        ...step,
        base: vc_base_desconto,
        rate: dpct_display,
        amount: -desc_full_display,
        formula: 'Venda Consolidada (Op.Int + Op.Ext + Desp.) × desconto_pct',
        children: [
          {
            step: 11,
            label: 'Venda Consolidada pós-desconto',
            base: null,
            rate: null,
            amount: pos_desconto_display,
            formula: 'Venda Consolidada × (1 − desconto)',
            source: 'CAMADA_2' as const,
          },
          ...(desp_acessorias > 0
            ? [{
                step: 11,
                label: '(−) Desp. Acessórias (fixa, imutável ao desconto)',
                base: null,
                rate: null,
                amount: -desp_acessorias,
                formula: 'isola valor fixo (não descontado)',
                source: 'INPUT' as const,
              }]
            : []),
          {
            step: 11,
            label: 'Restante distribuível',
            base: null,
            rate: null,
            amount: restante_distribuivel,
            formula: 'pós-desconto − Desp. Acessórias',
            source: 'CAMADA_2' as const,
          },
        ],
      }
    }
    if (step.step === 12) {
      // Peso incide SÓ sobre o Restante (sem desp nem complementares). Âncora = motor.ancora
      // (REAL, com a absorção da desp já aplicada) → casa exatamente com a Etapa 13.
      return {
        ...step,
        base: restante_distribuivel,
        rate: peso_int,
        amount: motor.ancora,
        formula: 'Restante distribuível × peso_op_interna',
        children: [
          {
            step: 12,
            label: 'Âncora Gerencial (Op. Interna pós-desconto)',
            base: restante_distribuivel,
            rate: peso_int,
            amount: motor.ancora,
            formula: 'restante × peso interno',
            source: 'CAMADA_2' as const,
            peso: peso_int,
          },
          {
            step: 12,
            label: 'Operação Externa (pós-desconto)',
            base: restante_distribuivel,
            rate: 1 - peso_int,
            amount: op_externa_pos,
            formula: 'restante × peso externo',
            source: 'CAMADA_2' as const,
            peso: 1 - peso_int,
          },
        ],
      }
    }
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
              ? 'alíquota protegida × (1−desc) ou absorve resíduo (Camada 2)'
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
              ? 'alíquota protegida × (1−desc) ou absorve resíduo (Camada 2)'
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
            formula: 'rro × peso_irpj_original (ou alíquota protegida × (1−desc) nos modos protegidos)',
            source: 'CAMADA_2',
            peso: view.peso_irpj_original,
          },
          {
            step: 16,
            label: 'CSLL',
            base: null,
            rate: null,
            amount: final_csll,
            formula: 'rro × peso_csll_original (ou alíquota protegida × (1−desc) nos modos protegidos)',
            source: 'CAMADA_2',
            peso: view.peso_csll_original,
          },
        ],
      }
    }
    if (step.step === 17) {
      // DISPLAY (Relatório 20/06/2026, Item 1): a "Consolidação final da operação" deve
      // somar SOMENTE os tributos que são, por natureza, da operação por fora: IBS, CBS,
      // IS, IPI. ICMS_COMPL / ICMS-ST / DIFAL / FCP / ISS_RETIDO pertencem à fiação lateral
      // (Total a cobrar) e NÃO compõem esta consolidação. `view.valor_final` permanece
      // intacto (inclui o ICMS Compl — é o que o cliente paga); aqui só ajustamos a EXIBIÇÃO
      // desta etapa. Cenário do relatório: 147.019,06 − 1.373,77 (ICMS Compl) = 145.645,29.
      const CONSOLIDACAO_TYPES = ['IBS', 'CBS', 'IS', 'IPI']
      const consolidacao_taxes = taxes_outside.filter((t) => CONSOLIDACAO_TYPES.includes(t.type))
      const consolidacao_total = consolidacao_taxes.reduce((acc, t) => acc + t.amount, 0)
      const consolidacao_final = motor.ancora + desp_acessorias + consolidacao_total
      return {
        ...step,
        amount: consolidacao_final,
        formula: 'Âncora + Σ (IBS + CBS + IS + IPI)',
        children: consolidacao_taxes.map((tax) => ({
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
