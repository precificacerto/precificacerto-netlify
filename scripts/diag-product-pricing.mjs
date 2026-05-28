#!/usr/bin/env node
/**
 * Script de diagnóstico — EPIC-MRM-V17 (2026-05-28)
 *
 * Investiga divergência entre cadastro de produto e cálculo V17:
 *   - Produto cadastrado mostra Op Interna = R$ 11.847,88
 *   - V17 está usando peso baseado em R$ 8.653,37 (campo products.valor_precificado_icms_piscofins)
 *
 * Como rodar:
 *   node scripts/diag-product-pricing.mjs
 *
 * NÃO modifica nada — apenas SELECT.
 */

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'

loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltam credenciais no .env (SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

const TARGET_SALE_PRICE = 22888.21

console.log('🔍 Diagnóstico V17 — produto com sale_price =', TARGET_SALE_PRICE)
console.log('='.repeat(80))

// ─── Q1: produto problemático ────────────────────────────────────────────────
console.log('\n📦 Q1) Produto cadastrado:\n')

const { data: products, error: e1 } = await supabase
  .from('products')
  .select('id, name, sale_price, cost_total, valor_precificado_icms_piscofins, productive_labor_total, yield_quantity')
  .gte('sale_price', TARGET_SALE_PRICE - 0.1)
  .lte('sale_price', TARGET_SALE_PRICE + 0.1)
  .limit(5)

if (e1) {
  console.error('❌ Erro:', e1)
  process.exit(1)
}

if (!products || products.length === 0) {
  console.log('⚠️  Nenhum produto encontrado com esse sale_price exato.')
  console.log('Tentando busca alternativa por faixa de preço...')
  const { data: alt } = await supabase
    .from('products')
    .select('id, name, sale_price, valor_precificado_icms_piscofins')
    .gte('sale_price', 22000)
    .lte('sale_price', 23500)
    .limit(10)
  console.log('Produtos próximos:', JSON.stringify(alt, null, 2))
} else {
  products.forEach((p, i) => {
    console.log(`Produto ${i + 1}:`)
    console.log(`  id: ${p.id}`)
    console.log(`  name: ${p.name}`)
    console.log(`  sale_price: R$ ${p.sale_price}`)
    console.log(`  cost_total: R$ ${p.cost_total}`)
    console.log(`  valor_precificado_icms_piscofins: R$ ${p.valor_precificado_icms_piscofins ?? 'NULL'}  ⬅️  É ISSO QUE V17 USA`)
    console.log(`  productive_labor_total: R$ ${p.productive_labor_total ?? 'NULL'}`)
    console.log(`  yield_quantity: ${p.yield_quantity}`)
    console.log()
  })

  // ─── Q2: pricing_calculations ──────────────────────────────────────────────
  console.log('💰 Q2) Pricing calculations do produto:\n')

  const productIds = products.map(p => p.id)
  const { data: pricings, error: e2 } = await supabase
    .from('pricing_calculations')
    .select('*')
    .in('product_id', productIds)

  if (e2) {
    console.error('❌ Erro:', e2)
  } else if (!pricings || pricings.length === 0) {
    console.log('⚠️  Nenhuma pricing_calculation encontrada.')
  } else {
    pricings.forEach((pc, i) => {
      console.log(`Pricing ${i + 1} (product_id ${pc.product_id}):`)
      const fields = [
        'cmv', 'total_material_cost_net', 'total_labor_net',
        'val_indirect_labor', 'pct_indirect_labor',
        'val_fixed_expense', 'pct_fixed_expense',
        'val_variable_expense', 'pct_variable_expense',
        'val_financial_expense', 'pct_financial_expense',
        'final_price', 'unit_price',
      ]
      fields.forEach(f => {
        if (pc[f] != null) {
          console.log(`  ${f}: ${pc[f]}`)
        }
      })
      // Listar TODAS as chaves que existem (para descobrir nomes desconhecidos)
      const otherKeys = Object.keys(pc).filter(k => !fields.includes(k) && k !== 'product_id' && k !== 'id')
      if (otherKeys.length > 0) {
        console.log(`  Outros campos disponíveis: ${otherKeys.join(', ')}`)
      }
      console.log()
    })
  }
}

// ─── Q3: schema da tabela products ───────────────────────────────────────────
console.log('🗂️  Q3) Colunas de products relacionadas a valor/preço/icms:\n')

// Supabase REST não permite information_schema direto, vamos pegar 1 row e listar keys
const { data: sample } = await supabase
  .from('products')
  .select('*')
  .limit(1)

if (sample && sample.length > 0) {
  const relevantKeys = Object.keys(sample[0]).filter(k =>
    k.includes('valor') || k.includes('price') || k.includes('icms') ||
    k.includes('pis') || k.includes('cofins') || k.includes('internal') ||
    k.includes('preco')
  )
  console.log('Campos relevantes em products:')
  relevantKeys.forEach(k => console.log(`  - ${k}`))
  console.log()
}

console.log('='.repeat(80))
console.log('✅ Diagnóstico concluído. Cole o output acima na conversa.')
