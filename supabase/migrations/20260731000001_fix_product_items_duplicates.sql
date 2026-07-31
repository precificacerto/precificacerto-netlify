-- BUG-PRODUCT-ITEMS-DUP (31/07/2026) — itens de produto duplicados ao editar
-- ---------------------------------------------------------------------------
-- Sintoma (tenant Fernandes): ao acessar um produto em "Editar" e salvar, os
-- itens (insumos) vinculados eram DUPLICADOS. Isso dobrava o CMV (Custo da
-- Mercadoria Vendida), que é a base da margem de contribuicao, inflando o
-- custo/preco do produto — e contaminando os orcamentos que o referenciavam.
--
-- Causa raiz: o save fazia delete-then-insert dos product_items SEM verificar o
-- resultado do delete e SEM trava de unicidade. Em double-submit (ou delete
-- falho), os itens eram re-inseridos, gerando linhas duplicadas.
--
-- Esta migration:
--   1. Remove as duplicatas ja existentes (mantem a linha mais antiga por
--      product_id + item_id) — restaura o CMV correto de qualquer tenant afetada.
--   2. Adiciona UNIQUE(product_id, item_id) para IMPEDIR duplicacao futura em
--      qualquer tenant (defesa definitiva no banco).
--
-- Idempotente: pode ser reaplicada sem efeito colateral.

-- 1) Remover duplicatas — mantem a de menor created_at (a original) por par.
DELETE FROM public.product_items
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id, item_id
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.product_items
  ) t
  WHERE t.rn > 1
);

-- 2) Trava de unicidade (product_id, item_id). Guard para reaplicacao segura.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_items_product_item_unique'
  ) THEN
    ALTER TABLE public.product_items
      ADD CONSTRAINT product_items_product_item_unique UNIQUE (product_id, item_id);
  END IF;
END $$;
