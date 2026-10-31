-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261031000002 — A ETAPA VIRA ITEM DE CATÁLOGO: `orcamentista_etapa_catalogo`, E A ETAPA DA CONTA O SELECIONA.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261031000002_etapa_no_catalogo.
-- ║ PRESSUPÕE a 20261031000001 (excluir etapa na conta) APLICADA: o corpo de `superadmin_gravar_etapas_da_materia_prima` tem de ser o
-- ║ daquele arquivo, e o de `superadmin_arquivar_motor` o da 20261029000005 — esta migração substitui os dois e confere, pelo md5 do
-- ║ corpo, que substitui o que foi lido (a guarda aborta com a frase se não for). A ordem acordada com o dono do produto, 31/10/2026:
-- ║ aplicar a 20261031000001 → mergear o #200 → mergear o #201 → então esta.
-- ║ SEM ELA O CÓDIGO QUEBRA: a aba Etapas do nicho chama as três funções do catálogo; a base de conhecimento lê o nome, a ação e as abas
-- ║ da etapa pelo catálogo (`etapa_catalogo_id`) e grava a etapa com `etapa_catalogo_id` — a função de antes recusa o campo.
-- ║ A ordem é aplicar, verificar por consulta, e só então mergear (`.claude/rules/migracao.md`).
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — dono do produto, 31/10/2026: "Vamos criar a aba das etapas para que a gente consiga partir dela, alimentar ela, fazer as
-- integrações, as divisões corretas, informando onde vai cada coisa, para depois a gente alinhar isso." E: "O apanhado, o levantamento, a
-- definição de cada etapa, qual motor vai ser colocado, eu vou determinar manualmente. Eu quero que você crie somente a sessão."
-- As ABAS vão para o catálogo: "Dizem o que a etapa CARREGA do motor: técnico, igual para toda empresa. O que varia por empresa é a
-- INSTRUÇÃO, que fica na conta."
--
-- O QUE FAZ:
--   1. `orcamentista_etapa_catalogo` (GLOBAL, como o catálogo de famílias — sem nicho; a mesma dívida do #193, registrada na regra):
--      id; nome NOT NULL, 1..60 sem espaço nas pontas, ÚNICO SEM OLHAR A CAIXA (índice em lower(nome)); acao da lista fechada de hoje;
--      abas da planilha (a mesma CHECK da etapa); ordem (>= 1, única); criado_por, criado_em. RLS e grants ESPELHADOS de `orcamentista_motor`
--      — medidos em produção em 31/10/2026 e conferidos pelo `$verifica$` contra o próprio catálogo (não contra este texto).
--   2. O SEMEIO, autorizado pelo dono do produto (opção b): as etapas que existem sobem ao catálogo EXATAMENTE como estão — o nome é o rótulo, a
--      ação e as abas literais —, um item por (rótulo, ação, abas); nada é inventado, corrigido ou unido. Medido em 31/10/2026 (14:57:47 UTC
--      nas três): 1 "Apanhado e levantamento de esquadrias"/GERAR_LEVANTAMENTO; 2 "Relação de barras, materiais e tempo fabricaçãoprodução"/
--      CALCULAR_BARRAS; 3 "Relação de barras e materiais"/CALCULAR_BARRAS. A ordem do catálogo é a do menor número de etapa. criado_por fica
--      NULO: quem criou o item foi esta migração (o log diz de que etapas ele veio); o autor do conteúdo está no log da etapa. Duas etapas com o
--      MESMO nome sem olhar a caixa e outra ação, outras abas ou outra grafia ABORTAM: escolher qual vale não foi autorizado.
--   3. `orcamentista_familia_etapa` ganha `etapa_catalogo_id uuid NOT NULL REFERENCES orcamentista_etapa_catalogo ON DELETE RESTRICT` (as 3
--      apontam o item do semeio, com antes e depois no log, uma linha por etapa com o tenant dela) e PERDE `rotulo`, `acao` e `abas` (e as três
--      CHECK deles). `instrucao`, `numero`, `motor_id` e `motor_familia_exigida` FICAM na conta. Contagens antes e depois: aborta se não fecharem.
--   4. Três funções novas no molde das de família (SECURITY DEFINER, search_path fixo, só service_role, log, trava de aviso):
--      `superadmin_criar_etapa_do_catalogo`, `superadmin_editar_etapa_do_catalogo` (nome, ação e abas; vale também COM uso — o item é o mesmo
--      para toda conta que o seleciona), `superadmin_remover_etapa_do_catalogo` (em uso é RECUSA NOMEADA, empresa · família · número, nunca
--      cascata; sem uso, sai, com o antes no log).
--   5. `superadmin_gravar_etapas_da_materia_prima` (mesma assinatura): o corpo da 20261031000001 com o item levando `etapa_catalogo_id` no
--      lugar de rotulo/acao/abas. A remoção da etapa que não veio na lista (e a renumeração 1..N) fica como está.
--   6. `superadmin_arquivar_motor` (mesma assinatura): o corpo da 20261029000005 com o rótulo da etapa lido do catálogo (a lista
--      `etapas_sem_motor` continua com a chave `rotulo`).
--
-- O QUE NÃO FAZ: não cria etapa nenhuma além das 3 do semeio; não toca em motor, instrução, número ou família; não mexe nas outras funções que
-- leem a etapa (conferido em 31/10/2026: além das duas substituídas, nenhuma lê rotulo, acao ou abas da etapa).
-- IDEMPOTENTE: reaplicada, a fase de estrutura e semeio não roda de novo (a etapa já não tem `acao`), e as funções são CREATE OR REPLACE.
-- VERIFICAÇÃO (aborta): a tabela com as constraints exatas, RLS e políticas e grants iguais aos de `orcamentista_motor`; a FK RESTRICT NOT NULL;
-- as colunas que saíram; as cinco funções fechadas, com search_path fixo; nenhuma função do schema lê mais `rotulo`/`acao`/`abas` da etapa.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA: o que esta migração pressupõe ────────────────────────────────────────────────
DO $guarda$
DECLARE
  v_gravar   text;
  v_arquivar text;
  v_n        integer;
BEGIN
  IF to_regclass('public.orcamentista_familia_etapa') IS NULL OR to_regclass('public.orcamentista_motor') IS NULL
     OR to_regclass('public.orcamentista_motor_familia') IS NULL OR to_regclass('public.superadmin_alteracao_log') IS NULL
     OR to_regclass('public.orcamentista_materia_prima') IS NULL OR to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: a etapa da familia-instancia e o catalogo de motores (20261029000003) nao estao aplicados. Nada foi alterado.';
  END IF;
  -- reaplicada: a etapa ja nao tem `acao`; a estrutura e o semeio nao rodam de novo, e as funcoes sao substituidas pelas deste arquivo
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'acao') THEN
    IF to_regclass('public.orcamentista_etapa_catalogo') IS NULL THEN
      RAISE EXCEPTION 'guarda: a etapa nao tem acao e o catalogo de etapas nao existe; o estado nao e o de antes nem o de depois desta migracao. Nada foi alterado.';
    END IF;
    RETURN;
  END IF;
  SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_gravar FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)');
  IF v_gravar IS DISTINCT FROM 'bc74a15d49552f308e12fb3b3b7093c5' THEN
    RAISE EXCEPTION 'dependencia ausente: a 20261031000001 (excluir etapa na conta) nao esta aplicada - a gravacao das etapas tem outro corpo (md5 %). Nada foi alterado.', coalesce(v_gravar, 'nenhum');
  END IF;
  SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_arquivar FROM pg_proc p WHERE p.oid = to_regprocedure('public.superadmin_arquivar_motor(uuid, uuid)');
  IF v_arquivar IS DISTINCT FROM 'a6219d0a230a63a54669def1d41be941' THEN
    RAISE EXCEPTION 'guarda: superadmin_arquivar_motor nao tem o corpo da 20261029000005 (md5 %); esta migracao o substituiria sem saber o que substitui. Nada foi alterado.', coalesce(v_arquivar, 'nenhum');
  END IF;
  IF to_regclass('public.orcamentista_etapa_catalogo') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.orcamentista_etapa_catalogo' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'guarda: o catalogo de etapas ja existe com % item(ns) e a etapa ainda tem acao; o semeio nao decide o que vale. Nada foi alterado.', v_n;
    END IF;
  END IF;
  -- duas etapas com o mesmo nome sem olhar a caixa viram UM item so se forem iguais em tudo (a grafia, a acao e as abas)
  SELECT string_agg(z.x, '; ' ORDER BY z.x) INTO v_gravar FROM (
    SELECT string_agg(DISTINCT format('"%s" (%s, abas %s)', e.rotulo, e.acao, array_to_string(e.abas, ',')), ' x ') AS x
      FROM public.orcamentista_familia_etapa e
     GROUP BY lower(e.rotulo)
    HAVING count(DISTINCT (e.rotulo, e.acao, e.abas)) > 1) z;
  IF v_gravar IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: etapas com o mesmo nome e conteudo diferente: %. Escolher qual vale no catalogo nao foi autorizado. Nada foi alterado.', v_gravar;
  END IF;
