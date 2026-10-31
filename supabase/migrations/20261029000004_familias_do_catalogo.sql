-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261029000004 — AS FAMÍLIAS DO CATÁLOGO: CRIAR, EDITAR (NOME E RAMIFICAÇÕES) E REMOVER.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261029000004_familias_do_catalogo.
-- ║ SEM ELA O CÓDIGO QUEBRA: a aba Famílias do nicho chama `superadmin_criar_familia`, `superadmin_editar_familia` e
-- ║ `superadmin_remover_familia`; "Nova família" deixa de gravar direto na tabela.
-- ║ Pressupõe a 20261027000002 (o catálogo de ramificações), a 20261028000002 (o nome "PVC Wolf") e a 20261029000003 (o motor serve N
-- ║ famílias: a ligação `orcamentista_motor_familia`), conferidas em produção em 29/10/2026 (a 000003 aplicada às 18:50 UTC).
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 29/10/2026: "NO CATÁLOGO, DENTRO DO NICHO, A ABA FAMÍLIAS NÃO DEIXA FAZER NADA: não dá para editar a família que
-- existe, nem excluir, nem adicionar. [...] Agora é para fazer: criar, renomear e remover família no catálogo, com as travas que o dado exige —
-- remover família em uso é RECUSA NOMEADA, nunca cascata. A migração nasce PENDENTE."
--
-- A FAMÍLIA É O NOME E AS RAMIFICAÇÕES. A base de conhecimento mostra, numa matéria-prima com família, as categorias que a família DECLARA em
-- `orcamentista_familia_ramificacao` (`categoriasDaMateriaPrima`); a família sem ramificação mostra só as categorias com dado gravado — numa família
-- nova, nenhuma. Por isso criar e editar levam as ramificações (a PVC declara as 7, na ordem do catálogo de categorias — medido em 29/10/2026).
-- Nunca existiu tela, rota nem função que gravasse ramificação: a da PVC entrou pela 20261027000002.
--
-- O QUE FAZ — três funções, SECURITY DEFINER, `search_path` fixo, só `service_role`, com log (antes e depois):
--   A. `superadmin_criar_familia(p_por, p_chave, p_rotulo, p_ramificacoes text[])`: a chave (derivada do nome pela rota; a CHECK da forma é a
--      trava) não pode existir; o nome não repete outro (sem olhar a caixa); as ramificações são do catálogo de categorias, sem repetir, ao menos
--      uma, na ordem dada; a ordem da família é a última + 1 (sob trava de aviso, para duas criações não esbarrarem no UNIQUE).
--   B. `superadmin_editar_familia(p_por, p_chave, p_rotulo, p_ramificacoes text[])`: o NOME (a CHAVE não se renomeia — dono do produto, 28/10/2026)
--      e a lista de ramificações, que é regravada inteira (familia, categoria_chave e ordem: as três colunas da tabela vêm do corpo). Tirar uma
--      ramificação não apaga dado da base de conhecimento: a categoria com dado gravado continua aparecendo, marcada como fora da família.
--      "Nada mudou" é recusa.
--   C. `superadmin_remover_familia(p_por, p_chave)`: RECUSA NOMEADA se a família está em uso — matéria-prima (empresa · nome), tabela de
--      fornecedor (fornecedor · arquivo), motor que ATUA nela (fornecedor · arquivo; pela ligação `orcamentista_motor_familia`, 20261029000003 —
--      o motor de duas famílias também conta), etapa ou item de levantamento —, contando cada um; as chaves estrangeiras
--      continuam ON DELETE RESTRICT (nada de cascata). Sem uso, apaga as ramificações dela e a linha, numa transação, e loga o antes.
--
-- O QUE NÃO FAZ: nenhuma estrutura nova (tabela, coluna, constraint); nenhum UPDATE/DELETE de dado na aplicação; não toca na família PVC.
-- IDEMPOTENTE: CREATE OR REPLACE; reaplicada, não muda nada.
-- VERIFICAÇÃO (aborta): as três funções existem, fechadas (só service_role), com search_path fixo; as chaves estrangeiras para a família
-- continuam RESTRICT.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA: o que esta migração pressupõe ────────────────────────────────────────────────
DO $guarda$
BEGIN
  IF to_regclass('public.orcamentista_familia_catalogo') IS NULL OR to_regclass('public.orcamentista_familia_ramificacao') IS NULL
     OR to_regclass('public.orcamentista_categoria_catalogo') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL
     OR to_regclass('public.orcamentista_materia_prima') IS NULL OR to_regclass('public.orcamentista_tabela') IS NULL
     OR to_regclass('public.orcamentista_motor') IS NULL OR to_regclass('public.orcamentista_familia_etapa') IS NULL
     OR to_regclass('public.orcamentista_levantamento_item') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: o catalogo de familias e de ramificacoes (20261027000002) nao esta aplicado. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'materia_prima_id') THEN
    RAISE EXCEPTION 'dependencia ausente: a etapa nao tem materia_prima_id (a 20261028000001). Nada foi alterado.';
  END IF;
  -- a familia do motor mora na ligacao (20261029000003): sem ela, a recusa de remover nao enxergaria o motor
  IF to_regclass('public.orcamentista_motor_familia') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: a ligacao motor-familia (20261029000003) nao esta aplicada. Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. CRIAR ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_criar_familia(
  p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rotulo     text := btrim(coalesce(p_rotulo, ''));
  v_igual      text;
  v_fora       text;
  v_ordem      integer;
  v_depois     jsonb;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
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
  SELECT coalesce(max(f.ordem), 0) + 1 INTO v_ordem FROM public.orcamentista_familia_catalogo f;

  BEGIN
    INSERT INTO public.orcamentista_familia_catalogo (chave, rotulo, ordem) VALUES (p_chave, v_rotulo, v_ordem);
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_familia_catalogo_chave_forma' THEN 'a chave da familia e maiuscula, comeca por letra e tem ate 40 caracteres (letras, digitos e _). Nada foi gravado.'
      WHEN 'orcamentista_familia_catalogo_rotulo_forma' THEN 'o nome da familia tem de 1 a 60 caracteres. Nada foi gravado.'
      ELSE 'um valor nao passou numa regra do banco. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;
  INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)
  SELECT p_chave, x, n::integer FROM unnest(p_ramificacoes) WITH ORDINALITY AS r(x, n);

  v_depois := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ordem) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_catalogo', p_chave, NULL, v_depois, p_por);
  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[]) TO service_role;

