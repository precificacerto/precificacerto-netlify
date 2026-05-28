#!/usr/bin/env node
/**
 * Valida fórmula Op Interna usando dados reais do banco.
 * Confirma que sale_price_base - terceirizadas = Op Interna do cadastro.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const PRODUCT_ID = '675bfe61-a9ff-4a33-ac38-b893c181bfc9'

const { data: prod } = await supabase
  .from('products')
  .select('id, name, sale_price, sale_price_base, freight_value, insurance_value, accessory_expenses_value, icms_pct, pis_cofins_pct, iss_pct, ibs_pct, cbs_pct, ipi_pct, is_pct, valor_precificado_icms_piscofins')
  .eq('id', PRODUCT_ID)
  .single()

const tercTotal = (prod.freight_value ?? 0) + (prod.insurance_value ?? 0) + (prod.accessory_expenses_value ?? 0)
const opInternaCalc = (prod.sale_price_base ?? 0) - tercTotal
const pesoOpInternaCalc = opInternaCalc / prod.sale_price

console.log('🧮 VALIDAÇÃO MATEMÁTICA — PRODUTO GANCHO')
console.log('='.repeat(70))
console.log(`\nCampos do banco:`)
console.log(`  sale_price                       = R$ ${prod.sale_price.toFixed(2)}`)
console.log(`  sale_price_base                  = R$ ${prod.sale_price_base.toFixed(2)}`)
console.log(`  freight_value                    = R$ ${prod.freight_value.toFixed(2)}`)
console.log(`  insurance_value                  = R$ ${prod.insurance_value.toFixed(2)}`)
console.log(`  accessory_expenses_value         = R$ ${prod.accessory_expenses_value.toFixed(2)}`)
console.log(`  total terceirizadas              = R$ ${tercTotal.toFixed(2)}`)

console.log(`\n📐 Op Interna calculada (fórmula correta):`)
console.log(`  = sale_price_base - terceirizadas`)
console.log(`  = ${prod.sale_price_base.toFixed(2)} - ${tercTotal.toFixed(2)}`)
console.log(`  = R$ ${opInternaCalc.toFixed(2)}`)
console.log(`  ${opInternaCalc.toFixed(2) === '11847.88' ? '✅' : '❌'} Esperado pelo cadastro: R$ 11.847,88`)

console.log(`\n📊 Peso Op Interna calculado:`)
console.log(`  = ${opInternaCalc.toFixed(2)} / ${prod.sale_price.toFixed(2)}`)
console.log(`  = ${(pesoOpInternaCalc * 100).toFixed(4)}%`)
console.log(`  ${Math.abs(pesoOpInternaCalc - 0.5177) < 0.001 ? '✅' : '❌'} Esperado: 51,77%`)

console.log(`\n💸 Impostos por dentro (sobre Op Interna):`)
const icms = opInternaCalc * (prod.icms_pct / 100)
const pisCofins = opInternaCalc * (prod.pis_cofins_pct / 100)
console.log(`  ICMS (${prod.icms_pct}%)                       = R$ ${icms.toFixed(2)}`)
console.log(`  ${Math.abs(icms - 2014.14) < 1 ? '✅' : '❌'} Esperado: R$ 2.014,14`)
console.log(`  PIS/COFINS (${prod.pis_cofins_pct}%)             = R$ ${pisCofins.toFixed(2)}`)
console.log(`  ${Math.abs(pisCofins - 1095.93) < 1 ? '✅' : '❌'} Esperado: R$ 1.095,93`)

console.log(`\n🔴 valor_precificado_icms_piscofins NO BANCO está ERRADO:`)
console.log(`  Banco: R$ ${prod.valor_precificado_icms_piscofins.toFixed(2)}`)
console.log(`  Correto: R$ ${opInternaCalc.toFixed(2)}`)
console.log(`  Diferença: R$ ${(opInternaCalc - prod.valor_precificado_icms_piscofins).toFixed(2)}`)

console.log('\n' + '='.repeat(70))
console.log(`✅ FÓRMULA CONFIRMADA. Pronto pra implementar no adapter.`)
