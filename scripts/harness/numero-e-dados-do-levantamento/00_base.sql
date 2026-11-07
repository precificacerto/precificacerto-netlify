-- A BASE do harness da 20261106000002: as tabelas do levantamento COMO ESTÃO EM PRODUÇÃO (medidas em 06/11/2026 — colunas, defaults,
-- constraints, índices, RLS sem política, privilégios), o mínimo em volta para as FKs, o log, e o PRIVILÉGIO PADRÃO de produção
-- (pg_default_acl do postgres no schema public: tabelas, sequências e funções a authenticated e service_role — medido; sem ele o harness não
-- veria o REVOKE que falta, a lição da 20261101000002). E o estado de produção em forma: os 5 levantamentos da De Paula com os ids e os
-- criado_em reais e 11 itens (2, 2, 3, 2, 2), com texto SINTÉTICO — o conteúdo real não sai do tenant. Mais, para os casos: uma segunda
-- empresa com 2 levantamentos criados no MESMO instante (o desempate é pelo id) e um terceiro mais antigo inserido por último (a ordem é a
-- de criado_em, não a de inserção), uma terceira empresa sem levantamento, e a FOTO de cada linha antes da migração (harness_foto).
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

create table public.tenants (id uuid primary key default gen_random_uuid(), name text);
create table public.orcamentista_familia_catalogo (chave text primary key);
create table public.orcamentista_tabela (id uuid primary key);
create table public.orcamentista_motor (id uuid primary key);
create table public.orcamentista_motor_familia (motor_id uuid not null, familia text not null, primary key (motor_id, familia));
create table public.orcamentista_remetente_autorizado (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  telefone text not null default '5551999990000',
  unique (id, tenant_id)
);
-- employees: só o que a FK do vendedor usa, como em produção (medido em 06/11/2026): id pk, tenant_id e name NOT NULL, UNIQUE (id, tenant_id)
create table public.employees (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  constraint employees_pkey primary key (id),
  constraint employees_id_tenant_id_key unique (id, tenant_id)
);
create table public.superadmin_alteracao_log (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid, tabela text not null, chave text not null, antes jsonb, depois jsonb, por uuid,
  em timestamptz not null default now()
);

create table public.orcamentista_levantamento (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  remetente_id uuid not null,
  nome text not null,
  nome_normalizado text not null,
  estado text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint orcamentista_levantamento_pkey primary key (id),
  constraint orcamentista_levantamento_id_tenant_key unique (id, tenant_id),
  constraint orcamentista_levantamento_nome_key unique (tenant_id, remetente_id, nome_normalizado),
  constraint orcamentista_levantamento_estado_valido check (estado = any (array['EM_MONTAGEM'::text, 'COMPLETO'::text])),
  constraint orcamentista_levantamento_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint orcamentista_levantamento_remetente_fkey foreign key (remetente_id, tenant_id) references public.orcamentista_remetente_autorizado(id, tenant_id)
);
create table public.orcamentista_levantamento_item (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  levantamento_id uuid not null,
  ordem integer not null,
  tipologia text, largura_mm integer, altura_mm integer, quantidade integer, cor_perfil text, vidro text, escolhas jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  tabela_id uuid, motor_id uuid, familia text, motor_familia_exigida text,
  constraint orcamentista_levantamento_item_pkey primary key (id),
  constraint orcamentista_levantamento_item_ordem_key unique (levantamento_id, ordem),
  constraint orcamentista_levantamento_item_escolhas_objeto check ((escolhas is null) or (jsonb_typeof(escolhas) = 'object'::text)),
  constraint orcamentista_levantamento_item_motor_exige_familia check ((motor_id is null) or (familia is not null)),
  constraint orcamentista_levantamento_item_motor_familia_exigida check ((((motor_id is null) = (motor_familia_exigida is null)) and ((motor_familia_exigida is null) or (motor_familia_exigida = familia)))),
  constraint orcamentista_levantamento_item_familia_fkey foreign key (familia) references public.orcamentista_familia_catalogo(chave) on delete restrict,
  constraint orcamentista_levantamento_item_levantamento_fkey foreign key (levantamento_id, tenant_id) references public.orcamentista_levantamento(id, tenant_id) on delete cascade,
  constraint orcamentista_levantamento_item_motor_exigida_fkey foreign key (motor_id, motor_familia_exigida) references public.orcamentista_motor_familia(motor_id, familia) on delete set null,
  constraint orcamentista_levantamento_item_motor_fkey foreign key (motor_id) references public.orcamentista_motor(id) on delete restrict,
  constraint orcamentista_levantamento_item_tabela_fkey foreign key (tabela_id) references public.orcamentista_tabela(id) on delete set null,
  constraint orcamentista_levantamento_item_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade
);
create table public.orcamentista_pergunta_em_aberto (
  tenant_id uuid not null,
  remetente_id uuid not null,
  pergunta text not null,
  nome text,
  levantamentos uuid[] not null default '{}'::uuid[],
  itens jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  constraint orcamentista_pergunta_em_aberto_pkey primary key (tenant_id, remetente_id),
  constraint orcamentista_pergunta_em_aberto_itens_array check (jsonb_typeof(itens) = 'array'::text),
  constraint orcamentista_pergunta_em_aberto_pergunta_valida check (pergunta = any (array['NOME_PARECIDO'::text, 'SEM_NOME'::text, 'CONFIRMAR_ACRESCIMO'::text, 'CONFIRMAR_APANHADO'::text])),
  constraint orcamentista_pergunta_em_aberto_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint orcamentista_pergunta_em_aberto_remetente_fkey foreign key (remetente_id, tenant_id) references public.orcamentista_remetente_autorizado(id, tenant_id)
);
alter table public.orcamentista_levantamento enable row level security;
alter table public.orcamentista_levantamento_item enable row level security;
alter table public.orcamentista_pergunta_em_aberto enable row level security;
alter table public.superadmin_alteracao_log enable row level security;
-- os privilégios de produção destas quatro (relacl medido): postgres e service_role, e nada a authenticated
revoke all on table public.orcamentista_levantamento, public.orcamentista_levantamento_item, public.orcamentista_pergunta_em_aberto,
  public.superadmin_alteracao_log from authenticated;

