-- O estado ANTES da 20261028000001, como em PRODUÇÃO em 28/10/2026 (consulta somente leitura): os mesmos ids.
--  - UMA matéria-prima com família PVC: "Esquadrias de PVC WOLF" da Esquadrias De Paula (o nome de produção em 28/10/2026) (79d764fe…, empresa 20e08592…);
--  - o motor da Wolff (9a233c55…), família PVC, fornecedor Wolf Perfis (44c5c0fe…), vigente, sem categoria; com conteúdo e tempos;
--  - as 3 etapas PVC (bc8bcb4a…, ed9a9b06…, dd8d3526…), as três apontando o motor da Wolff;
--  e, para os casos: uma segunda empresa ("Vidraçaria B", com uma matéria-prima sem família), o catálogo com ALUMINIO, e um segundo fornecedor.
insert into public.orcamentista_familia_catalogo (chave, rotulo, ordem) values ('ALUMINIO', 'Esquadrias de alumínio', 2) on conflict do nothing;
insert into public.tenants (id, name) values ('20e08592-f957-4e72-b7eb-251387e34eb9', 'Esquadrias De Paula Ltda'), ('b0000000-0000-0000-0000-00000000000b', 'Vidraçaria B');
insert into public.orcamentista_materia_prima (id, tenant_id, nome, ordem, familia) values
  ('79d764fe-4acd-43e2-bed9-38e20667ca3d', '20e08592-f957-4e72-b7eb-251387e34eb9', 'Esquadrias de PVC WOLF', 1, 'PVC'),
  ('c1000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Esquadrias da B', 1, null);
insert into public.orcamentista_fornecedor (id, nicho_id, nome) select '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', n.id, 'Wolf Perfis' from public.orcamentista_nicho n limit 1;
insert into public.orcamentista_fornecedor (id, nicho_id, nome) select 'f2000000-0000-0000-0000-000000000002', n.id, 'Roller Star' from public.orcamentista_nicho n limit 1;
insert into public.orcamentista_motor (id, familia, fornecedor_id, arquivo_nome, arquivo_path, vigente) values
  ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'PVC', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654', 'Motor_Wolf_PVC.xlsx', '44c5c0fe-a0d3-4aab-802d-20a6eff3f654/motor/wolff.xlsx', true);
insert into public.orcamentista_motor_tipologia_detalhe (motor_id, ordem, linha, tipologia, descricao, tipo) values
  ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 2, 'EUROPA 42', 'DP-01', 'Janela', 'Correr'), ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 3, 'DESIGN', 'DP-03', 'Maxim-ar', 'Maxim-ar');
insert into public.orcamentista_motor_tipologia_tempo (motor_id, tipologia, tempo_fabricacao_min, tempo_origem) values
  ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'DP-01', 600, 'ESTIMADO'), ('9a233c55-f377-45d3-b2ae-b1a740a98e44', 'DP-03', 900, 'ESTIMADO');
insert into public.orcamentista_familia_etapa (id, familia, numero, rotulo, acao, motor_id) values
  ('bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d', 'PVC', 1, 'Apanhado de esquadrias', 'APANHAR', '9a233c55-f377-45d3-b2ae-b1a740a98e44'),
  ('ed9a9b06-d898-4f75-8487-e260d8ba8ec0', 'PVC', 2, 'Levantamento de esquadrias', 'GERAR_LEVANTAMENTO', '9a233c55-f377-45d3-b2ae-b1a740a98e44'),
  ('dd8d3526-f08e-47e1-81c3-a6770214516f', 'PVC', 3, 'Relação de barras e materiais', 'CALCULAR_BARRAS', '9a233c55-f377-45d3-b2ae-b1a740a98e44');
-- a FOTO do que a migração não pode tocar: o conteúdo do motor, os tempos, as matérias-primas
create table public.h_foto as
  select 'motor_detalhe' t, md5(x::text) h from public.orcamentista_motor_tipologia_detalhe x union all
  select 'motor_tempo', md5(x::text) from public.orcamentista_motor_tipologia_tempo x union all
  select 'materia_prima', md5(x::text) from public.orcamentista_materia_prima x;
create table public.h_etapas_antes as select * from public.orcamentista_familia_etapa;
create table public.h_motor_antes as select * from public.orcamentista_motor;
