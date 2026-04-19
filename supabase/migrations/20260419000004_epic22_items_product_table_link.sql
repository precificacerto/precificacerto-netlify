-- Epic MELHORIAS-22-ABR2026 T5
-- Itens de revenda podem ser vinculados a uma única tabela de produto
-- (commission_tables com type='PRODUCT'). Quando o item aparece na tabela,
-- a tela de /produtos mostra o alerta "termine de precificar" já existente
-- até que o usuário finalize a precificação do item como produto.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS product_table_id UUID NULL
  REFERENCES public.commission_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_product_table_id
  ON public.items(product_table_id)
  WHERE product_table_id IS NOT NULL;

COMMENT ON COLUMN public.items.product_table_id IS
  'Tabela de produto (commission_tables type=PRODUCT) à qual este item de revenda foi vinculado. NULL para itens que não são revenda ou não foram vinculados.';