-- o estado em forma: a De Paula (o tenant real), a empresa B (3 levantamentos, dois no mesmo instante), a empresa C (nenhum)
insert into public.tenants (id, name) values ('20e08592-f957-4e72-b7eb-251387e34eb9', 'Empresa A (sintetica)'), ('a0000000-0000-0000-0000-000000000002', 'Empresa B (sintetica)'),
  ('a0000000-0000-0000-0000-000000000003', 'Empresa C (sintetica)');
insert into public.orcamentista_remetente_autorizado (id, tenant_id) values
  ('4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', '20e08592-f957-4e72-b7eb-251387e34eb9'),
  ('b0000000-0000-0000-0000-000000000002', '20e08592-f957-4e72-b7eb-251387e34eb9'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003');
insert into public.employees (id, tenant_id, name) values
  ('a4d39679-da09-43e2-b97e-f9f2b783e7a6', '20e08592-f957-4e72-b7eb-251387e34eb9', 'Vendedor A1 (sintetico)'),
  ('f0000000-0000-0000-0000-0000000000a2', '20e08592-f957-4e72-b7eb-251387e34eb9', 'Vendedora A2 (sintetica)'),
  ('f0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000002', 'Vendedor B1 (sintetico)');
insert into public.orcamentista_levantamento (id, tenant_id, remetente_id, nome, nome_normalizado, estado, criado_em, atualizado_em) values
  ('c8b56b73-05b3-4d4e-82d0-41ecba58b893', '20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Maria Cristina', 'maria cristina', 'COMPLETO', '2026-11-05 20:03:38.285795+00', '2026-11-06 12:53:00+00'),
  ('b0465e57-a829-4f81-9f3e-9ba7d00a999f', '20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Teste 1', 'teste 1', 'COMPLETO', '2026-10-25 14:43:09.463729+00', '2026-10-25 15:00:00+00'),
  ('3181ae50-6ef7-4032-98b9-914e2dc1eb43', '20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Teste 4', 'teste 4', 'COMPLETO', '2026-11-05 14:06:33.49324+00', '2026-11-05 14:10:00+00'),
  ('02db9513-7eda-43f0-852d-df940e781bef', '20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Teste 2', 'teste 2', 'COMPLETO', '2026-10-26 16:33:18.375588+00', '2026-10-26 17:00:00+00'),
  ('cbf085d1-dfe0-4074-ad94-1d462130eee7', '20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'Teste 3', 'teste 3', 'COMPLETO', '2026-11-03 01:11:37.343919+00', '2026-11-03 02:00:00+00'),
  ('e0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'B mesmo instante 2', 'b mesmo instante 2', 'EM_MONTAGEM', '2026-11-01 10:00:00+00', '2026-11-01 10:00:00+00'),
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'B mesmo instante 1', 'b mesmo instante 1', 'EM_MONTAGEM', '2026-11-01 10:00:00+00', '2026-11-01 10:00:00+00'),
  ('e0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'B mais antigo', 'b mais antigo', 'COMPLETO', '2026-10-20 09:00:00+00', '2026-10-20 09:00:00+00');
insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, escolhas)
select '20e08592-f957-4e72-b7eb-251387e34eb9', l.id, k, 'DP-02', 1200 + k, 1000, k, 'BRANCO', 'vidro de teste ' || k, jsonb_build_object('ARI', k)
  from (values ('b0465e57-a829-4f81-9f3e-9ba7d00a999f'::uuid, 2), ('02db9513-7eda-43f0-852d-df940e781bef'::uuid, 2), ('cbf085d1-dfe0-4074-ad94-1d462130eee7'::uuid, 3),
               ('3181ae50-6ef7-4032-98b9-914e2dc1eb43'::uuid, 2), ('c8b56b73-05b3-4d4e-82d0-41ecba58b893'::uuid, 2)) as l(id, n),
       generate_series(1, l.n) as k;
insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, quantidade)
  values ('a0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000c', 1, 'DP-01', 1);
insert into public.orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta, nome, levantamentos) values
  ('20e08592-f957-4e72-b7eb-251387e34eb9', '4d1e0f2e-c036-44fe-ad3c-2420e2ad19d2', 'CONFIRMAR_APANHADO', 'Maria Cristina', array['c8b56b73-05b3-4d4e-82d0-41ecba58b893'::uuid]);
insert into public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois) values (null, 'outra', 'x', null, '{"a": 1}');

-- a FOTO de antes: cada linha das três tabelas, inteira (o caso 1 compara, tirando só as colunas novas)
create table public.harness_foto as
  select 'L'::text as tabela, l.id, md5(to_jsonb(l)::text) as md5 from public.orcamentista_levantamento l
  union all select 'I', i.id, md5(to_jsonb(i)::text) from public.orcamentista_levantamento_item i
  union all select 'P', p.remetente_id, md5(to_jsonb(p)::text) from public.orcamentista_pergunta_em_aberto p;
