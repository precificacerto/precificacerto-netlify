-- Adiciona colunas de breakdown de impostos recuperáveis para Lucro Real
-- Usadas quando expense_category = 'Fornecedores - Produtos para Revenda'
--                                ou 'Matéria Prima - Base dos produtos'
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS valor_nf      numeric,
  ADD COLUMN IF NOT EXISTS valor_icms    numeric,
  ADD COLUMN IF NOT EXISTS valor_pis     numeric,
  ADD COLUMN IF NOT EXISTS valor_cofins  numeric,
  ADD COLUMN IF NOT EXISTS valor_ipi     numeric;

COMMENT ON COLUMN public.cash_entries.valor_nf     IS 'Valor da Nota Fiscal (base, sem impostos recuperáveis) — Lucro Real: Custo dos Produtos';
COMMENT ON COLUMN public.cash_entries.valor_icms   IS 'ICMS recuperável — Lucro Real: Custo dos Produtos';
COMMENT ON COLUMN public.cash_entries.valor_pis    IS 'PIS recuperável — Lucro Real: Custo dos Produtos';
COMMENT ON COLUMN public.cash_entries.valor_cofins IS 'COFINS recuperável — Lucro Real: Custo dos Produtos';
COMMENT ON COLUMN public.cash_entries.valor_ipi    IS 'IPI recuperável — Lucro Real: Custo dos Produtos';
