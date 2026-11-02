-- ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ 20261102000001 — O BLOCO TRIBUTÁRIO DO ITEM DA TABELA DE FORNECEDOR (dono do produto, 02/11/2026)                    ║
-- ║                                                                                                                      ║
-- ║ PENDENTE ATÉ O DONO DO PRODUTO APLICAR. Pressupõe a função `importar_conteudo_da_tabela` como a `20261025000004` a   ║
-- ║ deixou (com o statement_timeout da `20261026000001`): a guarda confere o corpo por md5 e aborta se for outro.        ║
-- ║ SEM ELA O CÓDIGO QUEBRA: a importação manda as 12 chaves novas, e a função de antes as ignora em silêncio.           ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Formulação do dono do produto, registrada como está:
--   "Hoje orcamentista_tabela_item só guarda ipi e aliquota_interna_pct. Precisa guardar os dois blocos [...] todas numeric NULL, sem DEFAULT [...]
--    NULL significa 'o fornecedor não informou'. 0 significa 'alíquota zero'. Não use DEFAULT 0, não use COALESCE para tratar NULL como 0 em lugar
--    nenhum. [...] Nenhuma coluna gerada: custo_liquido é o que veio do arquivo, não um cálculo do banco."
--
-- O QUE ESTA MIGRAÇÃO FAZ:
--   1. as 12 colunas, numeric, NULL, SEM default (as de antes — ipi, aliquota_interna_pct e as outras — não mudam):
--        bloco creditável:     cred_icms_pct, cred_pis_cofins_pct, cred_ibs_pct, cred_cbs_pct, cred_ipi_pct
--        bloco não creditável: nc_ipi_pct, nc_icms_st_pct, nc_difal_pct, nc_is_pct
--        resultado:            credito_pct, credito_valor, custo_liquido
--   2. duas CHECKs: o IPI de um lado só (cred_ipi_pct e nc_ipi_pct não ficam os dois preenchidos) e todo percentual preenchido entre 0 e 100
--      (credito_valor e custo_liquido são R$, não percentual: ficam fora da faixa);
--   3. a função `importar_conteudo_da_tabela` passa a gravar as 12. Decisão do dono do produto, 02/11/2026 ("Mesma migração"): a função apaga os
--      itens da tabela e regrava com uma lista de colunas FIXA, e sem ela as 12 nunca chegariam ao banco — e cada reimportação as apagaria
--      (`tabela-que-a-importacao-apaga.md`). O corpo é o da `20261025000004` com UMA mudança: as 12 colunas no INSERT dos itens e no
--      `jsonb_to_recordset`. Chave ausente no payload vira NULL (nunca 0): o payload de antes continua valendo. Assinatura, retorno, SECURITY DEFINER,
--      search_path e o statement_timeout de 35 s (`20261026000001`) ficam iguais — o CREATE OR REPLACE troca os SET, e por isso eles vêm repetidos.
--
-- O QUE ELA NÃO FAZ: nenhum UPDATE ou DELETE de dado (as 509 linhas de hoje ficam com as 12 colunas NULL, que é o que elas são: o fornecedor não
-- informou); nenhuma coluna gerada; nenhuma mudança no cálculo nem na conversa.
--
-- Medido em produção em 02/11/2026 (só leitura): `orcamentista_tabela_item` com 19 colunas e 509 linhas; o corpo de `importar_conteudo_da_tabela`, sem
-- o \r, tem o md5 c412c59f708174d7a3a3f800aadd8e2c — o da `20261025000004`; EXECUTE só para postgres e service_role.
--
-- AS PARTES QUE EXECUTAM SÃO ASCII; os acentos estão só em comentário.

BEGIN;

-- 0. a guarda: a função tem de ser a medida (primeira aplicação) ou a desta migração (reaplicação)
DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(replace(p.prosrc, E'\r', '')) INTO v_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb';
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'guarda: a funcao importar_conteudo_da_tabela(uuid, jsonb) nao existe. Nada foi alterado.';
  END IF;
  IF v_md5 NOT IN ('c412c59f708174d7a3a3f800aadd8e2c', 'd98800431ea61fede9cab6593d01f007') THEN
    RAISE EXCEPTION 'guarda: o corpo de importar_conteudo_da_tabela nao e o medido (md5 sem \\r = %). Substitui-lo apagaria uma mudanca que esta migracao nao conhece. Nada foi alterado.', v_md5;
  END IF;
