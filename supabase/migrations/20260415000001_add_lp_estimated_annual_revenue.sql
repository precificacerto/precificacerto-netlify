-- Migration: Add lp_estimated_annual_revenue to tenant_settings
-- Used to compute the IRPJ adicional for Lucro Presumido based on the
-- annual estimated gross revenue (receita bruta anual estimada).
--
-- Formula: adicional_pct = max(0, (annual_rev × irpj_presumption%) - 240_000) × 10% / annual_rev
-- Where 240_000 = R$ 20.000/mês × 12 meses (limite anual de isenção do adicional de IRPJ)

ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS lp_estimated_annual_revenue numeric DEFAULT NULL;

COMMENT ON COLUMN public.tenant_settings.lp_estimated_annual_revenue IS
  'Estimativa de receita bruta anual (R$) para cálculo do adicional de IRPJ no Lucro Presumido. '
  'Fórmula: max(0, (receita × presunção_irpj%) - 240.000) × 10% / receita. '
  'Nulo = adicional não calculado (empresa abaixo do limite ou valor não informado).';
