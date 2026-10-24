-- HARNESS do tempo em tabela própria (migração 20261024000003) — OS CASOS. NÃO TOCA PRODUÇÃO.
-- Cada caso é um bloco DO: `ok: ...` por NOTICE, ou `FALHOU: ...` por EXCEPTION. O run.sh conta os
-- `-- CASO ` deste arquivo e exige um `ok:` para cada um. A ordem importa: o caso 4 importa por
-- cima da tabela c1, e o 5 apaga a tabela c2.
--
-- O estado de partida é o de `05_como_em_producao.sql`:
--   c1 · DP-01  90 ESTIMADO     c1 · DP-02  150 IMPORTADO     c1 · DP-03  sem tempo
--   c2 · DP-01 240 ESTIMADO

-- CASO 1 — a tabela nova tem EXATAMENTE as tipologias com tempo, e a sem tempo não ganha linha
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(right(tabela_id::text, 2) || '/' || tipologia, ',' ORDER BY tabela_id, tipologia) INTO v
    FROM public.orcamentista_motor_tipologia_tempo;
  IF v IS DISTINCT FROM 'c1/DP-01,c1/DP-02,c2/DP-01' THEN
    RAISE EXCEPTION 'FALHOU: caso 1 — a tabela nova tem %, esperado c1/DP-01,c1/DP-02,c2/DP-01', v;
  END IF;
  RAISE NOTICE 'ok: caso 1 — as 3 tipologias com tempo, e o DP-03 sem tempo ficou sem linha';
END $$;

-- CASO 2 — cada cópia é IGUAL à origem, e a mesma tipologia em duas tabelas não se mistura
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(right(tabela_id::text, 2) || '/' || tipologia || '=' || tempo_fabricacao_min || ' ' || tempo_origem, ',' ORDER BY tabela_id, tipologia) INTO v
    FROM public.orcamentista_motor_tipologia_tempo;
  IF v IS DISTINCT FROM 'c1/DP-01=90 ESTIMADO,c1/DP-02=150 IMPORTADO,c2/DP-01=240 ESTIMADO' THEN
    RAISE EXCEPTION 'FALHOU: caso 2 — copiado %', v;
  END IF;
  -- e contra a origem, linha a linha: nada na nova que não esteja igual na antiga
  IF EXISTS (SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem FROM public.orcamentista_motor_tipologia_tempo
             EXCEPT
             SELECT tabela_id, tipologia, tempo_fabricacao_min, tempo_origem FROM public.orcamentista_motor_tipologia WHERE tempo_origem IS NOT NULL) THEN
    RAISE EXCEPTION 'FALHOU: caso 2 — a tabela nova tem linha que a antiga não tem igual';
  END IF;
  RAISE NOTICE 'ok: caso 2 — tempo e origem copiados como estão, c1 e c2 separados';
END $$;

