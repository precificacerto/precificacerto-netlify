-- O ESTADO MEDIDO EM PRODUÇÃO (13/11/2026) do que a 20261113000002 toca: a tabela dos itens do orçamento, com a unicidade de hoje (a restrição
-- UNIQUE orcamentista_orcamento_item_ordem_key) e as duas tabelas que apontam para ela (material e falta, ON DELETE RESTRICT). Só as colunas que
-- importam aqui; as CHECKs de valor não entram (a migração não as toca).
create table public.orcamentista_orcamento (id uuid primary key, tenant_id uuid not null, numero int not null, unique (id, tenant_id));
create table public.orcamentista_orcamento_item (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, orcamento_id uuid not null, ordem int not null,
  tipologia text, largura_mm int, altura_mm int, quantidade int not null default 1,
  constraint orcamentista_orcamento_item_id_tenant_key unique (id, tenant_id),
  constraint orcamentista_orcamento_item_ordem_key unique (orcamento_id, ordem),
  constraint orcamentista_orcamento_item_ordem_positiva check (ordem >= 1),
  constraint orcamentista_orcamento_item_orcamento_fkey foreign key (orcamento_id, tenant_id) references public.orcamentista_orcamento (id, tenant_id) on delete restrict
);
create table public.orcamentista_orcamento_item_material (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, orcamento_item_id uuid not null,
  constraint orcamentista_orcamento_item_material_item_fkey foreign key (orcamento_item_id, tenant_id) references public.orcamentista_orcamento_item (id, tenant_id) on delete restrict);
insert into public.orcamentista_orcamento values ('00000000-0000-0000-0000-0000000000a1', '20e08592-f957-4e72-b7eb-251387e34eb9', 1),
                                                 ('00000000-0000-0000-0000-0000000000a2', '20e08592-f957-4e72-b7eb-251387e34eb9', 2);
-- como em produção: o orçamento 1 com 3 itens, o 2 com 4
insert into public.orcamentista_orcamento_item (id, tenant_id, orcamento_id, ordem, tipologia) values
  ('00000000-0000-0000-0000-000000000011', '20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-0000000000a1', 1, 'DP-02'),
  ('00000000-0000-0000-0000-000000000012', '20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-0000000000a1', 2, 'DP-02'),
  ('00000000-0000-0000-0000-000000000013', '20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-0000000000a1', 3, 'DP-01'),
  ('00000000-0000-0000-0000-000000000021', '20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-0000000000a2', 1, 'DP-02'),
  ('00000000-0000-0000-0000-000000000022', '20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-0000000000a2', 2, 'DP-02'),
  ('00000000-0000-0000-0000-000000000023', '20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-0000000000a2', 3, 'DP-02'),
  ('00000000-0000-0000-0000-000000000024', '20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-0000000000a2', 4, 'DP-02');
insert into public.orcamentista_orcamento_item_material (tenant_id, orcamento_item_id) values ('20e08592-f957-4e72-b7eb-251387e34eb9', '00000000-0000-0000-0000-000000000013');
