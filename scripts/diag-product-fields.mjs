#!/usr/bin/env node
/**
 * Diag completo do produto problemático — lê TODOS os campos R$ relevantes.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const PRODUCT_ID = '675bfe61-a9ff-4a33-ac38-b893c181bfc9'

// Pega TODOS os campos do produto
const { data: prod } = await supabase
  .from('products')
  .select('*')
  .eq('id', PRODUCT_ID)
  .single()

console.log('📦 ALL PRODUCT FIELDS:\n')
const moneyFields = Object.entries(prod)
  .filter(([k, v]) => typeof v === 'number' && k !== 'id')
  .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))

console.log('Campos numéricos (ordenados por valor absoluto):')
moneyFields.forEach(([k, v]) => {
  console.log(`  ${k.padEnd(45)} = ${v}`)
})

console.log('\n\n💰 ALL PRICING_CALCULATIONS FIELDS:\n')
const { data: pcs } = await supabase
  .from('pricing_calculations')
  .select('*')
  .eq('product_id', PRODUCT_ID)

if (pcs && pcs.length > 0) {
  const pc = pcs[0]
  const pcMoneyFields = Object.entries(pc)
    .filter(([k, v]) => typeof v === 'number' && k !== 'id' && k !== 'version')
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))

  console.log('Campos numéricos da pricing_calculations:')
  pcMoneyFields.forEach(([k, v]) => {
    console.log(`  ${k.padEnd(45)} = ${v}`)
  })

  // Procurar valores específicos do cadastro
  console.log('\n🎯 Procurando valores-chave nos campos:')
  const targets = [
    { value: 5455.95, label: 'Custo total (componentes + MO)' },
    { value: 5431.99, label: 'MO produtiva' },
    { value: 11847.88, label: 'Op Interna (com ICMS+PIS)' },
    { value: 2014.14, label: 'ICMS' },
    { value: 1095.93, label: 'PIS/COFINS' },
    { value: 1245.21, label: 'MO Admin' },
    { value: 1260.61, label: 'Despesas Fixas' },
    { value: 725.09, label: 'Despesas Variáveis' },
    { value: 50.95, label: 'Despesas Financeiras' },
    { value: 22888.21, label: 'Preço final' },
    { value: 18347.88, label: 'Preço base (sem imp. fora)' },
  ]

  for (const t of targets) {
    const matches = []
    for (const [k, v] of Object.entries(pc)) {
      if (typeof v === 'number' && Math.abs(v - t.value) < 0.5) {
        matches.push(`pricing.${k}`)
      }
    }
    for (const [k, v] of Object.entries(prod)) {
      if (typeof v === 'number' && Math.abs(v - t.value) < 0.5) {
        matches.push(`product.${k}`)
      }
    }
    console.log(`  ${t.label.padEnd(40)} = R$ ${t.value} → ${matches.length > 0 ? matches.join(', ') : '❌ NÃO ENCONTRADO'}`)
  }
}

// Verificar quando o produto foi atualizado
console.log('\n📅 Timestamps:')
console.log(`  created_at: ${prod.created_at}`)
console.log(`  updated_at: ${prod.updated_at}`)
if (pcs && pcs.length > 0) {
  console.log(`  pricing.calculated_at: ${pcs[0].calculated_at}`)
  console.log(`  pricing.updated_at: ${pcs[0].updated_at}`)
  console.log(`  pricing.recalculated: ${pcs[0].recalculated}`)
}
