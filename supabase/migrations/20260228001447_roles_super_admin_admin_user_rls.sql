-- =============================================================================
-- Roles: super_admin, admin (tenant), user — funções e RLS
-- =============================================================================

-- 1. Função: é admin da tenant (apenas role ADMIN)
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'ADMIN'
  );
$$;

-- 2. Ver equipe: apenas ADMIN
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'ADMIN'
  );
$$;

-- 3. Tenants: UPDATE apenas para admin da tenant ou super_admin
DROP POLICY IF EXISTS "tenants_update_own" ON public.tenants;
CREATE POLICY "tenants_update_own" ON public.tenants
  FOR UPDATE
  USING (id = get_auth_tenant_id() AND (is_tenant_admin() OR is_super_admin()))
  WITH CHECK (id = get_auth_tenant_id());

-- 4. Users: INSERT apenas por admin da tenant ou super_admin
DROP POLICY IF EXISTS "users_insert_same_tenant" ON public.users;
CREATE POLICY "users_insert_by_admin_or_super" ON public.users
  FOR INSERT
  WITH CHECK (
    (tenant_id = get_auth_tenant_id() AND is_tenant_admin())
    OR is_super_admin()
  );

-- 5. Users: SELECT — incluir super_admin pode ver todos
DROP POLICY IF EXISTS "users_select_self_or_tenant_admins" ON public.users;
CREATE POLICY "users_select_self_or_tenant_admins" ON public.users
  FOR SELECT
  USING (
    (id = auth.uid())
    OR (tenant_id = get_auth_tenant_id() AND is_admin_or_manager())
    OR is_super_admin()
  );

-- 6. Users: UPDATE — próprio perfil, ou admin da tenant, ou super_admin
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  USING (
    id = auth.uid()
    OR (tenant_id = get_auth_tenant_id() AND is_tenant_admin())
    OR is_super_admin()
  )
  WITH CHECK (
    id = auth.uid()
    OR (tenant_id = get_auth_tenant_id() AND is_tenant_admin())
    OR is_super_admin()
  );

COMMENT ON FUNCTION public.is_tenant_admin() IS 'True se role = ADMIN (admin da tenant). Apenas 3 roles: SUPER_ADMIN, ADMIN, USER.';
COMMENT ON FUNCTION public.is_admin_or_manager() IS 'True se role = ADMIN (pode ver equipe).';
