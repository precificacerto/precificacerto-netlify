-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261028000001 — A FAMÍLIA-INSTÂNCIA E O CATÁLOGO DE MOTORES.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261028000001_familia_instancia_e_catalogo_de_motores.
-- ║ SEM ELA O CÓDIGO QUEBRA: as etapas da base de conhecimento chamam `superadmin_gravar_etapas_da_materia_prima` e leem
-- ║ `orcamentista_familia_etapa.materia_prima_id`; o catálogo de motores chama `superadmin_criar_motor` e lê `orcamentista_motor.categoria_chave`.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ Pressupõe aplicadas a 20261027000002, 000003, 000006, 000008 e 000010 (conferido por consulta em 28/10/2026).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — desenho final do dono do produto, 28/10/2026 (`.claude/rules/tabela-de-preco-por-categoria.md`, "DESENHO FINAL"):
--   - "A mesma empresa pode ter três famílias que trabalham com PVC, cada uma com fornecedores diferentes": as ETAPAS (e o motor de cada uma) passam a
--     ser da FAMÍLIA-INSTÂNCIA — a matéria-prima, que tem tenant_id — e não da chave do catálogo ('PVC'), que todas compartilhariam.
--   - "Empresas diferentes podem usar o mesmo motor": o MOTOR é global, num CATÁLOGO, com FORNECEDOR e CATEGORIA; a etapa só o seleciona.
--   - O índice de uma família por conta cai: a unicidade que fica é a do título, (tenant_id, lower(nome)).
--   - `vigente` e o índice uma_vigente saem: quem escolhe o motor é a etapa, e eles impediriam a Wolf de ter motor de PERFIL e de PERSIANA.
--
-- O QUE FAZ:
--   A. GUARDAS que abortam ANTES de qualquer mudança (as do dono do produto): exatamente UMA matéria-prima com familia = 'PVC'; as etapas que ainda não têm
--      instância são EXATAMENTE as 3 medidas em 28/10/2026 (bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d, ed9a9b06-d898-4f75-8487-e260d8ba8ec0, dd8d3526-f08e-47e1-81c3-a6770214516f); o motor sem
--      categoria é só o da Wolff (9a233c55-f377-45d3-b2ae-b1a740a98e44); nenhum motor sem fornecedor.
--   B. `orcamentista_materia_prima`: cai o índice (tenant_id, familia); entra UNIQUE (id, tenant_id, familia), alvo da FK da etapa.
--   C. `orcamentista_familia_etapa`: ganha tenant_id e materia_prima_id; PREENCHIMENTO AUTORIZADO pelo dono do produto em 28/10/2026 — as 3 etapas passam
--      para a única instância PVC ("Esquadrias de PVC", da Esquadrias De Paula), com antes e depois no `superadmin_alteracao_log`; NOT NULL; FK composta
--      (materia_prima_id, tenant_id, familia) -> materia_prima (ON DELETE CASCADE: a etapa é da família, e o remover loga as etapas); a unicidade passa a ser
--      (materia_prima_id, numero). A familia FICA, para a FK composta com o motor: família PVC só aponta motor PVC.
--   D. `orcamentista_motor`: ganha categoria_chave (FK para o catálogo de categorias); PREENCHIMENTO AUTORIZADO — o motor da Wolff ganha 'PERFIL', com antes e
--      depois no log; fornecedor_id e categoria_chave passam a NOT NULL; saem vigente, o índice uma_vigente e a CHECK arquivado_nao_e_vigente.
--   E. Funções (SECURITY DEFINER, search_path fixo, só service_role, com log):
--      - sai superadmin_gravar_etapas_da_familia(text, uuid, jsonb) e entra superadmin_gravar_etapas_da_materia_prima(p_tenant, p_por, p_materia_prima, p_etapas);
--      - sai superadmin_criar_motor_da_etapa e entra superadmin_criar_motor(p_por, p_fornecedor, p_categoria, p_familia, p_arquivo_path, p_arquivo_nome, p_payload):
--        o motor nasce no CATÁLOGO, com fornecedor e categoria, e não aponta etapa nenhuma;
--      - superadmin_arquivar_motor: sem vigente; a recusa nomeia a empresa e a família de cada etapa que aponta o motor;
--      - superadmin_definir_familia_da_materia_prima: sem a recusa "uma por família"; trocar a família de quem tem etapas é recusa nomeada;
--      - superadmin_remover_materia_prima: o log do antes passa a levar as etapas (o CASCADE as leva junto).
--
-- O QUE NÃO FAZ:
--   - Não toca nos tempos, no conteúdo de motor nenhum, nas tabelas de preço, nos fornecedores, nas ramificações nem no levantamento
--     (o levantamento ganha materia_prima_id no PR D, que deriva POR INSTÂNCIA).
--   - Nenhum UPDATE além dos dois preenchimentos autorizados; nenhum DELETE de linha. O DROP é da coluna vigente (decisão do dono do produto; o valor
--     dela vai no log, no antes do motor da Wolff) e de um índice e de uma CHECK.
--
-- IDEMPOTENTE: as guardas olham só o que falta fazer; colunas, constraints e índices com IF (NOT) EXISTS; funções com CREATE OR REPLACE / DROP IF EXISTS;
-- o preenchimento só toca linha com o campo nulo. Reaplicada, não loga nada de novo.
-- VERIFICAÇÃO (aborta): estrutura, os preenchimentos, as funções fechadas e as antigas fora.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A. AS GUARDAS ──────────────────────────────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_n        integer;
  v_pendentes uuid[];
  v_esperadas uuid[] := ARRAY['bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d','ed9a9b06-d898-4f75-8487-e260d8ba8ec0','dd8d3526-f08e-47e1-81c3-a6770214516f']::uuid[];
