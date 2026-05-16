-- Sprint Mai/2026 v2 — Ponto de Equilíbrio refinado (HUB → DRE)
-- Adiciona 3 colunas em tenant_expense_config para refletir a lógica oficial:
--   1. external_taxes_percent (IPF — IMPOSTO grupo): impostos POR FORA, deduzem da receita
--      para formar ROB (Receita Operacional Base). NÃO entram na Margem de Contribuição.
--   2. outsourced_activities_percent (AT — ATIVIDADES_TERCEIRIZADAS grupo): entra na MC
--      como variável operacional (fretes terceirizados, logística externa, etc).
--   3. deducao_receita_percent (DEDUCAO_RECEITA grupo): devoluções, cancelamentos,
--      estornos, abatimentos comerciais, descontos incondicionais. Deduzem da receita.
--
-- Importante: tax_on_revenue_percent passa a representar APENAS IPD (impostos POR DENTRO,
-- grupo IMPOSTO_FATURAMENTO_DENTRO + REGIME_TRIBUTARIO). A separação anterior misturava IPD+IPF.

ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS external_taxes_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outsourced_activities_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deducao_receita_percent numeric DEFAULT 0;

COMMENT ON COLUMN public.tenant_expense_config.external_taxes_percent IS
  'IPF — Impostos POR FORA (grupo IMPOSTO do HUB: CBS, IBS, ICMS-ST, DIFAL, IPI destacado, ISS retido, FCP-ST, PIS/COFINS Monofásico). Deduzem da receita bruta para formar ROB. NÃO entram na MC. (×100, ex: 5.20)';

COMMENT ON COLUMN public.tenant_expense_config.outsourced_activities_percent IS
  'AT — Atividades Operacionais de Entrega (grupo ATIVIDADES_TERCEIRIZADAS do HUB: fretes terceirizados, logística externa, seguro de transporte, despesas acessórias). Entra na MC como variável operacional. (×100, ex: 4.30)';

COMMENT ON COLUMN public.tenant_expense_config.deducao_receita_percent IS
  'DEDUCAO_RECEITA — devoluções, cancelamentos, estornos, abatimentos, descontos incondicionais. Deduzem da receita bruta para formar ROB. NÃO entram na MC. (×100, ex: 1.50)';

-- ── ROLLBACK (descomente para reverter) ──
-- ALTER TABLE public.tenant_expense_config
--   DROP COLUMN IF EXISTS external_taxes_percent,
--   DROP COLUMN IF EXISTS outsourced_activities_percent,
--   DROP COLUMN IF EXISTS deducao_receita_percent;
