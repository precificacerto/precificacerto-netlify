-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S2.2 / Phases 2 & 3
--
-- Pré-requisito: 20260520000002_preserve_engine_payload_v1.sql DEVE ter
-- rodado primeiro (cria engine_payload_v1 + legacy_locked + snapshot).
--
-- =====================================================================
-- PHASE 2 — LAZY RECALC (drafts)
--   Para documentos com engine_version='legacy' E status IN ('DRAFT'):
--     - Marca engine_version = NULL  → motor V2 recalcula no próximo save
--     - registra ação em mrm_legacy_audit_log (MARK_LAZY_RECALC)
--   O recálculo NÃO acontece aqui (motor V2 é TS — ADR-004); apenas
--   sinalizamos a UI/save handlers para reapurar na próxima edição.
--
-- PHASE 3 — LOCK LEGACY (approved/done/paid)
--   Para documentos com engine_version='legacy' E status terminal:
--     - Marca legacy_locked = true  → não recalcula NUNCA (ADR-002)
--     - Preserva engine_version='legacy' (auditoria fiscal)
--     - registra ação em mrm_legacy_audit_log (LOCK_LEGACY)
--   NÃO altera total_value, discount_value, discount_mode — snapshot
--   fiscal é law-of-the-land (ADR-003).
--
-- Status enums apurados (ver 20260212000000_initial_schema.sql,
--   20260514000002_add_cancelled_to_budget_status.sql,
--   20260419000005_epic22_orders_tables.sql,
--   20260219150000_stock_control_sales.sql):
--
--   budgets.status (enum budget_status):
--     DRAFT, SENT, APPROVED, EXPIRED, REJECTED, PAID, CANCELLED
--     → Phase 2 (recalc lazy):  DRAFT, SENT
--     → Phase 3 (lock):         APPROVED, PAID, EXPIRED, REJECTED, CANCELLED
--
--   orders.status (TEXT, was enum order_status):
--     DRAFT, AWAITING_PAYMENT, SENT_TO_SALE, PAID, CANCELLED
--     (+ legacy: PENDING, APPROVED, PROCESSING, SHIPPED, DELIVERED)
--     → Phase 2:  DRAFT, AWAITING_PAYMENT, PENDING
--     → Phase 3:  SENT_TO_SALE, PAID, CANCELLED, APPROVED, PROCESSING, SHIPPED, DELIVERED
--
--   sales.status (TEXT, default 'COMPLETED'):
--     COMPLETED, PAID
--     → Phase 2:  (sales são sempre finalizadas — nenhuma; lista vazia)
--     → Phase 3:  COMPLETED, PAID  (TODA sale legacy vai pra LOCK)
--
-- Idempotência:
--   - Phase 2 só toca rows com engine_version='legacy' AND legacy_locked=false
--     → se rodar 2x, segundo run pula tudo (engine_version já é NULL).
--   - Phase 3 só toca rows com engine_version='legacy' AND legacy_locked=false
--     → idempotente (legacy_locked já é true no 2º run).
--   - Audit log usa INSERT incondicional, mas WHERE EXISTS evita duplicar.
--
-- Transacionalidade:
--   - Cada bloco DO $$ ... EXCEPTION ... END $$ usa subtransação implícita
--     do PL/pgSQL. Falha não-recuperável → EXCEPTION dispara rollback automático
--     do bloco (não destrói transações de outros blocos).
--   - SAVEPOINTs SQL nativos NÃO são usados pois o executor do Supabase SQL
--     editor não suporta SAVEPOINT/ROLLBACK TO SAVEPOINT em contexto top-level
--     (erro 42601: syntax error at or near "TO"). PL/pgSQL EXCEPTION é equivalente
--     funcional e portável.
--   - BEGIN/COMMIT top-level removido — cada DO $$ block é autônomo. Supabase
--     SQL editor envolve cada statement em transação implícita.
--
-- ESTE SCRIPT NÃO CHAMA O MOTOR V2 — ADR-004 (motor é TS, não SQL).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Defensivo: criar tabela de audit log se _004 ainda não rodou.
--    Esta versão minimal é compatível com a versão completa em _004.
--    _004 adiciona indexes/RLS/comments — não muda estrutura.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mrm_legacy_audit_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id              UUID NOT NULL,
  document_type            TEXT NOT NULL,
  original_engine_version  TEXT NULL,
  action                   TEXT NOT NULL,
  performed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  performed_by             UUID NULL,
  payload                  JSONB NULL
);

