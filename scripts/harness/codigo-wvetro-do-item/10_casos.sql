-- CASOS da migracao 20261124000001 (a referencia codigo_wvetro do item da tabela). Cada caso roda numa transacao DESFEITA, e diz "ok:" ou "FALHOU".
\set ON_ERROR_STOP 0
CREATE FUNCTION pg_temp.payload(p_itens jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('itens', p_itens, 'regras', '[]'::jsonb, 'tipologias', '[]'::jsonb, 'formulas', '[]'::jsonb, 'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('cruzam', 0, 'nao_cruzam', 0, 'normalizados', 0),
    'detalhes', '[]'::jsonb, 'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb, 'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb,
    'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb, 'otimizacao', '[]'::jsonb)
$$;
CREATE FUNCTION pg_temp.tabela() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.orcamentista_tabela ORDER BY id LIMIT 1 $$;
CREATE FUNCTION pg_temp.outra() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.orcamentista_tabela ORDER BY id OFFSET 1 LIMIT 1 $$;

-- CASO 1: a coluna text, nulavel, sem default; a CHECK; o indice unico parcial
BEGIN;
DO $c$ DECLARE n int; d text; BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item'
    AND column_name = 'codigo_wvetro' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL;
  SELECT indexdef INTO d FROM pg_indexes WHERE indexname = 'orcamentista_tabela_item_codigo_wvetro_key';
  IF n = 1 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_tabela_item_codigo_wvetro_forma')
     AND d LIKE 'CREATE UNIQUE INDEX %(tabela_id, codigo_wvetro) WHERE (codigo_wvetro IS NOT NULL)'
  THEN RAISE NOTICE 'ok: caso 1 - codigo_wvetro text, nula, sem default, a CHECK e o indice unico parcial'; ELSE RAISE EXCEPTION 'FALHOU caso 1: % %', n, d; END IF;
END $c$;
ROLLBACK;

-- CASO 2: a importacao grava a referencia como veio; sem a chave, NULL; e o resto da linha (a cor inclusive) igual ao de antes
BEGIN;
DO $c$ DECLARE a record; b record; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
    jsonb_build_object('codigo', 'LJ-VFIN05', 'codigo_wvetro', 'VFIN05', 'descricao', 'VIDRO FLOAT INCOLOR 05MM', 'segmento', 'Float', 'cor', 'INCOLOR', 'custo', 95, 'cred_icms_pct', 12),
    jsonb_build_object('codigo', 'LJ-DUP-ARG', 'segmento', 'Duplagem (adicional por m2)', 'custo', 30))));
  SELECT * INTO a FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'LJ-VFIN05';
  SELECT * INTO b FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'LJ-DUP-ARG';
  IF a.codigo_wvetro = 'VFIN05' AND a.cor = 'INCOLOR' AND a.segmento = 'Float' AND a.custo = 95 AND a.cred_icms_pct = 12 AND b.codigo_wvetro IS NULL AND b.custo = 30
     AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela()) = 2
  THEN RAISE NOTICE 'ok: caso 2 - a referencia gravada como veio; sem a chave, NULL; o resto da linha igual'; ELSE RAISE EXCEPTION 'FALHOU caso 2: % / %', row_to_json(a), row_to_json(b); END IF;
END $c$;
ROLLBACK;

-- CASO 3: a reimportacao nao perde a referencia (a funcao apaga e regrava: a referencia esta na regravacao)
BEGIN;
DO $c$ DECLARE c text; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'X', 'codigo_wvetro', 'VTIN06', 'custo', 1))));
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'X', 'codigo_wvetro', 'VTIN06', 'custo', 2))));
  SELECT codigo_wvetro INTO c FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'X';
  IF c = 'VTIN06' THEN RAISE NOTICE 'ok: caso 3 - a reimportacao regrava a referencia'; ELSE RAISE EXCEPTION 'FALHOU caso 3: %', c; END IF;
END $c$;
ROLLBACK;

