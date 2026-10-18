-- HARNESS LOCAL da migração 20261018000001 (Orçamentista, bloco 1) — 18/10/2026. NÃO TOCA PRODUÇÃO.
-- Cada bloco diz de onde veio: EXTRAÍDO (catálogo vivo de produção, verbatim) ou RECONSTRUÍDO.

-- RECONSTRUÍDO: os papéis do Supabase, simples. `service_role` em produção é BYPASSRLS; aqui
-- ele não é usado — a escrita que importa é a do `authenticated` com papel super_admin.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin; end if;
end $$;

-- RECONSTRUÍDO, a partir do `pg_default_acl` MEDIDO em 18/10/2026: tabela criada por `postgres`
-- em `public` dá ALL a authenticated e service_role (anon NÃO).
alter default privileges in schema public grant all on tables to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key);

-- EXTRAÍDO verbatim (pg_get_functiondef): auth.uid()
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

-- EXTRAÍDO: o enum de papel.
create type public.user_role as enum ('super_admin', 'admin', 'user');

-- RECONSTRUÍDO (reduzidas): só as colunas que as funções e a migração leem.
create table public.tenants (id uuid primary key, segment text);
create table public.users (id uuid NOT NULL primary key, tenant_id uuid, email text NOT NULL, role public.user_role, is_super_admin boolean);
create table public.tenant_settings (id uuid primary key default gen_random_uuid(), tenant_id uuid NOT NULL, calc_type text);

-- EXTRAÍDO verbatim (pg_get_functiondef): as duas funções que as políticas usam.
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select tenant_id from public.users where id = auth.uid();
$function$;
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin');
$function$;

-- EXTRAÍDO verbatim: a política ÚNICA de `tenant_settings`, e a RLS ligada.
alter table public.tenant_settings enable row level security;
create policy tenant_settings_tenant_policy on public.tenant_settings for all
  using (tenant_id = get_auth_tenant_id()) with check (tenant_id = get_auth_tenant_id());
