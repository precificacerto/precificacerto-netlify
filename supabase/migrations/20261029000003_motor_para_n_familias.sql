-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261029000003 — O MOTOR SERVE N FAMÍLIAS E UMA CATEGORIA (a ligação motor ↔ família em tabela própria).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261029000003_motor_para_n_familias.
-- ║ PRESSUPÕE aplicada a 20261029000002 (e as anteriores) — conferida em produção em 29/10/2026: o motor tem `familia` e a coluna gerada
-- ║ `familia_exigida`; a etapa e o item têm `motor_familia_exigida`, com a FK para `motor (id, familia_exigida)`; nenhum `'*'` em uso.
-- ║ SEM ELA O CÓDIGO QUEBRA: o catálogo de motores lê `orcamentista_motor_familia`, o "Novo motor" chama `superadmin_criar_motor` com
-- ║ `p_familias text[]`, e a edição chama `superadmin_editar_motor` com `p_familias text[]` (as assinaturas de hoje têm `p_familia text`).
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 29/10/2026 (substitui o item 6; a 20261029000002 fica como está):
--   "A gente define, bota o arquivo do motor, a qual categoria ele pertence e para quais famílias ele atua." E: "Medido: nenhum '*' em uso [...]
--   Dados limpos, então o '*' sai de cena — todo motor passa a listar famílias explicitamente."
--   O MOTOR SERVE N FAMÍLIAS E UMA CATEGORIA: a categoria continua coluna do motor (`categoria_chave`); as famílias vão para a tabela de ligação.
--
-- O QUE FAZ:
--   A. GUARDAS que abortam ANTES de qualquer mudança: a 20261029000002 aplicada e as funções que esta substitui; todo motor com `familia` não nula
--      (o motor sem família ficaria sem ligação nenhuma, e dar família a ele não foi autorizado); nenhuma etapa e nenhum item com a exigida `'*'`
--      (a CHECK nova o recusaria, e mudar o dado não foi autorizado).
--   B. `orcamentista_motor_familia (motor_id, familia)`, PK das duas; `motor_id` -> motor ON DELETE CASCADE; `familia` -> catálogo ON DELETE RESTRICT;
--      índice por `familia` (a recusa de remover família do catálogo procura por ela). RLS ligada com as MESMAS quatro políticas de
--      `orcamentista_motor`, lidas do banco em 29/10/2026 (`is_super_admin()`, para public; o INSERT só com check; o UPDATE com using e check), e
--      os mesmos grants: nenhum para PUBLIC, anon e authenticated; tudo para service_role.
--   C. SEMEIO a partir de `motor.familia IS NOT NULL`: uma ligação por motor, com o motor e a família no `superadmin_alteracao_log`. Mede as
--      contagens antes e depois e ABORTA se diferirem. Medido em produção em 29/10/2026: 1 motor (o da Wolff, PERFIL, PVC) -> 1 ligação.
--   D. TODO MOTOR TEM PELO MENOS UMA FAMÍLIA — a trava é um CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED (a escolha, justificada, logo abaixo).
--   E. Na etapa e no item: a CHECK da exigida perde o `'*'` — `(motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL
--      OR motor_familia_exigida = familia)` —, e a FK `(motor_id, motor_familia_exigida)` passa a apontar a LIGAÇÃO
--      (`orcamentista_motor_familia (motor_id, familia)`, ON DELETE RESTRICT), com o mesmo nome. Uma etapa de família X só aponta motor que atua em X.
--   F. Saem do motor: a CHECK `orcamentista_motor_familia_so_no_perfil`, o UNIQUE `orcamentista_motor_id_familia_exigida_key`, a coluna gerada
--      `familia_exigida`, a FK `orcamentista_motor_familia_fkey` e a coluna `familia`. `categoria_chave` FICA.
--   G. Funções:
--      - `superadmin_criar_motor(p_por, p_fornecedor, p_categoria, p_familias text[], p_arquivo_path, p_arquivo_nome, p_payload)`: as famílias são
--        uma lista (pelo menos uma, sem repetição, todas do catálogo; a recusa nomeia), gravadas na ligação DEPOIS do motor, na mesma transação, e
--        no log da criação. Sai a assinatura com `p_familia text`.
--      - `superadmin_editar_motor(p_por, p_motor, p_fornecedor, p_categoria, p_familias text[], p_arquivo_path)`: fornecedor e categoria continuam
--        SÓ SEM USO; as FAMÍLIAS se editam COM USO, mas a família que SAI e alguma etapa ou item usa é RECUSA (restrict_violation, 23001) que nomeia
--        quem usa — empresa / família-instância / etapa, e o levantamento do item. A FK RESTRICT da etapa e do item é a trava; a função dá a frase.
--        Sai a assinatura com `p_familia text`.
--      - `superadmin_gravar_etapas_da_materia_prima`: o motor apontado tem de atuar na família da etapa (a recusa nomeia a família); a exigida é a
--        família da etapa quando há motor, e nula quando não há.
--      - `superadmin_trocar_arquivo_do_motor`: o motor novo nasce com as MESMAS famílias do antigo; as etapas reapontadas guardam a exigida.
--      `superadmin_arquivar_motor` não muda (não lê a família do motor).
--
-- POR QUE UM CONSTRAINT TRIGGER ADIADO, E NÃO UMA COLUNA DE CONTAGEM (a escolha que o dono do produto pediu justificada):
--   1. Coluna de contagem + CHECK (n >= 1): a CHECK não é adiável no Postgres — é conferida a cada comando. O motor nasce ANTES da ligação (a FK da
--      ligação exige o motor), então o INSERT do motor teria n = 0 e seria recusado: a trava IMPEDIRIA A CRIAÇÃO, que é o que não pode.
--   2. Coluna de contagem sem CHECK (mantida por gatilho): não garante nada — a contagem pode ser 0, e é ela que diria "zero".
--   3. O gatilho de restrição ADIADO (`CREATE CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`) roda no COMMIT: o motor e as ligações da
--      mesma transação já estão lá. É DECLARADO no catálogo de constraints (`pg_constraint`, contype 't', com nome) e vale em TODO caminho — a
--      função, um INSERT direto, o CASCADE —, não só onde uma função lembrar de conferir. Dispara no INSERT do motor e no DELETE (ou na troca de
--      `motor_id`) de uma ligação; o motor que saiu (CASCADE) não é conferido. A corrida de duas transações que tiram, cada uma, uma família
--      diferente do mesmo motor: a função trava a linha do motor (FOR UPDATE) antes de contar; a segunda espera o COMMIT da primeira e conta de
--      novo, com o que ela gravou (READ COMMITTED, o isolamento de toda chamada pela API; provado no harness, corrida 2).
--
-- O QUE NÃO FAZ: não toca nas 62.299 linhas do motor da Wolff, nos tempos, nas tabelas de preço, nas etapas (as 3 já exigem 'PVC', a família
-- delas, e continuam) nem nos itens (nenhum tem motor). Nenhum UPDATE de dado; nenhum DELETE de linha. Os DROP são de constraints e de duas
-- colunas do motor, substituídas pela ligação na mesma transação, e das duas assinaturas antigas.
--
-- IDEMPOTENTE: as guardas olham só o que falta fazer; tabela, índice, políticas, gatilhos e constraints com IF (NOT) EXISTS; o semeio só roda
-- enquanto a coluna `familia` existir. Reaplicada, não loga nada de novo.
-- VERIFICAÇÃO (aborta): a estrutura, as definições das constraints, todo motor com pelo menos uma ligação, e as funções fechadas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A. AS GUARDAS ──────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_n_etapa integer;
  v_n_item  integer;
  v_n       integer;
