-- HARNESS do tempo em tabela própria (migração 20261024000003). NÃO TOCA PRODUÇÃO.
-- Roda DEPOIS da 20261024000001 e ANTES da migração em teste. Reproduz o estado de produção com o
-- que distingue os casos:
--   - DUAS tabelas do fornecedor, com a MESMA tipologia (DP-01) em cada uma, e tempos diferentes:
--     uma cópia que perdesse o tabela_id da chave misturaria as duas;
--   - as DUAS origens (ESTIMADO e IMPORTADO) e tempos DIFERENTES entre si: uma cópia que trocasse
--     a origem ou o tempo de linha seria vista;
--   - uma tipologia SEM tempo (DP-03): ela não pode ganhar linha na tabela nova.
-- A 20261024000001 preenche ESTIMADO em toda linha sem tempo QUANDO É APLICADA; as linhas daqui
-- entram depois dela, e por isso o DP-03 fica sem tempo — como uma tipologia importada depois.
\set ON_ERROR_STOP 1
INSERT INTO public.orcamentista_nicho (id, modelo, nome) VALUES ('00000000-0000-4000-8000-0000000000a1', 'FABRICACAO', 'Esquadrias');
INSERT INTO public.orcamentista_fornecedor (id, nicho_id, nome) VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Wolff');
INSERT INTO public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'a/1.xlsm', '1.xlsm', 'm/1.xlsx', '1.xlsx'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', 'a/2.xlsm', '2.xlsm', 'm/2.xlsx', '2.xlsx');
INSERT INTO public.orcamentista_motor_tipologia (tabela_id, tipologia, linha, n_regras, n_condicionais, variaveis, tempo_fabricacao_min, tempo_origem) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 'DP-01', 'EUROPA 42', 136, 36, '{ARE}', 90,   'ESTIMADO'),
  ('00000000-0000-4000-8000-0000000000c1', 'DP-02', 'EUROPA 42', 400, 10, '{}',    150,  'IMPORTADO'),
  ('00000000-0000-4000-8000-0000000000c1', 'DP-03', 'EUROPA 60', 20,  0,  '{}',    NULL, NULL),
  ('00000000-0000-4000-8000-0000000000c2', 'DP-01', 'EUROPA 42', 900, 5,  '{}',    240,  'ESTIMADO');