END
$guarda$;

-- ── 1. O CATÁLOGO DE ETAPAS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentista_etapa_catalogo (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  nome       text        NOT NULL,
  acao       text        NOT NULL,
  abas       text[]      NOT NULL DEFAULT '{}'::text[],
  ordem      integer     NOT NULL,
  criado_por uuid,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orcamentista_etapa_catalogo_pkey PRIMARY KEY (id),
  CONSTRAINT orcamentista_etapa_catalogo_nome_forma CHECK (nome = btrim(nome) AND char_length(nome) >= 1 AND char_length(nome) <= 60),
  CONSTRAINT orcamentista_etapa_catalogo_acao_da_lista CHECK (acao = ANY (ARRAY['APANHAR', 'CONFIRMAR', 'GERAR_LEVANTAMENTO', 'CALCULAR_BARRAS', 'ENVIAR'])),
  CONSTRAINT orcamentista_etapa_catalogo_abas_da_planilha CHECK (abas <@ ARRAY['tipologias', 'perfis', 'formulas', 'variaveis', 'vidros', 'baguetes', 'insumos',
                                                                                'validacoes', 'otimizacao', 'formulas_da_linha', 'regras', 'tempos']),
  CONSTRAINT orcamentista_etapa_catalogo_ordem_positiva CHECK (ordem >= 1),
  CONSTRAINT orcamentista_etapa_catalogo_ordem_key UNIQUE (ordem),
  CONSTRAINT orcamentista_etapa_catalogo_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES public.users (id) ON DELETE SET NULL
);
-- ÚNICO SEM OLHAR A CAIXA (dono do produto, 31/10/2026): o índice é a trava; a função dá a frase
CREATE UNIQUE INDEX IF NOT EXISTS orcamentista_etapa_catalogo_nome_unico ON public.orcamentista_etapa_catalogo (lower(nome));

