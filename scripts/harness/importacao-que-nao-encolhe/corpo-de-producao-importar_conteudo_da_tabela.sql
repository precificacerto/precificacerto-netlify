-- O corpo de importar_conteudo_da_tabela como está em produção (lido em 12/11/2026, md5 sem o \r d98800431ea61fede9cab6593d01f007).
-- Só para a GUARDA da 20261112000003: os casos de execução trocam por uma versão mínima (00_base.sql).
CREATE OR REPLACE FUNCTION public.importar_conteudo_da_tabela(p_tabela_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '35s'
AS $corpo$
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
    credito_pct, credito_valor, custo_liquido
  )
  SELECT
    p_tabela_id, x.codigo, x.descricao, x.medida_barra_m, x.unidade, x.ncm, x.peso, x.ipi, x.pacote, x.segmento, x.custo,
    x.secao, x.aliquota_interna_pct, x.vendido_por,
    x.valor_metro_interno, x.valor_barra_interno, x.valor_metro_12, x.valor_barra_12,
    x.cred_icms_pct, x.cred_pis_cofins_pct, x.cred_ibs_pct, x.cred_cbs_pct, x.cred_ipi_pct,
    x.nc_ipi_pct, x.nc_icms_st_pct, x.nc_difal_pct, x.nc_is_pct,
    x.credito_pct, x.credito_valor, x.custo_liquido
  FROM jsonb_to_recordset(p_payload->'itens') AS x(
    codigo text, descricao text, medida_barra_m numeric, unidade text, ncm text, peso numeric, ipi numeric,
    pacote text, segmento text, custo numeric, secao text, aliquota_interna_pct numeric, vendido_por text,
    valor_metro_interno numeric, valor_barra_interno numeric, valor_metro_12 numeric, valor_barra_12 numeric,
    cred_icms_pct numeric, cred_pis_cofins_pct numeric, cred_ibs_pct numeric, cred_cbs_pct numeric, cred_ipi_pct numeric,
    nc_ipi_pct numeric, nc_icms_st_pct numeric, nc_difal_pct numeric, nc_is_pct numeric,
    credito_pct numeric, credito_valor numeric, custo_liquido numeric
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
$corpo$;