-- ---------------------------------------------------------------------
-- 1) PHASE 2 — BUDGETS (DRAFT, SENT → lazy recalc)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_affected INT;
BEGIN
  WITH targets AS (
    SELECT id, tenant_id, status::TEXT AS status_text, engine_version, discount_mode
    FROM public.budgets
    WHERE engine_version = 'legacy'
      AND legacy_locked  = false
      AND status IN ('DRAFT','SENT')
  ),
  audit AS (
    INSERT INTO public.mrm_legacy_audit_log
      (tenant_id, document_id, document_type, original_engine_version, action, payload)
    SELECT
      t.tenant_id, t.id, 'budgets', t.engine_version, 'MARK_LAZY_RECALC',
      jsonb_build_object(
        'status', t.status_text,
        'discount_mode_before', t.discount_mode,
        'migration_file', '20260520000003_migrate_legacy_discount_modes.sql'
      )
    FROM targets t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mrm_legacy_audit_log al
      WHERE al.document_id = t.id
        AND al.document_type = 'budgets'
        AND al.action = 'MARK_LAZY_RECALC'
    )
    RETURNING 1
  ),
  upd AS (
    UPDATE public.budgets b
    SET engine_version = NULL
    FROM targets t
    WHERE b.id = t.id
    RETURNING b.id
  )
  SELECT COUNT(*) INTO v_affected FROM upd;
  RAISE NOTICE 'Phase 2 budgets (lazy recalc): % rows', v_affected;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Phase 2 budgets ERROR (%): % — subtransacao revertida automaticamente', SQLSTATE, SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- 2) PHASE 2 — ORDERS (DRAFT, AWAITING_PAYMENT, PENDING → lazy recalc)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_affected INT;
BEGIN
  WITH targets AS (
    SELECT id, tenant_id, status, engine_version, discount_mode
    FROM public.orders
    WHERE engine_version = 'legacy'
      AND legacy_locked  = false
      AND status IN ('DRAFT','AWAITING_PAYMENT','PENDING')
  ),
  audit AS (
    INSERT INTO public.mrm_legacy_audit_log
      (tenant_id, document_id, document_type, original_engine_version, action, payload)
    SELECT
      t.tenant_id, t.id, 'orders', t.engine_version, 'MARK_LAZY_RECALC',
      jsonb_build_object(
        'status', t.status,
        'discount_mode_before', t.discount_mode,
        'migration_file', '20260520000003_migrate_legacy_discount_modes.sql'
      )
    FROM targets t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mrm_legacy_audit_log al
      WHERE al.document_id = t.id
        AND al.document_type = 'orders'
        AND al.action = 'MARK_LAZY_RECALC'
    )
    RETURNING 1
  ),
  upd AS (
    UPDATE public.orders o
    SET engine_version = NULL
    FROM targets t
    WHERE o.id = t.id
    RETURNING o.id
  )
  SELECT COUNT(*) INTO v_affected FROM upd;
  RAISE NOTICE 'Phase 2 orders (lazy recalc): % rows', v_affected;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Phase 2 orders ERROR (%): % — subtransacao revertida automaticamente', SQLSTATE, SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- 3) PHASE 2 — SALES (nenhuma — sales são sempre terminais)
--    Mantido só pra simetria/log explícito.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  RAISE NOTICE 'Phase 2 sales: skipped (sales não tem status draft na arquitetura atual)';
END $$;

-- ---------------------------------------------------------------------
-- 4) PHASE 3 — BUDGETS (APPROVED, PAID, EXPIRED, REJECTED, CANCELLED → LOCK)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_affected INT;
BEGIN
  WITH targets AS (
    SELECT b.id, b.tenant_id, b.status::TEXT AS status_text, b.engine_version,
           b.discount_mode, b.engine_payload_v1
    FROM public.budgets b
    WHERE b.engine_version = 'legacy'
      AND b.legacy_locked  = false
      AND b.status IN ('APPROVED','PAID','EXPIRED','REJECTED','CANCELLED')
  ),
  audit AS (
    INSERT INTO public.mrm_legacy_audit_log
      (tenant_id, document_id, document_type, original_engine_version, action, payload)
    SELECT
      t.tenant_id, t.id, 'budgets', t.engine_version, 'LOCK_LEGACY',
      jsonb_build_object(
        'status', t.status_text,
        'discount_mode', t.discount_mode,
        'engine_payload_v1_snapshot', t.engine_payload_v1,
        'migration_file', '20260520000003_migrate_legacy_discount_modes.sql'
      )
    FROM targets t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mrm_legacy_audit_log al
      WHERE al.document_id = t.id
        AND al.document_type = 'budgets'
        AND al.action = 'LOCK_LEGACY'
    )
    RETURNING 1
  ),
  upd AS (
    UPDATE public.budgets b
    SET legacy_locked = true
    FROM targets t
    WHERE b.id = t.id
    RETURNING b.id
  )
  SELECT COUNT(*) INTO v_affected FROM upd;
  RAISE NOTICE 'Phase 3 budgets (lock legacy): % rows', v_affected;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Phase 3 budgets ERROR (%): % — subtransacao revertida automaticamente', SQLSTATE, SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- 5) PHASE 3 — ORDERS (terminal statuses → LOCK)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_affected INT;
