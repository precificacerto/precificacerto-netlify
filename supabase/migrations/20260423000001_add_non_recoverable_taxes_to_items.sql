-- Adiciona campos de impostos não recuperáveis no nível do item
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS icms_st_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ipi_nr_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_origem_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_destino_pct numeric DEFAULT 0;
