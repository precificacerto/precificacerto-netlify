-- =====================================================
-- Migration: Cash Flow Enhancements
-- Fixed Expenses, Expanded Cash Entries, Origin Tracking
-- =====================================================

-- 1) Tabela de Despesas Fixas (Recorrentes)
CREATE TABLE IF NOT EXISTS public.fixed_expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  description    text NOT NULL,
  amount         numeric NOT NULL DEFAULT 0,
  due_day        integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  category_id    uuid REFERENCES public.cashier_categories(id) ON DELETE SET NULL,
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- 2) Expandir Tabela de Lançamentos (Cash Entries)
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS payment_method    public.payment_method, -- Usa o ENUM criado na migração anterior
  ADD COLUMN IF NOT EXISTS origin_type       text,                  -- 'MANUAL', 'SALE', 'FIXED_EXPENSE', 'SALARY'
  ADD COLUMN IF NOT EXISTS origin_id         uuid,                  -- ID da origem (venda, despesa fixa, funcionário)
  ADD COLUMN IF NOT EXISTS contact_id        uuid;                  -- Cliente ou Fornecedor ou Funcionário (opcional)

-- 3) RLS para Fixed Expenses
ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "fixed_expenses_tenant_isolation" ON public.fixed_expenses
    USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Índices
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_tenant ON public.fixed_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_entries_origin ON public.cash_entries(origin_type, origin_id);
CREATE INDEX IF NOT EXISTS idx_cash_entries_date ON public.cash_entries(due_date);

-- 5) Trigger para atualizar updated_at em fixed_expenses
CREATE OR REPLACE FUNCTION update_fixed_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_fixed_expenses_timestamp
  BEFORE UPDATE ON public.fixed_expenses
  FOR EACH ROW EXECUTE PROCEDURE update_fixed_expenses_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
