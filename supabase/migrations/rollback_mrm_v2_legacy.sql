-- =====================================================================
-- ROLLBACK MRM V2 — LEGACY MIGRATION (S2.2)  — NÃO É UMA MIGRATION
--
-- ATENÇÃO: ACIONAR SOMENTE COM APROVAÇÃO EXPLÍCITA DE @architect + @pm.
-- Este script reverte as Phases 2 e 3 da migration S2.2 (lazy recalc + lock).
-- A Phase 1 (engine_payload_v1) NUNCA é revertida — é o histórico imutável
-- que viabiliza este rollback.
--
-- Pré-requisitos:
--   1. Snapshot pg_dump das tabelas budgets, orders, sales tomado antes.
--   2. Aplicação parada (deploy revertido ou env REAPURATION_DISABLED).
--   3. Verificar que engine_payload_v1 está populado em todos os legacy.
--
-- O que este script faz:
--   1. Para cada documento com legacy_locked=true: restaura engine_version
--      do payload v1 + zera legacy_locked. Audita ROLLBACK_UNLOCK.
--   2. Para cada documento com engine_version IS NULL E engine_payload_v1
--      contendo 'engine_version_legacy': restaura engine_version do
--      snapshot. Audita ROLLBACK_RESTORE_VERSION.
--   3. DROP da coluna legacy_locked (DROP IF EXISTS).
--   4. MANTÉM engine_payload_v1 — é histórico (não destruir backup).
--
-- O que NÃO faz:
--   - NÃO altera total_value, discount_value, discount_mode (esses nunca
--     foram tocados pelas Phases 2/3 — snapshot fiscal é intocado).
--   - NÃO dropa engine_payload_v1.
--   - NÃO remove rows do mrm_legacy_audit_log (audit é append-only).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) GUARD — abortar se Phase 1 (_002) não rodou (engine_payload_v1 ausente)
--    Roda DDL antes dos DO $$ porque PL/pgSQL nao pode dropar coluna in-place
--    se o ALTER nao acontece em transacao explicita. Aqui apenas verificamos.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_has_col_b BOOL;
  v_has_col_o BOOL;
  v_has_col_s BOOL;
  v_has_lock_b BOOL;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='budgets' AND column_name='engine_payload_v1'
  ) INTO v_has_col_b;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='engine_payload_v1'
  ) INTO v_has_col_o;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales' AND column_name='engine_payload_v1'
  ) INTO v_has_col_s;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='budgets' AND column_name='legacy_locked'
  ) INTO v_has_lock_b;

  IF NOT (v_has_col_b AND v_has_col_o AND v_has_col_s) THEN
    RAISE EXCEPTION 'ABORT: coluna engine_payload_v1 ausente em uma ou mais tabelas '
      '(budgets=%, orders=%, sales=%). Rollback so pode rodar APOS aplicar '
      '20260520000002_preserve_engine_payload_v1.sql + 20260520000003_migrate_legacy_discount_modes.sql.',
      v_has_col_b, v_has_col_o, v_has_col_s;
  END IF;

  IF NOT v_has_lock_b THEN
    RAISE NOTICE 'AVISO: coluna legacy_locked ausente — nada pra reverter. Encerrando sem erro.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) BUDGETS — unlock + restore engine_version
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_unlocked INT := 0;
  v_restored INT := 0;
BEGIN
  -- 1a. Audit ROLLBACK_UNLOCK para tudo que está locked
  INSERT INTO public.mrm_legacy_audit_log
    (tenant_id, document_id, document_type, original_engine_version, action, payload)
  SELECT
    b.tenant_id, b.id, 'budgets', b.engine_version, 'ROLLBACK_UNLOCK',
    jsonb_build_object(
      'engine_payload_v1', b.engine_payload_v1,
      'status', b.status::TEXT,
      'rollback_file', 'rollback_mrm_v2_legacy.sql'
    )
  FROM public.budgets b
  WHERE b.legacy_locked = true;

  -- 1b. Audit ROLLBACK_RESTORE_VERSION para tudo com engine_version=NULL
  --      que veio do legacy (tem engine_payload_v1 com legacy version)
  INSERT INTO public.mrm_legacy_audit_log
    (tenant_id, document_id, document_type, original_engine_version, action, payload)
  SELECT
    b.tenant_id, b.id, 'budgets', NULL, 'ROLLBACK_RESTORE_VERSION',
    jsonb_build_object(
      'restored_engine_version', b.engine_payload_v1->>'engine_version_legacy',
      'rollback_file', 'rollback_mrm_v2_legacy.sql'
    )
  FROM public.budgets b
  WHERE b.engine_version IS NULL
    AND b.engine_payload_v1 IS NOT NULL
    AND b.engine_payload_v1->>'engine_version_legacy' IS NOT NULL;

  -- 1c. Reverter engine_version do snapshot V1
  WITH r AS (
    UPDATE public.budgets b
    SET engine_version = b.engine_payload_v1->>'engine_version_legacy'
    WHERE b.engine_version IS NULL
      AND b.engine_payload_v1 IS NOT NULL
      AND b.engine_payload_v1->>'engine_version_legacy' IS NOT NULL
    RETURNING b.id
  ) SELECT COUNT(*) INTO v_restored FROM r;

  -- 1d. Unlock
  WITH r AS (
    UPDATE public.budgets SET legacy_locked = false
    WHERE legacy_locked = true
    RETURNING id
  ) SELECT COUNT(*) INTO v_unlocked FROM r;

  RAISE NOTICE 'Rollback budgets: unlocked=% restored_version=%', v_unlocked, v_restored;
END $$;

