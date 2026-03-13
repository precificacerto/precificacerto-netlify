-- Relaxar RLS de customers: isolar apenas por tenant, sem travar pelo owner_id

DROP POLICY IF EXISTS "customers_tenant_isolation" ON public.customers;

CREATE POLICY "customers_tenant_isolation" ON public.customers
  FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

