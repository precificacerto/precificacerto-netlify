-- Tabelas de parcelas para orçamentos e pedidos
-- budget_installment_rows: parcelas configuradas no orçamento (BOLETO/CHEQUE_PRE_DATADO)
-- order_installment_rows:  parcelas copiadas do orçamento para o pedido

-- =====================================================================
-- budget_installment_rows
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.budget_installment_rows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id   UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  due_date    DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_installment_rows_budget
  ON public.budget_installment_rows(budget_id);

ALTER TABLE public.budget_installment_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_installment_rows_tenant"
  ON public.budget_installment_rows
  FOR ALL
  USING (
    budget_id IN (
      SELECT id FROM public.budgets
      WHERE tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    )
  );

-- =====================================================================
-- order_installment_rows
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.order_installment_rows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  due_date    DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_installment_rows_order
  ON public.order_installment_rows(order_id);

ALTER TABLE public.order_installment_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_installment_rows_tenant"
  ON public.order_installment_rows
  FOR ALL
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    )
  );