-- RLS e grants espelhados de orcamentista_motor (medidos em produção em 31/10/2026: RLS ligada, sem FORCE; quatro políticas para `public`, todas
-- is_super_admin(); privilégios só de postgres e service_role). O $verifica$ compara com o catálogo de orcamentista_motor, não com este texto.
ALTER TABLE public.orcamentista_etapa_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orcamentista_etapa_catalogo_select_super_admin ON public.orcamentista_etapa_catalogo;
DROP POLICY IF EXISTS orcamentista_etapa_catalogo_insert_super_admin ON public.orcamentista_etapa_catalogo;
DROP POLICY IF EXISTS orcamentista_etapa_catalogo_update_super_admin ON public.orcamentista_etapa_catalogo;
DROP POLICY IF EXISTS orcamentista_etapa_catalogo_delete_super_admin ON public.orcamentista_etapa_catalogo;
CREATE POLICY orcamentista_etapa_catalogo_select_super_admin ON public.orcamentista_etapa_catalogo FOR SELECT USING (is_super_admin());
CREATE POLICY orcamentista_etapa_catalogo_insert_super_admin ON public.orcamentista_etapa_catalogo FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY orcamentista_etapa_catalogo_update_super_admin ON public.orcamentista_etapa_catalogo FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY orcamentista_etapa_catalogo_delete_super_admin ON public.orcamentista_etapa_catalogo FOR DELETE USING (is_super_admin());
REVOKE ALL ON public.orcamentista_etapa_catalogo FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.orcamentista_etapa_catalogo TO service_role;

-- ── 2. O SEMEIO e 3. A ETAPA DA CONTA APONTA O CATÁLOGO (só na primeira aplicação) ─────────────
ALTER TABLE public.orcamentista_familia_etapa ADD COLUMN IF NOT EXISTS etapa_catalogo_id uuid;

DO $semeio$
DECLARE
  v_etapas      integer;
  v_grupos      integer;
  v_itens       integer;
  v_apontadas   integer;
  v_log_antes   integer;
  v_log_depois  integer;
  v_e           record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name = 'acao') THEN
    RAISE NOTICE 'semeio: a etapa ja aponta o catalogo (reaplicada); nada a semear.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_log_antes FROM public.superadmin_alteracao_log;
  -- ANTES
  SELECT count(*), count(DISTINCT (e.rotulo, e.acao, e.abas)) INTO v_etapas, v_grupos FROM public.orcamentista_familia_etapa e;

  -- um item por (rotulo, acao, abas), na ordem do menor numero de etapa que o usa; nome = o rotulo, literal
  INSERT INTO public.orcamentista_etapa_catalogo (nome, acao, abas, ordem, criado_por)
  SELECT e.rotulo, e.acao, e.abas, row_number() OVER (ORDER BY min(e.numero), e.rotulo, e.acao)::integer, NULL
    FROM public.orcamentista_familia_etapa e
   GROUP BY e.rotulo, e.acao, e.abas;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  SELECT NULL, 'orcamentista_etapa_catalogo', c.id::text, NULL,
         jsonb_build_object('orcamentista_etapa_catalogo', to_jsonb(c), 'semeio_das_etapas',
           (SELECT jsonb_agg(e.id ORDER BY e.tenant_id, e.materia_prima_id, e.numero) FROM public.orcamentista_familia_etapa e
             WHERE e.rotulo = c.nome AND e.acao = c.acao AND e.abas = c.abas)), NULL
    FROM public.orcamentista_etapa_catalogo c;

  -- cada etapa aponta o item que tem o seu rotulo, a sua acao e as suas abas; uma linha de log por etapa, com o tenant dela
  FOR v_e IN SELECT e.* FROM public.orcamentista_familia_etapa e ORDER BY e.tenant_id, e.materia_prima_id, e.numero FOR UPDATE LOOP
    UPDATE public.orcamentista_familia_etapa x SET etapa_catalogo_id = c.id
      FROM public.orcamentista_etapa_catalogo c
     WHERE x.id = v_e.id AND c.nome = v_e.rotulo AND c.acao = v_e.acao AND c.abas = v_e.abas;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (v_e.tenant_id, 'orcamentista_familia_etapa', v_e.id::text,
            jsonb_build_object('orcamentista_familia_etapa', to_jsonb(v_e), 'etapa_vira_item_de_catalogo', true),
            jsonb_build_object('orcamentista_familia_etapa', (SELECT to_jsonb(x) FROM public.orcamentista_familia_etapa x WHERE x.id = v_e.id)), NULL);
  END LOOP;

  -- DEPOIS: as contagens fecham, ou nada fica
  SELECT count(*) INTO v_itens FROM public.orcamentista_etapa_catalogo;
  SELECT count(*) INTO v_apontadas FROM public.orcamentista_familia_etapa e JOIN public.orcamentista_etapa_catalogo c ON c.id = e.etapa_catalogo_id
   WHERE c.nome = e.rotulo AND c.acao = e.acao AND c.abas = e.abas;
  SELECT count(*) INTO v_log_depois FROM public.superadmin_alteracao_log;
  IF v_itens <> v_grupos OR v_apontadas <> v_etapas OR (SELECT count(*) FROM public.orcamentista_familia_etapa) <> v_etapas
     OR v_log_depois - v_log_antes <> v_itens + v_etapas THEN
    RAISE EXCEPTION 'semeio: as contagens nao fecharam (etapas %, grupos %, itens %, apontadas %, logs %). Nada foi alterado.',
      v_etapas, v_grupos, v_itens, v_apontadas, v_log_depois - v_log_antes;
  END IF;
  RAISE NOTICE 'semeio: % etapa(s) -> % item(ns) do catalogo; % etapa(s) apontando.', v_etapas, v_itens, v_apontadas;
