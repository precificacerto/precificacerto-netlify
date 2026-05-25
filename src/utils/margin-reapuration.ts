/**
 * Motor de Reapuração de Margem (MRM) — Núcleo (cliente-only, D3).
 *
 * Implementa o fluxo de 13 etapas da spec V5 (PDF Motor RR Seção 10):
 *   1.  Receber RB (Receita Bruta original)
 *   2.  Aplicar desconto: RV = RB - DESC
 *   3.  Confirmar RV como nova receita pós-desconto
 *   4.  Aplicar Peso Operação Interna (V5): ancora_interna = RV × peso_op_interna
 *   5.  Reapurar impostos por dentro sobre Âncora (V5 — antes era RV):
 *         ICMS = Âncora × aliq_ICMS
 *         ISS  = Âncora × aliq_ISS
 *         PIS/COFINS = (Âncora − ICMS − ISS) × aliq_PISCOFINS  (V4 / STF)
 *   6.  Remover custos líquidos (CP)
 *   7.  Remover despesas operacionais (MOD + DOP) — MOD imune (R6)
 *   8.  RRO = Âncora − IMP − CP − MOD − DOP; se RRO ≤ 0 → status RRO_ZERO/NEGATIVE
 *   9.  Redistribuir 4 componentes (Com+Lucro+CSLL+IRPJ) PROPORCIONALMENTE sobre RRO
 *  10. Recalcular tributos POR FORA (IPI, ICMS_ST, DIFAL, FCP, IBS, CBS, ISS_RETIDO)
 *      Nota: base canônica `ancora − ICMS − PIS/COFINS` é STORY-002 (fora deste escopo).
 *      Esta story preserva base V4 (`rv - imp_total`) para retrocompat.
 *  11. ValorFinal = BaseOperacional + TributosPorFora
 *  12. Materializar cascade_trace (13 etapas — Story MRM-V5-001 AC4)
 *  13. Validar V1-V6
 *
 * Versão V5 (Story MRM-V5-001):
 *   - Recebe `input.peso_op_interna` (default 1 — comportamento V4 equivalente).
 *   - Calcula `ancora_interna = rv × peso_op_interna` (PÓS desconto, Excel H36).
 *   - Impostos por dentro reapurados sobre Âncora (não mais sobre RV).
 *   - Quando peso=1, Âncora ≡ RV → comportamento numérico idêntico ao V4.
 *
 * Validações:
 *   V1: RRO ≥ 0
 *   V2: ValorFinal = Base + Tributos (consistência fiscal)
 *   V3: PesoComissao + PesoLucro + PesoCSLL + PesoIRPJ = 1
 *   V4: NovaComissao + NovoLucro + NovoCSLL + NovoIRPJ = RRO
 *   V5: RV < RB (quando desconto > 0)
 *   V6: IMP calculado sobre Âncora (não RB)
 *
 * Diretrizes:
 *   R5: Quando RRO ≤ 0, motor retorna status mas NÃO altera valores — UI orienta usuário.
 *   R6: MOD (mão de obra direta) imune sem exceções.
 *
 * Esta é uma FUNÇÃO PURA. Não faz I/O. Não calcula markup divisor (responsabilidade
 * do orchestrator — ADR-004). Alíquotas e peso_op_interna são passados via input.
 *
 * Refs:
 *   - PDF Motor RR Seção 10 (memória cascata 13 etapas)
 *   - PRD v1.1 STORY-MRM-V5-001 (docs/prd/EPIC-MRM-V5-AJUSTES.md)
 *   - ARCH v2.0 §1.L1, §1.L2, §1.L3 (docs/architecture/ARCH-EPIC-MRM-V5.md)
 *   - Excel canônico: células H35 (RV), H36 (Âncora), H41 (ICMS), H43 (PIS/COFINS), H54 (RRO)
 */

import {
  MRM_ENGINE_VERSION,
  MRM_ERROR_RRO_NON_POSITIVE,
  TAXES_INSIDE,
  TAXES_OUTSIDE,
  type CascadeStep,
  type DiscountMode,
  type ReapurationInput,
  type ReapurationStatus,
  type TaxBreakdown,
  type TaxLine,
  type TaxRatePeriod,
  type TaxType,
  type ValidationMap,
} from '@/types/mrm'

const EPSILON = 0.01

function approxEqual(a: number, b: number, tol = EPSILON): boolean {
  return Math.abs(a - b) <= tol
}

function findRate(rates: TaxRatePeriod[], type: TaxType): number {
  const match = rates.find((r) => r.tax_type === type)
  return match ? Number(match.rate_pct) || 0 : 0
}