BEGIN
  IF to_regclass('public.orcamentista_levantamento_item') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL
     OR to_regprocedure('public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)') IS NULL
     OR to_regprocedure('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)') IS NULL
     OR (to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)') IS NULL
         AND to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb)') IS NULL)
     OR (to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)') IS NULL
         AND to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text)') IS NULL)
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'motor_familia_exigida')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_levantamento_item' AND column_name = 'motor_familia_exigida')
     OR (to_regclass('public.orcamentista_motor_familia') IS NULL
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'familia_exigida')) THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261029000002 (a familia exigida na etapa e no item) e as anteriores nao estao aplicadas. Nada foi alterado.';
  END IF;

  -- todo motor com familia: o semeio da a cada um a sua; o motor sem familia ficaria sem ligacao, e dar familia a ele nao foi autorizado
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'familia') THEN
    EXECUTE 'SELECT count(*) FROM public.orcamentista_motor m WHERE m.familia IS NULL' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'guarda: % motor(es) sem familia; todo motor passa a atuar em pelo menos uma familia, e dar familia a eles nao foi autorizado. Nada foi alterado.', v_n;
    END IF;
  END IF;

  -- nenhum '*': a CHECK nova exige a familia da linha, e trocar o dado nao foi autorizado
  SELECT count(*) INTO v_n_etapa FROM public.orcamentista_familia_etapa e WHERE e.motor_familia_exigida = '*';
  SELECT count(*) INTO v_n_item FROM public.orcamentista_levantamento_item x WHERE x.motor_familia_exigida = '*';
  IF v_n_etapa > 0 OR v_n_item > 0 THEN
    RAISE EXCEPTION 'guarda: % etapa(s) e % item(ns) de levantamento apontam motor sem familia (exigida ''*''); o ''*'' sai, e escolher a familia deles nao foi autorizado. Nada foi alterado.',
      v_n_etapa, v_n_item;
  END IF;
END
$guarda$;

-- ── B. A LIGAÇÃO motor ↔ família ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_motor_familia (
  motor_id uuid NOT NULL,
  familia  text NOT NULL,
  CONSTRAINT orcamentista_motor_familia_pkey PRIMARY KEY (motor_id, familia),
  CONSTRAINT orcamentista_motor_familia_motor_fkey FOREIGN KEY (motor_id) REFERENCES public.orcamentista_motor (id) ON DELETE CASCADE,
  CONSTRAINT orcamentista_motor_familia_familia_fkey FOREIGN KEY (familia) REFERENCES public.orcamentista_familia_catalogo (chave) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS orcamentista_motor_familia_familia_idx ON public.orcamentista_motor_familia (familia);

-- as MESMAS politicas e grants de orcamentista_motor (lidos do banco em 29/10/2026)
ALTER TABLE public.orcamentista_motor_familia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcamentista_motor_familia FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.orcamentista_motor_familia TO service_role;
DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.orcamentista_motor_familia'::regclass AND polname = 'orcamentista_motor_familia_select_super_admin') THEN
    CREATE POLICY orcamentista_motor_familia_select_super_admin ON public.orcamentista_motor_familia FOR SELECT USING (public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.orcamentista_motor_familia'::regclass AND polname = 'orcamentista_motor_familia_insert_super_admin') THEN
    CREATE POLICY orcamentista_motor_familia_insert_super_admin ON public.orcamentista_motor_familia FOR INSERT WITH CHECK (public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.orcamentista_motor_familia'::regclass AND polname = 'orcamentista_motor_familia_update_super_admin') THEN
    CREATE POLICY orcamentista_motor_familia_update_super_admin ON public.orcamentista_motor_familia FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.orcamentista_motor_familia'::regclass AND polname = 'orcamentista_motor_familia_delete_super_admin') THEN
    CREATE POLICY orcamentista_motor_familia_delete_super_admin ON public.orcamentista_motor_familia FOR DELETE USING (public.is_super_admin());
  END IF;
END
$rls$;

-- ── C. O SEMEIO: a família de cada motor vira a primeira ligação dele (antes e depois medidos) ──
DO $semeio$
DECLARE
  v_antes  integer;
  v_depois integer;
  v_novas  integer := 0;
  r        record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'familia') THEN
    RETURN;  -- reaplicada: a coluna ja saiu, e o semeio ja foi feito
  END IF;
  EXECUTE 'SELECT count(*) FROM public.orcamentista_motor m WHERE m.familia IS NOT NULL' INTO v_antes;
  FOR r IN EXECUTE 'SELECT m.id, m.familia FROM public.orcamentista_motor m
                     WHERE m.familia IS NOT NULL
                       AND NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = m.id AND mf.familia = m.familia)
                     ORDER BY m.id FOR UPDATE OF m'
  LOOP
    INSERT INTO public.orcamentista_motor_familia (motor_id, familia) VALUES (r.id, r.familia);
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (NULL, 'orcamentista_motor_familia', r.id::text,
            jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = r.id),
                               'migracao', '20261029000003_motor_para_n_familias'),
            jsonb_build_object('orcamentista_motor_familia', jsonb_build_array(jsonb_build_object('motor_id', r.id, 'familia', r.familia))),
            NULL);
    v_novas := v_novas + 1;
  END LOOP;
  SELECT count(*) INTO v_depois FROM public.orcamentista_motor_familia;
  IF v_depois <> v_antes THEN
    RAISE EXCEPTION 'semeio: % motor(es) com familia antes e % ligacao(oes) depois. Nada foi alterado.', v_antes, v_depois;
  END IF;
  RAISE NOTICE 'semeio: % motor(es) com familia antes, % ligacao(oes) depois (% gravada(s) agora)', v_antes, v_depois, v_novas;
