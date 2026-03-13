-- Migrar dados e funções para usar apenas 3 roles: SUPER_ADMIN, ADMIN, USER

UPDATE public.users SET role = 'SUPER_ADMIN' WHERE is_super_admin = true;
UPDATE public.users SET role = 'ADMIN' WHERE role = 'OWNER';
UPDATE public.users SET role = 'USER' WHERE role IN ('SELLER', 'MANAGER');

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'SUPER_ADMIN');
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN');
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'ADMIN');
$$;

COMMENT ON FUNCTION public.is_super_admin() IS 'True se role = SUPER_ADMIN.';
COMMENT ON FUNCTION public.is_tenant_admin() IS 'True se role = ADMIN (admin da tenant).';
COMMENT ON FUNCTION public.is_admin_or_manager() IS 'True se role = ADMIN (pode ver equipe).';
