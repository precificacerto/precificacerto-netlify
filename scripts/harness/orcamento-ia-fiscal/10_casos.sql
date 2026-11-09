-- Casos da 20261109000004 depois de aplicada duas vezes. Cada caso diz "ok: <nome>" ou "FALHOU: <nome>".
\set QUIET on
CREATE OR REPLACE FUNCTION pg_temp.caso(nome text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok THEN RAISE NOTICE 'ok: %', nome; ELSE RAISE NOTICE 'FALHOU: %', nome; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.recusa(sql text, codigo text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE = codigo; END $$;

INSERT INTO public.tenants (id) VALUES ('00000000-0000-0000-0000-0000000000f1') ON CONFLICT DO NOTHING;
INSERT INTO public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por)
  SELECT '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'Orc fiscal', 1, 'manual', gen_random_uuid();

SELECT pg_temp.caso('1 - a linha nova nasce com as tres nulas (sem default)',
  (SELECT ncm_code IS NULL AND sale_scope IS NULL AND buyer_type IS NULL FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-0000000000a1'));
SELECT pg_temp.caso('2 - o NCM na forma da tabela ncm_codes entra',
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = '7610.10.00' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('3 - o NCM de 8 digitos sem ponto e recusado (23514)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = '76101000' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('4 - o NCM de 4 digitos (posicao, nao NCM inteiro) e recusado',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = '7610' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('5 - o NCM vazio e recusado (vazio nao e nulo)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = '' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('6 - o NCM com espaco ou letra e recusado',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = ' 7610.10.00' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = '7610.10.0X' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('7 - os rotulos do tipo entram',
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTERESTADUAL', buyer_type = 'CONTRIBUINTE_PJ' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '22P02'));
SELECT pg_temp.caso('8 - rotulo fora do tipo e recusado (22P02)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'EXPORTACAO' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '22P02')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET buyer_type = 'consumidor_final' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '22P02'));
SELECT pg_temp.caso('9 - voltar a nulo e permitido nas tres',
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = NULL, sale_scope = NULL, buyer_type = NULL WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('10 - as colunas usam os tipos de pricing_calculations (o mesmo oid)',
  (SELECT atttypid FROM pg_attribute WHERE attrelid = 'public.orcamentista_orcamento'::regclass AND attname = 'sale_scope') = 'public.sale_scope'::regtype
  AND (SELECT atttypid FROM pg_attribute WHERE attrelid = 'public.orcamentista_orcamento'::regclass AND attname = 'buyer_type') = 'public.buyer_type_enum'::regtype);
SELECT pg_temp.caso('11 - 27 colunas e 45 constraints nas duas tabelas',
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento') = 27
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass)) = 45);
SELECT pg_temp.caso('12 - o comentario do ncm_code esta gravado e e ASCII',
  (SELECT col_description('public.orcamentista_orcamento'::regclass, attnum) FROM pg_attribute WHERE attrelid = 'public.orcamentista_orcamento'::regclass AND attname = 'ncm_code') ~ '^[[:ascii:]]+$');
SELECT pg_temp.caso('13 - nenhum grant novo: service_role so INSERT, SELECT, UPDATE; nada a anon/authenticated',
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_name = 'orcamentista_orcamento' AND grantee = 'service_role') = 'INSERT,SELECT,UPDATE'
  AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_name = 'orcamentista_orcamento' AND grantee IN ('anon', 'authenticated', 'PUBLIC')));