END
$semeio$;

-- ── D. TODO MOTOR TEM PELO MENOS UMA FAMÍLIA (gatilho de restrição adiado: roda no COMMIT) ──
CREATE OR REPLACE FUNCTION public.orcamentista_motor_confere_familias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_motor uuid;
BEGIN
  IF TG_TABLE_NAME = 'orcamentista_motor' THEN
    v_motor := NEW.id;
  ELSE
    v_motor := OLD.motor_id;
  END IF;
  -- trava o motor: duas transacoes que tiram, cada uma, uma familia do mesmo motor se enfileiram aqui, e a segunda conta com o que a primeira gravou
  PERFORM 1 FROM public.orcamentista_motor m WHERE m.id = v_motor FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;  -- o motor saiu (o CASCADE leva as ligacoes dele)
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = v_motor) THEN
    RAISE EXCEPTION 'o motor % ficou sem familia: todo motor atua em pelo menos uma familia', v_motor
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orcamentista_motor_sem_familia';
  END IF;
  RETURN NULL;
END
$fn$;
REVOKE ALL ON FUNCTION public.orcamentista_motor_confere_familias() FROM PUBLIC, anon, authenticated;

DO $d$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orcamentista_motor'::regclass AND tgname = 'orcamentista_motor_sem_familia') THEN
    CREATE CONSTRAINT TRIGGER orcamentista_motor_sem_familia
      AFTER INSERT ON public.orcamentista_motor
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.orcamentista_motor_confere_familias();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orcamentista_motor_familia'::regclass AND tgname = 'orcamentista_motor_sem_familia') THEN
    CREATE CONSTRAINT TRIGGER orcamentista_motor_sem_familia
      AFTER DELETE OR UPDATE OF motor_id ON public.orcamentista_motor_familia
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION public.orcamentista_motor_confere_familias();
  END IF;
END
$d$;

-- ── E. A etapa e o item: a exigida é a família da linha, e a FK aponta a ligação ───────────
DO $e$
DECLARE
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY['orcamentista_familia_etapa', 'orcamentista_levantamento_item'] LOOP
    -- a FK para o motor (id, familia_exigida) sai; a nova, para a ligacao, entra com o mesmo nome
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey'
                  AND confrelid = 'public.orcamentista_motor'::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', nome, nome || '_motor_exigida_fkey');
    END IF;
    -- a CHECK com o '*' sai; a nova exige a familia da linha
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_familia_exigida'
                  AND pg_get_constraintdef(oid) LIKE '%''*''%') THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', nome, nome || '_motor_familia_exigida');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_familia_exigida') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL OR motor_familia_exigida = familia))',
                     nome, nome || '_motor_familia_exigida');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor_familia (motor_id, familia) ON DELETE RESTRICT',
                     nome, nome || '_motor_exigida_fkey');
    END IF;
  END LOOP;
END
$e$;

-- ── F. O que sai do motor (categoria_chave fica) ───────────────────────────────────────────
ALTER TABLE public.orcamentista_motor DROP CONSTRAINT IF EXISTS orcamentista_motor_familia_so_no_perfil;
ALTER TABLE public.orcamentista_motor DROP CONSTRAINT IF EXISTS orcamentista_motor_id_familia_exigida_key;
ALTER TABLE public.orcamentista_motor DROP COLUMN IF EXISTS familia_exigida;
ALTER TABLE public.orcamentista_motor DROP CONSTRAINT IF EXISTS orcamentista_motor_familia_fkey;
ALTER TABLE public.orcamentista_motor DROP COLUMN IF EXISTS familia;

-- ── G1. GRAVAR ETAPAS: o motor tem de atuar na família da etapa ───────────────────────────
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
  v_sem        record;
  v_constraint text;
  v_marq       timestamptz;
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

  -- NAO REMOVE: etapa que existe e nao veio na lista e recusa, nomeada
  SELECT x.numero, x.rotulo INTO v_sem
    FROM public.orcamentista_familia_etapa x
   WHERE x.materia_prima_id = p_materia_prima AND NOT (x.id = ANY (v_ids))
   ORDER BY x.numero LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'a etapa % ("%") nao veio na lista: remover etapa nao e permitido por aqui', v_sem.numero, v_sem.rotulo USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.numero), '[]'::jsonb) INTO v_antes
    FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima;

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

  RETURN jsonb_build_object('orcamentista_familia_etapa', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) TO service_role;

