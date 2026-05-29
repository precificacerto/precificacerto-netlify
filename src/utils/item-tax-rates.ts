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

  // Nível 2: SUM(product_items.item_cost_net) + labor / yield (ADR-011: CMV consolidado)
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

  // Nível 4: (material + labor) / yield — fallback parcial (ADR-011: CMV consolidado)
  for (const p of pricingArr) {
    const materialNet = Number(p?.total_material_cost_net) || 0
    const laborNet = Number(p?.total_labor_net) || 0
    const totalCost = materialNet + laborNet
    if (totalCost > 0) return totalCost / yieldQty
  }

  return 0
}

/**
 * V16.2 (Founder 2026-05-27): helper unificado que normaliza semântica entre o
 * helper ADR-011 (`resolveProductCostTotal` = CMV consolidado) e a convenção do
 * motor V9-I5 (`cost_total` = só material, soma `productive_labor_unit` por cima).
 *
 * Subtrai `productive_labor_unit` do CMV consolidado para devolver SÓ material,
 * evitando dupla contagem quando motor faz `cp = cost_total + productive_labor_unit`.
 *
 * Cenário Agulha (Founder 2026-05-27):
 *   resolveProductCostTotal → 2428.20 (798.60 material + 1629.60 MO via V8.6 runtime)
 *   resolveProductLaborTotal → 1629.60
 *   Helper retorna: { costTotal: 798.60, productiveLaborUnit: 1629.60 }
 *   Motor: cp = 798.60 + 1629.60 = 2428.20 ✓ (step 9 "Redução de custos" correto)
 *
 * Use em callers que populam `BudgetItemRow`/`SaleItemRow` para o motor MRM.
 * NÃO use em callers que esperam CMV consolidado (DRE display, cadastro produto).
 */