END
$guarda$;

-- 1. as 12 colunas
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS cred_icms_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS cred_pis_cofins_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS cred_ibs_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS cred_cbs_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS cred_ipi_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS nc_ipi_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS nc_icms_st_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS nc_difal_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS nc_is_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS credito_pct numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS credito_valor numeric;
ALTER TABLE public.orcamentista_tabela_item ADD COLUMN IF NOT EXISTS custo_liquido numeric;

COMMENT ON COLUMN public.orcamentista_tabela_item.cred_icms_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco creditavel: ICMS creditavel, em %, como o fornecedor informou.';
COMMENT ON COLUMN public.orcamentista_tabela_item.cred_pis_cofins_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco creditavel: PIS/COFINS creditavel, em %, como o fornecedor informou.';
COMMENT ON COLUMN public.orcamentista_tabela_item.cred_ibs_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco creditavel: IBS creditavel, em %, como o fornecedor informou.';
COMMENT ON COLUMN public.orcamentista_tabela_item.cred_cbs_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco creditavel: CBS creditavel, em %, como o fornecedor informou.';
COMMENT ON COLUMN public.orcamentista_tabela_item.cred_ipi_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco creditavel: IPI creditavel, em %. Nunca junto com nc_ipi_pct na mesma linha.';
COMMENT ON COLUMN public.orcamentista_tabela_item.nc_ipi_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco nao creditavel: IPI nao creditavel, em %. Nunca junto com cred_ipi_pct na mesma linha. Nao entra no liquido.';
COMMENT ON COLUMN public.orcamentista_tabela_item.nc_icms_st_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco nao creditavel: ICMS-ST, em %. Nao entra no liquido.';
COMMENT ON COLUMN public.orcamentista_tabela_item.nc_difal_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco nao creditavel: DIFAL, em %. Nao entra no liquido.';
COMMENT ON COLUMN public.orcamentista_tabela_item.nc_is_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Bloco nao creditavel: Imposto Seletivo, em %. Nao entra no liquido.';
COMMENT ON COLUMN public.orcamentista_tabela_item.credito_pct IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Resultado, como veio no arquivo: o credito em %. A importacao recalcula pela soma do bloco creditavel e reporta a divergencia; grava o que veio.';
COMMENT ON COLUMN public.orcamentista_tabela_item.credito_valor IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Resultado, como veio no arquivo: o credito em R$. A importacao recalcula (custo x credito_pct / 100) e reporta a divergencia; grava o que veio.';
COMMENT ON COLUMN public.orcamentista_tabela_item.custo_liquido IS
  'NULL = o fornecedor nao informou; 0 = aliquota (ou valor) zero. Resultado, como veio no arquivo: o custo liquido em R$. NAO e coluna gerada. A importacao recalcula (custo - credito_valor) e reporta a divergencia; grava o que veio.';

