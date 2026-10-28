-- As tabelas de fornecedor como em PRODUÇÃO em 28/10/2026 (consulta somente leitura), além da da Wolff que a cadeia já tem (72366020…,
-- sem categoria e sem família): duas de FERRAGENS da IMAB com família PVC, a de PERFIL do Wolf duplicado com família PVC, e a da Estrela
-- sem categoria e sem família. Nenhuma de PERFIL sem família — é o que a guarda confere.
insert into public.orcamentista_fornecedor (id, nicho_id, nome) select 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8', n.id, 'IMAB INDUSTRIA METALURGICA LTDA' from public.orcamentista_nicho n limit 1;
insert into public.orcamentista_fornecedor (id, nicho_id, nome) select '6d105e66-47fb-493c-8d04-b61afefe7d90', n.id, 'Wolf  Perfis PVC' from public.orcamentista_nicho n limit 1;
insert into public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, familia, categoria_chave) values
  ('fe2c6667-652f-43bd-89d2-fd63673dc966', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8/arquivo/a.xlsx', 'FERRAGENS - IMAB INDUSTRIA METALURGICA LTDA.xlsx', 'PVC', 'FERRAGENS'),
  ('dca59dc6-70ec-4ecb-bc9c-69ab37d67ac1', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8', 'f3ee59c4-43ec-4656-ac66-9f56d5e585e8/arquivo/b.xlsx', 'ROTEK COMERCIAL IMPORTADORA LTDA.xlsx', 'PVC', 'FERRAGENS'),
  ('5f52bb9e-c83b-4f0b-b715-4fe18db2a620', '6d105e66-47fb-493c-8d04-b61afefe7d90', '6d105e66-47fb-493c-8d04-b61afefe7d90/arquivo/c.xlsx', 'Perfis_de_PVC_-_Wolff.xlsx', 'PVC', 'PERFIL');
-- a FOTO do que a migração não pode tocar: as tabelas, as matérias-primas, as etapas, os motores, as ramificações
create table public.h_foto2 as
  select 'tabela' t, md5(x::text) h from public.orcamentista_tabela x union all
  select 'materia_prima', md5(x::text) from public.orcamentista_materia_prima x union all
  select 'etapa', md5(x::text) from public.orcamentista_familia_etapa x union all
  select 'motor', md5(x::text) from public.orcamentista_motor x union all
  select 'ramificacao', md5(x::text) from public.orcamentista_familia_ramificacao x;
create table public.h_fks as
  select conname, pg_get_constraintdef(oid) def from pg_constraint where contype = 'f' and (confrelid = 'public.orcamentista_familia_catalogo'::regclass or pg_get_constraintdef(oid) ilike '%familia)%');
