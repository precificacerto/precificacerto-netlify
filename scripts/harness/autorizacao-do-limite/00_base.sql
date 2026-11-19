-- A BASE do harness da 20261118000001: o item do levantamento COMO ESTA EM PRODUCAO (as 20 colunas e as constraints que
-- importam aqui, medidas em 18/11/2026), com o minimo em volta para as FKs. Dois tenants, um remetente em cada, um
-- levantamento com dois itens -- dados sinteticos.
create table public.tenants (id uuid primary key);
create table public.orcamentista_remetente_autorizado (
  id uuid primary key, tenant_id uuid not null references public.tenants(id) on delete cascade, telefone text not null,
  nome text, ativo boolean not null default true, constraint orcamentista_remetente_autorizado_id_tenant_key unique (id, tenant_id));
create table public.orcamentista_levantamento (id uuid primary key, tenant_id uuid not null references public.tenants(id), unique (id, tenant_id));
create table public.orcamentista_levantamento_item (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, levantamento_id uuid not null, ordem integer not null,
  tipologia text, largura_mm integer, altura_mm integer, quantidade integer, cor_perfil text, vidro text, escolhas jsonb,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), tabela_id uuid, motor_id uuid,
  familia text, motor_familia_exigida text, ambientes jsonb, obs text, vidro_codigo text,
  constraint orcamentista_levantamento_item_ordem_key unique (levantamento_id, ordem),
  constraint orcamentista_levantamento_item_id_tenant_key unique (id, tenant_id),
  constraint orcamentista_levantamento_item_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint orcamentista_levantamento_item_levantamento_fkey foreign key (levantamento_id, tenant_id) references public.orcamentista_levantamento(id, tenant_id) on delete cascade);
insert into public.tenants values ('a0000000-0000-0000-0000-000000000001'), ('a0000000-0000-0000-0000-000000000002');
insert into public.orcamentista_remetente_autorizado (id, tenant_id, telefone) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '5551999990001'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '5551999990002');
insert into public.orcamentista_levantamento values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
insert into public.orcamentista_levantamento_item (id, tenant_id, levantamento_id, ordem, largura_mm, altura_mm, quantidade) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 700, 1200, 1),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 2, 700, 600, 1);
