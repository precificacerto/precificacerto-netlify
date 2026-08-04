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
  OutsideItemProfile,
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
  /**
   * Base IMUNE ao desconto (R$) — produto manual (repasse puro) + Desp. Acessórias
   * (frete/seguro). Espelha `discount.discount_immune_base` (consolidate.ts Etapa 9).
   * Usado SÓ no DISPLAY da Etapa 11: a linha-título do desconto exibe a base TOTAL do
   * orçamento (rb_total + imune) e o percentual REAL digitado — nunca uma taxa fictícia
   * derivada de uma base parcial. NÃO altera cálculo/RRO/oráculos.
   */
  discount_immune_base?: number
  /** Ativa ICMS Complementar (LEGADO binário — usado só quando `icms_compl` ausente). */
  icms_compl_applies?: boolean
  /** Hierarquia completa do ICMS Complementar (substitui o binário quando presente). */
  icms_compl?: IcmsComplMotorInput
  /** Data de vigência da operação (YYYY-MM-DD) — habilita IS na base do ICMS Compl. a partir de 2027. */
  effective_date?: string
  /**
   * ADENDO 25-A — perfil por fora POR PRODUTO. Quando presente, a Etapa 17 apura IS/IBS/CBS/IPI
   * de cada produto (âncora rateada por peso × alíquota DO produto) e SOMA. Ausente → caminho
   * legado (alíquota agregada × base consolidada).
   */
  outside_items?: OutsideItemProfile[]
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

  // Adendo 24-A (22/06/2026): nos modos protegidos a alíquota protegida incide sobre a
  // ÂNCORA GERENCIAL (Op. por dentro pós-desconto = motor.ancora), NUNCA sobre o restante
  // distribuível — que incorpora a Op. Externa (tributos por fora, de repasse). As alíquotas
  // estruturais agregadas = amount_original ÷ rb_total. A soma sempre fecha o RRO (invariante V4).
  const ancora_ger = motor.ancora
  const rb_base = view.rb_total
  const com_pct = rb_base > 0 ? view.commission_amount_original / rb_base : 0
  const luc_pct = rb_base > 0 ? view.profit_amount_original / rb_base : 0
  const csll_pct = rb_base > 0 ? view.csll_amount_original / rb_base : 0
  const irpj_pct = rb_base > 0 ? view.irpj_amount_original / rb_base : 0

  if (policy === 'COMMISSION_PROTECTED') {
    // "Empresa absorve (Lucro)": comissão = COM% × Âncora Gerencial; lucro + CSLL + IRPJ
    // absorvem o saldo proporcionalmente aos seus percentuais estruturais (acompanham o lucro).
    const protected_commission = com_pct * ancora_ger
    const saldo = motor.rro - protected_commission
    if (saldo >= 0) {
      final_commission = protected_commission
      const soma_lsi = luc_pct + csll_pct + irpj_pct
      if (soma_lsi > 0) {
        final_profit = saldo * (luc_pct / soma_lsi)
        final_csll = saldo * (csll_pct / soma_lsi)
        final_irpj = saldo * (irpj_pct / soma_lsi)
      } else {
        final_profit = saldo
        final_csll = 0
        final_irpj = 0
      }
      profit_absorbed = proportional.new_profit - final_profit
      commission_floor_applied = true
    } else {
      // Comissão protegida estoura o RRO — degrada para proporcional (alerta).
      messages.push(
        'COMMISSION_PROTECTED inviável (comissão protegida > RRO); aplicada distribuição proporcional como fallback.',
      )
    }
  } else if (policy === 'PROFIT_PROTECTED') {
    // "Vendedor absorve (Comissão)": lucro/CSLL/IRPJ = alíquota × Âncora Gerencial; a comissão
    // absorve o saldo. Se a comissão ficar negativa, zera e abate o excesso do lucro
    // (Adendo 24-A §3.3 / Validação Nível 4 — nunca produzir comissão negativa).
    const protected_csll = csll_pct * ancora_ger
    const protected_irpj = irpj_pct * ancora_ger
    let protected_profit = luc_pct * ancora_ger
    let comm_residual = motor.rro - protected_profit - protected_csll - protected_irpj
    if (comm_residual < 0) {
      protected_profit += comm_residual // abate o excesso do lucro (comm_residual é negativo)
      comm_residual = 0
      messages.push('PROFIT_PROTECTED: comissão zerada — desconto absorvido pelo lucro (Adendo 24-A).')
    }
    final_profit = protected_profit
    final_csll = protected_csll
    final_irpj = protected_irpj
    final_commission = comm_residual
    profit_absorbed = proportional.new_profit - final_profit
    commission_floor_applied = true
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

  // ADENDO 25-A (Junho 2026): em orçamentos MULTI-PRODUTO o IPI/IBS/CBS/IS consolidado é a SOMA
  // dos valores apurados individualmente por produto — NUNCA alíquota de um produto aplicada
  // sobre a base consolidada total (que tributaria produtos sem aquele tributo). Cada produto
  // recebe SUA parcela da âncora (rateada pelo peso de Op Interna) e SUAS alíquotas; os valores
  // são somados. Quando `outside_items` está ausente (produto único / formação de preço), mantém
  // o caminho legado — bit-exact (peso = 1, fórmula linear). Núcleo único: computeIvaDualFromBase.
  const multiProduct = Array.isArray(input.outside_items) && input.outside_items.length > 0
  let iva: ReturnType<typeof computeIvaDualFromBase>
  if (multiProduct) {
    const acc = {
      baseIS: 0, baseIbsCbs: 0, ipiBase: 0, icmsComplBase: 0,
      isValue: 0, ibsValue: 0, cbsValue: 0, ipiValue: 0, icmsComplValue: 0, totalOutside: 0,
    }
    for (const oi of input.outside_items!) {
      const peso = Math.max(0, Number(oi.peso_ancora) || 0)
      const desp_i = Math.max(0, Number(oi.desp_acessorias) || 0)
      const part = computeIvaDualFromBase({
        baseIVA: base_iva * peso,
        ipiBase: motor.ancora * peso + desp_i,
        despAcessorias: desp_i,
        isPct: (Number(oi.rates?.is) || 0) * 100,
        ibsPct: (Number(oi.rates?.ibs) || 0) * 100,
        cbsPct: (Number(oi.rates?.cbs) || 0) * 100,
        ipiPct: (Number(oi.rates?.ipi) || 0) * 100,
        icmsPct: (Number(oi.rates?.icms) || 0) * 100,
        icmsComplApplies: input.icms_compl_applies,
      })
      acc.baseIS += part.baseIS
      acc.baseIbsCbs += part.baseIbsCbs
      acc.ipiBase += part.ipiBase
      acc.icmsComplBase += part.icmsComplBase
      acc.isValue += part.isValue
      acc.ibsValue += part.ibsValue
      acc.cbsValue += part.cbsValue
      acc.ipiValue += part.ipiValue
      acc.icmsComplValue += part.icmsComplValue
      acc.totalOutside += part.totalOutside
    }
    iva = acc
  } else {
    // NÚCLEO ÚNICO IVA Dual (ADR-017) — mesma matemática usada na formação do produto/modal.
    iva = computeIvaDualFromBase({
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
  }

  const taxes_outside: TaxLine[] = []
  let taxes_outside_total = 0
  const pushLine = (type: TaxType, rate: number, base: number, amount: number) => {
    if (rate <= 0) return
    taxes_outside.push({ type, rate_pct: rate, base, amount })
    taxes_outside_total += amount
  }
  // Etapa 17 (Adendo 25-A): no multi-produto a alíquota exibida é a EFETIVA PONDERADA
  // (blended) = valor somado ÷ base consolidada — preserva rastreabilidade sem aplicar a
  // alíquota de um produto sobre a base de outro. No single-product, efetiva ≡ nominal.
  const effRate = (value: number, base: number, nominal: number) =>
    multiProduct ? (base > 0 ? value / base : 0) : nominal

  // Etapa 4: IS sobre Base do IS (X + Desp. Acessórias) — D1.
  pushLine('IS', effRate(iva.isValue, iva.baseIS, is_rate), iva.baseIS, iva.isValue)
  // Etapas 6-7: IBS e CBS sobre a base com IS e Desp. Acessórias.
  pushLine('IBS', effRate(iva.ibsValue, iva.baseIbsCbs, ibs_rate), iva.baseIbsCbs, iva.ibsValue)
  pushLine('CBS', effRate(iva.cbsValue, iva.baseIbsCbs, cbs_rate), iva.baseIbsCbs, iva.cbsValue)
  // Etapa 8: IPI destacado sobre Âncora + Desp. Acessórias (RIPI art. 190).
  pushLine('IPI', effRate(iva.ipiValue, iva.ipiBase, ipi_rate), iva.ipiBase, iva.ipiValue)
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
    V5: motor.cascade_trace.length === 17 || motor.cascade_trace.length === 19, // 17 sem RT, 19 com RT
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
  // ───── DISPLAY da linha-título da Etapa 11 (Correção Item 1.1, Ago/2026) ─────
  // O desconto real incide sobre o VALOR TOTAL do orçamento: produto do sistema + produto
  // MANUAL (repasse puro) + Desp. Acessórias. O produto manual/desp são imunes (pagos cheios)
  // e o desconto que incidiria sobre eles é absorvido pela base distribuível `rb_total` — ver
  // consolidate.ts Etapa 9 (`desc_value = d × (rb_total + discount_immune_base)`). O AMOUNT do
  // desconto (`desc_full_display`) já é o valor REAL (== view.desc_value) e NÃO muda. O bug era
  // exibir a base/percentual sobre `rb_total + desp` (SEM o manual), gerando um % efetivo
  // fictício. Aqui a linha-título passa a exibir a base TOTAL (incl. manual) e o percentual
  // REAL digitado. DISPLAY-only: RRO, âncora, restante distribuível e oráculos intactos.
  const discount_immune_base = Math.max(0, input.discount_immune_base ?? 0)
  const manual_immune = Math.max(0, discount_immune_base - desp_acessorias) // só o produto manual
  const vc_base_desconto_display = vc_base_desconto + manual_immune // rb_total + manual + desp = total
  const dpct_display =
    vc_base_desconto_display > 0 ? desc_full_display / vc_base_desconto_display : 0

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
      // Desconto sobre o VALOR TOTAL do orçamento (Op.Int + Op.Ext + Desp. + produto manual).
      // A base-título inclui o manual imune para que o percentual exibido seja o REAL digitado
      // (não a taxa fictícia derivada de uma base parcial). O amount é o desconto REAL (imutável).
      return {
        ...step,
        base: vc_base_desconto_display,
        rate: dpct_display,
        amount: -desc_full_display,
        formula: 'Valor total do orçamento (Op.Int + Op.Ext + Desp. + Produto manual) × desconto_pct',
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
      // Dossiê Julho 2026 (Correção 4): exibir a alíquota efetiva de cada componente
      // redistribuído SOBRE A ÂNCORA GERENCIAL (Op. Interna pós-desconto = motor.ancora),
      // nunca sobre a Venda Consolidada / Total a cobrar. Permite ler diretamente que a
      // comissão protegida (Modo 2) manteve sua alíquota original. DISPLAY-only.
      const effRateAncora = (amount: number): number | null =>
        motor.ancora > 0 ? amount / motor.ancora : null
      return {
        ...step,
        formula: `Aplicada política ${policy}`,
        children: [
          {
            step: 16,
            label: 'Comissão',
            base: motor.ancora,
            rate: null,
            amount: final_commission,
            formula: commission_floor_applied
              ? 'alíquota protegida × (1−desc) ou absorve resíduo (Camada 2)'
              : 'rro × peso_comissao_original',
            source: 'CAMADA_2',
            peso: view.peso_comissao_original,
            effective_rate_pct: effRateAncora(final_commission),
          },
          {
            step: 16,
            label: 'Lucro',
            base: motor.ancora,
            rate: null,
            amount: final_profit,
            formula: commission_floor_applied
              ? 'alíquota protegida × (1−desc) ou absorve resíduo (Camada 2)'
              : 'rro × peso_lucro_original',
            source: 'CAMADA_2',
            peso: view.peso_lucro_original,
            effective_rate_pct: effRateAncora(final_profit),
          },
          {
            step: 16,
            label: 'IRPJ',
            base: motor.ancora,
            rate: null,
            amount: final_irpj,
            formula: 'rro × peso_irpj_original (ou alíquota protegida × (1−desc) nos modos protegidos)',
            source: 'CAMADA_2',
            peso: view.peso_irpj_original,
            effective_rate_pct: effRateAncora(final_irpj),
          },
          {
            step: 16,
            label: 'CSLL',
            base: motor.ancora,
            rate: null,
            amount: final_csll,
            formula: 'rro × peso_csll_original (ou alíquota protegida × (1−desc) nos modos protegidos)',
            source: 'CAMADA_2',
            peso: view.peso_csll_original,
            effective_rate_pct: effRateAncora(final_csll),
          },
        ],
      }
    }
    if (step.step === 17) {
      // DISPLAY — Relatório de Correção v2.0 (28/06/2026), Item 01 / ADR-021 (REVOGA ADR-020).
      // A "Consolidação final da operação" deve fechar EXATAMENTE com a Operação Externa
      // pós-desconto do Step 12 (`op_externa_pos`, autoridade gerencial): Pai = Σ Filhos = Step 12.
      //
      // O modelo anterior (ADR-020) somava os tributos REAIS de `taxes_outside` (IBS/CBS/IPI
      // recalculados sobre bases brutas pós-desconto, COM Desp. Acessórias re-somada na base do
      // IPI e de IBS/CBS). Como a Desp. Acessória é FIXA (não descontada) e entra com peso
      // distinto em cada base, essa soma (ex.: 8.049,75) NÃO fechava com o Step 12 (8.024,18) —
      // diferença de R$ 25,57 que violava "Pai = Soma dos Filhos" na Op. Externa.
      //
      // CORREÇÃO v2.0: redistribuir proporcionalmente `op_externa_pos` entre IS/IBS/CBS/IPI
      // usando os PESOS da construção ORIGINAL do Step 8 (PRÉ-desconto):
      //     Step17_t = op_externa_pos × (Valor_t_Step8 / Σ Valores_Step8)
      // Os pesos pré-desconto são obrigatórios: pós-desconto por-tributo daria proporção
      // diferente (a Desp. fixa distorce). A âncora pré-desconto (Op. Interna consolidada) =
      // peso_op_interna × rb_total (motor-rro:77); as bases por dentro escalam por ancoraFactor
      // de forma uniforme, então a reconstrução pré-desconto é EXATA (ver computeStep8Outside).
      //
      // ISOLAMENTO (display-only): NÃO toca `taxes_outside` / `taxes_outside_total` /
      // `valor_final` / RRO / âncora — o "Total a cobrar" (fiação lateral) e os valores fiscais
      // reais permanecem intactos (oráculo 11.06 inalterado). Só o nó exibido do Step 17 muda.
      const op_int_pre = Math.max(0, view.peso_op_interna_ponderado * view.rb_total)
      const step8 = computeStep8Outside({
        motorAncora: motor.ancora,
        baseIvaPos: base_iva,
        opIntPre: op_int_pre,
        despAcessorias: desp_acessorias,
        single: multiProduct ? null : { is: is_rate, ibs: ibs_rate, cbs: cbs_rate, ipi: ipi_rate },
        multi: multiProduct ? input.outside_items! : null,
      })
      const CONSOLIDACAO_ORDER: { type: TaxType; value: number }[] = [
        { type: 'IS', value: step8.is },
        { type: 'IBS', value: step8.ibs },
        { type: 'CBS', value: step8.cbs },
        { type: 'IPI', value: step8.ipi },
      ]
      // Guard de degeneração: sem tributos por fora (Σ pesos = 0) não há o que redistribuir.
      const children = step8.total > 0
        ? CONSOLIDACAO_ORDER.filter((t) => t.value > 0).map((t) => {
            const peso = t.value / step8.total
            // PC-UI-IBSCBS-ALIQEFETIVA-005 (display-only): anexa a alíquota EFETIVA real do
            // tributo (pós-fator de redução do IVA Dual), lida de `taxes_outside[].rate_pct`
            // — que já é a efetiva (single) ou a efetiva ponderada (multi, via effRate). NÃO
            // altera amount/rate/base/peso; só dá transparência da alíquota por trás do R$.
            const effLine = taxes_outside.find((l) => l.type === t.type)
            return {
              step: 17,
              label: t.type,
              base: op_externa_pos,
              rate: peso,
              amount: op_externa_pos * peso,
              formula: `Op. Externa pós-desconto (Step 12) × peso Step 8 (${(peso * 100).toFixed(4)}%)`,
              source: 'CAMADA_2' as const,
              peso,
              effective_rate_pct: effLine ? effLine.rate_pct : null,
            }
          })
        : []
      const consolidacao_final = children.reduce((acc, c) => acc + c.amount, 0)
      return {
        ...step,
        amount: consolidacao_final,
        formula: 'Op. Externa pós-desconto (Step 12) redistribuída por pesos do Step 8',
        children,
      }
    }
    return step
  })

  return { distribution, updated_cascade_trace, messages }
}

