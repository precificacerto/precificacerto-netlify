-- CASOS da migracao 20261123000004 (a cor do item da tabela). Cada caso roda numa transacao DESFEITA, e diz "ok:" ou "FALHOU".
\set ON_ERROR_STOP 0
CREATE FUNCTION pg_temp.payload(p_itens jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('itens', p_itens, 'regras', '[]'::jsonb, 'tipologias', '[]'::jsonb, 'formulas', '[]'::jsonb, 'avisos', '[]'::jsonb,
    'contagens', jsonb_build_object('cruzam', 0, 'nao_cruzam', 0, 'normalizados', 0),
    'detalhes', '[]'::jsonb, 'formulas_da_tipologia', '[]'::jsonb, 'perfis', '[]'::jsonb, 'vidros', '[]'::jsonb, 'baguetes', '[]'::jsonb,
    'insumos', '[]'::jsonb, 'variaveis_da_tipologia', '[]'::jsonb, 'validacoes', '[]'::jsonb, 'otimizacao', '[]'::jsonb)
$$;
CREATE FUNCTION pg_temp.tabela() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.orcamentista_tabela ORDER BY id LIMIT 1 $$;

-- CASO 1: a coluna text, nulavel, sem default; a CHECK
BEGIN;
DO $c$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item'
    AND column_name = 'cor' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL;
  IF n = 1 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_tabela_item_cor_forma')
  THEN RAISE NOTICE 'ok: caso 1 — cor text, nula, sem default, e a CHECK'; ELSE RAISE EXCEPTION 'FALHOU caso 1: %', n; END IF;
END $c$;
ROLLBACK;

-- CASO 2: a importacao grava a cor como veio; sem a chave, NULL; e o resto da linha igual ao de antes
BEGIN;
DO $c$ DECLARE a record; b record; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(
    jsonb_build_object('codigo', 'LJ-VTHNCC06', 'descricao', 'VIDRO TEMPERADO HABITAT NEUTRO CINZA CLARO 06MM', 'segmento', 'Temperado', 'cor', 'NEUTRO CINZA CLARO', 'custo', 169, 'cred_icms_pct', 12),
    jsonb_build_object('codigo', 'LJ-DUP-ARG', 'segmento', 'Duplagem (adicional por m2)', 'custo', 30))));
  SELECT * INTO a FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'LJ-VTHNCC06';
  SELECT * INTO b FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'LJ-DUP-ARG';
  IF a.cor = 'NEUTRO CINZA CLARO' AND a.segmento = 'Temperado' AND a.custo = 169 AND a.cred_icms_pct = 12 AND b.cor IS NULL AND b.custo = 30
     AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela()) = 2
  THEN RAISE NOTICE 'ok: caso 2 — a cor gravada como veio; sem a chave, NULL; o resto da linha igual'; ELSE RAISE EXCEPTION 'FALHOU caso 2: % / %', row_to_json(a), row_to_json(b); END IF;
END $c$;
ROLLBACK;

-- CASO 3: a reimportacao nao perde a cor (a funcao apaga e regrava: a cor esta na regravacao)
BEGIN;
DO $c$ DECLARE c text; BEGIN
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'X', 'cor', 'VERDE', 'custo', 1))));
  PERFORM public.importar_conteudo_da_tabela(pg_temp.tabela(), pg_temp.payload(jsonb_build_array(jsonb_build_object('codigo', 'X', 'cor', 'VERDE', 'custo', 2))));
  SELECT cor INTO c FROM public.orcamentista_tabela_item WHERE tabela_id = pg_temp.tabela() AND codigo = 'X';
  IF c = 'VERDE' THEN RAISE NOTICE 'ok: caso 3 — a reimportacao regrava a cor'; ELSE RAISE EXCEPTION 'FALHOU caso 3: %', c; END IF;
END $c$;
ROLLBACK;

-- CASO 4: a CHECK recusa a cor vazia ou so de espaco
BEGIN;
DO $c$ BEGIN
  BEGIN
    INSERT INTO public.orcamentista_tabela_item (tabela_id, codigo, cor) VALUES (pg_temp.tabela(), 'V', '   ');
    RAISE EXCEPTION 'FALHOU caso 4: a cor so de espaco entrou';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: caso 4 — a cor so de espaco e recusada pela CHECK';
  END;
END $c$;
ROLLBACK;

-- CASO 5: os itens de antes ficam intactos (a migracao nao grava dado), com a cor NULL
BEGIN;
DO $c$ BEGIN
  IF (SELECT md5(string_agg(id::text || coalesce(custo::text,'~') || coalesce(segmento,'~'), ',' order by id)) FROM public.orcamentista_tabela_item)
     = (SELECT v FROM public.antes_da_cor)
     AND (SELECT count(*) FROM public.orcamentista_tabela_item WHERE cor IS NULL) = (SELECT n FROM public.antes_da_cor)
  THEN RAISE NOTICE 'ok: caso 5 — os itens de antes intactos, a cor NULL'; ELSE RAISE EXCEPTION 'FALHOU caso 5'; END IF;
END $c$;
ROLLBACK;

-- CASO 6: a ACL, o SECURITY DEFINER e os SET da funcao como antes
BEGIN;
DO $c$ DECLARE r record; BEGIN
  SELECT proacl::text acl, prosecdef, proconfig INTO r FROM pg_proc WHERE proname = 'importar_conteudo_da_tabela';
  IF r.acl = '{postgres=X/postgres}' AND r.prosecdef AND r.proconfig = ARRAY['search_path=public', 'statement_timeout=35s']
  THEN RAISE NOTICE 'ok: caso 6 — ACL {postgres=X/postgres}, SECURITY DEFINER e os dois SET como antes'; ELSE RAISE EXCEPTION 'FALHOU caso 6: %', row_to_json(r); END IF;
END $c$;
ROLLBACK;
