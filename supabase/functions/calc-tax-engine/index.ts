import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { calculatePricing, type PricingInput, type CalcType } from "./pricing-engine.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const body = await req.json()
    const {
      tenant_id,
      product_id,
      sale_scope,
      buyer_type,
      destination_state,
      commission_percent,
      profit_percent,
      product_workload_minutes,
    } = body

    if (!tenant_id || !product_id) {
      return jsonResponse({ success: false, error: "tenant_id and product_id required" }, 400)
    }

    // --- Load data -----------------------------------------------------------

    const [settingsRes, expenseRes, productRes, statesRes, bracketsRes, lpRatesRes] = await Promise.all([
      supabase.from("tenant_settings").select("*").eq("tenant_id", tenant_id).single(),
      supabase.from("tenant_expense_config").select("*").eq("tenant_id", tenant_id).single(),
      supabase
        .from("products")
        .select("*, product_items(*, items(*))")
        .eq("id", product_id)
        .single(),
      supabase.from("brazilian_states").select("code, icms_internal_rate"),
      supabase
        .from("simples_nacional_brackets")
        .select("*")
        .order("bracket_order", { ascending: true }),
      supabase.from("lucro_presumido_rates").select("*"),
    ])

    const ts = settingsRes.data
    const expense = expenseRes.data
    const product = productRes.data

    if (!ts || !product) {
      return jsonResponse({ success: false, error: "Settings or product not found" }, 404)
    }

    // --- Compute CMV from product_items --------------------------------------

    const productItems = product.product_items || []
    let totalItemsCost = 0
    for (const pi of productItems) {
      const item = pi.items
      const costPerUnit = item && (Number((item as any).cost_per_base_unit) > 0)
        ? Number((item as any).cost_per_base_unit)
        : item
          ? (Number(item.cost_price) || 0) / Math.max(Number(item.quantity) || 1, 1)
          : 0
      const qty = Number(pi.quantity_needed) || 1
      totalItemsCost += qty * costPerUnit
    }

    const yieldForPricing = 1
    const regime = ts.tax_regime || "SIMPLES_NACIONAL"

    // --- Apply tax credits for Lucro Real (ICMS + PIS/COFINS) and Lucro Presumido (ICMS only) ---
    if (regime === "LUCRO_REAL" || regime === "LUCRO_PRESUMIDO") {
      const itemIds = productItems.map((pi: any) => pi.items?.id).filter(Boolean)
      if (itemIds.length > 0) {
        let creditsQuery = supabase
          .from("item_tax_credits")
          .select("item_id, tax_type, credit_value, is_active")
          .in("item_id", itemIds)
          .eq("is_active", true)
        // LP: somente ICMS; LR: todos os créditos
        if (regime === "LUCRO_PRESUMIDO") {
          creditsQuery = creditsQuery.eq("tax_type", "ICMS")
        }
        const { data: credits } = await creditsQuery
        if (credits && credits.length > 0) {
          let totalCredit = 0
          for (const credit of credits) {
            totalCredit += Number(credit.credit_value) || 0
          }
          totalItemsCost = Math.max(0, totalItemsCost - totalCredit)
        }
      }
    }

    // --- Build structure pct -------------------------------------------------

    const indirectLabor = Number(expense?.indirect_labor_percent) || 0
    const fixed = Number(expense?.fixed_expense_percent) || 0
    const variable = Number(expense?.variable_expense_percent) || 0
    const financial = Number(expense?.financial_expense_percent) || 0
    const laborPct = Number(expense?.production_labor_percent) || 0

    const tenantCalcType: CalcType = (ts.calc_type || "INDUSTRIALIZACAO") as CalcType
    // Produto REVENDA usa sempre calcType REVENDA, independente do tenant
    const calcType: CalcType = product.product_type === "REVENDA" ? "REVENDA" : tenantCalcType
    const isRevenda = calcType === "REVENDA"
    const isService = tenantCalcType === "SERVICO"
    // SERVICE segment REVENDA products: exclude MO administrativa (indirectLabor) and despesas fixas (fixed)
    const structureDisplay = isService
      ? variable + financial
      : indirectLabor + fixed + variable + financial + (isRevenda ? laborPct : 0)

    // --- Normalize workload to minutes ----------------------------------------
    const workloadUnit: string = ts.workload_unit || "HOURS"
    const rawMonthlyWorkload = Number(ts.monthly_workload) || 1
    const numProductiveEmployees = Number(ts.num_productive_employees) || 1
    const isServiceCalc = calcType === "SERVICO"
    const monthlyWorkloadMinutes =
      normalizeWorkloadToMinutes(rawMonthlyWorkload, workloadUnit, isServiceCalc) * numProductiveEmployees

    // --- Compute tax + pricing (2-pass for Lucro Real adicional IRPJ) --------

    const profitPctFromBody = (profit_percent || 0) / 100
    const profitPctFromExpense = Number(expense?.profit_margin_percent) || 0.12
    const profitPctNorm = profitPctFromExpense > 0 && profitPctFromExpense < 1
      ? profitPctFromExpense
      : profitPctFromExpense / 100

    const states = statesRes.data || []
    const brackets = bracketsRes.data || []
    const lpRates = lpRatesRes.data || []

    const basePricingInput: Omit<PricingInput, "taxPct"> = {
      calcType,
      totalItemsCost,
      yieldQuantity: yieldForPricing,
      laborCostMonthly: Number(expense?.production_labor_cost_hub) || Number(expense?.production_labor_cost) || 0,
      numProductiveEmployees,
      monthlyWorkloadMinutes,
      productWorkloadMinutes: product_workload_minutes || 0,
      structurePct: structureDisplay / 100,
      commissionPct: (commission_percent || 0) / 100,
      profitPct: profitPctFromBody,
    }

    // 1st pass — without adicional IRPJ
    const taxResult1 = computeEffectiveTax(ts, states, brackets, lpRates, profitPctNorm, 0)
    const input1: PricingInput = { ...basePricingInput, taxPct: taxResult1.effectiveTaxPct }
    const result1 = calculatePricing(input1)

    // 2nd pass — compute adicional IRPJ for Lucro Real based on 1st-pass price
    let irpjAdditionalEquiv = 0
    if ((regime === "LUCRO_REAL" || regime === "LUCRO_PRESUMIDO") && result1.isValid && result1.priceUnit > 0) {
      const lucroMensal = result1.priceUnit * profitPctFromBody
      // Adicional IRPJ: 10% sobre o lucro que excede R$ 20.000/mês (R$ 240.000/ano)
      // lucroMensal aqui é a estimativa de lucro por unidade × margem (aproximação por produto)
      const IRPJ_ADICIONAL_LIMITE_MENSAL = 20000 // R$ 20.000/mês
      const excedente = Math.max(0, lucroMensal - IRPJ_ADICIONAL_LIMITE_MENSAL)
      if (excedente > 0) {
        irpjAdditionalEquiv = (excedente * 0.10) / result1.priceUnit
      }
    }

    const taxResult = irpjAdditionalEquiv > 0
      ? computeEffectiveTax(ts, states, brackets, lpRates, profitPctNorm, irpjAdditionalEquiv)
      : taxResult1

    const input: PricingInput = irpjAdditionalEquiv > 0
      ? { ...basePricingInput, taxPct: taxResult.effectiveTaxPct }
      : input1

    const result = irpjAdditionalEquiv > 0
      ? calculatePricing(input)
      : result1

    if (!result.isValid) {
      return jsonResponse({ success: false, error: result.validationErrors.join("; ") }, 400)
    }

    // --- Persist to pricing_calculations (upsert) ----------------------------

    await supabase.from("pricing_calculations").delete().match({
      tenant_id,
      product_id,
    })

    const pricingRow = {
      tenant_id,
      product_id,
      tax_regime: ts.tax_regime || "SIMPLES_NACIONAL",
      calc_type: calcType,
      total_material_cost_gross: totalItemsCost,
      total_material_cost_net: totalItemsCost,
      cmv: result.cmvTotal,
      pct_indirect_labor: indirectLabor,
      pct_fixed_expense: fixed,
      pct_variable_expense: variable,
      pct_financial_expense: financial,
      pct_commission: commission_percent || 0,
      pct_profit_margin: profit_percent || 0,
      pct_taxable_regime: taxResult.effectiveTaxPct * 100,
      pct_icms: (taxResult.pctIcms ?? 0) * 100,
      pct_pis_cofins: (taxResult.pctPisCofins ?? 0) * 100,
      pct_iss: (taxResult.pctIss ?? 0) * 100,
      pct_irpj: (taxResult.pctIrpj ?? 0) * 100,
      pct_csll: (taxResult.pctCsll ?? 0) * 100,
      pct_irpj_additional: irpjAdditionalEquiv * 100,
      coefficient: result.coefficient,
      sale_price_internal: result.priceUnit,
      sale_price_total: result.priceUnit,
      sale_price_per_unit: result.priceUnit,
      val_indirect_labor: result.priceUnit * (indirectLabor / 100),
      val_fixed_expense: result.priceUnit * (fixed / 100),
      val_variable_expense: result.priceUnit * (variable / 100),
      val_financial_expense: result.priceUnit * (financial / 100),
      val_commission: result.commissionValue,
      val_profit: result.profitValue,
      product_workload: product_workload_minutes || 0,
      product_workload_price: result.laborValue,
      sale_scope: sale_scope || "INTRAESTADUAL",
      buyer_type: buyer_type || "CONSUMIDOR_FINAL",
      destination_state: destination_state || ts.state_code || "SP",
      calculated_at: new Date().toISOString(),
      version: 1,
    }

    const { data: pricingData, error: pricingError } = await supabase
      .from("pricing_calculations")
      .insert(pricingRow)
      .select("id")
      .single()

    if (pricingError) {
      return jsonResponse({ success: false, error: pricingError.message }, 500)
    }

    // --- Insert into pricing_history -----------------------------------------

    await supabase.from("pricing_history").insert({
      pricing_calculation_id: pricingData.id,
      product_id,
      tenant_id,
      sale_price_total: result.priceUnit,
      cmv: result.cmvTotal,
      coefficient: result.coefficient,
      tax_regime: ts.tax_regime || "SIMPLES_NACIONAL",
      snapshot_json: { input, result, pricingRow },
    })

    // --- Update product cost fields ------------------------------------------

    await supabase.from("products").update({
      sale_price: result.priceUnit,
      cost_total: result.cmvUnit,
      updated_at: new Date().toISOString(),
    }).eq("id", product_id)

    return jsonResponse({ success: true, pricing: result })
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message || "Internal error" }, 500)
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  })
}