-- CASO 3 — a tabela antiga ficou intacta, e as duas colunas estão marcadas OBSOLETAS
DO $$
DECLARE n int; soma int; c text;
BEGIN
  SELECT count(*), sum(tempo_fabricacao_min) INTO n, soma FROM public.orcamentista_motor_tipologia WHERE tempo_origem IS NOT NULL;
  IF n <> 3 OR soma <> 480 THEN
    RAISE EXCEPTION 'FALHOU: caso 3 — a tabela antiga tem % tempos (soma %), esperado 3 (480)', n, soma;
  END IF;
  SELECT col_description('public.orcamentista_motor_tipologia'::regclass,
           (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.orcamentista_motor_tipologia'::regclass AND attname = 'tempo_fabricacao_min')) INTO c;
  IF c NOT LIKE 'OBSOLETA%' THEN
    RAISE EXCEPTION 'FALHOU: caso 3 — a coluna antiga não está marcada OBSOLETA: %', c;
  END IF;
  RAISE NOTICE 'ok: caso 3 — a tabela antiga intacta (3 tempos, soma 480), colunas marcadas OBSOLETAS';
END $$;

-- CASO 4 — O EFEITO: a importação apaga os tempos da tabela antiga e NÃO alcança a nova
DO $$
DECLARE r jsonb; antigos int; v text;
BEGIN
  r := public.importar_conteudo_da_tabela('00000000-0000-4000-8000-0000000000c1'::uuid, jsonb_build_object(
    'importado_por', NULL, 'itens', '[]'::jsonb, 'regras', '[]'::jsonb, 'formulas', '[]'::jsonb, 'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('cruzam', 0, 'nao_cruzam', 0, 'normalizados', 0),
    'tipologias', jsonb_build_array(
      jsonb_build_object('tipologia', 'DP-01', 'linha', 'EUROPA 42', 'n_regras', 136, 'n_condicionais', 36, 'variaveis', jsonb_build_array('ARE')),
      jsonb_build_object('tipologia', 'DP-02', 'linha', 'EUROPA 42', 'n_regras', 400, 'n_condicionais', 10, 'variaveis', '[]'::jsonb))));
  -- o perigo é real: na tabela antiga a importação apagou os tempos de c1
  SELECT count(*) INTO antigos FROM public.orcamentista_motor_tipologia
   WHERE tabela_id = '00000000-0000-4000-8000-0000000000c1' AND tempo_origem IS NOT NULL;
  IF antigos <> 0 THEN
    RAISE EXCEPTION 'FALHOU: caso 4 — PREPARO: a importação não apagou os tempos antigos (% ficaram); o caso não exercitaria nada', antigos;
  END IF;
  -- e na tabela nova eles continuam
  SELECT string_agg(tipologia || '=' || tempo_fabricacao_min || ' ' || tempo_origem, ',' ORDER BY tipologia) INTO v
    FROM public.orcamentista_motor_tipologia_tempo WHERE tabela_id = '00000000-0000-4000-8000-0000000000c1';
  IF v IS DISTINCT FROM 'DP-01=90 ESTIMADO,DP-02=150 IMPORTADO' THEN
    RAISE EXCEPTION 'FALHOU: caso 4 — depois da importação a tabela nova tem %', v;
  END IF;
  RAISE NOTICE 'ok: caso 4 — a importação apagou os tempos da tabela antiga, e a nova os guardou (DP-01=90, DP-02=150)';
END $$;

-- CASO 5 — apagar a TABELA do fornecedor apaga os tempos DELA, e só os dela
DO $$
DECLARE v text;
BEGIN
  DELETE FROM public.orcamentista_tabela WHERE id = '00000000-0000-4000-8000-0000000000c2';
  SELECT string_agg(right(tabela_id::text, 2) || '/' || tipologia, ',' ORDER BY tabela_id, tipologia) INTO v
    FROM public.orcamentista_motor_tipologia_tempo;
  IF v IS DISTINCT FROM 'c1/DP-01,c1/DP-02' THEN
    RAISE EXCEPTION 'FALHOU: caso 5 — depois de apagar a tabela c2, a tabela nova tem %', v;
  END IF;
  RAISE NOTICE 'ok: caso 5 — apagar a tabela c2 levou os tempos dela (CASCADE), e os de c1 ficaram';
END $$;

-- CASO 6 — os CHECK: tempo zero e origem desconhecida são recusados
DO $$
DECLARE recusou_zero boolean := false; recusou_origem boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.orcamentista_motor_tipologia_tempo (tabela_id, tipologia, tempo_fabricacao_min, tempo_origem)
    VALUES ('00000000-0000-4000-8000-0000000000c1', 'DP-09', 0, 'ESTIMADO');
  EXCEPTION WHEN check_violation THEN recusou_zero := true;
  END;
  BEGIN
    INSERT INTO public.orcamentista_motor_tipologia_tempo (tabela_id, tipologia, tempo_fabricacao_min, tempo_origem)
    VALUES ('00000000-0000-4000-8000-0000000000c1', 'DP-09', 60, 'CHUTE');
  EXCEPTION WHEN check_violation THEN recusou_origem := true;
  END;
  IF NOT recusou_zero OR NOT recusou_origem THEN
    RAISE EXCEPTION 'FALHOU: caso 6 — recusou tempo zero: %, recusou origem CHUTE: %', recusou_zero, recusou_origem;
  END IF;
  RAISE NOTICE 'ok: caso 6 — tempo zero e origem desconhecida recusados pelo CHECK';
END $$;

-- CASO 7 — anon e authenticated não leem a tabela nova (REVOKE), e a RLS está ligada com 4 políticas
DO $$
DECLARE negado_anon boolean := false; negado_auth boolean := false; n_pol int; rls boolean;
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.orcamentista_motor_tipologia_tempo;
  EXCEPTION WHEN insufficient_privilege THEN negado_anon := true;
  END;
  RESET ROLE;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM 1 FROM public.orcamentista_motor_tipologia_tempo;
  EXCEPTION WHEN insufficient_privilege THEN negado_auth := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n_pol FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_motor_tipologia_tempo';
  SELECT relrowsecurity INTO rls FROM pg_class WHERE oid = 'public.orcamentista_motor_tipologia_tempo'::regclass;
  IF NOT negado_anon OR NOT negado_auth OR n_pol <> 4 OR NOT rls THEN
    RAISE EXCEPTION 'FALHOU: caso 7 — anon negado %, authenticated negado %, % políticas, RLS %', negado_anon, negado_auth, n_pol, rls;
  END IF;
  RAISE NOTICE 'ok: caso 7 — anon e authenticated sem acesso, RLS ligada, 4 políticas';
END $$;