-- CASO 4: a CHECK recusa a referencia vazia, so de espaco, ou com espaco na ponta
BEGIN;
DO $c$ DECLARE v text; n int := 0; BEGIN
  FOREACH v IN ARRAY ARRAY['', '   ', ' VFIN05', 'VFIN05 '] LOOP
    BEGIN
      INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, codigo_wvetro) VALUES (pg_temp.tabela(), 'V' || n, v);
    EXCEPTION WHEN check_violation THEN n := n + 1;
    END;
  END LOOP;
  IF n = 4 THEN RAISE NOTICE 'ok: caso 4 - a referencia vazia, so de espaco ou com espaco na ponta e recusada pela CHECK'; ELSE RAISE EXCEPTION 'FALHOU caso 4: % de 4 recusadas', n; END IF;
END $c$;
ROLLBACK;

-- CASO 5: os itens de antes ficam intactos (a migracao nao grava dado), com a referencia NULL
BEGIN;
DO $c$ BEGIN
  IF (SELECT md5(string_agg(id::text || coalesce(custo::text,'~') || coalesce(segmento,'~') || coalesce(cor,'~'), ',' order by id)) FROM public.orcamentista_tabela_item)
     = (SELECT v FROM public.antes_da_referencia)
     AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE codigo_wvetro IS NULL) = (SELECT n FROM public.antes_da_referencia)
     AND (SELECT n FROM public.antes_da_referencia) >= 5
  THEN RAISE NOTICE 'ok: caso 5 - os itens de antes intactos, a referencia NULL'; ELSE RAISE EXCEPTION 'FALHOU caso 5'; END IF;
END $c$;
ROLLBACK;

-- CASO 6: a ACL, o SECURITY DEFINER e os SET da funcao como antes
BEGIN;
DO $c$ DECLARE r record; BEGIN
  SELECT proacl::text acl, prosecdef, proconfig INTO r FROM pg_proc WHERE proname = 'importar_conteudo_da_tabela';
  IF r.acl = '{postgres=X/postgres}' AND r.prosecdef AND r.proconfig = ARRAY['search_path=public', 'statement_timeout=35s']
  THEN RAISE NOTICE 'ok: caso 6 - ACL {postgres=X/postgres}, SECURITY DEFINER e os dois SET como antes'; ELSE RAISE EXCEPTION 'FALHOU caso 6: %', row_to_json(r); END IF;
END $c$;
ROLLBACK;

-- CASO 7: duas linhas com a MESMA referencia na mesma tabela - o indice recusa, e a importacao inteira nao grava nada
BEGIN;
DO $c$ DECLARE n int; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'ANTES', 'codigo_wvetro', 'VBO04', 'custo', 1))));
  BEGIN
    PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
      jsonb_build_object('codigo', 'LJ-A', 'codigo_wvetro', 'VFIN05', 'custo', 1), jsonb_build_object('codigo', 'LJ-B', 'codigo_wvetro', 'VFIN05', 'custo', 2))));
    RAISE EXCEPTION 'FALHOU caso 7: a referencia repetida entrou';
  EXCEPTION WHEN unique_violation THEN
    SELECT count(*) INTO n FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'ANTES' AND codigo_wvetro = 'VBO04';
    IF n = 1 AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela()) = 1
    THEN RAISE NOTICE 'ok: caso 7 - a referencia repetida na mesma tabela e recusada, e o conteudo de antes fica'; ELSE RAISE EXCEPTION 'FALHOU caso 7: o conteudo de antes nao ficou'; END IF;
  END;
END $c$;
ROLLBACK;

-- CASO 8: a mesma referencia em tabelas DIFERENTES entra (a grafia e a mesma em todos os fornecedores), e varias linhas sem referencia tambem
BEGIN;
DO $c$ BEGIN
  IF pg_temp.outra() IS NULL THEN RAISE EXCEPTION 'FALHOU caso 8: a base nao tem duas tabelas'; END IF;
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, codigo_wvetro) VALUES (pg_temp.tabela(), 'LJ-VFIN05', 'VFIN05'), (pg_temp.outra(), 'ES-VFIN05', 'VFIN05'),
    (pg_temp.tabela(), 'SEM-1', NULL), (pg_temp.tabela(), 'SEM-2', NULL);
  RAISE NOTICE 'ok: caso 8 - a mesma referencia em duas tabelas entra, e linhas sem referencia nao colidem';
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'FALHOU caso 8: o indice recusou o que devia entrar';
END $c$;
ROLLBACK;
