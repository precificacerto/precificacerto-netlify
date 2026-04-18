-- Adiciona coluna discount_mode em public.sales para suportar três modos de aplicação de desconto:
--   PROPORTIONAL     : desconto dividido 50/50 entre lucro e comissão (comportamento antigo)
--   PROFIT_REDUCTION : desconto subtrai apenas do lucro
--   SELLER_REDUCTION : desconto subtrai apenas da comissão do vendedor
-- Vendas pré-existentes herdam PROPORTIONAL (equivalente ao comportamento histórico).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_mode TEXT NOT NULL DEFAULT 'PROPORTIONAL'
  CHECK (discount_mode IN ('PROPORTIONAL', 'PROFIT_REDUCTION', 'SELLER_REDUCTION'));

COMMENT ON COLUMN public.sales.discount_mode IS
  'Modo de aplicação do desconto: PROPORTIONAL (50/50 lucro+comissão), PROFIT_REDUCTION (só lucro), SELLER_REDUCTION (só comissão do vendedor).';
