-- Migration: Add taxes_launched and tax detail columns to products and services
-- Used for LUCRO_REAL regime to store launched tax values (ICMS, PIS/COFINS, IS, IBS, CBS, IPI)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS taxes_launched boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS icms_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pis_cofins_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ibs_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ibs_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbs_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbs_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ipi_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ipi_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price_base numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price_after_taxes numeric DEFAULT 0;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS taxes_launched boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS icms_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pis_cofins_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ibs_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ibs_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbs_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbs_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ipi_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ipi_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price_base numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price_after_taxes numeric DEFAULT 0;

COMMENT ON COLUMN public.products.taxes_launched IS 'Indica se os impostos foram lançados (Lucro Real). Produto só aparece na agenda/vendas após lançamento.';
COMMENT ON COLUMN public.products.sale_price_base IS 'Preço de venda antes do lançamento de impostos.';
COMMENT ON COLUMN public.products.sale_price_after_taxes IS 'Preço final após lançamento de impostos (priceGrossed + IS + IBS + CBS + IPI).';

COMMENT ON COLUMN public.services.taxes_launched IS 'Indica se os impostos foram lançados (Lucro Real). Serviço só aparece na agenda/vendas após lançamento.';
COMMENT ON COLUMN public.services.sale_price_base IS 'Preço de venda antes do lançamento de impostos.';
COMMENT ON COLUMN public.services.sale_price_after_taxes IS 'Preço final após lançamento de impostos (priceGrossed + IS + IBS + CBS + IPI).';
