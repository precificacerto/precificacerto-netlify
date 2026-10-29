-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261029000002 — A FAMÍLIA DO MOTOR SÓ NO PERFIL, COM A TRAVA DECLARATIVA (coluna gerada, sem gatilho).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261029000002_familia_do_motor_so_no_perfil.
-- ║ PRESSUPÕE aplicadas a 20261028000001, a 20261028000002 e a 20261029000001 — conferidas em produção em 29/10/2026 (as funções de trocar
-- ║ o arquivo e de editar o motor existem; o motor tem `familia` NOT NULL; as FKs compostas são as de `(motor_id, familia)`).
-- ║ SEM ELA O CÓDIGO QUEBRA: o "Novo motor" fora do Perfil manda família nula (o banco de hoje recusa: NOT NULL), e a edição chama
-- ║ `superadmin_editar_motor` com a família (a assinatura de hoje não a tem).
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 29/10/2026, item 6 (`.claude/rules/tabela-de-preco-por-categoria.md`, "Decisões de 29/10/2026"; a proposta medida e
-- aprovada está em `docs/propostas/2026-10-29-familia-do-motor-so-no-perfil.md`):
--   "a família do motor passa a ser OBRIGATÓRIA SÓ NO PERFIL e nula nas demais categorias; e a ligação etapa ↔ motor deixa de exigir família igual
--   quando o motor não tem família." E, ao aprovar: "A trava continua DECLARATIVA, no catálogo de constraints, e não em código de função [...]
--   Escreva a migração assim, sem gatilho."
--
-- POR QUE NÃO BASTA TIRAR O NOT NULL: a FK `(motor_id, familia) -> motor (id, familia)` é MATCH SIMPLE e a etapa tem `familia` NOT NULL ('PVC'): a FK
-- é sempre conferida, e `(motor, 'PVC')` não casa com `(motor, NULL)`. Toda etapa que apontasse motor de persiana seria recusada.
--
-- O QUE FAZ:
--   A. GUARDAS que abortam ANTES de qualquer mudança: as três migrações de que depende; nenhum motor fora do Perfil com família (a CHECK nova o
--      recusaria); as etapas com motor e sem a coluna nova preenchida são EXATAMENTE as 3 medidas em 29/10/2026 (bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d,
--      ed9a9b06-d898-4f75-8487-e260d8ba8ec0, dd8d3526-f08e-47e1-81c3-a6770214516f), cada uma com motor de PERFIL da MESMA família dela — aborta se houver
--      etapa com motor de outra família ou motor sem família; nenhum item de levantamento com motor (os 4 de hoje não têm, e não mudam).
--   B. `orcamentista_motor`: `familia` deixa de ser NOT NULL; CHECK `orcamentista_motor_familia_so_no_perfil` — `(categoria_chave = 'PERFIL') =
--      (familia IS NOT NULL)`, obrigatória no Perfil e NULA nas demais; coluna GERADA `familia_exigida = coalesce(familia, '*')` e
--      `UNIQUE (id, familia_exigida)`, o alvo das FKs. `'*'` nunca é chave de família: a CHECK `orcamentista_familia_catalogo_chave_forma` exige
--      `^[A-Z][A-Z0-9_]{0,39}$`. Sai o `UNIQUE (id, familia)` (`orcamentista_motor_id_familia_key`), alvo só das duas FKs que saem.
--   C. `orcamentista_familia_etapa` e `orcamentista_levantamento_item`: coluna `motor_familia_exigida`; CHECK — existe se e só se há motor, e vale a
--      `familia` da linha ou `'*'`; FK `(motor_id, motor_familia_exigida) -> motor (id, familia_exigida)` ON DELETE RESTRICT; sai a FK
--      `(motor_id, familia)`. No item ficam a FK simples `motor_id -> motor(id)` e a CHECK `motor_exige_familia`.
--      PREENCHIMENTO AUTORIZADO pelo dono do produto em 29/10/2026: as 3 etapas ganham `motor_familia_exigida = 'PVC'` (o motor delas é PERFIL PVC),
--      com antes e depois no `superadmin_alteracao_log`.
--   D. O QUE A TRAVA GARANTE (provado no harness `scripts/harness/familia-do-motor-so-no-perfil/`): etapa PVC aponta motor PERFIL PVC e motor sem
--      família; NÃO aponta motor PERFIL de outra linha — nem dizendo `'*'` (a FK recusa: o motor exige a linha dele), nem dizendo a linha do motor
--      (a CHECK recusa: a exigida é a da etapa ou `'*'`). Trocar a família de um motor com uso, ou dar família a um motor de persiana com uso, é
--      recusado pela FK (ON UPDATE NO ACTION sobre a coluna gerada). Nada depende de a função lembrar de conferir.
--   E. Funções (CREATE OR REPLACE, mesma assinatura; a de editar ganha `p_familia`):
--      - `superadmin_criar_motor`: a família é obrigatória no Perfil e recusada fora dele, com frase;
--      - `superadmin_gravar_etapas_da_materia_prima`: aceita o motor sem família; grava `motor_familia_exigida` a partir do motor apontado;
--      - `superadmin_editar_motor(p_por, p_motor, p_fornecedor, p_categoria, p_familia, p_arquivo_path)`: a família anda com a categoria (no Perfil,
--        obrigatória; fora dele, nula); sai a assinatura sem a família. Continua SÓ SEM USO.
--      `superadmin_trocar_arquivo_do_motor` e `superadmin_arquivar_motor` não mudam: a troca passa a família do antigo (nula ou não) à criação, e as
--      etapas reapontadas guardam a mesma exigida, que o motor novo tem.
--
-- O QUE NÃO FAZ: não toca no motor da Wolff (PERFIL, PVC: a CHECK nova já vale para ele), nas 62.299 linhas, nos tempos, nas tabelas de preço, nos
-- itens de levantamento (nenhum tem motor) nem na conversa. Nenhum UPDATE além do preenchimento autorizado; nenhum DELETE de linha. Os DROP são de
-- duas FKs e de um UNIQUE, substituídos pelos novos na mesma transação, e da assinatura antiga de `superadmin_editar_motor`.
--
-- IDEMPOTENTE: as guardas olham só o que falta fazer; colunas e constraints com IF (NOT) EXISTS; o preenchimento só toca etapa com motor e sem a
-- exigida. Reaplicada, não loga nada de novo.
-- VERIFICAÇÃO (aborta): a estrutura, as definições das constraints, o preenchimento e as funções fechadas.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A. AS GUARDAS ──────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_tem_etapa boolean;
  v_tem_item  boolean;
  v_pendentes uuid[];
  v_esperadas uuid[] := ARRAY['bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d','ed9a9b06-d898-4f75-8487-e260d8ba8ec0','dd8d3526-f08e-47e1-81c3-a6770214516f']::uuid[];
  v_n         integer;
