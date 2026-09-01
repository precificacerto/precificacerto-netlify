-- Snapshot das alíquotas de despesa que formaram o preço de cada serviço.
--
-- Produto já tem esse snapshot em `pricing_calculations` (pct_indirect_labor,
-- pct_fixed_expense, pct_variable_expense, pct_financial_expense), lido pela cascata via
-- `expense_breakdown_unit`. Serviço não tinha: a cascata lia o `tenant_expense_config`
-- ATUAL, então todo serviço já precificado era decomposto com alíquotas que podiam ter
-- mudado desde a construção — e o preço gravado deixava de ser reproduzível.
--
-- NULLABLE de propósito. NULL = nunca gravado (serviço legado) ⇒ os leitores caem no
-- tenant, exatamente como hoje. Um jsonb com zeros significaria "as alíquotas eram zero",
-- que é uma afirmação diferente. É a mesma distinção que faltou no D8, onde
-- `NOT NULL DEFAULT 0` tornou "zero de verdade" e "nunca escrito" indistinguíveis.
--
-- Formato (v1):
--   {
--     "v": 1,
--     "variavel_pct": 1.29,             -- % base-100, entrou no coeficiente
--     "financeira_pct": 0.37,           -- % base-100, entrou no coeficiente
--     "custo_por_minuto": 0.534722,     -- R$/min que formou a MO dentro do CMV
--     "carga_horaria_minutos": 18000,   -- divisor da equipe produtiva no mês
--     "gravado_em": "2026-09-02T12:00:00.000Z"
--   }
--
-- Despesa Fixa e MO Administrativa NÃO aparecem como percentual porque não entram no
-- coeficiente do serviço: elas estão em R$/mês dentro de `custo_por_minuto`. Registrá-las
-- aqui como % sugeriria uma segunda incidência que não existe.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS expense_snapshot JSONB;

COMMENT ON COLUMN public.services.expense_snapshot IS
  'Alíquotas de despesa e custo por minuto vigentes quando o preço do serviço foi formado. NULL = serviço anterior ao snapshot (leitores usam tenant_expense_config atual).';