BEGIN
  IF to_regclass('public.orcamentista_familia_etapa') IS NULL OR to_regclass('public.orcamentista_motor') IS NULL
     OR to_regclass('public.orcamentista_materia_prima') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL
     OR to_regclass('public.orcamentista_categoria_catalogo') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as tabelas da etapa, do motor, da materia-prima, do log ou do catalogo de categorias. Nada foi alterado.';
  END IF;
  IF to_regprocedure('public.superadmin_remover_materia_prima(uuid, uuid, uuid)') IS NULL
     OR to_regprocedure('public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)') IS NULL
     OR to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: as funcoes da 20261023000003/20261027000003/000008. Nada foi alterado.';
  END IF;

  -- uma instancia PVC so: e para ela que as etapas vao
  SELECT count(*) INTO v_n FROM public.orcamentista_materia_prima WHERE familia = 'PVC';
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'materia_prima_id') THEN
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO v_pendentes FROM public.orcamentista_familia_etapa;
  ELSE
    EXECUTE 'SELECT coalesce(array_agg(id ORDER BY id), ''{}'') FROM public.orcamentista_familia_etapa WHERE materia_prima_id IS NULL' INTO v_pendentes;
  END IF;
  IF cardinality(v_pendentes) > 0 THEN
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'guarda: ha % materias-primas com familia PVC (esperada exatamente 1); as etapas nao tem para onde ir sem escolha. Nada foi alterado.', v_n;
    END IF;
    IF v_pendentes <> (SELECT array_agg(x ORDER BY x) FROM unnest(v_esperadas) x)
       OR EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa e WHERE e.id = ANY (v_pendentes) AND e.familia <> 'PVC') THEN
      RAISE EXCEPTION 'guarda: as etapas sem instancia nao sao exatamente as 3 medidas em 28/10/2026 (achadas: %). Nada foi alterado.', v_pendentes;
    END IF;
  END IF;

  -- motor: nenhum sem fornecedor; sem categoria, so o da Wolff
  IF EXISTS (SELECT 1 FROM public.orcamentista_motor WHERE fornecedor_id IS NULL) THEN
    RAISE EXCEPTION 'guarda: ha motor sem fornecedor (%); o catalogo exige fornecedor. Nada foi alterado.',
      (SELECT string_agg(id::text || ' ' || arquivo_nome, ', ') FROM public.orcamentista_motor WHERE fornecedor_id IS NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'categoria_chave') THEN
    EXECUTE 'SELECT count(*) FROM public.orcamentista_motor WHERE categoria_chave IS NULL AND id <> $1' INTO v_n USING '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid;
  ELSE
    SELECT count(*) INTO v_n FROM public.orcamentista_motor WHERE id <> '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid;
  END IF;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'guarda: ha % motor(es) alem do da Wolff sem categoria; a categoria nao se deduz. Nada foi alterado.', v_n;
  END IF;
