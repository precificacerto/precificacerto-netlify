#!/usr/bin/env node
/**
 * DIAG — Onde está salvo o custo do produto "Obra JJCR"?
 * Excel oficial: custo ≈ R$ 46.092,05 (total c/ serviço) → JJCR ≈ R$ 44.792,05.
 * Motor lê cost_total=0 / cmv=0. Despeja TODAS as fontes de custo. Read-only.
 */
import { createClient } from '@supabase/supabase-js'
import {
  resolveProductCostTotal,
  resolveProductLaborTotal,
  resolveProductExpenseBreakdown,
  resolveProductCostAndLabor,
} from '../src/utils/item-tax-rates.ts'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: prods } = await supabase
  .from('products')
  .select('*, pricing_calculations(*), product_items(*, items(name, item_type)), labor_costs(*)')
  .gte('sale_price', 84000).lte('sale_price', 84050)

const p = prods?.[0]
if (!p) { console.log('Produto não encontrado'); process.exit(1) }

console.log(`📦 ${p.name} (id=${p.id})`)
console.log(`  yield_quantity=${p.yield_quantity}`)
console.log(`  sale_price=${p.sale_price}  sale_price_base=${p.sale_price_base}`)
console.log(`  cost_total=${p.cost_total}  productive_labor_total=${p.productive_labor_total}`)

console.log(`\n🧱 product_items (${(p.product_items||[]).length}):`)
for (const pi of p.product_items || []) {
  console.log(`  - ${pi.items?.name ?? pi.item_id} | item_cost_net=${pi.item_cost_net} gross=${pi.item_cost_gross} qty_needed=${pi.quantity_needed} type=${pi.items?.item_type}`)
}
const sumItemsNet = (p.product_items||[]).reduce((s, pi) => s + (Number(pi.item_cost_net)||0), 0)
console.log(`  Σ item_cost_net = ${sumItemsNet.toFixed(2)}`)

console.log(`\n👷 labor_costs (${(p.labor_costs||[]).length}):`)
for (const lc of p.labor_costs || []) {
  console.log(`  - ${JSON.stringify(lc)}`)
}
const sumLaborNet = (p.labor_costs||[]).reduce((s, lc) => s + (Number(lc.net_value)||Number(lc.gross_value)||0), 0)
console.log(`  Σ labor net = ${sumLaborNet.toFixed(2)}`)

console.log(`\n💵 pricing_calculations (${(p.pricing_calculations||[]).length}) — colunas de custo:`)
for (const pc of p.pricing_calculations || []) {
  const costCols = {}
  for (const [k, v] of Object.entries(pc)) {
    if (/cmv|cost|labor|material|workload|price|cmp|custo/i.test(k) && v != null && v !== 0) costCols[k] = v
  }
  console.log(`  linha: ${JSON.stringify(costCols)}`)
}

// Workload do produto (para derivação de MO)
console.log(`\n⏱️ product_workload nas pricing_calculations:`)
for (const pc of p.pricing_calculations || []) {
  console.log(`  workload=${pc.product_workload} workload_price=${pc.product_workload_price} total_labor_net=${pc.total_labor_net} total_material_cost_net=${pc.total_material_cost_net} cmv=${pc.cmv}`)
}

// Tenant labor context
const { data: cfg } = await supabase.from('tenant_expense_config').select('*').eq('tenant_id', p.tenant_id).maybeSingle()
const { data: settings } = await supabase.from('tenant_settings').select('*').eq('tenant_id', p.tenant_id).maybeSingle()
console.log(`\n🏭 tenant_expense_config: production_labor_cost=${cfg?.production_labor_cost} productive_value_per_minute=${cfg?.productive_value_per_minute} monthly_workload=${cfg?.monthly_workload_minutes ?? settings?.monthly_workload_minutes}`)

const tenantCtx = {
  production_labor_cost: Number(cfg?.production_labor_cost) || 0,
  monthly_workload_minutes: Number(cfg?.monthly_workload_minutes ?? settings?.monthly_workload_minutes) || 176 * 60,
  productive_value_per_minute: Number(cfg?.productive_value_per_minute) || 0,
}

console.log(`\n🔬 Helpers de custo (com tenant labor context):`)
console.log(`  resolveProductCostTotal      = ${resolveProductCostTotal(p, tenantCtx).toFixed(2)}`)
console.log(`  resolveProductLaborTotal     = ${resolveProductLaborTotal(p, tenantCtx).toFixed(2)}`)
const cl = resolveProductCostAndLabor(p, tenantCtx)
console.log(`  resolveProductCostAndLabor   = costTotal ${cl.costTotal.toFixed(2)} + MO ${cl.productiveLaborUnit.toFixed(2)} = ${(cl.costTotal + cl.productiveLaborUnit).toFixed(2)}`)
const eb = resolveProductExpenseBreakdown(p)
console.log(`  resolveProductExpenseBreakdown.cmv_unit = ${eb?.cmv_unit?.toFixed(2) ?? 'null'}`)

console.log(`\n🎯 Custo esperado (Excel): JJCR ≈ R$ 44.792,05 = Material 38.293,61 + MO ~6.498,44`)
