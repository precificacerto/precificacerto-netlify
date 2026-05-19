-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S2.2 / Phase 1: PRESERVE V1
--
-- Adiciona coluna `engine_payload_v1 JSONB` em budgets, orders e sales
-- contendo um snapshot IMUTÁVEL do estado financeiro V1 de cada documento
-- legacy. Esse snapshot serve como "red-line" de rollback caso seja
-- detectada regressão no motor V2 em produção (ADR-003).
--
-- Também adiciona `legacy_locked BOOLEAN DEFAULT false` — sinalizador que
-- a Phase 3 (migration 20260520000003) usará para travar documentos
-- approved/done/paid (ADR-002 — imutabilidade em estado final).
--
-- Schema esperado em engine_payload_v1 (JSONB) — VARIA por fonte:
-- {
--   "captured_at":             "2026-05-20T00:00:00Z",
--   "engine_version_legacy":   "legacy"   | "2.0.0" | NULL,
--   "discount_mode":           "PROPORTIONAL" | "PROFIT_REDUCTION" | "SELLER_REDUCTION" | "MRM",
--   "discount_value":          NUMERIC                  -- apenas em ORDERS
--   "discount_percent":        NUMERIC                  -- apenas em ORDERS
--   "global_discount_percent": NUMERIC                  -- apenas em BUDGETS
--   "total_value":             NUMERIC,                 -- budgets.total_value | orders.total_value | sales.final_value
--   "status_at_capture":       "DRAFT" | "APPROVED" | ...,
--   "reapuration_status":      "PENDING" | "VALID" | ... | null,
--   "reapuration_errors":      JSONB | null,
--   "source":                  "budgets" | "orders" | "sales"
-- }
--
-- Restrições:
--   - Esta migration é IDEMPOTENTE (ADD COLUMN IF NOT EXISTS + UPDATE WHERE NULL).
--   - NÃO altera valores financeiros existentes — apenas captura snapshot.
--   - NÃO toca em RLS — colunas herdam as policies existentes do tenant_id.
--   - engine_payload_v1 fica NULLABLE em produção; a story original pedia
--     NOT NULL pós-backfill, mas isso só pode ser aplicado APÓS validação
--     manual de 100% dos registros — fica como step opcional comentado no fim.
--
-- Risco: se o snapshot ficar incompleto, abortar Phase 2/3.
-- Verificação obrigatória pré-Phase 2:
--   SELECT count(*) FROM public.budgets WHERE engine_version = 'legacy' AND engine_payload_v1 IS NULL;
--   -- DEVE retornar 0.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Adicionar colunas (idempotente)
-- ---------------------------------------------------------------------
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS engine_payload_v1 JSONB NULL,
  ADD COLUMN IF NOT EXISTS legacy_locked     BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS engine_payload_v1 JSONB NULL,
  ADD COLUMN IF NOT EXISTS legacy_locked     BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS engine_payload_v1 JSONB NULL,
  ADD COLUMN IF NOT EXISTS legacy_locked     BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- 2) Backfill — BUDGETS
--    Schema real: budgets tem discount_mode + global_discount_percent + total_value
--    NÃO tem discount_value nem discount_percent (que existem só em orders/sales).
-- ---------------------------------------------------------------------
UPDATE public.budgets b
SET engine_payload_v1 = jsonb_build_object(
      'captured_at',             NOW(),
      'engine_version_legacy',   COALESCE(b.engine_version, 'legacy'),
      'discount_mode',           b.discount_mode,
      'global_discount_percent', b.global_discount_percent,
      'total_value',             b.total_value,
      'status_at_capture',       b.status::TEXT,
      'reapuration_status',      b.reapuration_status,
      'reapuration_errors',      b.reapuration_errors,
      'source',                  'budgets'
    )
WHERE b.engine_payload_v1 IS NULL
  AND (b.engine_version = 'legacy' OR b.engine_version IS NULL);

-- ---------------------------------------------------------------------
-- 3) Backfill — ORDERS
--    Note: orders.total_value já existe no schema base (initial_schema).
-- ---------------------------------------------------------------------
UPDATE public.orders o
SET engine_payload_v1 = jsonb_build_object(
      'captured_at',           NOW(),
      'engine_version_legacy', COALESCE(o.engine_version, 'legacy'),
      'discount_mode',         o.discount_mode,
      'discount_value',        o.discount_value,
      'discount_percent',      o.discount_percent,
      'total_value',           o.total_value,
      'status_at_capture',     o.status,
      'reapuration_status',    o.reapuration_status,
      'reapuration_errors',    o.reapuration_errors,
      'source',                'orders'
    )
WHERE o.engine_payload_v1 IS NULL
  AND (o.engine_version = 'legacy' OR o.engine_version IS NULL);

