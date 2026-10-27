-- O ESTADO DE PRODUÇÃO medido em 27/10/2026 (somente leitura), do que a 20261027000005 toca:
-- `orcamentista_tabela` com as colunas, as constraints e o índice como estão lá, as 2 tabelas de hoje
-- (Wolff e Estrela, vigente false, família nula), e o catálogo das 7 categorias.
-- Não é a cadeia de migrações (a pasta não é o schema — `migracao.md`, Parte II): é o que a consulta devolveu.
create table public.orcamentista_fornecedor (id uuid primary key default gen_random_uuid(), nome text not null);
create table public.orcamentista_familia_catalogo (chave text primary key, rotulo text not null, ordem int not null);
create table public.orcamentista_categoria_catalogo (chave text primary key, ordem int not null, rotulo text not null);
insert into public.orcamentista_categoria_catalogo (chave, rotulo, ordem) values
  ('PERFIL','Perfil',1),('PERSIANAS','Persianas',2),('REFORCO','Reforço metálico',3),('FERRAGENS','Ferragens',4),
  ('ACESSORIOS_VEDACAO','Acessórios e vedação',5),('VIDRO','Vidro',6),('INSTALACAO','Instalação',7);

create table public.orcamentista_tabela (
  id uuid not null default gen_random_uuid(),
  fornecedor_id uuid not null,
  arquivo_path text not null,
  arquivo_nome text not null,
  motor_path text not null,
  motor_nome text not null,
  vigencia text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  familia text,
  vigente boolean not null default false,
  constraint orcamentista_tabela_pkey primary key (id),
  constraint orcamentista_tabela_familia_fkey foreign key (familia) references public.orcamentista_familia_catalogo (chave) on delete restrict,
  constraint orcamentista_tabela_fornecedor_id_fkey foreign key (fornecedor_id) references public.orcamentista_fornecedor (id) on delete restrict
);
create unique index orcamentista_tabela_uma_vigente on public.orcamentista_tabela using btree (fornecedor_id, familia) nulls not distinct where vigente;

insert into public.orcamentista_fornecedor (id, nome) values
  ('a0000000-0000-0000-0000-000000000001', 'Wolf Perfis'),
  ('a0000000-0000-0000-0000-000000000002', 'INDUSTRIA DE VIDROS TEMPERADOS ESTRELA LTDA');
insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome) values
  ('72366020-57c9-489f-9385-397b7fa3dedb', 'a0000000-0000-0000-0000-000000000001', 'w/arquivo/t.xlsm', 'Modelo 2026 - Atualizada - Tabela de Pedidos - Wolff Perfis.xlsm', 'w/motor/m.xlsx', 'Motor_Wolf_PVC.xlsx'),
  ('5f7acebf-3c91-46de-af00-57a47f8be288', 'a0000000-0000-0000-0000-000000000002', 'e/arquivo/t.xlsx', 'INDUSTRIA_DE_VIDROS_TEMPERADOS_ESTRELA_LTDA.xlsx', 'e/motor/m.xlsx', 'motor-estrela.xlsx');

-- A FOTO das duas linhas ANTES da migração: tudo, menos a coluna que ela acrescenta.
create table public.harness_antes as
  select t.id, md5(row(t.id, t.fornecedor_id, t.arquivo_path, t.arquivo_nome, t.motor_path, t.motor_nome, t.vigencia, t.criado_em, t.criado_por, t.familia, t.vigente)::text) as h
    from public.orcamentista_tabela t;
