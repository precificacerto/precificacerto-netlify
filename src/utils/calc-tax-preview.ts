import { supabase } from '@/supabase/client'

export interface TaxPreviewResult {
  /** Single effective tax rate as decimal 0-1 (e.g. 0.12 = 12%). */
  effectiveTaxPct: number
  /** Human-readable label: "Simples Nacional (Anexo III)", "Lucro Presumido", etc. */
  taxLabel: string
  isMei: boolean

  // Legacy fields kept for backward compat during migration (PR 3).
  /** @deprecated Use effectiveTaxPct instead */
  taxesPercent: number
  /** @deprecated Use effectiveTaxPct instead */
  taxableRegimePercent: number
  /** @deprecated Use taxLabel instead */
  regimeLabel: string
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function normalizeAnexo(raw: string): string {
  if (!raw) return 'I'
  return raw.replace(/^ANEXO_/i, '')
}

function decimalToPercent(val: number): number {
  if (val > 0 && val < 1) return round4(val * 100)
  return val
}

function buildResult(
  taxesPercent: number,
  taxableRegimePercent: number,
  label: string,
  isMei: boolean,
): TaxPreviewResult {
  const totalPct = taxesPercent + taxableRegimePercent
  return {
    effectiveTaxPct: round4(totalPct / 100),
    taxLabel: label,
    isMei,
    taxesPercent,
    taxableRegimePercent,
    regimeLabel: label,
  }
}

export async function fetchTaxPreview(tenantId: string): Promise<TaxPreviewResult> {
  const [settingsRes, statesRes, expenseRes] = await Promise.all([
    supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).single(),
    supabase.from('brazilian_states').select('code, icms_internal_rate'),
    supabase.from('tenant_expense_config').select('profit_margin_percent').eq('tenant_id', tenantId).maybeSingle(),
  ])

  const ts = settingsRes.data
  if (!ts) return buildResult(0, 0, 'Não configurado', false)

  const regime: string = ts.tax_regime || 'SIMPLES_NACIONAL'
  const calcType: string = ts.calc_type || 'INDUSTRIALIZACAO'
  const originState: string = ts.state_code || 'SP'

  if (regime === 'MEI') {
    return buildResult(0, 0, 'MEI', true)
  }

  if (regime === 'SIMPLES_NACIONAL') {
    const anexo = normalizeAnexo(ts.simples_anexo || '')
    const revenue12m = Number(ts.simples_revenue_12m) || 0

    const { data: brackets } = await supabase
      .from('simples_nacional_brackets')
      .select('*')
      .eq('anexo', anexo)
      .order('bracket_order', { ascending: true })

    let bracket: any = null
    if (brackets && brackets.length > 0) {
      for (const b of brackets) {
        if (revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) {
          bracket = b
          break
        }
      }
      if (!bracket) bracket = brackets[0]
    }

    if (bracket) {
      const nominalRate = Number(bracket.nominal_rate)
      const deduction = Number(bracket.deduction)
      const effectiveRate = revenue12m > 0
        ? (revenue12m * nominalRate - deduction) / revenue12m
        : nominalRate
      const pctTaxableRegime = round4(effectiveRate * 100)

      return buildResult(0, pctTaxableRegime, `Simples Nacional (Anexo ${anexo})`, false)
    }

    return buildResult(0, 0, 'Simples Nacional', false)
  }

  if (regime === 'SIMPLES_HIBRIDO') {
    const anexo = normalizeAnexo(ts.simples_anexo || '')
    const revenue12m = Number(ts.simples_revenue_12m) || 0

    const { data: brackets } = await supabase
      .from('simples_nacional_brackets')
      .select('*')
      .eq('anexo', anexo)
      .order('bracket_order', { ascending: true })

    let bracket: any = null
    if (brackets && brackets.length > 0) {
      for (const b of brackets) {
        if (revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) {
          bracket = b
          break
        }
      }
      if (!bracket) bracket = brackets[0]
    }

    if (bracket) {
      const nominalRate = Number(bracket.nominal_rate)
      const deduction = Number(bracket.deduction)
      const effectiveRate = revenue12m > 0
        ? (revenue12m * nominalRate - deduction) / revenue12m
        : nominalRate
      const pctTaxableRegime = round4(effectiveRate * 100)
      return buildResult(0, pctTaxableRegime, `Simples Híbrido (Anexo ${anexo})`, false)
    }

    return buildResult(0, 0, 'Simples Híbrido', false)
  }

  if (regime === 'LUCRO_PRESUMIDO_RET') {
    const retRate = Number(ts.ret_rate) || 0.04
    return {
      effectiveTaxPct: retRate,
      taxLabel: 'Lucro Presumido RET',
      isMei: false,
      taxesPercent: 0,
      taxableRegimePercent: round4(retRate * 100),
      regimeLabel: 'Lucro Presumido RET',
    }
  }

  const stateRow = (statesRes.data || []).find((s: any) => s.code === originState)
  const icmsRateRaw = Number(stateRow?.icms_internal_rate) || 0.18
  const icmsRateDecimal = icmsRateRaw > 0 && icmsRateRaw < 1 ? icmsRateRaw : icmsRateRaw / 100

