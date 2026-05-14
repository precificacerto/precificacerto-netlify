-- =====================================================================
-- Hotfix: cancel_sale_cascade — reverter sempre para DRAFT
-- Created: 2026-05-14
--
-- Decisão de produto: quando uma venda é cancelada, a entidade-pai
-- (pedido ou orçamento) deve voltar para status='DRAFT' para que todos
-- os botões de ação (editar/excluir/enviar) reapareçam na UI.
--
-- Mudanças vs. 20260514000001:
--   1) Case A (sale veio de pedido): order.status='DRAFT' (era AWAITING_PAYMENT)
--      + order.budget_id é redirecionado para original_budget_id, já que o
--      espelho APPROVED foi soft-deletado. Sem isso, o pedido ficaria
--      apontando para um budget deletado e o join na UI mostraria
--      budget_status=CANCELLED.
--   2) Case B (sale veio direto de orçamento): budget.status='DRAFT'
--      (era APPROVED). Garante que botões "Enviar p/ Pedido" e
--      "Enviar p/ vendas" reapareçam na lista de orçamentos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cancel_sale_cascade(
  p_sale_id   uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale            record;
  v_order_id        uuid;
  v_order_original  uuid;
  v_mirror_budget   uuid;
  v_cash_count      integer := 0;
  v_pr_count        integer := 0;
  v_rec_count       integer := 0;
  v_stock_count     integer := 0;
BEGIN
  SELECT id, tenant_id, budget_id, sale_type, is_active, status
  INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_sale.is_active = false THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true);
  END IF;

  IF public._sale_has_paid_receivable(p_sale_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', true,
      'blocked_reason', 'PAID_RECEIVABLE',
      'message', 'Esta venda possui parcelas já recebidas. Cancele os recebimentos manualmente em Lançamentos a Receber antes de cancelar a venda.'
    );
  END IF;

  -- 1) Reverter caixa
  UPDATE public.cash_entries
  SET is_active = false
  WHERE origin_type = 'SALE'
    AND origin_id   = p_sale_id
    AND tenant_id   = p_tenant_id
    AND is_active   = true;
  GET DIAGNOSTICS v_cash_count = ROW_COUNT;

  -- 2) Reverter recebíveis pendentes (PAID já bloqueou acima)
  UPDATE public.pending_receivables
  SET is_active = false
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
    AND is_active = true;
  GET DIAGNOSTICS v_pr_count = ROW_COUNT;

  -- 3) Recorrência: NÃO estornar (decisão P3) — apenas desvincular
  UPDATE public.recurrence_records
  SET sale_id = NULL
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_rec_count = ROW_COUNT;

  -- 4) Reverter estoque
  v_stock_count := public._reverse_stock_for_sale(p_sale_id, p_tenant_id);

  -- 5) Soft delete da venda
  UPDATE public.sales
  SET is_active = false,
      status    = 'CANCELLED',
      updated_at = NOW()
  WHERE id = p_sale_id
    AND tenant_id = p_tenant_id;

  -- 6) Reabertura do estágio anterior
  --    Caso A: venda originada de pedido (orders.sale_id = p_sale_id)
  SELECT id, budget_id, original_budget_id
  INTO v_order_id, v_mirror_budget, v_order_original
  FROM public.orders
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    -- Soft delete do orçamento espelho (status APPROVED criado por handleConfirmSendToSale)
    IF v_mirror_budget IS NOT NULL
       AND v_mirror_budget IS DISTINCT FROM v_order_original THEN
      UPDATE public.budgets
      SET is_active = false,
          status    = 'CANCELLED',
          updated_at = NOW()
      WHERE id = v_mirror_budget
        AND tenant_id = p_tenant_id;
    END IF;

    -- Reabre o pedido em DRAFT para todos os botões aparecerem.
    -- Redireciona budget_id de volta para o original (mirror foi deletado).
    UPDATE public.orders
    SET status    = 'DRAFT',
        sale_id   = NULL,
        budget_id = v_order_original,
        updated_at = NOW()
    WHERE id = v_order_id;
  ELSE
    -- Caso B: venda direta a partir de orçamento (sales.budget_id sem order)
    IF v_sale.budget_id IS NOT NULL THEN
      UPDATE public.budgets
      SET status     = 'DRAFT',
          is_active  = true,
          updated_at = NOW()
      WHERE id = v_sale.budget_id
        AND tenant_id = p_tenant_id;
    END IF;
    -- Caso C: venda de balcão / agenda — só desativa, sem reabrir nada
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'affected', jsonb_build_object(
      'cash_entries',         v_cash_count,
      'pending_receivables',  v_pr_count,
      'recurrence_unlinked',  v_rec_count,
      'stock_reversed',       v_stock_count,
      'order_reopened',       (v_order_id IS NOT NULL),
      'mirror_budget_deleted',(v_order_id IS NOT NULL AND v_mirror_budget IS NOT NULL AND v_mirror_budget IS DISTINCT FROM v_order_original),
      'budget_reopened',      (v_order_id IS NULL AND v_sale.budget_id IS NOT NULL)
    )
  );
END;
$$;

-- Permissões (idempotente)
REVOKE ALL ON FUNCTION public.cancel_sale_cascade(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_sale_cascade(uuid, uuid) TO service_role;