-- ---------------------------------------------------------------------
-- 4) Backfill — SALES
--    Sales é o documento financeiro mais sensível (ADR-003: snapshot
--    fiscal é law-of-the-land). Captura final_value como total_value.
--    Schema real: sales tem discount_mode + final_value, NÃO tem discount_value
--    nem discount_percent (esses existem apenas em orders).
-- ---------------------------------------------------------------------
UPDATE public.sales s
SET engine_payload_v1 = jsonb_build_object(
      'captured_at',           NOW(),
      'engine_version_legacy', COALESCE(s.engine_version, 'legacy'),
      'discount_mode',         s.discount_mode,
      'total_value',           s.final_value,
      'status_at_capture',     s.status,
      'reapuration_status',    s.reapuration_status,
      'reapuration_errors',    s.reapuration_errors,
      'source',                'sales'
    )
WHERE s.engine_payload_v1 IS NULL
  AND (s.engine_version = 'legacy' OR s.engine_version IS NULL);

-- ---------------------------------------------------------------------
-- 5) Indexes para queries de auditoria/rollback
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_budgets_engine_payload_v1
  ON public.budgets((engine_payload_v1->>'engine_version_legacy'))
  WHERE engine_payload_v1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_engine_payload_v1
  ON public.orders((engine_payload_v1->>'engine_version_legacy'))
  WHERE engine_payload_v1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_engine_payload_v1
  ON public.sales((engine_payload_v1->>'engine_version_legacy'))
  WHERE engine_payload_v1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_legacy_locked
  ON public.budgets(tenant_id, legacy_locked)
  WHERE legacy_locked = true;

CREATE INDEX IF NOT EXISTS idx_orders_legacy_locked
  ON public.orders(tenant_id, legacy_locked)
  WHERE legacy_locked = true;

CREATE INDEX IF NOT EXISTS idx_sales_legacy_locked
  ON public.sales(tenant_id, legacy_locked)
  WHERE legacy_locked = true;

-- ---------------------------------------------------------------------
-- 6) Comentários
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.budgets.engine_payload_v1 IS
  'MRM S2.2 Phase 1: snapshot IMUTÁVEL do estado V1 (red-line de rollback). '
  'Campos: captured_at, engine_version_legacy, discount_mode, discount_value, '
  'discount_percent, total_value, status_at_capture, reapuration_status, '
  'reapuration_errors, source. Read-only após backfill — NUNCA atualizar.';

COMMENT ON COLUMN public.orders.engine_payload_v1 IS
  'Idem budgets.engine_payload_v1 (source="orders", total_value=orders.total_value).';

COMMENT ON COLUMN public.sales.engine_payload_v1 IS
  'Idem budgets.engine_payload_v1 (source="sales", total_value=sales.final_value). '
  'ADR-003: snapshot fiscal é law-of-the-land; rollback Phase 3 só por aprovação @architect.';

COMMENT ON COLUMN public.budgets.legacy_locked IS
  'MRM S2.2 Phase 3: TRUE para documentos legacy em estado terminal (approved/paid/etc) '
  'que NÃO devem ser recalculados pelo motor V2. Aplicado por '
  '20260520000003_migrate_legacy_discount_modes.sql. ADR-002 (imutabilidade em Done).';

COMMENT ON COLUMN public.orders.legacy_locked IS 'Idem budgets.legacy_locked.';
COMMENT ON COLUMN public.sales.legacy_locked IS 'Idem budgets.legacy_locked.';

-- ---------------------------------------------------------------------
-- 7) Verificação pós-backfill (informativa — não aborta migration)
--    Log no console do supabase para o operador conferir.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_budgets_missing INT;
  v_orders_missing  INT;
  v_sales_missing   INT;
BEGIN
  SELECT COUNT(*) INTO v_budgets_missing FROM public.budgets
    WHERE engine_payload_v1 IS NULL
      AND (engine_version = 'legacy' OR engine_version IS NULL);
  SELECT COUNT(*) INTO v_orders_missing FROM public.orders
    WHERE engine_payload_v1 IS NULL
      AND (engine_version = 'legacy' OR engine_version IS NULL);
  SELECT COUNT(*) INTO v_sales_missing FROM public.sales
    WHERE engine_payload_v1 IS NULL
      AND (engine_version = 'legacy' OR engine_version IS NULL);

  RAISE NOTICE 'MRM S2.2 Phase 1 — Backfill report:';
  RAISE NOTICE '  budgets sem snapshot: %', v_budgets_missing;
  RAISE NOTICE '  orders  sem snapshot: %', v_orders_missing;
  RAISE NOTICE '  sales   sem snapshot: %', v_sales_missing;
  RAISE NOTICE 'Se algum > 0, INVESTIGAR antes de aplicar 20260520000003.';
END $$;

COMMIT;

-- =====================================================================
-- OPCIONAL pós-validação (rodar manualmente APÓS verificar 100% backfill):
--   ALTER TABLE public.budgets ALTER COLUMN engine_payload_v1 SET NOT NULL;
--   ALTER TABLE public.orders  ALTER COLUMN engine_payload_v1 SET NOT NULL;
--   ALTER TABLE public.sales   ALTER COLUMN engine_payload_v1 SET NOT NULL;
-- NÃO incluído no script auto-aplicado porque pode quebrar inserts em
-- código legado que ainda não popule a coluna (S2.3 fará isso).
-- =====================================================================