-- ---------------------------------------------------------------------
-- 2) ORDERS — unlock + restore engine_version
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_unlocked INT := 0;
  v_restored INT := 0;
BEGIN
  INSERT INTO public.mrm_legacy_audit_log
    (tenant_id, document_id, document_type, original_engine_version, action, payload)
  SELECT
    o.tenant_id, o.id, 'orders', o.engine_version, 'ROLLBACK_UNLOCK',
    jsonb_build_object(
      'engine_payload_v1', o.engine_payload_v1,
      'status', o.status,
      'rollback_file', 'rollback_mrm_v2_legacy.sql'
    )
  FROM public.orders o
  WHERE o.legacy_locked = true;

  INSERT INTO public.mrm_legacy_audit_log
    (tenant_id, document_id, document_type, original_engine_version, action, payload)
  SELECT
    o.tenant_id, o.id, 'orders', NULL, 'ROLLBACK_RESTORE_VERSION',
    jsonb_build_object(
      'restored_engine_version', o.engine_payload_v1->>'engine_version_legacy',
      'rollback_file', 'rollback_mrm_v2_legacy.sql'
    )
  FROM public.orders o
  WHERE o.engine_version IS NULL
    AND o.engine_payload_v1 IS NOT NULL
    AND o.engine_payload_v1->>'engine_version_legacy' IS NOT NULL;

  WITH r AS (
    UPDATE public.orders o
    SET engine_version = o.engine_payload_v1->>'engine_version_legacy'
    WHERE o.engine_version IS NULL
      AND o.engine_payload_v1 IS NOT NULL
      AND o.engine_payload_v1->>'engine_version_legacy' IS NOT NULL
    RETURNING o.id
  ) SELECT COUNT(*) INTO v_restored FROM r;

  WITH r AS (
    UPDATE public.orders SET legacy_locked = false
    WHERE legacy_locked = true
    RETURNING id
  ) SELECT COUNT(*) INTO v_unlocked FROM r;

  RAISE NOTICE 'Rollback orders: unlocked=% restored_version=%', v_unlocked, v_restored;
END $$;

-- ---------------------------------------------------------------------
-- 3) SALES — unlock + restore engine_version
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_unlocked INT := 0;
  v_restored INT := 0;
BEGIN
  INSERT INTO public.mrm_legacy_audit_log
    (tenant_id, document_id, document_type, original_engine_version, action, payload)
  SELECT
    s.tenant_id, s.id, 'sales', s.engine_version, 'ROLLBACK_UNLOCK',
    jsonb_build_object(
      'engine_payload_v1', s.engine_payload_v1,
      'status', s.status,
      'rollback_file', 'rollback_mrm_v2_legacy.sql'
    )
  FROM public.sales s
  WHERE s.legacy_locked = true;

  INSERT INTO public.mrm_legacy_audit_log
    (tenant_id, document_id, document_type, original_engine_version, action, payload)
  SELECT
    s.tenant_id, s.id, 'sales', NULL, 'ROLLBACK_RESTORE_VERSION',
    jsonb_build_object(
      'restored_engine_version', s.engine_payload_v1->>'engine_version_legacy',
      'rollback_file', 'rollback_mrm_v2_legacy.sql'
    )
  FROM public.sales s
  WHERE s.engine_version IS NULL
    AND s.engine_payload_v1 IS NOT NULL
    AND s.engine_payload_v1->>'engine_version_legacy' IS NOT NULL;

  WITH r AS (
    UPDATE public.sales s
    SET engine_version = s.engine_payload_v1->>'engine_version_legacy'
    WHERE s.engine_version IS NULL
      AND s.engine_payload_v1 IS NOT NULL
      AND s.engine_payload_v1->>'engine_version_legacy' IS NOT NULL
    RETURNING s.id
  ) SELECT COUNT(*) INTO v_restored FROM r;

  WITH r AS (
    UPDATE public.sales SET legacy_locked = false
    WHERE legacy_locked = true
    RETURNING id
  ) SELECT COUNT(*) INTO v_unlocked FROM r;

  RAISE NOTICE 'Rollback sales: unlocked=% restored_version=%', v_unlocked, v_restored;
END $$;

-- ---------------------------------------------------------------------
-- 4) DROP da coluna legacy_locked (IF EXISTS pra idempotência)
--    engine_payload_v1 PERMANECE — é histórico imutável.
-- ---------------------------------------------------------------------
ALTER TABLE public.budgets DROP COLUMN IF EXISTS legacy_locked;
ALTER TABLE public.orders  DROP COLUMN IF EXISTS legacy_locked;
ALTER TABLE public.sales   DROP COLUMN IF EXISTS legacy_locked;

-- Indexes associados são dropados automaticamente com a coluna.

-- ---------------------------------------------------------------------
-- 5) Verificação pós-rollback
-- ---------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.budgets WHERE engine_payload_v1 IS NOT NULL) AS budgets_with_v1_snapshot,
  (SELECT COUNT(*) FROM public.orders  WHERE engine_payload_v1 IS NOT NULL) AS orders_with_v1_snapshot,
  (SELECT COUNT(*) FROM public.sales   WHERE engine_payload_v1 IS NOT NULL) AS sales_with_v1_snapshot,
  (SELECT COUNT(*) FROM public.mrm_legacy_audit_log WHERE action LIKE 'ROLLBACK_%') AS rollback_audit_rows;

COMMIT;

-- =====================================================================
-- Pós-rollback manual: revisar mrm_legacy_audit_log filtrando por
--   action IN ('ROLLBACK_UNLOCK','ROLLBACK_RESTORE_VERSION') para
--   relatório executivo. Validar com @pm antes de re-aplicar S2.2.
-- =====================================================================
