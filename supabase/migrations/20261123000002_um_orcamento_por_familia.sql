-- ========================================================================================
-- 20261123000002 - UM ORCAMENTO POR FAMILIA (PR3 do produzido x revenda), parte ADITIVA: aplicar ANTES do merge
-- *** ESTA MIGRACAO GRAVA DADO DO CATALOGO: 1 LINHA - a familia PVC (rotulo "De Paula - PVC Wolf") recebe a sigla PVC, com o log.
-- *** Nenhum dado de CONTA e gravado: os 12 orcamentos de hoje ficam com a familia nula (dono do produto, 23/11/2026: "nao precisa fazer nada").
--
-- Dono do produto, 23/11/2026: "o numero do levantamento com sufixo por familia, e cada um com o seu numero proprio" e "Vamos trazer o NUMERO e
-- a SIGLA DA FAMILIA EM 3 LETRAS. PVC, ALU e assim por diante." O numero exibido do orcamento por familia e <numero do levantamento>-<SIGLA>;
-- o numero proprio (sequencial por empresa) continua.
--
-- O QUE FAZ:
--   A. orcamentista_familia_catalogo.sigla: 3 letras maiusculas, obrigatoria, unica (CHECK orcamentista_familia_catalogo_sigla_forma
--      ^[A-Z]{3}$ e UNIQUE orcamentista_familia_catalogo_sigla_key), IMUTAVEL depois de dada (gatilho orcamentista_familia_catalogo_sigla_fixa:
--      o numero exibido de um orcamento ja enviado nao pode mudar). Preenche a PVC com 'PVC' (1 linha, log com tenant nulo).
--   B. superadmin_criar_familia(p_por, p_chave, p_rotulo, p_ramificacoes, p_sigla): a familia nova nasce com a sigla; sem ela, fora da forma
--      ou repetida e recusa nomeada (22023), nunca deduzida do nome. A assinatura de antes (sem a sigla) continua existindo e RECUSA nomeando o
--      que falta - a tela publicada antes do merge recebe a frase, nunca um 500 do NOT NULL.
--   C. orcamentista_orcamento.familia text, nula (a do item: chave do catalogo, sem FK - o orcamento e documento de cliente e nao entra no
--      arrasto), com a CHECK da forma da chave.
--   D. o indice orcamentista_orcamento_um_por_familia (levantamento_id, coalesce(familia, '')) WHERE levantamento_id IS NOT NULL: um por
--      levantamento E familia; o orcamento de antes (familia nula) conta como um so por levantamento.
-- O QUE NAO FAZ: NAO remove o indice orcamentista_orcamento_um_por_levantamento - o codigo publicado conta com ele. Ele sai na 20261123000003,
-- aplicada DEPOIS do merge e do deploy (migracao.md, a licao de 12/11/2026). Ate la, continua um orcamento por levantamento (com uma familia
-- so em producao, nada muda). Nao altera nenhum orcamento, item, levantamento ou materia-prima.
-- GUARDA (aborta): as tabelas existem; na 1a aplicacao o catalogo de familias e so a PVC; o corpo de superadmin_criar_familia e o de producao
-- (md5 aa798afd, o da 20261103000001) ou o desta; a coluna sigla/familia, se ja existir, tem a forma desta migracao.
-- VERIFICACAO (aborta): as colunas, CHECKs, UNIQUE, gatilho e indice existem; toda familia tem sigla; as duas funcoes sao SECURITY DEFINER com
-- search_path fixo e EXECUTE so do service_role; o indice antigo continua.
-- ========================================================================================
BEGIN;

DO $guarda$
DECLARE
  v_oid regprocedure;
  v_md5 text;
  v_familias text;
BEGIN
  IF to_regclass('public.orcamentista_familia_catalogo') IS NULL OR to_regclass('public.orcamentista_orcamento') IS NULL
     OR to_regclass('public.superadmin_alteracao_log') IS NULL OR to_regclass('public.orcamentista_familia_ramificacao') IS NULL
     OR to_regclass('public.orcamentista_categoria_catalogo') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'guarda: dependencia ausente no banco % (usuario %): e o projeto certo? Nada foi alterado.', current_database(), current_user;
  END IF;
  v_oid := to_regprocedure('public.superadmin_criar_familia(uuid, text, text, text[])');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'guarda: superadmin_criar_familia(uuid, text, text, text[]) nao existe no banco %. Nada foi alterado.', current_database();
  END IF;
  SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_md5 FROM pg_catalog.pg_proc p WHERE p.oid = v_oid;
  IF v_md5 <> 'aa798afd03594cbd48d261a29af36188' AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_catalogo' AND column_name = 'sigla') THEN
    RAISE EXCEPTION 'guarda: superadmin_criar_familia tem outro corpo (md5 %, esperado aa798afd03594cbd48d261a29af36188). Nada foi alterado.', v_md5;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_catalogo' AND column_name = 'sigla'
              AND (data_type <> 'text' OR is_nullable <> 'NO')) THEN
    RAISE EXCEPTION 'guarda: orcamentista_familia_catalogo.sigla ja existe com outra forma. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_orcamento' AND column_name = 'familia'
              AND (data_type <> 'text' OR is_nullable <> 'YES')) THEN
    RAISE EXCEPTION 'guarda: orcamentista_orcamento.familia ja existe com outra forma. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_catalogo' AND column_name = 'sigla') THEN
    SELECT string_agg(chave, ', ' ORDER BY chave) INTO v_familias FROM public.orcamentista_familia_catalogo;
    IF v_familias IS DISTINCT FROM 'PVC' THEN
      RAISE EXCEPTION 'guarda: o catalogo de familias nao esta como medido em 23/11/2026 (so a PVC); tem: %. A sigla de cada familia e decisao do dono do produto. Nada foi alterado.', coalesce(v_familias, '(vazio)');
    END IF;
  END IF;