END
$semeio$;

ALTER TABLE public.orcamentista_familia_etapa ALTER COLUMN etapa_catalogo_id SET NOT NULL;
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orcamentista_familia_etapa_etapa_catalogo_fkey' AND conrelid = 'public.orcamentista_familia_etapa'::regclass) THEN
    ALTER TABLE public.orcamentista_familia_etapa ADD CONSTRAINT orcamentista_familia_etapa_etapa_catalogo_fkey
      FOREIGN KEY (etapa_catalogo_id) REFERENCES public.orcamentista_etapa_catalogo (id) ON DELETE RESTRICT;
  END IF;
END
$fk$;
CREATE INDEX IF NOT EXISTS orcamentista_familia_etapa_etapa_catalogo_idx ON public.orcamentista_familia_etapa (etapa_catalogo_id);
-- o nome, a acao e as abas sao do catalogo agora (as CHECK saem com as colunas)
ALTER TABLE public.orcamentista_familia_etapa DROP CONSTRAINT IF EXISTS orcamentista_familia_etapa_rotulo_forma;
ALTER TABLE public.orcamentista_familia_etapa DROP CONSTRAINT IF EXISTS orcamentista_familia_etapa_acao_da_lista;
ALTER TABLE public.orcamentista_familia_etapa DROP CONSTRAINT IF EXISTS orcamentista_familia_etapa_abas_da_planilha;
ALTER TABLE public.orcamentista_familia_etapa DROP COLUMN IF EXISTS rotulo;
ALTER TABLE public.orcamentista_familia_etapa DROP COLUMN IF EXISTS acao;
ALTER TABLE public.orcamentista_familia_etapa DROP COLUMN IF EXISTS abas;