END
$guarda$;

-- ── B. A matéria-prima: N famílias do mesmo tipo; a FK da etapa mira (id, tenant_id, familia) ──
DROP INDEX IF EXISTS public.orcamentista_materia_prima_tenant_familia_idx;
DO $b$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_materia_prima_id_tenant_familia_key') THEN
    ALTER TABLE public.orcamentista_materia_prima ADD CONSTRAINT orcamentista_materia_prima_id_tenant_familia_key UNIQUE (id, tenant_id, familia);
  END IF;
END
$b$;

-- ── C. A etapa é da família-instância ───────────────────────────────────────────────────────
ALTER TABLE public.orcamentista_familia_etapa ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.orcamentista_familia_etapa ADD COLUMN IF NOT EXISTS materia_prima_id uuid;

-- PREENCHIMENTO AUTORIZADO (dono do produto, 28/10/2026): as 3 etapas medidas vão para a única instância PVC; antes e depois no log
DO $c$
DECLARE
  v_mp  record;
  v_e   record;
  v_n   integer := 0;
BEGIN
  SELECT m.id, m.tenant_id INTO v_mp FROM public.orcamentista_materia_prima m WHERE m.familia = 'PVC';
  FOR v_e IN SELECT e.id, to_jsonb(e) AS antes FROM public.orcamentista_familia_etapa e
              WHERE e.materia_prima_id IS NULL AND e.id = ANY (ARRAY['bc8bcb4a-5b43-4e5f-87ab-ae6d85df588d','ed9a9b06-d898-4f75-8487-e260d8ba8ec0','dd8d3526-f08e-47e1-81c3-a6770214516f']::uuid[]) ORDER BY e.numero FOR UPDATE LOOP
    UPDATE public.orcamentista_familia_etapa SET materia_prima_id = v_mp.id, tenant_id = v_mp.tenant_id WHERE id = v_e.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (v_mp.tenant_id, 'orcamentista_familia_etapa', v_e.id::text,
            jsonb_build_object('orcamentista_familia_etapa', v_e.antes, 'migracao', '20261028000001_familia_instancia_e_catalogo_de_motores'),
            jsonb_build_object('orcamentista_familia_etapa', (SELECT to_jsonb(x) FROM public.orcamentista_familia_etapa x WHERE x.id = v_e.id)),
            NULL);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'etapas levadas para a instancia %: %', v_mp.id, v_n;
END
$c$;

ALTER TABLE public.orcamentista_familia_etapa ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.orcamentista_familia_etapa ALTER COLUMN materia_prima_id SET NOT NULL;
DO $c2$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_materia_prima_fkey') THEN
    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_materia_prima_fkey
      FOREIGN KEY (materia_prima_id, tenant_id, familia) REFERENCES public.orcamentista_materia_prima (id, tenant_id, familia) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_numero_key') THEN
    ALTER TABLE public.orcamentista_familia_etapa DROP CONSTRAINT orcamentista_familia_etapa_numero_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_materia_prima_numero_key') THEN
    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_materia_prima_numero_key UNIQUE (materia_prima_id, numero);
  END IF;
END
$c2$;

