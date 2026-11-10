-- Casos da 20261109000005 depois de aplicada duas vezes. Cada caso diz "ok: <nome>" ou "FALHOU: <nome>".
\set QUIET on
CREATE OR REPLACE FUNCTION pg_temp.caso(nome text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok THEN RAISE NOTICE 'ok: %', nome; ELSE RAISE NOTICE 'FALHOU: %', nome; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.recusa(sql text, codigo text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE = codigo; END $$;
CREATE OR REPLACE FUNCTION pg_temp.passa(sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RETURN true; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'erro inesperado: % %', SQLSTATE, SQLERRM; RETURN false; END $$;

INSERT INTO public.tenants (id) VALUES ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b2');
INSERT INTO public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por) VALUES
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'Orc A', 1, 'manual', gen_random_uuid()),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'Orc B', 1, 'manual', gen_random_uuid());
INSERT INTO public.orcamentista_orcamento_item (id, tenant_id, orcamento_id, ordem, quantidade) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 1, 3);

-- 1. o item: ambientes e escolhas
SELECT pg_temp.caso('1a - o item nasce com ambientes e escolhas nulos (nao informado, sem default)',
  (SELECT ambientes IS NULL AND escolhas IS NULL FROM public.orcamentista_orcamento_item WHERE id = '00000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.caso('1b - a lista de ambientes do levantamento entra',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento_item SET ambientes = '[{"ambiente": "Sala", "quantidade": 2}, {"ambiente": "Cozinha", "quantidade": 1}]' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$));
SELECT pg_temp.caso('1c - a lista vazia e recusada (vazio nao e nulo)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET ambientes = '[]' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514'));
SELECT pg_temp.caso('1d - o mesmo ambiente duas vezes (sem olhar a caixa) e recusado',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET ambientes = '[{"ambiente": "Sala", "quantidade": 1}, {"ambiente": "sala", "quantidade": 1}]' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514'));
SELECT pg_temp.caso('1e - quantidade zero, fracao, chave a mais e objeto no lugar da lista sao recusados',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET ambientes = '[{"ambiente": "Sala", "quantidade": 0}]' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET ambientes = '[{"ambiente": "Sala", "quantidade": 1.5}]' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET ambientes = '[{"ambiente": "Sala", "quantidade": 1, "x": 1}]' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET ambientes = '{"ambiente": "Sala", "quantidade": 1}' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514'));
SELECT pg_temp.caso('1f - as escolhas como objeto entram; lista e texto sao recusados',
  pg_temp.passa($q$UPDATE public.orcamentista_orcamento_item SET escolhas = '{"ARI": 4}' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$)
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET escolhas = '[4]' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514')
  AND pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_item SET escolhas = '"ARI"' WHERE id = '00000000-0000-0000-0000-0000000000c1'$q$, '23514'));
-- a definicao da CHECK do item do levantamento, MEDIDA em producao em 09/11/2026 (a base local nao tem a coluna no levantamento)
SELECT pg_temp.caso('1g - a CHECK dos ambientes e a MESMA do levantamento (um dominio so)',
  (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conname = 'orcamentista_orcamento_item_ambientes_forma')
  = 'CHECK (orcamentista_levantamento_ambientes_validos(ambientes))');

-- 2. o arquivo
-- por padrao, a geracao MANUAL, com autor (o botao); os casos da origem passam os dois campos
CREATE OR REPLACE FUNCTION pg_temp.arquivo(tenant text, orc text, caminho text, sha text, tamanho bigint, valor numeric, bucket text DEFAULT 'atendimentos-ia',
                                           origem text DEFAULT 'manual', autor text DEFAULT 'gen_random_uuid()') RETURNS text LANGUAGE sql AS $$
  SELECT format($f$INSERT INTO public.orcamentista_orcamento_arquivo (tenant_id, orcamento_id, calculo_id, bucket, caminho, sha256, tamanho_bytes, valor_venda, gerado_origem, gerado_por)
                 VALUES (%L, %L, gen_random_uuid(), %L, %L, %L, %s, %s, %L, %s)$f$, tenant, orc, bucket, caminho, sha, tamanho, valor, origem, autor) $$;
SELECT pg_temp.caso('2a - o arquivo valido entra, com o calculo_id e a data',
  pg_temp.passa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/1-v1.pdf', repeat('a', 64), 12345, 3105.80)));
-- (a leitura num comando proprio: no mesmo comando, o snapshot e o de antes da funcao)
SELECT pg_temp.caso('2a2 - a linha gravada tem o calculo_id e a data',
  (SELECT calculo_id IS NOT NULL AND gerado_em IS NOT NULL FROM public.orcamentista_orcamento_arquivo));
SELECT pg_temp.caso('2b - gerar de novo e OUTRA linha (o historico): o segundo objeto entra, a primeira linha fica',
  pg_temp.passa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/1-v2.pdf', repeat('b', 64), 12346, 3200)));
SELECT pg_temp.caso('2b2 - as duas linhas ficam', (SELECT count(*) FROM public.orcamentista_orcamento_arquivo) = 2);
SELECT pg_temp.caso('2c - o mesmo objeto (bucket, caminho) duas vezes e recusado (23505)',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/1-v1.pdf', repeat('c', 64), 1, 1), '23505'));
SELECT pg_temp.caso('2d - o orcamento de OUTRA empresa e recusado pela FK composta (23503)',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000a', 'orcamento/b2/x.pdf', repeat('d', 64), 1, 1), '23503'));
SELECT pg_temp.caso('2e - sha256 fora da forma (maiuscula, curto) e recusado',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/e1.pdf', repeat('A', 64), 1, 1), '23514')
  AND pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/e2.pdf', repeat('a', 63), 1, 1), '23514'));
SELECT pg_temp.caso('2f - tamanho zero e valor de venda zero sao recusados',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/f1.pdf', repeat('a', 64), 0, 1), '23514')
  AND pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/f2.pdf', repeat('a', 64), 1, 0), '23514'));
SELECT pg_temp.caso('2g - caminho com espaco, com barra inicial ou vazio, e bucket com maiuscula, sao recusados',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/g 1.pdf', repeat('a', 64), 1, 1), '23514')
  AND pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '/orcamento/g2.pdf', repeat('a', 64), 1, 1), '23514')
  AND pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', '', repeat('a', 64), 1, 1), '23514')
  AND pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/g3.pdf', repeat('a', 64), 1, 1, 'Atendimentos'), '23514'));
-- a ORIGEM da geracao: a pessoa tem autor; o agente nao tem e nao finge ter
SELECT pg_temp.caso('2i - manual com autor PASSA',
  pg_temp.passa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/i1.pdf', repeat('1', 64), 1, 1, 'atendimentos-ia', 'manual', 'gen_random_uuid()')));
SELECT pg_temp.caso('2j - agente sem autor PASSA',
  pg_temp.passa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/j1.pdf', repeat('2', 64), 1, 1, 'atendimentos-ia', 'agente', 'NULL')));
SELECT pg_temp.caso('2k - manual SEM autor e recusado (23514)',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/k1.pdf', repeat('3', 64), 1, 1, 'atendimentos-ia', 'manual', 'NULL'), '23514'));
SELECT pg_temp.caso('2l - agente COM autor e recusado (23514): o agente nao finge ter autor',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/l1.pdf', repeat('4', 64), 1, 1, 'atendimentos-ia', 'agente', 'gen_random_uuid()'), '23514'));
SELECT pg_temp.caso('2m - origem fora da lista e recusada (23514), e a origem nula tambem (23502)',
  pg_temp.recusa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/m1.pdf', repeat('5', 64), 1, 1, 'atendimentos-ia', 'whatsapp', 'NULL'), '23514')
  AND pg_temp.recusa($q$INSERT INTO public.orcamentista_orcamento_arquivo (tenant_id, orcamento_id, calculo_id, bucket, caminho, sha256, tamanho_bytes, valor_venda, gerado_por)
                        VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'atendimentos-ia', 'orcamento/a1/m2.pdf', repeat('6', 64), 1, 1, gen_random_uuid())$q$, '23502'));

-- um orcamento SEM item, so com arquivo: o que barra o delete e a FK do arquivo, e nao a do item
INSERT INTO public.orcamentista_orcamento (id, tenant_id, nome, numero, origem, criado_por) VALUES
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'Orc C', 2, 'manual', gen_random_uuid());
SELECT pg_temp.passa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', 'orcamento/a1/2-v1.pdf', repeat('f', 64), 1, 1));
SELECT pg_temp.caso('2h - o orcamento com arquivo nao sai (ON DELETE RESTRICT, 23503), e o arquivo fica',
  pg_temp.recusa($q$DELETE FROM public.orcamentista_orcamento WHERE id = '00000000-0000-0000-0000-00000000000c'$q$, '23503'));
SELECT pg_temp.caso('2h2 - o arquivo do orcamento C continua la',
  (SELECT count(*) FROM public.orcamentista_orcamento_arquivo WHERE orcamento_id = '00000000-0000-0000-0000-00000000000c') = 1);

-- 3. o service_role: so insere e le
GRANT USAGE ON SCHEMA public TO service_role;
SET ROLE service_role;
SELECT pg_temp.caso('3a - o service_role le e insere o arquivo',
  pg_temp.passa($q$SELECT count(*) FROM public.orcamentista_orcamento_arquivo$q$)
  AND pg_temp.passa(pg_temp.arquivo('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'orcamento/a1/1-v3.pdf', repeat('e', 64), 9, 9)));
SELECT pg_temp.caso('3b - o service_role NAO altera nem apaga o arquivo (42501)',
  pg_temp.recusa($q$UPDATE public.orcamentista_orcamento_arquivo SET valor_venda = 1$q$, '42501')
  AND pg_temp.recusa($q$DELETE FROM public.orcamentista_orcamento_arquivo$q$, '42501'));
RESET ROLE;

-- 4. a forma total
SELECT pg_temp.caso('4a - 49 constraints no orcamento e no item; 11 constraints e 12 colunas no arquivo; 30 colunas no item',
  (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.orcamentista_orcamento'::regclass, 'public.orcamentista_orcamento_item'::regclass)) = 49
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.orcamentista_orcamento_arquivo'::regclass) = 11
  AND (SELECT count(*) FROM information_schema.columns WHERE table_name = 'orcamentista_orcamento_arquivo') = 12
  AND (SELECT count(*) FROM information_schema.columns WHERE table_name = 'orcamentista_orcamento_item') = 30);
SELECT pg_temp.caso('4b - RLS ligada e nenhuma politica no arquivo',
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.orcamentista_orcamento_arquivo'::regclass)
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orcamentista_orcamento_arquivo'));
SELECT pg_temp.caso('4c - os comentarios gravados sao ASCII',
  (SELECT bool_and(d ~ '^[[:ascii:]]+$') FROM (
     SELECT obj_description('public.orcamentista_orcamento_arquivo'::regclass) AS d
     UNION ALL SELECT col_description('public.orcamentista_orcamento_arquivo'::regclass, 4)
     UNION ALL SELECT col_description('public.orcamentista_orcamento_item'::regclass, a.attnum) FROM pg_attribute a
       WHERE a.attrelid = 'public.orcamentista_orcamento_item'::regclass AND a.attname IN ('ambientes', 'escolhas')) x));
