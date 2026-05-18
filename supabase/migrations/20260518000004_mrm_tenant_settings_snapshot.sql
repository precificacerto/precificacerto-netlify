-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S1.4
-- Configurações do MRM por tenant em tenant_expense_config:
--
--   - use_snapshot_rates (boolean, default TRUE)
--       Decisão D2: configurável por tenant.
--       TRUE  = orçamento "congela" alíquotas vigentes na data de criação
--               (tax_breakdown imutável até edição explícita)
--       FALSE = orçamento sempre recalcula com alíquotas atuais
--
--   - margin_reapuration_enabled (boolean, default FALSE)
--       Feature flag MARGIN_REAPURATION_V2 por tenant.
--       FALSE = motor V2 desligado (mantém comportamento legado).
--       TRUE  = motor V2 ativo nesse tenant.
--       Big-bang (D4): toggle global por env var + override por tenant.
--
-- NOTA: MOD (mão de obra direta) JÁ existe em tenant_expense_config como
-- production_labor_cost (R$) + production_labor_percent (%). R6 (MOD imune)
-- não requer nova coluna — apenas garantir que o motor NUNCA toque nesses
-- valores durante reapuração.
-- =====================================================================

ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS use_snapshot_rates         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS margin_reapuration_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tenant_expense_config.use_snapshot_rates IS
  'MRM D2: TRUE = alíquotas tributárias "congeladas" na criação do orçamento (tax_breakdown imutável). FALSE = sempre recalcula com alíquotas atuais (risco de mudança de preço entre criar e fechar venda).';

COMMENT ON COLUMN public.tenant_expense_config.margin_reapuration_enabled IS
  'MRM feature flag por tenant. FALSE = motor V2 desligado para esse tenant (comportamento legado). TRUE = motor V2 ativo. Combina com env var NEXT_PUBLIC_MARGIN_REAPURATION_ENABLED para rollout global.';

COMMENT ON COLUMN public.tenant_expense_config.production_labor_cost IS
  'MO Produtiva (MOD) R$ - IMUNE a desconto (R6 do MRM). Motor de reapuração NUNCA altera este valor.';

COMMENT ON COLUMN public.tenant_expense_config.production_labor_percent IS
  'MO Produtiva (MOD) % - IMUNE a desconto (R6 do MRM). Motor de reapuração NUNCA altera este valor.';
