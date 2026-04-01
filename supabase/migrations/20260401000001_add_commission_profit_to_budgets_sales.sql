-- Migration: commission_amount and profit_amount on budgets and sales
-- Stores pre-calculated commission (seller) and profit (company) values
-- based on commission_tables logic, considering global discount applied.

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_amount     DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_amount     DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN budgets.commission_amount IS
  'Valor calculado de comissão do vendedor após desconto global. Base = commission_tables dos itens.';
COMMENT ON COLUMN budgets.profit_amount IS
  'Valor calculado de lucro da empresa após desconto global.';
COMMENT ON COLUMN sales.commission_amount IS
  'Comissão do vendedor copiada do orçamento na finalização (FROM_BUDGET). Para demais tipos usa employee.commission_percent.';
COMMENT ON COLUMN sales.profit_amount IS
  'Lucro da empresa copiado do orçamento na finalização (FROM_BUDGET).';
