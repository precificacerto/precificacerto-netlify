-- HARNESS do levantamento por nome — OS CASOS. Cada caso: `ok: ...` por NOTICE, ou `FALHOU: ...` por
-- EXCEPTION. Tenant A = ...0a, vendedores a1 e a2; tenant B = ...0b, vendedor b1.
CREATE OR REPLACE FUNCTION pg_temp.recusa(sql text, esperado text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE sql;
  RETURN 'ACEITO';
EXCEPTION WHEN OTHERS THEN
  RETURN CASE WHEN SQLSTATE = esperado THEN 'ok' ELSE 'OUTRO ' || SQLSTATE || ': ' || SQLERRM END;
END $f$;

-- CASO 1 — o levantamento em montagem do vendedor a1 entra
DO $$ BEGIN
  INSERT INTO public.orcamentista_levantamento (id, tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Casa do João', 'casa do joao', 'EM_MONTAGEM');
  RAISE NOTICE 'ok: caso 1 — um levantamento EM_MONTAGEM entra';
END $$;

-- CASO 2 — o SEGUNDO em montagem do mesmo vendedor é recusado (o índice parcial)
DO $$ DECLARE r text; BEGIN
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Obra Centro', 'obra centro', 'EM_MONTAGEM')$q$, '23505');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 2 — o segundo EM_MONTAGEM do mesmo vendedor: %', r; END IF;
  RAISE NOTICE 'ok: caso 2 — o segundo EM_MONTAGEM do mesmo vendedor é recusado';
END $$;

-- CASO 3 — o contraste: o mesmo vendedor pode ter outro COMPLETO, e o outro vendedor o seu EM_MONTAGEM
DO $$ BEGIN
  INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Obra Centro', 'obra centro', 'COMPLETO');
  INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 'Loja', 'loja', 'EM_MONTAGEM');
  RAISE NOTICE 'ok: caso 3 — outro COMPLETO do mesmo vendedor e o EM_MONTAGEM de outro vendedor entram';
END $$;

-- CASO 4 — o mesmo nome normalizado do MESMO vendedor é recusado
DO $$ DECLARE r text; BEGIN
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'CASA DO JOAO', 'casa do joao', 'COMPLETO')$q$, '23505');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 4 — o mesmo nome do mesmo vendedor: %', r; END IF;
  RAISE NOTICE 'ok: caso 4 — o mesmo nome normalizado do mesmo vendedor é recusado';
END $$;

-- CASO 5 — o contraste: o mesmo nome de OUTRO vendedor do mesmo tenant entra (decisão 2)
DO $$ BEGIN
  INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 'Casa do João', 'casa do joao', 'COMPLETO');
  RAISE NOTICE 'ok: caso 5 — o mesmo nome de outro vendedor do mesmo tenant entra';
END $$;

-- CASO 6 — o estado é EM_MONTAGEM ou COMPLETO: 'COMPLETA' (o da pre_definicao) é recusado
DO $$ DECLARE r text; BEGIN
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'X', 'x', 'COMPLETA')$q$, '23514');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 6 — estado COMPLETA: %', r; END IF;
  RAISE NOTICE 'ok: caso 6 — estado fora de EM_MONTAGEM/COMPLETO é recusado';
END $$;

-- CASO 7 — o remetente de OUTRO tenant não serve (a FK é composta)
DO $$ DECLARE r text; BEGIN
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000b1', 'Y', 'y', 'COMPLETO')$q$, '23503');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 7 — remetente de outro tenant: %', r; END IF;
  RAISE NOTICE 'ok: caso 7 — o remetente de outro tenant é recusado';
END $$;

-- CASO 8 — o item: entra no levantamento do mesmo tenant; no de outro tenant, não
DO $$ DECLARE r text; BEGIN
  INSERT INTO public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, escolhas)
  VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000101', 1, 'DP-02', 1200, 1000, 1, 'BRANCO', 'Temperado 5mm', '{"ARI": 4}');
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem)
    VALUES ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000101', 2)$q$, '23503');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 8 — item com o tenant trocado: %', r; END IF;
  RAISE NOTICE 'ok: caso 8 — o item entra no levantamento do mesmo tenant, e não no de outro';
END $$;

-- CASO 9 — a ordem é única por levantamento; um item sem nada preenchido entra (NULL = ainda não dito)
DO $$ DECLARE r text; BEGIN
  INSERT INTO public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem)
  VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000101', 2);
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento_item (tenant_id, levantamento_id, ordem)
    VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000101', 2)$q$, '23505');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 9 — ordem repetida: %', r; END IF;
  RAISE NOTICE 'ok: caso 9 — a ordem repetida é recusada, e o item vazio entra';
END $$;

-- CASO 10 — escolhas: objeto passa; lista e número não
DO $$ DECLARE r1 text; r2 text; BEGIN
  r1 := pg_temp.recusa($q$UPDATE public.orcamentista_levantamento_item SET escolhas = '[4, 1]' WHERE ordem = 1$q$, '23514');
  r2 := pg_temp.recusa($q$UPDATE public.orcamentista_levantamento_item SET escolhas = '4' WHERE ordem = 1$q$, '23514');
  IF r1 <> 'ok' OR r2 <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 10 — escolhas lista: %, número: %', r1, r2; END IF;
  RAISE NOTICE 'ok: caso 10 — escolhas que não são objeto são recusadas';
END $$;

-- CASO 11 — apagar o levantamento leva os itens (ON DELETE CASCADE)
DO $$ DECLARE n int; BEGIN
  DELETE FROM public.orcamentista_levantamento WHERE id = '00000000-0000-4000-8000-000000000101';
  SELECT count(*) INTO n FROM public.orcamentista_levantamento_item WHERE levantamento_id = '00000000-0000-4000-8000-000000000101';
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: caso 11 — sobraram % itens', n; END IF;
  RAISE NOTICE 'ok: caso 11 — os itens vão junto com o levantamento';
END $$;

-- CASO 12 — anon e authenticated não leem nem escrevem (perguntado AGINDO como o papel)
DO $$ DECLARE r1 text; r2 text; BEGIN
  SET LOCAL ROLE anon;
  r1 := pg_temp.recusa('SELECT * FROM public.orcamentista_levantamento', '42501');
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  r2 := pg_temp.recusa('SELECT * FROM public.orcamentista_levantamento_item', '42501');
  RESET ROLE;
  IF r1 <> 'ok' OR r2 <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 12 — anon: %, authenticated: %', r1, r2; END IF;
  RAISE NOTICE 'ok: caso 12 — anon e authenticated sem acesso';
END $$;
