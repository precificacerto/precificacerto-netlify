-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261027000001 — o CONTEXTO DO ATENDIMENTO: uma linha por empresa, gravada por função com log.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261027000001_contexto_do_atendimento.
-- ║ SEM ELA A CONVERSA NÃO QUEBRA: a leitura do contexto trata a tabela ausente como VAZIO (o pedido
-- ║ à IA é o de hoje). Quem quebra é o bloco "Prompt de atendimento" da conta: o GET e o PUT da
-- ║ rota `/api/super-admin/base-de-conhecimento/contexto` falham sem a tabela e sem a função.
-- ║ O corpo da função entre `$fn$` É O ARTEFATO: o catálogo guarda o texto (`prosrc`). Não enxugue
-- ║ comentário de dentro do corpo sem a prova da árvore PL/pgSQL (`migracao.md`, Parte III).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 26/10/2026. A tela da conta tem três blocos: base de
-- conhecimento, motor e PROMPT DE ATENDIMENTO. "O PROMPT MANDA EM QUANDO E EM QUE FORMA. O CÓDIGO MANDA
-- EM DE ONDE VEM O NÚMERO." O contexto é texto livre, escrito pelo consultor, que vai ao prompt da
-- conversa; nenhum número da resposta sai dele.
--
-- O QUE FAZ:
--   A. `orcamentista_contexto_do_atendimento`: tenant_id (PK, FK tenants ON DELETE CASCADE), texto
--      (NOT NULL, DEFAULT ''), atualizado_por (FK users ON DELETE SET NULL), atualizado_em. CHECK
--      `char_length(texto) <= 4000` — pontos de código, como a rota e a tela contam. VAZIO É O PADRÃO:
--      sem linha, ou com o texto vazio, a conversa é a de hoje. Nenhuma linha é criada aqui.
--   B. RLS com as quatro políticas de `is_super_admin()`, e REVOKE ALL de anon e authenticated — o mesmo
--      formato das tabelas da base de conhecimento (20261022000004).
--   C. `superadmin_gravar_contexto_do_atendimento(p_tenant, p_por, p_texto)`: confere o super admin, a
--      empresa e o limite; trava por empresa; grava (INSERT ... ON CONFLICT); loga em
--      `superadmin_alteracao_log` NA MESMA TRANSAÇÃO; devolve o depois. NASCE FECHADA: SECURITY
--      DEFINER, search_path fixo, REVOKE de PUBLIC, anon e authenticated, EXECUTE só a service_role.
--
-- Sem UPDATE, sem DELETE e sem DROP: a tabela é nova, e nada é apagado — nem política.
-- IDEMPOTENTE: CREATE TABLE IF NOT EXISTS, cada política criada só se ainda não existe, CREATE OR REPLACE.
-- Uma política que já existisse com outra expressão não é trocada: a verificação 4 a acusa e aborta.
-- VERIFICAÇÃO (aborta): as colunas, a CHECK pela definição, a PK e as FKs, a RLS e as quatro políticas,
-- nenhum privilégio de anon e authenticated na tabela, e a função fechada.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.tenants') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.tenants ou public.users. Nada foi alterado.';
  END IF;
  IF to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.superadmin_alteracao_log. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.is_super_admin(). Nada foi alterado.';
  END IF;
END
$guarda$;

-- ── A. a tabela ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_contexto_do_atendimento (
  tenant_id      uuid        NOT NULL,
  texto          text        NOT NULL DEFAULT '',
  atualizado_por uuid,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_contexto_do_atendimento_pkey         PRIMARY KEY (tenant_id),
  CONSTRAINT orcamentista_contexto_do_atendimento_tenant_fk    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_contexto_do_atendimento_por_fk       FOREIGN KEY (atualizado_por) REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT orcamentista_contexto_do_atendimento_ate_4000     CHECK (char_length(texto) <= 4000)
);
COMMENT ON TABLE public.orcamentista_contexto_do_atendimento IS
  'O contexto do atendimento de cada empresa (o bloco Prompt de atendimento): como conversar - quando e em que forma. Nao decide numero: todo valor sai do calculo. Vazio e o padrao. Grava-se SO por superadmin_gravar_contexto_do_atendimento, que loga.';
COMMENT ON COLUMN public.orcamentista_contexto_do_atendimento.texto IS
  'Texto livre do consultor, ate 4000 caracteres (char_length). Vazio = o padrao: a conversa e a de sempre.';

-- ── B. RLS — as quatro políticas de is_super_admin(), e nada para anon e authenticated ─────
ALTER TABLE public.orcamentista_contexto_do_atendimento ENABLE ROW LEVEL SECURITY;
-- cria só a que ainda não existe: nada é apagado, e a segunda aplicação não muda nada
DO $politicas$
DECLARE
  t text := 'orcamentista_contexto_do_atendimento';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select_super_admin') THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_super_admin())', t || '_select_super_admin', t);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert_super_admin') THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_super_admin())', t || '_insert_super_admin', t);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update_super_admin') THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())', t || '_update_super_admin', t);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_delete_super_admin') THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_super_admin())', t || '_delete_super_admin', t);
  END IF;
END
$politicas$;
REVOKE ALL ON public.orcamentista_contexto_do_atendimento FROM anon, authenticated;

