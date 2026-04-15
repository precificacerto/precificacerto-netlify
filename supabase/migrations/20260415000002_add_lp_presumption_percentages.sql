-- Migration: Add manual IRPJ/CSLL presumption percentages for Lucro Presumido
-- These fields allow tenants to input exact presumption rates defined by their accountant,
-- overriding the default rates looked up from the lucro_presumido_rates table.
-- Stored as decimal (0-1). E.g., 8% → 0.08

ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS lp_irpj_presumption_percent numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lp_csll_presumption_percent numeric DEFAULT NULL;

COMMENT ON COLUMN public.tenant_settings.lp_irpj_presumption_percent IS
  'Percentual de presunção para IRPJ no Lucro Presumido (decimal 0-1). '
  'Quando preenchido, substitui o valor da tabela lucro_presumido_rates. '
  'Ex: 8% de presunção → 0.08';

COMMENT ON COLUMN public.tenant_settings.lp_csll_presumption_percent IS
  'Percentual de presunção para CSLL no Lucro Presumido (decimal 0-1). '
  'Quando preenchido, substitui o valor da tabela lucro_presumido_rates. '
  'Ex: 12% de presunção → 0.12';
