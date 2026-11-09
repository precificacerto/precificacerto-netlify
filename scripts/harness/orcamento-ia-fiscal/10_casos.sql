-- Casos da 20261109000004 depois de aplicada duas vezes. Cada caso diz "ok: <nome>" ou "FALHOU: <nome>".
\set QUIET on
CREATE OR REPLACE FUNCTION pg_temp.caso(nome text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok THEN RAISE NOTICE 'ok: %', nome; ELSE RAISE NOTICE 'FALHOU: %', nome; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.recusa(sql text, codigo text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE = codigo; END $$;

INSERT INTO public.tenants (id) VALUES ('00000000-0000-0000-0000-0000000000f1') ON CONFLICT DO NOTHING;
INSERT INTO public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por)
  SELECT '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'Orc fiscal', 1, 'manual', gen_random_uuid();

SELECT pg_temp.caso('1 - a linha nova nasce com as quatro nulas (sem default)',
  (SELECT ncm_code IS NULL AND sale_scope IS NULL AND buyer_type IS NULL AND uf_destino IS NULL FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-0000000000a1'));
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
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTERESTADUAL', buyer_type = 'CONTRIBUINTE_PJ', uf_destino = 'RJ' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '22P02'));
SELECT pg_temp.caso('8 - rotulo fora do tipo e recusado (22P02)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'EXPORTACAO' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '22P02')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET buyer_type = 'consumidor_final' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '22P02'));
SELECT pg_temp.caso('9 - voltar a nulo e permitido nas quatro',
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET ncm_code = NULL, sale_scope = NULL, buyer_type = NULL, uf_destino = NULL WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('10 - as colunas usam os tipos de pricing_calculations (o mesmo oid)',
  (SELECT atttypid FROM pg_attribute WHERE attrelid = 'public.orcamentista_orcamento'::regclass AND attname = 'sale_scope') = 'public.sale_scope'::regtype
  AND (SELECT atttypid FROM pg_attribute WHERE attrelid = 'public.orcamentista_orcamento'::regclass AND attname = 'buyer_type') = 'public.buyer_type_enum'::regtype);
SELECT pg_temp.caso('11 - 28 colunas e 47 constraints nas duas tabelas',
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento') = 28
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass)) = 47);
SELECT pg_temp.caso('12 - o comentario do ncm_code esta gravado e e ASCII',
  (SELECT col_description('public.orcamentista_orcamento'::regclass, attnum) FROM pg_attribute WHERE attrelid = 'public.orcamentista_orcamento'::regclass AND attname = 'ncm_code') ~ '^[[:ascii:]]+$');
SELECT pg_temp.caso('13 - nenhum grant novo: service_role so INSERT, SELECT, UPDATE; nada a anon/authenticated',
  (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_name = 'orcamentista_orcamento' AND grantee = 'service_role') = 'INSERT,SELECT,UPDATE'
  AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_name = 'orcamentista_orcamento' AND grantee IN ('anon', 'authenticated', 'PUBLIC')));

-- A UF de destino: o dominio (brazilian_states) e a amarracao com o escopo.
SELECT pg_temp.caso('14 - UF preenchida com INTRAESTADUAL e recusada (23514)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTRAESTADUAL', uf_destino = 'SP' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('15 - UF nula com INTERESTADUAL e recusada (23514)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTERESTADUAL', uf_destino = NULL WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('16 - UF inexistente (XX) e recusada pela FK (23503)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTERESTADUAL', uf_destino = 'XX' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23503'));
SELECT pg_temp.caso('17 - UF preenchida com o escopo nulo e recusada (23514)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = NULL, uf_destino = 'SP' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('18 - UF em minuscula (sp) e recusada pela FK: o dominio e o de brazilian_states',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTERESTADUAL', uf_destino = 'sp' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23503'));
SELECT pg_temp.caso('19 - valido: INTERESTADUAL com SP',
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTERESTADUAL', uf_destino = 'SP' WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
-- (a leitura num comando proprio: no mesmo comando, o snapshot e o de antes da funcao)
SELECT pg_temp.caso('19b - o valor ficou gravado',
  (SELECT uf_destino = 'SP' AND sale_scope = 'INTERESTADUAL' FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-0000000000a1'));
SELECT pg_temp.caso('20 - a UF citada por um orcamento nao sai de brazilian_states (23503)',
  pg_temp.recusa($q$DELETE FROM public.brazilian_states WHERE code = 'SP'$q$, '23503'));
SELECT pg_temp.caso('21 - valido: INTRAESTADUAL com a UF nula',
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = 'INTRAESTADUAL', uf_destino = NULL WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
-- (a leitura num comando proprio: no mesmo comando, o snapshot e o de antes da funcao)
SELECT pg_temp.caso('21b - o valor ficou gravado',
  (SELECT uf_destino IS NULL AND sale_scope = 'INTRAESTADUAL' FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-0000000000a1'));
SELECT pg_temp.caso('22 - valido: escopo nulo com a UF nula',
  NOT pg_temp.recusa($q$UPDATE public.orcamentista_orcamento SET sale_scope = NULL, uf_destino = NULL WHERE id = '00000000-0000-0000-0000-0000000000a1'$q$, '23514'));
SELECT pg_temp.caso('23 - o comentario da uf_destino esta gravado e e ASCII',
  (SELECT col_description('public.orcamentista_orcamento'::regclass, attnum) FROM pg_attribute WHERE attrelid = 'public.orcamentista_orcamento'::regclass AND attname = 'uf_destino') ~ '^[[:ascii:]]+$');
SELECT pg_temp.caso('24 - brazilian_states continua com as mesmas 2 constraints e as 27 linhas',
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.brazilian_states'::regclass) = 2 AND (SELECT count(*) FROM public.brazilian_states) = 27);
