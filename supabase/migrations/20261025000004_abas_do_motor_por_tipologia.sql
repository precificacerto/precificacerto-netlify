-- ════════════════════════════════════════════════════════════════════════════════════════
-- Atendimentos I.A. — AS NOVE ABAS DO MOTOR POR TIPOLOGIA, e a importação que as grava
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz
-- ║ (`migracao.md`, Parte I: o código novo lê estas tabelas e chama esta função).
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261025000004_abas_do_motor_por_tipologia.
-- ║
-- ║ O bloco `$verifica$` no fim ABORTA a transação se a estrutura não sair como declarada —
-- ║ ele viaja junto com qualquer payload, enxugado ou não.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- O QUE ELA FAZ, numa transação:
--   1. `orcamentista_motor_tipologia_detalhe` (aba "Detalhe Tipologias") JÁ EXISTE em produção, criada
--      por execute_sql e sem arquivo. O CREATE TABLE IF NOT EXISTS é idêntico ao de produção e não faz
--      nada lá: ele dá à estrutura um arquivo. É acrescentada a coluna `ordem` (nulável — as 164 linhas
--      de hoje não a têm; a importação a preenche) e a UNIQUE (tabela_id, tipologia, ordem);
--   2. cria oito tabelas, uma por aba: Fórmulas, Perfis, Vidros, Baguete x Vidro, Insumos, Variáveis,
--      Validações e Otimização de barras;
--   3. substitui `importar_conteudo_da_tabela` pela versão que apaga e regrava TAMBÉM as nove abas,
--      na mesma transação das quatro tabelas de sempre, e devolve a contagem de cada uma.
--
-- DECISÕES DO DONO DO PRODUTO (25/10/2026), registradas onde a restrição é declarada:
--   - SEM tenant_id: o catálogo do fornecedor é global (nenhuma tabela dele tem tenant em produção) e
--     chega às contas por `orcamentista_conta_tabela`. FK `tabela_id` → `orcamentista_tabela(id)` ON
--     DELETE CASCADE, RLS com as quatro políticas `is_super_admin()`, REVOKE ALL de anon e
--     authenticated, sem GRANT — o padrão de `orcamentista_motor_regra`;
--   - FÓRMULA E CONDIÇÃO como TEXTO LITERAL. Toda coluna é `text`, menos os limites e as contagens do
--     Detalhe, que já são `integer` em produção;
--   - `ordem` = a linha na aba, e UNIQUE (tabela_id, tipologia, ordem) em todas as abas por tipologia —
--     é o que impede duplicar na reimportação onde não há chave natural (Perfis, Insumos, Vidros);
--   - Fórmulas e Variáveis têm ALÉM DISSO UNIQUE (tabela_id, tipologia, variavel): a chave natural foi
--     medida limpa no arquivo de 3.126.092 bytes (4.468 e 3.573 pares, zero duplicata). Se o arquivo do
--     Storage trouxer duplicata, a importação inteira é RECUSADA — a constraint não foi relaxada por
--     antecipação;
--   - Otimização de barras é parâmetro do FORNECEDOR, não da tipologia: UNIQUE (tabela_id, parametro), o
--     valor como texto literal.
--
-- A CLASSE `tabela-que-a-importacao-apaga`: a função APAGA E REGRAVA por tabela_id. As nove tabelas só
-- têm colunas que o arquivo descreve, mais `id`, `tabela_id`, `ordem` e o `atualizado_em` do Detalhe,
-- que o banco gera. O portão que liga estas colunas ao mapa do código é
-- `src/utils/__tests__/atendimentos-ia-abas-do-motor.test.ts`.
--
-- A ORDEM, e o que acontece se ela se inverter:
--   - código ANTIGO + função NOVA: a função exige as nove listas; o payload antigo não as traz, e a
--     importação é RECUSADA ("Payload invalido…") antes de apagar qualquer coisa;
--   - código NOVO + tabelas AUSENTES: a leitura das abas falha, e o levantamento RECUSA com frase.
--   Nos dois casos nada se perde — mas o certo é aplicar e verificar ANTES do merge.
--
-- OS COMENTÁRIOS FICAM FORA DO CORPO da função, de propósito (`migracao.md`, Parte III: o corpo entre
-- `$function$` é guardado como texto em `prosrc`).
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Detalhe Tipologias: a tabela JÁ EXISTE em produção (criada em 25/10/2026 por execute_sql, sem
--     arquivo). O CREATE abaixo é IDÊNTICO ao de produção (consultado no information_schema) e não faz
--     nada lá; ele existe para a estrutura ter arquivo. O que é novo é a coluna `ordem`.
CREATE TABLE IF NOT EXISTS public.orcamentista_motor_tipologia_detalhe (
  tabela_id     uuid        NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  tipologia     text        NOT NULL,
  linha         text,
  descricao     text        NOT NULL,
  tipo          text,
  larg_min_mm   integer,
  larg_max_mm   integer,
  alt_min_mm    integer,
  alt_max_mm    integer,
  fonte_limite  text,
  n_perfis      integer,
  n_vidros      integer,
  n_insumos     integer,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_motor_tipologia_detalhe_pkey PRIMARY KEY (tabela_id, tipologia)
);
-- nulável: as 164 linhas de hoje não têm ordem; a importação a preenche ao regravar
ALTER TABLE public.orcamentista_motor_tipologia_detalhe ADD COLUMN IF NOT EXISTS ordem integer;
DO $ordem$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_motor_tipologia_detalhe_ordem_key') THEN
    ALTER TABLE public.orcamentista_motor_tipologia_detalhe
      ADD CONSTRAINT orcamentista_motor_tipologia_detalhe_ordem_key UNIQUE (tabela_id, tipologia, ordem);
  END IF;