interface TaxCalcResult {
  effectiveTaxPct: number
  label: string
  isMei: boolean
  // Tax component breakdown (decimal 0-1). Zero for regimes that don't split (MEI, SN).
  pctIcms: number
  pctPisCofins: number
  pctIss: number
  pctIrpj: number
  pctCsll: number
}

const ZERO_BREAKDOWN = { pctIcms: 0, pctPisCofins: 0, pctIss: 0, pctIrpj: 0, pctCsll: 0 }

function computeEffectiveTax(ts: any, states: any[], brackets: any[], lpRates: any[], profitPctOverride = 0.12, irpjAdditionalEquiv = 0): TaxCalcResult {
  const regime = ts.tax_regime || "SIMPLES_NACIONAL"
  const calcType = ts.calc_type || "INDUSTRIALIZACAO"
  const originState = ts.state_code || "SP"

  if (regime === "MEI") {
    return { effectiveTaxPct: 0, label: "MEI", isMei: true, ...ZERO_BREAKDOWN }
  }

  if (regime === "SIMPLES_NACIONAL") {
    // Mirrors calc-tax-preview.ts: effectiveTaxPct = (RBT12 × nominal_rate − deduction) / RBT12
    const rawAnexo: string = ts.simples_anexo || "I"
    const anexo = rawAnexo.replace(/^ANEXO_/i, "")
    const revenue12m = Number(ts.simples_revenue_12m) || 0

    const anexoBrackets = brackets.filter((b: any) => b.anexo === anexo)

    let bracket: any = null
    for (const b of anexoBrackets) {
      if (revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) {
        bracket = b
        break
      }
    }
    // Fallback to first bracket when RBT12 = 0 or no match
    if (!bracket && anexoBrackets.length > 0) bracket = anexoBrackets[0]

    if (bracket) {
      const nominalRate = Number(bracket.nominal_rate)
      const deduction = Number(bracket.deduction)
      const effectiveRate = revenue12m > 0
        ? (revenue12m * nominalRate - deduction) / revenue12m
        : nominalRate
      return {
        effectiveTaxPct: effectiveRate,
        label: `Simples Nacional (Anexo ${anexo})`,
        isMei: false,
        ...ZERO_BREAKDOWN, // ICMS embutido no DAS — sem breakdown separado
      }
    }

    return { effectiveTaxPct: 0, label: "Simples Nacional", isMei: false, ...ZERO_BREAKDOWN }
  }

  if (regime === "SIMPLES_HIBRIDO") {
    // Simples Híbrido usa a mesma lógica do Simples Nacional
    const rawAnexo: string = ts.simples_anexo || "I"
    const anexo = rawAnexo.replace(/^ANEXO_/i, "")
    const revenue12m = Number(ts.simples_revenue_12m) || 0

    const anexoBrackets = brackets.filter((b: any) => b.anexo === anexo)

    let bracket: any = null
    for (const b of anexoBrackets) {
      if (revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) {
        bracket = b
        break
      }
    }
    if (!bracket && anexoBrackets.length > 0) bracket = anexoBrackets[0]

    if (bracket) {
      const nominalRate = Number(bracket.nominal_rate)
      const deduction = Number(bracket.deduction)
      const effectiveRate = revenue12m > 0
        ? (revenue12m * nominalRate - deduction) / revenue12m
        : nominalRate
      return {
        effectiveTaxPct: effectiveRate,
        label: `Simples Híbrido (Anexo ${anexo})`,
        isMei: false,
        ...ZERO_BREAKDOWN,
      }
    }

    return { effectiveTaxPct: 0, label: "Simples Híbrido", isMei: false, ...ZERO_BREAKDOWN }
  }

  if (regime === "LUCRO_PRESUMIDO_RET") {
    const retRate = Number(ts.ret_rate) || 0.04
    return {
      effectiveTaxPct: retRate,
      label: "Lucro Presumido RET",
      isMei: false,
      ...ZERO_BREAKDOWN, // tudo embutido na alíquota única — sem breakdown separado
    }
  }

  // Normalize ICMS rate to decimal (0-1)
  const stateRow = states.find((s: any) => s.code === originState)
  const icmsRateRaw = Number(stateRow?.icms_internal_rate) || 0.18
  const icmsRateDecimal = icmsRateRaw > 0 && icmsRateRaw < 1 ? icmsRateRaw : icmsRateRaw / 100

  if (regime === "LUCRO_PRESUMIDO") {
    // 1. ICMS venda (decimal 0-1)
    let lpIcms = 0
    if (calcType === "SERVICO") {
      lpIcms = 0 // serviço paga ISS, não ICMS
    } else if (!ts.icms_contribuinte) {
      lpIcms = 0 // não-contribuinte: sem IE, não recolhe ICMS
    } else {
      lpIcms = icmsRateDecimal
    }

    // 2. PIS/COFINS cumulativo (3,65%) — base ajustada pelo ICMS por dentro
    const pisCofins = calcType === "SERVICO"
      ? 0.0365
      : lpIcms > 0
        ? 0.0365 * (1 - lpIcms)
        : 0.0365

    // 3. ISS (só para SERVICO; iss_municipality_rate armazenado em decimal 0-1)
    const iss = calcType === "SERVICO"
      ? (Number(ts.iss_municipality_rate) || 0.05)
      : 0

    // 4. IRPJ e CSLL — lucro_presumido_rates armazena valores em DECIMAL 0-1
    const activity = ts.lucro_presumido_activity || "COMERCIO"
    const lpRate = lpRates.find((r: any) => r.activity_type === activity) || null
    let irpjEquiv = 0.08 * 0.15 // fallback COMERCIO/INDUSTRIA
    let csllEquiv = 0.12 * 0.09
    if (lpRate) {
      irpjEquiv = Number(lpRate.irpj_presumption_percent) * Number(lpRate.irpj_rate)
      csllEquiv = Number(lpRate.csll_presumption_percent) * Number(lpRate.csll_rate)
    }

    const effectiveTaxPct = lpIcms + pisCofins + iss + irpjEquiv + csllEquiv
    return {
      effectiveTaxPct,
      label: "Lucro Presumido",
      isMei: false,
      pctIcms: lpIcms,
      pctPisCofins: pisCofins,
      pctIss: iss,
      pctIrpj: irpjEquiv,
      pctCsll: csllEquiv,
    }
  }

  if (regime === "LUCRO_REAL") {
    // 1. ICMS venda (decimal 0-1) — respeitar icms_contribuinte
    let lrIcms = 0
    if (calcType === "SERVICO") {
      lrIcms = 0
    } else if (ts.icms_contribuinte) {
      lrIcms = icmsRateDecimal
    }

    // 2. PIS/COFINS não-cumulativo (9,25%) — ajuste de base pelo ICMS por dentro
    const pisCofinsNominal = 0.0925
    const lrPisCofins = calcType === "SERVICO"
      ? pisCofinsNominal
      : lrIcms > 0
        ? pisCofinsNominal * (1 - lrIcms)
        : pisCofinsNominal

    // 3. ISS (só para SERVICO)
    const lrIss = calcType === "SERVICO"
      ? (Number(ts.iss_municipality_rate) || 0.05)
      : 0

    // 4. IRPJ e CSLL sobre lucro PROJETADO (margem configurada pelo tenant)
    const lrIrpj = profitPctOverride * 0.15
    const lrCsll = profitPctOverride * 0.09

    const effectiveTaxPct = lrIcms + lrPisCofins + lrIss + lrIrpj + lrCsll + irpjAdditionalEquiv
    return {
      effectiveTaxPct,
      label: "Lucro Real",
      isMei: false,
      pctIcms: lrIcms,
      pctPisCofins: lrPisCofins,
      pctIss: lrIss,
      pctIrpj: lrIrpj + irpjAdditionalEquiv,
      pctCsll: lrCsll,
    }
  }

  return { effectiveTaxPct: 0, label: regime, isMei: false, ...ZERO_BREAKDOWN }
}

/**
 * Same logic as normalizeToMinutes in pricing-engine.ts.
 * Converts DB workload value to minutes based on the stored unit.
 */
function normalizeWorkloadToMinutes(value: number, unit: string, isService: boolean): number {
  if (isService) return value

  switch (unit) {
    case "HOURS":
      return value * 60
    case "DAYS":
      return value * 480
    case "MINUTES":
    case "ACTIVITIES":
    default:
      return value
  }
}
