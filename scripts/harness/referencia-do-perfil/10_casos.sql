-- CASOS da migracao 20261124000002 (a referencia do perfil no item da tabela). Cada caso roda numa transacao DESFEITA, e diz "ok:" ou "FALHOU".
\set ON_ERROR_STOP 0
CREATE FUNCTION pg_temp.payload(p_itens jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('itens', p_itens, 'regras', '[]'::jsonb, 'tipologias', '[]'::jsonb, 'formulas', '[]'::jsonb, 'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('cruzam', 0, 'nao_cruzam', 0, 'normalizados', 0),
    'detalhes', '[]'::jsonb, 'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb, 'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb,
    'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb, 'otimizacao', '[]'::jsonb)
$$;
CREATE FUNCTION pg_temp.tabela() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.orcamentista_tabela ORDER BY id LIMIT 1 $$;
CREATE FUNCTION pg_temp.outra() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.orcamentista_tabela ORDER BY id OFFSET 1 LIMIT 1 $$;

-- CASO 1: a coluna text, nulavel, sem default; a CHECK; o indice unico parcial com NULLS NOT DISTINCT
BEGIN;
DO $c$ DECLARE n int; d text; BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item'
    AND column_name = 'referencia_perfil' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL;
  SELECT indexdef INTO d FROM pg_indexes WHERE indexname = 'orcamentista_tabela_item_referencia_perfil_cor_key';
  IF n = 1 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_tabela_item_referencia_perfil_forma')
     AND d LIKE 'CREATE UNIQUE INDEX %(tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT WHERE (referencia_perfil IS NOT NULL)'
  THEN RAISE NOTICE 'ok: caso 1 - referencia_perfil text, nula, sem default, a CHECK e o indice unico parcial'; ELSE RAISE EXCEPTION 'FALHOU caso 1: % %', n, d; END IF;
END $c$;
ROLLBACK;

-- CASO 2: a importacao grava a referencia como veio; sem a chave, NULL; e o resto da linha (a cor e o codigo_wvetro inclusive) igual
BEGIN;
DO $c$ DECLARE a record; b record; v record; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
    jsonb_build_object('codigo', '9641', 'referencia_perfil', 'HF88S', 'descricao', 'HF88S - MARCO CORRER DUPLO COM ABA - BRANCO', 'segmento', 'Perfil PVC', 'cor', 'BRANCO', 'custo', 95, 'cred_icms_pct', 12),
    jsonb_build_object('codigo', '1023/WOLFF', 'segmento', 'Reforco', 'custo', 30),
    jsonb_build_object('codigo', 'LJ-VFIN05', 'codigo_wvetro', 'VFIN05', 'cor', 'INCOLOR', 'custo', 70))));
  SELECT * INTO a FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = '9641';
  SELECT * INTO b FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = '1023/WOLFF';
  SELECT * INTO v FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'LJ-VFIN05';
  IF a.referencia_perfil = 'HF88S' AND a.cor = 'BRANCO' AND a.segmento = 'Perfil PVC' AND a.custo = 95 AND a.cred_icms_pct = 12 AND a.codigo_wvetro IS NULL
     AND b.referencia_perfil IS NULL AND b.custo = 30 AND v.codigo_wvetro = 'VFIN05' AND v.referencia_perfil IS NULL AND v.cor = 'INCOLOR'
     AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela()) = 3
  THEN RAISE NOTICE 'ok: caso 2 - a referencia gravada como veio; sem a chave, NULL; a cor e o codigo_wvetro iguais'; ELSE RAISE EXCEPTION 'FALHOU caso 2: % / % / %', row_to_json(a), row_to_json(b), row_to_json(v); END IF;
END $c$;
ROLLBACK;

-- CASO 3: a reimportacao nao perde a referencia (a funcao apaga e regrava: a referencia esta na regravacao)
BEGIN;
DO $c$ DECLARE c text; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'X', 'referencia_perfil', 'GB34', 'cor', 'BRANCO', 'custo', 1))));
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'X', 'referencia_perfil', 'GB34', 'cor', 'BRANCO', 'custo', 2))));
  SELECT referencia_perfil INTO c FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'X';
  IF c = 'GB34' THEN RAISE NOTICE 'ok: caso 3 - a reimportacao regrava a referencia'; ELSE RAISE EXCEPTION 'FALHOU caso 3: %', c; END IF;
END $c$;
ROLLBACK;

-- CASO 4: a CHECK recusa a referencia vazia, so de espaco, com espaco na ponta, ou com a BARRA do sufixo do fornecedor
BEGIN;
DO $c$ DECLARE v text; n int := 0; BEGIN
  FOREACH v IN ARRAY ARRAY['', '   ', ' HF88S', 'HF88S ', 'HF88S/WOLFF', '/WOLFF', 'HF/88S'] LOOP
    BEGIN
      INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, referencia_perfil) VALUES (pg_temp.tabela(), 'V' || n, v);
    EXCEPTION WHEN check_violation THEN n := n + 1;
    END;
  END LOOP;
  IF n = 7 THEN RAISE NOTICE 'ok: caso 4 - a referencia vazia, de espaco, com espaco na ponta ou com a barra do sufixo e recusada pela CHECK'; ELSE RAISE EXCEPTION 'FALHOU caso 4: % de 7 recusadas', n; END IF;
END $c$;
ROLLBACK;

-- CASO 5: os itens de antes ficam intactos (a migracao nao grava dado), com a referencia NULL
BEGIN;
DO $c$ BEGIN
  IF (SELECT md5(string_agg(id::text || coalesce(custo::text,'~') || coalesce(segmento,'~') || coalesce(cor,'~') || coalesce(codigo_wvetro,'~'), ',' order by id)) FROM public.orcamentista_tabela_item)
     = (SELECT v FROM public.antes_da_referencia)
     AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE referencia_perfil IS NULL) = (SELECT n FROM public.antes_da_referencia)
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

