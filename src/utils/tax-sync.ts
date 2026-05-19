/**
 * Tax Sync — Sincronização Tributária Formação de Preço ↔ Motor RR
 *
 * Spec: Documento_Oficial_Resultado_Residual_Atualizado.pdf — Seção 7
 *
 *   "As alíquotas de IRPJ/CSLL deverão ser obrigatoriamente as mesmas
 *    configuradas na Formação de Preço."
 *
 * ADR-006: Single source of truth para componentes tributários separados.
 * `calc-tax-preview.ts` (Formação de Preço) e o Motor de Reapuração V2
 * DEVEM consumir esta mesma função para garantir paridade bit a bit.
 *
 * Esta é uma FUNÇÃO PURA. Não faz I/O. Caller é responsável por carregar
 * `tenant_settings`, `lucro_presumido_rates`, `simples_nacional_brackets`
 * antes de invocar. Para fetch + cálculo conjunto, use `loadTenantTaxComponents`.
 *
 * Diferença vs `calc-tax-preview.ts`:
 *   - `calc-tax-preview.ts` retorna AGREGADO (`effectiveTaxPct`) para UI
 *   - `tax-sync.ts` retorna COMPONENTES SEPARADOS para o motor RR
 *
 * Invariante de paridade (CI):
 *   sum(components) === calc_tax_preview.effectiveTaxPct  (± R$ 0,01)
 */

import { supabase } from '@/supabase/client'

/**
 * Componentes tributários separados, todos em decimal (0.05 = 5%).
 * Para o motor RR, `irpj` e `csll` são consumidos diretamente como
 * `irpj_pct` e `csll_pct`. Os demais somam para `effectiveTaxPct`.
 */
export interface TaxComponents {
  /** ICMS por dentro (decimal). 0 se serviço ou não-contribuinte. */
  icms: number
  /** PIS por dentro (decimal). Combinado com cofins em alguns regimes. */
  pis: number
  /** COFINS por dentro (decimal). Combinado com pis em alguns regimes. */
  cofins: number
  /** ISS por dentro (decimal). 0 se não-serviço. */
  iss: number
  /** IRPJ efetivo (decimal). Para RR rateio (Seção 3 do PDF). */
  irpj: number
  /** CSLL efetivo (decimal). Para RR rateio (Seção 3 do PDF). */
  csll: number
  /** Soma de todos os componentes (decimal). Equivalente a `effectiveTaxPct`. */
  total: number
  /** Regime tributário origem do cálculo. */
  regime: string
  /** Label legível para diagnóstico. */
  label: string
  /** Flag MEI (sem rateio RR). */
  isMei: boolean
}

/**
 * Input puro para `extractEffectiveTaxComponents`. Caller carrega tudo antes.
 */
export interface TaxComponentsInput {
  /** Row de `tenant_settings`. */
  tenantSettings: Record<string, unknown>
  /** Tipo de cálculo do tenant (`INDUSTRIALIZACAO`, `REVENDA`, `SERVICO`). */
  calcType: string
  /** Alíquota ICMS interna do estado de origem (decimal 0-1). */
  icmsRateDecimal: number
  /** Row de `tenant_expense_config` (para profit_margin_percent). */
  expenseConfig: Record<string, unknown> | null
  /** Row de `lucro_presumido_rates` filtrado pela atividade do tenant. */
  lpRate: Record<string, unknown> | null
  /** Bracket vigente do Simples Nacional (quando aplicável). */
  simplesBracket: Record<string, unknown> | null
}

const ZERO_COMPONENTS = (regime: string, label: string, isMei = false): TaxComponents => ({
  icms: 0,
  pis: 0,
  cofins: 0,
  iss: 0,
  irpj: 0,
  csll: 0,
  total: 0,
  regime,
  label,
  isMei,
})

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function normalizeAnexo(raw: string): string {
  if (!raw) return 'I'
  return raw.replace(/^ANEXO_/i, '')
}

/**
 * Função PURA: extrai componentes tributários separados a partir das
 * configurações do tenant. Substitui internamente o cálculo agregado de
 * `calc-tax-preview.ts` por uma versão componentizada.
 *
 * IRPJ/CSLL são calculados aqui exatamente como na Formação de Preço,
 * garantindo a sincronização exigida pela Seção 7 do PDF.
 */
