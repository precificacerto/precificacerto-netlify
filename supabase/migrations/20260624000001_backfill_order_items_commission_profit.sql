-- ============================================================================
-- Backfill: herança fiscal orçamento → pedido (Relatório v2.0 — itens 2.2 / 2.3)
-- ----------------------------------------------------------------------------
-- A conversão orçamento→pedido NÃO copiava commission_pct, profit_pct nem
-- tax_breakdown para order_items. Por isso pedidos existentes nascem com
-- Comissão/Lucro nulos e o motor degrada ("Atualizando para nova versão do
-- motor") — ex.: PED-59586C. O código já foi corrigido para novas conversões;
-- esta migração recupera os pedidos JÁ EXISTENTES a partir do orçamento de
-- origem (orders.budget_id → budget_items).
--
-- Statement ÚNICO e idempotente (sem DO/RAISE NOTICE e sem BEGIN/COMMIT
-- explícito — mais amigável ao SQL Editor do Supabase, que às vezes retorna
-- "Failed to fetch" com blocos PL/pgSQL). Rodar mais de uma vez é seguro:
-- o COALESCE só preenche o que está NULL e o WHERE filtra os já preenchidos.
--
-- Match: mesmo orçamento de origem + mesmo produto/serviço + mesmo preço e qtde.
-- ============================================================================

WITH matched AS (
    SELECT DISTINCT ON (oi.id)
        oi.id             AS order_item_id,
        bi.commission_pct AS bi_commission_pct,
        bi.profit_pct     AS bi_profit_pct,
        bi.tax_breakdown  AS bi_tax_breakdown
    FROM order_items oi
    JOIN orders o        ON o.id = oi.order_id
    JOIN budget_items bi ON bi.budget_id = o.budget_id
    WHERE o.budget_id IS NOT NULL
      AND (oi.commission_pct IS NULL OR oi.profit_pct IS NULL OR oi.tax_breakdown IS NULL)
      -- Origem precisa ter ALGUM dado fiscal (cobre budget com tax_breakdown mas
      -- commission_pct nulo, e vice-versa).
      AND (bi.commission_pct IS NOT NULL OR bi.profit_pct IS NOT NULL OR bi.tax_breakdown IS NOT NULL)
      AND COALESCE(oi.product_id::text, '') = COALESCE(bi.product_id::text, '')
      AND COALESCE(oi.service_id::text, '') = COALESCE(bi.service_id::text, '')
      AND oi.unit_price = bi.unit_price
      AND oi.quantity   = bi.quantity
    ORDER BY oi.id, bi.created_at NULLS LAST
)
UPDATE order_items oi
SET
    commission_pct = COALESCE(oi.commission_pct, m.bi_commission_pct),
    profit_pct     = COALESCE(oi.profit_pct,     m.bi_profit_pct),
    tax_breakdown  = COALESCE(oi.tax_breakdown,  m.bi_tax_breakdown)
FROM matched m
WHERE oi.id = m.order_item_id;