-- ── G2. CRIAR MOTOR: as famílias numa lista, gravadas na ligação ──────────────────────────
DROP FUNCTION IF EXISTS public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.superadmin_criar_motor(
  p_por uuid, p_fornecedor uuid, p_categoria text, p_familias text[], p_arquivo_path text, p_arquivo_nome text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '35s'
AS $fn$
DECLARE
  v_motor         uuid;
  v_prefixo       text;
  v_path          text := btrim(p_arquivo_path);
  v_nome          text := btrim(p_arquivo_nome);
  v_importacao_id uuid;
  v_regras        integer;
  v_tipologias    integer;
  v_formulas      integer;
  v_detalhes      integer;
  v_formulas_da_tipologia integer;
  v_perfis        integer;
  v_vidros        integer;
  v_baguetes      integer;
  v_insumos       integer;
  v_variaveis_da_tipologia integer;
  v_validacoes    integer;
  v_otimizacao    integer;
  v_familias      text[];
  v_msg           text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_payload IS NULL OR v_path IS NULL OR v_path = '' OR v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'arquivo (caminho e nome) e payload sao obrigatorios. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_fornecedor IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = p_fornecedor) THEN
    RAISE EXCEPTION 'fornecedor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- as FAMILIAS em que o motor atua (20261029000003): pelo menos uma, sem repeticao, todas do catalogo; a recusa nomeia, antes de ler o payload.
  -- O gatilho orcamentista_motor_sem_familia (no COMMIT) e a trava do "pelo menos uma"; a FK da ligacao, a do catalogo.
  IF p_familias IS NULL OR cardinality(p_familias) = 0 THEN
    RAISE EXCEPTION 'o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF array_position(p_familias, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'uma familia da lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(d.f, ', ' ORDER BY d.f) INTO v_msg FROM (SELECT f FROM unnest(p_familias) f GROUP BY f HAVING count(*) > 1) d;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'a familia % aparece mais de uma vez na lista. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(f, ', ' ORDER BY f) INTO v_msg FROM unnest(p_familias) f
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo c WHERE c.chave = f);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'familia fora do catalogo: %. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_familias := ARRAY(SELECT f FROM unnest(p_familias) f ORDER BY f);

  -- o arquivo mora na pasta de motor DO FORNECEDOR: o caminho que a rota assinou, e nenhum outro
  v_prefixo := p_fornecedor::text || '/motor/';
  IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN
    RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF jsonb_typeof(p_payload->'regras') IS DISTINCT FROM 'array'
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
    RAISE EXCEPTION 'Payload invalido: regras, tipologias, formulas, avisos e as nove abas do motor tem de ser listas, e contagens um objeto. Nada foi gravado.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_payload ? 'itens' AND jsonb_typeof(p_payload->'itens') = 'array' AND jsonb_array_length(p_payload->'itens') > 0 THEN
    RAISE EXCEPTION 'Payload invalido: o motor da familia nao leva itens de preco. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (p_payload->'contagens'->>'normalizados') IS NULL THEN
    RAISE EXCEPTION 'Payload invalido: contagens sem normalizados. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_array_length(p_payload->'detalhes') = 0 THEN
    RAISE EXCEPTION 'O arquivo nao traz nenhuma tipologia: um motor sem tipologia nao e motor. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1. o motor: do catalogo, com fornecedor e categoria; nao aponta etapa nenhuma (quem escolhe e a etapa). Depois dele, na mesma transacao, as
  --    familias em que atua (a ligacao exige o motor; o gatilho adiado confere, no COMMIT, que ele tem pelo menos uma)
  INSERT INTO public.orcamentista_motor (fornecedor_id, categoria_chave, arquivo_nome, arquivo_path, criado_por)
  VALUES (p_fornecedor, p_categoria, v_nome, v_path, p_por)
  RETURNING id INTO v_motor;
  INSERT INTO public.orcamentista_motor_familia (motor_id, familia) SELECT v_motor, f FROM unnest(v_familias) f;

  -- 2. o conteudo, por motor_id (as mesmas listas e colunas de importar_conteudo_da_tabela, sem os itens de preco)
  INSERT INTO public.orcamentista_motor_regra (
    motor_id, codigo, descricao, segmento, cor, codigo_wvetro, linha, tipo, eixo, corte,
    formula_medida, formula_em_lh, formula_qtde, condicao, obs, tipologias
  )
  SELECT
    v_motor, x.codigo, x.descricao, x.segmento, x.cor, x.codigo_wvetro, x.linha, x.tipo, x.eixo, x.corte,
    x.formula_medida, x.formula_em_lh, x.formula_qtde, x.condicao, x.obs, x.tipologias
  FROM jsonb_to_recordset(p_payload->'regras') AS x(
    codigo text, descricao text, segmento text, cor text, codigo_wvetro text, linha text, tipo text, eixo text,
    corte text, formula_medida text, formula_em_lh text, formula_qtde text, condicao text, obs text, tipologias text[]
  );
  GET DIAGNOSTICS v_regras = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_tipologia (motor_id, tipologia, linha, n_regras, n_condicionais, variaveis)
  SELECT v_motor, x.tipologia, x.linha, x.n_regras, x.n_condicionais, x.variaveis
  FROM jsonb_to_recordset(p_payload->'tipologias') AS x(
    tipologia text, linha text, n_regras integer, n_condicionais integer, variaveis text[]
  );
  GET DIAGNOSTICS v_tipologias = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula_familia (
    motor_id, linha, linha_original, variavel, descricao, formula, formula_em_lh, pct_padrao
  )
  SELECT v_motor, x.linha, x.linha_original, x.variavel, x.descricao, x.formula, x.formula_em_lh, x.pct_padrao
  FROM jsonb_to_recordset(p_payload->'formulas') AS x(
    linha text, linha_original text, variavel text, descricao text, formula text, formula_em_lh text, pct_padrao numeric
  );
  GET DIAGNOSTICS v_formulas = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_tipologia_detalhe (motor_id, ordem, linha, tipologia, descricao, tipo, larg_min_mm, larg_max_mm, alt_min_mm, alt_max_mm, fonte_limite, n_perfis, n_vidros, n_insumos)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.descricao, x.tipo, x.larg_min_mm, x.larg_max_mm, x.alt_min_mm, x.alt_max_mm, x.fonte_limite, x.n_perfis, x.n_vidros, x.n_insumos
  FROM jsonb_to_recordset(p_payload->'detalhes') AS x(ordem integer, linha text, tipologia text, descricao text, tipo text, larg_min_mm integer, larg_max_mm integer, alt_min_mm integer, alt_max_mm integer, fonte_limite text, n_perfis integer, n_vidros integer, n_insumos integer);
  GET DIAGNOSTICS v_detalhes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_formula (motor_id, ordem, linha, tipologia, variavel, descricao, formula)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.formula
  FROM jsonb_to_recordset(p_payload->'formulas_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, formula text);
  GET DIAGNOSTICS v_formulas_da_tipologia = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_perfil (motor_id, ordem, linha, tipologia, perfil, descricao, corte, qtd, medida, posicao, esp_vidro, condicao, obs)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.perfil, x.descricao, x.corte, x.qtd, x.medida, x.posicao, x.esp_vidro, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'perfis') AS x(ordem integer, linha text, tipologia text, perfil text, descricao text, corte text, qtd text, medida text, posicao text, esp_vidro text, condicao text, obs text);
  GET DIAGNOSTICS v_perfis = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_vidro (motor_id, ordem, linha, tipologia, vidro, largura, altura, qtd, fixacao, condicao)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.vidro, x.largura, x.altura, x.qtd, x.fixacao, x.condicao
  FROM jsonb_to_recordset(p_payload->'vidros') AS x(ordem integer, linha text, tipologia text, vidro text, largura text, altura text, qtd text, fixacao text, condicao text);
  GET DIAGNOSTICS v_vidros = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_baguete (motor_id, ordem, linha, tipologia, baguete, descricao, espessuras_vidro, qtd_medida_condicao)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.baguete, x.descricao, x.espessuras_vidro, x.qtd_medida_condicao
  FROM jsonb_to_recordset(p_payload->'baguetes') AS x(ordem integer, linha text, tipologia text, baguete text, descricao text, espessuras_vidro text, qtd_medida_condicao text);
  GET DIAGNOSTICS v_baguetes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_insumo (motor_id, ordem, linha, tipologia, insumo, descricao, qtd, condicao, obs)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.insumo, x.descricao, x.qtd, x.condicao, x.obs
  FROM jsonb_to_recordset(p_payload->'insumos') AS x(ordem integer, linha text, tipologia text, insumo text, descricao text, qtd text, condicao text, obs text);
  GET DIAGNOSTICS v_insumos = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_variavel (motor_id, ordem, linha, tipologia, variavel, descricao, padrao, min_max, condicao, opcoes)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.variavel, x.descricao, x.padrao, x.min_max, x.condicao, x.opcoes
  FROM jsonb_to_recordset(p_payload->'variaveis_da_tipologia') AS x(ordem integer, linha text, tipologia text, variavel text, descricao text, padrao text, min_max text, condicao text, opcoes text);
  GET DIAGNOSTICS v_variaveis_da_tipologia = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_validacao (motor_id, ordem, linha, tipologia, condicao_valida, mensagem)
  SELECT v_motor, x.ordem, x.linha, x.tipologia, x.condicao_valida, x.mensagem
  FROM jsonb_to_recordset(p_payload->'validacoes') AS x(ordem integer, linha text, tipologia text, condicao_valida text, mensagem text);
  GET DIAGNOSTICS v_validacoes = ROW_COUNT;

  INSERT INTO public.orcamentista_motor_otimizacao (motor_id, ordem, parametro, valor)
  SELECT v_motor, x.ordem, x.parametro, x.valor
  FROM jsonb_to_recordset(p_payload->'otimizacao') AS x(ordem integer, parametro text, valor text);
  GET DIAGNOSTICS v_otimizacao = ROW_COUNT;

  -- 3. o registro da importacao (sem itens de preco e sem cruzamento: o arquivo do motor nao traz preco)
  INSERT INTO public.orcamentista_importacao (motor_id, importado_por, itens, regras, tipologias, cruzam, nao_cruzam, normalizados, avisos)
  VALUES (v_motor, p_por, 0, v_regras, v_tipologias, 0, 0, (p_payload->'contagens'->>'normalizados')::integer, p_payload->'avisos')
  RETURNING id INTO v_importacao_id;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', v_motor::text, NULL,
          jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = v_motor),
                             'familias', to_jsonb(v_familias),
                             'importacao_id', v_importacao_id, 'regras', v_regras, 'tipologias', v_detalhes),
          p_por);

  RETURN jsonb_build_object(
    'motor_id',        v_motor,
    'importacao_id',   v_importacao_id,
    'regras',          v_regras,
    'tipologias',      v_tipologias,
    'formulas',        v_formulas,
    'detalhes',        v_detalhes,
    'formulas_da_tipologia', v_formulas_da_tipologia,
    'perfis',          v_perfis,
    'vidros',          v_vidros,
    'baguetes',        v_baguetes,
    'insumos',         v_insumos,
    'variaveis_da_tipologia', v_variaveis_da_tipologia,
    'validacoes',      v_validacoes,
    'otimizacao',      v_otimizacao
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb) TO service_role;