-- CASO 7: a MESMA referencia em VARIAS cores na mesma tabela entra (o HF112 tem uma linha por cor) - e o que a `codigo_wvetro` nao deixaria
BEGIN;
DO $c$ BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
    jsonb_build_object('codigo', '9641', 'referencia_perfil', 'HF88S', 'cor', 'BRANCO', 'custo', 1),
    jsonb_build_object('codigo', '96420', 'referencia_perfil', 'HF88S', 'cor', 'PRETO TEXTURADO', 'custo', 2),
    jsonb_build_object('codigo', '96421', 'referencia_perfil', 'HF88S', 'cor', 'AMADEIRADO GOLDEN OAK', 'custo', 3))));
  IF (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND referencia_perfil = 'HF88S') = 3
  THEN RAISE NOTICE 'ok: caso 7 - a mesma referencia em tres cores entra na mesma tabela'; ELSE RAISE EXCEPTION 'FALHOU caso 7'; END IF;
END $c$;
ROLLBACK;

-- CASO 8: a mesma referencia + a MESMA cor na mesma tabela - o indice recusa, e a importacao inteira nao grava nada
BEGIN;
DO $c$ DECLARE n int; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'ANTES', 'referencia_perfil', 'GB34', 'cor', 'BRANCO', 'custo', 1))));
  BEGIN
    PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
      jsonb_build_object('codigo', '9641', 'referencia_perfil', 'HF88S', 'cor', 'BRANCO', 'custo', 1), jsonb_build_object('codigo', '9641B', 'referencia_perfil', 'HF88S', 'cor', 'BRANCO', 'custo', 2))));
    RAISE EXCEPTION 'FALHOU caso 8: a referencia + cor repetida entrou';
  EXCEPTION WHEN unique_violation THEN
    SELECT count(*) INTO n FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'ANTES' AND referencia_perfil = 'GB34';
    IF n = 1 AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela()) = 1
    THEN RAISE NOTICE 'ok: caso 8 - a referencia + cor repetida na mesma tabela e recusada, e o conteudo de antes fica'; ELSE RAISE EXCEPTION 'FALHOU caso 8: o conteudo de antes nao ficou'; END IF;
  END;
END $c$;
ROLLBACK;

-- CASO 9: a referencia SEM cor repetida tambem colide (NULLS NOT DISTINCT); a mesma referencia + cor em tabelas DIFERENTES entra; sem referencia nada colide
BEGIN;
DO $c$ DECLARE colidiu boolean := false; BEGIN
  IF pg_temp.outra() IS NULL THEN RAISE EXCEPTION 'FALHOU caso 9: a base nao tem duas tabelas'; END IF;
  INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, referencia_perfil, cor) VALUES (pg_temp.tabela(), 'A', 'HF88S', 'BRANCO'), (pg_temp.outra(), 'B', 'HF88S', 'BRANCO'),
    (pg_temp.tabela(), 'SEM-1', NULL, 'BRANCO'), (pg_temp.tabela(), 'SEM-2', NULL, 'BRANCO'), (pg_temp.tabela(), 'R1', '1023', NULL);
  BEGIN
    INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, referencia_perfil, cor) VALUES (pg_temp.tabela(), 'R2', '1023', NULL);
  EXCEPTION WHEN unique_violation THEN colidiu := true;
  END;
  IF colidiu THEN RAISE NOTICE 'ok: caso 9 - a referencia sem cor repetida colide; em tabelas diferentes entra; sem referencia nada colide';
  ELSE RAISE EXCEPTION 'FALHOU caso 9: a referencia sem cor repetida entrou'; END IF;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'FALHOU caso 9: o indice recusou o que devia entrar';
END $c$;
ROLLBACK;

-- CASO 10: a resolucao do material aceita 'referencia', continua aceitando os sete de antes e o nulo, e recusa o que nao esta na lista
BEGIN;
DO $c$ DECLARE v text; n int := 0; recusou boolean := false; BEGIN
  FOREACH v IN ARRAY ARRAY['referencia', 'ponte', 'exato', 'cor', 'nome_tecnico', 'vidro_escolhido', 'vidro_traduzido', 'vidro_padrao'] LOOP
    INSERT INTO public.orcamentista_orcamento_item_material (resolucao) VALUES (v); n := n + 1;
  END LOOP;
  INSERT INTO public.orcamentista_orcamento_item_material (resolucao) VALUES (NULL);
  BEGIN
    INSERT INTO public.orcamentista_orcamento_item_material (resolucao) VALUES ('parecido');
  EXCEPTION WHEN check_violation THEN recusou := true;
  END;
  IF n = 8 AND recusou THEN RAISE NOTICE 'ok: caso 10 - a resolucao aceita referencia e os sete de antes, e recusa o que nao esta na lista'; ELSE RAISE EXCEPTION 'FALHOU caso 10'; END IF;
EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'FALHOU caso 10: a CHECK recusou um valor que devia aceitar (%)', v;
END $c$;
ROLLBACK;

-- CASO 11: as linhas de material de antes ficam intactas
BEGIN;
DO $c$ BEGIN
  IF (SELECT md5(string_agg(id::text || coalesce(resolucao,'~'), ',' order by id)) FROM public.orcamentista_orcamento_item_material) = (SELECT mat FROM public.antes_da_referencia)
     AND (SELECT count(*) FROM public.orcamentista_orcamento_item_material) = 8
  THEN RAISE NOTICE 'ok: caso 11 - as linhas de material de antes intactas'; ELSE RAISE EXCEPTION 'FALHOU caso 11'; END IF;
END $c$;
ROLLBACK;
