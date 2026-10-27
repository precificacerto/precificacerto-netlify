-- O que a réplica de `../motor-da-familia/05_estado_de_producao.sql` não tem e as funções da 20261027000003 usam:
-- os papéis, `users`, o log, e as CHECK da etapa que a função traduz em frase. Medido em produção em 27/10/2026.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create table public.users (id uuid primary key, is_super_admin boolean);
create table public.superadmin_alteracao_log (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, tabela text not null, chave text, antes jsonb, depois jsonb, por uuid, em timestamptz not null default now());
alter table public.orcamentista_familia_etapa
  add constraint orcamentista_familia_etapa_abas_da_planilha check (abas <@ array['tipologias','perfis','formulas','variaveis','vidros','baguetes','insumos','validacoes','otimizacao','formulas_da_linha','regras','tempos']),
  add constraint orcamentista_familia_etapa_rotulo_forma check (rotulo = btrim(rotulo) and char_length(rotulo) >= 1 and char_length(rotulo) <= 60),
  add constraint orcamentista_familia_etapa_instrucao_ate_4000 check (char_length(instrucao) <= 4000);
insert into public.users (id, is_super_admin) values ('e0000000-0000-0000-0000-000000000001', true), ('e0000000-0000-0000-0000-000000000002', false);