-- ── 4A. CRIAR ETAPA NO CATÁLOGO ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_criar_etapa_do_catalogo(
  p_por uuid, p_nome text, p_acao text, p_abas text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_nome       text := btrim(coalesce(p_nome, ''));
  v_igual      text;
  v_ordem      integer;
  v_id         uuid;
  v_depois     jsonb;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_abas IS NOT NULL AND (SELECT count(*) <> count(DISTINCT a) OR bool_or(a IS NULL) FROM unnest(p_abas) a) THEN
    RAISE EXCEPTION 'uma aba aparece mais de uma vez, ou vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- uma criacao por vez: a ordem e a ultima + 1 e o nome nao repete - as duas conferencias valem so sob a trava
  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_etapa_catalogo', 0));
  SELECT c.nome INTO v_igual FROM public.orcamentista_etapa_catalogo c WHERE lower(c.nome) = lower(v_nome) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a etapa "%" no catalogo: o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(max(c.ordem), 0) + 1 INTO v_ordem FROM public.orcamentista_etapa_catalogo c;

  BEGIN
    INSERT INTO public.orcamentista_etapa_catalogo (nome, acao, abas, ordem, criado_por)
    VALUES (v_nome, p_acao, coalesce(p_abas, '{}'::text[]), v_ordem, p_por)
    RETURNING id INTO v_id;
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_etapa_catalogo_nome_forma' THEN 'o nome da etapa tem de 1 a 60 caracteres. Nada foi gravado.'
      WHEN 'orcamentista_etapa_catalogo_acao_da_lista' THEN 'a acao nao esta na lista. Nada foi gravado.'
      WHEN 'orcamentista_etapa_catalogo_abas_da_planilha' THEN 'uma aba nao e da planilha. Nada foi gravado.'
      ELSE 'a acao e obrigatoria e e da lista. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;

  SELECT to_jsonb(c) INTO v_depois FROM public.orcamentista_etapa_catalogo c WHERE c.id = v_id;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_etapa_catalogo', v_id::text, NULL, jsonb_build_object('orcamentista_etapa_catalogo', v_depois), p_por);
  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_criar_etapa_do_catalogo(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_etapa_do_catalogo(uuid, text, text, text[]) TO service_role;

-- ── 4B. EDITAR (renomear, trocar a ação e as abas; também COM uso) ───────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_editar_etapa_do_catalogo(
  p_por uuid, p_id uuid, p_nome text, p_acao text, p_abas text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_nome       text := btrim(coalesce(p_nome, ''));
  v_abas       text[] := coalesce(p_abas, '{}'::text[]);
  v_igual      text;
  v_antes      public.orcamentista_etapa_catalogo%ROWTYPE;
  v_depois     jsonb;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT a) OR bool_or(a IS NULL) FROM unnest(v_abas) a) THEN
    RAISE EXCEPTION 'uma aba aparece mais de uma vez, ou vazia. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_etapa_catalogo', 0));
  SELECT c.* INTO v_antes FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'etapa do catalogo inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT c.nome INTO v_igual FROM public.orcamentista_etapa_catalogo c WHERE c.id <> p_id AND lower(c.nome) = lower(v_nome) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a etapa "%" no catalogo: o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_antes.nome = v_nome AND v_antes.acao IS NOT DISTINCT FROM p_acao AND v_antes.abas = v_abas THEN
    RAISE EXCEPTION 'nada mudou: o nome, a acao e as abas sao os de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  BEGIN
    UPDATE public.orcamentista_etapa_catalogo SET nome = v_nome, acao = p_acao, abas = v_abas WHERE id = p_id;
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_etapa_catalogo_nome_forma' THEN 'o nome da etapa tem de 1 a 60 caracteres. Nada foi gravado.'
      WHEN 'orcamentista_etapa_catalogo_acao_da_lista' THEN 'a acao nao esta na lista. Nada foi gravado.'
      WHEN 'orcamentista_etapa_catalogo_abas_da_planilha' THEN 'uma aba nao e da planilha. Nada foi gravado.'
      ELSE 'a acao e obrigatoria e e da lista. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;

  SELECT to_jsonb(c) INTO v_depois FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_etapa_catalogo', p_id::text, jsonb_build_object('orcamentista_etapa_catalogo', to_jsonb(v_antes)),
          jsonb_build_object('orcamentista_etapa_catalogo', v_depois), p_por);
  RETURN v_depois;
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_editar_etapa_do_catalogo(uuid, uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_etapa_do_catalogo(uuid, uuid, text, text, text[]) TO service_role;

-- ── 4C. REMOVER: em uso é recusa NOMEADA (empresa · família · número); sem uso, sai ───────────
CREATE OR REPLACE FUNCTION public.superadmin_remover_etapa_do_catalogo(
  p_por uuid, p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_nome   text;
  v_usos   integer;
  v_nomes  text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- FOR UPDATE na linha do item: quem for aponta-lo (a gravacao das etapas, FOR SHARE; a FK, FOR KEY SHARE) espera esta transacao; e esta so conta
  -- o uso depois de quem ja apontou
  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_etapa_catalogo', 0));
  SELECT c.nome, to_jsonb(c) INTO v_nome, v_antes FROM public.orcamentista_etapa_catalogo c WHERE c.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'etapa do catalogo inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT count(*) INTO v_usos FROM public.orcamentista_familia_etapa e WHERE e.etapa_catalogo_id = p_id;
  IF v_usos > 0 THEN
    SELECT string_agg(z.x, ', ' ORDER BY z.o) INTO v_nomes FROM (
      SELECT format('%s / %s / etapa %s', coalesce(t.name, '(sem nome)'), mp.nome, e.numero) AS x,
             row_number() OVER (ORDER BY coalesce(t.name, '(sem nome)'), mp.nome, e.numero) AS o
        FROM public.orcamentista_familia_etapa e
        JOIN public.orcamentista_materia_prima mp ON mp.id = e.materia_prima_id
        LEFT JOIN public.tenants t ON t.id = e.tenant_id
       WHERE e.etapa_catalogo_id = p_id
       ORDER BY 2 LIMIT 10) z;
    IF v_usos > 10 THEN
      v_nomes := v_nomes || format(' e mais %s', v_usos - 10);
    END IF;
    RAISE EXCEPTION 'a etapa "%" do catalogo esta em uso em % etapa(s) de conta (%). Tire o uso antes de remover. Nada foi removido.', v_nome, v_usos, v_nomes
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  DELETE FROM public.orcamentista_etapa_catalogo WHERE id = p_id;
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_etapa_catalogo', p_id::text, jsonb_build_object('orcamentista_etapa_catalogo', v_antes), NULL, p_por);
  RETURN jsonb_build_object('removida', p_id, 'nome', v_nome);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_remover_etapa_do_catalogo(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_remover_etapa_do_catalogo(uuid, uuid) TO service_role;

-- ── 5. A GRAVAÇÃO DAS ETAPAS DA CONTA: o item seleciona a etapa do catálogo ──────────────────
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
  v_constraint text;
  v_marq       timestamptz;
  v_rem        record;
  v_removidas  jsonb := '[]'::jsonb;
  v_permitidas text[] := ARRAY['id', 'etapa_catalogo_id', 'instrucao', 'motor_id'];
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
        RAISE EXCEPTION 'etapa %: o campo "%" nao existe (so id, etapa_catalogo_id, instrucao e motor_id; o nome, a acao e as abas sao do catalogo)', i, k
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
    END LOOP;
    -- a ETAPA DO CATALOGO (31/10/2026): a conta seleciona, nao renomeia. FOR SHARE: remover o item (FOR UPDATE) espera esta transacao e ve o uso
    IF jsonb_typeof(e -> 'etapa_catalogo_id') IS DISTINCT FROM 'string'
       OR (e ->> 'etapa_catalogo_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'etapa %: a etapa do catalogo e obrigatoria (o etapa_catalogo_id, um uuid)', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    PERFORM 1 FROM public.orcamentista_etapa_catalogo c WHERE c.id = (e ->> 'etapa_catalogo_id')::uuid FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'etapa %: a etapa do catalogo nao existe', i USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF e ? 'instrucao' AND jsonb_typeof(e -> 'instrucao') <> 'string' THEN
      RAISE EXCEPTION 'etapa %: a instrucao e um texto', i USING ERRCODE = 'invalid_parameter_value';
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

  SELECT coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('etapa_do_catalogo', c.nome) ORDER BY x.numero), '[]'::jsonb) INTO v_antes
    FROM public.orcamentista_familia_etapa x JOIN public.orcamentista_etapa_catalogo c ON c.id = x.etapa_catalogo_id WHERE x.materia_prima_id = p_materia_prima;

  -- REMOVE (dono do produto, 30/10/2026): a etapa que existe e NAO veio na lista sai, com antes e depois no log, uma linha por etapa, com o tenant.
  -- As que ficam renumeram 1..N pela posicao na lista (o laco abaixo), sem buraco. Nenhuma tabela referencia a etapa (a guarda da 20261031000001).
  FOR v_rem IN
    SELECT x.*, c.nome AS nome_do_catalogo FROM public.orcamentista_familia_etapa x JOIN public.orcamentista_etapa_catalogo c ON c.id = x.etapa_catalogo_id
     WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant AND NOT (x.id = ANY (v_ids))
     ORDER BY x.numero
       FOR UPDATE OF x
  LOOP
    DELETE FROM public.orcamentista_familia_etapa WHERE id = v_rem.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (p_tenant, 'orcamentista_familia_etapa', v_rem.id::text,
            jsonb_build_object('orcamentista_familia_etapa', to_jsonb(v_rem) - 'nome_do_catalogo', 'etapa_do_catalogo', v_rem.nome_do_catalogo, 'remocao_da_etapa', true),
            NULL, p_por);
    v_removidas := v_removidas || jsonb_build_array(jsonb_build_object('id', v_rem.id, 'numero', v_rem.numero, 'rotulo', v_rem.nome_do_catalogo));
  END LOOP;

  -- duas fases: a unicidade (materia_prima_id, numero) nao e adiavel
  UPDATE public.orcamentista_familia_etapa SET numero = numero + 1000000 WHERE materia_prima_id = p_materia_prima;
  FOR i IN 1..v_n LOOP
    e := p_etapas -> (i - 1);
    BEGIN
      IF e ? 'id' AND jsonb_typeof(e -> 'id') <> 'null' THEN
        UPDATE public.orcamentista_familia_etapa
           SET numero = i, etapa_catalogo_id = (e ->> 'etapa_catalogo_id')::uuid, instrucao = coalesce(e ->> 'instrucao', ''),
               atualizado_por = p_por, atualizado_em = now(),
               motor_id = CASE WHEN e ? 'motor_id' THEN (e ->> 'motor_id')::uuid ELSE motor_id END,
               motor_familia_exigida = CASE WHEN e ? 'motor_id'
                 THEN CASE WHEN (e ->> 'motor_id') IS NULL THEN NULL ELSE familia END
                 ELSE motor_familia_exigida END
         WHERE id = (e ->> 'id')::uuid;
      ELSE
        INSERT INTO public.orcamentista_familia_etapa (tenant_id, materia_prima_id, familia, numero, etapa_catalogo_id, instrucao, atualizado_por, motor_id,
                                                      motor_familia_exigida)
        VALUES (p_tenant, p_materia_prima, v_familia, i, (e ->> 'etapa_catalogo_id')::uuid, coalesce(e ->> 'instrucao', ''), p_por, (e ->> 'motor_id')::uuid,
                CASE WHEN (e ->> 'motor_id') IS NULL THEN NULL ELSE v_familia END);
      END IF;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      RAISE EXCEPTION 'etapa %: %', i, CASE v_constraint
        WHEN 'orcamentista_familia_etapa_instrucao_ate_4000' THEN 'a instrucao passa de 4000 caracteres'
        ELSE 'um valor nao passou numa regra do banco' END
        USING ERRCODE = 'invalid_parameter_value';
    END;
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('etapa_do_catalogo', c.nome) ORDER BY x.numero), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_familia_etapa x JOIN public.orcamentista_etapa_catalogo c ON c.id = x.etapa_catalogo_id WHERE x.materia_prima_id = p_materia_prima;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_familia_etapa', p_materia_prima::text,
          jsonb_build_object('orcamentista_familia_etapa', v_antes),
          jsonb_build_object('orcamentista_familia_etapa', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_familia_etapa', v_depois, 'etapas_removidas', v_removidas);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb) TO service_role;

-- ── 6. ARQUIVAR MOTOR: o corpo da 20261029000005, com o rótulo da etapa lido do catálogo ────────
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
  v_eantes jsonb;
  v_sem    jsonb := '[]'::jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_motor IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- a linha do motor travada: uma etapa sendo gravada para ele (FOR SHARE) espera; depois o ve arquivado e recusa
  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_arquivar_motor:' || p_motor::text, 0));
  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_motor m WHERE m.id = p_motor FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'motor inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_antes ->> 'arquivado_em' IS NOT NULL THEN
    RAISE EXCEPTION 'o motor ja esta arquivado' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- as ETAPAS que usam o motor ficam SEM MOTOR (dono do produto, 29/10/2026), cada uma com antes e depois no log, com o tenant dela; a lista volta
  -- para a tela. O rotulo da etapa e o nome do item do catalogo que ela seleciona (31/10/2026)
  FOR v_etapa IN
    SELECT x.id, x.tenant_id, x.materia_prima_id, x.numero, c.nome AS nome_da_etapa, mp.nome AS familia, coalesce(t.name, '(sem nome)') AS empresa
      FROM public.orcamentista_familia_etapa x
      JOIN public.orcamentista_etapa_catalogo c ON c.id = x.etapa_catalogo_id
      JOIN public.orcamentista_materia_prima mp ON mp.id = x.materia_prima_id
      LEFT JOIN public.tenants t ON t.id = x.tenant_id
     WHERE x.motor_id = p_motor
     ORDER BY coalesce(t.name, '(sem nome)'), mp.nome, x.numero
       FOR UPDATE OF x
  LOOP
    SELECT to_jsonb(x) INTO v_eantes FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id;
    UPDATE public.orcamentista_familia_etapa
       SET motor_id = NULL, motor_familia_exigida = NULL, atualizado_por = p_por, atualizado_em = now()
     WHERE id = v_etapa.id;
    INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
    VALUES (v_etapa.tenant_id, 'orcamentista_familia_etapa', v_etapa.id::text,
            jsonb_build_object('orcamentista_familia_etapa', v_eantes, 'arquivamento_do_motor', p_motor),
            jsonb_build_object('orcamentista_familia_etapa', (SELECT to_jsonb(x) FROM public.orcamentista_familia_etapa x WHERE x.id = v_etapa.id)),
            p_por);
    v_sem := v_sem || jsonb_build_array(jsonb_build_object(
      'etapa_id', v_etapa.id, 'tenant_id', v_etapa.tenant_id, 'materia_prima_id', v_etapa.materia_prima_id,
      'empresa', v_etapa.empresa, 'familia', v_etapa.familia, 'numero', v_etapa.numero, 'rotulo', v_etapa.nome_da_etapa));
  END LOOP;

  UPDATE public.orcamentista_motor SET arquivado_em = now(), arquivado_por = p_por WHERE id = p_motor;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_motor m WHERE m.id = p_motor;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_motor', p_motor::text,
          jsonb_build_object('orcamentista_motor', v_antes),
          jsonb_build_object('orcamentista_motor', v_depois, 'etapas_sem_motor', v_sem), p_por);

  RETURN jsonb_build_object('orcamentista_motor', v_depois, 'etapas_sem_motor', v_sem);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_arquivar_motor(uuid, uuid) TO service_role;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  f      regprocedure;
  nome   text;
  v_n    integer;
  v_txt  text;
BEGIN
  -- a tabela, as constraints exatas
  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid = 'public.orcamentista_etapa_catalogo'::regclass AND (c.conname, pg_get_constraintdef(c.oid)) IN (
        ('orcamentista_etapa_catalogo_pkey', 'PRIMARY KEY (id)'),
        ('orcamentista_etapa_catalogo_nome_forma', 'CHECK (((nome = btrim(nome)) AND (char_length(nome) >= 1) AND (char_length(nome) <= 60)))'),
        ('orcamentista_etapa_catalogo_acao_da_lista', 'CHECK ((acao = ANY (ARRAY[''APANHAR''::text, ''CONFIRMAR''::text, ''GERAR_LEVANTAMENTO''::text, ''CALCULAR_BARRAS''::text, ''ENVIAR''::text])))'),
        ('orcamentista_etapa_catalogo_abas_da_planilha', 'CHECK ((abas <@ ARRAY[''tipologias''::text, ''perfis''::text, ''formulas''::text, ''variaveis''::text, ''vidros''::text, ''baguetes''::text, ''insumos''::text, ''validacoes''::text, ''otimizacao''::text, ''formulas_da_linha''::text, ''regras''::text, ''tempos''::text]))'),
        ('orcamentista_etapa_catalogo_ordem_positiva', 'CHECK ((ordem >= 1))'),
        ('orcamentista_etapa_catalogo_ordem_key', 'UNIQUE (ordem)'),
        ('orcamentista_etapa_catalogo_criado_por_fkey', 'FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE SET NULL'))) <> 7
     OR (SELECT count(*) FROM pg_constraint c WHERE c.conrelid = 'public.orcamentista_etapa_catalogo'::regclass) <> 7 THEN
    RAISE EXCEPTION 'verificacao: as constraints do catalogo de etapas nao sao as deste arquivo. Nada foi alterado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orcamentista_etapa_catalogo_nome_unico'
                  AND indexdef = 'CREATE UNIQUE INDEX orcamentista_etapa_catalogo_nome_unico ON public.orcamentista_etapa_catalogo USING btree (lower(nome))') THEN
    RAISE EXCEPTION 'verificacao: o nome unico sem olhar a caixa nao esta la. Nada foi alterado.';
  END IF;
  -- RLS, politicas e grants IGUAIS aos de orcamentista_motor, lidos do catalogo do banco
  IF (SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE oid = 'public.orcamentista_etapa_catalogo'::regclass)
     IS DISTINCT FROM (SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE oid = 'public.orcamentista_motor'::regclass) THEN
    RAISE EXCEPTION 'verificacao: a RLS do catalogo de etapas nao e a de orcamentista_motor. Nada foi alterado.';
  END IF;
  IF EXISTS (
      (SELECT replace(p.policyname, 'orcamentista_etapa_catalogo_', ''), p.permissive, p.roles::text, p.cmd, p.qual, p.with_check FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'orcamentista_etapa_catalogo'
       EXCEPT
       SELECT replace(p.policyname, 'orcamentista_motor_', ''), p.permissive, p.roles::text, p.cmd, p.qual, p.with_check FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'orcamentista_motor')
      UNION ALL
      (SELECT replace(p.policyname, 'orcamentista_motor_', ''), p.permissive, p.roles::text, p.cmd, p.qual, p.with_check FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'orcamentista_motor'
       EXCEPT
       SELECT replace(p.policyname, 'orcamentista_etapa_catalogo_', ''), p.permissive, p.roles::text, p.cmd, p.qual, p.with_check FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'orcamentista_etapa_catalogo')) THEN
    RAISE EXCEPTION 'verificacao: as politicas do catalogo de etapas nao sao as de orcamentista_motor. Nada foi alterado.';
  END IF;
  IF EXISTS (
      (SELECT a.grantee, a.privilege_type, a.is_grantable FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.orcamentista_etapa_catalogo'::regclass
       EXCEPT SELECT a.grantee, a.privilege_type, a.is_grantable FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.orcamentista_motor'::regclass)
      UNION ALL
      (SELECT a.grantee, a.privilege_type, a.is_grantable FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.orcamentista_motor'::regclass
       EXCEPT SELECT a.grantee, a.privilege_type, a.is_grantable FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = 'public.orcamentista_etapa_catalogo'::regclass)) THEN
    RAISE EXCEPTION 'verificacao: os privilegios do catalogo de etapas nao sao os de orcamentista_motor. Nada foi alterado.';
  END IF;
  -- a etapa da conta: a FK RESTRICT, NOT NULL; as tres colunas que sairam
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.orcamentista_familia_etapa'::regclass AND c.conname = 'orcamentista_familia_etapa_etapa_catalogo_fkey'
                  AND pg_get_constraintdef(c.oid) = 'FOREIGN KEY (etapa_catalogo_id) REFERENCES orcamentista_etapa_catalogo(id) ON DELETE RESTRICT')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa'
                     AND column_name = 'etapa_catalogo_id' AND is_nullable = 'NO' AND data_type = 'uuid') THEN
    RAISE EXCEPTION 'verificacao: a etapa da conta nao aponta o catalogo com FK RESTRICT NOT NULL. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orcamentista_familia_etapa' AND column_name IN ('rotulo', 'acao', 'abas');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'verificacao: a etapa da conta ainda tem % das colunas rotulo, acao e abas. Nada foi alterado.', v_n;
  END IF;
  -- nenhuma etapa sem item; nenhuma FK para o catalogo que nao seja RESTRICT (nada de cascata)
  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_etapa e LEFT JOIN public.orcamentista_etapa_catalogo c ON c.id = e.etapa_catalogo_id WHERE c.id IS NULL)
     OR EXISTS (SELECT 1 FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid = 'public.orcamentista_etapa_catalogo'::regclass AND c.confdeltype <> 'r') THEN
    RAISE EXCEPTION 'verificacao: etapa sem item do catalogo, ou FK para o catalogo que nao e RESTRICT. Nada foi alterado.';
  END IF;
  -- as cinco funcoes fechadas, com search_path fixo
  FOREACH nome IN ARRAY ARRAY[
    'public.superadmin_criar_etapa_do_catalogo(uuid, text, text, text[])',
    'public.superadmin_editar_etapa_do_catalogo(uuid, uuid, text, text, text[])',
    'public.superadmin_remover_etapa_do_catalogo(uuid, uuid)',
    'public.superadmin_gravar_etapas_da_materia_prima(uuid, uuid, uuid, jsonb)',
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
  -- nenhuma funcao do schema le mais o rotulo, a acao ou as abas da etapa (plpgsql so falharia no primeiro uso)
  SELECT string_agg(p.proname, ', ') INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc LIKE '%orcamentista_familia_etapa%'
     AND p.prosrc ~ '(x|e|v_rem|v_etapa|v_e)\.(rotulo|acao|abas)\M';
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: % ainda le rotulo, acao ou abas da etapa. Nada foi alterado.', v_txt;
  END IF;
  RAISE NOTICE 'etapa no catalogo: a tabela com RLS e grants de orcamentista_motor, % item(ns), % etapa(s) apontando; cinco funcoes fechadas.',
    (SELECT count(*) FROM public.orcamentista_etapa_catalogo), (SELECT count(*) FROM public.orcamentista_familia_etapa);
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select id, nome, acao, abas, ordem, criado_por from public.orcamentista_etapa_catalogo order by ordem;     -- esperado: os 3 itens, nomes literais
-- select e.numero, c.nome, c.acao, e.instrucao, e.motor_id is not null as tem_motor
--   from public.orcamentista_familia_etapa e join public.orcamentista_etapa_catalogo c on c.id = e.etapa_catalogo_id order by e.numero;  -- as 3, intactas
-- select column_name from information_schema.columns where table_name = 'orcamentista_familia_etapa' and column_name in ('rotulo','acao','abas');  -- 0
-- select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('superadmin_gravar_etapas_da_materia_prima', 'superadmin_arquivar_motor',
--   'superadmin_criar_etapa_do_catalogo', 'superadmin_editar_etapa_do_catalogo', 'superadmin_remover_etapa_do_catalogo');   -- os do corpo deste arquivo
