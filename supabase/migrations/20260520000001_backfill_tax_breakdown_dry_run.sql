-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S1.2 Backfill DRY-RUN
--
-- STATUS: DRY-RUN — NÃO executar em produção.
-- Esta migration é documental: descreve o backfill de `tax_breakdown` em
-- items legados (criados ANTES da Story S1.2). Todo SQL está comentado.
--
-- ATIVAÇÃO REAL: Story S2.2 — requer aprovação @architect + @data-engineer.
--
-- Contexto:
--   - Story S1.2 hidrata `commission_pct`, `profit_pct` e `tax_breakdown` em
--     budget_items / order_items / sale_items no momento do insert.
--   - Items criados ANTES de S1.2 têm essas colunas NULL.
--   - O motor V2 (Q3 default use_snapshot_rates=true) lê snapshot do item;
--     items com tax_breakdown=NULL exigem fallback (recálculo dinâmico) que
--     pode produzir resultado diferente do esperado se as alíquotas mudaram.
--
-- Estratégia do backfill (a ser implementada em S2.2):
--   1. Identificar items com tax_breakdown IS NULL e status do pai ≥ approved.
--   2. Para cada item: carregar alíquotas vigentes em items.created_at
--      via tax_rates_periods (filtra por valid_from <= created_at <
--      coalesce(valid_until, +inf)).
--   3. Reconstituir o motor com cp/mod/dop derivados (produtos.cost_total /
--      services.cost_total quando disponível; senão 0).
--   4. UPSERT em tax_breakdown via UPDATE … SET tax_breakdown = jsonb(...).
--   5. Telemetria: gerar relatório por tenant com (items_total,
--      items_backfilled, items_skipped_no_rates, items_skipped_no_cost).
--
-- Pré-requisitos para ativação:
--   [ ] Validar paridade snapshot↔motor em ≥1000 items reais via golden tests.
--   [ ] Snapshot inicial de tabelas afetadas (pg_dump).
--   [ ] Janela de manutenção definida.
--   [ ] Plano de rollback documentado.
--
-- =====================================================================

-- DRY-RUN: comandos abaixo estão COMENTADOS. Não execute sem revisão S2.2.

-- -- 1) Identificar items para backfill (apenas COUNT, sem mutação)
-- SELECT
--   'budget_items' AS source,
--   COUNT(*) AS pending,
--   COUNT(DISTINCT b.tenant_id) AS tenants_affected
-- FROM public.budget_items bi
-- JOIN public.budgets b ON b.id = bi.budget_id
-- WHERE bi.tax_breakdown IS NULL
--   AND b.status IN ('APPROVED', 'SENT_TO_ORDER', 'PAID', 'AWAITING_PAYMENT');

-- SELECT
--   'order_items' AS source,
--   COUNT(*) AS pending,
--   COUNT(DISTINCT o.tenant_id) AS tenants_affected
-- FROM public.order_items oi
-- JOIN public.orders o ON o.id = oi.order_id
-- WHERE oi.tax_breakdown IS NULL
--   AND o.status IN ('SENT_TO_SALE', 'PAID');

-- SELECT
--   'sale_items' AS source,
--   COUNT(*) AS pending,
--   COUNT(DISTINCT s.tenant_id) AS tenants_affected
-- FROM public.sale_items si
-- JOIN public.sales s ON s.id = si.sale_id
-- WHERE si.tax_breakdown IS NULL
--   AND s.status = 'COMPLETED';

-- -- 2) Skeleton do backfill propriamente dito (DESCOMENTAR APENAS EM S2.2)
-- --    Atenção: o cálculo do snapshot exige executar o motor TS em JS-land —
-- --    não pode rodar em SQL puro. A migração real será orquestrada pelo
-- --    script `scripts/backfill-items-snapshot.ts` (ADR-004: motor é TS).
-- --    Esta migration apenas documenta a query de leitura.
--
-- -- UPDATE public.budget_items
-- --   SET commission_pct = $1, profit_pct = $2, tax_breakdown = $3::jsonb
-- --   WHERE id = $4;

COMMENT ON COLUMN public.budget_items.tax_breakdown IS
  'MRM S1.2: snapshot fiscal hidratado no INSERT via src/lib/items-snapshot.ts. Items legados (criados antes de S1.2) terão valor NULL até execução do backfill S2.2 (ver supabase/migrations/20260520000001_backfill_tax_breakdown_dry_run.sql).';
