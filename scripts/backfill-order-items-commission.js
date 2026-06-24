/**
 * Backfill order_items ← budget_items (Relatório v2.0 — itens 2.2/2.3).
 * Replica em JS (supabase-js + service_role) a migração SQL
 * 20260624000001, pois não há psql/CLI/connection string no ambiente.
 *
 * Uso:
 *   node scripts/backfill-order-items-commission.js            (DRY-RUN, só leitura)
 *   node scripts/backfill-order-items-commission.js --apply    (grava no banco)
 *
 * Idempotente: só preenche campos NULL em order_items, copiando do
 * budget_item correspondente (mesmo budget + product/service + unit_price + quantity).
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

// ── parse .env (sem dependência de dotenv) ──
const env = {}
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const SUPABASE_URL = env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env')
  process.exit(1)
}
const APPLY = process.argv.includes('--apply')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function fetchAll(table, select, applyFilter) {
  const pageSize = 1000
  let from = 0
  const all = []
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (applyFilter) q = applyFilter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...data)
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

const norm = (v) => (v === null || v === undefined ? '' : String(v))
const matchKey = (r) => `${norm(r.product_id)}|${norm(r.service_id)}|${Number(r.unit_price)}|${Number(r.quantity)}`

async function main() {
  console.log(`\n=== Backfill order_items (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)

  // 1) Connectividade
  const { count: ordersCount, error: cErr } = await supabase
    .from('orders').select('id', { count: 'exact', head: true })
  if (cErr) throw new Error(`Conectividade: ${cErr.message}`)
  console.log(`Conectado. orders no banco: ${ordersCount}`)

  // 2) Pedidos com budget_id
  const orders = await fetchAll('orders', 'id, budget_id, order_code', (q) => q.not('budget_id', 'is', null))
  const orderById = new Map(orders.map((o) => [o.id, o]))
  console.log(`Pedidos com budget_id: ${orders.length}`)

  // 3) order_items que precisam de correção
  const needFix = await fetchAll(
    'order_items',
    'id, order_id, product_id, service_id, unit_price, quantity, commission_pct, profit_pct, tax_breakdown',
    (q) => q.or('commission_pct.is.null,profit_pct.is.null,tax_breakdown.is.null'),
  )
  // só os que pertencem a um pedido com budget_id
  const fixable = needFix.filter((oi) => orderById.has(oi.order_id))
  console.log(`order_items sem comissão/lucro/snapshot: ${needFix.length} (com orçamento de origem: ${fixable.length})`)

  // 4) budget_items dos orçamentos envolvidos
  const budgetIds = [...new Set(fixable.map((oi) => orderById.get(oi.order_id).budget_id).filter(Boolean))]
  const budgetItems = budgetIds.length
    ? await fetchAll(
        'budget_items',
        'budget_id, product_id, service_id, unit_price, quantity, commission_pct, profit_pct, tax_breakdown, created_at',
        (q) => q.in('budget_id', budgetIds),
      )
    : []
  // index: budget_id -> matchKey -> [budget_items ordenados por created_at asc]
  const biIndex = new Map()
  for (const bi of budgetItems) {
    const k = `${bi.budget_id}::${matchKey(bi)}`
    const arr = biIndex.get(k) || []
    arr.push(bi)
    biIndex.set(k, arr)
  }
  for (const arr of biIndex.values()) {
    arr.sort((a, b) => {
      if (!a.created_at) return 1
      if (!b.created_at) return -1
      return a.created_at < b.created_at ? -1 : 1
    })
  }

  // 5) montar updates (COALESCE: só preenche o que está null no order_item e existe no budget_item)
  let matched = 0
  let noMatch = 0
  const updates = []
  for (const oi of fixable) {
    const budgetId = orderById.get(oi.order_id).budget_id
    const k = `${budgetId}::${matchKey(oi)}`
    const candidates = biIndex.get(k)
    if (!candidates || candidates.length === 0) {
      noMatch++
      continue
    }
    // origem precisa ter ALGUM dado fiscal
    const bi = candidates.find(
      (c) => c.commission_pct != null || c.profit_pct != null || c.tax_breakdown != null,
    )
    if (!bi) {
      noMatch++
      continue
    }
    const patch = {}
    if (oi.commission_pct == null && bi.commission_pct != null) patch.commission_pct = bi.commission_pct
    if (oi.profit_pct == null && bi.profit_pct != null) patch.profit_pct = bi.profit_pct
    if (oi.tax_breakdown == null && bi.tax_breakdown != null) patch.tax_breakdown = bi.tax_breakdown
    if (Object.keys(patch).length === 0) continue
    matched++
    updates.push({ id: oi.id, patch })
  }

  console.log(`Itens com match e atualização pendente: ${matched}`)
  console.log(`Itens sem match no orçamento (ficam degradados): ${noMatch}`)

  // 6) diagnóstico PED-59586C
  const ped = orders.find((o) => o.order_code === 'PED-59586C')
  if (ped) {
    const its = fixable.filter((oi) => oi.order_id === ped.id)
    const upd = updates.filter((u) => its.some((i) => i.id === u.id))
    console.log(`PED-59586C: ${its.length} item(ns) a corrigir, ${upd.length} com match/patch.`)
  } else {
    console.log('PED-59586C: não encontrado entre pedidos com budget_id (pode ser pedido sem orçamento).')
  }

  if (!APPLY) {
    console.log('\nDRY-RUN — nenhuma gravação feita. Rode com --apply para gravar.')
    return
  }

  // 7) aplicar
  let ok = 0
  let fail = 0
  for (const u of updates) {
    const { error } = await supabase.from('order_items').update(u.patch).eq('id', u.id)
    if (error) {
      fail++
      if (fail <= 5) console.error(`  falha id=${u.id}: ${error.message}`)
    } else {
      ok++
    }
    if ((ok + fail) % 100 === 0) console.log(`  progresso: ${ok + fail}/${updates.length}`)
  }
  console.log(`\nAplicado. Sucesso: ${ok} | Falhas: ${fail}`)
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exit(1)
})
