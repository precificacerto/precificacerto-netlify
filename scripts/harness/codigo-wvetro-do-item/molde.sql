-- ============================================================================================================================
-- 20261124000001 - A REFERENCIA DO ITEM DA TABELA DE FORNECEDOR: codigo_wvetro (dono do produto, 24/11/2026)
--
-- APLICAR ANTES DO MERGE do PR da referencia do vidro, e VERIFICAR por consulta. Pressupoe `importar_conteudo_da_tabela(uuid, jsonb)` com o
-- corpo da 20261123000004 (md5 sem \r 97abdae749f848c350152291f86b0eef, medido em producao em 24/11/2026): a guarda confere e aborta se for
-- outro. Sem ela o codigo NAO quebra na leitura (os itens voltam sem a referencia), mas o vidro padrao nao e achado: sai como falta nomeada.
--
-- Decisao do dono do produto, registrada como esta: "A REFERENCIA UNICA DO VIDRO E A COLUNA codigo_wvetro." A grafia (24/11): "A grafia
-- coerencia com a descricao. Eu imagino que e vidro float incolor 5 milimetros, ne? Seria isso." - tipo + cor + espessura (VFIN05, VTIN06,
-- VLIN3+3), a mesma para TODOS os fornecedores. A referencia vem da COLUNA `codigo_wvetro` do arquivo (o layout unico ja a traz e, ate aqui,
-- a lia e descartava, com o aviso de coluna sem destino).
--
-- O QUE FAZ:
--   1. `orcamentista_tabela_item.codigo_wvetro text`, NULL = o fornecedor nao informou (todas as tabelas de hoje), sem default;
--   2. a CHECK `orcamentista_tabela_item_codigo_wvetro_forma`: nula, ou sem espaco nas pontas e nao vazia (a referencia e identidade: o
--      valor gravado e o valor comparado, sem aparar na leitura);
--   3. o indice UNICO PARCIAL `orcamentista_tabela_item_codigo_wvetro_key` em (tabela_id, codigo_wvetro) onde nao e nula: uma tabela nunca
--      tem duas linhas com a mesma referencia. Com todas as linhas de hoje nulas, o indice nasce vazio;
--   4. `importar_conteudo_da_tabela` passa a gravar a referencia. A funcao APAGA e REGRAVA os itens com uma lista de colunas FIXA: sem esta
--      mudanca a coluna nunca chegaria ao banco, e cada reimportacao a apagaria (tabela-que-a-importacao-apaga.md). O corpo e o de producao
--      com UMA mudanca - `codigo_wvetro` no INSERT dos itens e no jsonb_to_recordset (o montar_migracao.py prova pelo diff). Chave ausente
--      no payload vira NULL. Assinatura, retorno, SECURITY DEFINER, search_path e o statement_timeout de 35 s ficam iguais. O CREATE OR
--      REPLACE preserva a ACL de hoje ({postgres=X/postgres}): esta migracao NAO da nem tira EXECUTE de ninguem, e a verificacao confere.
--
-- O QUE NAO FAZ: nenhum UPDATE nem DELETE de dado (as linhas de hoje ficam com a referencia NULL: a v5 da Lajeadense tem de ser REIMPORTADA
-- depois do deploy); nenhum GRANT nem REVOKE; nada no calculo.
--
-- GUARDA (aborta, nada alterado): a funcao com o corpo medido (ou o desta migracao, na reaplicacao); a coluna, se ja existir, tem de ser text.
-- VERIFICACAO (aborta, na mesma transacao): a coluna text, nulavel, sem default; a CHECK; o indice unico parcial; o corpo com o md5 desta
-- migracao; SECURITY DEFINER, os dois SET e a ACL iguais aos de antes.
-- Tudo ASCII.
-- ============================================================================================================================
BEGIN;

DO $guarda$
DECLARE
  v_md5 text;
  v_tipo text;
  v_acl text;
