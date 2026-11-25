-- A tabela orcamentista_mensagem como esta em producao em 25/11/2026 (medida por consulta: 9 colunas, 6 constraints, 4 indices),
-- com o minimo que as FKs dela pedem. NAO TOCA PRODUCAO.
create table public.tenants (id uuid primary key);
create table public.orcamentista_conversa (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  criado_em timestamptz not null default now(), unique (id, tenant_id));
create table public.orcamentista_levantamento (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, unique (id, tenant_id));
create table public.orcamentista_mensagem (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversa_id uuid not null,
  direcao text not null check (direcao = any (array['entrada'::text, 'saida'::text])),
  texto text,
  wuzapi_mensagem_id text,
  criado_em timestamptz not null default now(),
  responde_a uuid,
  levantamento_id uuid);
alter table public.orcamentista_mensagem add constraint orcamentista_mensagem_conversa_fkey foreign key (conversa_id, tenant_id) references public.orcamentista_conversa(id, tenant_id) on delete cascade;
alter table public.orcamentista_mensagem add constraint orcamentista_mensagem_responde_a_fkey foreign key (responde_a) references public.orcamentista_mensagem(id) on delete set null;
alter table public.orcamentista_mensagem add constraint orcamentista_mensagem_levantamento_fkey foreign key (levantamento_id, tenant_id) references public.orcamentista_levantamento(id, tenant_id) on delete set null (levantamento_id);
create index orcamentista_mensagem_conversa_idx on public.orcamentista_mensagem using btree (conversa_id, criado_em);
create unique index orcamentista_mensagem_entrada_unica on public.orcamentista_mensagem using btree (tenant_id, wuzapi_mensagem_id) where ((direcao = 'entrada'::text) and (wuzapi_mensagem_id is not null));
create index orcamentista_mensagem_responde_a_idx on public.orcamentista_mensagem using btree (responde_a) where (responde_a is not null);
insert into public.tenants values ('20e08592-0000-0000-0000-000000000001');
insert into public.orcamentista_conversa (id, tenant_id) values ('c0000000-0000-0000-0000-000000000001', '20e08592-0000-0000-0000-000000000001');
insert into public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, wuzapi_mensagem_id) values
  ('20e08592-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'entrada', '[imagem]', '3EB0AF33'),
  ('20e08592-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'saida', 'ok', '3EB01DF3');