export function extractEffectiveTaxComponents(input: TaxComponentsInput): TaxComponents {
  const { tenantSettings: ts, calcType, icmsRateDecimal, expenseConfig, lpRate, simplesBracket } = input

  const regime: string = (ts.tax_regime as string) || 'SIMPLES_NACIONAL'

  // ───────── MEI ─────────
  if (regime === 'MEI') {
    return ZERO_COMPONENTS('MEI', 'MEI', true)
  }

  // ───────── SIMPLES NACIONAL ─────────
  if (regime === 'SIMPLES_NACIONAL') {
    const anexo = normalizeAnexo((ts.simples_anexo as string) || '')
    const revenue12m = Number(ts.simples_revenue_12m) || 0

    if (!simplesBracket) {
      return ZERO_COMPONENTS('SIMPLES_NACIONAL', 'Simples Nacional')
    }

    const nominalRate = Number(simplesBracket.nominal_rate) || 0
    const deduction = Number(simplesBracket.deduction) || 0
    const effectiveRate = revenue12m > 0
      ? (revenue12m * nominalRate - deduction) / revenue12m
      : nominalRate
    const total = round4(effectiveRate)

    // Simples Nacional: IRPJ/CSLL embutidos no DAS — NÃO rateiam separadamente
    // no motor RR (guard Q5 já força a 0 para regimes MEI/SIMPLES_NACIONAL).
    return {
      icms: 0,
      pis: 0,
      cofins: 0,
      iss: 0,
      irpj: 0,
      csll: 0,
      total,
      regime: 'SIMPLES_NACIONAL',
      label: `Simples Nacional (Anexo ${anexo})`,
      isMei: false,
    }
  }

  // ───────── SIMPLES HÍBRIDO ─────────
  if (regime === 'SIMPLES_HIBRIDO') {
    // Espelha LUCRO_REAL: PIS/COFINS não-cumulativo (9,25%), ICMS por dentro,
    // IRPJ 15% + CSLL 9% sobre lucro projetado.
    let shIcms = 0
    if (calcType !== 'SERVICO' && ts.icms_contribuinte) {
      shIcms = icmsRateDecimal
    }

    const pisCofinsNominal = 0.0925
    const pisCofinsTotal = calcType === 'SERVICO'
      ? pisCofinsNominal
      : shIcms > 0
        ? pisCofinsNominal * (1 - shIcms)
        : pisCofinsNominal
    // Decomposição PIS/COFINS na proporção legal 1,65/7,60 (não-cumulativo)
    const shPis = round4(pisCofinsTotal * (0.0165 / 0.0925))
    const shCofins = round4(pisCofinsTotal - shPis)

    const shIss = calcType === 'SERVICO'
      ? Number(ts.iss_municipality_rate) || 0.05
      : 0

    const profitPctRaw = Number(expenseConfig?.profit_margin_percent) || 0.12
    const profitPct = profitPctRaw > 0 && profitPctRaw < 1 ? profitPctRaw : profitPctRaw / 100
    const shIrpj = round4(profitPct * 0.15)
    const shCsll = round4(profitPct * 0.09)

    const total = round4(shIcms + shPis + shCofins + shIss + shIrpj + shCsll)
    return {
      icms: round4(shIcms),
      pis: shPis,
      cofins: shCofins,
      iss: round4(shIss),
      irpj: shIrpj,
      csll: shCsll,
      total,
      regime: 'SIMPLES_HIBRIDO',
      label: 'Simples Híbrido',
      isMei: false,
    }
  }

  // ───────── LUCRO PRESUMIDO RET ─────────
  if (regime === 'LUCRO_PRESUMIDO_RET') {
    // ret_rate compõe IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41% = 4,00%
    const retRate = Number(ts.ret_rate) || 0.04
    const retIssSeparate = ts.ret_iss_separate !== false
    const issRate = retIssSeparate ? Number(ts.iss_municipality_rate) || 0 : 0

    // Decomposição RET proporcional ao 4% padrão
    const factor = retRate / 0.04
    const irpjRet = round4(0.0171 * factor)
    const csllRet = round4(0.0051 * factor)
    const pisRet = round4(0.0037 * factor)
    const cofinsRet = round4(0.0141 * factor)

    const total = round4(retRate + issRate)
    return {
      icms: 0,
      pis: pisRet,
      cofins: cofinsRet,
      iss: round4(issRate),
      irpj: irpjRet,
      csll: csllRet,
      total,
      regime: 'LUCRO_PRESUMIDO_RET',
      label: `Lucro Presumido RET (${(retRate * 100).toFixed(2)}%)`,
      isMei: false,
    }
  }

  // ───────── LUCRO PRESUMIDO ─────────
  if (regime === 'LUCRO_PRESUMIDO') {
    let lpIcms = 0
    if (calcType !== 'SERVICO' && ts.icms_contribuinte) {
      lpIcms = icmsRateDecimal
    }

    const pisCofinsTotal = calcType === 'SERVICO'
      ? 0.0365
      : lpIcms > 0
        ? 0.0365 * (1 - lpIcms)
        : 0.0365
    // Decomposição PIS/COFINS cumulativo na proporção legal 0,65/3,00
    const lpPis = round4(pisCofinsTotal * (0.0065 / 0.0365))
    const lpCofins = round4(pisCofinsTotal - lpPis)

    const lpIss = calcType === 'SERVICO'
      ? Number(ts.iss_municipality_rate) || 0.05
      : 0

    const irpjRateAliq = lpRate ? Number(lpRate.irpj_rate) : 0.15
    const csllRateAliq = lpRate ? Number(lpRate.csll_rate) : 0.09
    const irpjPresumptionPct = ts.lp_irpj_presumption_percent != null
      ? Number(ts.lp_irpj_presumption_percent)
      : lpRate ? Number(lpRate.irpj_presumption_percent) : 0.08
    const csllPresumptionPct = ts.lp_csll_presumption_percent != null
      ? Number(ts.lp_csll_presumption_percent)
      : lpRate ? Number(lpRate.csll_presumption_percent) : 0.12

    const irpjEquiv = irpjPresumptionPct * irpjRateAliq
    const csllEquiv = csllPresumptionPct * csllRateAliq

    // Adicional IRPJ 10% sobre excedente de R$ 240k/ano de lucro presumido.
    // FUTURE WORK: motor RR não consome esse adicional separadamente; somamos
    // ao irpj para preservar paridade com calc-tax-preview, mas registramos
    // que valor distribuído no rateio inclui o adicional.
    const IRPJ_ADICIONAL_LIMITE_ANUAL = 240000
    let lpIrpjAdditional = 0
    const annualRevenue = Number(ts.lp_estimated_annual_revenue) || 0
    if (annualRevenue > 0) {
      const irpjBase = annualRevenue * irpjPresumptionPct
      const excedente = Math.max(0, irpjBase - IRPJ_ADICIONAL_LIMITE_ANUAL)
      if (excedente > 0) {
        lpIrpjAdditional = (excedente * 0.10) / annualRevenue
      }
    }

    const lpIrpj = round4(irpjEquiv + lpIrpjAdditional)
    const lpCsll = round4(csllEquiv)

    const total = round4(lpIcms + lpPis + lpCofins + lpIss + lpIrpj + lpCsll)
    return {
      icms: round4(lpIcms),
      pis: lpPis,
      cofins: lpCofins,
      iss: round4(lpIss),
      irpj: lpIrpj,
      csll: lpCsll,
      total,
      regime: 'LUCRO_PRESUMIDO',
      label: 'Lucro Presumido',
      isMei: false,
    }
  }

  // ───────── LUCRO REAL ─────────
  if (regime === 'LUCRO_REAL') {
    let lrIcms = 0
    if (calcType !== 'SERVICO' && ts.icms_contribuinte) {
      lrIcms = icmsRateDecimal
    }

    const pisCofinsTotal = calcType === 'SERVICO'
      ? 0.0925
      : lrIcms > 0
        ? 0.0925 * (1 - lrIcms)
        : 0.0925
    const lrPis = round4(pisCofinsTotal * (0.0165 / 0.0925))
    const lrCofins = round4(pisCofinsTotal - lrPis)

    const lrIss = calcType === 'SERVICO'
      ? Number(ts.iss_municipality_rate) || 0.05
      : 0

    const profitPctRaw = Number(expenseConfig?.profit_margin_percent) || 0.12
    const profitPct = profitPctRaw > 0 && profitPctRaw < 1 ? profitPctRaw : profitPctRaw / 100
    const lrIrpj = round4(profitPct * 0.15)
    const lrCsll = round4(profitPct * 0.09)

    const total = round4(lrIcms + lrPis + lrCofins + lrIss + lrIrpj + lrCsll)
    return {
      icms: round4(lrIcms),
      pis: lrPis,
      cofins: lrCofins,
      iss: round4(lrIss),
      irpj: lrIrpj,
      csll: lrCsll,
      total,
      regime: 'LUCRO_REAL',
      label: 'Lucro Real',
      isMei: false,
    }
  }

  return ZERO_COMPONENTS(regime, regime)
}

