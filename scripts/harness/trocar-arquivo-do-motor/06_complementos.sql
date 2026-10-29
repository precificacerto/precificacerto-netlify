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
-- o nome da empresa (produção tem `name`): a recusa de arquivar motor nomeia a empresa
alter table public.tenants add column if not exists name text;
-- a árvore da base de conhecimento (só o que superadmin_remover_materia_prima, da 20261023000003, lê e o CASCADE apaga)
create table if not exists public.orcamentista_mp_categoria (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, materia_prima_id uuid not null, categoria_chave text not null, config jsonb,
  constraint orcamentista_mp_categoria_mp_fk foreign key (materia_prima_id, tenant_id) references public.orcamentista_materia_prima (id, tenant_id) on delete cascade);
create table if not exists public.orcamentista_mp_categoria_fornecedor (id uuid primary key default gen_random_uuid(), tenant_id uuid, mp_categoria_id uuid not null references public.orcamentista_mp_categoria (id) on delete cascade, fornecedor_id uuid, principal boolean, ordem int);
create table if not exists public.orcamentista_mp_vidro (id uuid primary key default gen_random_uuid(), mp_categoria_id uuid not null references public.orcamentista_mp_categoria (id) on delete cascade, ordem int);
create table if not exists public.orcamentista_mp_ferragem (id uuid primary key default gen_random_uuid(), mp_categoria_id uuid not null references public.orcamentista_mp_categoria (id) on delete cascade, ordem int);
create table if not exists public.orcamentista_mp_instalacao (id uuid primary key default gen_random_uuid(), mp_categoria_id uuid not null references public.orcamentista_mp_categoria (id) on delete cascade, produto text);