BEGIN
  IF to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)') IS NULL
     OR to_regprocedure('public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)') IS NULL
     OR to_regprocedure('public.superadmin_trocar_arquivo_do_motor(uuid, uuid, text, text, jsonb)') IS NULL
     OR (to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text)') IS NULL
         AND to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)') IS NULL)
     OR to_regclass('public.orcamentista_levantamento_item') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261028000001 e a 20261029000001 (criar, gravar etapas, trocar arquivo e editar motor) nao estao aplicadas. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_catalogo_chave_forma'
                    AND pg_get_constraintdef(oid) LIKE '%^[A-Z][A-Z0-9_]{0,39}$%') THEN
    RAISE EXCEPTION 'guarda: a CHECK da forma da chave de familia nao e a medida; sem ela, ''*'' poderia ser chave de familia. Nada foi alterado.';
  END IF;

  -- nenhum motor fora do Perfil com familia: a CHECK nova o recusaria, e corrigir o dado nao foi autorizado
  SELECT count(*) INTO v_n FROM public.orcamentista_motor m WHERE m.categoria_chave IS DISTINCT FROM 'PERFIL' AND m.familia IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'guarda: % motor(es) fora do Perfil com familia; a familia do motor so existe no Perfil, e esvaziar a dele nao foi autorizado. Nada foi alterado.', v_n;
  END IF;

  v_tem_etapa := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'motor_familia_exigida');
  v_tem_item  := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_levantamento_item' AND column_name = 'motor_familia_exigida');

  -- as etapas a preencher: com motor e sem a exigida (na primeira vez, todas as que tem motor)
  IF v_tem_etapa THEN
    EXECUTE 'SELECT coalesce(array_agg(e.id ORDER BY e.id), ''{}'') FROM public.orcamentista_familia_etapa e WHERE e.motor_id IS NOT NULL AND e.motor_familia_exigida IS NULL'
      INTO v_pendentes;
  ELSE
    SELECT coalesce(array_agg(e.id ORDER BY e.id), '{}') INTO v_pendentes FROM public.orcamentista_familia_etapa e WHERE e.motor_id IS NOT NULL;
  END IF;
  IF cardinality(v_pendentes) > 0 THEN
    IF NOT (v_pendentes <@ v_esperadas AND v_esperadas <@ v_pendentes) THEN
      RAISE EXCEPTION 'guarda: as etapas com motor a preencher nao sao as 3 medidas em 29/10/2026 (sao %); o preenchimento autorizado e so o delas. Nada foi alterado.', v_pendentes;
    END IF;
    IF EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa e JOIN public.orcamentista_motor m ON m.id = e.motor_id
                WHERE e.id = ANY (v_pendentes) AND (m.familia IS NULL OR m.familia <> e.familia OR m.categoria_chave <> 'PERFIL')) THEN
      RAISE EXCEPTION 'guarda: ha etapa a preencher com motor sem familia, de outra familia ou fora do Perfil; o preenchimento autorizado e o de motor PERFIL da mesma familia. Nada foi alterado.';
    END IF;
  END IF;

  -- nenhum item de levantamento com motor e sem a exigida: os 4 de hoje nao tem motor, e o item nao tem preenchimento autorizado
  IF v_tem_item THEN
    EXECUTE 'SELECT count(*) FROM public.orcamentista_levantamento_item x WHERE x.motor_id IS NOT NULL AND x.motor_familia_exigida IS NULL' INTO v_n;
  ELSE
    SELECT count(*) INTO v_n FROM public.orcamentista_levantamento_item x WHERE x.motor_id IS NOT NULL;
  END IF;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'guarda: % item(ns) de levantamento com motor; o preenchimento autorizado e so o das 3 etapas. Nada foi alterado.', v_n;
  END IF;
