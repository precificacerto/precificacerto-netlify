-- Migration: persistência do RT (Comissão Reserva Técnica) no pipeline — EPIC-RT v8, item 3.9
--
-- O relatório v8 (3.9) exige que o RT seja persistido com a MESMA estrutura/semântica já
-- usada para Comissão/Lucro, garantindo o CONGELAMENTO da alíquota da construção até a
-- desconstrução. Espelha:
--   - budget_items.commission_pct  → budget_items.rt_pct   (decimal, snapshot congelado)
--   - budgets.commission_amount    → budgets.rt_amount     (R$ agregado)
--   - order_items.commission_pct   → order_items.rt_pct
--   - orders.commission_amount     → orders.rt_amount
--   - sale_items.commission_pct    → sale_items.rt_pct
--   - sales.commission_amount      → sales.rt_amount
--
-- rt_pct: decimal (0.035 = 3,5%), congela a alíquota do produto no item.
-- rt_amount: valor R$ de RT (alíquota efetiva congelada × total), lido pelos relatórios.
--
-- Aplicar no Supabase (SQL Editor) com service_role. Idempotente (IF NOT EXISTS).

ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS rt_pct     NUMERIC(8,5)  NOT NULL DEFAULT 0;
ALTER TABLE budgets      ADD COLUMN IF NOT EXISTS rt_amount  DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items  ADD COLUMN IF NOT EXISTS rt_pct     NUMERIC(8,5)  NOT NULL DEFAULT 0;
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS rt_amount  DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sale_items   ADD COLUMN IF NOT EXISTS rt_pct     NUMERIC(8,5)  NOT NULL DEFAULT 0;
ALTER TABLE sales        ADD COLUMN IF NOT EXISTS rt_amount  DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN budgets.rt_amount IS 'RT (Comissão Reserva Técnica) consolidado em R$ (alíquota efetiva congelada × total). EPIC-RT v8 item 3.9.';
COMMENT ON COLUMN sales.rt_amount   IS 'RT (Comissão Reserva Técnica) consolidado em R$, herdado do orçamento. Lido pelos relatórios RT. EPIC-RT v8 item 3.9.';
COMMENT ON COLUMN budget_items.rt_pct IS 'Alíquota de RT congelada do produto (decimal). Espelha commission_pct. EPIC-RT v8 item 3.9.';