END
$ordem$;
ALTER TABLE public.orcamentista_motor_tipologia_detalhe ENABLE ROW LEVEL SECURITY;
DO $politicas$
DECLARE
  v_acao text;
BEGIN
  FOREACH v_acao IN ARRAY ARRAY['select','insert','update','delete'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orcamentista_motor_tipologia_detalhe'
                     AND policyname = 'orcamentista_motor_tipologia_detalhe_' || v_acao || '_super_admin') THEN
      EXECUTE format(
        CASE v_acao
          WHEN 'select' THEN 'CREATE POLICY %I ON public.orcamentista_motor_tipologia_detalhe FOR SELECT USING (public.is_super_admin())'
          WHEN 'insert' THEN 'CREATE POLICY %I ON public.orcamentista_motor_tipologia_detalhe FOR INSERT WITH CHECK (public.is_super_admin())'
          WHEN 'update' THEN 'CREATE POLICY %I ON public.orcamentista_motor_tipologia_detalhe FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())'
          ELSE               'CREATE POLICY %I ON public.orcamentista_motor_tipologia_detalhe FOR DELETE USING (public.is_super_admin())'
        END,
        'orcamentista_motor_tipologia_detalhe_' || v_acao || '_super_admin');
    END IF;
  END LOOP;
END
$politicas$;
REVOKE ALL ON public.orcamentista_motor_tipologia_detalhe FROM anon, authenticated;

-- ── 2. As oito tabelas novas. Sem tenant_id (o catálogo é global); `ordem` é a linha na aba.

-- aba "Fórmulas"
CREATE TABLE public.orcamentista_motor_formula (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  linha text,
  tipologia text NOT NULL,
  variavel text NOT NULL,
  descricao text,
  formula text,
  CONSTRAINT orcamentista_motor_formula_ordem_key UNIQUE (tabela_id, tipologia, ordem),
  CONSTRAINT orcamentista_motor_formula_variavel_key UNIQUE (tabela_id, tipologia, variavel)
);
ALTER TABLE public.orcamentista_motor_formula ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_formula_select_super_admin ON public.orcamentista_motor_formula
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_formula_insert_super_admin ON public.orcamentista_motor_formula
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_formula_update_super_admin ON public.orcamentista_motor_formula
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_formula_delete_super_admin ON public.orcamentista_motor_formula
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_formula FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_formula IS
  'A aba "Fórmulas" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- aba "Perfis"
CREATE TABLE public.orcamentista_motor_perfil (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  linha text,
  tipologia text NOT NULL,
  perfil text,
  descricao text,
  corte text,
  qtd text,
  medida text,
  posicao text,
  esp_vidro text,
  condicao text,
  obs text,
  CONSTRAINT orcamentista_motor_perfil_ordem_key UNIQUE (tabela_id, tipologia, ordem)
);
ALTER TABLE public.orcamentista_motor_perfil ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_perfil_select_super_admin ON public.orcamentista_motor_perfil
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_perfil_insert_super_admin ON public.orcamentista_motor_perfil
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_perfil_update_super_admin ON public.orcamentista_motor_perfil
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_perfil_delete_super_admin ON public.orcamentista_motor_perfil
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_perfil FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_perfil IS
  'A aba "Perfis" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- aba "Vidros"
CREATE TABLE public.orcamentista_motor_vidro (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  linha text,
  tipologia text NOT NULL,
  vidro text,
  largura text,
  altura text,
  qtd text,
  fixacao text,
  condicao text,
  CONSTRAINT orcamentista_motor_vidro_ordem_key UNIQUE (tabela_id, tipologia, ordem)
);
ALTER TABLE public.orcamentista_motor_vidro ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_vidro_select_super_admin ON public.orcamentista_motor_vidro
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_vidro_insert_super_admin ON public.orcamentista_motor_vidro
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_vidro_update_super_admin ON public.orcamentista_motor_vidro
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_vidro_delete_super_admin ON public.orcamentista_motor_vidro
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_vidro FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_vidro IS
  'A aba "Vidros" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- aba "Baguete x Vidro"
