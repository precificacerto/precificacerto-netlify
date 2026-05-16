-- Sprint 1 — Ponto de Equilíbrio (Melhorias Mai/2026)
-- Adiciona ao tenant_expense_config os percentuais de IMPOSTOS sobre faturamento e COMISSÕES
-- apurados pelo HUB. Antes, o PE puxava esses valores do cadastro do usuário (taxableRegimeValue,
-- commissionValue), o que distorcia o cálculo em relação à realidade operacional.
-- Os valores são recalculados em mergeExpenseConfig() a cada sincronização do HUB.

ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS tax_on_revenue_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent_hub numeric DEFAULT 0;

COMMENT ON COLUMN public.tenant_expense_config.tax_on_revenue_percent IS
  'Soma dos grupos IMPOSTO_FATURAMENTO_DENTRO + IMPOSTO + REGIME_TRIBUTARIO do HUB, em % sobre faturamento (×100, ex: 18.50). Recalculado em mergeExpenseConfig(). Substitui currentUser.taxableRegimeValue como input do PE.';

COMMENT ON COLUMN public.tenant_expense_config.commission_percent_hub IS
  'Percentual médio efetivo de COMISSOES sobre faturamento apurado pelo HUB (×100, ex: 2.58). Recalculado em mergeExpenseConfig(). Substitui currentUser.commissionValue como input do PE.';

-- ── ROLLBACK (descomente para reverter) ──
-- ALTER TABLE public.tenant_expense_config
--   DROP COLUMN IF EXISTS tax_on_revenue_percent,
--   DROP COLUMN IF EXISTS commission_percent_hub;