-- ── G3. EDITAR: fornecedor e categoria só sem uso; as famílias com uso, e a que sai em uso é recusa nomeada ──
DROP FUNCTION IF EXISTS public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.superadmin_editar_motor(
  p_por uuid, p_motor uuid, p_fornecedor uuid, p_categoria text, p_familias text[], p_arquivo_path text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes    jsonb;
  v_depois   jsonb;
  v_atual    public.orcamentista_motor%ROWTYPE;
  v_path     text := btrim(coalesce(p_arquivo_path, ''));
  v_prefixo  text;
  v_etapas   integer;
  v_itens    integer;
  v_msg      text;
  v_quem     text;
  v_origem   boolean;
  v_atuais   text[];
  v_novas    text[];
  v_saem     text[];
  v_entram   text[];
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- a linha do motor travada: gravar uma etapa para ele (FOR SHARE) espera esta transacao, e ela ve o que esta gravou
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_editar_motor:' || p_motor::text, 0));
  SELECT * INTO v_atual FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_atual.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado nao se edita. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_fornecedor IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = p_fornecedor) THEN
    RAISE EXCEPTION 'fornecedor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  -- as FAMILIAS: pelo menos uma, sem repeticao, todas do catalogo (as mesmas recusas da criacao)
  IF p_familias IS NULL OR cardinality(p_familias) = 0 THEN
    RAISE EXCEPTION 'o motor atua em pelo menos uma familia: a lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF array_position(p_familias, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'uma familia da lista veio vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(d.f, ', ' ORDER BY d.f) INTO v_msg FROM (SELECT f FROM unnest(p_familias) f GROUP BY f HAVING count(*) > 1) d;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'a familia % aparece mais de uma vez na lista. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(f, ', ' ORDER BY f) INTO v_msg FROM unnest(p_familias) f
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo c WHERE c.chave = f);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'familia fora do catalogo: %. Nada foi gravado.', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_novas  := ARRAY(SELECT f FROM unnest(p_familias) f ORDER BY f);
  v_atuais := ARRAY(SELECT mf.familia FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor ORDER BY mf.familia);
  v_saem   := ARRAY(SELECT f FROM unnest(v_atuais) f WHERE f <> ALL (v_novas) ORDER BY f);
  v_entram := ARRAY(SELECT f FROM unnest(v_novas) f WHERE f <> ALL (v_atuais) ORDER BY f);
  v_origem := p_fornecedor <> v_atual.fornecedor_id OR p_categoria <> v_atual.categoria_chave;

  -- FORNECEDOR E CATEGORIA: SO SEM USO (o motor mentiria sobre a propria origem). As familias se editam com uso.
  IF v_origem THEN
    SELECT count(*) INTO v_etapas FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor;
    SELECT count(*) INTO v_itens FROM public.orcamentista_levantamento_item x WHERE x.motor_id = p_motor;
    IF v_etapas > 0 OR v_itens > 0 THEN
      RAISE EXCEPTION 'o motor tem uso (% etapa(s), % item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso (as familias se editam com uso). Para outro arquivo, troque o arquivo. Nada foi gravado.',
        v_etapas, v_itens USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;
  -- o arquivo diz a origem: o mesmo caminho se o fornecedor fica; a pasta de motor do fornecedor NOVO se ele muda
  IF p_fornecedor = v_atual.fornecedor_id THEN
    IF v_path <> v_atual.arquivo_path THEN
      RAISE EXCEPTION 'o fornecedor nao mudou, e o caminho do arquivo tambem nao muda. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSE
    v_prefixo := p_fornecedor::text || '/motor/';
    IF left(v_path, length(v_prefixo)) <> v_prefixo OR position('..' in v_path) > 0 THEN
      RAISE EXCEPTION 'o arquivo nao esta na pasta de motor do fornecedor novo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;
  IF NOT v_origem AND cardinality(v_saem) = 0 AND cardinality(v_entram) = 0 THEN
    RAISE EXCEPTION 'nada mudou: o fornecedor, a categoria e as familias sao os de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- a familia que SAI e alguma etapa ou item usa: RECUSA nomeada (a FK RESTRICT da etapa e do item e a trava; aqui sai a frase)
  IF cardinality(v_saem) > 0 THEN
    SELECT count(*) INTO v_etapas FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem);
    SELECT count(*) INTO v_itens FROM public.orcamentista_levantamento_item x WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem);
    IF v_etapas > 0 OR v_itens > 0 THEN
      v_msg := '';
      IF v_etapas > 0 THEN
        SELECT string_agg(s.u, '; ' ORDER BY s.o) INTO v_quem FROM (
          SELECT format('%s / %s / etapa %s', coalesce(t.name, '(sem nome)'), m.nome, x.numero) AS u,
                 row_number() OVER (ORDER BY t.name, m.nome, x.numero) AS o
            FROM public.orcamentista_familia_etapa x
            JOIN public.orcamentista_materia_prima m ON m.id = x.materia_prima_id
            LEFT JOIN public.tenants t ON t.id = x.tenant_id
           WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem)) s
         WHERE s.o <= 3;
        v_msg := format('%s etapa(s) (%s%s)', v_etapas, v_quem, CASE WHEN v_etapas > 3 THEN format('; e mais %s', v_etapas - 3) ELSE '' END);
      END IF;
      IF v_itens > 0 THEN
        SELECT string_agg(s.u, '; ' ORDER BY s.o) INTO v_quem FROM (
          SELECT format('%s / levantamento "%s"', coalesce(t.name, '(sem nome)'), l.nome) AS u,
                 row_number() OVER (ORDER BY t.name, l.nome, l.id) AS o
            FROM (SELECT DISTINCT x.tenant_id, x.levantamento_id FROM public.orcamentista_levantamento_item x
                   WHERE x.motor_id = p_motor AND x.motor_familia_exigida = ANY (v_saem)) x
            JOIN public.orcamentista_levantamento l ON l.id = x.levantamento_id
            LEFT JOIN public.tenants t ON t.id = x.tenant_id) s
         WHERE s.o <= 3;
        v_msg := v_msg || CASE WHEN v_etapas > 0 THEN ' e ' ELSE '' END || format('%s item(ns) de levantamento (%s)', v_itens, v_quem);
      END IF;
      RAISE EXCEPTION 'a familia % nao pode sair do motor: em uso por %. Aponte-os para outro motor antes. Nada foi gravado.',
        array_to_string(v_saem, ', '), v_msg USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  v_antes := jsonb_build_object('orcamentista_motor', to_jsonb(v_atual), 'familias', to_jsonb(v_atuais));
  IF v_origem THEN
    UPDATE public.orcamentista_motor SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria, arquivo_path = v_path WHERE id = p_motor;
  END IF;
  INSERT INTO public.orcamentista_motor_familia (motor_id, familia) SELECT p_motor, f FROM unnest(v_entram) f;
  DELETE FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor AND mf.familia = ANY (v_saem);
  v_depois := jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) FROM public.orcamentista_motor m WHERE m.id = p_motor), 'familias', to_jsonb(v_novas));

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text) TO service_role;

