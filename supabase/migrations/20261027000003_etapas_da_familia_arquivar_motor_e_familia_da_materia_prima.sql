-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000003 — PR B: as três GRAVAÇÕES da tela da família, todas por função SECURITY DEFINER que loga.
--   1. superadmin_gravar_etapas_da_familia      — cadastrar, editar e REORDENAR as etapas de uma família.
--   2. superadmin_arquivar_motor                — ARQUIVAR uma planilha (orcamentista_motor). Nunca excluir.
--   3. superadmin_definir_familia_da_materia_prima — a família da matéria-prima, que escolhe as ramificações.
-- Não cria tabela nem coluna: usa as estruturas da 20261027000002 (aplicada e conferida em produção).
--
-- ╔═════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.          ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:      ║
-- ║ 20261027000003_etapas_da_familia_arquivar_motor_e_familia_da_materia_prima.                         ║
-- ║ SEM ELA a tela NÃO quebra: o GET das etapas devolve a lista vazia (tabela existe), e SALVAR, ARQUIVAR ║
-- ║ ou ESCOLHER A FAMÍLIA respondem 500 "Falha ao gravar" — a função não existe. Nada é gravado.       ║
-- ╚═════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- O QUE CADA FUNÇÃO FAZ, E O QUE ELA RECUSA
--   1. ETAPAS. Recebe a LISTA INTEIRA da família, na ordem: a posição é o número (reordenar = mandar a lista na
--      outra ordem). Item com `id` edita a etapa; item sem `id` cria. Cada item: { id?, rotulo, acao, instrucao?,
--      abas? }. NÃO REMOVE: etapa que existe e não veio na lista é RECUSA (22023) que a nomeia — remover etapa
--      não foi pedido, e "a lista inteira" não pode ser um DELETE disfarçado. Uma etapa sem ação da lista é erro:
--      quem decide é a CHECK da tabela (`..._acao_da_lista`), e a função traduz a violação para a frase, em vez de
--      repetir a lista de ações num segundo lugar (`copia-divergente.md`). Os números são trocados em duas fases
--      (deslocar tudo e regravar), porque a unicidade (familia, numero) não é adiável e trocar dois números de
--      lugar bateria nela no meio do comando.
--   2. ARQUIVAR. Grava `arquivado_em`, `arquivado_por` e tira a marca de `vigente` (a CHECK da tabela não deixa
--      arquivado E vigente). O dado fica: nenhuma linha da planilha é tocada. Arquivar o que já está arquivado é
--      recusa. Não há função de desarquivar nem de excluir: DELETE só com autorização explícita do dono do produto.
--      QUEM LÊ PRECISA FILTRAR `arquivado_em IS NULL`: planilha arquivada sai da lista e da conversa. Hoje nenhum
--      leitor da conversa lê `orcamentista_motor` (o PR D troca os leitores), e o bloco Motor já filtra.
--   3. FAMÍLIA DA MATÉRIA-PRIMA. Define (ou limpa, com null) `orcamentista_materia_prima.familia`. Uma família por
--      conta (índice único parcial da 20261027000002): a segunda é recusa. A família escolhe as ramificações
--      que a tela mostra (`orcamentista_familia_ramificacao`).
--
-- LOG: as três gravam em `superadmin_alteracao_log` na mesma transação, antes e depois, no formato de
-- `superadmin_gravar_contexto_do_atendimento`. As duas primeiras são do CATÁLOGO da plataforma, sem empresa:
-- `tenant_id` fica NULL (a coluna é opcional); a terceira leva a empresa.
--
-- FECHADAS: SECURITY DEFINER, search_path fixo, EXECUTE só para service_role; PUBLIC, anon e authenticated
-- não executam. O autor tem de ser super admin. A terceira confere que a matéria-prima é DA empresa.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_familia_etapa') IS NULL OR to_regclass('public.orcamentista_motor') IS NULL
     OR to_regclass('public.orcamentista_familia_ramificacao') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as tabelas da 20261027000002_motor_por_familia_e_etapas. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_materia_prima' AND column_name = 'familia') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_materia_prima.familia (20261027000002). Nada foi alterado.';
  END IF;
  IF to_regclass('public.superadmin_alteracao_log') IS NULL OR to_regclass('public.users') IS NULL OR to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: superadmin_alteracao_log, users ou tenants. Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── 1. As etapas da família ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_etapas_da_familia(
  p_familia text, p_por uuid, p_etapas jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes      jsonb;
  v_depois     jsonb;
  v_n          integer;
  i            integer;
  e            jsonb;
  k            text;
  v_id         uuid;
  v_ids        uuid[] := '{}';
  v_abas       text[];
  v_sem        record;
  v_constraint text;
  v_permitidas text[] := ARRAY['id', 'rotulo', 'acao', 'instrucao', 'abas'];
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN
    RAISE EXCEPTION 'familia inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_etapas IS NULL OR jsonb_typeof(p_etapas) <> 'array' THEN
    RAISE EXCEPTION 'as etapas vao numa lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_n := jsonb_array_length(p_etapas);
  IF v_n > 50 THEN
    RAISE EXCEPTION 'a familia tem % etapas na lista; o maximo e 50', v_n USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_etapas_da_familia:' || p_familia, 0));

  -- a forma de cada item, ANTES de tocar em qualquer linha
  FOR i IN 1..v_n LOOP
    e := p_etapas -> (i - 1);
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION 'etapa %: nao e um objeto', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    FOR k IN SELECT jsonb_object_keys(e) LOOP
      IF k <> ALL (v_permitidas) THEN
        RAISE EXCEPTION 'etapa %: o campo "%" nao existe (so id, rotulo, acao, instrucao e abas)', i, k USING ERRCODE = 'invalid_parameter_value';
      END IF;
    END LOOP;
    IF jsonb_typeof(e -> 'rotulo') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'etapa %: o rotulo e um texto', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(e -> 'acao') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'etapa %: a acao e obrigatoria e e um texto da lista', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF e ? 'instrucao' AND jsonb_typeof(e -> 'instrucao') <> 'string' THEN
      RAISE EXCEPTION 'etapa %: a instrucao e um texto', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF e ? 'abas' AND (jsonb_typeof(e -> 'abas') <> 'array'
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(e -> 'abas') a WHERE jsonb_typeof(a) <> 'string')) THEN
      RAISE EXCEPTION 'etapa %: as abas vao numa lista de textos', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF e ? 'abas' AND (SELECT count(*) <> count(DISTINCT a) FROM jsonb_array_elements_text(e -> 'abas') a) THEN
      RAISE EXCEPTION 'etapa %: uma aba aparece mais de uma vez', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF e ? 'id' AND jsonb_typeof(e -> 'id') <> 'null' THEN
      IF jsonb_typeof(e -> 'id') <> 'string' OR (e ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'etapa %: o id nao e um uuid', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_id := (e ->> 'id')::uuid;
      IF v_id = ANY (v_ids) THEN
        RAISE EXCEPTION 'etapa %: o id aparece mais de uma vez na lista', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa x WHERE x.id = v_id AND x.familia = p_familia) THEN
        RAISE EXCEPTION 'etapa %: o id nao e de uma etapa desta familia', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_ids := v_ids || v_id;
    END IF;
  END LOOP;

  -- NAO REMOVE: etapa que existe e nao veio na lista e recusa, nomeada
  SELECT x.numero, x.rotulo INTO v_sem
    FROM public.orcamentista_familia_etapa x
   WHERE x.familia = p_familia AND NOT (x.id = ANY (v_ids))
   ORDER BY x.numero LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'a etapa % ("%") nao veio na lista: remover etapa nao e permitido por aqui', v_sem.numero, v_sem.rotulo USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) INTO v_antes
    FROM public.orcamentista_familia_etapa x WHERE x.familia = p_familia;

  -- duas fases: a unicidade (familia, numero) nao e adiavel
  UPDATE public.orcamentista_familia_etapa SET numero = numero + 1000000 WHERE familia = p_familia;
  FOR i IN 1..v_n LOOP
    e := p_etapas -> (i - 1);
    v_abas := CASE WHEN e ? 'abas' THEN ARRAY(SELECT jsonb_array_elements_text(e -> 'abas')) ELSE '{}'::text[] END;
    BEGIN
      IF e ? 'id' AND jsonb_typeof(e -> 'id') <> 'null' THEN
        UPDATE public.orcamentista_familia_etapa
           SET numero = i, rotulo = e ->> 'rotulo', acao = e ->> 'acao', instrucao = coalesce(e ->> 'instrucao', ''),
               abas = v_abas, atualizado_por = p_por, atualizado_em = now()
         WHERE id = (e ->> 'id')::uuid;
      ELSE
        INSERT INTO public.orcamentista_familia_etapa (familia, numero, rotulo, acao, instrucao, abas, atualizado_por)
        VALUES (p_familia, i, e ->> 'rotulo', e ->> 'acao', coalesce(e ->> 'instrucao', ''), v_abas, p_por);
      END IF;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      RAISE EXCEPTION 'etapa %: %', i, CASE v_constraint
        WHEN 'orcamentista_familia_etapa_acao_da_lista' THEN 'a acao nao esta na lista'
        WHEN 'orcamentista_familia_etapa_abas_da_planilha' THEN 'uma aba nao e da planilha'
        WHEN 'orcamentista_familia_etapa_rotulo_forma' THEN 'o rotulo tem de ter de 1 a 60 caracteres, sem espaco nas pontas'
        WHEN 'orcamentista_familia_etapa_instrucao_ate_4000' THEN 'a instrucao passa de 4000 caracteres'
        ELSE 'um valor nao passou numa regra do banco' END
        USING ERRCODE = 'invalid_parameter_value';
    END;
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_familia_etapa x WHERE x.familia = p_familia;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_etapa', p_familia,
          jsonb_build_object('orcamentista_familia_etapa', v_antes),
          jsonb_build_object('orcamentista_familia_etapa', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_familia_etapa', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb) TO service_role;

-- ── 2. Arquivar a planilha ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_arquivar_motor(
  p_motor uuid, p_por uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_arquivar_motor:' || p_motor::text, 0));
  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_antes ->> 'arquivado_em' IS NOT NULL THEN
    RAISE EXCEPTION 'o motor ja esta arquivado' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por, vigente = false WHERE id = p_motor;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_motor m WHERE m.id = p_motor;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text,
          jsonb_build_object('orcamentista_motor', v_antes),
          jsonb_build_object('orcamentista_motor', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_motor', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) TO service_role;

-- ── 3. A família da matéria-prima ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_definir_familia_da_materia_prima(
  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_familia text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_familia IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN
    RAISE EXCEPTION 'familia fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_definir_familia_da_materia_prima:' || p_tenant::text, 0));
  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;

  BEGIN
    UPDATE public.orcamentista_materia_prima SET familia = p_familia, atualizado_por = p_por, atualizado_em = now()
     WHERE id = p_materia_prima AND tenant_id = p_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'a empresa ja tem outra materia-prima nesta familia: e uma por familia' USING ERRCODE = 'invalid_parameter_value';
  END;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text,
          jsonb_build_object('orcamentista_materia_prima', v_antes),
          jsonb_build_object('orcamentista_materia_prima', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_materia_prima', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text) TO service_role;

-- ── VERIFICAÇÃO: as três existem, são SECURITY DEFINER com search_path fixo e só o service_role executa ──
DO $verifica$
DECLARE
  f   regprocedure;
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)',
    'public.superadmin_arquivar_motor(uuid, uuid)',
    'public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)'
  ] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL
       OR has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  RAISE NOTICE 'PR B: as tres funcoes existem, fechadas, SECURITY DEFINER com search_path fixo.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
