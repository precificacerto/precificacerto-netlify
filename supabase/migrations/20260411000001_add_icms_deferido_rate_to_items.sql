-- Adiciona campo de ICMS Deferido à tabela items (Lucro Real)
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS icms_deferido_rate numeric DEFAULT NULL;

COMMENT ON COLUMN public.items.icms_deferido_rate IS 'Percentual de diferimento do ICMS (Lucro Real). Ex: 29.411 para 29,411%. Quando preenchido, os impostos recuperáveis = ICMS% × (1 - deferido%)';
