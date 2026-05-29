#!/usr/bin/env node
/**
 * DIAG — Roda o motor V17 REAL com os produtos do orçamento do Founder
 * (JJCR R$ 84.023,28 + item R$ 1.822,92 × 6) para inspecionar o PIS/COFINS
 * consolidado, a cascata etapa 13 e por que aparece 0. Read-only.
 */
import { createClient } from '@supabase/supabase-js'
import { calculateMotorV17ForPage } from '../src/utils/mrm-engine-v17/legacy-adapter.ts'
import { buildItemTaxRatesFromProduct } from '../src/utils/item-tax-rates.ts'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function findProd(min, max) {
  const { data } = await supabase
    .from('products')
    .select('*, pricing_calculations(*), product_items(item_id, item_cost_net, item_cost_gross, quantity_needed, items(item_type)), labor_costs(*)')
    .gte('sale_price', min).lte('sale_price', max)
  return data ?? []
}

const jjcrArr = await findProd(84000, 84050)
const svcArr = await findProd(1820, 1826)
const jjcr = jjcrArr[0]
const svc = svcArr.find(p => p.name === 'Portas internas N.V. - 1%') ?? svcArr[0]

console.log('🔧 Produtos do orçamento:')
console.log(`  [1] ${jjcr?.name} — sale_price=${jjcr?.sale_price} | icms_pct=${jjcr?.icms_pct} iss_pct=${jjcr?.iss_pct} pis_cofins_pct=${jjcr?.pis_cofins_pct}`)
console.log(`  [2] ${svc?.name} — sale_price=${svc?.sale_price} | icms_pct=${svc?.icms_pct} iss_pct=${svc?.iss_pct} pis_cofins_pct=${svc?.pis_cofins_pct}`)

console.log('\n🧪 item_tax_rates pós buildItemTaxRatesFromProduct:')
console.log('  JJCR:', JSON.stringify(buildItemTaxRatesFromProduct(jjcr)))
console.log('  SVC :', JSON.stringify(buildItemTaxRatesFromProduct(svc)))

const { data: rates } = await supabase.from('tax_rates').select('*').eq('tenant_id', jjcr.tenant_id)
const { data: cfg } = await supabase.from('tenant_expense_config').select('*').eq('tenant_id', jjcr.tenant_id).maybeSingle()

const mkItem = (prod, qty) => ({
  unit_price: prod.sale_price,
  quantity: qty,
  cost_total: prod.cost_total || 0,
  productive_labor_unit: prod.productive_labor_total || 0,
  commission_percent: prod.commission_percent || 0,
  profit_percent: prod.profit_percent || 0,
  valor_op_interna_unit: prod.valor_precificado_icms_piscofins,
  sale_price_base_unit: prod.sale_price_base,
  terceirizadas_unit: (prod.freight_value || 0) + (prod.insurance_value || 0) + (prod.accessory_expenses_value || 0),
  item_tax_rates: buildItemTaxRatesFromProduct(prod),
})

const tenantCtx = {
  regime: 'LUCRO_REAL',
  rates: rates || [],
  csll_pct: 0.009,
  irpj_pct: 0.015,
  mod_pct: 0,
  dop_pct: 0.277,
  useSnapshotRates: false,
  expense_breakdown: cfg ? {
    administrative_pct: (cfg.indirect_labor_percent || 10.51) / 100,
    fixed_pct: (cfg.fixed_expense_percent || 10.64) / 100,
    variable_pct: (cfg.variable_expense_percent || 6.12) / 100,
    financial_pct: (cfg.financial_expense_percent || 0.43) / 100,
  } : null,
  absorption_policy: 'RRO_PROPORTIONAL',
}

console.log(`\n📋 tenant tax_rates (${(rates||[]).length}): ${JSON.stringify((rates||[]).map(r => ({ t: r.tax_type, p: r.rate_pct })))}`)

const results = calculateMotorV17ForPage({
  items: [mkItem(jjcr, 1), mkItem(svc, 6)],
  tenantCtx,
  globalDiscountPercent: 0,
  effectiveDate: '2026-05-29',
})

const r0 = results[0]
console.log('\n📊 RESULTADO consolidado (item 0):')
console.log('  taxes_inside:', JSON.stringify(r0?.taxes_inside?.map(t => ({ type: t.type, base: Math.round(t.base), amount: Math.round(t.amount * 100) / 100 }))))

const trace = r0?.cascade_trace ?? []
const step13 = trace.find(s => s.step === 13)
console.log('\n🔢 Etapa 13 (cascata tributária):')
console.log(`  base=${step13?.base} amount=${step13?.amount}`)
for (const c of step13?.children ?? []) {
  console.log(`   └─ ${c.label}: base=${c.base} rate=${c.rate != null ? (c.rate * 100).toFixed(4) + '%' : '—'} amount=${c.amount}`)
}
const step14 = trace.find(s => s.step === 14)
console.log(`\n🔢 Etapa 14 (redução custos/despesas): base=${step14?.base} amount=${step14?.amount}`)
for (const c of step14?.children ?? []) {
  console.log(`   └─ ${c.label}: ${c.amount}`)
}
const step15 = trace.find(s => s.step === 15)
console.log(`🔢 Etapa 15 (RRO): base=${step15?.base} amount=${step15?.amount}`)

// Detalhe de custo por produto (cmv reverse / cost_total)
console.log('\n💰 Custo por produto:')
for (const [label, prod] of [['JJCR', jjcr], ['SVC', svc]]) {
  console.log(`  ${label}: cost_total=${prod.cost_total} productive_labor_total=${prod.productive_labor_total} sale_price_base=${prod.sale_price_base} freight=${prod.freight_value} insurance=${prod.insurance_value} accessory=${prod.accessory_expenses_value}`)
  const pc = Array.isArray(prod.pricing_calculations) ? prod.pricing_calculations : []
  console.log(`     pricing_calculations(${pc.length}): ${JSON.stringify(pc.map(p => ({ cmv: p.cmv, mat: p.total_material_cost_net, labor: p.total_labor_net })))}`)
}
