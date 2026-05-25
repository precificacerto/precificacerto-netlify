/**
 * Item Tax Rates — Helper para alíquotas tributárias POR ITEM (Sprint S11).
 *
 * Spec: EPIC-RR-V2 — cada produto/serviço persiste suas próprias alíquotas
 * (Produto A com ICMS 4% e PIS+COFINS 9,25%; Produto B com ICMS 12% e
 * PIS+COFINS 3,65%, por exemplo). O motor RR rodando POR ITEM deve consumir
 * essas alíquotas específicas em vez do tenant uniforme.
 *
 * Convenção de fallback (precedência):
 *   1. Alíquota do item (NOT NULL e > 0)
 *   2. Alíquota do tenant (via TaxRatePeriod[])
 *   3. Zero (não tributado)
 *
 * NULL no item = "não cadastrado" → fallback para tenant.
 * 0 explícito no item = "isento" → vence o fallback (override).
 */

import type { TaxRatePeriod, TaxType } from '@/types/mrm'

/**
 * Alíquotas tributárias persistidas em `products`/`services` (todas em DECIMAL).
 * NULL/undefined = não cadastrado (fallback tenant).
 */
export interface ItemTaxRates {
  // Bloco A — impostos por dentro
  icms_pct?: number | null
  pis_pct?: number | null
  cofins_pct?: number | null
  iss_pct?: number | null
  // Bloco B — impostos por fora
  ipi_pct?: number | null
  icms_st_pct?: number | null
  difal_pct?: number | null
  fcp_pct?: number | null
  ibs_pct?: number | null
  cbs_pct?: number | null
  iss_retido_pct?: number | null
  // Rateio RR
  irpj_pct?: number | null
  csll_pct?: number | null
}

const ITEM_RATE_BY_TAX_TYPE: Record<TaxType, keyof ItemTaxRates> = {
  ICMS: 'icms_pct',
  PIS: 'pis_pct',
  COFINS: 'cofins_pct',
  ISS: 'iss_pct',
  IPI: 'ipi_pct',
  ICMS_ST: 'icms_st_pct',
  DIFAL: 'difal_pct',
  FCP: 'fcp_pct',
  IBS: 'ibs_pct',
  CBS: 'cbs_pct',
  ISS_RETIDO: 'iss_retido_pct',
}

/**
 * Constrói um TaxRatePeriod[] efetivo para o motor RR, combinando alíquotas
 * do item (override) com alíquotas do tenant (fallback).
 *
 * Comportamento por TaxType:
 *   - Se item.X_pct NOT NULL (incluindo 0) → usa valor do item (override)
 *   - Se item.X_pct NULL/undefined → usa tenant rate matching (fallback)
 *   - Se nenhum dos dois → tax_type omitido (motor ignora)
 */
export function mergeItemAndTenantRates(
  itemRates: ItemTaxRates | null | undefined,
  tenantRates: TaxRatePeriod[],
): TaxRatePeriod[] {
  const result: TaxRatePeriod[] = []
  const handledTypes = new Set<TaxType>()

  // 1) Iterar tax_types conhecidos e aplicar precedência item > tenant
  for (const [taxType, field] of Object.entries(ITEM_RATE_BY_TAX_TYPE) as Array<[TaxType, keyof ItemTaxRates]>) {
    const itemVal = itemRates?.[field]
    const hasItemValue = itemVal != null && Number.isFinite(itemVal)

    if (hasItemValue) {
      const raw = Number(itemVal)
      // Override item — só inclui no array se > 0 (motor ignora rate 0 por design)
      if (raw > 0) {
        // BUG FIX (2026-05-23, Hyago): produtos podem ter alíquotas salvas em
        // formato porcentual (17 = 17%) em vez de decimal (0.17). Motor RR
        // espera decimal. Heurística: valor < 1 já é decimal; valor >= 1 é porcentagem.
        const normalized = raw < 1 ? raw : raw / 100
        result.push({
          id: `item-override-${taxType}`,
          tenant_id: 'item-override',
          tax_type: taxType,
          origin_state: null,
          dest_state: null,
          rate_pct: normalized,
          valid_from: '2026-01-01',
          valid_until: null,
          notes: 'override from item-level tax rates (S11)',
        })
      }
      handledTypes.add(taxType)
    }
  }

  // 2) Adicionar tenant rates apenas para tax_types NÃO sobrescritos pelo item
  for (const tenantRate of tenantRates) {
    if (!handledTypes.has(tenantRate.tax_type)) {
      result.push(tenantRate)
    }
  }

  return result
}

