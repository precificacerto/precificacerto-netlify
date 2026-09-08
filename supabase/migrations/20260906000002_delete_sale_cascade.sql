-- `delete_sale_cascade` — Excluir venda, a última instância.
--
-- O CONCEITO QUE SEPARA ESTA FUNÇÃO DE `cancel_sale_cascade`
-- ----------------------------------------------------------
--   CANCELAR volta à etapa anterior e PERMITE RETOMAR: o pedido reabre em DRAFT, o orçamento
--            volta a DRAFT, e o documento pode seguir de novo.
--   EXCLUIR   é a última instância — como se a evolução NUNCA TIVESSE CHEGADO àquele ponto.
--            Venda, pedido e orçamento, os TRÊS, recebem `status = 'EXCLUIDO'`. Nenhuma
--            edição em nenhuma tela. Irreversível: não há desfazer.
--
-- SOFT DELETE FORTE, NÃO DELETE FÍSICO. A linha permanece: preserva auditoria e evita o
-- CASCADE de `sale_items.sale_id`, que destruiria os itens e com eles o `tax_breakdown`
-- congelado. "O documento morre ali" não é "a linha some do banco".
--
-- PRÉ-CONDIÇÃO: SÓ EXCLUI VENDA SEM NENHUM PAGAMENTO REGISTRADO
-- -------------------------------------------------------------
-- Diferente do que se cogitou no levantamento, o Excluir NÃO passa por cima do bloqueio de
-- parcela paga — ele o mantém, e a tela DESABILITA o botão com o motivo visível. Botão ativo
-- que falha depois é pior que botão desabilitado que explica.
-- A checagem aqui é a segunda barreira: a UI é a primeira, e uma UI não é uma garantia.
--
-- A FK `orders.sale_id` É NO ACTION — E O TRATAMENTO EXPLÍCITO É ESTE
-- -------------------------------------------------------------------
-- Ela BLOQUEARIA um `DELETE FROM sales` com violação de FK. Como esta função faz UPDATE e
-- nunca DELETE, a FK não é acionada — e é por isso que o soft delete é também a resposta ao
-- risco. Medido em 06/09/2026: zero pedidos apontando, ou seja ARMADO e não materializado.
-- O tratamento não é confiar nesse zero: é (a) nunca emitir DELETE, e (b) marcar o pedido que
-- aponta, junto com a venda, na mesma transação. O vínculo `orders.sale_id` é PRESERVADO de
-- propósito — a cadeia inteira morre junta, e o vínculo é o que permite auditá-la depois.
--
-- `cash_entries` — A LEITURA QUE FIZ, E ELA É INTERPRETAÇÃO
-- ---------------------------------------------------------
-- A instrução foi "cash_entries da venda são REMOVIDOS". Removo com `is_active = false`, não
-- com DELETE, por três razões: é o que `cancel_sale_cascade` já faz; DELETE físico destruiria
-- o rastro financeiro, contrariando a razão declarada da decisão 4 (preservar auditoria); e a
-- orfandade que o levantamento apontou vinha do DELETE FÍSICO da venda, que aqui não acontece
-- — a linha de `sales` continua existindo, então nada fica apontando para o vazio.
-- SE A INTENÇÃO ERA APAGAR A LINHA, esta é a parte a mudar, e é uma linha só.
--
-- `cash_entries` NÃO TEM FK para `sales`: liga por `origin_type`/`origin_id`. Não cascateia e
-- não bloqueia — some em silêncio se ninguém a tratar. Por isso ela é tratada AQUI,
-- explicitamente. Medido: 169 linhas com `origin_type='SALE'`, 120 com venda existente,
-- 48 já órfãs mais 1 desvinculada (`origin_id` NULL). Esta função não aumenta esse número.
--
-- ESTOQUE: reusa `_reverse_stock_for_sale`, que deriva de `sale_items` porque
-- `stock_movements` NÃO TEM `sale_id` — não há como achar o movimento pela venda. Os três
-- defeitos conhecidos dessa função (devolve `+qty` integral sem compensar o clamp
-- `max(0,…)` da baixa; não espelha em `products.quantity`; não filtra `stock_type`) estão
-- REGISTRADOS e NÃO são corrigidos aqui — corrigi-los é rodada própria.

