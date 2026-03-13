-- Média mensal de receita para recálculo de despesas: total_faturamento / revenue_period_months.
-- Ex.: total 12 meses → period 12; total 6 meses → period 6; faturamento médio já mensal → period 1.
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS revenue_period_months integer DEFAULT 12;

COMMENT ON COLUMN public.tenant_settings.revenue_period_months IS 'Número de meses do período do faturamento em simples_revenue_12m. Média mensal = simples_revenue_12m / revenue_period_months.';
