-- =============================================================================
-- Super Admin: pode SELECT em todas as tenants (mantém policy existente)
-- =============================================================================

CREATE POLICY "super_admin_select_all_tenants" ON public.tenants
  FOR SELECT
  USING (public.is_super_admin());

COMMENT ON POLICY "super_admin_select_all_tenants" ON public.tenants IS 'Super_admin vê todas as tenants; usuários normais continuam apenas a própria (Users can view own tenant).';
