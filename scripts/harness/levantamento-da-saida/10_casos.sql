-- Os casos da 20261118000005, depois de aplicada DUAS vezes. Cada um diz `ok: ...` ou `FALHOU ...`.
\set ON_ERROR_STOP 0
-- CASO 1: a coluna existe, uuid, nula, sem default; nenhuma linha de antes mudou (as 12 continuam nulas)
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name = 'orcamentista_mensagem' AND column_name = 'levantamento_id' AND data_type = 'uuid' AND is_nullable = 'YES' AND column_default IS NULL) = 1
     AND (SELECT count(*) FROM public.orcamentista_mensagem WHERE levantamento_id IS NULL) = 12
  THEN RAISE NOTICE 'ok: caso 1 — a coluna uuid nula, e as 12 linhas de antes nulas'; ELSE RAISE EXCEPTION 'FALHOU caso 1'; END IF;
END $$;
-- CASO 2: a saída grava o levantamento da MESMA empresa
DO $$ BEGIN
  INSERT INTO public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, levantamento_id)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'saida', 'o arquivo do 24', 'e0000000-0000-0000-0000-000000000024');
  RAISE NOTICE 'ok: caso 2 — a saida grava o levantamento da mesma empresa';
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'FALHOU caso 2: %', SQLERRM; END $$;
-- CASO 3: o levantamento de OUTRA empresa é recusado pela FK (23503)
DO $$ BEGIN
  INSERT INTO public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto, levantamento_id)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'saida', 'x', 'e0000000-0000-0000-0000-000000000099');
  RAISE EXCEPTION 'FALHOU caso 3: aceitou o levantamento de outra empresa';
EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok: caso 3 — o levantamento de outra empresa e recusado (23503)'; END $$;
-- CASO 4: apagar o levantamento esvazia SÓ a coluna: a mensagem fica, da mesma empresa
DO $$ BEGIN
  DELETE FROM public.orcamentista_levantamento WHERE id = 'e0000000-0000-0000-0000-000000000024';
  IF (SELECT count(*) FROM public.orcamentista_mensagem WHERE texto = 'o arquivo do 24' AND levantamento_id IS NULL AND tenant_id = 'a0000000-0000-0000-0000-000000000001') = 1
  THEN RAISE NOTICE 'ok: caso 4 — apagar o levantamento anula so a coluna, e a mensagem continua da empresa'; ELSE RAISE EXCEPTION 'FALHOU caso 4'; END IF;
END $$;
-- CASO 5: a entrada sem levantamento continua valendo
DO $$ BEGIN
  INSERT INTO public.orcamentista_mensagem (tenant_id, conversa_id, direcao, texto) VALUES ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'entrada', 'Sim');
  RAISE NOTICE 'ok: caso 5 — a entrada sem levantamento continua valendo';
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'FALHOU caso 5: %', SQLERRM; END $$;
