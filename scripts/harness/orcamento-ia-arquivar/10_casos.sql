-- Casos da 20261111000001 depois de aplicada duas vezes. Cada caso diz "ok: <nome>" ou "FALHOU: <nome>".
\set QUIET on
CREATE OR REPLACE FUNCTION pg_temp.caso(nome text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok THEN RAISE NOTICE 'ok: %', nome; ELSE RAISE NOTICE 'FALHOU: %', nome; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.recusa(sql text, codigo text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE = codigo; END $$;
CREATE OR REPLACE FUNCTION pg_temp.passa(sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN true; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'erro inesperado: % %', SQLSTATE, SQLERRM; RETURN false; END $$;

-- o orcamento semeado ANTES da migracao (run.sh), com venda e interna: a migracao nao o tocou
SELECT pg_temp.caso('1a - o orcamento de antes nasce ATIVO: deleted_at e deleted_by nulos',
  (SELECT deleted_at IS NULL AND deleted_by IS NULL FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-00000000000a'));
SELECT pg_temp.caso('1b - as duas colunas: timestamptz e uuid, nulas, sem default',
  (SELECT count(*) = 2 FROM information_schema.columns WHERE table_name = 'orcamentista_orcamento' AND is_nullable = 'YES' AND column_default IS NULL
     AND ((column_name = 'deleted_at' AND data_type = 'timestamp with time zone') OR (column_name = 'deleted_by' AND data_type = 'uuid'))));
SELECT pg_temp.caso('2a - arquivar SEM autor e recusado',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514'));
SELECT pg_temp.caso('2b - autor SEM data e recusado',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET deleted_by = gen_random_uuid() WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514'));
SELECT pg_temp.caso('2c - arquivar com data e autor passa',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento SET deleted_at = now(), deleted_by = gen_random_uuid() WHERE id = '00000000-0000-0000-0000-00000000000a'$q$));
SELECT pg_temp.caso('2d - o arquivado continua com venda, interna, itens e numero',
  (SELECT valor_venda = 120.47 AND valor_operacao_interna = 100.00 AND numero = 1 FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-00000000000a')
  AND (SELECT count(*) = 1 FROM public.orcamentista_orcamento_item WHERE orcamento_id = '00000000-0000-0000-0000-00000000000a'));
SELECT pg_temp.caso('2e - o numero do arquivado continua tomado: outro orcamento com o mesmo numero e recusado',
  pg_temp.recusa($q$INSERT INTO public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por) VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', 'Orc B', 1, 'manual', gen_random_uuid())$q$, '23505'));
SELECT pg_temp.caso('2f - desarquivar (os dois nulos juntos) passa',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento SET deleted_at = NULL, deleted_by = NULL WHERE id = '00000000-0000-0000-0000-00000000000a'$q$));
SELECT pg_temp.caso('3a - deleted_by sem chave estrangeira (o padrao de criado_por): um autor qualquer passa',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento SET deleted_at = now(), deleted_by = '00000000-0000-0000-0000-00000000dead' WHERE id = '00000000-0000-0000-0000-00000000000a'$q$));
SELECT pg_temp.caso('4a - 31 colunas e 53 constraints nas duas tabelas',
  (SELECT count(*) = 31 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento')
  AND (SELECT count(*) = 53 FROM pg_constraint WHERE conrelid IN ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass)));