BEGIN
  SELECT md5(replace(p.prosrc, E'\r', '')), coalesce(p.proacl::text, '') INTO v_md5, v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb';
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'guarda: a funcao importar_conteudo_da_tabela(uuid, jsonb) nao existe no banco % (usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  IF v_md5 NOT IN ('97abdae749f848c350152291f86b0eef', '@@MD5_NOVO@@') THEN
    RAISE EXCEPTION 'guarda: o corpo de importar_conteudo_da_tabela nao e o medido (md5 sem \\r = %). Substitui-lo apagaria uma mudanca que esta migracao nao conhece. Nada foi alterado.', v_md5;
  END IF;
  SELECT data_type INTO v_tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name = 'codigo_wvetro';
  IF v_tipo IS NOT NULL AND v_tipo <> 'text' THEN
    RAISE EXCEPTION 'guarda: orcamentista_tabela_item.codigo_wvetro ja existe com o tipo % (esperado text). Nada foi alterado.', v_tipo;
  END IF;
  -- a ACL de antes, para a verificacao conferir que o CREATE OR REPLACE nao a mudou
  PERFORM set_config('migracao_20261124000001.acl', v_acl, true);
END
$guarda$;

-- 1. a coluna
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS codigo_wvetro text;
COMMENT ON COLUMN public.orcamentista_tabela_item.codigo_wvetro IS
  'A referencia do item, como veio na coluna codigo_wvetro do arquivo (layout unico): tipo + cor + espessura (VFIN05), a mesma grafia em todos os fornecedores. NULL = o fornecedor nao informou. No vidro, e por ela que o padrao e o vidro escolhido acham a linha de preco (dono do produto, 24/11/2026).';

-- 2. a CHECK (criada uma vez) e 3. o indice unico parcial
DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_codigo_wvetro_forma') THEN
    ALTER TABLE public.orcamentista_tabela_item ADD CONSTRAINT orcamentista_tabela_item_codigo_wvetro_forma CHECK (codigo_wvetro IS NULL OR (codigo_wvetro <> '' AND codigo_wvetro = btrim(codigo_wvetro)));
  END IF;
END
$checks$;
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_tabela_item_codigo_wvetro_key
  ON public.orcamentista_tabela_item (tabela_id, codigo_wvetro) WHERE codigo_wvetro IS NOT NULL;

-- 4. a importacao grava a referencia
@@CABECALHO_DA_FUNCAO@@@@CORPO@@$function$;

-- 5. a verificacao que ABORTA, na mesma transacao
DO $verifica$
DECLARE
  v_n integer;
  v_md5 text;
  v_acl text;
  v_def boolean;
  v_cfg text[];
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name = 'codigo_wvetro'
     AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 1: orcamentista_tabela_item.codigo_wvetro nao esta como text, nulavel e sem default.'; END IF;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_codigo_wvetro_forma' AND contype = 'c';
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 2: a CHECK orcamentista_tabela_item_codigo_wvetro_forma nao existe.'; END IF;

  SELECT count(*) INTO v_n FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indrelid = 'public.orcamentista_tabela_item'::regclass AND c.relname = 'orcamentista_tabela_item_codigo_wvetro_key'
     AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL
     AND pg_get_indexdef(i.indexrelid) LIKE '%(tabela_id, codigo_wvetro) WHERE (codigo_wvetro IS NOT NULL)';
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 7: o indice unico parcial orcamentista_tabela_item_codigo_wvetro_key nao existe como esperado.'; END IF;

  SELECT md5(replace(p.prosrc, E'\r', '')), coalesce(p.proacl::text, ''), p.prosecdef, p.proconfig INTO v_md5, v_acl, v_def, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb';
  IF v_md5 IS DISTINCT FROM '@@MD5_NOVO@@' THEN RAISE EXCEPTION 'verificacao 3: o corpo de importar_conteudo_da_tabela nao e o desta migracao (md5 %).', v_md5; END IF;
  IF v_def IS DISTINCT FROM true THEN RAISE EXCEPTION 'verificacao 4: importar_conteudo_da_tabela deixou de ser SECURITY DEFINER.'; END IF;
  IF v_cfg IS DISTINCT FROM ARRAY['search_path=public', 'statement_timeout=35s'] THEN
    RAISE EXCEPTION 'verificacao 5: os SET de importar_conteudo_da_tabela mudaram: %', v_cfg;
  END IF;
  IF v_acl IS DISTINCT FROM current_setting('migracao_20261124000001.acl', true) THEN
    RAISE EXCEPTION 'verificacao 6: a ACL de importar_conteudo_da_tabela mudou: era %, ficou %.', current_setting('migracao_20261124000001.acl', true), v_acl;
  END IF;
  RAISE NOTICE 'codigo_wvetro do item da tabela: coluna, CHECK, indice e importacao conferidos (md5 %, ACL %)', v_md5, v_acl;
END
$verifica$;

COMMIT;

NOTIFY pgrst, 'reload schema';
