-- Casos da 20261110000001 depois de aplicada duas vezes. Cada caso diz "ok: <nome>" ou "FALHOU: <nome>".
\set QUIET on
CREATE OR REPLACE FUNCTION pg_temp.caso(nome text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok THEN RAISE NOTICE 'ok: %', nome; ELSE RAISE NOTICE 'FALHOU: %', nome; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.recusa(sql text, codigo text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE = codigo; END $$;
CREATE OR REPLACE FUNCTION pg_temp.passa(sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN true; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'erro inesperado: % %', SQLSTATE, SQLERRM; RETURN false; END $$;

INSERT INTO public.tenants (id) VALUES ('00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por) VALUES
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Orc A', 1, 'manual', gen_random_uuid());
-- o total liquido existe (a venda_derivada da 0002 o exige junto com a venda)
UPDATE public.orcamentista_orcamento SET valor_total_bruto = 80, valor_total_liquido = 70 WHERE id = '00000000-0000-0000-0000-00000000000a';

SELECT pg_temp.caso('1a - a interna nasce nula, numeric e sem default',
  (SELECT valor_operacao_interna IS NULL FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-00000000000a')
  AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orcamentista_orcamento' AND column_name = 'valor_operacao_interna'
               AND data_type = 'numeric' AND is_nullable = 'YES' AND column_default IS NULL));
SELECT pg_temp.caso('2a - a venda sem a interna e recusada',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 120.50 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514'));
SELECT pg_temp.caso('2b - a interna sem a venda e recusada',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET valor_operacao_interna = 100.00 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514'));
SELECT pg_temp.caso('2c - a venda e a interna juntas passam, e a venda segue sem arredondar',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 120.4724702, valor_operacao_interna = 100.00 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$));
SELECT pg_temp.caso('2d - a interna igual a venda passa (sem tributo por fora)',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 100.00, valor_operacao_interna = 100.00 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$));
SELECT pg_temp.caso('2e - a interna acima da venda e recusada',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 100.00, valor_operacao_interna = 100.01 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514'));
SELECT pg_temp.caso('2f - a interna zero e a negativa sao recusadas',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 100.00, valor_operacao_interna = 0 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 100.00, valor_operacao_interna = -1 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514'));
SELECT pg_temp.caso('2g - a interna com fracao de centavo e recusada',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 120.00, valor_operacao_interna = 100.005 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$, '23514'));
SELECT pg_temp.caso('2h - a interna com zero a direita (100.10) passa',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento SET valor_venda = 120.00, valor_operacao_interna = 100.10 WHERE id = '00000000-0000-0000-0000-00000000000a'$q$));
SELECT pg_temp.caso('2i - as duas nulas juntas passam (a precificacao desfeita)',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento SET valor_venda = NULL, valor_operacao_interna = NULL WHERE id = '00000000-0000-0000-0000-00000000000a'$q$));
SELECT pg_temp.caso('3a - as tres CHECKs existem com o nome',
  (SELECT count(*) = 3 FROM pg_constraint WHERE conname LIKE 'orcamentista_orcamento_operacao_interna_%'));
SELECT pg_temp.caso('3b - a coluna nao abre grant novo: anon e authenticated sem nada',
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_name = 'orcamentista_orcamento' AND grantee IN ('anon', 'authenticated', 'PUBLIC')));