-- ── D. O motor é do catálogo: fornecedor + categoria; sai a vigente ─────────────────────────
ALTER TABLE public.orcamentista_motor ADD COLUMN IF NOT EXISTS categoria_chave text;
DO $d$
DECLARE
  v_antes jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_motor_categoria_fkey') THEN
    ALTER TABLE public.orcamentista_motor ADD CONSTRAINT orcamentista_motor_categoria_fkey
      FOREIGN KEY (categoria_chave) REFERENCES public.orcamentista_categoria_catalogo (chave) ON DELETE RESTRICT;
  END IF;
  -- PREENCHIMENTO AUTORIZADO (dono do produto, 28/10/2026): o motor da Wolff é de PERFIL; o antes (com a vigente) fica no log
  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid AND m.categoria_chave IS NULL FOR UPDATE;
  IF v_antes IS NOT NULL THEN
    UPDATE public.orcamentista_motor SET categoria_chave = 'PERFIL' WHERE id = '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (NULL, 'orcamentista_motor', '9a233c55-f377-45d3-b2ae-b1a740a98e44',
            jsonb_build_object('orcamentista_motor', v_antes, 'migracao', '20261028000001_familia_instancia_e_catalogo_de_motores'),
            jsonb_build_object('orcamentista_motor', (SELECT to_jsonb(m) - 'vigente' FROM public.orcamentista_motor m WHERE m.id = '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid)),
            NULL);
    RAISE NOTICE 'motor da Wolff: categoria PERFIL';
  END IF;
END
$d$;
DROP INDEX IF EXISTS public.orcamentista_motor_uma_vigente;
ALTER TABLE public.orcamentista_motor DROP CONSTRAINT IF EXISTS orcamentista_motor_arquivado_nao_e_vigente;
ALTER TABLE public.orcamentista_motor DROP COLUMN IF EXISTS vigente;
ALTER TABLE public.orcamentista_motor ALTER COLUMN fornecedor_id SET NOT NULL;
ALTER TABLE public.orcamentista_motor ALTER COLUMN categoria_chave SET NOT NULL;

-- ── E1. As etapas de UMA família-instância ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb);
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
    -- o MOTOR da etapa: ausente mantem, null limpa, uuid aponta. O motor e do CATALOGO (global): tem de existir, ser do MESMO TIPO da familia e nao
    -- estar arquivado. FOR SHARE: arquivar (FOR UPDATE) espera esta transacao e ve a etapa; se o arquivamento veio antes, esta leitura o ve e recusa.
    IF e ? 'motor_id' AND jsonb_typeof(e -> 'motor_id') <> 'null' THEN
      IF jsonb_typeof(e -> 'motor_id') <> 'string' OR (e ->> 'motor_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'etapa %: o motor_id nao e um uuid (ou null, para limpar)', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      SELECT m.familia, m.arquivado_em INTO v_mfam, v_marq
        FROM public.orcamentista_motor m WHERE m.id = (e ->> 'motor_id')::uuid FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'etapa %: o motor nao existe', i USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_mfam <> v_familia THEN
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
               motor_id = CASE WHEN e ? 'motor_id' THEN (e ->> 'motor_id')::uuid ELSE motor_id END
         WHERE id = (e ->> 'id')::uuid;
      ELSE
        INSERT INTO public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, rotulo, acao, instrucao, abas, atualizado_por, motor_id)
        VALUES (p_tenant, p_materia_prima, v_familia, i, e ->> 'rotulo', e ->> 'acao', coalesce(e ->> 'instrucao', ''), v_abas, p_por, (e ->> 'motor_id')::uuid);
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

-- ── E2. O motor nasce no CATÁLOGO, com fornecedor e categoria ───────────────────────────────
DROP FUNCTION IF EXISTS public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb);
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
  IF p_familia IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN
    RAISE EXCEPTION 'familia (tipo) fora da lista' USING ERRCODE = 'invalid_parameter_value';
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

