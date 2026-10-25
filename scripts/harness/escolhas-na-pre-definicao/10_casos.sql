-- HARNESS da coluna escolhas — OS CASOS. Cada caso: `ok: ...` por NOTICE, ou `FALHOU: ...` por EXCEPTION.

-- CASO 1 — a coluna é jsonb, nulável e sem default
DO $$
DECLARE t text; n text; d text;
BEGIN
  SELECT data_type, is_nullable, column_default INTO t, n, d FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_pre_definicao' AND column_name = 'escolhas';
  IF t IS DISTINCT FROM 'jsonb' OR n IS DISTINCT FROM 'YES' OR d IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: caso 1 — escolhas é %, nulável %, default %', t, n, d;
  END IF;
  RAISE NOTICE 'ok: caso 1 — escolhas jsonb, nulável, sem default';
END $$;

-- CASO 2 — a linha que já existia fica com escolhas NULL: nada foi suposto
DO $$
DECLARE v jsonb; e text;
BEGIN
  SELECT escolhas, estado INTO v, e FROM public.orcamentista_pre_definicao WHERE id = '00000000-0000-4000-8000-0000000000a1';
  IF v IS NOT NULL OR e IS DISTINCT FROM 'COMPLETA' THEN
    RAISE EXCEPTION 'FALHOU: caso 2 — a linha existente ficou com escolhas % e estado %', v, e;
  END IF;
  RAISE NOTICE 'ok: caso 2 — a linha existente ficou com escolhas NULL e o estado intacto';
END $$;

-- CASO 3 — a CHECK: objeto passa, NULL passa, lista e número não
DO $$
DECLARE recusou_lista boolean := false; recusou_numero boolean := false;
BEGIN
  UPDATE public.orcamentista_pre_definicao SET escolhas = '{"ARI": 4, "ARE": 1}' WHERE id = '00000000-0000-4000-8000-0000000000a1';
  UPDATE public.orcamentista_pre_definicao SET escolhas = NULL WHERE id = '00000000-0000-4000-8000-0000000000a1';
  BEGIN
    UPDATE public.orcamentista_pre_definicao SET escolhas = '[4, 1]' WHERE id = '00000000-0000-4000-8000-0000000000a1';
  EXCEPTION WHEN check_violation THEN recusou_lista := true;
  END;
  BEGIN
    UPDATE public.orcamentista_pre_definicao SET escolhas = '4' WHERE id = '00000000-0000-4000-8000-0000000000a1';
  EXCEPTION WHEN check_violation THEN recusou_numero := true;
  END;
  IF NOT recusou_lista OR NOT recusou_numero THEN
    RAISE EXCEPTION 'FALHOU: caso 3 — recusou lista %, recusou número %', recusou_lista, recusou_numero;
  END IF;
  RAISE NOTICE 'ok: caso 3 — objeto e NULL passam; lista e número são recusados pela CHECK';
END $$;

-- CASO 4 — o COMMENT da coluna está lá e diz o formato
DO $$
DECLARE c text;
BEGIN
  SELECT col_description('public.orcamentista_pre_definicao'::regclass,
           (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.orcamentista_pre_definicao'::regclass AND attname = 'escolhas')) INTO c;
  IF c IS NULL OR strpos(c, 'VARIAVEL') = 0 THEN
    RAISE EXCEPTION 'FALHOU: caso 4 — o COMMENT é %', c;
  END IF;
  RAISE NOTICE 'ok: caso 4 — o COMMENT diz o formato';
END $$;
