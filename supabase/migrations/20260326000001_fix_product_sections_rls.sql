-- Fix product_sections RLS policy to use get_auth_tenant_id() consistent with all other tables
-- The original migration used auth.jwt() -> 'app_metadata' ->> 'tenant_id' which causes 403 errors

DROP POLICY IF EXISTS "tenant_isolation" ON public.product_sections;

CREATE POLICY "product_sections_all" ON public.product_sections
  FOR ALL
  USING (tenant_id = public.get_auth_tenant_id())
  WITH CHECK (tenant_id = public.get_auth_tenant_id());