-- ── E3. Arquivar: sem vigente; a recusa nomeia a empresa e a família ────────────────────────
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

  -- A ETAPA VENCE: motor que alguma etapa aponta nao se arquiva. A linha do motor ja esta travada (FOR UPDATE acima): uma etapa que esta sendo gravada
  -- para este motor (FOR SHARE) segura a trava, e esta leitura so segue depois do commit dela. O motor e global: a recusa nomeia a empresa e a familia.
  SELECT count(*) INTO v_n FROM public.orcamentista_familia_etapa x WHERE x.motor_id = p_motor;
  IF v_n > 0 THEN
    SELECT x.numero, x.rotulo, m.nome AS familia, t.name AS empresa INTO v_etapa
      FROM public.orcamentista_familia_etapa x
      JOIN public.orcamentista_materia_prima m ON m.id = x.materia_prima_id
      LEFT JOIN public.tenants t ON t.id = x.tenant_id
     WHERE x.motor_id = p_motor ORDER BY t.name, m.nome, x.numero LIMIT 1;
    v_msg := format('o motor e o da etapa %s ("%s") da familia "%s" da empresa %s%s: aponte %s para outro motor antes de arquivar',
                    v_etapa.numero, v_etapa.rotulo, v_etapa.familia, coalesce(v_etapa.empresa, '(sem nome)'),
                    CASE WHEN v_n > 1 THEN format(' (e de mais %s)', v_n - 1) ELSE '' END,
                    CASE WHEN v_n > 1 THEN 'as etapas' ELSE 'a etapa' END);
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por WHERE id = p_motor;
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

-- ── E4. O tipo da família: N do mesmo tipo; trocar o tipo de quem tem etapas é recusa ───────
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
  v_n      integer;
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

  -- as etapas sao desta familia e apontam motores do TIPO dela: trocar o tipo deixaria etapa apontando motor de outro tipo
  IF (v_antes ->> 'familia') IS DISTINCT FROM p_familia THEN
    SELECT count(*) INTO v_n FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'a familia "%" tem % etapa(s) cadastrada(s): o tipo dela nao se troca com etapas', v_antes ->> 'nome', v_n USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  UPDATE public.orcamentista_materia_prima SET familia = p_familia, atualizado_por = p_por, atualizado_em = now()
   WHERE id = p_materia_prima AND tenant_id = p_tenant;
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

