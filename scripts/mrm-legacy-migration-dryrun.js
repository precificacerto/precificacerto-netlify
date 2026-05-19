/* eslint-disable no-console */
/**
 * MRM S2.2 — Dry-Run pré-execução da migration legacy → V2.
 *
 * Lê (read-only) o estado atual do banco e produz relatório por tenant
 * dos documentos que serão afetados pelas Phases 2 (lazy recalc) e 3
 * (legacy_locked), antes que as migrations
 * 20260520000002/003/004 sejam aplicadas.
 *
 * Uso:
 *   npm run mrm:legacy-dryrun
 *
 * Env vars necessárias (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   - Lemos via process.env (sem dotenv) — quem rodar deve fornecer.
 *   - Se faltarem, o script sai com exit code 1 (sem stack trace cru).
 */

const { createClient } = require('@supabase/supabase-js');

// Status enums apurados no schema do projeto:
const BUDGET_DRAFT_STATUSES = ['DRAFT', 'SENT'];
const BUDGET_LOCK_STATUSES = ['APPROVED', 'PAID', 'EXPIRED', 'REJECTED', 'CANCELLED'];

const ORDER_DRAFT_STATUSES = ['DRAFT', 'AWAITING_PAYMENT', 'PENDING'];
const ORDER_LOCK_STATUSES = [
  'SENT_TO_SALE', 'PAID', 'CANCELLED',
  'APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED',
];

const SALES_LOCK_STATUSES = ['COMPLETED', 'PAID'];

function bail(msg) {
  console.error(`[mrm-legacy-dryrun] ABORT: ${msg}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    bail(
      'env vars não configuradas. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar (este script é read-only, mas exige service_role para bypass de RLS).',
    );
  }

  let supabase;
  try {
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    bail(`falha ao criar cliente Supabase: ${err.message}`);
  }

  console.log('[mrm-legacy-dryrun] start — read-only report');
  console.log('[mrm-legacy-dryrun] supabase url:', url);

  const report = new Map(); // tenant_id -> aggregates

  function ensureTenant(tenantId) {
    if (!report.has(tenantId)) {
      report.set(tenantId, {
        tenant_id: tenantId,
        budgets_legacy: 0,
        budgets_by_status: {},
        orders_legacy: 0,
        orders_by_status: {},
        sales_legacy: 0,
        sales_by_status: {},
        phase2_budgets: 0,
        phase2_orders: 0,
        phase3_budgets: 0,
        phase3_orders: 0,
        phase3_sales: 0,
      });
    }
    return report.get(tenantId);
  }

  // --- BUDGETS ---
  try {
    const { data, error } = await supabase
      .from('budgets')
      .select('id, tenant_id, status, engine_version, legacy_locked')
      .or('engine_version.eq.legacy,engine_version.is.null');

    if (error) bail(`erro lendo budgets: ${error.message}`);

    for (const row of data || []) {
      const t = ensureTenant(row.tenant_id);
      t.budgets_legacy++;
      const s = String(row.status);
      t.budgets_by_status[s] = (t.budgets_by_status[s] || 0) + 1;

      if (!row.legacy_locked) {
        if (BUDGET_DRAFT_STATUSES.includes(s)) t.phase2_budgets++;
        if (BUDGET_LOCK_STATUSES.includes(s)) t.phase3_budgets++;
      }
    }
    console.log(`[mrm-legacy-dryrun] budgets legacy lidos: ${data?.length ?? 0}`);
  } catch (err) {
    bail(`exceção em budgets: ${err.message}`);
  }

  // --- ORDERS ---
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, tenant_id, status, engine_version, legacy_locked')
      .or('engine_version.eq.legacy,engine_version.is.null');

    if (error) bail(`erro lendo orders: ${error.message}`);

    for (const row of data || []) {
      const t = ensureTenant(row.tenant_id);
      t.orders_legacy++;
      const s = String(row.status);
      t.orders_by_status[s] = (t.orders_by_status[s] || 0) + 1;

      if (!row.legacy_locked) {
        if (ORDER_DRAFT_STATUSES.includes(s)) t.phase2_orders++;
        if (ORDER_LOCK_STATUSES.includes(s)) t.phase3_orders++;
      }
    }
    console.log(`[mrm-legacy-dryrun] orders legacy lidos: ${data?.length ?? 0}`);
  } catch (err) {
    bail(`exceção em orders: ${err.message}`);
  }

  // --- SALES ---
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('id, tenant_id, status, engine_version, legacy_locked')
      .or('engine_version.eq.legacy,engine_version.is.null');

    if (error) bail(`erro lendo sales: ${error.message}`);

    for (const row of data || []) {
      const t = ensureTenant(row.tenant_id);
      t.sales_legacy++;
      const s = String(row.status);
      t.sales_by_status[s] = (t.sales_by_status[s] || 0) + 1;

      if (!row.legacy_locked) {
        if (row.status === null || SALES_LOCK_STATUSES.includes(s)) t.phase3_sales++;
      }
    }
    console.log(`[mrm-legacy-dryrun] sales  legacy lidos: ${data?.length ?? 0}`);
  } catch (err) {
    bail(`exceção em sales: ${err.message}`);
  }

  // --- Relatório ---
  const tenants = Array.from(report.values()).sort((a, b) => {
    const sumA = a.phase2_budgets + a.phase2_orders + a.phase3_budgets + a.phase3_orders + a.phase3_sales;
    const sumB = b.phase2_budgets + b.phase2_orders + b.phase3_budgets + b.phase3_orders + b.phase3_sales;
    return sumB - sumA;
  });

  console.log('\n========================================');
  console.log('  MRM S2.2 — Pré-execução por tenant');
  console.log('========================================');

  for (const t of tenants) {
    console.log(`\nTenant ${t.tenant_id}`);
    console.log(`  budgets legacy: ${t.budgets_legacy}  by_status=${JSON.stringify(t.budgets_by_status)}`);
    console.log(`  orders  legacy: ${t.orders_legacy}  by_status=${JSON.stringify(t.orders_by_status)}`);
    console.log(`  sales   legacy: ${t.sales_legacy}  by_status=${JSON.stringify(t.sales_by_status)}`);
    console.log(`  Phase 2 (lazy recalc): budgets=${t.phase2_budgets} orders=${t.phase2_orders}`);
    console.log(`  Phase 3 (lock legacy): budgets=${t.phase3_budgets} orders=${t.phase3_orders} sales=${t.phase3_sales}`);
  }

  const totals = tenants.reduce(
    (acc, t) => {
      acc.tenants++;
      acc.budgets += t.budgets_legacy;
      acc.orders += t.orders_legacy;
      acc.sales += t.sales_legacy;
      acc.phase2 += t.phase2_budgets + t.phase2_orders;
      acc.phase3 += t.phase3_budgets + t.phase3_orders + t.phase3_sales;
      return acc;
    },
    { tenants: 0, budgets: 0, orders: 0, sales: 0, phase2: 0, phase3: 0 },
  );

  console.log('\n========================================');
  console.log('  TOTALS');
  console.log('========================================');
  console.log(JSON.stringify(totals, null, 2));

  console.log('\n[mrm-legacy-dryrun] done. Para aplicar as migrations, rodar:');
  console.log('  supabase db push  (ou via SQL editor manualmente)');
}

main().catch((err) => {
  console.error('[mrm-legacy-dryrun] uncaught error:', err?.message || err);
  process.exit(1);
});
