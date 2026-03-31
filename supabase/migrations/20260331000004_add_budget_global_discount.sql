-- Migration: budgets.global_discount_percent
-- Campo para desconto global do orçamento (abatido proporcionalmente em comissão e lucro).
-- O desconto máximo é limitado a (comissão_pct + lucro_pct) dos itens do orçamento.

ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS global_discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0
    CHECK (global_discount_percent >= 0 AND global_discount_percent <= 100);

COMMENT ON COLUMN budgets.global_discount_percent IS
  'Percentual de desconto global aplicado ao orçamento. Abatido proporcionalmente em comissão e lucro dos itens. Máximo = soma(comissão + lucro) dos itens.';
