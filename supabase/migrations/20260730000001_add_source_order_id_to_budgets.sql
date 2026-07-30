-- =====================================================================
-- Doc 29/07 (itens 1.2.8 / 2.1.3): orçamento-espelho não pode aparecer
-- em /Orçamentos.
--
-- Quando um Pedido é enviado para aprovação (handleConfirmSendToSale),
-- o sistema cria internamente um "orçamento-espelho" (status APPROVED)
-- que alimenta a fila de lançamento em Vendas. Esse espelho NÃO deve
-- ser exibido na tela Orçamentos (é um registro-ponte, não um orçamento
-- criado manualmente).
--
-- Esta coluna marca o espelho com o pedido de origem, permitindo:
--   1) filtrá-lo da listagem de Orçamentos (source_order_id IS NOT NULL);
--   2) rotulá-lo como "Pedido PED-xxxx" na fila de Vendas.
--
-- Registros antigos ficam com source_order_id = NULL. Backfill opcional
-- abaixo marca espelhos legados pela convição orders.budget_id → budget
-- cujo notes começa com "Originado do pedido".
-- =====================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_source_order_id
  ON public.budgets (source_order_id)
  WHERE source_order_id IS NOT NULL;

COMMENT ON COLUMN public.budgets.source_order_id IS
  'Doc 29/07: quando preenchido, este budget é um orçamento-espelho gerado a partir do pedido indicado (não exibir em /Orçamentos).';

-- Backfill de espelhos legados: vincula o espelho ao pedido que aponta para ele.
UPDATE public.budgets b
SET source_order_id = o.id
FROM public.orders o
WHERE o.budget_id = b.id
  AND o.budget_id IS DISTINCT FROM o.original_budget_id
  AND b.source_order_id IS NULL
  AND b.notes ILIKE 'Originado do pedido%';
