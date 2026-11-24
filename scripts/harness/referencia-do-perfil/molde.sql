-- ============================================================================================================================
-- 20261124000002 - A REFERENCIA DO PERFIL NO ITEM DA TABELA DE FORNECEDOR: referencia_perfil (dono do produto, 24/11/2026)
--
-- APLICAR ANTES DO MERGE do PR da referencia do perfil, e VERIFICAR por consulta. Pressupoe `importar_conteudo_da_tabela(uuid, jsonb)` com o
-- corpo da 20261124000001 (md5 sem \r fc86097aae3ef437bbfd451c902b72a3, medido em producao em 24/11/2026) e a CHECK
-- `orcamentista_orcamento_item_material_resolucao_check` com os sete valores da 20261115000002 (medida em producao em 24/11/2026): a guarda
-- confere as duas e aborta se alguma for outra. Sem ela o codigo NAO quebra (os itens voltam sem a referencia e o perfil e achado pela escada
-- de antes), mas a referencia do arquivo nao chega ao banco.
--
-- Ordem do dono do produto, registrada como esta: "coluna de referencia do perfil no item da tabela (mesmo desenho da codigo_wvetro - text
-- nula, CHECK de forma, importacao gravando), e o casamento do motor passa a ser referencia do perfil + cor, igual, nunca pelo parecido nem
-- pelo codigo do fornecedor. O sufixo /WOLFF do motor nao entra na referencia."
-- Medido em producao em 24/11/2026: a tabela de PERFIL da Wolf identifica o item por numero interno POR COR (9641 = "HF88S - MARCO CORRER
-- DUPLO COM ABA - BRANCO"), e o motor pede "HF88S/WOLFF"; a mesma referencia se repete por cor (15 linhas por perfil), por isso ela NAO cabe
-- na coluna `codigo_wvetro` (unica por tabela, a do vidro). Os perfis que o motor pede pelo nome estao em tres tabelas da Wolf (PERFIL,
-- INSTALACAO e PERSIANAS); o arquivo de PERFIL de hoje traz as colunas `cor` e `codigo_wvetro` VAZIAS nas 460 linhas.
--
-- O QUE FAZ:
--   1. `orcamentista_tabela_item.referencia_perfil text`, NULL = o fornecedor nao informou (todas as linhas de hoje), sem default;
--   2. a CHECK `orcamentista_tabela_item_referencia_perfil_forma`: nula, ou nao vazia, sem espaco nas pontas e SEM BARRA (o sufixo do
--      fornecedor, "/WOLFF", nao entra na referencia - a referencia e identidade: o valor gravado e o valor comparado);
--   3. o indice UNICO PARCIAL `orcamentista_tabela_item_referencia_perfil_cor_key` em (tabela_id, referencia_perfil, cor), NULLS NOT
--      DISTINCT, onde a referencia nao e nula: numa tabela, a referencia + a cor acham UM item (a cor nula conta como uma cor: dois itens da
--      mesma referencia sem cor tambem colidem). Com todas as linhas de hoje nulas, o indice nasce vazio;
--   4. `importar_conteudo_da_tabela` passa a gravar a referencia. A funcao APAGA e REGRAVA os itens com uma lista de colunas FIXA: sem esta
--      mudanca a coluna nunca chegaria ao banco, e cada reimportacao a apagaria (tabela-que-a-importacao-apaga.md). O corpo e o de producao
--      com UMA mudanca - `referencia_perfil` no INSERT dos itens e no jsonb_to_recordset (o montar_migracao.py prova pelo diff). Chave
--      ausente no payload vira NULL. Assinatura, retorno, SECURITY DEFINER, search_path e o statement_timeout de 35 s ficam iguais. O CREATE
--      OR REPLACE preserva a ACL de hoje ({postgres=X/postgres}): esta migracao NAO da nem tira EXECUTE de ninguem, e a verificacao confere;
--   5. a CHECK de `orcamentista_orcamento_item_material.resolucao` ganha o valor 'referencia' - para o orcamento gravar COMO o perfil foi
--      achado. A CHECK e trocada na mesma transacao (como na 20261115000002) e os SETE valores de antes ficam; a razao do alargamento e a
--      ordem acima: nasce um jeito novo de achar o item, e a fotografia do material diz qual foi.
--
-- O QUE NAO FAZ: nenhum UPDATE nem DELETE de dado (as linhas de hoje ficam com a referencia NULL: as tabelas tem de ser REIMPORTADAS com as
-- colunas `codigo_wvetro` e `cor` preenchidas, depois do deploy); nenhum GRANT nem REVOKE; nada no calculo; nenhuma linha de material muda.
--
-- GUARDA (aborta, nada alterado): a funcao com o corpo medido (ou o desta migracao, na reaplicacao); a CHECK da resolucao com os sete valores
-- medidos (ou os oito desta migracao); a coluna, se ja existir, tem de ser text.
-- VERIFICACAO (aborta, na mesma transacao): a coluna text, nulavel, sem default; a CHECK de forma; o indice; o corpo com o md5 desta
-- migracao; SECURITY DEFINER, os dois SET e a ACL iguais aos de antes; a CHECK da resolucao com os oito valores; a contagem de linhas de
-- material igual a de antes.
-- Tudo ASCII.
-- ============================================================================================================================
BEGIN;

DO $guarda$
DECLARE
  v_md5 text;
  v_tipo text;
  v_acl text;
  v_chk text;
BEGIN
  SELECT md5(replace(p.prosrc, E'\r', '')), coalesce(p.proacl::text, '') INTO v_md5, v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb';
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'guarda: a funcao importar_conteudo_da_tabela(uuid, jsonb) nao existe no banco % (usuario %). Nada foi alterado.', current_database(), current_user;
  END IF;
  IF v_md5 NOT IN ('fc86097aae3ef437bbfd451c902b72a3', '@@MD5_NOVO@@') THEN
    RAISE EXCEPTION 'guarda: o corpo de importar_conteudo_da_tabela nao e o medido (md5 sem \\r = %). Substitui-lo apagaria uma mudanca que esta migracao nao conhece. Nada foi alterado.', v_md5;
  END IF;
  SELECT data_type INTO v_tipo FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name = 'referencia_perfil';
  IF v_tipo IS NOT NULL AND v_tipo <> 'text' THEN
    RAISE EXCEPTION 'guarda: orcamentista_tabela_item.referencia_perfil ja existe com o tipo % (esperado text). Nada foi alterado.', v_tipo;
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_chk FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass AND conname = 'orcamentista_orcamento_item_material_resolucao_check';
  IF v_chk IS DISTINCT FROM 'CHECK ((resolucao = ANY (ARRAY[''ponte''::text, ''exato''::text, ''cor''::text, ''nome_tecnico''::text, ''vidro_escolhido''::text, ''vidro_traduzido''::text, ''vidro_padrao''::text])))'
     AND v_chk IS DISTINCT FROM 'CHECK ((resolucao = ANY (ARRAY[''ponte''::text, ''exato''::text, ''cor''::text, ''nome_tecnico''::text, ''vidro_escolhido''::text, ''vidro_traduzido''::text, ''vidro_padrao''::text, ''referencia''::text])))' THEN
    RAISE EXCEPTION 'guarda: a CHECK da resolucao do material nao e a medida (%). Troca-la apagaria uma mudanca que esta migracao nao conhece. Nada foi alterado.', coalesce(v_chk, 'nao existe');
  END IF;
  -- a ACL e a contagem de antes, para a verificacao conferir que nada mudou
  PERFORM set_config('migracao_20261124000002.acl', v_acl, true);
  PERFORM set_config('migracao_20261124000002.materiais', (SELECT count(*) FROM public.orcamentista_orcamento_item_material)::text, true);
END
$guarda$;

-- 1. a coluna
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS referencia_perfil text;
COMMENT ON COLUMN public.orcamentista_tabela_item.referencia_perfil IS
  'A referencia do perfil, como o motor a pede sem o sufixo do fornecedor (HF88S, GB34), vinda da coluna codigo_wvetro do arquivo das tabelas que nao sao de vidro. A mesma referencia se repete por cor: com a coluna cor, acha UM item. NULL = o fornecedor nao informou (dono do produto, 24/11/2026).';

-- 2. a CHECK de forma (criada uma vez) e 3. o indice unico parcial
DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_referencia_perfil_forma') THEN
    ALTER TABLE public.orcamentista_tabela_item ADD CONSTRAINT orcamentista_tabela_item_referencia_perfil_forma
      CHECK (referencia_perfil IS NULL OR (referencia_perfil <> '' AND referencia_perfil = btrim(referencia_perfil) AND position('/' in referencia_perfil) = 0));
  END IF;
END
$checks$;
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_tabela_item_referencia_perfil_cor_key
  ON public.orcamentista_tabela_item (tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT WHERE referencia_perfil IS NOT NULL;

-- 4. a importacao grava a referencia
@@CABECALHO_DA_FUNCAO@@@@CORPO@@$function$;

-- 5. a resolucao do material aceita 'referencia' (os sete de antes ficam)
ALTER TABLE public.orcamentista_orcamento_item_material
  DROP CONSTRAINT IF EXISTS orcamentista_orcamento_item_material_resolucao_check;
ALTER TABLE public.orcamentista_orcamento_item_material
  ADD CONSTRAINT orcamentista_orcamento_item_material_resolucao_check
  CHECK (resolucao = ANY (ARRAY['ponte'::text, 'exato'::text, 'cor'::text, 'nome_tecnico'::text,
                               'vidro_escolhido'::text, 'vidro_traduzido'::text, 'vidro_padrao'::text, 'referencia'::text]));

-- 6. a verificacao que ABORTA, na mesma transacao
DO $verifica$
DECLARE
  v_n integer;
  v_md5 text;
  v_acl text;
  v_def boolean;
  v_cfg text[];
  v_chk text;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name = 'referencia_perfil'
     AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 1: orcamentista_tabela_item.referencia_perfil nao esta como text, nulavel e sem default.'; END IF;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_referencia_perfil_forma' AND contype = 'c';
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 2: a CHECK orcamentista_tabela_item_referencia_perfil_forma nao existe.'; END IF;

  SELECT count(*) INTO v_n FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indrelid = 'public.orcamentista_tabela_item'::regclass AND c.relname = 'orcamentista_tabela_item_referencia_perfil_cor_key'
     AND i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL AND i.indnullsnotdistinct
     AND pg_get_indexdef(i.indexrelid) LIKE '%(tabela_id, referencia_perfil, cor) NULLS NOT DISTINCT WHERE (referencia_perfil IS NOT NULL)';
  IF v_n <> 1 THEN RAISE EXCEPTION 'verificacao 7: o indice unico parcial orcamentista_tabela_item_referencia_perfil_cor_key nao existe como esperado.'; END IF;

  SELECT md5(replace(p.prosrc, E'\r', '')), coalesce(p.proacl::text, ''), p.prosecdef, p.proconfig INTO v_md5, v_acl, v_def, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb';
  IF v_md5 IS DISTINCT FROM '@@MD5_NOVO@@' THEN RAISE EXCEPTION 'verificacao 3: o corpo de importar_conteudo_da_tabela nao e o desta migracao (md5 %).', v_md5; END IF;
  IF v_def IS DISTINCT FROM true THEN RAISE EXCEPTION 'verificacao 4: importar_conteudo_da_tabela deixou de ser SECURITY DEFINER.'; END IF;
  IF v_cfg IS DISTINCT FROM ARRAY['search_path=public', 'statement_timeout=35s'] THEN
    RAISE EXCEPTION 'verificacao 5: os SET de importar_conteudo_da_tabela mudaram: %', v_cfg;
  END IF;
  IF v_acl IS DISTINCT FROM current_setting('migracao_20261124000002.acl', true) THEN
    RAISE EXCEPTION 'verificacao 6: a ACL de importar_conteudo_da_tabela mudou: era %, ficou %.', current_setting('migracao_20261124000002.acl', true), v_acl;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_chk FROM pg_constraint
   WHERE conrelid = 'public.orcamentista_orcamento_item_material'::regclass AND conname = 'orcamentista_orcamento_item_material_resolucao_check';
  IF v_chk IS DISTINCT FROM 'CHECK ((resolucao = ANY (ARRAY[''ponte''::text, ''exato''::text, ''cor''::text, ''nome_tecnico''::text, ''vidro_escolhido''::text, ''vidro_traduzido''::text, ''vidro_padrao''::text, ''referencia''::text])))' THEN
    RAISE EXCEPTION 'verificacao 8: a CHECK da resolucao do material nao ficou com os oito valores: %', coalesce(v_chk, 'nao existe');
  END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_orcamento_item_material;
  IF v_n::text IS DISTINCT FROM current_setting('migracao_20261124000002.materiais', true) THEN
    RAISE EXCEPTION 'verificacao 9: as linhas de material mudaram: eram %, ficaram %.', current_setting('migracao_20261124000002.materiais', true), v_n;
  END IF;
  RAISE NOTICE 'referencia_perfil do item da tabela: coluna, CHECK, indice, importacao e resolucao conferidos (md5 %, ACL %, % linhas de material intactas)', v_md5, v_acl, v_n;
END
$verifica$;

COMMIT;

NOTIFY pgrst, 'reload schema';