export function resolveProductCostAndLabor(
  prod: any,
  tenantCtx?: TenantLaborContext,
): { costTotal: number; productiveLaborUnit: number } {
  const consolidated = resolveProductCostTotal(prod, tenantCtx)
  const productiveLaborUnit = resolveProductLaborTotal(prod, tenantCtx)
  const costTotal = Math.max(0, consolidated - productiveLaborUnit)
  return { costTotal, productiveLaborUnit }
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

/**
 * V14 (Founder 2026-05-25): snapshot COMPLETO dos 4 buckets de despesa do produto.
 *
 * Origem: `pricing_calculations.val_* + pct_*` populados quando produto foi precificado.
 * Cada bucket guarda valor unitário (R$/un) + taxa decimal (0..1) snapshot.
 *
 * Quando ausente OU todos os val_* zerados → retorna `null` (caller usa fallback tenant).
 *
 * `toDecimal` interno: pct_* no banco vem em formato percentual (e.g. 10.51 = 10,51%);
 * normaliza para decimal (0.1051). Se já < 1, preserva.
 */
export interface ProductExpenseBreakdown {
  /**
   * V15 (2026-05-25): CMV completo POR UNIDADE (R$) — material + MO produtiva consolidados.
   * Origem: `pricing_calculations.cmv / yield_quantity` (V8.8 canônico).
   * Quando > 0, motor usa direto como CP × qty (não soma productive_labor_unit).
   * Garante que step 9 (Redução de custos) reflita exatamente o "Custo produto" do cadastro.
   */
  cmv_unit: number
  mo_admin: { rate: number; amount_unit: number }
  fixa: { rate: number; amount_unit: number }
  variavel: { rate: number; amount_unit: number }
  financeira: { rate: number; amount_unit: number }
}

function toDecimalRate(raw: unknown): number {
  const n = Number(raw) || 0
  if (n <= 0) return 0
  // V14 sanity check (mesma lógica do V13.1 use-tenant-tax-context):
  // Valor já em decimal (< 1): preserva, mas se ainda > 20% após preservar é
  // quase sempre erro de escala (e.g. cadastrado 0.43 querendo 0,43%) → /100.
  // Valor em formato percentual (>= 1): /100 (10.51 → 0.1051).
  const decimal = n < 1 ? n : n / 100
  return decimal > 0.2 ? decimal / 100 : decimal
}

/**
 * V16 (Founder 2026-05-25): resolve MO produtiva tentando 5 fontes em ordem.
 * Garante que helpers downstream (resolveProductExpenseBreakdown.cmv_unit) somem
 * MO ao material independente de onde o pipeline de cadastro salvou.
 *
 * Precedência:
 *   1. pricing_calculations.total_labor_net (spec V8.8)
 *   2. pricing_calculations.product_workload_price (cadastro com minutos)
 *   3. pricing_calculations.total_labor_gross
 *   4. SUM(labor_costs[].net_value ‖ gross_value) (V8.3 dedicada)
 *   5. products.productive_labor_total (V15.1 coluna canônica)
 *
 * Retorna 0 quando nenhuma fonte tem valor.
 */
function resolveLaborFromAllSources(
  prod: any,
  pricingArr: any[],
  yieldQty: number,
): number {
  for (const p of pricingArr) {
    const v = Number(p?.total_labor_net) || 0
    if (v > 0) return v / yieldQty
  }
  for (const p of pricingArr) {
    const v = Number(p?.product_workload_price) || 0
    if (v > 0) return v / yieldQty
  }
  for (const p of pricingArr) {
    const v = Number(p?.total_labor_gross) || 0
    if (v > 0) return v / yieldQty
  }
  const laborCosts = Array.isArray(prod?.labor_costs) ? prod.labor_costs : []
  if (laborCosts.length > 0) {
    const sum = laborCosts.reduce(
      (s: number, lc: any) => s + (Number(lc?.net_value) || Number(lc?.gross_value) || 0),
      0,
    )
    if (sum > 0) return sum / yieldQty
  }
  const productive = Number(prod?.productive_labor_total) || 0
  if (productive > 0) return productive
  return 0
}

export function resolveProductExpenseBreakdown(prod: any): ProductExpenseBreakdown | null {
  const yieldQty = Math.max(1, Number(prod?.yield_quantity) || 1)
  const pricingArr: any[] = Array.isArray(prod?.pricing_calculations)
    ? prod.pricing_calculations
    : (prod?.pricing_calculations ? [prod.pricing_calculations] : [])

  if (pricingArr.length === 0) return null

  // Itera linhas — pega primeiro val_* > 0 e pct_* > 0 por bucket (V8.5 padrão)
  const pickPair = (valField: string, pctField: string): { amount_unit: number; rate: number } => {
    let amount_unit = 0
    let rate = 0
    for (const p of pricingArr) {
      const v = Number(p?.[valField]) || 0
      if (v > 0 && amount_unit === 0) amount_unit = v / yieldQty
      const r = toDecimalRate(p?.[pctField])
      if (r > 0 && rate === 0) rate = r
      if (amount_unit > 0 && rate > 0) break
    }
    return { amount_unit, rate }
  }

  const mo_admin = pickPair('val_indirect_labor', 'pct_indirect_labor')
  const fixa = pickPair('val_fixed_expense', 'pct_fixed_expense')
  const variavel = pickPair('val_variable_expense', 'pct_variable_expense')
  const financeira = pickPair('val_financial_expense', 'pct_financial_expense')

  // V16 (Founder 2026-05-25): CMV completo via 5 fontes de labor.
  //
  // Cenário: pipeline de cadastro varia onde salva MO produtiva:
  //   - V8.8 ideal:           pricing_calculations.cmv (já consolidado)
  //   - cadastro com minutos: pricing_calculations.product_workload_price
  //   - cadastro padrão:      pricing_calculations.total_labor_net
  //   - V8.3:                 labor_costs[] (tabela dedicada)
  //   - V15.1:                products.productive_labor_total (coluna canônica)
  //
  // Helper aceita TODAS as fontes (precedência fixa), garantindo que MO produtiva
  // SEMPRE seja somada ao material no `cmv_unit`.
  let cmvFromColumn = 0
  let materialNet = 0
  for (const p of pricingArr) {
    const v = Number(p?.cmv) || 0
    if (v > 0 && cmvFromColumn === 0) cmvFromColumn = v / yieldQty
    const mat = Number(p?.total_material_cost_net) || 0
    if (mat > 0 && materialNet === 0) materialNet = mat / yieldQty
  }
  // V16: fallback material — usa `products.cost_total` quando pricing não tem material.
  if (materialNet === 0) {
    const direct = Number(prod?.cost_total) || 0
    if (direct > 0) materialNet = direct
  }
  const laborResolved = resolveLaborFromAllSources(prod, pricingArr, yieldQty)
  const cmvFromSum = materialNet + laborResolved
  // V16.1 (Founder 2026-05-27): fonte de garantia DIRETA via products.cost_total
  // + productive_labor_total. Soma o "Custo Produto" exibido no cadastro
  // (R$ 2.428,20 = R$ 798,60 + R$ 1.629,60 no cenário Aluminio).
  // Garante que MO produtiva nunca seja perdida mesmo quando pricing_calculations.cmv
  // ficou stale (precificado como REVENDA) ou backfill V15.1 não rodou no tenant.
  //
  // Guard de ativação: SÓ contribui se `cost_total > 0` — preserva precedência
  // existente do `resolveLaborFromAllSources` quando produto não declara cost_total
  // canônico (testes de precedência interna labor_costs > productive_labor_total).
  const directCostTotal = Number(prod?.cost_total) || 0
  const directLaborTotal = Number(prod?.productive_labor_total) || 0
  const cmvFromDirect = directCostTotal > 0 ? directCostTotal + directLaborTotal : 0
  let cmv_unit = Math.max(cmvFromColumn, cmvFromSum, cmvFromDirect)

  const totalAmount =
    mo_admin.amount_unit + fixa.amount_unit + variavel.amount_unit + financeira.amount_unit
  if (totalAmount === 0 && cmv_unit === 0) return null

  return { cmv_unit, mo_admin, fixa, variavel, financeira }
}

export function resolveProductLaborTotal(prod: any, tenantCtx?: TenantLaborContext): number {
  const yieldQty = Math.max(1, Number(prod?.yield_quantity) || 1)

  // 0º V15.1 (2026-05-25): coluna canônica `products.productive_labor_total` (R$/un).
  // Adicionada via migration `20260525000001_add_productive_labor_total_to_products.sql`.
  // Backfill puxa de labor_costs ou pricing_calculations. Quando > 0, fonte preferencial.
  const productiveLaborTotal = Number(prod?.productive_labor_total) || 0
  if (productiveLaborTotal > 0) return productiveLaborTotal

  // 1º labor_costs (tabela dedicada — fonte primária V8.3)
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
    const aggRaw = Number(prod?.pis_cofins_pct)
    if (Number.isFinite(aggRaw) && aggRaw > 0) {
      // BUG FIX (2026-05-29, Hyago — produto "Obra JJCR" 4,325%):
      // `pis_cofins_pct` vem em formato PERCENTUAL (ex.: 4.325 = 4,325%). O split
      // proporcional fazia `pisFinal = agg × 1.65/9.25`, que para alíquotas < ~5,6%
      // resultava em valor < 1 (ex.: 0,77). O `normalizePct` downstream
      // (`n<1 ? n : n/100`) interpretava esse 0,77 como decimal e NÃO dividia por
      // 100 → PIS virava 77% e a cascata exibia ~78% de alíquota artificial.
      // Correção: converter o agregado para DECIMAL antes do split, garantindo que
      // PIS e COFINS saiam em escala decimal inequívoca (sempre < 1, preservados
      // corretamente pelo normalizePct). Robusto p/ agg em percentual OU decimal.
      const aggDecimal = aggRaw < 1 ? aggRaw : aggRaw / 100
      pisFinal = aggDecimal * (1.65 / 9.25)
      cofinsFinal = aggDecimal * (7.60 / 9.25)
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
