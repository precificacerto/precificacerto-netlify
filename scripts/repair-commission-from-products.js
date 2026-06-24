/**
 * Repair display (Relatório v2.0 — itens 2.2/2.3): preenche commission_pct/profit_pct
 * degradados (null ou 0) em order_items e budget_items a partir do CADASTRO do produto
 * (products.commission_percent/profit_percent ÷ 100 = decimal). Só altera quando o
 * produto tem % > 0. NÃO toca totais, RRO, tax_breakdown nem valores de venda.
 * O caminho display-first do app passa a exibir Comissão/Lucro com base nesses %.
 *
 * Uso: node scripts/repair-commission-from-products.js [--apply]
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const env = {}
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

const degraded = (v) => v == null || Number(v) === 0

async function fetchAll(table, select) {
  const pageSize = 1000
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...data)
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function repairTable(table, rows, pMap) {
  let changed = 0
  for (const r of rows) {
    if (!r.product_id) continue
    const p = pMap.get(r.product_id)
    if (!p) continue
    const cp = Number(p.commission_percent) || 0
    const pp = Number(p.profit_percent) || 0
    const patch = {}
    if (degraded(r.commission_pct) && cp > 0) patch.commission_pct = cp / 100
    if (degraded(r.profit_pct) && pp > 0) patch.profit_pct = pp / 100
    if (Object.keys(patch).length === 0) continue
    changed++
    console.log(`  ${table} ${r.id}: ${JSON.stringify(patch)} (produto "${p.name}")`)
    if (APPLY) {
      const { error } = await supabase.from(table).update(patch).eq('id', r.id)
      if (error) console.error(`    ERRO: ${error.message}`)
    }
  }
  return changed
}

async function main() {
  console.log(`\n=== Repair commission/profit from product (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)
  const orderItems = await fetchAll('order_items', 'id, product_id, commission_pct, profit_pct')
  const budgetItems = await fetchAll('budget_items', 'id, product_id, commission_pct, profit_pct')
  const prodIds = [
    ...new Set([...orderItems, ...budgetItems].map((r) => r.product_id).filter(Boolean)),
  ]
  const prods = prodIds.length ? await fetchAll('products', 'id, name, commission_percent, profit_percent') : []
  const pMap = new Map(prods.map((p) => [p.id, p]))

  console.log('\n-- order_items --')
  const oc = await repairTable('order_items', orderItems, pMap)
  console.log('\n-- budget_items --')
  const bc = await repairTable('budget_items', budgetItems, pMap)

  console.log(`\nTotal a alterar: order_items=${oc}, budget_items=${bc}`)
  if (!APPLY) console.log('DRY-RUN — nada gravado. Rode com --apply para gravar.')
}
main().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