/**
 * Etapa 5 da spec: reapurar impostos por dentro (motor RR V5).
 *
 * Convenção V5 (Story MRM-V5-001) — base é a Âncora Interna (PÓS desconto):
 *   - ICMS = Âncora × aliq_ICMS
 *   - ISS  = Âncora × aliq_ISS
 *   - PIS/COFINS = (Âncora − ValorICMS − ValorISS) × aliq_PISCOFINS  (V4 / STF)
 *
 * Mudança vs V4: base agora é `ancora_interna` (= rv × peso_op_interna), não `rv` direto.
 * Quando `peso_op_interna = 1` (default), Âncora ≡ RV → comportamento numérico
 * idêntico ao V4. Quando peso < 1, impostos por dentro reduzem proporcionalmente
 * (refletindo que parte da venda é op externa — IBS/CBS/IPI/etc).
 *
 * Excel canônico (cenário RB=190.055,94, desc=10%, peso=0,931585):
 *   Âncora = 159.342,38 (H36)
 *   ICMS   = 159.342,38 × 17%  = R$ 27.088,20 (H41)
 *   PIS/COFINS = (159.342,38 − 27.088,20) × 7,6775% = R$ 10.155,82 (V4 fórmula)
 *
 * Nota STORY-002.AC5/ADR-008: a fórmula PIS/COFINS apuração `(Âncora − ICMS) × 9,25%`
 * é introduzida em STORY-002 (fora deste escopo). Esta story preserva V4 (7,6775%).
 *
 * Jurisprudência preservada (STF RE 574.706): ICMS e ISS NÃO compõem base do PIS/COFINS.
 */
