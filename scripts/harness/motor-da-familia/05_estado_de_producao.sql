-- O ESTADO DE PRODUÇÃO medido em 27/10/2026 (somente leitura), do que a 20261027000006 toca. Não é a cadeia de
-- migrações (a pasta não é o schema — `migracao.md`, Parte II): é o que as consultas devolveram.
--   orcamentista_motor: 1 planilha (PVC, Wolff, vigente); índice uma_vigente (familia, fornecedor_id) WHERE vigente
--   orcamentista_familia_etapa: 0 linhas; UNIQUE (familia, numero)
--   orcamentista_levantamento_item: 4 itens (DP-02), sem tabela nem motor
--   orcamentista_tabela: 2 (Wolff, Estrela), vigente false, categoria_chave nula (a 20261027000005 já aplicada;
--   o gatilho dela fica fora da réplica: ele só trava INSERT sem categoria, e os casos de índice precisam de
--   tabelas sem categoria para provar o NULLS NOT DISTINCT)
create table public.tenants (id uuid primary key default gen_random_uuid());
create table public.orcamentista_fornecedor (id uuid primary key default gen_random_uuid(), nome text not null);
create table public.orcamentista_familia_catalogo (chave text primary key, rotulo text not null, ordem int not null);
create table public.orcamentista_categoria_catalogo (chave text primary key, ordem int not null, rotulo text not null);
insert into public.orcamentista_familia_catalogo values ('PVC', 'PVC', 1), ('ALUMINIO', 'Alumínio', 2);
insert into public.orcamentista_categoria_catalogo (chave, rotulo, ordem) values
  ('PERFIL','Perfil',1),('PERSIANAS','Persianas',2),('REFORCO','Reforço metálico',3),('FERRAGENS','Ferragens',4),
  ('ACESSORIOS_VEDACAO','Acessórios e vedação',5),('VIDRO','Vidro',6),('INSTALACAO','Instalação',7);

create table public.orcamentista_tabela (
  id uuid not null default gen_random_uuid(),
  fornecedor_id uuid not null,
  arquivo_path text not null, arquivo_nome text not null, motor_path text not null, motor_nome text not null,
  vigencia text, criado_em timestamptz not null default now(), criado_por uuid,
  familia text, vigente boolean not null default false, categoria_chave text,
  constraint orcamentista_tabela_pkey primary key (id),
  constraint orcamentista_tabela_familia_fkey foreign key (familia) references public.orcamentista_familia_catalogo (chave) on delete restrict,
  constraint orcamentista_tabela_fornecedor_id_fkey foreign key (fornecedor_id) references public.orcamentista_fornecedor (id) on delete restrict,
  constraint orcamentista_tabela_categoria_fkey foreign key (categoria_chave) references public.orcamentista_categoria_catalogo (chave) on delete restrict
);
create unique index orcamentista_tabela_uma_vigente on public.orcamentista_tabela using btree (fornecedor_id, familia) nulls not distinct where vigente;

create table public.orcamentista_motor (
  id uuid not null default gen_random_uuid(),
  familia text not null,
  fornecedor_id uuid not null,
  arquivo_nome text not null, arquivo_path text not null,
  vigente boolean not null default false,
  arquivado_em timestamptz, arquivado_por uuid,
  criado_em timestamptz not null default now(), criado_por uuid,
  constraint orcamentista_motor_pkey primary key (id),
  constraint orcamentista_motor_familia_fkey foreign key (familia) references public.orcamentista_familia_catalogo (chave) on delete restrict,
  constraint orcamentista_motor_fornecedor_fkey foreign key (fornecedor_id) references public.orcamentista_fornecedor (id) on delete restrict,
  constraint orcamentista_motor_arquivado_nao_e_vigente check (not (vigente and (arquivado_em is not null))),
  constraint orcamentista_motor_arquivo_preenchido check ((btrim(arquivo_nome) <> '') and (btrim(arquivo_path) <> ''))
);
create unique index orcamentista_motor_uma_vigente on public.orcamentista_motor using btree (familia, fornecedor_id) where vigente;