/**
 * Resolve o "custo total POR UNIDADE" de um produto/serviço lendo de múltiplas
 * fontes do Supabase em ordem de prioridade canônica (ADR-011, 2026-05-24).
 *
 * Cenário motivador (Hyago): produto "PVC" com cost_total=0 no banco mas com
 * o custo real (R$ 42.645,94) vivendo em `product_items.item_cost_net` +
 * `pricing_calculations.total_labor_net`. Esta é a fonte que aparece como
 * "Custo produto" na tela do cadastro.
 *
 * Cadeia de fallback (ADR-011 §3):
 *   1º SUM(product_items.item_cost_net) + pricing_calc.total_labor_net
 *      / yield_quantity  ← FONTE PRIMÁRIA (cenário real do user)
 *   2º products.cost_total > 0 (produtos modernos pré-calculados)
 *   3º pricing_calc.cmv > 0 (CMV unitário canônico)
 *   4º (total_material_cost_net + total_labor_net) / yield_quantity (fallback parcial)
 *   5º zero (sem custo cadastrado)
 *
 * Retorna o custo POR UNIDADE do produto. Caller multiplica por qty no orçamento.
 *
 * IMPORTANTE (Ponto crítico #1 do Dev):
 *   `product_items.item_cost_net` é o TOTAL da linha (já inclui quantity_needed).
 *   NÃO multiplicar por quantity_needed de novo — usar SUM direto.
 *
 * IMPORTANTE (Ponto crítico #2 do Dev):
 *   `yield_quantity` clamped em Math.max(1, ...) para evitar NaN/Infinity quando
 *   produto antigo tem yield=null/0/negativo.
 */
export function resolveProductCostTotal(prod: any, tenantCtx?: TenantLaborContext): number {
  const yieldQty = Math.max(1, Number(prod?.yield_quantity) || 1)
  const pricingArr: any[] = Array.isArray(prod?.pricing_calculations)
    ? prod.pricing_calculations
    : (prod?.pricing_calculations ? [prod.pricing_calculations] : [])

  // ★ V8.8 (2026-05-24): pricing_calculations.cmv é o CMV CANÔNICO já calculado
  // pelo módulo de Formação de Preço (material + MO produtiva consolidado).
  // É EXATAMENTE o valor exibido como "Custo produto" no cadastro do produto.
  // Quando disponível, retorna direto — não precisa derivar nada.
  for (const p of pricingArr) {
    const cmv = Number(p?.cmv) || 0
    if (cmv > 0) return cmv
  }

  // labor_net via resolveProductLaborTotal (cobre labor_costs + pricing iterado + runtime)
  const laborUnit = resolveProductLaborTotal(prod, tenantCtx)
  const laborTotal = laborUnit * yieldQty

  // Nível 2: SUM(product_items.item_cost_net) + labor / yield
  const productItems = Array.isArray(prod?.product_items) ? prod.product_items : []
  if (productItems.length > 0) {
    const itemsCostSum = productItems.reduce((sum: number, pi: any) => {
      const itemNet = Number(pi?.item_cost_net) || 0
      return sum + itemNet
    }, 0)
    if (itemsCostSum > 0) {
      return (itemsCostSum + laborTotal) / yieldQty
    }
  }

  // Nível 3: cost_total direto (produtos modernos pré-calculados)
  const direct = Number(prod?.cost_total) || 0
  if (direct > 0) return direct

  // Nível 4: (material + labor) / yield — fallback parcial
  for (const p of pricingArr) {
    const materialNet = Number(p?.total_material_cost_net) || 0
    const laborNet = Number(p?.total_labor_net) || 0
    const totalCost = materialNet + laborNet
    if (totalCost > 0) return totalCost / yieldQty
  }

  return 0
}

/**
 * Resolve a parcela de "Mão de Obra Produtiva" (MOD) do CUSTO UNITÁRIO do produto.
 *
 * Story V8.3 (2026-05-24): cadeia expandida para incluir labor_costs (tabela
 * dedicada por produto onde a UI do cadastro persiste mão de obra produtiva).
 *
 * NÃO usar `tenant.mod_pct × receita` (mão de obra administrativa do tenant —
 * já entra em "Administrativas" das despesas operacionais).
 *
 * Cadeia de fontes (todas POR PRODUTO, nunca tenant):
 *   1º SUM(labor_costs.net_value) / yield_quantity
 *      (tabela dedicada — fonte primária do "Mão de obra produtiva" do cadastro)
 *   2º pricing_calculations.product_workload_price / yield_quantity
 *   3º pricing_calculations.total_labor_net / yield_quantity
 *   4º zero (produto sem MO produtiva cadastrada — linha some na UI)
 *
 * Cenário do user: labor_costs.net_value = R$ 2.716,00 / yield 1 = R$ 2.716,00/un
 */