CREATE OR REPLACE FUNCTION public.delete_sale_cascade(p_sale_id uuid, p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale            record;
  v_order_id        uuid;
  v_order_original  uuid;
  v_order_budget    uuid;
  v_cash_count      integer := 0;
  v_pr_count        integer := 0;
  v_rec_count       integer := 0;
  v_stock_count     integer := 0;
  v_budgets_count   integer := 0;
  v_orders_count    integer := 0;
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

  -- Idempotente: excluir de novo não é erro, e não reprocessa estoque nem caixa.
  IF v_sale.status = 'EXCLUIDO' THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true);
  END IF;

  -- PRÉ-CONDIÇÃO. A tela já desabilita o botão; aqui é a barreira que não depende da tela.
  IF public._sale_has_paid_receivable(p_sale_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', true,
      'blocked_reason', 'PAID_RECEIVABLE',
      'message', 'Esta venda possui pagamentos registrados e não pode ser excluída. Cancele os recebimentos em Lançamentos a Receber antes.'
    );
  END IF;

  -- 1) Caixa: removido. Sem FK, some em silêncio se não for tratado aqui.
  UPDATE public.cash_entries
  SET is_active = false
  WHERE origin_type = 'SALE'
    AND origin_id   = p_sale_id
    AND tenant_id   = p_tenant_id
    AND is_active   = true;
  GET DIAGNOSTICS v_cash_count = ROW_COUNT;

  -- 2) Recebíveis pendentes. Os PAGOS já bloquearam acima, então aqui só há pendentes.
  UPDATE public.pending_receivables
  SET is_active = false
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
    AND is_active = true;
  GET DIAGNOSTICS v_pr_count = ROW_COUNT;

  -- 3) Recorrência: desvincula, não estorna (mesma decisão P3 do cancelamento).
  UPDATE public.recurrence_records
  SET sale_id = NULL
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_rec_count = ROW_COUNT;

  -- 4) Estoque: os produtos voltam.
  v_stock_count := public._reverse_stock_for_sale(p_sale_id, p_tenant_id);

  -- 5) A VENDA morre.
  UPDATE public.sales
  SET status     = 'EXCLUIDO',
      is_active  = false,
      updated_at = NOW()
  WHERE id = p_sale_id
    AND tenant_id = p_tenant_id;

  -- 6) A CADEIA morre junto — não volta a DRAFT, que é o que a distingue do cancelamento.
  --    Caso A: a venda nasceu de um pedido.
  SELECT id, budget_id, original_budget_id
  INTO v_order_id, v_order_budget, v_order_original
  FROM public.orders
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    -- `sale_id` é PRESERVADO: a FK NO ACTION não estorva um UPDATE, e o vínculo é o que
    -- permite auditar a cadeia depois de ela morrer.
    UPDATE public.orders
    SET status     = 'EXCLUIDO',
        is_active  = false,
        updated_at = NOW()
    WHERE id = v_order_id;
    GET DIAGNOSTICS v_orders_count = ROW_COUNT;

    -- O orçamento ESPELHO (criado no envio para venda) e o ORIGINAL, os dois.
    UPDATE public.budgets
    SET status     = 'EXCLUIDO',
        is_active  = false,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND id IN (v_order_budget, v_order_original)
      AND id IS NOT NULL;
    GET DIAGNOSTICS v_budgets_count = ROW_COUNT;
  ELSIF v_sale.budget_id IS NOT NULL THEN
    -- Caso B: venda direta a partir de orçamento, sem pedido no meio.
    -- É este ramo que tira a comissão do relatório: `relatorio-vendas` lê comissão de
    -- `budgets` com `status='PAID' AND is_active=true`, e `budgets.sale_id` é SET NULL —
    -- sem marcar o orçamento, a comissão dele SOBREVIVERIA à exclusão da venda.
    UPDATE public.budgets
    SET status     = 'EXCLUIDO',
        is_active  = false,
        updated_at = NOW()
    WHERE id = v_sale.budget_id
      AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_budgets_count = ROW_COUNT;
  END IF;
  -- Caso C: venda de balcão / agenda — não há cadeia acima, nada mais a marcar.

  RETURN jsonb_build_object(
    'success', true,
    'affected', jsonb_build_object(
      'cash_entries',        v_cash_count,
      'pending_receivables', v_pr_count,
      'recurrence_unlinked', v_rec_count,
      'stock_reversed',      v_stock_count,
      'orders_deleted',      v_orders_count,
      'budgets_deleted',     v_budgets_count
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.delete_sale_cascade(uuid, uuid) IS
  'Exclusão em cascata da venda (soft delete forte, status EXCLUIDO nos três documentos). Bloqueia quando há pagamento registrado. Diferente de cancel_sale_cascade, NÃO reabre pedido nem orçamento: a cadeia morre junta e é irreversível.';

-- VERIFICAÇÃO (depois de aplicar):
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'delete_sale_cascade';
--
-- Esperado: uma linha, args `p_sale_id uuid, p_tenant_id uuid`. Zero linhas = NÃO APLICADA.
--
--   NOTIFY pgrst, 'reload schema';
