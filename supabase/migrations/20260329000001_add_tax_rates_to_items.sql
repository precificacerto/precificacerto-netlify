-- Migration: Add tax rate columns to items table for Lucro Real regime
-- These columns store the rates used when calculating cost_net,
-- so the values are preserved when the item is edited later.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS icms_rate  numeric DEFAULT 0,  -- ICMS de entrada (user-entered, %)
  ADD COLUMN IF NOT EXISTS ipi_rate   numeric DEFAULT 0,  -- IPI da NF (from ncm_codes.ipi_rate, %)
  ADD COLUMN IF NOT EXISTS pis_rate   numeric DEFAULT 0,  -- PIS de entrada (from ncm_codes.pis_rate_cumulativo, %)
  ADD COLUMN IF NOT EXISTS cofins_rate numeric DEFAULT 0; -- COFINS de entrada (from ncm_codes.cofins_rate_cumulativo, %)

COMMENT ON COLUMN public.items.icms_rate   IS 'Alíquota ICMS de entrada informada pelo usuário (%). Usado para calcular cost_net no regime Lucro Real.';
COMMENT ON COLUMN public.items.ipi_rate    IS 'Alíquota IPI da nota fiscal (%). Puxada de ncm_codes.ipi_rate.';
COMMENT ON COLUMN public.items.pis_rate    IS 'Alíquota PIS de entrada (%). Puxada de ncm_codes.pis_rate_cumulativo.';
COMMENT ON COLUMN public.items.cofins_rate IS 'Alíquota COFINS de entrada (%). Puxada de ncm_codes.cofins_rate_cumulativo.';
