-- HARNESS da reimportação com os tempos na tabela própria. NÃO TOCA PRODUÇÃO.
-- Roda DEPOIS da 20261024000001 e ANTES da 20261024000003. Reproduz o estado de produção medido em
-- 25/10/2026 (consulta só de leitura): na tabela da Wolff, 164 tipologias com tempo ESTIMADO nas
-- colunas antigas, SOMA 87.300 minutos. Os tempos são DIFERENTES entre si (400 a 670, e o último
-- fecha a soma), para que trocar o tempo de linha apareça na comparação.
-- Uma SEGUNDA tabela (c2) com um tempo IMPORTADO: reimportar a c1 não pode tocar nela.
\set ON_ERROR_STOP 1
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
INSERT INTO public.orcamentista_nicho (id, modelo, nome) VALUES ('00000000-0000-4000-8000-0000000000a1', 'FABRICACAO', 'Esquadrias');
INSERT INTO public.orcamentista_fornecedor (id, nicho_id, nome) VALUES ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Wolff');
INSERT INTO public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'a/1.xlsm', '1.xlsm', 'm/1.xlsx', '1.xlsx'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', 'a/2.xlsm', '2.xlsm', 'm/2.xlsx', '2.xlsx');
INSERT INTO public.orcamentista_motor_tipologia (tabela_id, tipologia, linha, n_regras, n_condicionais, variaveis, tempo_fabricacao_min, tempo_origem)
SELECT '00000000-0000-4000-8000-0000000000c1', 'DP-' || lpad(i::text, 3, '0'), 'EUROPA 42', 10, 1, '{}',
       CASE WHEN i < 164 THEN 400 + (i % 10) * 30 ELSE 320 END, 'ESTIMADO'
  FROM generate_series(1, 164) AS i;
INSERT INTO public.orcamentista_motor_tipologia (tabela_id, tipologia, linha, n_regras, n_condicionais, variaveis, tempo_fabricacao_min, tempo_origem) VALUES
  ('00000000-0000-4000-8000-0000000000c2', 'DP-001', 'EUROPA 42', 10, 1, '{}', 999, 'IMPORTADO');
DO $$
DECLARE n int; soma int;
BEGIN
  SELECT count(*), sum(tempo_fabricacao_min) INTO n, soma FROM public.orcamentista_motor_tipologia
   WHERE tabela_id = '00000000-0000-4000-8000-0000000000c1' AND tempo_origem = 'ESTIMADO';
  IF n <> 164 OR soma <> 87300 THEN RAISE EXCEPTION 'PREPARO: c1 tem % tempos, soma % (esperado 164 e 87300)', n, soma; END IF;
END $$;
