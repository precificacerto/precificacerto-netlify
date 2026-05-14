-- =====================================================================
-- Migration: Cascade Delete Pipeline (Budget ↔ Order ↔ Sale)
-- Created: 2026-05-14
--
-- Objetivo: permitir exclusão de orçamentos, pedidos e vendas em
-- qualquer estágio, com cascata descendente (apaga filhos) e
-- reabertura ascendente (volta status do pai para editável).
--
-- Decisões aprovadas (project_cascade_delete_decisions_2026_05.md):
--   P1 — Venda com parcela `pending_receivables.status='PAID'` BLOQUEIA cancelamento.
--   P2 — Reversão de estoque via stock_movements positivos (não UPDATE direto).
--        Trigger não existe — RPC faz UPDATE em public.stock E INSERT em stock_movements.
--   P3 — Recorrência permanece ativa, apenas desvincula (sale_id=NULL).
--   P4 — Orçamento volta para status='DRAFT' quando pedido vinculado é excluído.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Colunas novas em ORDERS
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_active           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS original_budget_id  uuid REFERENCES public.budgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_active
  ON public.orders(tenant_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_orders_original_budget
  ON public.orders(original_budget_id) WHERE original_budget_id IS NOT NULL;

-- Backfill: pedidos legados onde budget_id ainda aponta pro orçamento original
-- (ou seja, ainda não foram enviados para venda — espelho não foi criado)
UPDATE public.orders
SET original_budget_id = budget_id
WHERE original_budget_id IS NULL
  AND budget_id IS NOT NULL
  AND status NOT IN ('SENT_TO_SALE', 'PAID');

COMMENT ON COLUMN public.orders.original_budget_id IS
  'ID permanente do orçamento que originou o pedido. Diferente de budget_id que reaponta para o budget espelho APPROVED após envio para venda. Usado para cascata reversa.';

COMMENT ON COLUMN public.orders.is_active IS
  'Soft delete: false oculta o pedido na UI sem apagar histórico.';

-- ---------------------------------------------------------------------
-- 2) Função utilitária: bloqueio de venda paga
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sale_has_paid_receivable(p_sale_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pending_receivables
    WHERE sale_id = p_sale_id
      AND is_active = true
      AND status = 'PAID'
  );
$$;

-- ---------------------------------------------------------------------
-- 3) Função utilitária: reversão de estoque para uma venda
-- ---------------------------------------------------------------------
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
      SET quantity = COALESCE(quantity, 0) + rec.quantity
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

