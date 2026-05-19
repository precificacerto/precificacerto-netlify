-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — Story MRM-V3-S5
-- Adiciona coluna rro_policy em tenant_expense_config:
--
--   - rro_policy (text, NULL = default ADR-004)
--       Override por tenant da política de RRO ≤ 0:
--       NULL         = usa defaults ADR-004 (sale=block, budget/order=warn)
--       'strict'     = bloqueia em TODOS os documentos quando RRO ≤ 0
--       'permissive' = apenas avisa em todos (não bloqueia nem em vendas)
--
-- Referência: src/utils/mrm-policies.ts (RroPolicy type já existe no client;
-- esta migration apenas alinha o schema do banco).
--
-- Spec: Documento Oficial RR (G5 do EPIC-MRM-V3, 19/05/2026)
-- =====================================================================

ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS rro_policy TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_expense_config_rro_policy_chk'
      AND table_name = 'tenant_expense_config'
  ) THEN
    ALTER TABLE public.tenant_expense_config
      ADD CONSTRAINT tenant_expense_config_rro_policy_chk
      CHECK (rro_policy IS NULL OR rro_policy IN ('strict', 'permissive'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenant_expense_config.rro_policy IS
  'MRM-V3 (G5): override da política RRO ≤ 0. NULL=defaults ADR-004; strict=bloqueia sempre; permissive=apenas avisa. Lido por decideMrmAction em src/utils/mrm-policies.ts.';
