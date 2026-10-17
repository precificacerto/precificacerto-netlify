-- O QUE A …000003 PRECISA DE `orders`, para o quarto DROP ter onde cair — 17/10/2026.
-- Cada bloco diz de onde veio, como no 00_schema.sql.

-- RECONSTRUÍDO (reduzida): `orders` só com as colunas que as cinco políticas leem.
create table public.orders (id uuid primary key default gen_random_uuid(), tenant_id uuid, created_by uuid);

-- EXTRAÍDO verbatim (pg_get_functiondef): is_admin_or_manager().
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$function$;

-- EXTRAÍDO: relrowsecurity = true e as CINCO políticas vivas, montadas de pg_policies.
alter table public.orders enable row level security;
CREATE POLICY orders_tenant_insert ON public.orders AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = ( SELECT users.tenant_id
   FROM users
  WHERE (users.id = auth.uid()))));
CREATE POLICY orders_select ON public.orders AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = ( SELECT get_auth_tenant_id() AS get_auth_tenant_id)) AND ((( SELECT is_admin_or_manager() AS is_admin_or_manager) = true) OR (created_by = ( SELECT auth.uid() AS uid)))));
CREATE POLICY orders_insert ON public.orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = ( SELECT get_auth_tenant_id() AS get_auth_tenant_id)) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY orders_update ON public.orders AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = ( SELECT get_auth_tenant_id() AS get_auth_tenant_id)) AND ((( SELECT is_admin_or_manager() AS is_admin_or_manager) = true) OR (created_by = ( SELECT auth.uid() AS uid))))) WITH CHECK ((tenant_id = ( SELECT get_auth_tenant_id() AS get_auth_tenant_id)));
CREATE POLICY orders_delete ON public.orders AS PERMISSIVE FOR DELETE TO public USING (((tenant_id = ( SELECT get_auth_tenant_id() AS get_auth_tenant_id)) AND ((( SELECT is_admin_or_manager() AS is_admin_or_manager) = true) OR (created_by = ( SELECT auth.uid() AS uid)))));
