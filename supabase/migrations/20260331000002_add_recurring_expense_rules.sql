-- Migration: recurring_expense_rules
-- Tabela para regras de despesas recorrentes lançadas em Controle Financeiro.
-- Cada regra gera lançamentos mensais em cash_entries com paid_date = null (pendente).
-- Só entra no Hub/Caixa quando o usuário efetiva o pagamento (paid_date preenchido).

CREATE TABLE IF NOT EXISTS recurring_expense_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,            -- categoria da despesa (ex: 'ALUGUEL')
  expense_group   TEXT NOT NULL,            -- grupo calculado automaticamente (ex: 'DESPESA_FIXA')
  description     TEXT,                     -- descrição opcional
  amount          DECIMAL(12,2) NOT NULL,   -- valor mensal
  due_day         INTEGER NOT NULL          -- dia do mês (1-31)
                  CHECK (due_day >= 1 AND due_day <= 31),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE recurring_expense_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_recurring_expense_rules"
  ON recurring_expense_rules
  FOR ALL
  USING (tenant_id = (
    SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
  ));

-- Index
CREATE INDEX IF NOT EXISTS idx_recurring_expense_rules_tenant
  ON recurring_expense_rules (tenant_id, is_active);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_recurring_expense_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recurring_expense_rules_updated_at
  BEFORE UPDATE ON recurring_expense_rules
  FOR EACH ROW EXECUTE FUNCTION update_recurring_expense_rules_updated_at();
