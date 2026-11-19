-- A BASE do harness da 20261118000004: a tabela da pergunta em aberto COMO ESTA EM PRODUCAO depois da 20261118000002 (medido em 18/11/2026:
-- a CHECK de pergunta com os 5 codigos, QUAL_ORCAMENTO incluido), com o minimo em volta para as FKs e uma linha de cada codigo de antes.
create table public.tenants (id uuid primary key);
create table public.orcamentista_remetente_autorizado (id uuid primary key, tenant_id uuid not null references public.tenants(id) on delete cascade,
  constraint orcamentista_remetente_autorizado_id_tenant_key unique (id, tenant_id));
create table public.orcamentista_pergunta_em_aberto (
  tenant_id uuid not null, remetente_id uuid not null, pergunta text not null, nome text,
  levantamentos uuid[] not null default '{}', itens jsonb not null default '[]'::jsonb, criado_em timestamptz not null default now(),
  constraint orcamentista_pergunta_em_aberto_pkey primary key (tenant_id, remetente_id),
  constraint orcamentista_pergunta_em_aberto_tenant_fkey foreign key (tenant_id) references public.tenants (id) on delete cascade,
  constraint orcamentista_pergunta_em_aberto_remetente_fkey foreign key (remetente_id, tenant_id) references public.orcamentista_remetente_autorizado (id, tenant_id),
  constraint orcamentista_pergunta_em_aberto_pergunta_valida check (pergunta in ('NOME_PARECIDO', 'SEM_NOME', 'CONFIRMAR_ACRESCIMO', 'CONFIRMAR_APANHADO', 'QUAL_ORCAMENTO')),
  constraint orcamentista_pergunta_em_aberto_itens_array check (jsonb_typeof(itens) = 'array'));
insert into public.tenants values ('a0000000-0000-0000-0000-000000000001');
insert into public.orcamentista_remetente_autorizado select ('b0000000-0000-0000-0000-00000000000' || k)::uuid, 'a0000000-0000-0000-0000-000000000001' from generate_series(1, 6) k;
insert into public.orcamentista_pergunta_em_aberto (tenant_id, remetente_id, pergunta) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'NOME_PARECIDO'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'SEM_NOME'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'CONFIRMAR_ACRESCIMO'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'CONFIRMAR_APANHADO');