END
$guarda$;

-- -- A. A SIGLA DA FAMILIA ------------------------------------------------------------------
DO $sigla$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_catalogo' AND column_name = 'sigla') THEN
    ALTER TABLE public.orcamentista_familia_catalogo ADD COLUMN sigla text;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    SELECT NULL, 'orcamentista_familia_catalogo', f.chave, jsonb_build_object('sigla', NULL),
           jsonb_build_object('sigla', 'PVC', 'origem', 'preenchimento 20261123000002', 'motivo', 'decisao do dono do produto, 23/11/2026: a sigla da PVC Wolf e PVC'), NULL
      FROM public.orcamentista_familia_catalogo f WHERE f.chave = 'PVC';
    UPDATE public.orcamentista_familia_catalogo SET sigla = 'PVC' WHERE chave = 'PVC';
    ALTER TABLE public.orcamentista_familia_catalogo ALTER COLUMN sigla SET NOT NULL;
    ALTER TABLE public.orcamentista_familia_catalogo ADD CONSTRAINT orcamentista_familia_catalogo_sigla_forma CHECK (sigla ~ '^[A-Z]{3}$');
    ALTER TABLE public.orcamentista_familia_catalogo ADD CONSTRAINT orcamentista_familia_catalogo_sigla_key UNIQUE (sigla);
  END IF;
END
$sigla$;
COMMENT ON COLUMN public.orcamentista_familia_catalogo.sigla IS
  'A sigla da familia, 3 letras maiusculas: o sufixo do numero do orcamento por familia (<numero do levantamento>-<SIGLA>). Obrigatoria, unica, imutavel depois de dada. 20261123000002.';

CREATE OR REPLACE FUNCTION public.orcamentista_familia_catalogo_sigla_fixa() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF OLD.sigla IS DISTINCT FROM NEW.sigla THEN
    RAISE EXCEPTION 'a sigla da familia % e % e nao muda: o numero dos orcamentos ja enviados depende dela. Nada foi gravado.', OLD.chave, OLD.sigla
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.orcamentista_familia_catalogo_sigla_fixa() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS orcamentista_familia_catalogo_sigla_fixa ON public.orcamentista_familia_catalogo;
CREATE TRIGGER orcamentista_familia_catalogo_sigla_fixa BEFORE UPDATE OF sigla ON public.orcamentista_familia_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.orcamentista_familia_catalogo_sigla_fixa();