-- ── G4. TROCAR O ARQUIVO: o motor novo com as mesmas famílias ──────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_trocar_arquivo_do_motor(
  p_por uuid, p_motor uuid, p_arquivo_path text, p_arquivo_nome text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '40s'
AS $fn$
DECLARE
  v_antigo  public.orcamentista_motor%ROWTYPE;
  v_criado  jsonb;
  v_novo    uuid;
  v_etapa   record;
  v_antes   jsonb;
  v_depois  jsonb;
  v_n       integer := 0;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- trava o motor ANTES de tudo: uma etapa sendo gravada para ele (FOR SHARE) espera, e depois o encontra arquivado e recusa
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_trocar_arquivo_do_motor:' || p_motor::text, 0));
  SELECT * INTO v_antigo FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_antigo.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'o motor esta arquivado: o arquivo de um motor arquivado nao se troca. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF btrim(coalesce(p_arquivo_path, '')) = v_antigo.arquivo_path THEN
    RAISE EXCEPTION 'o arquivo novo e o mesmo objeto do motor atual: envie o arquivo de novo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1. o motor NOVO: mesmo fornecedor, categoria e FAMILIAS (as do antigo, na ligacao); a leitura, as contagens e o log sao os da criacao.
  --    As etapas reapontadas guardam a exigida delas, que o novo tem: a FK para a ligacao confere.
  v_criado := public.superadmin_criar_motor(p_por, v_antigo.fornecedor_id, v_antigo.categoria_chave,
                                            (SELECT array_agg(mf.familia ORDER BY mf.familia) FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = p_motor),
                                            p_arquivo_path, p_arquivo_nome, p_payload);
  v_novo := (v_criado ->> 'motor_id')::uuid;
  IF v_novo IS NULL OR v_novo = p_motor THEN
    RAISE EXCEPTION 'a criacao do motor novo nao devolveu o id. Nada foi gravado.' USING ERRCODE = 'internal_error';
  END IF;

  -- 2. as ETAPAS do antigo passam ao novo, cada uma com antes e depois no log (a etapa e da empresa: o log leva o tenant)
  FOR v_etapa IN
    SELECT x.* FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor ORDER BY x.tenant_id, x.materia_prima_id, x.numero FOR UPDATE
  LOOP
    v_antes := to_jsonb(v_etapa);
    UPDATE public.orcamentista_familia_etapa SET motor_id = v_novo, atualizado_por = p_por, atualizado_em = now() WHERE id = v_etapa.id;
    SELECT to_jsonb(x) INTO v_depois FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,
            jsonb_build_object('orcamentista_familia_etapa', v_antes, 'troca_de_arquivo_do_motor', p_motor),
            jsonb_build_object('orcamentista_familia_etapa', v_depois), p_por);
    v_n := v_n + 1;
  END LOOP;

  -- 3. o antigo ARQUIVADO, com as linhas intactas — pela funcao de arquivar, que confere que nenhuma etapa o aponta mais, e loga
  PERFORM public.superadmin_arquivar_motor(p_motor, p_por);

  RETURN v_criado || jsonb_build_object('motor_antigo', p_motor, 'etapas_reapontadas', v_n);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
  def  text;
  v_n  integer;