CREATE TABLE public.orcamentista_motor_baguete (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  linha text,
  tipologia text NOT NULL,
  baguete text,
  descricao text,
  espessuras_vidro text,
  qtd_medida_condicao text,
  CONSTRAINT orcamentista_motor_baguete_ordem_key UNIQUE (tabela_id, tipologia, ordem)
);
ALTER TABLE public.orcamentista_motor_baguete ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_baguete_select_super_admin ON public.orcamentista_motor_baguete
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_baguete_insert_super_admin ON public.orcamentista_motor_baguete
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_baguete_update_super_admin ON public.orcamentista_motor_baguete
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_baguete_delete_super_admin ON public.orcamentista_motor_baguete
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_baguete FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_baguete IS
  'A aba "Baguete x Vidro" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- aba "Insumos"
CREATE TABLE public.orcamentista_motor_insumo (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  linha text,
  tipologia text NOT NULL,
  insumo text,
  descricao text,
  qtd text,
  condicao text,
  obs text,
  CONSTRAINT orcamentista_motor_insumo_ordem_key UNIQUE (tabela_id, tipologia, ordem)
);
ALTER TABLE public.orcamentista_motor_insumo ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_insumo_select_super_admin ON public.orcamentista_motor_insumo
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_insumo_insert_super_admin ON public.orcamentista_motor_insumo
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_insumo_update_super_admin ON public.orcamentista_motor_insumo
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_insumo_delete_super_admin ON public.orcamentista_motor_insumo
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_insumo FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_insumo IS
  'A aba "Insumos" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- aba "Variáveis"
CREATE TABLE public.orcamentista_motor_variavel (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  linha text,
  tipologia text NOT NULL,
  variavel text NOT NULL,
  descricao text,
  padrao text,
  min_max text,
  condicao text,
  opcoes text,
  CONSTRAINT orcamentista_motor_variavel_ordem_key UNIQUE (tabela_id, tipologia, ordem),
  CONSTRAINT orcamentista_motor_variavel_variavel_key UNIQUE (tabela_id, tipologia, variavel)
);
ALTER TABLE public.orcamentista_motor_variavel ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_variavel_select_super_admin ON public.orcamentista_motor_variavel
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_variavel_insert_super_admin ON public.orcamentista_motor_variavel
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_variavel_update_super_admin ON public.orcamentista_motor_variavel
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_variavel_delete_super_admin ON public.orcamentista_motor_variavel
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_variavel FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_variavel IS
  'A aba "Variáveis" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- aba "Validações"
CREATE TABLE public.orcamentista_motor_validacao (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  linha text,
  tipologia text NOT NULL,
  condicao_valida text,
  mensagem text,
  CONSTRAINT orcamentista_motor_validacao_ordem_key UNIQUE (tabela_id, tipologia, ordem)
);
ALTER TABLE public.orcamentista_motor_validacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_validacao_select_super_admin ON public.orcamentista_motor_validacao
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_validacao_insert_super_admin ON public.orcamentista_motor_validacao
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_validacao_update_super_admin ON public.orcamentista_motor_validacao
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_validacao_delete_super_admin ON public.orcamentista_motor_validacao
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_validacao FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_validacao IS
  'A aba "Validações" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- aba "Otimização de barras"
CREATE TABLE public.orcamentista_motor_otimizacao (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid    NOT NULL REFERENCES public.orcamentista_tabela(id) ON DELETE CASCADE,
  ordem     integer NOT NULL CHECK (ordem >= 2),
  parametro text NOT NULL,
  valor text,
  CONSTRAINT orcamentista_motor_otimizacao_ordem_key UNIQUE (tabela_id, ordem),
  CONSTRAINT orcamentista_motor_otimizacao_parametro_key UNIQUE (tabela_id, parametro)
);
ALTER TABLE public.orcamentista_motor_otimizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY orcamentista_motor_otimizacao_select_super_admin ON public.orcamentista_motor_otimizacao
  FOR SELECT USING (public.is_super_admin());
CREATE POLICY orcamentista_motor_otimizacao_insert_super_admin ON public.orcamentista_motor_otimizacao
  FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_otimizacao_update_super_admin ON public.orcamentista_motor_otimizacao
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY orcamentista_motor_otimizacao_delete_super_admin ON public.orcamentista_motor_otimizacao
  FOR DELETE USING (public.is_super_admin());
REVOKE ALL ON public.orcamentista_motor_otimizacao FROM anon, authenticated;
COMMENT ON TABLE public.orcamentista_motor_otimizacao IS
  'A aba "Otimização de barras" do arquivo do motor, linha por linha (ordem = linha na aba). Formula e condicao em texto literal, nunca parseadas na gravacao. REIMPORTAR SUBSTITUI as linhas da tabela_id. So pela rota, com service_role.';

