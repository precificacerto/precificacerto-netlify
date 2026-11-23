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
  IF v_md5 NOT IN ('d98800431ea61fede9cab6593d01f007', '97abdae749f848c350152291f86b0eef') THEN
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
CREATE OR REPLACE FUNCTION public.importar_conteudo_da_tabela(p_tabela_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '35s'
AS $function$
DECLARE
  v_itens         integer;
  v_regras        integer;
  v_tipologias    integer;
  v_formulas      integer;
  v_importacao_id uuid;
  v_detalhes integer;
  v_formulas_da_tipologia integer;
  v_perfis integer;
  v_vidros integer;
  v_baguetes integer;
  v_insumos integer;
  v_variaveis_da_tipologia integer;
  v_validacoes integer;
  v_otimizacao integer;
BEGIN
  IF p_tabela_id IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'Tabela e payload sao obrigatorios. Nada foi gravado.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload->'itens') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'regras') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'tipologias') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'formulas') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'avisos') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'contagens') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload->'detalhes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'formulas_da_tipologia') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'perfis') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'vidros') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'baguetes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'insumos') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'variaveis_da_tipologia') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'validacoes') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'otimizacao') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Payload invalido: itens, regras, tipologias, formulas, avisos e as nove abas do motor (detalhes, formulas_da_tipologia, perfis, vidros, baguetes, insumos, variaveis_da_tipologia, validacoes, otimizacao) tem de ser listas, e contagens um objeto. Nada foi gravado.'
      USING ERRCODE = '22023';
  END IF;

  IF (p_payload->'contagens'->>'cruzam') IS NULL
     OR (p_payload->'contagens'->>'nao_cruzam') IS NULL
     OR (p_payload->'contagens'->>'normalizados') IS NULL THEN
    RAISE EXCEPTION 'Payload invalido: contagens sem cruzam, nao_cruzam ou normalizados. Nada foi gravado.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.orcamentista_tabela WHERE id = p_tabela_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tabela % nao encontrada. Nada foi gravado.', p_tabela_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.orcamentista_tabela_item           WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_regra           WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_tipologia       WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_formula_familia WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_tipologia_detalhe WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_formula WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_perfil WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_vidro WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_baguete WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_insumo WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_variavel WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_validacao WHERE tabela_id = p_tabela_id;
  DELETE FROM public.orcamentista_motor_otimizacao WHERE tabela_id = p_tabela_id;

  INSERT INTO public.orcamentista_tabela_item (
    tabela_id, codigo, descricao, medida_barra_m, unidade, ncm, peso, ipi, pacote, segmento, custo,
    secao, aliquota_interna_pct, vendido_por,
    valor_metro_interno, valor_barra_interno, valor_metro_12, valor_barra_12,
    cred_icms_pct, cred_pis_cofins_pct, cred_ibs_pct, cred_cbs_pct, cred_ipi_pct,
    nc_ipi_pct, nc_icms_st_pct, nc_difal_pct, nc_is_pct,
    credito_pct, credito_valor, custo_liquido,
    cor
  )
  SELECT
    p_tabela_id, x.codigo, x.descricao, x.medida_barra_m, x.unidade, x.ncm, x.peso, x.ipi, x.pacote, x.segmento, x.custo,
    x.secao, x.aliquota_interna_pct, x.vendido_por,
    x.valor_metro_interno, x.valor_barra_interno, x.valor_metro_12, x.valor_barra_12,
    x.cred_icms_pct, x.cred_pis_cofins_pct, x.cred_ibs_pct, x.cred_cbs_pct, x.cred_ipi_pct,
    x.nc_ipi_pct, x.nc_icms_st_pct, x.nc_difal_pct, x.nc_is_pct,
    x.credito_pct, x.credito_valor, x.custo_liquido,
    x.cor
  FROM jsonb_to_recordset(p_payload->'itens') AS x(
    codigo text, descricao text, medida_barra_m numeric, unidade text, ncm text, peso numeric, ipi numeric,
    pacote text, segmento text, custo numeric, secao text, aliquota_interna_pct numeric, vendido_por text,
    valor_metro_interno numeric, valor_barra_interno numeric, valor_metro_12 numeric, valor_barra_12 numeric,
    cred_icms_pct numeric, cred_pis_cofins_pct numeric, cred_ibs_pct numeric, cred_cbs_pct numeric, cred_ipi_pct numeric,
    nc_ipi_pct numeric, nc_icms_st_pct numeric, nc_difal_pct numeric, nc_is_pct numeric,
    credito_pct numeric, credito_valor numeric, custo_liquido numeric,
    cor text
  );
  GET DIAGNOSTICS v_itens = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_regra (
    tabela_id, codigo, descricao, segmento, cor, codigo_wvetro, linha, tipo, eixo, corte,
    formula_medida, formula_em_lh, formula_qtde, condicao, obs, tipologias
  )
  SELECT
    p_tabela_id, x.codigo, x.descricao, x.segmento, x.cor, x.codigo_wvetro, x.linha, x.tipo, x.eixo, x.corte,
    x.formula_medida, x.formula_em_lh, x.formula_qtde, x.condicao, x.obs, x.tipologias
  FROM jsonb_to_recordset(p_payload->'regras') AS x(
    codigo text, descricao text, segmento text, cor text, codigo_wvetro text, linha text, tipo text, eixo text,
    corte text, formula_medida text, formula_em_lh text, formula_qtde text, condicao text, obs text, tipologias text[]
  );
  GET DIAGNOSTICS v_regras = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_tipologia (tabela_id, tipologia, linha, n_regras, n_condicionais, variaveis)
  SELECT p_tabela_id, x.tipologia, x.linha, x.n_regras, x.n_condicionais, x.variaveis
  FROM jsonb_to_recordset(p_payload->'tipologias') AS x(
    tipologia text, linha text, n_regras integer, n_condicionais integer, variaveis text[]
  );
  GET DIAGNOSTICS v_tipologias = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula_familia (
    tabela_id, linha, linha_original, variavel, descricao, formula, formula_em_lh, pct_padrao
  )
  SELECT p_tabela_id, x.linha, x.linha_original, x.variavel, x.descricao, x.formula, x.formula_em_lh, x.pct_padrao
  FROM jsonb_to_recordset(p_payload->'formulas') AS x(
    linha text, linha_original text, variavel text, descricao text, formula text, formula_em_lh text, pct_padrao numeric
  );
  GET DIAGNOSTICS v_formulas = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_tipologia_detalhe (tabela_id, ordem, linha, tipologia, descricao, tipo, larg_min_mm, larg_max_mm, alt_min_mm, alt_max_mm, fonte_limite, n_perfis, n_vidros, n_insumos)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.descricao, x.tipo, x.larg_min_mm, x.larg_max_mm, x.alt_min_mm, x.alt_max_mm, x.fonte_limite, x.n_perfis, x.n_vidros, x.n_insumos
  FROM jsonb_to_recordset(p_payload->'detalhes') AS x(ordem integer, linha text, tipologia text, descricao text, tipo text, larg_min_mm integer, larg_max_mm integer, alt_min_mm integer, alt_max_mm integer, fonte_limite text, n_perfis integer, n_vidros integer, n_insumos integer);
  GET DIAGNOSTICS v_detalhes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula (tabela_id, ordem, linha, tipologia, variavel, descricao, formula)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.formula
  FROM jsonb_to_recordset(p_payload->'formulas_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, formula text);
  GET DIAGNOSTICS v_formulas_da_tipologia = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_perfil (tabela_id, ordem, linha, tipologia, perfil, descricao, corte, qtd, medida, posicao, esp_vidro, condicao, obs)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.perfil, x.descricao, x.corte, x.qtd, x.medida, x.posicao, x.esp_vidro, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'perfis') AS x(ordem integer, linha text, tipologia text, perfil text, descricao text, corte text, qtd text, medida text, posicao text, esp_vidro text, condicao text, obs text);
  GET DIAGNOSTICS v_perfis = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_vidro (tabela_id, ordem, linha, tipologia, vidro, largura, altura, qtd, fixacao, condicao)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.vidro, x.largura, x.altura, x.qtd, x.fixacao, x.condicao
  FROM jsonb_to_recordset(p_payload->'vidros') AS x(ordem integer, linha text, tipologia text, vidro text, largura text, altura text, qtd text, fixacao text, condicao text);
  GET DIAGNOSTICS v_vidros = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_baguete (tabela_id, ordem, linha, tipologia, baguete, descricao, espessuras_vidro, qtd_medida_condicao)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.baguete, x.descricao, x.espessuras_vidro, x.qtd_medida_condicao
  FROM jsonb_to_recordset(p_payload->'baguetes') AS x(ordem integer, linha text, tipologia text, baguete text, descricao text, espessuras_vidro text, qtd_medida_condicao text);
  GET DIAGNOSTICS v_baguetes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_insumo (tabela_id, ordem, linha, tipologia, insumo, descricao, qtd, condicao, obs)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.insumo, x.descricao, x.qtd, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'insumos') AS x(ordem integer, linha text, tipologia text, insumo text, descricao text, qtd text, condicao text, obs text);
  GET DIAGNOSTICS v_insumos = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_variavel (tabela_id, ordem, linha, tipologia, variavel, descricao, padrao, min_max, condicao, opcoes)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.padrao, x.min_max, x.condicao, x.opcoes
  FROM jsonb_to_recordset(p_payload->'variaveis_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, padrao text, min_max text, condicao text, opcoes text);
  GET DIAGNOSTICS v_variaveis_da_tipologia = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_validacao (tabela_id, ordem, linha, tipologia, condicao_valida, mensagem)
  SELECT p_tabela_id, x.ordem, x.linha, x.tipologia, x.condicao_valida, x.mensagem
  FROM jsonb_to_recordset(p_payload->'validacoes') AS x(ordem integer, linha text, tipologia text, condicao_valida text, mensagem text);
  GET DIAGNOSTICS v_validacoes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_otimizacao (tabela_id, ordem, parametro, valor)
  SELECT p_tabela_id, x.ordem, x.parametro, x.valor
  FROM jsonb_to_recordset(p_payload->'otimizacao') AS x(ordem integer, parametro text, valor text);
  GET DIAGNOSTICS v_otimizacao = ROW_COUNT;
  INSERT INTO public.orcamentista_importacao (
    tabela_id, importado_por, itens, regras, tipologias, cruzam, nao_cruzam, normalizados, avisos
  )
  VALUES (
    p_tabela_id,
    (p_payload->>'importado_por')::uuid,
    v_itens,
    v_regras,
    v_tipologias,
    (p_payload->'contagens'->>'cruzam')::integer,
    (p_payload->'contagens'->>'nao_cruzam')::integer,
    (p_payload->'contagens'->>'normalizados')::integer,
    p_payload->'avisos'
  )
  RETURNING id INTO v_importacao_id;

  RETURN jsonb_build_object(
    'importacao_id', v_importacao_id,
    'itens',         v_itens,
    'regras',        v_regras,
    'tipologias',    v_tipologias,
    'formulas',      v_formulas,
    'detalhes', v_detalhes,
    'formulas_da_tipologia', v_formulas_da_tipologia,
    'perfis', v_perfis,
    'vidros', v_vidros,
    'baguetes', v_baguetes,
    'insumos', v_insumos,
    'variaveis_da_tipologia', v_variaveis_da_tipologia,
    'validacoes', v_validacoes,
    'otimizacao', v_otimizacao
  );
END;
$function$;

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
  IF v_md5 IS DISTINCT FROM '97abdae749f848c350152291f86b0eef' THEN RAISE EXCEPTION 'verificacao 3: o corpo de importar_conteudo_da_tabela nao e o desta migracao (md5 %).', v_md5; END IF;
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