-- 2. as CHECKs (criadas uma vez: a reaplicacao nao as recria)
DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_ipi_de_um_lado') THEN
    ALTER TABLE public.orcamentista_tabela_item ADD CONSTRAINT orcamentista_tabela_item_ipi_de_um_lado
      CHECK (cred_ipi_pct IS NULL OR nc_ipi_pct IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_tabela_item'::regclass AND conname = 'orcamentista_tabela_item_percentual_na_faixa') THEN
    ALTER TABLE public.orcamentista_tabela_item ADD CONSTRAINT orcamentista_tabela_item_percentual_na_faixa
      CHECK ((cred_icms_pct IS NULL OR (cred_icms_pct >= 0 AND cred_icms_pct <= 100))
    AND (cred_pis_cofins_pct IS NULL OR (cred_pis_cofins_pct >= 0 AND cred_pis_cofins_pct <= 100))
    AND (cred_ibs_pct IS NULL OR (cred_ibs_pct >= 0 AND cred_ibs_pct <= 100))
    AND (cred_cbs_pct IS NULL OR (cred_cbs_pct >= 0 AND cred_cbs_pct <= 100))
    AND (cred_ipi_pct IS NULL OR (cred_ipi_pct >= 0 AND cred_ipi_pct <= 100))
    AND (nc_ipi_pct IS NULL OR (nc_ipi_pct >= 0 AND nc_ipi_pct <= 100))
    AND (nc_icms_st_pct IS NULL OR (nc_icms_st_pct >= 0 AND nc_icms_st_pct <= 100))
    AND (nc_difal_pct IS NULL OR (nc_difal_pct >= 0 AND nc_difal_pct <= 100))
    AND (nc_is_pct IS NULL OR (nc_is_pct >= 0 AND nc_is_pct <= 100))
    AND (credito_pct IS NULL OR (credito_pct >= 0 AND credito_pct <= 100)));
  END IF;
END
$checks$;

-- 3. a funcao, com as 12 colunas no INSERT dos itens
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
$function$;

REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO service_role;

-- 4. a verificacao que ABORTA, na mesma transacao
DO $verifica$
DECLARE
  v_n integer;
BEGIN
  -- (1) as 12 colunas: numeric, nulaveis, sem default, nenhuma gerada
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name IN ('cred_icms_pct', 'cred_pis_cofins_pct', 'cred_ibs_pct', 'cred_cbs_pct', 'cred_ipi_pct', 'nc_ipi_pct', 'nc_icms_st_pct', 'nc_difal_pct', 'nc_is_pct', 'credito_pct', 'credito_valor', 'custo_liquido')
     AND data_type = 'numeric' AND is_nullable = 'YES' AND column_default IS NULL AND is_generated = 'NEVER';
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'verificacao 1: % de 12 colunas do bloco tributario com a forma pedida (numeric, NULL, sem default, nao gerada). Nada foi alterado.', v_n;
  END IF;
  -- (2) as colunas de antes nao mudaram de tipo
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orcamentista_tabela_item' AND column_name IN ('ipi', 'aliquota_interna_pct', 'custo')
     AND data_type = 'numeric' AND is_nullable = 'YES' AND column_default IS NULL;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'verificacao 2: ipi, aliquota_interna_pct ou custo mudou de forma. Nada foi alterado.';
  END IF;
  -- (3) as duas CHECKs, validadas, cobrindo as colunas certas
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.orcamentista_tabela_item'::regclass AND c.conname = 'orcamentista_tabela_item_ipi_de_um_lado'
                   AND c.contype = 'c' AND c.convalidated
                   AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey))
                       = ARRAY['cred_ipi_pct', 'nc_ipi_pct']) THEN
    RAISE EXCEPTION 'verificacao 3: a CHECK orcamentista_tabela_item_ipi_de_um_lado esta ausente ou com outra forma. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.orcamentista_tabela_item'::regclass AND c.conname = 'orcamentista_tabela_item_percentual_na_faixa'
                   AND c.contype = 'c' AND c.convalidated
                   AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey))
                       = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY['cred_icms_pct', 'cred_pis_cofins_pct', 'cred_ibs_pct', 'cred_cbs_pct', 'cred_ipi_pct', 'nc_ipi_pct', 'nc_icms_st_pct', 'nc_difal_pct', 'nc_is_pct', 'credito_pct']) x)) THEN
    RAISE EXCEPTION 'verificacao 3: a CHECK orcamentista_tabela_item_percentual_na_faixa esta ausente ou com outra forma. Nada foi alterado.';
  END IF;
  -- (4) a funcao: o corpo desta migracao, SECURITY DEFINER, search_path e statement_timeout, fechada a anon e authenticated
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'importar_conteudo_da_tabela'
                    AND md5(replace(p.prosrc, E'\r', '')) = 'd98800431ea61fede9cab6593d01f007'
                    AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public', 'statement_timeout=35s']) THEN
    RAISE EXCEPTION 'verificacao 4: a funcao importar_conteudo_da_tabela nao tem o corpo desta migracao, ou perdeu SECURITY DEFINER, search_path ou statement_timeout. Nada foi alterado.';
  END IF;
  IF has_function_privilege('anon', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'execute')
     OR has_function_privilege('authenticated', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'execute')
     OR NOT has_function_privilege('service_role', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'execute') THEN
    RAISE EXCEPTION 'verificacao 4: o EXECUTE de importar_conteudo_da_tabela nao e so de service_role. Nada foi alterado.';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