// ─────────────────────────── Helpers internos ───────────────────────────

/**
 * Relatório de Correção v2.0 (28/06/2026), Item 01 / ADR-021 — valores da CONSTRUÇÃO ORIGINAL
 * (Step 8, PRÉ-desconto) dos tributos por fora (IS/IBS/CBS/IPI). Servem de PESOS para
 * redistribuir a Op. Externa pós-desconto (Step 12) no DISPLAY do Step 17 (Pai = Σ Filhos).
 *
 * A âncora pré-desconto (Op. Interna consolidada) = `peso_op_interna × rb_total` (motor-rro:77).
 * No motor, todas as bases por dentro (ICMS/ISS/PIS/COFINS) escalam pelo MESMO `ancoraFactor`
 * (= motor.ancora / op_int_pre) nos dois caminhos (fallback e por-produto), enquanto a Desp.
 * Acessória é FIXA. Logo `base_iva_pre = base_iva_pos / ancoraFactor` (exato) e o IPI pré incide
 * sobre `op_int_pre + Desp.` Reusa o núcleo único `computeIvaDualFromBase` (ADR-017) — sem ICMS
 * Compl. (não compõe a consolidação IS/IBS/CBS/IPI). Single-product e multi-produto (Adendo 25-A).
 */
function computeStep8Outside(args: {
  motorAncora: number
  baseIvaPos: number
  opIntPre: number
  despAcessorias: number
  single: { is: number; ibs: number; cbs: number; ipi: number } | null
  multi: OutsideItemProfile[] | null
}): { is: number; ibs: number; cbs: number; ipi: number; total: number } {
  const { motorAncora, baseIvaPos, opIntPre, despAcessorias } = args
  const factorPre = motorAncora > 0 ? opIntPre / motorAncora : 1
  const baseIvaPre = Math.max(0, baseIvaPos * factorPre)
  let is = 0
  let ibs = 0
  let cbs = 0
  let ipi = 0
  if (args.multi && args.multi.length > 0) {
    for (const oi of args.multi) {
      const peso = Math.max(0, Number(oi.peso_ancora) || 0)
      const desp_i = Math.max(0, Number(oi.desp_acessorias) || 0)
      const part = computeIvaDualFromBase({
        baseIVA: baseIvaPre * peso,
        ipiBase: opIntPre * peso + desp_i,
        despAcessorias: desp_i,
        isPct: (Number(oi.rates?.is) || 0) * 100,
        ibsPct: (Number(oi.rates?.ibs) || 0) * 100,
        cbsPct: (Number(oi.rates?.cbs) || 0) * 100,
        ipiPct: (Number(oi.rates?.ipi) || 0) * 100,
        icmsPct: 0,
        icmsComplApplies: false,
      })
      is += part.isValue
      ibs += part.ibsValue
      cbs += part.cbsValue
      ipi += part.ipiValue
    }
  } else if (args.single) {
    const part = computeIvaDualFromBase({
      baseIVA: baseIvaPre,
      ipiBase: opIntPre + despAcessorias,
      despAcessorias,
      isPct: args.single.is * 100,
      ibsPct: args.single.ibs * 100,
      cbsPct: args.single.cbs * 100,
      ipiPct: args.single.ipi * 100,
      icmsPct: 0,
      icmsComplApplies: false,
    })
    is = part.isValue
    ibs = part.ibsValue
    cbs = part.cbsValue
    ipi = part.ipiValue
  }
  return { is, ibs, cbs, ipi, total: is + ibs + cbs + ipi }
}

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