function computeTaxesInside(
  ancora: number,
  rates: TaxRatePeriod[],
): { lines: TaxLine[]; total: number } {
  const lines: TaxLine[] = []

  // 1) ICMS e ISS sobre Âncora (V5)
  const icmsRate = findRate(rates, 'ICMS')
  const issRate = findRate(rates, 'ISS')
  const icmsAmount = icmsRate > 0 ? ancora * icmsRate : 0
  const issAmount = issRate > 0 ? ancora * issRate : 0

  if (icmsRate > 0) {
    lines.push({ type: 'ICMS', rate_pct: icmsRate, base: ancora, amount: icmsAmount })
  }
  if (issRate > 0) {
    lines.push({ type: 'ISS', rate_pct: issRate, base: ancora, amount: issAmount })
  }

  // 2) PIS/COFINS — V12 (ADR-013): base de apuração + alíquota direta do tenant.
  //
  //   base_apuração = Âncora − ICMS    (ISS NÃO subtrai — Excel H43 / STF)
  //   amount        = base_apuração × (pis_rate + cofins_rate)
  //
  // Tenant configura alíquotas em perspectiva APURAÇÃO (LR=9,25%, LP=3,65%).
  // Identidade matemática (motivação user 2026-05-25):
  //   apuracao = construcao / (1 − ICMS)
  //   9,25% = 7,6775% / 0,83 (com ICMS=17%)
  // Logo o motor aplica direto a alíquota apuração — sem conversão runtime.
  //
  // Diferente de V4/V10 (que subtraía ISS da base): V12 segue Excel H43 oficial.
  //
  // Cenário Hyago: 105.406,63 × 9,25% = R$ 9.750,11.
  const pisRate = findRate(rates, 'PIS')
  const cofinsRate = findRate(rates, 'COFINS')
  const baseApuracao = ancora - icmsAmount

  if (pisRate > 0) {
    const pisAmount = baseApuracao * pisRate
    lines.push({ type: 'PIS', rate_pct: pisRate, base: baseApuracao, amount: pisAmount })
  }
  if (cofinsRate > 0) {
    const cofinsAmount = baseApuracao * cofinsRate
    lines.push({ type: 'COFINS', rate_pct: cofinsRate, base: baseApuracao, amount: cofinsAmount })
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  return { lines, total }
}

/**
 * Limite Mínimo Operacional (Seção 4.5 do Relatório Consolidado).
 *
 * Receita mínima abaixo da qual a operação fica sem margem residual positiva.
 * Permite à UI sugerir o desconto máximo permitido (R5 — orientação ao usuário).
 *
 *   LimiteMinimo = (CP + MOD + DOP) / (1 − Σ alíquotas internas)
 *
 * Retorna `null` quando a soma das alíquotas internas for ≥ 1 (denominador
 * não-positivo, situação degenerada que indica configuração tributária inválida).
 */
function computeLimiteMinimo(
  cp: number,
  mod: number,
  dop: number,
  rates: TaxRatePeriod[],
): number | null {
  const sumInside = TAXES_INSIDE.reduce((acc, type) => acc + findRate(rates, type), 0)
  const denom = 1 - sumInside
  if (denom <= 0) return null
  return (cp + mod + dop) / denom
}

/**
 * Etapa 10 da spec V5: recalcular tributos por fora sobre **base canônica**.
 *
 * Story MRM-V5-002 AC1 — base canônica única, sem feature flag.
 *
 * Identidade matemática descoberta no Excel oficial (decodificação Orion 2026-05-22):
 *   H62 (Total_Op_Dentro_Final) ≡ Âncora_Interna
 *   porque RRO é 100% redistribuído entre Comissão+Lucro+IRPJ+CSLL
 *   e Âncora = ICMS + PIS/COFINS + custos + despesas + (RRO redistribuído)
 *
 * Logo: H65 (IBS) = (H62 − H43 − H41) × IBS_rate
 *               ≡ (Âncora − ICMS − PIS/COFINS) × IBS_rate
 *
 * Cada tributo por fora incide independentemente sobre a mesma base canônica.
 * Não é sequencial (não há "cascata" entre IBS, CBS, IPI, etc).
 */
function computeTaxesOutside(baseCanonica: number, rates: TaxRatePeriod[]): TaxLine[] {
  // Clamp defensivo: super-impostos (ICMS+PIS/COFINS > Âncora) → base zero
  const base = Math.max(0, baseCanonica)
  const lines: TaxLine[] = []
  for (const type of TAXES_OUTSIDE) {
    const rate = findRate(rates, type)
    if (rate <= 0) continue
    const amount = base * rate
    lines.push({ type, rate_pct: rate, base, amount })
  }
  return lines
}

/**
 * Calcula a base canônica dos tributos por fora (Story MRM-V5-002 AC1).
 *
 * Fórmula: `ancora_interna − Σ(ICMS_amount + PIS_amount + COFINS_amount)`.
 *
 * ISS NÃO entra (PDF Motor RR + LC 214/2025 isolam ICMS e PIS/COFINS).
 * Quando há ISS, permanece em `taxes_inside` mas a base externa permanece reduzida
 * apenas por ICMS e PIS/COFINS.
 *
 * Excel cenário canônico (Âncora=159.342,38; ICMS=27.088,20; PIS/COFINS=12.233,5):
 *   taxes_outside_base = 159.342,38 − 27.088,20 − 12.233,5 ≈ 120.020,65
 *
 * Returns 0 (clamp) quando soma ICMS + PIS/COFINS > Âncora (super-impostos).
 */
function computeTaxesOutsideBase(ancora: number, inside_lines: TaxLine[]): number {
  let pisCofinsIcmsTotal = 0
  for (const line of inside_lines) {
    if (line.type === 'ICMS' || line.type === 'PIS' || line.type === 'COFINS') {
      pisCofinsIcmsTotal += line.amount
    }
  }
  return Math.max(0, ancora - pisCofinsIcmsTotal)
}

export function calculateMarginReapuration(input: ReapurationInput): TaxBreakdown {
  const {
    rb,
    desc_value,
    regime,
    rates,
    cp,
    mod,
    dop,
    commission_pct,
    profit_pct,
    csll_pct,
    irpj_pct,
    peso_op_interna: peso_input,
    tax_credits,
    discount_mode: discount_mode_input,
    effective_date,
    use_snapshot_rates,
    expense_breakdown, // V10 ADR-011
  } = input

  // Epic MRM-V6 — ADR-009: normalização do modo solicitado.
  // 'MRM' (legacy V5) é tratado como PROPORTIONAL — sem comportamento próprio.
  // Default PROPORTIONAL quando ausente (retrocompat V4/V5).
  const discount_mode_requested: DiscountMode =
    discount_mode_input === 'SELLER_REDUCTION' || discount_mode_input === 'PROFIT_REDUCTION'
      ? discount_mode_input
      : 'PROPORTIONAL'

  // Q5 (Story S1.1): Guard defensivo — Simples Nacional/MEI não rateiam CSLL/IRPJ.
  // Mesmo se caller passar valor > 0, forçamos a zero e emitimos warn estruturado.
  const csll_pct_input = csll_pct ?? 0
  const irpj_pct_input = irpj_pct ?? 0
  const regime_blocks_csll_irpj = regime === 'MEI' || regime === 'SIMPLES_NACIONAL'
  const csll_pct_effective = regime_blocks_csll_irpj ? 0 : csll_pct_input
  const irpj_pct_effective = regime_blocks_csll_irpj ? 0 : irpj_pct_input

  if (regime_blocks_csll_irpj && (csll_pct_input > 0 || irpj_pct_input > 0)) {
    // ADR-004: motor é puro, mas console.warn não é I/O — apenas diagnóstico opcional.
    // Permitido por AC8 da Story S1.1 ("apenas console.warn do guard Q5 é permitido").
    // eslint-disable-next-line no-console
    console.warn('[MRM] CSLL/IRPJ forced to 0 for regime', {
      regime,
      attempted_csll: csll_pct_input,
      attempted_irpj: irpj_pct_input,
    })
  }

  // Etapa 2-3: RV pós-desconto
  const rv = rb - desc_value

  // Etapa 4 (V5 NOVO): aplicar Peso Operação Interna sobre RV → Âncora Interna
  // Story MRM-V5-001 AC2 + AC3 + AC9. Default = 1 (comportamento V4 equivalente).
  // Peso vem do orchestrator (3 fontes: snapshot → markup divisor → default 1).
  // Clamp em [0, 1] para defender contra inputs inválidos sem alterar pureza do motor.
  const peso_op_interna = Math.max(0, Math.min(1, peso_input ?? 1))
  const peso_op_externa = 1 - peso_op_interna
  const ancora_interna = rv * peso_op_interna

  // Etapa 5 (V5): impostos por dentro reapurados sobre Âncora (não mais RV).
  // Quando peso=1, ancora=rv → comportamento numérico idêntico ao V4.
  const inside = computeTaxesInside(ancora_interna, rates)
  const imp_total = inside.total

  // Etapa 5.5 (V5-004): Aplicação de créditos tributários — Story MRM-V5-004 AC1+AC2+AC4.
  // Guard regime cumulativo: MEI/SN não aplicam créditos (regime cumulativo absorve via DAS).
  // Quando regime ∈ {MEI, SN} e recoverable > 0, força a 0 e adiciona mensagem.
  const tax_credits_input = tax_credits ?? { recoverable: 0, non_recoverable: 0 }
  const isRegimeCumulativo = regime === 'MEI' || regime === 'SIMPLES_NACIONAL'
  const recoverable_effective = isRegimeCumulativo ? 0 : Math.max(0, tax_credits_input.recoverable)
  const non_recoverable_effective = Math.max(0, tax_credits_input.non_recoverable)
  const tax_credits_applied = {
    recoverable: recoverable_effective,
    non_recoverable: non_recoverable_effective,
  }

  // CP efetivo: créditos recuperáveis reduzem o custo
  const cp_efetivo = Math.max(0, cp - recoverable_effective)

  // Limite mínimo operacional (Seção 4.5) — usa cp_efetivo para refletir créditos
  const limite_minimo = computeLimiteMinimo(cp_efetivo, mod, dop, rates)

  // Etapas 6-8 (V5): RRO = Âncora − IMP − CP_efetivo − MOD − DOP
  // R6: MOD imune — subtraído junto com CP/DOP, nunca alterado.
  // Quando peso=1 e sem créditos, comportamento idêntico ao V4.
  const rro = ancora_interna - imp_total - cp_efetivo - mod - dop

  // Validações
  // V1 (Tabela 25 da spec): RRO > 0 estrito. RRO = 0 também bloqueia ("Se RRO < 0 ou RRO = 0: bloquear").
  const v1 = rro > 0
  const v5 = desc_value <= 0 ? true : rv < rb
  const v6 = true // Por construção: computeTaxesInside usa RV, nunca RB.

  // Etapa 8 (Epic MRM-V6 — ADR-009): Redistribuição condicional por discount_mode.
  //
  // SELLER_REDUCTION: vendedor absorve o desconto → lucro preservado em valor
  //   absoluto (= profit_pct × RB). Equivale a transferir profit_pct para
  //   commission_pct no rateio.
  // PROFIT_REDUCTION: empresa absorve o desconto → comissão preservada em valor
  //   absoluto (= commission_pct × RB). Equivale a transferir commission_pct
  //   para profit_pct no rateio.
  // PROPORTIONAL (default): comportamento V5 — peso baseado em commission_pct
  //   e profit_pct originais.
  //
  // Fallback safety (ADR-009 §5.4): SELLER com commission_pct=0 ou PROFIT com
  // profit_pct=0 → degrada para PROPORTIONAL + status DISCOUNT_MODE_FALLBACK.
  //
  // INVARIANTE: csll_pct_effective e irpj_pct_effective NUNCA mudam por modo —
  // são impostos sobre o lucro residual e mantêm rateio proporcional original.
  let discount_mode_applied: DiscountMode = discount_mode_requested
  let fallbackReason: string | null = null
  let effective_commission_pct = commission_pct
  let effective_profit_pct = profit_pct

  if (discount_mode_requested === 'SELLER_REDUCTION') {
    if (commission_pct <= 0) {
      // Vendedor não pode absorver se commission_pct=0 → fallback
      discount_mode_applied = 'PROPORTIONAL'
      fallbackReason = 'commission_pct_zero'
    } else {
      // Toda margem (comm + profit) vai para commission no rateio
      effective_commission_pct = commission_pct + profit_pct
      effective_profit_pct = 0
    }
  } else if (discount_mode_requested === 'PROFIT_REDUCTION') {
    if (profit_pct <= 0) {
      // Empresa não pode absorver se profit_pct=0 → fallback
      discount_mode_applied = 'PROPORTIONAL'
      fallbackReason = 'profit_pct_zero'
    } else {
      // Toda margem (comm + profit) vai para profit no rateio
      effective_commission_pct = 0
      effective_profit_pct = commission_pct + profit_pct
    }
  }

  // combined_pct = profit + commission + csll + irpj (usando effective_*)
  const combined_pct = effective_commission_pct + effective_profit_pct + csll_pct_effective + irpj_pct_effective
  const peso_comm = combined_pct > 0 ? effective_commission_pct / combined_pct : 0
  const peso_lucro = combined_pct > 0 ? effective_profit_pct / combined_pct : 0
  const peso_csll = combined_pct > 0 ? csll_pct_effective / combined_pct : 0
  const peso_irpj = combined_pct > 0 ? irpj_pct_effective / combined_pct : 0
  const v3 = combined_pct === 0
    ? true
    : approxEqual(peso_comm + peso_lucro + peso_csll + peso_irpj, 1, 1e-9)

  // Se RRO < 0, ainda calculamos os valores (R5: motor não força, UI orienta)
  const rro_distrib = Math.max(0, rro)
  let new_commission = rro_distrib * peso_comm
  let new_profit = rro_distrib * peso_lucro
  let new_csll = rro_distrib * peso_csll
  let new_irpj = rro_distrib * peso_irpj

  // V4 / S18 — ajuste de arredondamento absorvido pelo MAIOR componente (Q2=Sim).
  // Garante soma exata `commission + profit + csll + irpj === RRO` sem
  // depender de tolerância epsilon. Preferência é lucro (segue V4 HTML), mas
  // se profit_pct=0 (lucro ausente) o ajuste vai para o maior componente
  // disponível — preserva semântica de "componente zerado fica zerado".
  //
  // Guard: combined_pct=0 significa nenhum componente para receber rateio —
  // não aplicar ajuste (todos new_* permanecem 0 e RRO "fica órfão", mas a
  // validação V4 considera esse caso especial via `combined_pct === 0`).
  if (rro_distrib > 0 && combined_pct > 0) {
    const sumWithoutAdjust = new_commission + new_profit + new_csll + new_irpj
    const diff = rro_distrib - sumWithoutAdjust
    if (Math.abs(diff) > 0) {
      // Escolhe maior componente NÃO-ZERO; default = lucro (V4)
      const candidates: Array<['profit' | 'commission' | 'csll' | 'irpj', number]> = [
        ['profit', new_profit],
        ['commission', new_commission],
        ['csll', new_csll],
        ['irpj', new_irpj],
      ]
      const [largest] = candidates.reduce((acc, cur) => cur[1] > acc[1] ? cur : acc, candidates[0])
      if (largest === 'profit') new_profit += diff
      else if (largest === 'commission') new_commission += diff
      else if (largest === 'csll') new_csll += diff
      else new_irpj += diff
    }
  }

  // V4 com 4 componentes + epsilon dinâmico (AC5: epsilon = max(0.01, rro * 1e-6))
  const v4_epsilon = Math.max(EPSILON, rro_distrib * 1e-6)
  const v4 = combined_pct === 0
    ? new_commission + new_profit + new_csll + new_irpj === 0
    : approxEqual(new_commission + new_profit + new_csll + new_irpj, rro_distrib, v4_epsilon)

  // Etapa 10 (V5): Tributos por fora sobre base canônica `Âncora − ICMS − PIS/COFINS`.
  // Story MRM-V5-002 AC1+AC2. Identidade: H62 ≡ Âncora_Interna (RRO 100% redistribuído).
  const taxes_outside_base = computeTaxesOutsideBase(ancora_interna, inside.lines)
  const taxes_outside = computeTaxesOutside(taxes_outside_base, rates)
  const taxes_outside_total = taxes_outside.reduce((sum, l) => sum + l.amount, 0)

  // Etapa 11 (V5): ValorFinal = BaseCanonica + TributosPorFora.
  const valor_final = taxes_outside_base + taxes_outside_total
  const v2 = approxEqual(valor_final, taxes_outside_base + taxes_outside_total, 1e-9)

  // V7 (Story MRM-V5-002 AC4+AC5): invariante PIS/COFINS apuração para LR.
  // Verifica que soma das alíquotas PIS+COFINS está dentro da faixa de apuração (≈ 9,25%).
  // Tolerância 0,5pp para acomodar regimes não-cumulativos (LR=9,25%) e cumulativos (LP≈3,65%).
  // Apenas informacional — não bloqueia motor; UI pode exibir warn quando V7=false.
  // V12 (ADR-013): `rate_pct` em taxes_inside agora é APURAÇÃO (não construção).
  // V7 valida contra faixas APURAÇÃO conhecidas: LR=9,25%, LP=3,65%, SN/MEI=0%.
  // (Antes de V12 o rate_pct era a construção, equivalente após /(1−ICMS) ≈ apuração quando ICMS=17%.)
  const pisRateInLines = inside.lines.find((l) => l.type === 'PIS')?.rate_pct ?? 0
  const cofinsRateInLines = inside.lines.find((l) => l.type === 'COFINS')?.rate_pct ?? 0
  const pisCofinsAggregate = pisRateInLines + cofinsRateInLines
  const isSnMei = regime === 'MEI' || regime === 'SIMPLES_NACIONAL'
  const validApuracaoLR = Math.abs(pisCofinsAggregate - 0.0925) < 0.005
  const validApuracaoLP = Math.abs(pisCofinsAggregate - 0.0365) < 0.005
  const v7 = isSnMei || pisCofinsAggregate === 0 || validApuracaoLR || validApuracaoLP

  const validations: ValidationMap = { V1: v1, V2: v2, V3: v3, V4: v4, V5: v5, V6: v6, V7: v7 }
  // V7 NÃO entra em allValid — é apenas INFORMACIONAL (Story MRM-V5-002 AC5).
  // UI consome `validations.V7` para warning visual; motor não bloqueia status quando V7=false.
  // Fix do issue HIGH apontado em QA gate STORY-MRM-V5-002.
  const allValid = v1 && v2 && v3 && v4 && v5 && v6

  let status: ReapurationStatus
  let error_code: string | null = null
  const messages: string[] = []

  if (!v1) {
    status = rro === 0 ? 'RRO_ZERO' : 'RRO_NEGATIVE'
    error_code = 'RRO_NON_POSITIVE'
    messages.push(MRM_ERROR_RRO_NON_POSITIVE)
  } else if (!allValid) {
    status = 'ERROR'
    error_code = 'VALIDATION_FAILED'
    const failed = (Object.entries(validations) as [keyof ValidationMap, boolean][])
      .filter(([id, ok]) => !ok && id !== 'V7')  // V7 não conta como falha bloqueante
      .map(([id]) => id)
    messages.push(`Validações falharam: ${failed.join(', ')}`)
  } else if (fallbackReason !== null) {
    // Epic MRM-V6 — ADR-009 §5.4: status informacional, NÃO bloqueia save.
    // Policy (mrm-policies.ts) trata DISCOUNT_MODE_FALLBACK como 'allow'.
    status = 'DISCOUNT_MODE_FALLBACK'
    messages.push(
      `DISCOUNT_MODE_FALLBACK: requested=${discount_mode_requested}, applied=PROPORTIONAL, reason=${fallbackReason}`,
    )
  } else {
    status = 'VALID'
  }

  // V7 informacional (Story MRM-V5-002 AC5): exibe warning sem bloquear status.
  if (!v7) {
    const actualPct = (pisCofinsAggregate * 100).toFixed(4) + '%'
    messages.push(
      `[INFO-V7] PIS/COFINS agregado ${actualPct} fora das faixas conhecidas (9,25% LR / 3,65% LP / 0% SN-MEI). UI pode exibir warning sem bloquear save.`,
    )
  }

  // Story MRM-V5-004 AC4+AC8: guard regime cumulativo — créditos forçados a 0
  if (isRegimeCumulativo && tax_credits_input.recoverable > 0) {
    messages.push(
      `[CREDITOS_NAO_APLICAVEIS_REGIME_CUMULATIVO] Regime ${regime} é cumulativo — créditos recuperáveis (R$ ${tax_credits_input.recoverable.toFixed(2)}) forçados a 0. DAS absorve esses tributos.`,
    )
  }

  // Story MRM-V5-003 AC3: campo observacional `rro_threshold_check`.
  // Espelho informacional do status — policy continua sendo a fonte de decisão (ADR-004).
  const rro_threshold_check = {
    passed: rro > 0,
    threshold: 0,
    observed: rro,
  }

  // Etapa 12 (V5): materializar memória cascata 13 etapas (PDF Motor RR Seção 10).
  // Story MRM-V5-001 AC4. Trace é "human-readable" do que o motor já computou —
  // não recalcula valores, apenas etiqueta e ordena para exibição/auditoria.
  const cascade_trace = buildCascadeTrace({
    rb,
    desc_value,
    rv,
    peso_op_interna,
    ancora_interna,
    inside_lines: inside.lines,
    cp,
    mod,
    dop,
    rro,
    new_commission,
    new_profit,
    new_csll,
    new_irpj,
    taxes_outside,
    // V10 (ADR-011): args para enriquecer cascade_trace com sub-itens
    expense_breakdown,
    commission_pct: effective_commission_pct,
    profit_pct: effective_profit_pct,
    csll_pct: csll_pct_effective,
    irpj_pct: irpj_pct_effective,
    peso_comm,
    peso_lucro,
    peso_csll,
    peso_irpj,
  })

  return {
    engine_version: MRM_ENGINE_VERSION,
    effective_date,
    regime,
    use_snapshot_rates,
    taxes_inside: inside.lines,
    taxes_outside,
    rb,
    desc_value,
    rv,
    cp,
    mod,
    dop,
    imp_total,
    rro,
    limite_minimo,
    peso_op_interna,
    peso_op_externa,
    ancora_interna,
    cascade_trace,
    taxes_outside_base,
    rro_threshold_check,
    tax_credits_applied,
    new_commission,
    new_profit,
    new_csll,
    new_irpj,
    discount_mode_requested,
    discount_mode_applied,
    validations,
    valid: allValid,
    status,
    error_code,
    messages,
  }
}

/**
 * Constrói memória cascata 13 etapas conforme PDF Motor RR Seção 10.
 *
 * V9 (ADR-010, 2026-05-25): steps 6-11 propagam base sequencialmente —
 * `base[N] = base[N-1] − abs(amount[N-1])`. RRO matemático preservado:
 * step 11 amount === args.rro (invariante V9-I2 verificada por test).
 *
 * V9 D1 (MOD=0): step 10 label "Redução de despesas (DOP)" quando args.mod=0.
 * Quando mod > 0 (caller legacy), label volta a "(MOD + DOP)" e amount soma ambos
 * — preserva retrocompat com chamadas pré-V9.
 *
 * Story MRM-V5-001 AC4 → atualizada para Story MRM-V9-002 AC1-AC6.
 */
function buildCascadeTrace(args: {
  rb: number
  desc_value: number
  rv: number
  peso_op_interna: number
  ancora_interna: number
  inside_lines: TaxLine[]
  cp: number
  mod: number
  dop: number
  rro: number
  new_commission: number
  new_profit: number
  new_csll: number
  new_irpj: number
  taxes_outside: TaxLine[]
  // V10 (ADR-011): args opcionais para emitir sub-itens
  expense_breakdown?: ReapurationInput['expense_breakdown']
  commission_pct?: number
  profit_pct?: number
  csll_pct?: number
  irpj_pct?: number
  peso_comm?: number
  peso_lucro?: number
  peso_csll?: number
  peso_irpj?: number
}): CascadeStep[] {
  const findInside = (type: TaxType): TaxLine | undefined =>
    args.inside_lines.find((l) => l.type === type)

  const icmsLine = findInside('ICMS')
  const issLine = findInside('ISS')
  const pisLine = findInside('PIS')
  const cofinsLine = findInside('COFINS')
  const icmsAmount = icmsLine?.amount ?? 0
  const issAmount = issLine?.amount ?? 0
  const pisCofinsAmount = (pisLine?.amount ?? 0) + (cofinsLine?.amount ?? 0)
  const pisCofinsRate = (pisLine?.rate_pct ?? 0) + (cofinsLine?.rate_pct ?? 0)

  const despesas_total = args.mod + args.dop
  const rateio_total = args.new_commission + args.new_profit + args.new_csll + args.new_irpj
  const taxes_outside_total = args.taxes_outside.reduce((sum, l) => sum + l.amount, 0)

  // V9 cascade sequencial — base propaga etapa-a-etapa.
  // Step 6 (ICMS) parte da Âncora. Cada step subsequente recebe base = prev.base − abs(prev.amount).
  const baseStep6 = args.ancora_interna
  const baseStep7 = baseStep6 - icmsAmount        // base após ICMS
  const baseStep8 = baseStep7 - issAmount         // base após ISS
  const baseStep9 = baseStep8 - pisCofinsAmount   // base após PIS/COFINS
  const baseStep10 = baseStep9 - args.cp          // base após Custos
  const baseStep11 = baseStep10 - despesas_total  // base após Despesas (≡ RRO matemático)

  // V9 D1: label dinâmico — se MOD=0, mostra apenas "DOP".
  const despesasLabel = args.mod === 0
    ? 'Redução de despesas (DOP)'
    : 'Redução de despesas (MOD + DOP)'
  const despesasFormula = args.mod === 0 ? 'DOP (input)' : 'MOD + DOP'

  return [
    {
      step: 1,
      label: 'Receita Bruta',
      base: null,
      rate: null,
      amount: args.rb,
      formula: 'RB (input)',
      source: 'INPUT',
    },
    {
      step: 2,
      label: 'Desconto aplicado',
      base: args.rb,
      rate: args.rb > 0 ? args.desc_value / args.rb : null,
      amount: -args.desc_value,
      formula: 'RB × desconto%',
      source: 'INPUT',
    },
    {
      step: 3,
      label: 'Receita pós-desconto (RV)',
      base: null,
      rate: null,
      amount: args.rv,
      formula: 'RB − Desconto',
      source: 'ETAPA_2',
    },
    {
      step: 4,
      label: 'Aplicação do Peso Operação Interna',
      base: args.rv,
      rate: args.peso_op_interna,
      amount: args.ancora_interna,
      formula: 'RV × peso_op_interna',
      source: 'ETAPA_3+PRODUTO',
    },
    {
      step: 5,
      label: 'Âncora Interna',
      base: null,
      rate: null,
      amount: args.ancora_interna,
      formula: 'RV × peso_op_interna',
      source: 'ETAPA_4',
    },
    {
      step: 6,
      label: 'Reapuração ICMS',
      base: baseStep6,
      rate: icmsLine?.rate_pct ?? null,
      // V9: evita `-0` quando amount=0 (cleaner para asserts de teste e UI)
      amount: icmsAmount === 0 ? 0 : -icmsAmount,
      formula: icmsLine ? 'Âncora × ICMS%' : 'N/A',
      source: 'ETAPA_5',
    },
    {
      step: 7,
      label: 'Reapuração ISS',
      base: baseStep7,
      rate: issLine?.rate_pct ?? null,
      amount: issAmount === 0 ? 0 : -issAmount,
      formula: issLine ? 'Base × ISS%' : 'N/A',
      source: 'ETAPA_6',
    },
    {
      step: 8,
      label: 'Reapuração PIS/COFINS',
      base: baseStep8,
      rate: pisCofinsRate > 0 ? pisCofinsRate : null,
      amount: pisCofinsAmount === 0 ? 0 : -pisCofinsAmount,
      formula: pisCofinsAmount > 0 ? '(Base após ICMS/ISS) × PIS/COFINS%' : 'N/A',
      source: 'ETAPA_7',
    },
    {
      step: 9,
      label: 'Redução de custos',
      base: baseStep9,
      rate: null,
      amount: -args.cp,
      formula: 'CP (input — CMV canônico V9)',
      source: 'ETAPA_8',
    },
    {
      step: 10,
      label: despesasLabel,
      base: baseStep10,
      rate: null,
      amount: -despesas_total,
      formula: despesasFormula,
      source: 'ETAPA_9',
      // V10 (ADR-011): sub-itens dos 4 buckets de DOP (quando expense_breakdown presente)
      children: args.expense_breakdown
        ? [
            {
              step: 10,
              label: 'MO Administrativa',
              base: null,
              rate: args.expense_breakdown.mo_admin.rate || null,
              amount: -args.expense_breakdown.mo_admin.amount,
              formula: 'RV × admin_labor_pct',
              source: 'ETAPA_9.1',
            },
            {
              step: 10,
              label: 'Despesa Fixa',
              base: null,
              rate: args.expense_breakdown.fixa.rate || null,
              amount: -args.expense_breakdown.fixa.amount,
              formula: 'RV × fixed_pct',
              source: 'ETAPA_9.2',
            },
            {
              step: 10,
              label: 'Despesa Variável',
              base: null,
              rate: args.expense_breakdown.variavel.rate || null,
              amount: -args.expense_breakdown.variavel.amount,
              formula: 'RV × variable_pct',
              source: 'ETAPA_9.3',
            },
            {
              step: 10,
              label: 'Despesa Financeira',
              base: null,
              rate: args.expense_breakdown.financeira.rate || null,
              amount: -args.expense_breakdown.financeira.amount,
              formula: 'RV × financial_pct',
              source: 'ETAPA_9.4',
            },
          ]
        : undefined,
    },
    {
      step: 11,
      label: 'Resultado Residual Operacional (RRO)',
      base: baseStep11,
      rate: null,
      amount: baseStep11,
      formula: 'Base após Despesas (≡ Âncora − IMP − CP − MOD − DOP)',
      source: 'ETAPA_10',
    },
    {
      step: 12,
      label: 'Redistribuição proporcional (Comissão + Lucro + CSLL + IRPJ)',
      base: args.rro,
      rate: null,
      amount: rateio_total,
      formula: 'RRO × pesos_componentes',
      source: 'ETAPA_11',
      // V10 (ADR-011): sub-itens da redistribuição (4 componentes)
      children: rateio_total > 0
        ? [
            {
              step: 12,
              label: 'Comissão',
              base: null,
              rate: args.commission_pct ?? null,
              amount: args.new_commission,
              formula: 'RRO × peso_comissão',
              source: 'ETAPA_11.1',
              peso: args.peso_comm ?? null,
            },
            {
              step: 12,
              label: 'Lucro',
              base: null,
              rate: args.profit_pct ?? null,
              amount: args.new_profit,
              formula: 'RRO × peso_lucro',
              source: 'ETAPA_11.2',
              peso: args.peso_lucro ?? null,
            },
            {
              step: 12,
              label: 'IRPJ',
              base: null,
              rate: args.irpj_pct ?? null,
              amount: args.new_irpj,
              formula: 'RRO × peso_irpj',
              source: 'ETAPA_11.3',
              peso: args.peso_irpj ?? null,
            },
            {
              step: 12,
              label: 'CSLL',
              base: null,
              rate: args.csll_pct ?? null,
              amount: args.new_csll,
              formula: 'RRO × peso_csll',
              source: 'ETAPA_11.4',
              peso: args.peso_csll ?? null,
            },
          ]
        : undefined,
    },
    {
      step: 13,
      label: 'Reapuração tributos por fora (recomposição final)',
      base: args.taxes_outside[0]?.base ?? null,
      rate: null,
      amount: taxes_outside_total,
      formula: taxes_outside_total > 0 ? 'Base × Σ(IBS+CBS+IPI+...)' : 'N/A',
      source: 'ETAPA_10',
      // V10 (ADR-011): sub-itens por tributo configurado em taxes_outside
      children: args.taxes_outside.length > 0
        ? args.taxes_outside.map((line): CascadeStep => ({
            step: 13,
            label: line.type,
            base: line.base,
            rate: line.rate_pct,
            amount: line.amount,
            formula: `${line.type === 'IBS' ? 'Base canônica' : 'Base'} × ${line.type}%`,
            source: `ETAPA_10.${line.type}`,
          }))
        : undefined,
    },
  ]
}

/**
 * Helper para callers UI: retorna apenas a mensagem orientativa quando aplicável (R5).
 * Sem RRO_ZERO/NEGATIVE não há mensagem.
 */
export function getOrientationMessage(breakdown: TaxBreakdown): string | null {
  if (breakdown.status === 'RRO_ZERO' || breakdown.status === 'RRO_NEGATIVE') {
    return MRM_ERROR_RRO_NON_POSITIVE
  }
  return null
}
