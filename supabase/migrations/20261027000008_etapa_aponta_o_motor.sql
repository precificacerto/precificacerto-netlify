-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000008 — A ETAPA APONTA O MOTOR: as duas funções passam a saber de `orcamentista_familia_etapa.motor_id`.
--   1. superadmin_gravar_etapas_da_familia — aceita `motor_id` em cada item da lista (ausente = mantém; null = limpa;
--      uuid = aponta, conferindo que o motor existe, é DA família da etapa e não está arquivado).
--   2. superadmin_arquivar_motor           — RECUSA arquivar a planilha que alguma etapa aponta.
-- Não cria tabela nem coluna: usa as da 20261027000006 (aplicada e conferida em produção).
--
-- ╔═════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.          ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão:      ║
-- ║ 20261027000008_etapa_aponta_o_motor.                                                                 ║
-- ║ SEM ELA a tela NÃO quebra no que já existia, mas ESCOLHER O MOTOR DA ETAPA responde 400 "o campo     ║
-- ║ motor_id nao existe" (a função de hoje tem lista fechada de campos), e arquivar planilha apontada    ║
-- ║ por etapa continua permitido. Nada é gravado errado.                                                 ║
-- ║ PAYLOAD: o corpo das funções é o ARTEFATO (fica em `prosrc`). Aplique o arquivo SEM enxugar comentário: ║
-- ║ só `BEGIN;` e `COMMIT;` saem (`migracao.md`, Parte III).                                              ║
-- ╚═════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- POR QUÊ — decisão do dono do produto, 27/10/2026: "Cada etapa tem o seu motor. [...] superadmin_gravar_etapas_da_familia
-- passa a aceitar motor_id no item. [...] superadmin_arquivar_motor passa a RECUSAR arquivar planilha que alguma etapa
-- aponta." E, da 27/10 anterior: "a etapa vence" sobre `orcamentista_motor.vigente`.
--
-- O QUE MUDA em relação ao texto da 20261027000003 — e SÓ isto (o resto do corpo é idêntico, byte a byte):
--   1. ETAPAS: `motor_id` entra na lista de campos; a forma é conferida antes de tocar em linha (uuid; o motor existe, é da
--      família, não está arquivado — cada recusa nomeia a etapa e diz por quê); o UPDATE só mexe em `motor_id` quando a
--      chave VEIO (por isso uma lista sem `motor_id`, como a de hoje, NÃO apaga o motor já apontado); o INSERT grava o motor.
--      A leitura do motor é FOR SHARE: arquivar (FOR UPDATE) espera esta transação, e o arquivamento que veio antes é visto.
--   2. ARQUIVAR: depois de "já está arquivado", recusa (22023) nomeando a etapa que aponta o motor (e quantas mais).
--      A mensagem manda apontar a etapa para outro motor antes. Não há como arquivar "à força".
--
-- O RESTO: log na mesma transação (o `to_jsonb(x)` da etapa já leva `motor_id`), SECURITY DEFINER, search_path fixo, EXECUTE só
-- para service_role. NENHUM dado é tocado por esta migração.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_familia_etapa') IS NULL OR to_regclass('public.orcamentista_motor') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as tabelas da 20261027000002_motor_por_familia_e_etapas. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'motor_id') THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_familia_etapa.motor_id (20261027000006). Nada foi alterado.';
  END IF;
  IF to_regclass('public.superadmin_alteracao_log') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: superadmin_alteracao_log ou users. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)') IS NULL OR to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as funcoes da 20261027000003. Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── 1. As etapas da família, agora com o motor ───────────────────────────────────────────────────────────
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
  v_mfam       text;
  v_marq       timestamptz;
  v_permitidas text[] := ARRAY['id', 'rotulo', 'acao', 'instrucao', 'abas', 'motor_id'];
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
        RAISE EXCEPTION 'etapa %: o campo "%" nao existe (so id, rotulo, acao, instrucao, abas e motor_id)', i, k USING ERRCODE = 'invalid_parameter_value';
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
    -- O MOTOR da etapa (20261027000008): ausente = mantem o que a etapa ja tem; null = limpa; uuid = aponta. O motor tem de existir, ser DESTA
    -- familia e nao estar arquivado. FOR SHARE: arquivar o motor (FOR UPDATE) espera esta transacao, e uma etapa gravada passa a ser vista por ele;
    -- se o arquivamento veio antes, esta leitura espera, reve a linha ja arquivada e recusa.
    IF e ? 'motor_id' AND jsonb_typeof(e -> 'motor_id') <> 'null' THEN
      IF jsonb_typeof(e -> 'motor_id') <> 'string' OR (e ->> 'motor_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'etapa %: o motor_id nao e um uuid (ou null, para limpar)', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      SELECT m.familia, m.arquivado_em INTO v_mfam, v_marq
        FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'etapa %: o motor nao existe', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_mfam <> p_familia THEN
        RAISE EXCEPTION 'etapa %: o motor e da familia %, e a etapa e da familia %', i, v_mfam, p_familia USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_marq IS NOT NULL THEN
        RAISE EXCEPTION 'etapa %: o motor esta arquivado', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
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
               abas = v_abas, atualizado_por = p_por, atualizado_em = now(),
               motor_id = CASE WHEN e ? 'motor_id' THEN (e ->> 'motor_id')::uuid ELSE motor_id END
         WHERE id = (e ->> 'id')::uuid;
      ELSE
        INSERT INTO public.orcamentista_familia_etapa (familia, numero, rotulo, acao, instrucao, abas, atualizado_por, motor_id)
        VALUES (p_familia, i, e ->> 'rotulo', e ->> 'acao', coalesce(e ->> 'instrucao', ''), v_abas, p_por, (e ->> 'motor_id')::uuid);
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


-- ── 2. Arquivar a planilha, recusando a que uma etapa aponta ─────────────────────────────────────────────
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
  v_etapa  record;
  v_n      integer;
  v_msg    text;
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

  -- A ETAPA VENCE (20261027000008): planilha que alguma etapa aponta nao se arquiva. Trocar de planilha e apontar a etapa para a nova
  -- (superadmin_gravar_etapas_da_familia) e SO ENTAO arquivar a velha. A linha do motor ja esta travada (FOR UPDATE acima): uma etapa que
  -- esta sendo gravada para este motor segura a trava de chave da FK, e esta leitura so segue depois do commit dela.
  SELECT count(*) INTO v_n FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor;
  IF v_n > 0 THEN
    SELECT x.familia, x.numero, x.rotulo INTO v_etapa FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor ORDER BY x.familia, x.numero LIMIT 1;
    v_msg := format('o motor e o da etapa %s ("%s") da familia %s%s: aponte %s para outro motor antes de arquivar',
                    v_etapa.numero, v_etapa.rotulo, v_etapa.familia,
                    CASE WHEN v_n > 1 THEN format(' (e de mais %s)', v_n - 1) ELSE '' END,
                    CASE WHEN v_n > 1 THEN 'as etapas' ELSE 'a etapa' END);
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'invalid_parameter_value';
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

-- ── VERIFICAÇÃO: as duas existem, fechadas, e SÃO as novas (o corpo cita o que mudou) ──────────────────────
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)',
    'public.superadmin_arquivar_motor(uuid, uuid)'
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
  IF position('motor_id' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)'))) = 0
     OR position('aponte' IN (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)'))) = 0 THEN
    RAISE EXCEPTION 'verificacao: o corpo de uma das funcoes nao e o novo. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'etapa aponta o motor: as duas funcoes, fechadas, com o corpo novo.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proname, prosecdef, position('motor_id' in prosrc) > 0 as cita_motor_id from pg_proc where proname in ('superadmin_gravar_etapas_da_familia','superadmin_arquivar_motor');
-- select count(*) from public.orcamentista_familia_etapa;   -- esperado: 0 (nada foi tocado)
