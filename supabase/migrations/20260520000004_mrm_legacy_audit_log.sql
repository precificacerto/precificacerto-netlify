-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S2.2 / Audit Log
--
-- Tabela de auditoria para todas as ações tomadas pela migration de
-- transição legacy → V2. Cada documento tocado gera 1+ rows registrando:
--   - quem fez a ação (migration / service role / future RPC)
--   - quando
--   - qual a ação (PRESERVE_SNAPSHOT, MARK_LAZY_RECALC, LOCK_LEGACY,
--     ROLLBACK, MANUAL_OVERRIDE)
--   - payload com snapshot before/after quando aplicável
--
-- RLS:
--   - SELECT: tenant_id próprio (igual policy pattern do projeto) OU
--             super_admin (verifica via users.role)
--   - INSERT: apenas service_role (migration usa-a; nenhum cliente
--             autenticado pode escrever diretamente)
--   - UPDATE/DELETE: NUNCA permitido (audit log é append-only)
--
-- Esta tabela NÃO substitui o `engine_payload_v1` em budgets/orders/sales:
-- esse é o snapshot canônico do estado V1; o audit log é o histórico
-- das ações executadas sobre cada documento.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.mrm_legacy_audit_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id              UUID NOT NULL,
  document_type            TEXT NOT NULL,
  original_engine_version  TEXT NULL,
  action                   TEXT NOT NULL,
  performed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  performed_by             UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  payload                  JSONB NULL,

  CONSTRAINT mrm_legacy_audit_log_doc_type_chk
    CHECK (document_type IN ('budgets','orders','sales')),
  CONSTRAINT mrm_legacy_audit_log_action_chk
    CHECK (action IN (
      'PRESERVE_SNAPSHOT',
      'MARK_LAZY_RECALC',
      'LOCK_LEGACY',
      'ROLLBACK_UNLOCK',
      'ROLLBACK_RESTORE_VERSION',
      'MANUAL_OVERRIDE'
    ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mrm_legacy_audit_log_tenant_doc
  ON public.mrm_legacy_audit_log(tenant_id, document_type, document_id);

CREATE INDEX IF NOT EXISTS idx_mrm_legacy_audit_log_performed_at
  ON public.mrm_legacy_audit_log(performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrm_legacy_audit_log_action
  ON public.mrm_legacy_audit_log(action);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.mrm_legacy_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant próprio OU super_admin
DROP POLICY IF EXISTS "mrm_legacy_audit_log_select_tenant_or_super" ON public.mrm_legacy_audit_log;
CREATE POLICY "mrm_legacy_audit_log_select_tenant_or_super"
  ON public.mrm_legacy_audit_log
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'super_admin'
    )
  );

-- INSERT: bloqueado para qualquer usuário autenticado.
-- Service role (usado por migrations) bypassa RLS automaticamente, então
-- a migration consegue inserir mesmo com esta policy restritiva.
DROP POLICY IF EXISTS "mrm_legacy_audit_log_insert_service_only" ON public.mrm_legacy_audit_log;
CREATE POLICY "mrm_legacy_audit_log_insert_service_only"
  ON public.mrm_legacy_audit_log
  FOR INSERT
  WITH CHECK (false);

-- UPDATE/DELETE: nunca permitido (append-only)
DROP POLICY IF EXISTS "mrm_legacy_audit_log_no_update" ON public.mrm_legacy_audit_log;
CREATE POLICY "mrm_legacy_audit_log_no_update"
  ON public.mrm_legacy_audit_log
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "mrm_legacy_audit_log_no_delete" ON public.mrm_legacy_audit_log;
CREATE POLICY "mrm_legacy_audit_log_no_delete"
  ON public.mrm_legacy_audit_log
  FOR DELETE
  USING (false);

-- ---------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.mrm_legacy_audit_log IS
  'MRM S2.2: audit log append-only de TODAS as ações da migration legacy→V2 '
  '(Phase 1 PRESERVE, Phase 2 MARK_LAZY_RECALC, Phase 3 LOCK_LEGACY, ROLLBACK_*). '
  'RLS: SELECT por tenant ou super_admin; INSERT apenas via service_role; '
  'UPDATE/DELETE NUNCA. Source of truth para reconstituição forense.';

COMMENT ON COLUMN public.mrm_legacy_audit_log.action IS
  'PRESERVE_SNAPSHOT (Phase 1) | MARK_LAZY_RECALC (Phase 2) | LOCK_LEGACY (Phase 3) | '
  'ROLLBACK_UNLOCK | ROLLBACK_RESTORE_VERSION | MANUAL_OVERRIDE.';

COMMENT ON COLUMN public.mrm_legacy_audit_log.payload IS
  'JSONB livre. Para LOCK_LEGACY: snapshot do engine_payload_v1 + status. '
  'Para MARK_LAZY_RECALC: discount_mode original. Para ROLLBACK_*: estado '
  'restaurado. Sempre inclua "migration_file" pra rastreabilidade.';

COMMIT;