/**
 * Contexto opcional do tenant para o cálculo runtime de MOD.
 *
 * V8.7 (preferencial): MOD = product_workload × productive_value_per_minute
 * V8.6 (fallback):     MOD = product_workload × (production_labor_cost / monthly_workload_minutes)
 */
export interface TenantLaborContext {
  production_labor_cost: number   // R$/mês (tenant_expense_config.production_labor_cost)
  monthly_workload_minutes: number // minutos/mês (derivado de tenant_settings)
  productive_value_per_minute?: number // R$/minuto (já calculado em tenant_expense_config)
}

/**
 * V13 (Founder request 2026-05-25): Despesa Financeira POR UNIDADE do produto.
 *
 * Resolve `pricing_calculations.val_financial_expense / yield_quantity` em R$.
 * Quando ausente OU zero, retorna `null` (caller usa fallback tenant.financial_pct).
 *
 * Itera múltiplas linhas de pricing_calculations (V8.5) pegando primeiro valor > 0.
 *
 * Motivação: tenant_expense_config.financial_expense_percent pode estar
 * mal-configurado (ex: 43% por engano). Pegar do snapshot do produto evita
 * contaminação por má configuração do tenant.
 */
export function resolveProductFinancialExpense(prod: any): number | null {
  const yieldQty = Math.max(1, Number(prod?.yield_quantity) || 1)
  const pricingArr: any[] = Array.isArray(prod?.pricing_calculations)
    ? prod.pricing_calculations
    : (prod?.pricing_calculations ? [prod.pricing_calculations] : [])
  for (const p of pricingArr) {
    const v = Number(p?.val_financial_expense) || 0
    if (v > 0) return v / yieldQty
  }
  return null
}

export function resolveProductLaborTotal(prod: any, tenantCtx?: TenantLaborContext): number {
  const yieldQty = Math.max(1, Number(prod?.yield_quantity) || 1)

  // 1º labor_costs (tabela dedicada — fonte primária)
  const laborCosts = Array.isArray(prod?.labor_costs) ? prod.labor_costs : []
  if (laborCosts.length > 0) {
    const laborSum = laborCosts.reduce((sum: number, lc: any) => {
      const net = Number(lc?.net_value) || Number(lc?.gross_value) || 0
      return sum + net
    }, 0)
    if (laborSum > 0) return laborSum / yieldQty
  }

  // V8.5 (2026-05-24): pricing_calculations tem MÚLTIPLAS LINHAS por produto
  // (por tax_regime + sale_scope + buyer_type). Cada linha pode ter campos
  // diferentes preenchidos. Busca o PRIMEIRO valor > 0 em qualquer linha.
  const pricingArr: any[] = Array.isArray(prod?.pricing_calculations)
    ? prod.pricing_calculations
    : (prod?.pricing_calculations ? [prod.pricing_calculations] : [])

  for (const p of pricingArr) {
    const v = Number(p?.product_workload_price) || 0
    if (v > 0) return v / yieldQty
  }
  for (const p of pricingArr) {
    const v = Number(p?.total_labor_net) || 0
    if (v > 0) return v / yieldQty
  }
  for (const p of pricingArr) {
    const v = Number(p?.total_labor_gross) || 0
    if (v > 0) return v / yieldQty
  }
  for (const p of pricingArr) {
    const v = Number(p?.val_indirect_labor) || 0
    if (v > 0) return v / yieldQty
  }

  // V8.7 (PREFERENCIAL): cálculo RUNTIME usando productive_value_per_minute direto.
  // tenant_expense_config.productive_value_per_minute JÁ é o valor calculado.
  if (tenantCtx) {
    const pvpm = Number(tenantCtx.productive_value_per_minute) || 0
    if (pvpm > 0) {
      for (const p of pricingArr) {
        const workloadMin = Number(p?.product_workload) || 0
        if (workloadMin > 0) {
          return (workloadMin * pvpm) / yieldQty
        }
      }
    }
  }

  // V8.6 (FALLBACK): derivar cost_per_minute via (labor_cost / monthly_minutes).
  if (tenantCtx && tenantCtx.production_labor_cost > 0 && tenantCtx.monthly_workload_minutes > 0) {
    for (const p of pricingArr) {
      const workloadMin = Number(p?.product_workload) || 0
      if (workloadMin > 0) {
        const costPerMinute = tenantCtx.production_labor_cost / tenantCtx.monthly_workload_minutes
        return (workloadMin * costPerMinute) / yieldQty
      }
    }
  }

  return 0
}

