-- Migration: Add additional_irpj_percent to products and services for Lucro Real regime
-- This column stores the manually entered "Alíquota da parcela adicional IRPJ" (%)
-- used exclusively when taxable_regime = 'LUCRO_REAL'.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS additional_irpj_percent numeric DEFAULT 0;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS additional_irpj_percent numeric DEFAULT 0;

COMMENT ON COLUMN public.products.additional_irpj_percent IS 'Alíquota da parcela adicional de IRPJ (%). Usado exclusivamente no regime Lucro Real para compor o preço de venda.';
COMMENT ON COLUMN public.services.additional_irpj_percent IS 'Alíquota da parcela adicional de IRPJ (%). Usado exclusivamente no regime Lucro Real para compor o preço de venda.';