  if (regime === 'LUCRO_PRESUMIDO') {
    // ─── LUCRO PRESUMIDO — Cálculo validado end-to-end ───
    //
    // Referências legais:
    // - ICMS: Lei Kandir (LC 87/96) — alíquota interna do estado de origem
    // - PIS/COFINS cumulativo: Lei 9.718/98 — 0,65% PIS + 3,00% COFINS = 3,65%
    // - Exclusão ICMS da base PIS/COFINS: STF RE 574.706 (Tema 69)
    // - ISS: LC 116/03 — alíquota municipal de 2% a 5%
    // - IRPJ presunção: Lei 9.249/95 art. 15 (8% comércio/indústria, 32% serviços, etc.)
    // - CSLL presunção: Lei 9.249/95 art. 20 (12% geral, 32% serviços)
    // - IRPJ alíquota: 15% (+ adicional 10% sobre excedente R$20k/mês, não incluído nesta prévia)
    // - CSLL alíquota: 9%
    //
    // Nota: o adicional de IRPJ (10% sobre lucro presumido > R$60k/trimestre) NÃO está
    // incluído nesta prévia. Ele depende do faturamento real e seria desproporcional
    // em uma estimativa genérica.

    // 1. ICMS venda (decimal 0-1)
    let lpIcms = 0
    if (calcType === 'SERVICO') {
      lpIcms = 0 // serviço paga ISS, não ICMS
    } else if (!ts.icms_contribuinte) {
      lpIcms = 0 // não-contribuinte: sem IE, não recolhe ICMS
    } else {
      lpIcms = icmsRateDecimal
    }

    // 2. PIS/COFINS cumulativo (3,65%) — base ajustada pela exclusão do ICMS "por dentro"
    // Fórmula: PIS/COFINS = 3,65% × (Receita − ICMS) / Receita = 3,65% × (1 − ICMS_rate)
    // Serviço não tem ICMS na base, então usa 3,65% cheio.
    const pisCofins = calcType === 'SERVICO'
      ? 0.0365
      : lpIcms > 0
        ? 0.0365 * (1 - lpIcms)
        : 0.0365

    // 3. ISS (só para SERVICO; iss_municipality_rate armazenado em decimal 0-1)
    const iss = calcType === 'SERVICO'
      ? (Number(ts.iss_municipality_rate) || 0.05)
      : 0

    // 4. IRPJ e CSLL — lucro_presumido_rates armazena valores em DECIMAL 0-1
    // Ex: COMERCIO → irpj_presumption_percent=0.08, irpj_rate=0.15 → efetivo=0.012 (1,2%)
    // Ex: SERVICOS_32 → irpj_presumption_percent=0.32, irpj_rate=0.15 → efetivo=0.048 (4,8%)
    const activity = ts.lucro_presumido_activity || 'COMERCIO'
    const { data: lpRate } = await supabase
      .from('lucro_presumido_rates')
      .select('*')
      .eq('activity_type', activity)
      .maybeSingle()

    let irpjEquiv = 0.08 * 0.15 // fallback: COMERCIO/INDUSTRIA (presunção 8%, alíquota 15%)
    let csllEquiv = 0.12 * 0.09 // fallback: geral (presunção 12%, alíquota 9%)
    if (lpRate) {
      irpjEquiv = Number(lpRate.irpj_presumption_percent) * Number(lpRate.irpj_rate)
      csllEquiv = Number(lpRate.csll_presumption_percent) * Number(lpRate.csll_rate)
    }

    const taxPct = round4(lpIcms + pisCofins + iss + irpjEquiv + csllEquiv)

    return {
      effectiveTaxPct: taxPct,
      taxLabel: 'Lucro Presumido',
      isMei: false,
      taxesPercent: round4((lpIcms + pisCofins + iss) * 100),
      taxableRegimePercent: round4((irpjEquiv + csllEquiv) * 100),
      regimeLabel: 'Lucro Presumido',
    }
  }

  if (regime === 'LUCRO_REAL') {
    // 1. ICMS venda (decimal 0-1)
    let lrIcms = 0
    if (calcType === 'SERVICO') {
      lrIcms = 0
    } else if (ts.icms_contribuinte) {
      lrIcms = icmsRateDecimal
    }

    // 2. PIS/COFINS não-cumulativo (9,25%) — ajuste de base pelo ICMS por dentro
    const pisCofinsNominal = 0.0925
    const lrPisCofins = calcType === 'SERVICO'
      ? pisCofinsNominal
      : lrIcms > 0
        ? pisCofinsNominal * (1 - lrIcms)
        : pisCofinsNominal

    // 3. ISS (só para SERVICO)
    const lrIss = calcType === 'SERVICO'
      ? (Number(ts.iss_municipality_rate) || 0.05)
      : 0

    // 4. IRPJ e CSLL sobre lucro PROJETADO (margem configurada pelo tenant)
    const profitPctRaw = Number(expenseRes?.data?.profit_margin_percent) || 0.12
    const profitPct = profitPctRaw > 0 && profitPctRaw < 1 ? profitPctRaw : profitPctRaw / 100
    const lrIrpj = profitPct * 0.15
    const lrCsll = profitPct * 0.09

    const effectiveTaxPct = round4(lrIcms + lrPisCofins + lrIss + lrIrpj + lrCsll)

    return {
      effectiveTaxPct,
      taxLabel: 'Lucro Real',
      isMei: false,
      taxesPercent: round4((lrIcms + lrPisCofins + lrIss) * 100),
      taxableRegimePercent: round4((lrIrpj + lrCsll) * 100),
      regimeLabel: 'Lucro Real',
    }
  }

  return buildResult(0, 0, regime, false)
}