BEGIN
  -- a ligacao: as tres constraints com a definicao exata, a RLS ligada, as quatro politicas e nenhum grant aberto
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor_familia'::regclass AND conname = 'orcamentista_motor_familia_pkey';
  IF def IS DISTINCT FROM 'PRIMARY KEY (motor_id, familia)' THEN
    RAISE EXCEPTION 'verificacao: a PK da ligacao e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor_familia'::regclass AND conname = 'orcamentista_motor_familia_motor_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id) REFERENCES orcamentista_motor(id) ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'verificacao: a FK da ligacao para o motor e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor_familia'::regclass AND conname = 'orcamentista_motor_familia_familia_fkey';
  IF def IS DISTINCT FROM 'FOREIGN KEY (familia) REFERENCES orcamentista_familia_catalogo(chave) ON DELETE RESTRICT' THEN
    RAISE EXCEPTION 'verificacao: a FK da ligacao para o catalogo e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.orcamentista_motor_familia'::regclass)
     OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid = 'public.orcamentista_motor_familia'::regclass
            AND p.polname LIKE 'orcamentista_motor_familia_%_super_admin'
            AND coalesce(pg_get_expr(p.polqual, p.polrelid), 'public.is_super_admin()') IN ('is_super_admin()', 'public.is_super_admin()')
            AND coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'public.is_super_admin()') IN ('is_super_admin()', 'public.is_super_admin()')) <> 4
     OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid = 'public.orcamentista_motor_familia'::regclass) <> 4 THEN
    RAISE EXCEPTION 'verificacao: a ligacao sem RLS, ou sem as quatro politicas de super admin. Nada foi alterado.';
  END IF;
  IF has_table_privilege('anon', 'public.orcamentista_motor_familia', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.orcamentista_motor_familia', 'SELECT,INSERT,UPDATE,DELETE')
     OR NOT has_table_privilege('service_role', 'public.orcamentista_motor_familia', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'verificacao: os grants da ligacao nao sao os do motor (so service_role). Nada foi alterado.';
  END IF;

  -- a trava "pelo menos uma familia": os dois gatilhos de restricao, adiados
  IF (SELECT count(*) FROM pg_constraint c JOIN pg_trigger t ON t.tgconstraint = c.oid
       WHERE c.conname = 'orcamentista_motor_sem_familia' AND c.contype = 't' AND c.condeferrable AND c.condeferred
         AND c.conrelid IN ('public.orcamentista_motor'::regclass, 'public.orcamentista_motor_familia'::regclass)
         AND t.tgfoid = 'public.orcamentista_motor_confere_familias()'::regprocedure) <> 2 THEN
    RAISE EXCEPTION 'verificacao: os gatilhos adiados orcamentista_motor_sem_familia nao estao nas duas tabelas. Nada foi alterado.';
  END IF;
  -- todo motor com pelo menos uma ligacao (o semeio e a trava)
  SELECT count(*) INTO v_n FROM public.orcamentista_motor m WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_motor_familia mf WHERE mf.motor_id = m.id);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verificacao: % motor(es) sem familia. Nada foi alterado.', v_n;
  END IF;

  -- a etapa e o item: a CHECK sem o '*' e a FK para a ligacao, com a definicao exata
  FOREACH nome IN ARRAY ARRAY['orcamentista_familia_etapa', 'orcamentista_levantamento_item'] LOOP
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_familia_exigida';
    IF def IS DISTINCT FROM 'CHECK ((((motor_id IS NULL) = (motor_familia_exigida IS NULL)) AND ((motor_familia_exigida IS NULL) OR (motor_familia_exigida = familia))))' THEN
      RAISE EXCEPTION 'verificacao: a CHECK da exigida em % e %. Nada foi alterado.', nome, coalesce(def, '(ausente)');
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey';
    IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES orcamentista_motor_familia(motor_id, familia) ON DELETE RESTRICT' THEN
      RAISE EXCEPTION 'verificacao: a FK da exigida em % e %. Nada foi alterado.', nome, coalesce(def, '(ausente)');
    END IF;
  END LOOP;
  -- a FK simples do item fica
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_fkey') THEN
    RAISE EXCEPTION 'verificacao: a FK simples motor_id do item sumiu. Nada foi alterado.';
  END IF;

  -- o motor: sem familia nem familia_exigida, sem a CHECK e o UNIQUE delas; categoria_chave fica
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name IN ('familia', 'familia_exigida'))
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass
                   AND conname IN ('orcamentista_motor_familia_so_no_perfil', 'orcamentista_motor_id_familia_exigida_key', 'orcamentista_motor_familia_fkey'))
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'categoria_chave' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'verificacao: o motor ainda tem familia, familia_exigida ou as constraints delas, ou perdeu a categoria. Nada foi alterado.';
  END IF;

  -- as etapas com motor: a exigida e a familia da etapa
  SELECT count(*) INTO v_n FROM public.orcamentista_familia_etapa e WHERE e.motor_id IS NOT NULL AND e.motor_familia_exigida IS DISTINCT FROM e.familia;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verificacao: % etapa(s) com motor e a exigida diferente da familia. Nada foi alterado.', v_n;
  END IF;

  -- as funcoes: fechadas, com search_path fixo; as assinaturas antigas fora
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb)',
    'public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)',
    'public.superadmin_editar_motor(uuid, uuid, uuid, text, text[], text)',
    'public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)'
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
  IF to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)') IS NOT NULL
     OR to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: uma assinatura antiga (com p_familia text) continua. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text[], text, text, jsonb)')
                    AND 'statement_timeout=35s' = ANY (p.proconfig))
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)')
                    AND 'statement_timeout=40s' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: criar ou trocar sem o statement_timeout (35 s e 40 s). Nada foi alterado.';
  END IF;
  f := to_regprocedure('public.orcamentista_motor_confere_familias()');
  IF f IS NULL OR has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: a funcao do gatilho nao existe, ou nasceu aberta, ou sem search_path fixo. Nada foi alterado.';
  END IF;

  RAISE NOTICE 'motor para N familias: ligacao com RLS, gatilho adiado, FKs da etapa e do item pela ligacao; funcoes fechadas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select motor_id, familia from public.orcamentista_motor_familia;                                     -- esperado: 1 linha, o da Wolff, PVC
-- select id, familia, motor_id, motor_familia_exigida from public.orcamentista_familia_etapa order by numero;  -- esperado: as 3, PVC, o motor da Wolff, PVC
-- select conrelid::regclass, conname, contype, pg_get_constraintdef(oid) from pg_constraint
--  where conname like '%exigida%' or conname like 'orcamentista_motor_familia%' or conname = 'orcamentista_motor_sem_familia' order by 1, 2;
--                                                                                                       -- esperado: 9 linhas (4 da etapa e do item, 3 da ligacao, 2 gatilhos)
-- select column_name from information_schema.columns where table_name = 'orcamentista_motor' and column_name like 'familia%';  -- esperado: nenhuma
