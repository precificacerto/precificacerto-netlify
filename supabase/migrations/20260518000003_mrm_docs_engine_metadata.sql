-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S1.3
-- Metadata do motor em budgets, sales e orders:
--   - engine_version       : semver do motor usado ('legacy' | '2.0.0' | ...)
--   - reapuration_status   : PENDING | VALID | RRO_ZERO | RRO_NEGATIVE | ERROR
--   - reapuration_errors   : jsonb com lista de validações falhas (V1-V6)
--
-- Default 'legacy' aplicado nesta migration para registros pré-existentes
-- (cutover D1: auto-recálculo na próxima edição).
-- =====================================================================

-- budgets
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS engine_version     TEXT NULL,
  ADD COLUMN IF NOT EXISTS reapuration_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS reapuration_errors JSONB NULL;

UPDATE public.budgets
SET engine_version = 'legacy'
WHERE engine_version IS NULL;

-- sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS engine_version     TEXT NULL,
  ADD COLUMN IF NOT EXISTS reapuration_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS reapuration_errors JSONB NULL;

UPDATE public.sales
SET engine_version = 'legacy'
WHERE engine_version IS NULL;

-- orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS engine_version     TEXT NULL,
  ADD COLUMN IF NOT EXISTS reapuration_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS reapuration_errors JSONB NULL;

UPDATE public.orders
SET engine_version = 'legacy'
WHERE engine_version IS NULL;

-- Constraints de domínio (CHECK em reapuration_status quando preenchido)
DO $$ BEGIN
  ALTER TABLE public.budgets ADD CONSTRAINT budgets_reapuration_status_chk
    CHECK (reapuration_status IS NULL OR reapuration_status IN ('PENDING','VALID','RRO_ZERO','RRO_NEGATIVE','ERROR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_reapuration_status_chk
    CHECK (reapuration_status IS NULL OR reapuration_status IN ('PENDING','VALID','RRO_ZERO','RRO_NEGATIVE','ERROR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_reapuration_status_chk
    CHECK (reapuration_status IS NULL OR reapuration_status IN ('PENDING','VALID','RRO_ZERO','RRO_NEGATIVE','ERROR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes para queries de auditoria
CREATE INDEX IF NOT EXISTS idx_budgets_engine_version
  ON public.budgets(engine_version)
  WHERE engine_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_engine_version
  ON public.sales(engine_version)
  WHERE engine_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_engine_version
  ON public.orders(engine_version)
  WHERE engine_version IS NOT NULL;

COMMENT ON COLUMN public.budgets.engine_version IS
  'MRM: versão semver do motor usado ("legacy" para registros pré-MRM, "2.0.0" para registros com motor de reapuração).';

COMMENT ON COLUMN public.budgets.reapuration_status IS
  'MRM: PENDING (não calculado) | VALID (V1-V6 OK) | RRO_ZERO (RRO=0, exige ajuste R5) | RRO_NEGATIVE (RRO<0, exige ajuste R5) | ERROR (validação V2-V6 falhou)';

COMMENT ON COLUMN public.budgets.reapuration_errors IS
  'MRM: jsonb {"failed_validations": ["V1","V4"], "messages": [...]} quando reapuration_status = RRO_ZERO/RRO_NEGATIVE/ERROR.';

COMMENT ON COLUMN public.sales.engine_version IS 'Idem budgets.engine_version';
COMMENT ON COLUMN public.sales.reapuration_status IS 'Idem budgets.reapuration_status';
COMMENT ON COLUMN public.sales.reapuration_errors IS 'Idem budgets.reapuration_errors';

COMMENT ON COLUMN public.orders.engine_version IS 'Idem budgets.engine_version';
COMMENT ON COLUMN public.orders.reapuration_status IS 'Idem budgets.reapuration_status';
COMMENT ON COLUMN public.orders.reapuration_errors IS 'Idem budgets.reapuration_errors';
