-- CASOS da migração 20261102000001 (bloco tributário do item). Cada caso roda numa transação DESFEITA, e diz "ok:" ou "FALHOU".
\set ON_ERROR_STOP 0
-- o payload mínimo da função, com os itens dados (as outras listas vazias)
CREATE FUNCTION pg_temp.payload(p_itens jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('itens', p_itens, 'regras', '[]'::jsonb, 'tipologias', '[]'::jsonb, 'formulas', '[]'::jsonb, 'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('cruzam', 0, 'nao_cruzam', 0, 'normalizados', 0),
    'detalhes', '[]'::jsonb, 'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb, 'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb,
    'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb, 'otimizacao', '[]'::jsonb)
$$;
CREATE FUNCTION pg_temp.tabela() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.orcamentista_tabela ORDER BY id LIMIT 1 $$;

-- CASO 1: as 12 colunas existem, numeric, nulaveis, sem default, nao geradas
BEGIN;
DO $c$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item'
    AND column_name IN ('cred_icms_pct','cred_pis_cofins_pct','cred_ibs_pct','cred_cbs_pct','cred_ipi_pct','nc_ipi_pct','nc_icms_st_pct','nc_difal_pct','nc_is_pct','credito_pct','credito_valor','custo_liquido')
    AND data_type = 'numeric' AND is_nullable = 'YES' AND column_default IS NULL AND is_generated = 'NEVER';
  IF n = 12 THEN RAISE NOTICE 'ok: caso 1 — as 12 colunas, numeric, NULL, sem default, nao geradas'; ELSE RAISE EXCEPTION 'FALHOU caso 1: % de 12', n; END IF;
END $c$;
ROLLBACK;

-- CASO 2: as linhas de antes ficam com as 12 NULL (nada foi semeado com 0) e as colunas de antes nao mudam de valor
BEGIN;
DO $c$ DECLARE n int; t int; BEGIN
  SELECT count(*), count(*) FILTER (WHERE cred_icms_pct IS NULL AND cred_pis_cofins_pct IS NULL AND cred_ibs_pct IS NULL AND cred_cbs_pct IS NULL AND cred_ipi_pct IS NULL
    AND nc_ipi_pct IS NULL AND nc_icms_st_pct IS NULL AND nc_difal_pct IS NULL AND nc_is_pct IS NULL AND credito_pct IS NULL AND credito_valor IS NULL AND custo_liquido IS NULL)
    INTO t, n FROM public.orcamentista_tabela_item;
  IF t > 0 AND n = t AND (SELECT md5(string_agg(id::text || coalesce(ipi::text,'~') || coalesce(aliquota_interna_pct::text,'~') || coalesce(custo::text,'~'), ',' ORDER BY id)) FROM public.orcamentista_tabela_item) = (SELECT v FROM antes_da_migracao)
  THEN RAISE NOTICE 'ok: caso 2 — as % linhas de antes ficam com as 12 colunas NULL, e ipi, aliquota_interna_pct e custo iguais', t;
  ELSE RAISE EXCEPTION 'FALHOU caso 2: % de % linhas com as 12 NULL, ou as colunas de antes mudaram', n, t; END IF;
END $c$;
ROLLBACK;

-- CASO 3: os dois IPIs preenchidos na mesma linha: recusa 23514 pela CHECK do IPI; um so, de cada lado, entra
BEGIN;
DO $c$ BEGIN
  BEGIN
    INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, cred_ipi_pct, nc_ipi_pct) VALUES (pg_temp.tabela(), 'H3-AMBOS', 5, 5);
    RAISE EXCEPTION 'FALHOU caso 3: os dois IPIs entraram';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%orcamentista_tabela_item_ipi_de_um_lado%' THEN RAISE EXCEPTION 'FALHOU caso 3: outra CHECK: %', SQLERRM; END IF;
  END;
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, cred_ipi_pct) VALUES (pg_temp.tabela(), 'H3-CRED', 5);
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, nc_ipi_pct) VALUES (pg_temp.tabela(), 'H3-NC', 5);
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, cred_ipi_pct, nc_ipi_pct) VALUES (pg_temp.tabela(), 'H3-ZERO', 0, NULL);
  RAISE NOTICE 'ok: caso 3 — os dois IPIs na mesma linha sao recusados (23514); um so, de cada lado, entra';
END $c$;
ROLLBACK;

