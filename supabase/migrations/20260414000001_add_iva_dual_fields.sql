-- Migration: Add IVA DUAL fields for Lucro Real
-- ibs_reference_pct and cbs_reference_pct: reference rates configured in onboarding/settings
-- iva_dual_reduction_factor: per-product/service reduction factor (30|40|50|60|70|80|100)
--   (LC 214/2025 — 7 faixas de regimes diferenciados IBS/CBS; 80% e 100% adicionados v2.0 28/06/2026)

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS ibs_reference_pct NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS cbs_reference_pct NUMERIC(6,4);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS iva_dual_reduction_factor INTEGER;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS iva_dual_reduction_factor INTEGER;