-- ── 3. A importação: as quatro tabelas de sempre e as nove abas, numa transação.
CREATE OR REPLACE FUNCTION public.importar_conteudo_da_tabela(p_tabela_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    valor_metro_interno, valor_barra_interno, valor_metro_12, valor_barra_12
  )
  SELECT
    p_tabela_id, x.codigo, x.descricao, x.medida_barra_m, x.unidade, x.ncm, x.peso, x.ipi, x.pacote, x.segmento, x.custo,
    x.secao, x.aliquota_interna_pct, x.vendido_por,
    x.valor_metro_interno, x.valor_barra_interno, x.valor_metro_12, x.valor_barra_12
  FROM jsonb_to_recordset(p_payload->'itens') AS x(
    codigo text, descricao text, medida_barra_m numeric, unidade text, ncm text, peso numeric, ipi numeric,
    pacote text, segmento text, custo numeric, secao text, aliquota_interna_pct numeric, vendido_por text,
    valor_metro_interno numeric, valor_barra_interno numeric, valor_metro_12 numeric, valor_barra_12 numeric
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

COMMENT ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) IS
  'Grava a importacao de UMA tabela numa transacao: apaga e insere as quatro tabelas de conteudo e as nove abas do motor por tipologia, e grava uma linha em orcamentista_importacao. Qualquer erro desfaz tudo, inclusive o DELETE. Devolve as contagens gravadas para a rota conferir. Chamada pela rota de API com service_role - nunca pelo navegador.';

REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO service_role;

-- ── 4. A VERIFICAÇÃO que ABORTA, na mesma transação.
DO $verifica$
DECLARE
  v_t text;
  v_n integer;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_formula', 'orcamentista_motor_perfil', 'orcamentista_motor_vidro', 'orcamentista_motor_baguete', 'orcamentista_motor_insumo', 'orcamentista_motor_variavel', 'orcamentista_motor_validacao', 'orcamentista_motor_otimizacao'] LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      RAISE EXCEPTION 'verificacao: a tabela % nao existe', v_t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || v_t)) THEN
      RAISE EXCEPTION 'verificacao: RLS desligada em %', v_t;
    END IF;
    SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = v_t
       AND (coalesce(qual, '') LIKE '%is_super_admin()%' OR coalesce(with_check, '') LIKE '%is_super_admin()%');
    IF v_n <> 4 THEN
      RAISE EXCEPTION 'verificacao: % tem % politicas is_super_admin(), esperado 4', v_t, v_n;
    END IF;
    IF has_table_privilege('anon', 'public.' || v_t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || v_t, 'SELECT') THEN
      RAISE EXCEPTION 'verificacao: anon ou authenticated le %', v_t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.' || v_t) AND conname = v_t || '_ordem_key') THEN
      RAISE EXCEPTION 'verificacao: % sem a UNIQUE de ordem', v_t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_motor_formula_variavel_key')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_motor_variavel_variavel_key')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_motor_otimizacao_parametro_key') THEN
    RAISE EXCEPTION 'verificacao: falta UNIQUE de chave natural (formula, variavel ou otimizacao)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'importar_conteudo_da_tabela' AND p.prosecdef
                   AND pg_get_function_identity_arguments(p.oid) = 'p_tabela_id uuid, p_payload jsonb'
                   AND p.prosrc LIKE '%orcamentista_motor_otimizacao%') THEN
    RAISE EXCEPTION 'verificacao: a funcao importar_conteudo_da_tabela nao e a versao com as nove abas';
  END IF;
  IF has_function_privilege('anon', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao: anon ou authenticated executa importar_conteudo_da_tabela';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- DEPOIS de aplicar, por consulta (`migracao.md`, Parte II — não pelo retorno do comando):
--   select table_name, count(*) from information_schema.columns
--    where table_schema = 'public' and table_name in ('orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_formula', 'orcamentista_motor_perfil', 'orcamentista_motor_vidro', 'orcamentista_motor_baguete', 'orcamentista_motor_insumo', 'orcamentista_motor_variavel', 'orcamentista_motor_validacao', 'orcamentista_motor_otimizacao')
--    group by 1 order by 1;
--   esperado: baguete 9 · formula 8 · insumo 10 · otimizacao 5 · perfil 14 · tipologia_detalhe 15 ·
--             validacao 7 · variavel 11 · vidro 11
--
-- EXERCITAR a função sem deixar rastro: SÓ dentro de begin … rollback. Sem o ROLLBACK ela APAGA o
-- conteúdo real da tabela usada — é o comportamento dela, substituir.
-- ════════════════════════════════════════════════════════════════════════════════════════