-- ---------------------------------------------------------------------
-- 4) RPC: cancel_sale_cascade
-- ---------------------------------------------------------------------
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
  SELECT id, budget_id INTO v_order_id, v_mirror_budget
  FROM public.orders
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    -- Soft delete do orçamento espelho (status APPROVED criado por handleConfirmSendToSale)
    IF v_mirror_budget IS NOT NULL THEN
      UPDATE public.budgets
      SET is_active = false,
          status    = 'CANCELLED',
          updated_at = NOW()
      WHERE id = v_mirror_budget
        AND tenant_id = p_tenant_id
        AND id NOT IN (
          SELECT original_budget_id FROM public.orders
          WHERE id = v_order_id AND original_budget_id IS NOT NULL
        );
    END IF;

    -- Reabre o pedido para edição/reenvio
    UPDATE public.orders
    SET status   = 'AWAITING_PAYMENT',
        sale_id  = NULL,
        updated_at = NOW()
    WHERE id = v_order_id;
  ELSE
    -- Caso B: venda direta a partir de orçamento (sales.budget_id sem order)
    IF v_sale.budget_id IS NOT NULL THEN
      UPDATE public.budgets
      SET status     = 'APPROVED',
          updated_at = NOW()
      WHERE id = v_sale.budget_id
        AND tenant_id = p_tenant_id
        AND is_active = true;
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
      'mirror_budget_deleted',(v_order_id IS NOT NULL AND v_mirror_budget IS NOT NULL)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 5) RPC: delete_order_cascade
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_order_cascade(
  p_order_id  uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order              record;
  v_sale_result        jsonb;
  v_sale_blocked       boolean := false;
BEGIN
  SELECT id, tenant_id, budget_id, original_budget_id, sale_id, is_active, status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.is_active = false THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true);
  END IF;

  -- 1) Se tem venda vinculada, cancela ela primeiro
  IF v_order.sale_id IS NOT NULL THEN
    v_sale_result := public.cancel_sale_cascade(v_order.sale_id, p_tenant_id);
    IF (v_sale_result->>'blocked')::boolean THEN
      RETURN v_sale_result;
    END IF;
  END IF;

  -- 2) Soft delete do espelho APPROVED (se diferente do original)
  IF v_order.budget_id IS NOT NULL
     AND v_order.budget_id IS DISTINCT FROM v_order.original_budget_id THEN
    UPDATE public.budgets
    SET is_active = false,
        status    = 'CANCELLED',
        updated_at = NOW()
    WHERE id = v_order.budget_id
      AND tenant_id = p_tenant_id;
  END IF;

  -- 3) Soft delete do pedido
  UPDATE public.orders
  SET is_active = false,
      status    = 'CANCELLED',
      updated_at = NOW()
  WHERE id = p_order_id;

  -- 4) Reabre o orçamento original (decisão P4 — DRAFT)
  IF v_order.original_budget_id IS NOT NULL THEN
    UPDATE public.budgets
    SET is_active  = true,
        status     = 'DRAFT',
        updated_at = NOW()
    WHERE id = v_order.original_budget_id
      AND tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'affected', jsonb_build_object(
      'sale_cancelled',           (v_order.sale_id IS NOT NULL),
      'mirror_budget_deleted',    (v_order.budget_id IS DISTINCT FROM v_order.original_budget_id AND v_order.budget_id IS NOT NULL),
      'original_budget_reopened', (v_order.original_budget_id IS NOT NULL),
      'sale_detail',              v_sale_result
    )
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6) RPC: delete_budget_cascade
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_budget_cascade(
  p_budget_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_budget          record;
  v_order_id        uuid;
  v_order_result    jsonb;
  v_orders_count    integer := 0;
  v_direct_sale_id  uuid;
  v_sale_result     jsonb;
  v_blocked         boolean := false;
  v_blocked_payload jsonb;
BEGIN
  SELECT id, tenant_id, status, is_active
  INTO v_budget
  FROM public.budgets
  WHERE id = p_budget_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_budget.id IS NULL THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_budget.is_active = false THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true);
  END IF;

  -- 1) Cancelar pedidos vinculados (que cascateiam pra venda se houver)
  FOR v_order_id IN
    SELECT id FROM public.orders
    WHERE original_budget_id = p_budget_id
      AND tenant_id = p_tenant_id
      AND is_active = true
  LOOP
    v_order_result := public.delete_order_cascade(v_order_id, p_tenant_id);
    IF (v_order_result->>'blocked')::boolean THEN
      v_blocked := true;
      v_blocked_payload := v_order_result;
      EXIT;
    END IF;
    v_orders_count := v_orders_count + 1;
  END LOOP;

  IF v_blocked THEN
    RETURN v_blocked_payload;
  END IF;

  -- 2) Cancelar venda DIRETA criada a partir deste budget (sem passar por order)
  FOR v_direct_sale_id IN
    SELECT s.id
    FROM public.sales s
    WHERE s.budget_id = p_budget_id
      AND s.tenant_id = p_tenant_id
      AND s.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.sale_id = s.id AND o.tenant_id = p_tenant_id
      )
  LOOP
    v_sale_result := public.cancel_sale_cascade(v_direct_sale_id, p_tenant_id);
    IF (v_sale_result->>'blocked')::boolean THEN
      RETURN v_sale_result;
    END IF;
  END LOOP;

  -- 3) Desativar pending_receivables vinculados diretamente ao budget (sem sale)
  UPDATE public.pending_receivables
  SET is_active = false
  WHERE budget_id = p_budget_id
    AND tenant_id = p_tenant_id
    AND is_active = true
    AND sale_id IS NULL;

  -- 4) Soft delete do budget
  UPDATE public.budgets
  SET is_active  = false,
      status     = 'CANCELLED',
      updated_at = NOW()
  WHERE id = p_budget_id;

  RETURN jsonb_build_object(
    'success', true,
    'affected', jsonb_build_object(
      'orders_cascaded',  v_orders_count,
      'direct_sale_cancelled', (v_direct_sale_id IS NOT NULL)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 7) Permissões — chamadas via supabaseAdmin (service_role).
--    SECURITY DEFINER acima garante execução com privilégios elevados;
--    o tenant_id é validado em todas as queries internas.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.delete_budget_cascade(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_order_cascade(uuid, uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_sale_cascade(uuid, uuid)   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_budget_cascade(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_order_cascade(uuid, uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_sale_cascade(uuid, uuid)   TO service_role;
