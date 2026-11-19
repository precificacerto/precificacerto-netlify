-- A BASE do harness da 20261118000003: o minimo de producao em volta (medido em 18/11/2026): tenants, users, auth.uid(), as funcoes
-- get_auth_tenant_id() e is_super_admin() com o corpo de producao, os papeis anon/authenticated/service_role e o PRIVILEGIO PADRAO de
-- producao (o postgres da ALL a authenticated e service_role em tabela nova do schema public — pg_default_acl).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.tenants (id uuid primary key);
create table public.users (id uuid primary key, tenant_id uuid references public.tenants(id), role text);
create function public.get_auth_tenant_id() returns uuid language sql stable security definer as $$ select tenant_id from public.users where id = auth.uid(); $$;
create function public.is_super_admin() returns boolean language sql stable security definer as $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'); $$;
alter default privileges for role postgres in schema public grant all on tables to authenticated, service_role, anon;
insert into public.tenants values ('a0000000-0000-0000-0000-00000000000a'), ('a0000000-0000-0000-0000-00000000000b');
insert into public.users values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'admin'),
  ('c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000b', 'admin'),
  ('c0000000-0000-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-00000000000a', 'super_admin');