-- CASO 4: a faixa: cada um dos 10 percentuais recusa 101 e -0.01; 0 e 100 entram; NULL entra; credito_valor e custo_liquido nao tem faixa
BEGIN;
DO $c$ DECLARE c text; v numeric; k int := 0; BEGIN
  FOREACH c IN ARRAY ARRAY['cred_icms_pct','cred_pis_cofins_pct','cred_ibs_pct','cred_cbs_pct','cred_ipi_pct','nc_ipi_pct','nc_icms_st_pct','nc_difal_pct','nc_is_pct','credito_pct'] LOOP
    FOREACH v IN ARRAY ARRAY[101, -0.01, 100.0001] LOOP
      k := k + 1;
      BEGIN
        EXECUTE format('INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, %I) VALUES ($1, $2, $3)', c) USING pg_temp.tabela(), 'H4-' || k, v;
        RAISE EXCEPTION 'FALHOU caso 4: % = % entrou', c, v;
      EXCEPTION WHEN check_violation THEN
        IF SQLERRM NOT LIKE '%orcamentista_tabela_item_percentual_na_faixa%' THEN RAISE EXCEPTION 'FALHOU caso 4: outra CHECK em %: %', c, SQLERRM; END IF;
      END;
    END LOOP;
    FOREACH v IN ARRAY ARRAY[0, 100, 17.5] LOOP
      k := k + 1;
      EXECUTE format('INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, %I) VALUES ($1, $2, $3)', c) USING pg_temp.tabela(), 'H4-' || k, v;
    END LOOP;
  END LOOP;
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, credito_valor, custo_liquido) VALUES (pg_temp.tabela(), 'H4-RS', 5000, 123456.78);
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo) VALUES (pg_temp.tabela(), 'H4-NULO');
  RAISE NOTICE 'ok: caso 4 — os 10 percentuais recusam 101, -0,01 e 100,0001 e aceitam 0, 100 e 17,5; R$ e NULL sem faixa';
END $c$;
ROLLBACK;

-- CASO 5: a funcao grava as 12 como vieram: 0 fica 0, NULL (chave presente com null) fica NULL, e os valores batem
BEGIN;
DO $c$ DECLARE r record; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
    -- custo 200: o credito em % (26,25), em R$ (52,50) e o liquido (147,50) sao tres numeros diferentes — uma coluna trocada com outra aparece
    jsonb_build_object('codigo', 'H5-A', 'custo', 200, 'cred_icms_pct', 12, 'cred_pis_cofins_pct', 9.25, 'cred_ibs_pct', 0, 'cred_cbs_pct', null, 'cred_ipi_pct', 5,
      'nc_ipi_pct', null, 'nc_icms_st_pct', 3.5, 'nc_difal_pct', 0, 'nc_is_pct', null, 'credito_pct', 26.25, 'credito_valor', 52.5, 'custo_liquido', 147.5))));
  SELECT * INTO r FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'H5-A';
  IF r.cred_icms_pct = 12 AND r.cred_pis_cofins_pct = 9.25 AND r.cred_ibs_pct = 0 AND r.cred_cbs_pct IS NULL AND r.cred_ipi_pct = 5
     AND r.nc_ipi_pct IS NULL AND r.nc_icms_st_pct = 3.5 AND r.nc_difal_pct = 0 AND r.nc_is_pct IS NULL
     AND r.credito_pct = 26.25 AND r.credito_valor = 52.5 AND r.custo_liquido = 147.5 AND r.custo = 200
     AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela()) = 1
  THEN RAISE NOTICE 'ok: caso 5 — a funcao grava as 12 como vieram: 0 fica 0, null fica NULL';
  ELSE RAISE EXCEPTION 'FALHOU caso 5: %', row_to_json(r); END IF;
END $c$;
ROLLBACK;

-- CASO 6: o payload de antes (sem as 12 chaves) continua valendo: as 12 ficam NULL, nunca 0
BEGIN;
DO $c$ DECLARE r record; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'H6-A', 'custo', 50, 'ipi', 5))));
  SELECT * INTO r FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'H6-A';
  IF r.ipi = 5 AND r.custo = 50 AND num_nulls(r.cred_icms_pct, r.cred_pis_cofins_pct, r.cred_ibs_pct, r.cred_cbs_pct, r.cred_ipi_pct, r.nc_ipi_pct, r.nc_icms_st_pct,
       r.nc_difal_pct, r.nc_is_pct, r.credito_pct, r.credito_valor, r.custo_liquido) = 12
  THEN RAISE NOTICE 'ok: caso 6 — o payload sem as 12 chaves grava as 12 NULL (e o ipi como antes)';
  ELSE RAISE EXCEPTION 'FALHOU caso 6: %', row_to_json(r); END IF;
