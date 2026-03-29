-- Migration: Add atividades terceirizadas fields to products and services
-- Used exclusively for Lucro Real regime to store freight, insurance and accessory expenses
-- These values are added on top of the calculated selling price.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS freight_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accessory_expenses_value numeric DEFAULT 0;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS freight_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insurance_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accessory_expenses_value numeric DEFAULT 0;

COMMENT ON COLUMN public.products.freight_value IS 'Valor de frete (Atividades Terceirizadas — Lucro Real). Somado ao preço de venda.';
COMMENT ON COLUMN public.products.insurance_value IS 'Valor de seguros (Atividades Terceirizadas — Lucro Real). Somado ao preço de venda.';
COMMENT ON COLUMN public.products.accessory_expenses_value IS 'Valor de despesas acessórias (Atividades Terceirizadas — Lucro Real). Somado ao preço de venda.';

COMMENT ON COLUMN public.services.freight_value IS 'Valor de frete (Atividades Terceirizadas — Lucro Real). Somado ao preço de venda.';
COMMENT ON COLUMN public.services.insurance_value IS 'Valor de seguros (Atividades Terceirizadas — Lucro Real). Somado ao preço de venda.';
COMMENT ON COLUMN public.services.accessory_expenses_value IS 'Valor de despesas acessórias (Atividades Terceirizadas — Lucro Real). Somado ao preço de venda.';
