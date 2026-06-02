-- =====================================================================
-- Migration: Fix _reverse_stock_for_sale — coluna correta é quantity_current
-- Created: 2026-06-02
--
-- BUG: a função _reverse_stock_for_sale (usada por cancel_sale_cascade,
-- e indiretamente por delete_order_cascade / delete_budget_cascade) fazia
-- UPDATE public.stock SET quantity = ... — mas a tabela public.stock NÃO
-- possui a coluna `quantity`; o nome real é `quantity_current`.
--
-- Efeito do bug: ao excluir/cancelar QUALQUER venda (ou pedido/orçamento
-- com venda vinculada) que tivesse item de produto com estoque, a RPC
-- abortava com erro 42703 (column "quantity" does not exist) → a API
-- /api/delete/sales|orders|budgets retornava HTTP 500 → "Erro ao excluir".
--
-- Correção: usar quantity_current. Não há trigger recalculando o saldo a
-- partir de stock_movements, portanto o UPDATE manual continua necessário
-- e não há risco de dupla contagem.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._reverse_stock_for_sale(
  p_sale_id   uuid,
  p_tenant_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
  rec record;
  v_stock_id uuid;
BEGIN
  FOR rec IN
    SELECT si.product_id, si.quantity
    FROM public.sale_items si
    WHERE si.sale_id = p_sale_id
      AND si.product_id IS NOT NULL
      AND COALESCE(si.quantity, 0) > 0
  LOOP
    SELECT s.id INTO v_stock_id
    FROM public.stock s
    WHERE s.product_id = rec.product_id
      AND s.tenant_id  = p_tenant_id
    LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stock
      SET quantity_current = COALESCE(quantity_current, 0) + rec.quantity
      WHERE id = v_stock_id;

      INSERT INTO public.stock_movements (stock_id, delta_quantity, reason)
      VALUES (
        v_stock_id,
        rec.quantity,
        'SALE_CANCELLED:' || p_sale_id::text
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
