-- A BASE do harness da 20261103000003: as duas tabelas da conversa COMO ESTÃO EM PRODUÇÃO (medidas em 03/11/2026 às 19h UTC —
-- colunas, constraints, índices, RLS, políticas e grants), com o mínimo em volta para as FKs (tenants, remetente autorizado,
-- is_super_admin). E o estado de produção em forma: 1 conversa e 12 mensagens de 22/10/2026 (8 de entrada, 4 de saída), com texto
-- SINTÉTICO — o texto real não sai do tenant. O índice orcamentista_conversa_remetente_idx JÁ EXISTE em produção (medido): entra aqui.
create function public.is_super_admin() returns boolean language sql stable as $$ select false $$;
create table public.tenants (id uuid primary key default gen_random_uuid());
create table public.orcamentista_remetente_autorizado (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unique (id, tenant_id)
);
create table public.orcamentista_conversa (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  remetente_id uuid not null,
  telefone text not null,
  criado_em timestamptz not null default now(),
  constraint orcamentista_conversa_pkey primary key (id),
  constraint orcamentista_conversa_id_tenant_key unique (id, tenant_id),
  constraint orcamentista_conversa_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint orcamentista_conversa_remetente_fkey foreign key (remetente_id, tenant_id) references public.orcamentista_remetente_autorizado(id, tenant_id) on delete restrict
);
create index orcamentista_conversa_remetente_idx on public.orcamentista_conversa using btree (tenant_id, remetente_id, criado_em desc);
create table public.orcamentista_mensagem (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  conversa_id uuid not null,
  direcao text not null,
  texto text,
  wuzapi_mensagem_id text,
  criado_em timestamptz not null default now(),
  constraint orcamentista_mensagem_pkey primary key (id),
  constraint orcamentista_mensagem_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint orcamentista_mensagem_conversa_fkey foreign key (conversa_id, tenant_id) references public.orcamentista_conversa(id, tenant_id) on delete cascade,
  constraint orcamentista_mensagem_direcao_check check (direcao = any (array['entrada'::text, 'saida'::text]))
);
create unique index orcamentista_mensagem_entrada_unica on public.orcamentista_mensagem using btree (tenant_id, wuzapi_mensagem_id)
  where (direcao = 'entrada'::text and wuzapi_mensagem_id is not null);
create index orcamentista_mensagem_conversa_idx on public.orcamentista_mensagem using btree (conversa_id, criado_em);
alter table public.orcamentista_conversa enable row level security;
alter table public.orcamentista_mensagem enable row level security;
create policy orcamentista_conversa_select_super_admin on public.orcamentista_conversa for select using (is_super_admin());
create policy orcamentista_conversa_insert_super_admin on public.orcamentista_conversa for insert with check (is_super_admin());
create policy orcamentista_conversa_update_super_admin on public.orcamentista_conversa for update using (is_super_admin()) with check (is_super_admin());
create policy orcamentista_conversa_delete_super_admin on public.orcamentista_conversa for delete using (is_super_admin());
create policy orcamentista_mensagem_select_super_admin on public.orcamentista_mensagem for select using (is_super_admin());
create policy orcamentista_mensagem_insert_super_admin on public.orcamentista_mensagem for insert with check (is_super_admin());
create policy orcamentista_mensagem_update_super_admin on public.orcamentista_mensagem for update using (is_super_admin()) with check (is_super_admin());
create policy orcamentista_mensagem_delete_super_admin on public.orcamentista_mensagem for delete using (is_super_admin());
grant all on table public.orcamentista_conversa, public.orcamentista_mensagem to service_role;

-- o estado em forma: 1 tenant, 1 remetente, 1 conversa, 12 mensagens de 22/10/2026 (8 entrada, 4 saída), texto sintético
insert into public.tenants (id) values ('a0000000-0000-0000-0000-000000000001');
insert into public.orcamentista_remetente_autorizado (id, tenant_id) values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
insert into public.orcamentista_conversa (id, tenant_id, remetente_id, telefone, criado_em)
  values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '5551999990000', '2026-10-22 13:00:00+00');
insert into public.orcamentista_mensagem (id, tenant_id, conversa_id, direcao, texto, wuzapi_mensagem_id, criado_em)
select ('d0000000-0000-0000-0000-0000000000' || lpad(k::text, 2, '0'))::uuid, 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       case when k in (3, 6, 9, 12) then 'saida' else 'entrada' end,
       case when k in (3, 6, 9, 12) then 'resposta de teste numero ' || k else 'mensagem de teste numero ' || k end,
       case when k in (3, 6, 9, 12) then 'WA_S' || k else 'WA_E' || k end,
       '2026-10-22 13:00:00+00'::timestamptz + make_interval(mins => k)
  from generate_series(1, 12) k;