END $c$;
ROLLBACK;

-- CASO 7: o payload com os dois IPIs num item: a importacao INTEIRA e desfeita (os itens de antes continuam), e o erro nomeia a CHECK
BEGIN;
DO $c$ DECLARE antes text; depois text; BEGIN
  SELECT md5(coalesce(string_agg(codigo, ',' ORDER BY codigo), '')) INTO antes FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela();
  BEGIN
    PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
      jsonb_build_object('codigo', 'H7-OK', 'custo', 10), jsonb_build_object('codigo', 'H7-DOIS', 'custo', 10, 'cred_ipi_pct', 5, 'nc_ipi_pct', 5))));
    RAISE EXCEPTION 'FALHOU caso 7: a importacao com os dois IPIs passou';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%orcamentista_tabela_item_ipi_de_um_lado%' THEN RAISE EXCEPTION 'FALHOU caso 7: outro erro: %', SQLERRM; END IF;
  END;
  SELECT md5(coalesce(string_agg(codigo, ',' ORDER BY codigo), '')) INTO depois FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela();
  IF antes = depois THEN RAISE NOTICE 'ok: caso 7 — os dois IPIs no payload desfazem a importacao inteira, e os itens de antes ficam';
  ELSE RAISE EXCEPTION 'FALHOU caso 7: os itens mudaram'; END IF;
END $c$;
ROLLBACK;

-- CASO 8: reimportar regrava as 12 com o que o arquivo novo traz (o que nao vem fica NULL, nao o valor de antes)
BEGIN;
DO $c$ DECLARE r record; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'H8', 'custo', 10, 'cred_icms_pct', 12, 'custo_liquido', 8.8))));
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'H8', 'custo', 10, 'cred_icms_pct', 7))));
  SELECT * INTO r FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'H8';
  IF r.cred_icms_pct = 7 AND r.custo_liquido IS NULL THEN RAISE NOTICE 'ok: caso 8 — a reimportacao regrava as 12 pelo arquivo novo';
  ELSE RAISE EXCEPTION 'FALHOU caso 8: %', row_to_json(r); END IF;
END $c$;
ROLLBACK;

-- CASO 9: a funcao manteve SECURITY DEFINER, search_path, statement_timeout de 35 s, e o EXECUTE so de service_role (com o privilegio padrao de producao)
BEGIN;
DO $c$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'importar_conteudo_da_tabela' AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public','statement_timeout=35s'])
     AND NOT has_function_privilege('anon', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'execute')
     AND NOT has_function_privilege('authenticated', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'execute')
     AND has_function_privilege('service_role', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'execute')
  THEN RAISE NOTICE 'ok: caso 9 — SECURITY DEFINER, search_path, statement_timeout 35s, EXECUTE so de service_role';
  ELSE RAISE EXCEPTION 'FALHOU caso 9: %', (SELECT row(p.prosecdef, p.proconfig, p.proacl)::text FROM pg_proc p WHERE p.proname = 'importar_conteudo_da_tabela'); END IF;
END $c$;
ROLLBACK;

-- CASO 10: nenhuma das 12 tem default, e um INSERT sem elas grava NULL (nenhum 0 escondido)
BEGIN;
DO $c$ DECLARE r record; BEGIN
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo) VALUES (pg_temp.tabela(), 'H10');
  SELECT * INTO r FROM public.orcamentista_tabela_item WHERE codigo = 'H10';
  IF num_nulls(r.cred_icms_pct, r.cred_pis_cofins_pct, r.cred_ibs_pct, r.cred_cbs_pct, r.cred_ipi_pct, r.nc_ipi_pct, r.nc_icms_st_pct,
       r.nc_difal_pct, r.nc_is_pct, r.credito_pct, r.credito_valor, r.custo_liquido) = 12
  THEN RAISE NOTICE 'ok: caso 10 — INSERT sem as 12 grava NULL'; ELSE RAISE EXCEPTION 'FALHOU caso 10: %', row_to_json(r); END IF;
END $c$;
ROLLBACK;