-- -- B. CRIAR FAMILIA PEDE A SIGLA ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_criar_familia(p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[], p_sigla text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rotulo     text := btrim(coalesce(p_rotulo, ''));
  v_sigla      text := upper(btrim(coalesce(p_sigla, '')));
  v_sigla_de   text;
  v_igual      text;
  v_fora       text;
  v_ordem      integer;
  v_depois     jsonb;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- a SIGLA (23/11/2026): 3 letras, obrigatoria, unica; nunca deduzida do nome
  IF v_sigla = '' THEN
    RAISE EXCEPTION 'a familia nova pede a sigla de 3 letras (ex.: PVC, ALU). Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_sigla !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'a sigla da familia tem exatamente 3 letras, sem acento nem numero (veio "%"). Nada foi gravado.', v_sigla USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_ramificacoes IS NULL OR cardinality(p_ramificacoes) = 0 THEN
    RAISE EXCEPTION 'a familia declara ao menos uma ramificacao (categoria). Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT x) FROM unnest(p_ramificacoes) x) THEN
    RAISE EXCEPTION 'uma ramificacao aparece mais de uma vez na lista. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT x INTO v_fora FROM unnest(p_ramificacoes) x WHERE x IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = x) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'a ramificacao "%" nao e do catalogo de categorias. Nada foi gravado.', coalesce(v_fora, '(vazia)') USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- uma criacao por vez: a ordem e a ultima + 1 e o nome nao repete - as duas conferencias valem so sob a trava
  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_familia_catalogo', 0));
  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave) THEN
    RAISE EXCEPTION 'a familia de chave "%" ja existe. Nada foi gravado.', p_chave USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT f.rotulo INTO v_igual FROM public.orcamentista_familia_catalogo f WHERE lower(btrim(f.rotulo)) = lower(v_rotulo) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a familia "%": o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT f.rotulo INTO v_sigla_de FROM public.orcamentista_familia_catalogo f WHERE f.sigla = v_sigla LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'a sigla % ja e da familia "%": a sigla nao se repete. Nada foi gravado.', v_sigla, v_sigla_de USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(max(f.ordem), 0) + 1 INTO v_ordem FROM public.orcamentista_familia_catalogo f;

  BEGIN
    INSERT INTO public.orcamentista_familia_catalogo (chave, rotulo, ordem, sigla) VALUES (p_chave, v_rotulo, v_ordem, v_sigla);
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_familia_catalogo_chave_forma' THEN 'a chave da familia e maiuscula, comeca por letra e tem ate 40 caracteres (letras, digitos e _). Nada foi gravado.'
      WHEN 'orcamentista_familia_catalogo_rotulo_forma' THEN 'o nome da familia tem de 1 a 60 caracteres. Nada foi gravado.'
      WHEN 'orcamentista_familia_catalogo_sigla_forma' THEN 'a sigla da familia tem exatamente 3 letras. Nada foi gravado.'
      ELSE 'um valor nao passou numa regra do banco. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;
  INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)
  SELECT p_chave, x, n::integer FROM unnest(p_ramificacoes) WITH ORDINALITY AS r(x, n);
  -- 02/11/2026: marcar uma categoria na ramificacao garante a linha dela em toda materia-prima desta familia, com config NULL; desmarcar
  -- nao apaga nada da conta (a linha com dado continua aparecendo, marcada "fora da familia")
  PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, p_chave, NULL, 'ramificacao');

  v_depois := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ordem) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_catalogo', p_chave, NULL, v_depois, p_por);
  RETURN v_depois;
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[], text) TO service_role;

-- a assinatura de antes (sem a sigla): a tela publicada antes do merge recebe a frase, nunca o NOT NULL
CREATE OR REPLACE FUNCTION public.superadmin_criar_familia(p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION 'a familia nova pede a sigla de 3 letras (ex.: PVC, ALU): atualize a tela. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[]) TO service_role;

-- -- C. A FAMILIA DO ORCAMENTO --------------------------------------------------------------
ALTER TABLE public.orcamentista_orcamento ADD COLUMN IF NOT EXISTS familia text;
DO $forma$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_orcamento_familia_forma') THEN
    ALTER TABLE public.orcamentista_orcamento ADD CONSTRAINT orcamentista_orcamento_familia_forma CHECK (familia IS NULL OR familia ~ '^[A-Z][A-Z0-9_]{0,39}$');
  END IF;
END
$forma$;
COMMENT ON COLUMN public.orcamentista_orcamento.familia IS
  'A familia do orcamento (chave do catalogo): um orcamento por familia do levantamento. NULL = orcamento de antes de 20261123000002. Sem FK, como o item: documento de cliente.';

-- -- D. UM POR LEVANTAMENTO E FAMILIA -------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_orcamento_um_por_familia
  ON public.orcamentista_orcamento (levantamento_id, (coalesce(familia, ''))) WHERE levantamento_id IS NOT NULL;

-- -- A VERIFICACAO --------------------------------------------------------------------------
DO $verifica$
DECLARE
  v_ruim text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo WHERE sigla IS NULL OR sigla !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION 'verificacao 1: familia sem sigla valida';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('orcamentista_familia_catalogo_sigla_forma', 'orcamentista_familia_catalogo_sigla_key', 'orcamentista_orcamento_familia_forma')) <> 3 THEN
    RAISE EXCEPTION 'verificacao 2: uma CHECK ou o UNIQUE nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orcamentista_familia_catalogo_sigla_fixa' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'verificacao 3: o gatilho da sigla fixa nao existe';
  END IF;
  IF to_regclass('public.orcamentista_orcamento_um_por_familia') IS NULL OR to_regclass('public.orcamentista_orcamento_um_por_levantamento') IS NULL THEN
    RAISE EXCEPTION 'verificacao 4: os dois indices (o novo e o de antes) tem de existir';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_ruim FROM pg_proc p
   WHERE p.oid IN (to_regprocedure('public.superadmin_criar_familia(uuid, text, text, text[], text)'), to_regprocedure('public.superadmin_criar_familia(uuid, text, text, text[])'))
     AND (NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']
          OR has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF v_ruim IS NOT NULL OR to_regprocedure('public.superadmin_criar_familia(uuid, text, text, text[], text)') IS NULL THEN
    RAISE EXCEPTION 'verificacao 5: superadmin_criar_familia fora da forma (SECURITY DEFINER, search_path, EXECUTE so do service_role): %', coalesce(v_ruim, 'a de 5 argumentos nao existe');
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
COMMIT;
