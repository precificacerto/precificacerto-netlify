-- Migration: aumenta a precisão de budgets.global_discount_percent
-- BUG-ORCAMENTO-DESCONTO-PERSIST-001
--
-- Causa-raiz: a coluna era DECIMAL(5,2) (apenas 2 casas decimais). O desconto
-- digitado em R$ é convertido para % antes de gravar; ao reabrir o orçamento, o
-- valor em R$ é reconstruído a partir do % persistido. Com o % arredondado a 2
-- casas, o R$ reconstruído diverge do valor originalmente digitado
-- (ex.: R$ 7.121,30 -> R$ 7.119,70, diferença de R$ 1,60), contaminando toda a
-- cascata RRO (impostos, comissão, lucro) que depende desse valor-âncora.
--
-- Correção: NUMERIC(8,5) — 5 casas decimais, mesma precisão já usada em
-- commission_pct/profit_pct (NUMERIC(8,5)) e no InputNumber do front (precision=5).
-- Com 5 casas de %, o R$ reconstruído fica fiel ao centavo digitado.
--
-- Aplicar no Supabase (SQL Editor) com service_role. Idempotente: alterar a escala
-- para cima preserva todos os valores existentes.

ALTER TABLE budgets
  ALTER COLUMN global_discount_percent TYPE NUMERIC(8,5);

COMMENT ON COLUMN budgets.global_discount_percent IS
  'Percentual de desconto global do orçamento (0-100). NUMERIC(8,5): 5 casas decimais para preservar a fidelidade ao valor em R$ digitado pelo usuário (BUG-ORCAMENTO-DESCONTO-PERSIST-001).';
