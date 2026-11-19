-- 20261118000003_uso_da_transcricao_de_audio.sql
--
-- PENDENTE. NAO APLICADA. Quem aplica e o chat, pelo conector do Supabase, ANTES de a Edge Function
-- `transcribe-audio` ser usada pelo webhook. Ao aplicar fora do CLI, o `name` da migracao e o nome completo
-- deste arquivo, sem a extensao: 20261118000003_uso_da_transcricao_de_audio.
-- SEM ELA a funcao nao quebra: gravar o uso devolve 42P01, a transcricao segue, e a resposta da funcao diz
-- `uso=sem_migracao` (a conversa o anota no log). O teto, sem a tabela de configuracao, fica desligado.
--
-- A TAREFA 0018 DO BRIDGE, com as decisoes do dono do produto de 18/11/2026:
--   1. "SEM TETO DE MINUTOS neste primeiro momento. Grava o uso para medir, mas nao bloqueia ninguem. O teto
--      fica em configuracao, desligado, para ser ligado depois sem mexer em codigo."
--   2. "Quem tem direito e a empresa liberada no super admin" (orcamentista_config.ativo), nao o plano.
--   3. "Limite de 3 minutos por audio continua."
--
-- O QUE FAZ (nenhuma alteracao em tabela existente):
--   - `audio_transcription_usage`: uma linha por audio que chegou a funcao, com tenant_id, duration_seconds
--     (a duracao declarada ou a devolvida pelo provedor; nula quando nenhuma das duas existe), provider
--     (groq | openai; nulo quando nada foi chamado), status (ok | falha | bloqueado_duracao | bloqueado_teto)
--     e created_at. O TEXTO transcrito NAO e gravado aqui.
--   - `audio_transcription_settings`: a configuracao do teto, UMA linha (id = 1), nascida DESLIGADA
--     (teto_ligado = false, teto_minutos_mes nulo). O status `bloqueado_teto` so existe quando alguem a ligar.
--   - RLS nas duas. O uso: a propria empresa le o seu (`get_auth_tenant_id()`), o super admin le todos
--     (`is_super_admin()`); nenhuma politica de escrita — quem grava e a funcao, pelo service_role. A
--     configuracao: so o super admin le. Os privilegios padrao de producao dao ALL a anon e authenticated em
--     tabela nova (medido em pg_default_acl, 18/11/2026): a escrita e revogada dos dois, e anon nao le nada.

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.tenants (banco %). Nada foi alterado.', current_database();
  END IF;
  IF to_regprocedure('public.get_auth_tenant_id()') IS NULL OR to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.get_auth_tenant_id() ou public.is_super_admin() (banco %). Nada foi alterado.', current_database();
  END IF;
  IF to_regclass('public.audio_transcription_usage') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'audio_transcription_usage_status_valido') THEN
    RAISE EXCEPTION 'audio_transcription_usage ja existe e nao e desta migracao. Nada foi alterado.';
  END IF;
END $guarda$;

CREATE TABLE IF NOT EXISTS public.audio_transcription_usage (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  duration_seconds numeric,
  provider         text,
  status           text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audio_transcription_usage_pkey PRIMARY KEY (id),
  CONSTRAINT audio_transcription_usage_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT audio_transcription_usage_status_valido CHECK (status IN ('ok', 'falha', 'bloqueado_duracao', 'bloqueado_teto')),
  CONSTRAINT audio_transcription_usage_provider_valido CHECK (provider IS NULL OR provider IN ('groq', 'openai')),
  CONSTRAINT audio_transcription_usage_ok_tem_provider CHECK (status <> 'ok' OR provider IS NOT NULL),
  CONSTRAINT audio_transcription_usage_duracao_positiva CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);
