-- Fix RLS policies: add WITH CHECK for INSERT/UPDATE security
-- Also adds updated_at trigger for commission_tables

-- 1. Fix RLS on commission_tables: replace USING-only with explicit WITH CHECK
DROP POLICY IF EXISTS "tenant_isolation" ON public.commission_tables;
CREATE POLICY "tenant_isolation" ON public.commission_tables
  FOR ALL
  USING (tenant_id = get_auth_tenant_id())
  WITH CHECK (tenant_id = get_auth_tenant_id());

-- 2. Fix RLS on employee_commission_tables (ALTER preserva policy existente)
ALTER POLICY "tenant_isolation" ON public.employee_commission_tables
  USING (tenant_id = get_auth_tenant_id())
  WITH CHECK (tenant_id = get_auth_tenant_id());

-- 3. Add updated_at trigger for commission_tables
CREATE OR REPLACE FUNCTION public.set_updated_at_commission_tables()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_tables_updated_at ON public.commission_tables;
CREATE TRIGGER trg_commission_tables_updated_at
  BEFORE UPDATE ON public.commission_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_commission_tables();