-- ── C. a função que grava, com o log na mesma transação ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_contexto_do_atendimento(
  p_tenant uuid, p_por uuid, p_texto text
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
  -- vazio vale (e a volta ao padrao); NULL nao: quem quer o padrao manda o texto vazio
  IF p_texto IS NULL THEN
    RAISE EXCEPTION 'o contexto e um texto; para voltar ao padrao, mande o texto vazio' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF char_length(p_texto) > 4000 THEN
    RAISE EXCEPTION 'o contexto tem % caracteres; o limite e 4000', char_length(p_texto) USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- FOR UPDATE nao trava linha que ainda nao existe: o advisory serializa a primeira gravacao da empresa
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_contexto_do_atendimento:' || p_tenant::text, 0));
  SELECT to_jsonb(c) INTO v_antes FROM public.orcamentista_contexto_do_atendimento c WHERE c.tenant_id = p_tenant FOR UPDATE;
  INSERT INTO public.orcamentista_contexto_do_atendimento (tenant_id, texto, atualizado_por, atualizado_em)
  VALUES (p_tenant, p_texto, p_por, now())
  ON CONFLICT (tenant_id) DO UPDATE SET texto = EXCLUDED.texto, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em;
  SELECT to_jsonb(c) INTO v_depois FROM public.orcamentista_contexto_do_atendimento c WHERE c.tenant_id = p_tenant;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_contexto_do_atendimento', p_tenant::text,
          jsonb_build_object('orcamentista_contexto_do_atendimento', v_antes),
          jsonb_build_object('orcamentista_contexto_do_atendimento', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_contexto_do_atendimento', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_gravar_contexto_do_atendimento(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_contexto_do_atendimento(uuid, uuid, text) TO service_role;

DO $verifica$
DECLARE
  t   regclass := 'public.orcamentista_contexto_do_atendimento'::regclass;
  f   regprocedure := to_regprocedure('public.superadmin_gravar_contexto_do_atendimento(uuid, uuid, text)');
  def text;
BEGIN
  -- (1) as colunas, com o tipo, a nulidade e o default
  IF (SELECT string_agg(format('%s:%s:%s:%s', column_name, data_type, is_nullable, coalesce(column_default, '-')), ', ' ORDER BY ordinal_position)
        FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_contexto_do_atendimento')
     IS DISTINCT FROM 'tenant_id:uuid:NO:-, texto:text:NO:''''::text, atualizado_por:uuid:YES:-, atualizado_em:timestamp with time zone:NO:now()' THEN
    RAISE EXCEPTION 'verificacao 1: as colunas de orcamentista_contexto_do_atendimento nao sao as esperadas. Nada foi alterado.';
  END IF;
  -- (2) a CHECK do limite, pela definicao; a PK; as duas FKs com a acao
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = t AND conname = 'orcamentista_contexto_do_atendimento_ate_4000';
  IF def IS DISTINCT FROM 'CHECK ((char_length(texto) <= 4000))' THEN
    RAISE EXCEPTION 'verificacao 2: a CHECK do limite esta ausente ou com outra definicao: %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = t AND contype = 'p') IS DISTINCT FROM 'PRIMARY KEY (tenant_id)'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = t AND conname = 'orcamentista_contexto_do_atendimento_tenant_fk')
        IS DISTINCT FROM 'FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE'
     OR (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = t AND conname = 'orcamentista_contexto_do_atendimento_por_fk')
        IS DISTINCT FROM 'FOREIGN KEY (atualizado_por) REFERENCES users(id) ON DELETE SET NULL' THEN
    RAISE EXCEPTION 'verificacao 3: a PK ou as FKs nao sao as esperadas. Nada foi alterado.';
  END IF;
  -- (3) RLS ligada e exatamente as quatro politicas de is_super_admin()
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_contexto_do_atendimento'
           AND ((cmd = 'SELECT' AND qual = 'is_super_admin()' AND with_check IS NULL)
             OR (cmd = 'INSERT' AND qual IS NULL AND with_check = 'is_super_admin()')
             OR (cmd = 'UPDATE' AND qual = 'is_super_admin()' AND with_check = 'is_super_admin()')
             OR (cmd = 'DELETE' AND qual = 'is_super_admin()' AND with_check IS NULL))) <> 4
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'orcamentista_contexto_do_atendimento') <> 4 THEN
    RAISE EXCEPTION 'verificacao 4: a RLS ou as quatro politicas de is_super_admin() nao estao como esperado. Nada foi alterado.';
  END IF;
  -- (4) nenhum privilegio de anon e authenticated na tabela
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'public'
               AND table_name = 'orcamentista_contexto_do_atendimento' AND grantee IN ('anon', 'authenticated')) THEN
    RAISE EXCEPTION 'verificacao 5: anon ou authenticated tem privilegio na tabela. Nada foi alterado.';
  END IF;
  -- (5) a funcao: existe, fechada, SECURITY DEFINER, search_path fixo
  IF f IS NULL
     OR has_function_privilege('public', f, 'EXECUTE')
     OR has_function_privilege('anon', f, 'EXECUTE')
     OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f, 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao 6: a funcao superadmin_gravar_contexto_do_atendimento nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'contexto do atendimento: tabela com o limite de 4000, RLS e quatro politicas, e a funcao fechada.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select column_name, data_type, is_nullable, column_default from information_schema.columns
--  where table_schema = 'public' and table_name = 'orcamentista_contexto_do_atendimento' order by ordinal_position;
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.orcamentista_contexto_do_atendimento'::regclass;
-- select format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), p.prosecdef, p.proconfig,
--        has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
--   from pg_proc p where p.proname = 'superadmin_gravar_contexto_do_atendimento';
-- select count(*) from public.orcamentista_contexto_do_atendimento;   -- esperado: 0 (vazio é o padrão)
