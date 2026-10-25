-- HARNESS do tempo em tabela própria — A REIMPORTAÇÃO COMPLETA COM OS 164 TEMPOS. NÃO TOCA PRODUÇÃO.
-- Roda depois de `10_casos.sql`, e o run.sh o roda DUAS VEZES: com a `importar_conteudo_da_tabela` da
-- 20261020000002 e de novo com a da 20261025000004 (a que apaga também as nove abas). As duas apagam
-- e regravam `orcamentista_motor_tipologia`; nenhuma pode alcançar `orcamentista_motor_tipologia_tempo`.
--
-- O ESTADO É O DE PRODUÇÃO NA HORA DE TIRAR A TRAVA: 164 tipologias com tempo ESTIMADO, soma 87.300,
-- nas colunas antigas E copiados na tabela nova (o que a 20261024000003 faz ao ser aplicada). Os tempos
-- são DIFERENTES entre si (300 a 769, e um 228): uma reimportação que trocasse tempo de tipologia
-- passaria pela contagem e pela soma, e não pela comparação linha a linha.
--
-- A importação roda DUAS vezes seguidas, com as 164 tipologias e item, regra e fórmula: é a reimportação
-- completa, não um payload mínimo. Antes de olhar a tabela nova, o caso confere que a importação APAGOU
-- os tempos das colunas antigas — sem isso ele não exercitaria nada (o perigo tem de ser real).
\set ON_ERROR_STOP 1
DELETE FROM public.orcamentista_tabela WHERE id = '00000000-0000-4000-8000-0000000000c3';
INSERT INTO public.orcamentista_tabela (id, fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome) VALUES
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000b1', 'a/3.xlsm', '3.xlsm', 'm/3.xlsx', '3.xlsx');
INSERT INTO public.orcamentista_motor_tipologia (tabela_id, tipologia, linha, n_regras, n_condicionais, variaveis, tempo_fabricacao_min, tempo_origem)
SELECT '00000000-0000-4000-8000-0000000000c3', 'DP-' || lpad(i::text, 3, '0'), 'EUROPA 42', 10, 0, '{}',
       CASE WHEN i = 164 THEN 228 ELSE 300 + ((i * 37) % 470) END, 'ESTIMADO'
  FROM generate_series(1, 164) AS i;
INSERT INTO public.orcamentista_motor_tipologia_tempo (tabela_id, tipologia, tempo_fabricacao_min, tempo_origem)
SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem
  FROM public.orcamentista_motor_tipologia
 WHERE tabela_id = '00000000-0000-4000-8000-0000000000c3';

-- CASO 8 — 164 tempos na tabela nova, reimportação completa (duas vezes): roda até o fim, e os 164 ficam
DO $$
DECLARE
  c3 constant uuid := '00000000-0000-4000-8000-0000000000c3';
  v_payload jsonb;
  r jsonb;
  vez int;
  n int; soma bigint; origens text; antigos int; diferentes int;
BEGIN
  -- PREPARO: o estado de produção — 164 tempos ESTIMADO, soma 87.300, nas duas tabelas
  SELECT count(*), sum(tempo_fabricacao_min), string_agg(DISTINCT tempo_origem, ',') INTO n, soma, origens
    FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = c3;
  IF n <> 164 OR soma <> 87300 OR origens <> 'ESTIMADO' THEN
    RAISE EXCEPTION 'FALHOU: caso 8 — PREPARO: a tabela nova tem % tempos (soma %, origens %), esperado 164 (87300, ESTIMADO)', n, soma, origens;
  END IF;
  CREATE TEMP TABLE _tempos_antes ON COMMIT DROP AS
    SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem, atualizado_por, atualizado_em
      FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = c3;

  -- o payload da reimportação: as MESMAS 164 tipologias, e item, regra e fórmula — com as chaves das
  -- duas versões da função (a da 20261020000002 ignora as nove abas; a da 20261025000004 as exige)
  SELECT jsonb_build_object(
    'importado_por', NULL, 'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('cruzam', 1, 'nao_cruzam', 0, 'normalizados', 0),
    'itens', jsonb_build_array(jsonb_build_object('codigo', 'IL4237', 'descricao', 'PERFIL', 'valor_metro_interno', 83.52)),
    'regras', jsonb_build_array(jsonb_build_object('codigo', 'IL4237', 'tipologia', 'DP-001', 'tipologias', jsonb_build_array('DP-001'))),
    'formulas', jsonb_build_array(jsonb_build_object('linha', 'EUROPA 42', 'variavel', 'L', 'formula', 'L')),
    'tipologias', (SELECT jsonb_agg(jsonb_build_object('tipologia', 'DP-' || lpad(i::text, 3, '0'), 'linha', 'EUROPA 42',
                                                         'n_regras', 10, 'n_condicionais', 0, 'variaveis', '[]'::jsonb) ORDER BY i)
                     FROM generate_series(1, 164) AS i),
    'detalhes', '[]'::jsonb, 'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb, 'vidros', '[]'::jsonb,
    'baguetes', '[]'::jsonb, 'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb,
    'otimizacao', '[]'::jsonb) INTO v_payload;

  FOR vez IN 1..2 LOOP
    r := public.importar_conteudo_da_tabela(c3, v_payload);
    -- a importação foi ATÉ O FIM: gravou as 164 tipologias
    IF (r->>'tipologias')::int IS DISTINCT FROM 164 THEN
      RAISE EXCEPTION 'FALHOU: caso 8 — importação %: a função gravou % tipologias, esperado 164 (retorno %)', vez, r->>'tipologias', r;
    END IF;
    -- o perigo é real: as colunas antigas foram apagadas pela regravação
    SELECT count(*) INTO antigos FROM public.orcamentista_motor_tipologia WHERE tabela_id = c3 AND tempo_origem IS NOT NULL;
    IF antigos <> 0 THEN
      RAISE EXCEPTION 'FALHOU: caso 8 — PREPARO: a importação % não apagou os tempos das colunas antigas (% ficaram); o caso não exercitaria nada', vez, antigos;
    END IF;
    -- e os 164 tempos continuam na tabela nova, linha por linha iguais ao que eram
    SELECT count(*), sum(tempo_fabricacao_min) INTO n, soma FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = c3;
    SELECT count(*) INTO diferentes FROM (
      (SELECT * FROM _tempos_antes EXCEPT SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem, atualizado_por, atualizado_em
                                            FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = c3)
      UNION ALL
      (SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem, atualizado_por, atualizado_em
         FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = c3 EXCEPT SELECT * FROM _tempos_antes)) d;
    IF n <> 164 OR soma <> 87300 OR diferentes <> 0 THEN
      RAISE EXCEPTION 'FALHOU: caso 8 — depois da importação %: % tempos (soma %), % linha(s) diferentes do antes; esperado 164 (87300), 0', vez, n, soma, diferentes;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok: caso 8 — 164 tempos (soma 87300), reimportação completa duas vezes: a função gravou 164 tipologias, apagou as colunas antigas, e os 164 tempos ficaram iguais na tabela nova';
END $$;
