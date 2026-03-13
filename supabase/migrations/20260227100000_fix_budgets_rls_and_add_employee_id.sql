-- 1) Corrigir RLS em budgets: política explícita com WITH CHECK para INSERT/UPDATE
DROP POLICY IF EXISTS "Users can view budgets of own tenant" ON public.budgets;

CREATE POLICY "budgets_tenant_all" ON public.budgets
  FOR ALL
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- 2) Campo opcional funcionário no orçamento (vincular orçamento ao funcionário)
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.budgets.employee_id IS 'Funcionário responsável pelo orçamento (opcional).';
