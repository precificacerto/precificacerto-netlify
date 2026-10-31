-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261031000001 — EXCLUIR ETAPA NA CONTA PASSA A SER PERMITIDO; AS QUE FICAM RENUMERAM 1..N.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261031000001_excluir_etapa_na_conta.
-- ║ PRESSUPÕE a 20261029000003 (a gravação das etapas com o motor pela ligação `orcamentista_motor_familia`), aplicada em
-- ║ 29/10/2026 e conferida: o corpo de `superadmin_gravar_etapas_da_materia_prima` em produção é o do arquivo dela (md5 3a8664ba…).
-- ║ SEM ELA: a tela manda a lista sem a etapa excluída, e a função de hoje recusa ("remover etapa nao e permitido por aqui").
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 30/10/2026: "Hoje `superadmin_gravar_etapas_da_materia_prima` recusa: 'a etapa % ("%") nao veio na lista: remover
-- etapa nao e permitido por aqui'. Essa recusa SAI. A etapa que não vier na lista é removida, com antes e depois no log, e as demais RENUMERAM para
-- 1..N sem buraco (a numeração aparece na conversa e na ordem de execução)."
--
-- O QUE FAZ: substitui `superadmin_gravar_etapas_da_materia_prima` (mesma assinatura). É o corpo da 20261029000003 com UMA mudança: o bloco
-- "NAO REMOVE" sai, e no lugar dele a etapa desta família que não veio na lista é APAGADA (travada antes, FOR UPDATE), com uma linha de log por
-- etapa (o tenant dela; antes = a linha inteira e `remocao_da_etapa: true`; depois nulo). O log da lista inteira (antes e depois) continua. As que
-- ficam recebem o número da posição na lista — 1..N, sem buraco —, como já recebiam. A função devolve também `etapas_removidas` (id, número e
-- rótulo de antes). LISTA VAZIA REMOVE TODAS: é o que a regra diz; a tela pede confirmação nomeando cada uma.
--
-- O QUE NÃO FAZ: nenhuma estrutura nova; nenhum dado mexido ao aplicar.
--
-- GUARDA (aborta antes de mudar): nenhuma FK aponta `orcamentista_familia_etapa` (se alguém passar a apontar, apagar a etapa deixaria de ser
-- inofensivo e esta função tem de ser revista); a ligação da 20261029000003 existe.
-- VERIFICAÇÃO (aborta): a função existe, fechada, SECURITY DEFINER com search_path fixo, sem a recusa antiga e com o DELETE.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA ──────────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_fk text;
BEGIN
  IF to_regclass('public.orcamentista_motor_familia') IS NULL
     OR to_regprocedure('public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261029000003 (a gravacao das etapas pela ligacao motor-familia) nao esta aplicada. Nada foi alterado.';
  END IF;
  SELECT string_agg(format('%s.%s', c.conrelid::regclass, c.conname), ', ') INTO v_fk
    FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid = 'public.orcamentista_familia_etapa'::regclass;
  IF v_fk IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: a etapa e referenciada por %; apagar etapa deixaria de ser inofensivo. Nada foi alterado.', v_fk;
  END IF;
END
$guarda$;

-- ── A GRAVAÇÃO DAS ETAPAS: a que não veio na lista sai ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_etapas_da_materia_prima(
  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_etapas jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_familia    text;
  v_antes      jsonb;
  v_depois     jsonb;
  v_n          integer;
  i            integer;
  e            jsonb;
  k            text;
  v_id         uuid;
  v_ids        uuid[] := '{}';
  v_abas       text[];
  v_constraint text;
  v_marq       timestamptz;
  v_rem        record;
  v_removidas  jsonb := '[]'::jsonb;
  v_permitidas text[] := ARRAY['id', 'rotulo', 'acao', 'instrucao', 'abas', 'motor_id'];
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_etapas IS NULL OR jsonb_typeof(p_etapas) <> 'array' THEN
    RAISE EXCEPTION 'as etapas vao numa lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_n := jsonb_array_length(p_etapas);
  IF v_n > 50 THEN
    RAISE EXCEPTION 'a familia tem % etapas na lista; o maximo e 50', v_n USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- a familia-instancia: DESTA empresa, e com tipo. FOR SHARE: trocar o tipo dela (definir_familia, FOR UPDATE) espera esta transacao, e ve as etapas
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_etapas_da_materia_prima:' || coalesce(p_materia_prima::text, ''), 0));
  SELECT m.familia INTO v_familia FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_familia IS NULL THEN
    RAISE EXCEPTION 'a materia-prima nao tem familia: escolha a familia antes de cadastrar as etapas' USING ERRCODE = 'invalid_parameter_value';
  END IF;

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
    -- o MOTOR da etapa: ausente mantem, null limpa, uuid aponta. O motor e do CATALOGO (global): tem de existir, ATUAR NA FAMILIA da etapa (a ligacao
    -- orcamentista_motor_familia, 20261029000003) e nao estar arquivado. FOR SHARE: arquivar e editar as familias do motor (FOR UPDATE) esperam esta
    -- transacao e veem a etapa; se vieram antes, esta leitura ve o que gravaram. A FK (motor_id, motor_familia_exigida) -> ligacao (motor_id, familia)
    -- e a trava; esta conferencia so da a frase.
    IF e ? 'motor_id' AND jsonb_typeof(e -> 'motor_id') <> 'null' THEN
      IF jsonb_typeof(e -> 'motor_id') <> 'string' OR (e ->> 'motor_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'etapa %: o motor_id nao e um uuid (ou null, para limpar)', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      SELECT m.arquivado_em INTO v_marq
        FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'etapa %: o motor nao existe', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = (e ->> 'motor_id')::uuid AND mf.familia = v_familia) THEN
        RAISE EXCEPTION 'etapa %: o motor nao atua na familia %', i, v_familia USING ERRCODE = 'invalid_parameter_value';
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
      IF NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa x WHERE x.id = v_id AND x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant) THEN
        RAISE EXCEPTION 'etapa %: o id nao e de uma etapa desta familia', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_ids := v_ids || v_id;
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) INTO v_antes
    FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima;

  -- REMOVE (dono do produto, 30/10/2026): a etapa que existe e NAO veio na lista sai, com antes e depois no log, uma linha por etapa, com o tenant.
  -- As que ficam renumeram 1..N pela posicao na lista (o laco abaixo), sem buraco. Nenhuma tabela referencia a etapa (a guarda confere).
  FOR v_rem IN
    SELECT x.* FROM public.orcamentista_familia_etapa x
     WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant AND NOT (x.id = ANY (v_ids))
     ORDER BY x.numero
       FOR UPDATE
  LOOP
    DELETE FROM public.orcamentista_familia_etapa WHERE id = v_rem.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (p_tenant, 'orcamentista_familia_etapa', v_rem.id::text,
            jsonb_build_object('orcamentista_familia_etapa', to_jsonb(v_rem), 'remocao_da_etapa', true), NULL, p_por);
    v_removidas := v_removidas || jsonb_build_array(jsonb_build_object('id', v_rem.id, 'numero', v_rem.numero, 'rotulo', v_rem.rotulo));
  END LOOP;

  -- duas fases: a unicidade (materia_prima_id, numero) nao e adiavel
  UPDATE public.orcamentista_familia_etapa SET numero = numero + 1000000 WHERE materia_prima_id = p_materia_prima;
  FOR i IN 1..v_n LOOP
    e := p_etapas -> (i - 1);
    v_abas := CASE WHEN e ? 'abas' THEN ARRAY(SELECT jsonb_array_elements_text(e -> 'abas')) ELSE '{}'::text[] END;
    BEGIN
      IF e ? 'id' AND jsonb_typeof(e -> 'id') <> 'null' THEN
        UPDATE public.orcamentista_familia_etapa
           SET numero = i, rotulo = e ->> 'rotulo', acao = e ->> 'acao', instrucao = coalesce(e ->> 'instrucao', ''),
               abas = v_abas, atualizado_por = p_por, atualizado_em = now(),
               motor_id = CASE WHEN e ? 'motor_id' THEN (e ->> 'motor_id')::uuid ELSE motor_id END,
               motor_familia_exigida = CASE WHEN e ? 'motor_id'
                 THEN CASE WHEN (e ->> 'motor_id') IS NULL THEN NULL ELSE familia END
                 ELSE motor_familia_exigida END
         WHERE id = (e ->> 'id')::uuid;
      ELSE
        INSERT INTO public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao, instrucao, abas, atualizado_por, motor_id,
                                                      motor_familia_exigida)
        VALUES (p_tenant, p_materia_prima, v_familia, i, e ->> 'rotulo', e ->> 'acao', coalesce(e ->> 'instrucao', ''), v_abas, p_por, (e ->> 'motor_id')::uuid,
                CASE WHEN (e ->> 'motor_id') IS NULL THEN NULL ELSE v_familia END);
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
    FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_familia_etapa', p_materia_prima::text,
          jsonb_build_object('orcamentista_familia_etapa', v_antes),
          jsonb_build_object('orcamentista_familia_etapa', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_familia_etapa', v_depois, 'etapas_removidas', v_removidas);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f regprocedure := to_regprocedure('public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)');
BEGIN
  IF f IS NULL
     OR has_function_privilege('public', f, 'EXECUTE')
     OR has_function_privilege('anon', f, 'EXECUTE')
     OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f, 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: a gravacao das etapas nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.';
  END IF;
  IF (SELECT p.prosrc FROM pg_proc p WHERE p.oid = f) LIKE '%remover etapa nao e permitido%'
     OR (SELECT p.prosrc FROM pg_proc p WHERE p.oid = f) NOT LIKE '%DELETE FROM public.orcamentista_familia_etapa WHERE id = v_rem.id;%' THEN
    RAISE EXCEPTION 'verificacao: a gravacao das etapas ainda recusa remover, ou nao remove. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'excluir etapa na conta: a gravacao remove a etapa que nao veio na lista, com log; as que ficam renumeram 1..N.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'superadmin_gravar_etapas_da_materia_prima';  -- esperado: o do corpo deste arquivo
-- select position('remover etapa nao e permitido' in prosrc) from pg_proc where proname = 'superadmin_gravar_etapas_da_materia_prima';  -- esperado: 0
-- select id, numero, rotulo from public.orcamentista_familia_etapa order by materia_prima_id, numero;  -- esperado: as 3 de hoje, intactas