CREATE INDEX IF NOT EXISTS audio_transcription_usage_tenant_mes_idx ON public.audio_transcription_usage (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS public.audio_transcription_settings (
  id               smallint    NOT NULL DEFAULT 1,
  teto_ligado      boolean     NOT NULL DEFAULT false,
  teto_minutos_mes numeric,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audio_transcription_settings_pkey PRIMARY KEY (id),
  CONSTRAINT audio_transcription_settings_uma_linha CHECK (id = 1),
  CONSTRAINT audio_transcription_settings_teto CHECK (teto_minutos_mes IS NULL OR teto_minutos_mes > 0),
  CONSTRAINT audio_transcription_settings_ligado_com_teto CHECK (NOT teto_ligado OR teto_minutos_mes IS NOT NULL)
);
INSERT INTO public.audio_transcription_settings (id, teto_ligado, teto_minutos_mes) VALUES (1, false, NULL) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.audio_transcription_usage IS
  'O uso da transcricao de audio do WhatsApp, por empresa (tarefa 0018, 18/11/2026). Grava para medir; o teto mora em audio_transcription_settings, desligado. Escrita so pela Edge Function transcribe-audio (service_role).';
COMMENT ON TABLE public.audio_transcription_settings IS
  'O teto mensal de minutos de transcricao, por empresa. Nasce DESLIGADO (dono do produto, 18/11/2026: "sem teto neste primeiro momento"); ligar e mudar esta linha, sem codigo.';

ALTER TABLE public.audio_transcription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_transcription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audio_transcription_usage_select ON public.audio_transcription_usage;
CREATE POLICY audio_transcription_usage_select ON public.audio_transcription_usage
  FOR SELECT TO authenticated USING (tenant_id = public.get_auth_tenant_id() OR public.is_super_admin());
DROP POLICY IF EXISTS audio_transcription_settings_select ON public.audio_transcription_settings;
CREATE POLICY audio_transcription_settings_select ON public.audio_transcription_settings
  FOR SELECT TO authenticated USING (public.is_super_admin());

REVOKE ALL ON public.audio_transcription_usage, public.audio_transcription_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audio_transcription_usage, public.audio_transcription_settings TO authenticated;
GRANT ALL ON public.audio_transcription_usage, public.audio_transcription_settings TO service_role;

DO $verifica$
DECLARE v_n int; v_acl text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_class WHERE relname IN ('audio_transcription_usage', 'audio_transcription_settings') AND relrowsecurity;
  IF v_n <> 2 THEN RAISE EXCEPTION 'verificacao 1: RLS ligada em % de 2 tabelas.', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE tablename IN ('audio_transcription_usage', 'audio_transcription_settings');
  IF v_n <> 2 THEN RAISE EXCEPTION 'verificacao 2: % politica(s), e deviam ser 2 (so leitura).', v_n; END IF;
  SELECT string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type) INTO v_acl
    FROM information_schema.role_table_grants
   WHERE table_name IN ('audio_transcription_usage', 'audio_transcription_settings') AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF v_acl IS DISTINCT FROM 'authenticated:SELECT,authenticated:SELECT' THEN
    RAISE EXCEPTION 'verificacao 3: privilegios de anon/authenticated/PUBLIC fora do esperado: %', coalesce(v_acl, '(nenhum)');
  END IF;
  IF (SELECT count(*) FROM public.audio_transcription_settings WHERE id = 1 AND NOT teto_ligado) <> 1 THEN
    RAISE EXCEPTION 'verificacao 4: a configuracao do teto nao nasceu desligada.';
  END IF;
  RAISE NOTICE 'audio_transcription_usage e audio_transcription_settings: RLS, 2 politicas de leitura, escrita so pelo service_role, teto desligado.';
END $verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICACAO DEPOIS DE APLICAR, por consulta ao banco ──────
-- select tablename, policyname, cmd, qual from pg_policies where tablename like 'audio_transcription%';
-- select grantee, privilege_type, table_name from information_schema.role_table_grants where table_name like 'audio_transcription%' order by 3, 1, 2;
-- select * from public.audio_transcription_settings;  -- esperado: (1, false, null)
