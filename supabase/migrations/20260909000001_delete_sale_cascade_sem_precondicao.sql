-- `delete_sale_cascade` — REMOÇÃO DA PRÉ-CONDIÇÃO DE PAGAMENTO.
--
-- MUDANÇA DE DECISÃO, NÃO CORREÇÃO
-- ---------------------------------
-- Até 09/09/2026 esta função BLOQUEAVA a exclusão de venda com parcela paga, devolvendo
-- `blocked: true`. Aquilo estava CERTO sob a regra da época — ver
-- `.claude/rules/decisao-sob-regra-da-epoca.md`. A regra mudou: venda com pagamento registrado
-- PODE ser excluída, e o dinheiro sai do caixa junto.
--
-- É coerente com o conceito que o #52 fixou: excluir é como se a evolução NUNCA TIVESSE CHEGADO
-- ALI. Se a venda nunca existiu, o dinheiro dela nunca entrou — o saldo do mês diminui.
--
-- ESTA É A SEGUNDA MUDANÇA DE DECISÃO DA MESMA RODADA. A primeira foi o botão Excluir voltar ao
-- popup do Fluxo de Caixa, também revendo uma escolha do #52 que estava certa quando foi feita.
--
-- O QUE **NÃO** MUDA, e é o que torna esta migração pequena
-- ---------------------------------------------------------
-- O tratamento das `cash_entries` continua o MESMO: o `UPDATE` já desativava liquidadas e
-- pendentes sem distinguir — a função nunca mencionou `paid_date`. Removido o bloqueio, o
-- dinheiro já recebido sai do caixa SEM nenhuma outra alteração. Verificado antes de escrever:
-- `position('paid_date' in pg_get_functiondef(...))` = 0.
--
-- A idempotência (`IF v_sale.status = 'EXCLUIDO'`) PERMANECE: excluir de novo continua não
-- sendo erro e não reprocessa estoque nem caixa. O que saiu foi a barreira, não a proteção.
--
-- `_sale_has_paid_receivable` NÃO É REMOVIDA. Ela deixa de ser chamada aqui, mas continua
-- existindo — apagar função que outro caminho possa usar é rodada própria, e a verificação de
-- dependências de `.claude/rules/migration-delivery.md` vale nos dois sentidos.
--
-- ORDEM DE APLICAÇÃO: **ANTES DO MERGE**. Mergear o código antes de aplicar deixa o botão
-- habilitado na tela e a função ainda bloqueando: o clique falha com a mensagem antiga, que a
-- tela já não anuncia. Não derruba nada, mas entrega uma promessa que o banco recusa.

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
    RAISE EXCEPTION 'Venda nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotente: excluir de novo nao e erro, e nao reprocessa estoque nem caixa.
  IF v_sale.status = 'EXCLUIDO' THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true);
  END IF;

  -- A PRE-CONDICAO DE PARCELA PAGA FOI REMOVIDA AQUI (09/09/2026). Ver o cabecalho.

  -- 1) Caixa: removido. Sem FK, some em silencio se nao for tratado aqui.
  --    Desativa liquidadas E pendentes, sem distinguir `paid_date` — comportamento inalterado.
  UPDATE public.cash_entries
  SET is_active = false
  WHERE origin_type = 'SALE'
    AND origin_id   = p_sale_id
    AND tenant_id   = p_tenant_id
    AND is_active   = true;
  GET DIAGNOSTICS v_cash_count = ROW_COUNT;

  -- 2) Recebiveis. Antes so havia pendentes aqui, porque os pagos bloqueavam acima; agora
  --    os PAGOS tambem passam por este UPDATE, que ja os cobria pelo filtro `is_active`.
  UPDATE public.pending_receivables
  SET is_active = false
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
    AND is_active = true;
  GET DIAGNOSTICS v_pr_count = ROW_COUNT;

  -- 3) Recorrencia: desvincula, nao estorna (mesma decisao P3 do cancelamento).
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

  -- 6) A CADEIA morre junto — nao volta a DRAFT, que e o que a distingue do cancelamento.
  SELECT id, budget_id, original_budget_id
  INTO v_order_id, v_order_budget, v_order_original
  FROM public.orders
  WHERE sale_id = p_sale_id
    AND tenant_id = p_tenant_id
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET status     = 'EXCLUIDO',
        is_active  = false,
        updated_at = NOW()
    WHERE id = v_order_id;
    GET DIAGNOSTICS v_orders_count = ROW_COUNT;

    UPDATE public.budgets
    SET status     = 'EXCLUIDO',
        is_active  = false,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND id IN (v_order_budget, v_order_original)
      AND id IS NOT NULL;
    GET DIAGNOSTICS v_budgets_count = ROW_COUNT;
  ELSIF v_sale.budget_id IS NOT NULL THEN
    UPDATE public.budgets
    SET status     = 'EXCLUIDO',
        is_active  = false,
        updated_at = NOW()
    WHERE id = v_sale.budget_id
      AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_budgets_count = ROW_COUNT;
  END IF;

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
  'Exclusao em cascata da venda (soft delete forte, status EXCLUIDO nos tres documentos). SEM pre-condicao de pagamento desde 09/09/2026: venda com parcela paga PODE ser excluida, e o dinheiro sai do caixa junto. Diferente de cancel_sale_cascade, NAO reabre pedido nem orcamento.';

-- VERIFICACAO (depois de aplicar):
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          position('_sale_has_paid_receivable' in pg_get_functiondef(p.oid)) as ainda_bloqueia
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'delete_sale_cascade';
--
-- Esperado: UMA linha, args `p_sale_id uuid, p_tenant_id uuid`, e `ainda_bloqueia` = 0.
-- Valor diferente de zero significa NAO APLICADA — a versao antiga continua no banco.
--
-- E a dependencia que PERMANECE, que nao pode ter sumido:
--
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('_reverse_stock_for_sale', '_sale_has_paid_receivable');
--
-- Esperado: DUAS linhas. `_sale_has_paid_receivable` deixa de ser chamada, mas continua
-- existindo — plpgsql nao valida referencias na criacao, entao a ausencia dela so apareceria
-- no primeiro uso de outro caminho que a chame.
--
--   NOTIFY pgrst, 'reload schema';
