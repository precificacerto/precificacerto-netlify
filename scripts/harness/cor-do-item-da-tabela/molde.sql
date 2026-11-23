-- ============================================================================================================================
-- 20261123000004 - A COR DO ITEM DA TABELA DE FORNECEDOR (dono do produto, 23/11/2026: o vidro por SEGMENTO + COR + ESPESSURA)
--
-- APLICAR ANTES DO MERGE do PR do vidro, e VERIFICAR por consulta. Pressupoe `importar_conteudo_da_tabela(uuid, jsonb)` com o corpo da
-- 20261102000001 (md5 sem \r d98800431ea61fede9cab6593d01f007, medido em producao em 23/11/2026): a guarda confere e aborta se for outro.
-- Sem ela o codigo NAO quebra (a leitura dos itens volta sem a cor e o vidro e achado pela descricao, como antes), mas a cor do arquivo nao
-- chega ao banco e a tabela de vidro da Lajeadense nao pode ser achada pela trinca.
--
-- Formulacao do dono do produto, registrada como esta: "COR DO VIDRO: vai ter uma coluna, exatamente." A cor vem da COLUNA `cor` do arquivo
-- (o layout unico ja a traz e, ate aqui, a lia e descartava, com o aviso de coluna sem destino).
--
-- O QUE FAZ:
--   1. `orcamentista_tabela_item.cor text`, NULL = o fornecedor nao informou (a tabela de antes, a Estrela, as linhas de duplagem), sem default;
--   2. a CHECK `orcamentista_tabela_item_cor_forma`: nula, ou com algum caractere que nao seja espaco (vazio nao e cor);
--   3. `importar_conteudo_da_tabela` passa a gravar a cor. A funcao APAGA e REGRAVA os itens com uma lista de colunas FIXA: sem esta mudanca a
--      coluna nunca chegaria ao banco, e cada reimportacao a apagaria (tabela-que-a-importacao-apaga.md). O corpo e o de producao com UMA mudanca
--      - `cor` no INSERT dos itens e no jsonb_to_recordset (o montar_migracao.py prova pelo diff). Chave ausente no payload vira NULL.
--      Assinatura, retorno, SECURITY DEFINER, search_path e o statement_timeout de 35 s ficam iguais. O CREATE OR REPLACE preserva a ACL de
--      hoje ({postgres=X/postgres}, a da 20261112000005): esta migracao NAO da nem tira EXECUTE de ninguem, e a verificacao confere a ACL.
--
-- O QUE NAO FAZ: nenhum UPDATE nem DELETE de dado (as 1.611 linhas de hoje ficam com a cor NULL); nenhum GRANT nem REVOKE; nada no calculo.
--
-- GUARDA (aborta, nada alterado): a funcao com o corpo medido (ou o desta migracao, na reaplicacao); a coluna `cor`, se ja existir, tem de ser text.
-- VERIFICACAO (aborta, na mesma transacao): a coluna text, nulavel, sem default; a CHECK; o corpo com o md5 desta migracao; SECURITY DEFINER, os
-- dois SET e a ACL iguais aos de antes.
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
  IF v_md5 NOT IN ('d98800431ea61fede9cab6593d01f007', '@@MD5_NOVO@@') THEN
    RAISE EXCEPTION 'guarda: o corpo de importar_conteudo_da_tabela nao e o medido (md5 sem \\r = %). Substitui-lo apagaria uma mudanca que esta migracao nao conhece. Nada foi alterado.', v_md5;
  END IF;
  SELECT data_type INTO v_tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name = 'cor';
  IF v_tipo IS NOT NULL AND v_tipo <> 'text' THEN
    RAISE EXCEPTION 'guarda: orcamentista_tabela_item.cor ja existe com o tipo % (esperado text). Nada foi alterado.', v_tipo;
  END IF;
  -- a ACL de antes, para a verificacao conferir que o CREATE OR REPLACE nao a mudou
  PERFORM set_config('migracao_20261123000004.acl', v_acl, true);
END
$guarda$;

-- 1. a coluna
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS cor text;
COMMENT ON COLUMN public.orcamentista_tabela_item.cor IS
  'A cor do item, como veio na coluna cor do arquivo (layout unico). NULL = o fornecedor nao informou. No vidro, com o segmento e a espessura, acha a linha de preco (dono do produto, 23/11/2026).';

-- 2. a CHECK (criada uma vez)
DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_cor_forma') THEN
    ALTER TABLE public.orcamentista_tabela_item ADD CONSTRAINT orcamentista_tabela_item_cor_forma CHECK (cor IS NULL OR btrim(cor) <> '');
  END IF;
END
$checks$;

-- 3. a importacao grava a cor
@@CABECALHO_DA_FUNCAO@@@@CORPO@@$function$;

-- 4. a verificacao que ABORTA, na mesma transacao
DO $verifica$
DECLARE
  v_n integer;
  v_md5 text;
  v_acl text;
  v_def boolean;
  v_cfg text[];
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name = 'cor'
     AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 1: orcamentista_tabela_item.cor nao esta como text, nulavel e sem default.'; END IF;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_cor_forma' AND contype = 'c';
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 2: a CHECK orcamentista_tabela_item_cor_forma nao existe.'; END IF;

  SELECT md5(replace(p.prosrc, E'\r', '')), coalesce(p.proacl::text, ''), p.prosecdef, p.proconfig INTO v_md5, v_acl, v_def, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb';
  IF v_md5 IS DISTINCT FROM '@@MD5_NOVO@@' THEN RAISE EXCEPTION 'verificacao 3: o corpo de importar_conteudo_da_tabela nao e o desta migracao (md5 %).', v_md5; END IF;
  IF v_def IS DISTINCT FROM true THEN RAISE EXCEPTION 'verificacao 4: importar_conteudo_da_tabela deixou de ser SECURITY DEFINER.'; END IF;
  IF v_cfg IS DISTINCT FROM ARRAY['search_path=public', 'statement_timeout=35s'] THEN
    RAISE EXCEPTION 'verificacao 5: os SET de importar_conteudo_da_tabela mudaram: %', v_cfg;
  END IF;
  IF v_acl IS DISTINCT FROM current_setting('migracao_20261123000004.acl', true) THEN
    RAISE EXCEPTION 'verificacao 6: a ACL de importar_conteudo_da_tabela mudou: era %, ficou %.', current_setting('migracao_20261123000004.acl', true), v_acl;
  END IF;
  RAISE NOTICE 'cor do item da tabela: coluna, CHECK e importacao conferidas (md5 %, ACL %)', v_md5, v_acl;
END
$verifica$;

COMMIT;

NOTIFY pgrst, 'reload schema';
