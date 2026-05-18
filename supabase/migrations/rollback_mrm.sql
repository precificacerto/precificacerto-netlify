-- =====================================================================
-- ROLLBACK MRM — Script de emergência (NÃO É UMA MIGRATION)
--
-- Não rodar com `supabase db push` — executar MANUALMENTE no SQL editor
-- quando precisar reverter o MRM em produção.
--
-- Estratégia: NÃO destrutivo. Mantém schema e dados; apenas:
--   1) Desliga feature flag global (set false para todos os tenants)
--   2) Reverte engine_version='2.0.0' para 'legacy' nos registros tocados
--      pelo motor V2 (opcional — só em caso de inconsistência detectada)
--
-- Antes de rodar: parar deploy, definir env NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED=false.
-- =====================================================================

-- ========== 1) Desligar feature flag para todos os tenants ==========
UPDATE public.tenant_expense_config
SET margin_reapuration_enabled = FALSE;

-- ========== 2) [OPCIONAL] Reverter registros tocados pelo motor V2 ==========
-- Descomente apenas se houver inconsistência detectada nos cálculos V2.
-- Mantém os dados — apenas marca como legacy para forçar fallback no app.
--
-- UPDATE public.budgets
-- SET engine_version = 'legacy', discount_mode = 'PROPORTIONAL'
-- WHERE engine_version = '2.0.0';
--
-- UPDATE public.sales
-- SET engine_version = 'legacy', discount_mode = 'PROPORTIONAL'
-- WHERE engine_version = '2.0.0';
--
-- UPDATE public.orders
-- SET engine_version = 'legacy', discount_mode = 'PROPORTIONAL'
-- WHERE engine_version = '2.0.0';

-- ========== 3) [OPCIONAL] Limpar tax_breakdown de registros V2 ==========
-- Útil se houver dados corruptos. NÃO recomendado em produção sem backup.
--
-- UPDATE public.budget_items SET tax_breakdown = NULL WHERE tax_breakdown IS NOT NULL;
-- UPDATE public.sale_items   SET tax_breakdown = NULL WHERE tax_breakdown IS NOT NULL;
-- UPDATE public.order_items  SET tax_breakdown = NULL WHERE tax_breakdown IS NOT NULL;

-- ========== Verificação pós-rollback ==========
SELECT
  (SELECT COUNT(*) FROM public.tenant_expense_config WHERE margin_reapuration_enabled = TRUE) AS tenants_ativos,
  (SELECT COUNT(*) FROM public.budgets WHERE engine_version = '2.0.0') AS budgets_v2_remanescentes,
  (SELECT COUNT(*) FROM public.sales WHERE engine_version = '2.0.0')   AS sales_v2_remanescentes,
  (SELECT COUNT(*) FROM public.orders WHERE engine_version = '2.0.0')  AS orders_v2_remanescentes;
