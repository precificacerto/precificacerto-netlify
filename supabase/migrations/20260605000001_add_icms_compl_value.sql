-- ============================================================================
-- Migration — ICMS Complementar (coluna dedicada)
-- ============================================================================
-- Conferência Fiscal "Bases de Cálculo dos Tributos Por Fora" (2026-06-05)
--
-- Como rodar:
--   1. Abra Supabase Dashboard → SQL Editor
--   2. Cole TODO o conteúdo deste arquivo
--   3. Clique em Run
--   4. Deve retornar "Success. No rows returned"
--
-- O que faz:
--   - Adiciona coluna `icms_compl_value` (numeric, default 0) em budgets/orders/sales
--   - Armazena o ICMS Complementar (LC 87/1996, art. 13, §1º, II) consolidado do documento,
--     devido apenas quando o destinatário for consumidor final NÃO contribuinte do ICMS
--     (customers.is_icms_contributor = false).
--   - Base de cálculo: (IPI + Despesas Acessórias) × alíquota ICMS — calculada na Etapa 17
--     do Motor V17 (src/utils/mrm-engine-v17/absorption.ts).
--   - 100% retrocompatível: coluna nova com DEFAULT 0.
-- ============================================================================

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS icms_compl_value numeric NOT NULL DEFAULT 0;
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS icms_compl_value numeric NOT NULL DEFAULT 0;
ALTER TABLE sales   ADD COLUMN IF NOT EXISTS icms_compl_value numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN budgets.icms_compl_value IS
  'ICMS Complementar (LC 87/1996, art. 13, §1º, II) = (IPI + Desp. Acessórias) × ICMS. '
  '> 0 apenas para destinatário consumidor final NÃO contribuinte do ICMS. Etapa 17 Motor V17.';
COMMENT ON COLUMN orders.icms_compl_value IS
  'ICMS Complementar consolidado — espelha o valor do orçamento de origem.';
COMMENT ON COLUMN sales.icms_compl_value IS
  'ICMS Complementar consolidado da venda (LC 87/1996, art. 13, §1º, II).';
