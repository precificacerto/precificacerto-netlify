-- HARNESS de várias montagens por remetente (migração 20261105000001) — OS CASOS. Cada caso: `ok: ...` por NOTICE,
-- ou `FALHOU: ...` por EXCEPTION. Tenant A = ...0a, vendedores a1 e a2; tenant B = ...0b, vendedor b1.
CREATE OR REPLACE FUNCTION pg_temp.recusa(sql text, esperado text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE sql;
  RETURN 'ACEITO';
EXCEPTION WHEN OTHERS THEN
  RETURN CASE WHEN SQLSTATE = esperado THEN 'ok' ELSE 'OUTRO ' || SQLSTATE || ': ' || SQLERRM END;
END $f$;

-- CASO 1 — O CASO DA MARIA CRISTINA: o segundo EM_MONTAGEM do MESMO vendedor entra (antes: 23505)
DO $$ BEGIN
  INSERT INTO public.orcamentista_levantamento (id, tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Jorge Koss', 'jorge koss', 'EM_MONTAGEM');
  INSERT INTO public.orcamentista_levantamento (id, tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Maria Cristina', 'maria cristina', 'EM_MONTAGEM');
  IF (SELECT count(*) FROM public.orcamentista_levantamento WHERE remetente_id = '00000000-0000-4000-8000-0000000000a1' AND estado = 'EM_MONTAGEM') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: caso 1 — devia haver 2 EM_MONTAGEM do vendedor a1';
  END IF;
  RAISE NOTICE 'ok: caso 1 — dois EM_MONTAGEM do mesmo vendedor entram (o indice caiu)';
END $$;

-- CASO 2 — o terceiro também; e o antigo não foi tocado
DO $$ BEGIN
  INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Ana', 'ana', 'EM_MONTAGEM');
  IF (SELECT estado FROM public.orcamentista_levantamento WHERE id = '00000000-0000-4000-8000-000000000101') <> 'EM_MONTAGEM' THEN
    RAISE EXCEPTION 'FALHOU: caso 2 — o Jorge Koss devia continuar EM_MONTAGEM';
  END IF;
  RAISE NOTICE 'ok: caso 2 — o terceiro EM_MONTAGEM entra, e o Jorge Koss continua como estava';
END $$;

-- CASO 3 — o que NÃO mudou: o mesmo nome do mesmo vendedor continua recusado (nome_key), em qualquer estado
DO $$ DECLARE r text; BEGIN
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'JORGE KOSS', 'jorge koss', 'COMPLETO')$q$, '23505');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 3 — o mesmo nome do mesmo vendedor: %', r; END IF;
  RAISE NOTICE 'ok: caso 3 — o mesmo nome do mesmo vendedor continua recusado (nome_key nao mudou)';
END $$;

-- CASO 4 — o que NÃO mudou: o CHECK do estado só aceita EM_MONTAGEM e COMPLETO
DO $$ DECLARE r text; BEGIN
  r := pg_temp.recusa($q$INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
    VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a1', 'Bia', 'bia', 'ABANDONADO')$q$, '23514');
  IF r <> 'ok' THEN RAISE EXCEPTION 'FALHOU: caso 4 — o estado ABANDONADO: %', r; END IF;
  RAISE NOTICE 'ok: caso 4 — o estado ABANDONADO continua recusado (o CHECK nao mudou)';
END $$;

-- CASO 5 — o mesmo nome em OUTRO vendedor e em OUTRO tenant entra (como antes)
DO $$ BEGIN
  INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-0000000000a2', 'Jorge Koss', 'jorge koss', 'EM_MONTAGEM');
  INSERT INTO public.orcamentista_levantamento (tenant_id, remetente_id, nome, nome_normalizado, estado)
  VALUES ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000b1', 'Jorge Koss', 'jorge koss', 'EM_MONTAGEM');
  RAISE NOTICE 'ok: caso 5 — o mesmo nome em outro vendedor e em outro tenant entra';
END $$;

-- CASO 6 — o índice não existe, e os outros três e as seis constraints estão lá
DO $$ DECLARE n int; BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'orcamentista_levantamento_um_em_montagem') THEN
    RAISE EXCEPTION 'FALHOU: caso 6 — o indice um_em_montagem ainda existe';
  END IF;
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'orcamentista_levantamento';
  IF n <> 3 THEN RAISE EXCEPTION 'FALHOU: caso 6 — % indices, deviam ser 3', n; END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento'::regclass;
  IF n <> 6 THEN RAISE EXCEPTION 'FALHOU: caso 6 — % constraints, deviam ser 6', n; END IF;
  RAISE NOTICE 'ok: caso 6 — sem o indice um_em_montagem; 3 indices e 6 constraints como antes';
END $$;

-- CASO 7 — o comentário da tabela diz que são vários EM_MONTAGEM
DO $$ BEGIN
  IF obj_description('public.orcamentista_levantamento'::regclass) NOT LIKE '%Varios EM_MONTAGEM por remetente desde 20261105000001%' THEN
    RAISE EXCEPTION 'FALHOU: caso 7 — o comentario da tabela nao foi atualizado';
  END IF;
  RAISE NOTICE 'ok: caso 7 — o comentario da tabela registra a mudanca';
END $$;
