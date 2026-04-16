-- Adiciona colunas CBS e IBS recuperáveis ao breakdown de impostos
-- Usadas quando expense_category = 'Fornecedores - Produtos para Revenda'
--                                ou 'Matéria Prima - Base dos produtos'
-- Aplicável para regimes: LUCRO_REAL e SIMPLES_HIBRIDO
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS valor_cbs  numeric,
  ADD COLUMN IF NOT EXISTS valor_ibs  numeric;

COMMENT ON COLUMN public.cash_entries.valor_cbs IS 'CBS (Contribuição sobre Bens e Serviços) recuperável — Lucro Real / Simples Híbrido: Custo dos Produtos';
COMMENT ON COLUMN public.cash_entries.valor_ibs IS 'IBS (Imposto sobre Bens e Serviços) recuperável — Lucro Real / Simples Híbrido: Custo dos Produtos';