-- ── E5. Remover a matéria-prima: o log do antes leva as etapas que o CASCADE apaga ──────────
CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima(
  p_tenant uuid, p_por uuid, p_materia_prima uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_mp     jsonb;
  v_cats   uuid[];
  v_antes  jsonb;
  v_depois jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_remover_materia_prima:' || p_tenant::text || ':' || coalesce(p_materia_prima::text, ''), 0));
  SELECT to_jsonb(m) INTO v_mp
    FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;
  IF v_mp IS NULL THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  -- trava a árvore inteira antes de lê-la: o que o log disser que havia é o que o CASCADE apaga
  SELECT coalesce(array_agg(c.id), '{}') INTO v_cats
    FROM (SELECT x.id FROM public.orcamentista_mp_categoria x WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant FOR UPDATE) c;
  PERFORM 1 FROM public.orcamentista_mp_categoria_fornecedor x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;
  PERFORM 1 FROM public.orcamentista_mp_vidro x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;
  PERFORM 1 FROM public.orcamentista_mp_ferragem x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;
  PERFORM 1 FROM public.orcamentista_mp_instalacao x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;
  -- as etapas da familia (20261028000001): o CASCADE as leva junto, e o log tem de dizer quais eram
  PERFORM 1 FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant FOR UPDATE;

  -- o ANTES completo: depois do CASCADE não há de onde reconstruir
  v_antes := jsonb_build_object(
    'orcamentista_materia_prima', v_mp,
    'orcamentista_mp_categoria', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.categoria_chave)
                                             FROM public.orcamentista_mp_categoria c WHERE c.id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_categoria_fornecedor', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.mp_categoria_id, f.ordem)
                                             FROM public.orcamentista_mp_categoria_fornecedor f WHERE f.mp_categoria_id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_vidro', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.ordem)
                                             FROM public.orcamentista_mp_vidro v WHERE v.mp_categoria_id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_ferragem', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.ordem)
                                             FROM public.orcamentista_mp_ferragem g WHERE g.mp_categoria_id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_instalacao', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.produto)
                                             FROM public.orcamentista_mp_instalacao i WHERE i.mp_categoria_id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_familia_etapa', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.numero)
                                             FROM public.orcamentista_familia_etapa e WHERE e.materia_prima_id = p_materia_prima AND e.tenant_id = p_tenant), '[]'::jsonb));

  DELETE FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant;
  v_depois := jsonb_build_object('orcamentista_materia_prima', NULL);

  -- UMA linha de log, com a árvore inteira no antes
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_remover_materia_prima(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_remover_materia_prima(uuid, uuid, uuid) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f    regprocedure;
  nome text;
BEGIN
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)',
    'public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)',
    'public.superadmin_arquivar_motor(uuid, uuid)',
    'public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)',
    'public.superadmin_remover_materia_prima(uuid, uuid, uuid)'
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
  IF to_regprocedure('public.superadmin_gravar_etapas_da_familia(text, uuid, jsonb)') IS NOT NULL
     OR to_regprocedure('public.superadmin_criar_motor_da_etapa(uuid, uuid, text, text, jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: uma funcao antiga continua existindo. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_criar_motor(uuid, uuid, text, text, text, text, jsonb)')
                    AND 'statement_timeout=35s' = ANY (p.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: superadmin_criar_motor sem o statement_timeout de 35 s. Nada foi alterado.';
  END IF;
  IF to_regclass('public.orcamentista_materia_prima_tenant_familia_idx') IS NOT NULL OR to_regclass('public.orcamentista_motor_uma_vigente') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor' AND column_name = 'vigente') THEN
    RAISE EXCEPTION 'verificacao: o indice de uma familia por conta, o uma_vigente ou a coluna vigente continuam. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa'
               AND column_name IN ('tenant_id', 'materia_prima_id') AND is_nullable = 'YES')
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_motor'
               AND column_name IN ('fornecedor_id', 'categoria_chave') AND is_nullable = 'YES')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_materia_prima_fkey')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_materia_prima_numero_key')
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_numero_key')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_motor_categoria_fkey') THEN
    RAISE EXCEPTION 'verificacao: a estrutura da etapa ou do motor nao e a esperada. Nada foi alterado.';
  END IF;
  -- os preenchimentos: a Wolff e PERFIL (se existir); nenhuma etapa fica fora de instancia (o NOT NULL ja garante; a contagem vai no aviso)
  IF EXISTS (SELECT 1 FROM public.orcamentista_motor WHERE id = '9a233c55-f377-45d3-b2ae-b1a740a98e44'::uuid AND categoria_chave <> 'PERFIL') THEN
    RAISE EXCEPTION 'verificacao: o motor da Wolff nao ficou com a categoria PERFIL. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'familia-instancia e catalogo de motores: % etapa(s) em instancia, % motor(es) com categoria; funcoes fechadas.',
    (SELECT count(*) FROM public.orcamentista_familia_etapa), (SELECT count(*) FROM public.orcamentista_motor);
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select id, materia_prima_id, tenant_id, familia, numero, motor_id from public.orcamentista_familia_etapa order by numero;
--   -- esperado: as 3 etapas, com materia_prima_id = 79d764fe-4acd-43e2-bed9-38e20667ca3d e tenant_id = 20e08592-f957-4e72-b7eb-251387e34eb9
-- select id, familia, fornecedor_id, categoria_chave from public.orcamentista_motor;                -- esperado: 1 linha, categoria PERFIL
-- select tabela, chave, antes, depois from public.superadmin_alteracao_log where antes ->> 'migracao' = '20261028000001_familia_instancia_e_catalogo_de_motores';
--   -- esperado: 4 linhas (3 etapas e o motor), com o antes e o depois
