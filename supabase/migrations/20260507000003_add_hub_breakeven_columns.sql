-- Sprint 4 — Card Ponto de Equilíbrio
-- Adiciona colunas necessárias para a nova fórmula do PE baseada no faturamento médio do HUB.
-- Os valores são recalculados automaticamente em mergeExpenseConfig() a cada lançamento aprovado,
-- evitando stale data sem necessidade de RPC dedicada.

ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS hub_average_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_cost_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS production_labor_percent numeric DEFAULT 0;

COMMENT ON COLUMN public.tenant_expense_config.hub_average_revenue IS
  'Faturamento médio mensal apurado a partir do HUB (cashier_months.total_in dos meses fechados). Recalculado em mergeExpenseConfig().';
COMMENT ON COLUMN public.tenant_expense_config.product_cost_percent IS
  'Percentual de custo dos produtos sobre o faturamento (decimal × 100, ex: 57.64).';
COMMENT ON COLUMN public.tenant_expense_config.production_labor_percent IS
  'Percentual de MO Produtiva sobre o faturamento (decimal × 100, ex: 11.68).';

-- ── ROLLBACK (descomente para reverter) ──
-- ALTER TABLE public.tenant_expense_config
--   DROP COLUMN IF EXISTS hub_average_revenue,
--   DROP COLUMN IF EXISTS product_cost_percent,
--   DROP COLUMN IF EXISTS production_labor_percent;
