-- O que as migrações de 26/10 e 27/10 pressupõem e a cadeia local não traz (as de base de conhecimento e levantamento, que dependem de `employees` etc.):
-- o catálogo de categorias (medido em produção em 27/10/2026; o de famílias a 20261026000004 cria), a matéria-prima (com os índices de produção) e o levantamento.
create table if not exists public.orcamentista_categoria_catalogo (chave text primary key, ordem int not null, rotulo text not null);
insert into public.orcamentista_categoria_catalogo (chave, rotulo, ordem) values
  ('PERFIL','Perfil',1),('PERSIANAS','Persianas',2),('REFORCO','Reforço metálico',3),('FERRAGENS','Ferragens',4),
  ('ACESSORIOS_VEDACAO','Acessórios e vedação',5),('VIDRO','Vidro',6),('INSTALACAO','Instalação',7);
create table public.orcamentista_materia_prima (
  id uuid not null default gen_random_uuid(), tenant_id uuid not null, nome text not null, ordem int not null default 1,
  atualizado_por uuid, atualizado_em timestamptz not null default now(),
  constraint orcamentista_materia_prima_pkey primary key (id),
  constraint orcamentista_materia_prima_id_tenant_key unique (id, tenant_id),
  constraint orcamentista_materia_prima_tenant_fk foreign key (tenant_id) references public.tenants (id) on delete cascade
);
create unique index orcamentista_materia_prima_tenant_nome_idx on public.orcamentista_materia_prima using btree (tenant_id, lower(nome));
create table public.orcamentista_levantamento (
  id uuid not null default gen_random_uuid(), tenant_id uuid not null,
  constraint orcamentista_levantamento_pkey primary key (id),
  constraint orcamentista_levantamento_id_tenant_key unique (id, tenant_id)
);
create table public.orcamentista_levantamento_item (
  id uuid not null default gen_random_uuid(), tenant_id uuid not null, levantamento_id uuid not null, ordem int not null,
  tipologia text, largura_mm int, altura_mm int, quantidade int, cor_perfil text, vidro text, escolhas jsonb,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  tabela_id uuid,
  constraint orcamentista_levantamento_item_pkey primary key (id),
  constraint orcamentista_levantamento_item_ordem_key unique (levantamento_id, ordem),
  constraint orcamentista_levantamento_item_levantamento_fkey foreign key (levantamento_id, tenant_id) references public.orcamentista_levantamento (id, tenant_id) on delete cascade,
  constraint orcamentista_levantamento_item_tenant_fkey foreign key (tenant_id) references public.tenants (id) on delete cascade,
  constraint orcamentista_levantamento_item_tabela_fkey foreign key (tabela_id) references public.orcamentista_tabela (id) on delete set null
);