/**
 * Constrói `ItemTaxRates` a partir do cadastro do produto/serviço.
 *
 * Lê tanto os campos separados (`pis_pct` + `cofins_pct`) quanto o campo
 * agregado `pis_cofins_pct` (novo padrão do módulo de Formação de Preço).
 *
 * Quando apenas `pis_cofins_pct` está preenchido, divide pela proporção
 * canônica LR não-cumulativo:
 *   PIS    = agregado × (1.65 / 9.25)  ≈ 17,84%
 *   COFINS = agregado × (7.60 / 9.25)  ≈ 82,16%
 *
 * Essa proporção é matematicamente correta para LR; para LP (cumulativo,
 * 0.65 + 3.0 = 3.65%) a mesma proporção (1.65/9.25 ≈ 0.178) se aproxima
 * de 0.65/3.65 ≈ 0.178 — desvio < 0.01pp. Para MEI/SN o motor já zera
 * via guard de regime cumulativo (ADR-004).
 *
 * Story MRM-V7+ (2026-05-24): user reportou que PIS/COFINS NCM não
 * aparecia na DRE Consolidada. Causa: callers liam só pis_pct/cofins_pct
 * separados e não viam o `pis_cofins_pct` agregado.
 */
export function buildItemTaxRatesFromProduct(prod: any): ItemTaxRates {
  const pisSep = Number(prod?.pis_pct)
  const cofinsSep = Number(prod?.cofins_pct)
  let pisFinal: number | null = Number.isFinite(pisSep) ? pisSep : null
  let cofinsFinal: number | null = Number.isFinite(cofinsSep) ? cofinsSep : null

  // Quando os campos separados estão ausentes ou zerados, tenta o agregado.
  const hasSeparated = (pisFinal != null && pisFinal > 0) || (cofinsFinal != null && cofinsFinal > 0)
  if (!hasSeparated) {
    const agg = Number(prod?.pis_cofins_pct)
    if (Number.isFinite(agg) && agg > 0) {
      pisFinal = agg * (1.65 / 9.25)
      cofinsFinal = agg * (7.60 / 9.25)
    }
  }

  return {
    icms_pct: prod?.icms_pct ?? null,
    pis_pct: pisFinal,
    cofins_pct: cofinsFinal,
    iss_pct: prod?.iss_pct ?? null,
    ipi_pct: prod?.ipi_pct ?? null,
    icms_st_pct: prod?.icms_st_pct ?? null,
    difal_pct: prod?.difal_pct ?? null,
    fcp_pct: prod?.fcp_pct ?? null,
    ibs_pct: prod?.ibs_pct ?? null,
    cbs_pct: prod?.cbs_pct ?? null,
    iss_retido_pct: prod?.iss_retido_pct ?? null,
    irpj_pct: prod?.irpj_pct ?? null,
    csll_pct: prod?.csll_pct ?? null,
  }
}

/**
 * Extrai a alíquota efetiva de CSLL para o item (override item > fallback tenant).
 * Retorna decimal (0.0207 = 2,07%).
 *
 * BUG FIX (2026-05-23, Hyago): CSLL e IRPJ são impostos da EMPRESA sobre lucro
 * residual — não fazem sentido como "isento por produto". Quando `item_tax_rates.csll_pct = 0`
 * (default NOT NULL de produto novo recém-cadastrado sem override explícito),
 * o motor anteriormente respeitava o 0 e zerava CSLL na distribuição, perdendo
 * o rateio do tenant. Fix: tratar 0 (ou negativo) como "sem override" → fallback tenant.
 *
 * Semântica corrigida: apenas valor > 0 conta como override genuíno do produto.
 */
export function resolveItemCsllPct(
  itemRates: ItemTaxRates | null | undefined,
  tenantCsllPct: number,
): number {
  const itemVal = itemRates?.csll_pct
  if (itemVal != null && Number.isFinite(itemVal) && Number(itemVal) > 0) {
    return Number(itemVal)
  }
  return tenantCsllPct
}

/**
 * Extrai a alíquota efetiva de IRPJ para o item (override item > fallback tenant).
 *
 * BUG FIX (2026-05-23, Hyago): mesma semântica de `resolveItemCsllPct` — IRPJ
 * é imposto empresarial sobre lucro, não por produto. Zero no item é tratado como
 * "sem override", caindo no fallback tenant.
 */
export function resolveItemIrpjPct(
  itemRates: ItemTaxRates | null | undefined,
  tenantIrpjPct: number,
): number {
  const itemVal = itemRates?.irpj_pct
  if (itemVal != null && Number.isFinite(itemVal) && Number(itemVal) > 0) {
    return Number(itemVal)
  }
  return tenantIrpjPct
}