/**
 * Cliente conveniente que faz fetch + cálculo. Use em hooks/SWR.
 * A função pura é `extractEffectiveTaxComponents` — esta apenas faz I/O.
 */
export async function loadTenantTaxComponents(tenantId: string): Promise<TaxComponents> {
  const [settingsRes, statesRes, expenseRes] = await Promise.all([
    supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).single(),
    supabase.from('brazilian_states').select('code, icms_internal_rate'),
    supabase
      .from('tenant_expense_config')
      .select('profit_margin_percent')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ])

  const ts = settingsRes.data
  if (!ts) return ZERO_COMPONENTS('UNCONFIGURED', 'Não configurado')

  const regime: string = ts.tax_regime || 'SIMPLES_NACIONAL'
  const calcType: string = ts.calc_type || 'INDUSTRIALIZACAO'
  const originState: string = ts.state_code || 'SP'

  const stateRow = (statesRes.data || []).find((s: { code: string }) => s.code === originState) as
    | { icms_internal_rate?: number }
    | undefined
  const icmsRateRaw = Number(stateRow?.icms_internal_rate) || 0.18
  const icmsRateDecimal = icmsRateRaw > 0 && icmsRateRaw < 1 ? icmsRateRaw : icmsRateRaw / 100

  // Carregar bracket Simples Nacional (se aplicável)
  let simplesBracket: Record<string, unknown> | null = null
  if (regime === 'SIMPLES_NACIONAL') {
    const anexo = normalizeAnexo(ts.simples_anexo || '')
    const revenue12m = Number(ts.simples_revenue_12m) || 0
    const { data: brackets } = await supabase
      .from('simples_nacional_brackets')
      .select('*')
      .eq('anexo', anexo)
      .order('bracket_order', { ascending: true })

    if (brackets && brackets.length > 0) {
      for (const b of brackets) {
        if (revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) {
          simplesBracket = b
          break
        }
      }
      if (!simplesBracket) simplesBracket = brackets[0]
    }
  }

  // Carregar lucro_presumido_rates (se aplicável)
  let lpRate: Record<string, unknown> | null = null
  if (regime === 'LUCRO_PRESUMIDO') {
    const activity = ts.lucro_presumido_activity || 'COMERCIO'
    const { data } = await supabase
      .from('lucro_presumido_rates')
      .select('*')
      .eq('activity_type', activity)
      .maybeSingle()
    lpRate = data
  }

  return extractEffectiveTaxComponents({
    tenantSettings: ts,
    calcType,
    icmsRateDecimal,
    expenseConfig: expenseRes.data,
    lpRate,
    simplesBracket,
  })
}

/**
 * Invariante de paridade — usado por CI / testes runtime.
 * Compara `extractEffectiveTaxComponents.total` com `effectiveTaxPct`
 * de uma fonte externa (ex.: `calc-tax-preview.fetchTaxPreview`).
 *
 * Tolerância R$ 0,01 (1e-4 em decimal) — qualquer divergência maior
 * viola a Seção 7 do PDF.
 */
export function assertTaxSyncParity(
  components: TaxComponents,
  effectiveTaxPct: number,
  tolerance = 0.0001,
): boolean {
  return Math.abs(components.total - effectiveTaxPct) <= tolerance
}
