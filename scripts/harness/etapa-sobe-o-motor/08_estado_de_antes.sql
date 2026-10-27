-- O estado ANTES da 20261027000010: a cadeia REAL de migrações até a 000009 (como em produção), e os dados que os casos usam.
--  - duas empresas (A e B), cada uma com a matéria-prima "Esquadrias de PVC" (o mesmo nome em empresas diferentes é permitido), e a A com uma segunda ("Alumínio");
--  - quatro etapas: três na PVC e uma na ALUMINIO, todas SEM motor (como em produção: zero etapas, aqui já cadastradas);
--  - um fornecedor e UM motor "da Wolff" com conteúdo e três TEMPOS (por motor_id) — o que a função nova NÃO pode tocar.
insert into public.orcamentista_familia_catalogo (chave, rotulo, ordem) values ('ALUMINIO', 'Esquadrias de alumínio', 2);
insert into public.tenants (id) values ('b0000000-0000-0000-0000-00000000000a'), ('b0000000-0000-0000-0000-00000000000b');
insert into public.orcamentista_materia_prima (id, tenant_id, nome, ordem, familia) values
  ('c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'Esquadrias de PVC', 1, 'PVC'),
  ('c1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', 'Alumínio', 2, 'ALUMINIO'),
  ('c1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'Esquadrias de PVC', 1, 'PVC');
insert into public.orcamentista_familia_etapa (id, familia, numero, rotulo, acao) values
  ('e1000000-0000-0000-0000-000000000001', 'PVC', 1, 'Apanhado', 'APANHAR'),
  ('e1000000-0000-0000-0000-000000000002', 'PVC', 2, 'Levantamento', 'GERAR_LEVANTAMENTO'),
  ('e1000000-0000-0000-0000-000000000003', 'PVC', 3, 'Relação de barras', 'CALCULAR_BARRAS'),
  ('e1000000-0000-0000-0000-000000000004', 'ALUMINIO', 1, 'Apanhado do alumínio', 'APANHAR');
insert into public.orcamentista_fornecedor (id, nicho_id, nome) select 'f1000000-0000-0000-0000-000000000001', n.id, 'Wolff' from public.orcamentista_nicho n limit 1;
insert into public.orcamentista_motor (id, familia, fornecedor_id, arquivo_nome, arquivo_path, vigente) values
  ('c0000000-0000-0000-0000-0000000000a1', 'PVC', 'f1000000-0000-0000-0000-000000000001', 'Motor_Wolf_PVC.xlsx', 'f1000000-0000-0000-0000-000000000001/motor/wolff.xlsx', true);
insert into public.orcamentista_motor_tipologia_detalhe (motor_id, ordem, linha, tipologia, descricao, tipo) values
  ('c0000000-0000-0000-0000-0000000000a1', 2, 'EUROPA 42', 'DP-01', 'Janela', 'Correr'), ('c0000000-0000-0000-0000-0000000000a1', 3, 'EUROPA 42', 'DP-02', 'Porta', 'Giro'), ('c0000000-0000-0000-0000-0000000000a1', 4, 'DESIGN', 'DP-03', 'Maxim-ar', 'Maxim-ar');
insert into public.orcamentista_motor_tipologia_tempo (motor_id, tipologia, tempo_fabricacao_min, tempo_origem) values
  ('c0000000-0000-0000-0000-0000000000a1', 'DP-01', 600, 'ESTIMADO'), ('c0000000-0000-0000-0000-0000000000a1', 'DP-02', 300, 'ESTIMADO'), ('c0000000-0000-0000-0000-0000000000a1', 'DP-03', 900, 'ESTIMADO');
-- a FOTO do que a função nova não pode tocar: o hash de cada linha das 14 tabelas do motor (as do tabela_id e as do motor da Wolff), e das tabelas da empresa
create table public.h_foto as
  select 'motor_regra' t, md5(x::text) h from public.orcamentista_motor_regra x union all
  select 'motor_perfil', md5(x::text) from public.orcamentista_motor_perfil x union all
  select 'motor_tipologia', md5(x::text) from public.orcamentista_motor_tipologia x union all
  select 'motor_detalhe', md5(x::text) from public.orcamentista_motor_tipologia_detalhe x union all
  select 'motor_tempo', md5(x::text) from public.orcamentista_motor_tipologia_tempo x union all
  select 'motor_formula_familia', md5(x::text) from public.orcamentista_motor_formula_familia x union all
  select 'importacao', md5(x::text) from public.orcamentista_importacao x union all
  select 'tabela', md5(x::text) from public.orcamentista_tabela x union all
  select 'tabela_item', md5(x::text) from public.orcamentista_tabela_item x union all
  select 'materia_prima', md5(x::text) from public.orcamentista_materia_prima x union all
  select 'motor_wolff', md5(x::text) from public.orcamentista_motor x where x.id = 'c0000000-0000-0000-0000-0000000000a1';
