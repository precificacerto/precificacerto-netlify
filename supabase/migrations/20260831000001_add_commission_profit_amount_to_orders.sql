-- Migration: commission_amount / profit_amount consolidados em orders
-- D5 (2026-08-31) — elo do meio da cadeia orçamento → pedido → venda
--
-- O pedido é espelho do orçamento e carrega comissão, RT e lucro dos seus itens,
-- afetados por desconto quando houver. Hoje `orders` não tem onde guardar os dois
-- primeiros consolidados: `budgets` e `sales` têm commission_amount/profit_amount,
-- `orders` não. `rt_amount` já existe em orders (EPIC-RT v8) e NÃO é recriada aqui.
--
-- Consequência do buraco: o orçamento-espelho criado a partir do pedido
-- (budgets.source_order_id) nascia com os três zerados, e `sales.commission_amount`
-- — que é lido do orçamento — herdava zero. Em produção: 63 de 92 orçamentos diretos
-- têm commission_amount > 0, contra 0 de 2 orçamentos-espelho.
--
-- Tipo espelha EXATAMENTE budgets/sales: NUMERIC(12,2) NOT NULL DEFAULT 0.
-- Aditiva e idempotente (IF NOT EXISTS). Sem backfill: os pedidos existentes ficam
-- em 0 pelo default e passam a ser preenchidos na próxima gravação legítima.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_amount     NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.commission_amount IS
  'Comissão consolidada do pedido em R$, pós-desconto. Espelha budgets.commission_amount; copiada do orçamento na conversão, recalculada na edição do pedido e repassada ao orçamento-espelho no envio para Vendas (D5).';
COMMENT ON COLUMN public.orders.profit_amount IS
  'Lucro consolidado do pedido em R$, pós-desconto. Espelha budgets.profit_amount; copiado do orçamento na conversão, recalculado na edição do pedido e repassado ao orçamento-espelho no envio para Vendas (D5).';
