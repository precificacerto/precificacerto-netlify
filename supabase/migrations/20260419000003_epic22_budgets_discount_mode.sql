-- Epic MELHORIAS-22-ABR2026 T18
-- Adiciona discount_mode em public.budgets (mesma semântica usada em public.sales
-- via 20260418000001). Vendas, orçamentos e pedidos passam a compartilhar o mesmo
-- conjunto de modos de desconto.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS discount_mode TEXT NOT NULL DEFAULT 'PROPORTIONAL'
  CHECK (discount_mode IN ('PROPORTIONAL', 'PROFIT_REDUCTION', 'SELLER_REDUCTION'));

COMMENT ON COLUMN public.budgets.discount_mode IS
  'Modo de aplicação do desconto: PROPORTIONAL (50/50 lucro+comissão), PROFIT_REDUCTION (só lucro), SELLER_REDUCTION (só comissão do vendedor).';
