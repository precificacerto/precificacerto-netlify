-- Add Hub-based monetary columns to tenant_expense_config
-- production_labor_cost_hub: average R$/month for MAO_DE_OBRA_PRODUTIVA from Hub
-- fixed_expense_monthly:     average R$/month for DESPESA_FIXA from Hub

ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS production_labor_cost_hub numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_expense_monthly numeric DEFAULT 0;
