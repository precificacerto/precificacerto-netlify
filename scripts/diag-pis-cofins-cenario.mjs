#!/usr/bin/env node
/**
 * DIAG — Reproduz o cenário PIS/COFINS 78,3385% (29/05/2026).
 * Busca os produtos do orçamento do Founder POR PREÇO e inspeciona a ESCALA
 * das alíquotas tributárias por dentro (icms_pct, pis_cofins_pct, pis_pct,
 * cofins_pct, iss_pct), simulando a normalização que o motor V17 aplica.
 *
 * Read-only. Não altera nada.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Réplica EXATA do normalizePct usado nos tributos por dentro (legacy-adapter.ts:346)
const normalizePctTaxes = (v) => {
  const n = Number(v) || 0
  return n < 1 ? n : n / 100
}
// Réplica do toDecimalRate usado nas DESPESAS (item-tax-rates.ts:291) — TEM clamp 0.2
const toDecimalRateDespesas = (raw) => {
  const n = Number(raw) || 0
  if (n <= 0) return 0
  const decimal = n < 1 ? n : n / 100
  return decimal > 0.2 ? decimal / 100 : decimal
}

const ALVOS = [
  { label: 'PRODUTO principal', min: 84000, max: 84050 },
  { label: 'SERVIÇO (un.)', min: 1820, max: 1826 },
]

const TAX_COLS = 'id, name, tenant_id, sale_price, sale_price_base, freight_value, insurance_value, accessory_expenses_value, icms_pct, pis_cofins_pct, pis_pct, cofins_pct, iss_pct, ipi_pct, ibs_pct, cbs_pct, valor_precificado_icms_piscofins'

async function buscarEm(tabela, min, max) {
  const { data, error } = await supabase
    .from(tabela)
    .select(TAX_COLS)
    .gte('sale_price', min)
    .lte('sale_price', max)
  if (error) {
    // tabela pode não ter alguma coluna — tenta select reduzido
    return { data: null, error }
  }
  return { data, error: null }
}

console.log('🔎 DIAG PIS/COFINS — cenário 78,3385% (R$ 67.808,61)')
console.log('='.repeat(90))

for (const alvo of ALVOS) {
  console.log(`\n\n### ${alvo.label}  (sale_price entre ${alvo.min} e ${alvo.max})`)
  let rows = []
  for (const tabela of ['products', 'services']) {
    const { data, error } = await buscarEm(tabela, alvo.min, alvo.max)
    if (error) {
      console.log(`  (${tabela}: ${error.message})`)
      continue
    }
    if (data?.length) rows.push(...data.map((r) => ({ ...r, _tabela: tabela })))
  }
  if (!rows.length) {
    console.log('  ⚠️ Nenhum produto/serviço encontrado nessa faixa de preço.')
    continue
  }
  for (const p of rows) {
    const pis = Number(p.pis_pct)
    const cofins = Number(p.cofins_pct)
    const agg = Number(p.pis_cofins_pct)
    console.log(`\n  • [${p._tabela}] "${p.name}" (tenant ${p.tenant_id})`)
    console.log(`      sale_price=${p.sale_price}  sale_price_base=${p.sale_price_base}`)
    console.log(`      RAW icms_pct=${p.icms_pct}  iss_pct=${p.iss_pct}`)
    console.log(`      RAW pis_cofins_pct=${p.pis_cofins_pct}  pis_pct=${p.pis_pct}  cofins_pct=${p.cofins_pct}`)

    // Simula buildItemTaxRatesFromProduct
    let pisF, cofinsF
    const hasSep = (Number.isFinite(pis) && pis > 0) || (Number.isFinite(cofins) && cofins > 0)
    if (hasSep) {
      pisF = Number.isFinite(pis) ? pis : null
      cofinsF = Number.isFinite(cofins) ? cofins : null
    } else if (Number.isFinite(agg) && agg > 0) {
      // FIX 2026-05-29: normaliza agregado para decimal ANTES do split
      const aggDecimal = agg < 1 ? agg : agg / 100
      pisF = aggDecimal * (1.65 / 9.25)
      cofinsF = aggDecimal * (7.6 / 9.25)
    }
    const pisN = normalizePctTaxes(pisF)
    const cofinsN = normalizePctTaxes(cofinsF)
    const somaPisCofins = pisN + cofinsN
    console.log(`      → pisFinal=${pisF}  cofinsFinal=${cofinsF}`)
    console.log(`      → normalizado (tributos): PIS=${pisN}  COFINS=${cofinsN}  SOMA=${(somaPisCofins * 100).toFixed(4)}%`)
    const seFosseDespesa = toDecimalRateDespesas(agg)
    console.log(`      → (se passasse pelo clamp de despesas: ${(seFosseDespesa * 100).toFixed(4)}%)`)
    if (somaPisCofins > 0.2) {
      console.log(`      🔴 ESCALA ANÔMALA — PIS/COFINS normalizado = ${(somaPisCofins * 100).toFixed(2)}% (impossível como alíquota real)`)
    }
  }
}

console.log('\n' + '='.repeat(90))
console.log('✅ Diagnóstico concluído.')