-- ── B. EDITAR: o nome e as ramificações (a chave não se renomeia) ──────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_editar_familia(
  p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rotulo     text := btrim(coalesce(p_rotulo, ''));
  v_igual      text;
  v_fora       text;
  v_antes      jsonb;
  v_depois     jsonb;
  v_atuais     text[];
  v_rotulo_era text;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
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

  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_familia_catalogo', 0));
  SELECT f.rotulo INTO v_rotulo_era FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'familia inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT f.rotulo INTO v_igual FROM public.orcamentista_familia_catalogo f WHERE f.chave <> p_chave AND lower(btrim(f.rotulo)) = lower(v_rotulo) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a familia "%": o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(array_agg(r.categoria_chave ORDER BY r.ordem), '{}') INTO v_atuais FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave;
  IF v_rotulo_era = v_rotulo AND v_atuais = p_ramificacoes THEN
    RAISE EXCEPTION 'nada mudou: o nome e as ramificacoes sao os de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_antes := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.ordem), '[]'::jsonb) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));

  BEGIN
    UPDATE public.orcamentista_familia_catalogo SET rotulo = v_rotulo WHERE chave = p_chave;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_familia_catalogo_rotulo_forma' THEN 'o nome da familia tem de 1 a 60 caracteres. Nada foi gravado.'
      ELSE 'um valor nao passou numa regra do banco. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;
  -- a lista e regravada inteira: as tres colunas (familia, categoria_chave, ordem) vem do corpo; nenhuma outra tabela aponta a ramificacao
  DELETE FROM public.orcamentista_familia_ramificacao WHERE familia = p_chave;
  INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)
  SELECT p_chave, x, n::integer FROM unnest(p_ramificacoes) WITH ORDINALITY AS r(x, n);

  v_depois := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ordem) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_catalogo', p_chave, v_antes, v_depois, p_por);
  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_editar_familia(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_familia(uuid, text, text, text[]) TO service_role;

-- ── C. REMOVER: em uso é recusa NOMEADA; sem uso, sai com as ramificações ──────────────────
CREATE OR REPLACE FUNCTION public.superadmin_remover_familia(
  p_por uuid, p_chave text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rotulo   text;
  v_antes    jsonb;
  v_mps      integer;
  v_tabelas  integer;
  v_motores  integer;
  v_etapas   integer;
  v_itens    integer;
  v_nomes    text;
  v_partes   text[] := '{}';
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- FOR UPDATE na linha da familia: quem for aponta-la (FK, FOR KEY SHARE) espera esta transacao; e esta so conta o uso depois de quem ja apontou
  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_familia_catalogo', 0));
  SELECT f.rotulo INTO v_rotulo FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'familia inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT count(*) INTO v_mps FROM public.orcamentista_materia_prima m WHERE m.familia = p_chave;
  SELECT count(*) INTO v_tabelas FROM public.orcamentista_tabela t WHERE t.familia = p_chave;
  SELECT count(*) INTO v_motores FROM public.orcamentista_motor_familia mf WHERE mf.familia = p_chave;
  SELECT count(*) INTO v_etapas FROM public.orcamentista_familia_etapa e WHERE e.familia = p_chave;
  SELECT count(*) INTO v_itens FROM public.orcamentista_levantamento_item i WHERE i.familia = p_chave;

  IF v_mps > 0 THEN
    SELECT string_agg(x, ', ') INTO v_nomes FROM (
      SELECT coalesce(t.name, '(sem nome)') || ' / ' || m.nome AS x
        FROM public.orcamentista_materia_prima m LEFT JOIN public.tenants t ON t.id = m.tenant_id
       WHERE m.familia = p_chave ORDER BY 1 LIMIT 3) z;
    v_partes := v_partes || format('%s materia(s)-prima(s) (%s%s)', v_mps, v_nomes, CASE WHEN v_mps > 3 THEN format(' e mais %s', v_mps - 3) ELSE '' END);
  END IF;
  IF v_tabelas > 0 THEN
    SELECT string_agg(x, ', ') INTO v_nomes FROM (
      SELECT coalesce(fo.nome, '(fornecedor removido)') || ' / ' || t.arquivo_nome AS x
        FROM public.orcamentista_tabela t LEFT JOIN public.orcamentista_fornecedor fo ON fo.id = t.fornecedor_id
       WHERE t.familia = p_chave ORDER BY 1 LIMIT 3) z;
    v_partes := v_partes || format('%s tabela(s) de fornecedor (%s%s)', v_tabelas, v_nomes, CASE WHEN v_tabelas > 3 THEN format(' e mais %s', v_tabelas - 3) ELSE '' END);
  END IF;
  IF v_motores > 0 THEN
    SELECT string_agg(x, ', ') INTO v_nomes FROM (
      SELECT coalesce(fo.nome, '(fornecedor removido)') || ' / ' || m.arquivo_nome AS x
        FROM public.orcamentista_motor_familia mf JOIN public.orcamentista_motor m ON m.id = mf.motor_id
        LEFT JOIN public.orcamentista_fornecedor fo ON fo.id = m.fornecedor_id
       WHERE mf.familia = p_chave ORDER BY 1 LIMIT 3) z;
    v_partes := v_partes || format('%s motor(es) (%s%s)', v_motores, v_nomes, CASE WHEN v_motores > 3 THEN format(' e mais %s', v_motores - 3) ELSE '' END);
  END IF;
  IF v_etapas > 0 THEN
    v_partes := v_partes || format('%s etapa(s)', v_etapas);
  END IF;
  IF v_itens > 0 THEN
    v_partes := v_partes || format('%s item(ns) de levantamento', v_itens);
  END IF;
  IF cardinality(v_partes) > 0 THEN
    RAISE EXCEPTION 'a familia "%" esta em uso: %. Tire o uso antes de remover. Nada foi removido.', v_rotulo, array_to_string(v_partes, '; ')
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_antes := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.ordem), '[]'::jsonb) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));
  -- as ramificacoes sao a definicao da familia, nao uso dela: saem junto, explicitamente (a FK continua RESTRICT)
  DELETE FROM public.orcamentista_familia_ramificacao WHERE familia = p_chave;
  DELETE FROM public.orcamentista_familia_catalogo WHERE chave = p_chave;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_catalogo', p_chave, v_antes, NULL, p_por);
  RETURN jsonb_build_object('removida', p_chave);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_remover_familia(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_remover_familia(uuid, text) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
  v_n  integer;
BEGIN
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_criar_familia(uuid, text, text, text[])',
    'public.superadmin_editar_familia(uuid, text, text, text[])',
    'public.superadmin_remover_familia(uuid, text)'
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
  -- nada de cascata: toda FK que aponta a familia continua RESTRICT (confdeltype 'r')
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.contype = 'f' AND c.confrelid = 'public.orcamentista_familia_catalogo'::regclass AND c.confdeltype <> 'r';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verificacao: % chave(s) estrangeira(s) para a familia nao sao RESTRICT. Nada foi alterado.', v_n;
  END IF;
  RAISE NOTICE 'familias do catalogo: criar, editar e remover - tres funcoes fechadas, com search_path fixo; FKs RESTRICT.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proname, pg_get_function_identity_arguments(oid), proconfig from pg_proc
--  where proname in ('superadmin_criar_familia', 'superadmin_editar_familia', 'superadmin_remover_familia');   -- esperado: 3 linhas, search_path fixo
-- select chave, rotulo, ordem from public.orcamentista_familia_catalogo;                                          -- esperado: PVC | PVC Wolf | 1 (nada mudou)