create table public.orcamentista_familia_etapa (
  id uuid not null default gen_random_uuid(),
  familia text not null, numero int not null, rotulo text not null, acao text not null,
  instrucao text not null default '', abas text[] not null default '{}',
  atualizado_por uuid, atualizado_em timestamptz not null default now(),
  constraint orcamentista_familia_etapa_pkey primary key (id),
  constraint orcamentista_familia_etapa_numero_key unique (familia, numero),
  constraint orcamentista_familia_etapa_familia_fkey foreign key (familia) references public.orcamentista_familia_catalogo (chave) on delete restrict,
  constraint orcamentista_familia_etapa_acao_da_lista check (acao = any (array['APANHAR','CONFIRMAR','GERAR_LEVANTAMENTO','CALCULAR_BARRAS','ENVIAR'])),
  constraint orcamentista_familia_etapa_numero_positivo check (numero >= 1)
);

create table public.orcamentista_levantamento (
  id uuid not null default gen_random_uuid(), tenant_id uuid not null,
  constraint orcamentista_levantamento_pkey primary key (id),
  constraint orcamentista_levantamento_id_tenant_key unique (id, tenant_id)
);
create table public.orcamentista_levantamento_item (
  id uuid not null default gen_random_uuid(), tenant_id uuid not null, levantamento_id uuid not null, ordem int not null,
  tipologia text, largura_mm int, altura_mm int, quantidade int, cor_perfil text, vidro text, escolhas jsonb,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  tabela_id uuid, motor_id uuid,
  constraint orcamentista_levantamento_item_pkey primary key (id),
  constraint orcamentista_levantamento_item_ordem_key unique (levantamento_id, ordem),
  constraint orcamentista_levantamento_item_levantamento_fkey foreign key (levantamento_id, tenant_id) references public.orcamentista_levantamento (id, tenant_id) on delete cascade,
  constraint orcamentista_levantamento_item_tenant_fkey foreign key (tenant_id) references public.tenants (id) on delete cascade,
  constraint orcamentista_levantamento_item_tabela_fkey foreign key (tabela_id) references public.orcamentista_tabela (id) on delete set null,
  constraint orcamentista_levantamento_item_motor_fkey foreign key (motor_id) references public.orcamentista_motor (id) on delete restrict
);

insert into public.tenants (id) values ('b0000000-0000-0000-0000-000000000001');
insert into public.orcamentista_fornecedor (id, nome) values
  ('44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'Wolf Perfis'),
  ('a0000000-0000-0000-0000-000000000002', 'INDUSTRIA DE VIDROS TEMPERADOS ESTRELA LTDA'),
  ('a0000000-0000-0000-0000-000000000003', 'Segundo fornecedor de PVC (linha AAA)');
insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome) values
  ('72366020-57c9-489f-9385-397b7fa3dedb', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'w/a', 'Tabela Wolff.xlsm', 'w/m', 'Motor_Wolf_PVC.xlsx'),
  ('5f7acebf-3c91-46de-af00-57a47f8be288', 'a0000000-0000-0000-0000-000000000002', 'e/a', 'estrela.xlsx', 'e/m', 'motor-estrela.xlsx');
insert into public.orcamentista_motor (id, familia, fornecedor_id, arquivo_nome, arquivo_path, vigente) values
  ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'PVC', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'Motor_Wolf_PVC.xlsx', 'w/m', true);
insert into public.orcamentista_levantamento (id, tenant_id) values
  ('02db9513-7eda-43f0-852d-df940e781bef', 'b0000000-0000-0000-0000-000000000001'),
  ('b0465e57-a829-4f81-9f3e-9ba7d00a999f', 'b0000000-0000-0000-0000-000000000001');
insert into public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia) values
  ('b0000000-0000-0000-0000-000000000001', '02db9513-7eda-43f0-852d-df940e781bef', 1, 'DP-02'),
  ('b0000000-0000-0000-0000-000000000001', '02db9513-7eda-43f0-852d-df940e781bef', 2, 'DP-02'),
  ('b0000000-0000-0000-0000-000000000001', 'b0465e57-a829-4f81-9f3e-9ba7d00a999f', 1, 'DP-02'),
  ('b0000000-0000-0000-0000-000000000001', 'b0465e57-a829-4f81-9f3e-9ba7d00a999f', 2, 'DP-02');

-- A FOTO ANTES da migração: cada linha das quatro tabelas, menos o que a migração acrescenta; e a definição
-- do índice da vigente de antes (para o contraste).
create table public.harness_antes as
  select 'tabela'::text t, id, md5(row(x.*)::text) h from public.orcamentista_tabela x
  union all select 'motor', id, md5(row(x.*)::text) from public.orcamentista_motor x
  union all select 'item', id, md5(row(x.*)::text) from public.orcamentista_levantamento_item x;
create table public.harness_indice_antes as select indexdef from pg_indexes where indexname = 'orcamentista_tabela_uma_vigente';
