-- O que as funções da 20261027000003 e da 000010 usam e a cadeia local não traz: os papéis, o log, e as CHECK da etapa que a função traduz em frase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create table if not exists public.superadmin_alteracao_log (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, tabela text not null, chave text, antes jsonb, depois jsonb, por uuid, em timestamptz not null default now());
insert into public.users (id, email, is_super_admin) values
  ('e0000000-0000-0000-0000-000000000001', 'super@x', true), ('e0000000-0000-0000-0000-000000000002', 'comum@x', false);
