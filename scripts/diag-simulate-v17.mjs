#!/usr/bin/env node
/**
 * Simula o adapter V17 com o produto Gancho REAL do banco.
 * Confirma se ICMS/PIS/COFINS batem com cadastro do produto.
 */
import { createClient } from '@supabase/supabase-js'
import { calculateMotorV17ForPage } from '../src/utils/mrm-engine-v17/legacy-adapter.ts'
import { buildItemTaxRatesFromProduct } from '../src/utils/item-tax-rates.ts'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const PRODUCT_ID = '675bfe61-a9ff-4a33-ac38-b893c181bfc9'
const TENANT_ID_GANCHO = '20e08592-f957-4e72-b7eb-251387e34eb9' // Esquadrias De Paula

// 1) Buscar produto
const { data: prod } = await supabase.from('products').select('*').eq('id', PRODUCT_ID).single()

// 2) Buscar config tributária do tenant (tenant_expense_config + tax_rates)
const { data: cfg } = await supabase
  .from('tenant_expense_config')
  .select('*')
  .eq('tenant_id', prod.tenant_id)
  .maybeSingle()

const { data: rates } = await supabase
  .from('tax_rates')
  .select('*')
  .eq('tenant_id', prod.tenant_id)

console.log('🧪 Simulando V17 com produto Gancho REAL')
console.log('='.repeat(80))

const item = {
  unit_price: prod.sale_price,
  quantity: 1,
  cost_total: prod.cost_total || 0,
  productive_labor_unit: prod.productive_labor_total || 0,
  commission_percent: prod.commission_percent || 0,
  profit_percent: prod.profit_percent || 0,
  // Campos novos V17 fix
  valor_op_interna_unit: prod.valor_precificado_icms_piscofins,
  sale_price_base_unit: prod.sale_price_base,
  terceirizadas_unit: (prod.freight_value || 0) + (prod.insurance_value || 0) + (prod.accessory_expenses_value || 0),
  // Item tax rates (do produto) — usa helper canônico do app
  item_tax_rates: buildItemTaxRatesFromProduct(prod),
}

console.log('\n🔍 DEBUG — item.item_tax_rates (pós buildItemTaxRatesFromProduct):')
console.log(JSON.stringify(item.item_tax_rates, null, 2))

// (Debug merged removido — variável tenantCtx fora de escopo aqui)

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

console.log('\n📦 Input do item:')
console.log(`  unit_price: R$ ${item.unit_price}`)
console.log(`  sale_price_base_unit: R$ ${item.sale_price_base_unit}`)
console.log(`  terceirizadas_unit: R$ ${item.terceirizadas_unit}`)
console.log(`  valor_op_interna_unit (legacy banco): R$ ${item.valor_op_interna_unit}`)
console.log(`\n📐 Op Interna esperada: R$ ${(item.sale_price_base_unit - item.terceirizadas_unit).toFixed(2)}`)

const result = calculateMotorV17ForPage({
  items: [item],
  tenantCtx,
  globalDiscountPercent: 0,
  effectiveDate: '2026-05-28',
})

const r0 = result[0]
if (!r0) {
  console.log('❌ Resultado nulo')
  process.exit(1)
}

console.log('\n📊 RESULTADO V17:')
console.log(`  rb: R$ ${r0.rb.toFixed(2)}`)
console.log(`  cp (CMV): R$ ${r0.cp.toFixed(2)}  ${Math.abs(r0.cp - 5455.95) < 50 ? '✅' : '⚠️'} esperado ~R$ 5.455,95`)

const icmsLine = r0.taxes_inside?.find(t => t.type === 'ICMS')
const pisLine = r0.taxes_inside?.find(t => t.type === 'PIS')
const cofinsLine = r0.taxes_inside?.find(t => t.type === 'COFINS')

console.log(`\n💸 Impostos por dentro (esperado bater com cadastro):`)
console.log(`  ICMS: R$ ${icmsLine?.amount.toFixed(2) ?? 0}  ${icmsLine && Math.abs(icmsLine.amount - 2014.14) < 5 ? '✅' : '❌'} esperado R$ 2.014,14`)
console.log(`  PIS:  R$ ${pisLine?.amount.toFixed(2) ?? 0}`)
console.log(`  COFINS: R$ ${cofinsLine?.amount.toFixed(2) ?? 0}`)
const pisCofinsTotal = (pisLine?.amount || 0) + (cofinsLine?.amount || 0)
console.log(`  PIS+COFINS total: R$ ${pisCofinsTotal.toFixed(2)}  ${Math.abs(pisCofinsTotal - 1095.93) < 5 ? '✅' : '❌'} esperado R$ 1.095,93`)

console.log(`\n💰 RRO: R$ ${r0.rro.toFixed(2)}  ${r0.rro >= -10 ? '✅ (perto de zero)' : '❌'}`)
console.log(`  Comissão: R$ ${r0.new_commission?.toFixed(2)}`)
console.log(`  Lucro: R$ ${r0.new_profit?.toFixed(2)}`)
console.log(`  IRPJ: R$ ${r0.new_irpj?.toFixed(2)}`)
console.log(`  CSLL: R$ ${r0.new_csll?.toFixed(2)}`)

console.log('\n' + '='.repeat(80))
console.log('✅ Simulação concluída.')