END
$guarda$;

-- ── B. O motor: a família só no Perfil, e a família EXIGIDA, que a FK lê ───────────────────
ALTER TABLE public.orcamentista_motor ALTER COLUMN familia DROP NOT NULL;
ALTER TABLE public.orcamentista_motor ADD COLUMN IF NOT EXISTS familia_exigida text GENERATED ALWAYS AS (coalesce(familia, '*')) STORED;
DO $b$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_familia_so_no_perfil') THEN
    ALTER TABLE public.orcamentista_motor ADD CONSTRAINT orcamentista_motor_familia_so_no_perfil
      CHECK ((categoria_chave = 'PERFIL') = (familia IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_id_familia_exigida_key') THEN
    ALTER TABLE public.orcamentista_motor ADD CONSTRAINT orcamentista_motor_id_familia_exigida_key UNIQUE (id, familia_exigida);
  END IF;
END
$b$;

-- ── C. A etapa e o item: a família que o motor exige, e a FK que a confere ─────────────────
ALTER TABLE public.orcamentista_familia_etapa ADD COLUMN IF NOT EXISTS motor_familia_exigida text;
ALTER TABLE public.orcamentista_levantamento_item ADD COLUMN IF NOT EXISTS motor_familia_exigida text;

-- PREENCHIMENTO AUTORIZADO (dono do produto, 29/10/2026): as 3 etapas de hoje, motor PERFIL PVC, ganham 'PVC'; antes e depois no log
DO $c$
DECLARE
  v_etapa  record;
  v_antes  jsonb;
  v_n      integer := 0;
BEGIN
  FOR v_etapa IN
    SELECT e.id, e.tenant_id, m.familia_exigida
      FROM public.orcamentista_familia_etapa e JOIN public.orcamentista_motor m ON m.id = e.motor_id
     WHERE e.motor_familia_exigida IS NULL ORDER BY e.id FOR UPDATE OF e
  LOOP
    SELECT to_jsonb(x) INTO v_antes FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id;
    UPDATE public.orcamentista_familia_etapa SET motor_familia_exigida = v_etapa.familia_exigida WHERE id = v_etapa.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,
            jsonb_build_object('orcamentista_familia_etapa', v_antes, 'migracao', '20261029000002_familia_do_motor_so_no_perfil'),
            jsonb_build_object('orcamentista_familia_etapa', (SELECT to_jsonb(x) FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id)),
            NULL);
    v_n := v_n + 1;
  END LOOP;
  IF v_n > 0 THEN
    RAISE NOTICE 'familia exigida preenchida em % etapa(s)', v_n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_familia_etapa'::regclass AND conname = 'orcamentista_familia_etapa_motor_familia_exigida') THEN
    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_motor_familia_exigida
      CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL OR motor_familia_exigida = familia OR motor_familia_exigida = '*'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_familia_etapa'::regclass AND conname = 'orcamentista_familia_etapa_motor_exigida_fkey') THEN
    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_motor_exigida_fkey
      FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor (id, familia_exigida) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_familia_exigida') THEN
    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_motor_familia_exigida
      CHECK ((motor_id IS NULL) = (motor_familia_exigida IS NULL) AND (motor_familia_exigida IS NULL OR motor_familia_exigida = familia OR motor_familia_exigida = '*'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_exigida_fkey') THEN
    ALTER TABLE public.orcamentista_levantamento_item ADD CONSTRAINT orcamentista_levantamento_item_motor_exigida_fkey
      FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES public.orcamentista_motor (id, familia_exigida) ON DELETE RESTRICT;
  END IF;
END
$c$;

-- as FKs (motor_id, familia) saem — a nova as substitui —, e com elas o alvo delas
ALTER TABLE public.orcamentista_familia_etapa DROP CONSTRAINT IF EXISTS orcamentista_familia_etapa_motor_fkey;
ALTER TABLE public.orcamentista_levantamento_item DROP CONSTRAINT IF EXISTS orcamentista_levantamento_item_motor_familia_fkey;
ALTER TABLE public.orcamentista_motor DROP CONSTRAINT IF EXISTS orcamentista_motor_id_familia_key;

-- ── E1. GRAVAR ETAPAS: aceita o motor sem família, e grava a exigida ───────────────────────
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
  v_mfam       text;
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
    -- o MOTOR da etapa: ausente mantem, null limpa, uuid aponta. O motor e do CATALOGO (global): tem de existir, ser da MESMA LINHA da familia (o de
    -- Perfil) ou de linha nenhuma (familia nula: o de persiana, ferragem... serve qualquer linha, 20261029000002) e nao estar arquivado. FOR SHARE:
    -- arquivar (FOR UPDATE) espera esta transacao e ve a etapa; se o arquivamento veio antes, esta leitura o ve e recusa. A FK
    -- (motor_id, motor_familia_exigida) -> motor (id, familia_exigida) e a trava; esta conferencia so da a frase.
    IF e ? 'motor_id' AND jsonb_typeof(e -> 'motor_id') <> 'null' THEN
      IF jsonb_typeof(e -> 'motor_id') <> 'string' OR (e ->> 'motor_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'etapa %: o motor_id nao e um uuid (ou null, para limpar)', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      SELECT m.familia, m.arquivado_em INTO v_mfam, v_marq
        FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'etapa %: o motor nao existe', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_mfam <> v_familia THEN  -- o motor sem familia (NULL) passa: serve qualquer linha
        RAISE EXCEPTION 'etapa %: o motor e do tipo %, e a familia e do tipo %', i, v_mfam, v_familia USING ERRCODE = 'invalid_parameter_value';
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
                 THEN (SELECT m.familia_exigida FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid)
                 ELSE motor_familia_exigida END
         WHERE id = (e ->> 'id')::uuid;
      ELSE
        INSERT INTO public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao, instrucao, abas, atualizado_por, motor_id,
                                                      motor_familia_exigida)
        VALUES (p_tenant, p_materia_prima, v_familia, i, e ->> 'rotulo', e ->> 'acao', coalesce(e ->> 'instrucao', ''), v_abas, p_por, (e ->> 'motor_id')::uuid,
                (SELECT m.familia_exigida FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid));
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

-- ── E2. CRIAR MOTOR: a família só no Perfil ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_criar_motor(
  p_por uuid, p_fornecedor uuid, p_categoria text, p_familia text, p_arquivo_path text, p_arquivo_nome text, p_payload jsonb
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
  -- a FAMILIA (linha) e do motor de PERFIL, e so dele (20261029000002): o de persiana, ferragem, vidro... serve qualquer linha e nao tem familia.
  -- A CHECK orcamentista_motor_familia_so_no_perfil diz o mesmo; aqui a recusa sai com frase, antes de ler o payload.
  IF p_categoria = 'PERFIL' THEN
    IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN
      RAISE EXCEPTION 'o motor de Perfil tem familia (linha), e ela tem de ser do catalogo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSIF p_familia IS NOT NULL THEN
    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';
  END IF;

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

  -- 1. o motor: do catalogo, com fornecedor, categoria e tipo; nao aponta etapa nenhuma (quem escolhe e a etapa)
  INSERT INTO public.orcamentista_motor (familia, fornecedor_id, categoria_chave, arquivo_nome, arquivo_path, criado_por)
  VALUES (p_familia, p_fornecedor, p_categoria, v_nome, v_path, p_por)
  RETURNING id INTO v_motor;

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

REVOKE ALL ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb) TO service_role;


-- ── E3. EDITAR: a família anda com a categoria; continua só sem uso ─────────────────────────
DROP FUNCTION IF EXISTS public.superadmin_editar_motor(uuid, uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION public.superadmin_editar_motor(
  p_por uuid, p_motor uuid, p_fornecedor uuid, p_categoria text, p_familia text, p_arquivo_path text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes   jsonb;
  v_depois  jsonb;
  v_atual   public.orcamentista_motor%ROWTYPE;
  v_path    text := btrim(coalesce(p_arquivo_path, ''));
  v_prefixo text;
  v_etapas  integer;
  v_itens   integer;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_editar_motor:' || p_motor::text, 0));
  SELECT * INTO v_atual FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  v_antes := to_jsonb(v_atual);
  IF v_atual.arquivado_em IS NOT NULL THEN
    RAISE EXCEPTION 'o motor esta arquivado: motor arquivado nao se edita. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- SO SEM USO: nenhuma etapa e nenhum item de levantamento aponta o motor (a linha ja esta travada: quem for aponta-lo espera)
  SELECT count(*) INTO v_etapas FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor;
  SELECT count(*) INTO v_itens FROM public.orcamentista_levantamento_item x WHERE x.motor_id = p_motor;
  IF v_etapas > 0 OR v_itens > 0 THEN
    RAISE EXCEPTION 'o motor tem uso (% etapa(s), % item(ns) de levantamento): categoria e fornecedor so se editam em motor sem uso. Para outro arquivo, troque o arquivo. Nada foi gravado.',
      v_etapas, v_itens USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- a FAMILIA anda com a categoria (20261029000002): no Perfil, obrigatoria e do catalogo; fora dele, nula. A CHECK orcamentista_motor_familia_so_no_perfil
  -- e a trava; aqui sai a frase.
  IF p_categoria = 'PERFIL' THEN
    IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN
      RAISE EXCEPTION 'o motor de Perfil tem familia (linha), e ela tem de ser do catalogo. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSIF p_familia IS NOT NULL THEN
    RAISE EXCEPTION 'so o motor de Perfil tem familia (linha): o de % serve qualquer linha. Nada foi gravado.', p_categoria USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_fornecedor IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = p_fornecedor) THEN
    RAISE EXCEPTION 'fornecedor inexistente' USING ERRCODE = 'no_data_found';
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
  IF p_fornecedor = v_atual.fornecedor_id AND p_categoria = v_atual.categoria_chave AND p_familia IS NOT DISTINCT FROM v_atual.familia THEN
    RAISE EXCEPTION 'nada mudou: o fornecedor, a categoria e a familia sao os de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.orcamentista_motor SET fornecedor_id = p_fornecedor, categoria_chave = p_categoria, familia = p_familia, arquivo_path = v_path WHERE id = p_motor;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_motor m WHERE m.id = p_motor;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text,
          jsonb_build_object('orcamentista_motor', v_antes), jsonb_build_object('orcamentista_motor', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_motor', v_depois);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
  def  text;
  v_n  integer;
BEGIN
  -- o motor: familia nula permitida; a exigida e gerada pela expressao; a CHECK e o UNIQUE novos; o UNIQUE antigo fora
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'familia' AND is_nullable = 'NO')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'familia_exigida'
                       AND is_generated = 'ALWAYS' AND generation_expression = 'COALESCE(familia, ''*''::text)') THEN
    RAISE EXCEPTION 'verificacao: a familia do motor continua NOT NULL, ou a familia_exigida nao e a coluna gerada coalesce(familia, ''*''). Nada foi alterado.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_familia_so_no_perfil';
  IF def IS DISTINCT FROM 'CHECK (((categoria_chave = ''PERFIL''::text) = (familia IS NOT NULL)))' THEN
    RAISE EXCEPTION 'verificacao: a CHECK da familia so no Perfil e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = 'public.orcamentista_motor'::regclass AND conname = 'orcamentista_motor_id_familia_exigida_key';
  IF def IS DISTINCT FROM 'UNIQUE (id, familia_exigida)' THEN
    RAISE EXCEPTION 'verificacao: o UNIQUE (id, familia_exigida) e %. Nada foi alterado.', coalesce(def, '(ausente)');
  END IF;

  -- a etapa e o item: a CHECK e a FK novas, com a definicao exata; as FKs (motor_id, familia) e o UNIQUE (id, familia) fora
  FOREACH nome IN ARRAY ARRAY['orcamentista_familia_etapa', 'orcamentista_levantamento_item'] LOOP
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_familia_exigida';
    IF def IS DISTINCT FROM 'CHECK ((((motor_id IS NULL) = (motor_familia_exigida IS NULL)) AND ((motor_familia_exigida IS NULL) OR (motor_familia_exigida = familia) OR (motor_familia_exigida = ''*''::text))))' THEN
      RAISE EXCEPTION 'verificacao: a CHECK da exigida em % e %. Nada foi alterado.', nome, coalesce(def, '(ausente)');
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint WHERE conrelid = format('public.%I', nome)::regclass AND conname = nome || '_motor_exigida_fkey';
    IF def IS DISTINCT FROM 'FOREIGN KEY (motor_id, motor_familia_exigida) REFERENCES orcamentista_motor(id, familia_exigida) ON DELETE RESTRICT' THEN
      RAISE EXCEPTION 'verificacao: a FK da exigida em % e %. Nada foi alterado.', nome, coalesce(def, '(ausente)');
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('orcamentista_familia_etapa_motor_fkey', 'orcamentista_levantamento_item_motor_familia_fkey', 'orcamentista_motor_id_familia_key')) THEN
    RAISE EXCEPTION 'verificacao: uma FK (motor_id, familia) ou o UNIQUE (id, familia) continua. Nada foi alterado.';
  END IF;
  -- a FK simples do item fica (o item tinha as duas); a etapa nunca teve a simples
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orcamentista_levantamento_item'::regclass AND conname = 'orcamentista_levantamento_item_motor_fkey') THEN
    RAISE EXCEPTION 'verificacao: a FK simples motor_id do item sumiu. Nada foi alterado.';
  END IF;

  -- o preenchimento: nenhuma etapa com motor sem a exigida; as 3 de hoje com 'PVC'
  SELECT count(*) INTO v_n FROM public.orcamentista_familia_etapa e WHERE e.motor_id IS NOT NULL AND e.motor_familia_exigida IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verificacao: % etapa(s) com motor e sem a familia exigida. Nada foi alterado.', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa e
              WHERE e.id IN ('bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d', 'ed9a9b06-d898-4f75-8487-e260d8ba8ec0', 'dd8d3526-f08e-47e1-81c3-a6770214516f')
                AND e.motor_id IS NOT NULL AND e.motor_familia_exigida IS DISTINCT FROM 'PVC') THEN
    RAISE EXCEPTION 'verificacao: uma das 3 etapas medidas tem motor e nao exige PVC. Nada foi alterado.';
  END IF;

  -- as funcoes: fechadas, com search_path fixo; a assinatura antiga do editar fora
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)',
    'public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)',
    'public.superadmin_editar_motor(uuid, uuid, uuid, text, text, text)'
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
  IF to_regprocedure('public.superadmin_editar_motor(uuid, uuid, uuid, text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: a assinatura antiga de superadmin_editar_motor (sem a familia) continua. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)')
                    AND 'statement_timeout=35s' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: superadmin_criar_motor sem o statement_timeout de 35 s. Nada foi alterado.';
  END IF;

  RAISE NOTICE 'familia do motor so no Perfil: coluna gerada, FKs pela exigida, etapas preenchidas; funcoes fechadas.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select id, familia, categoria_chave, familia_exigida from public.orcamentista_motor;                 -- esperado: o da Wolff, PVC, PERFIL, PVC
-- select id, familia, motor_id, motor_familia_exigida from public.orcamentista_familia_etapa order by numero;  -- esperado: as 3, PVC, o motor da Wolff, PVC
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--  where conname like '%exigida%' or conname = 'orcamentista_motor_familia_so_no_perfil' order by 1, 2;  -- esperado: 6 linhas
