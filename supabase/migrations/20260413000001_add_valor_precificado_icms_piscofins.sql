-- Add valor_precificado_icms_piscofins to products and services tables
-- Stores the pricing value with ICMS and PIS/COFINS embedded (por dentro),
-- calculated BEFORE Atividades Terceirizadas and impostos por fora (IBS/CBS/IS/IPI)
-- Only populated for LUCRO_REAL tenants. Visual/informational only.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS valor_precificado_icms_piscofins numeric(15,2) DEFAULT NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS valor_precificado_icms_piscofins numeric(15,2) DEFAULT NULL;
