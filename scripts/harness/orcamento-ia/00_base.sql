-- A BASE do harness da 20261109000001: o mínimo de produção em volta das duas tabelas novas — tenants, o levantamento com
-- UNIQUE (id, tenant_id) e o item do levantamento —, os papéis do Supabase e o PRIVILÉGIO PADRÃO de produção (o postgres dá ALL
-- a anon, authenticated e service_role em toda tabela nova do schema public). Sem ele o REVOKE da migração não seria exercitado.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
create table public.tenants (id uuid primary key default gen_random_uuid());
create table public.orcamentista_levantamento (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  estado text not null default 'COMPLETO',
  constraint orcamentista_levantamento_pkey primary key (id),
  constraint orcamentista_levantamento_id_tenant_key unique (id, tenant_id)
);
create table public.orcamentista_levantamento_item (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  levantamento_id uuid not null references public.orcamentista_levantamento(id) on delete cascade,
  ordem integer not null,
  constraint orcamentista_levantamento_item_pkey primary key (id)
);
insert into public.tenants (id) values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b2');
insert into public.orcamentista_levantamento (id, tenant_id, nome) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'Antonio Rock'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'Alan Kremer'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b2', 'Outra conta');
insert into public.orcamentista_levantamento_item (id, tenant_id, levantamento_id, ordem) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 1),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 2);