BEGIN
  WITH targets AS (
    SELECT o.id, o.tenant_id, o.status, o.engine_version,
           o.discount_mode, o.engine_payload_v1
    FROM public.orders o
    WHERE o.engine_version = 'legacy'
      AND o.legacy_locked  = false
      AND o.status IN (
        'SENT_TO_SALE','PAID','CANCELLED',
        'APPROVED','PROCESSING','SHIPPED','DELIVERED'  -- legacy enum vals
      )
  ),
  audit AS (
    INSERT INTO public.mrm_legacy_audit_log
      (tenant_id, document_id, document_type, original_engine_version, action, payload)
    SELECT
      t.tenant_id, t.id, 'orders', t.engine_version, 'LOCK_LEGACY',
      jsonb_build_object(
        'status', t.status,
        'discount_mode', t.discount_mode,
        'engine_payload_v1_snapshot', t.engine_payload_v1,
        'migration_file', '20260520000003_migrate_legacy_discount_modes.sql'
      )
    FROM targets t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mrm_legacy_audit_log al
      WHERE al.document_id = t.id
        AND al.document_type = 'orders'
        AND al.action = 'LOCK_LEGACY'
    )
    RETURNING 1
  ),
  upd AS (
    UPDATE public.orders o
    SET legacy_locked = true
    FROM targets t
    WHERE o.id = t.id
    RETURNING o.id
  )
  SELECT COUNT(*) INTO v_affected FROM upd;
  RAISE NOTICE 'Phase 3 orders (lock legacy): % rows', v_affected;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Phase 3 orders ERROR (%): % — subtransacao revertida automaticamente', SQLSTATE, SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- 6) PHASE 3 — SALES (todas → LOCK, são sempre terminais)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_affected INT;
BEGIN
  WITH targets AS (
    SELECT s.id, s.tenant_id, s.status, s.engine_version,
           s.discount_mode, s.engine_payload_v1
    FROM public.sales s
    WHERE s.engine_version = 'legacy'
      AND s.legacy_locked  = false
      -- sales são sempre finalizadas; aceita TODOS os valores conhecidos
      AND (s.status IS NULL OR s.status IN ('COMPLETED','PAID'))
  ),
  audit AS (
    INSERT INTO public.mrm_legacy_audit_log
      (tenant_id, document_id, document_type, original_engine_version, action, payload)
    SELECT
      t.tenant_id, t.id, 'sales', t.engine_version, 'LOCK_LEGACY',
      jsonb_build_object(
        'status', t.status,
        'discount_mode', t.discount_mode,
        'engine_payload_v1_snapshot', t.engine_payload_v1,
        'migration_file', '20260520000003_migrate_legacy_discount_modes.sql'
      )
    FROM targets t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mrm_legacy_audit_log al
      WHERE al.document_id = t.id
        AND al.document_type = 'sales'
        AND al.action = 'LOCK_LEGACY'
    )
    RETURNING 1
  ),
  upd AS (
    UPDATE public.sales s
    SET legacy_locked = true
    FROM targets t
    WHERE s.id = t.id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_affected FROM upd;
  RAISE NOTICE 'Phase 3 sales (lock legacy): % rows', v_affected;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Phase 3 sales ERROR (%): % — subtransacao revertida automaticamente', SQLSTATE, SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- 7) Sumário final
-- ---------------------------------------------------------------------
-- Sumario final: SELECT puro (sem PL/pgSQL) — Supabase mostra o resultado
-- diretamente no editor. Substitui o DO $$ ... RAISE NOTICE anterior que
-- causava "relation v_b_lazy does not exist" em alguns executores.
SELECT
  'MRM S2.2 - Sumario pos-migration' AS info,
  (SELECT COUNT(*) FROM public.budgets
     WHERE engine_version IS NULL AND legacy_locked = false
       AND engine_payload_v1 IS NOT NULL)              AS budgets_lazy_recalc,
  (SELECT COUNT(*) FROM public.orders
     WHERE engine_version IS NULL AND legacy_locked = false
       AND engine_payload_v1 IS NOT NULL)              AS orders_lazy_recalc,
  (SELECT COUNT(*) FROM public.budgets WHERE legacy_locked = true) AS budgets_locked,
  (SELECT COUNT(*) FROM public.orders  WHERE legacy_locked = true) AS orders_locked,
  (SELECT COUNT(*) FROM public.sales   WHERE legacy_locked = true) AS sales_locked;

-- COMMIT removido: não há BEGIN top-level — cada DO $$ block é autônomo
-- e o Supabase SQL editor envolve cada statement em transação implícita.
