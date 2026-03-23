-- =====================================================
-- Migration: Pending Receivables (Lançamentos a Receber)
-- New payment method + pending receivables tracking table
-- =====================================================

-- 1) Add LANCAMENTOS_A_RECEBER to payment_method enum
DO $$ BEGIN
  ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'LANCAMENTOS_A_RECEBER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Create pending_receivables table
CREATE TABLE IF NOT EXISTS public.pending_receivables (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  employee_id         UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  sale_id             UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  budget_id           UUID REFERENCES public.budgets(id) ON DELETE SET NULL,
  calendar_event_id   UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  amount              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  description         TEXT,
  launch_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  origin_type         TEXT NOT NULL CHECK (origin_type IN ('SALE', 'BUDGET', 'AGENDA')),
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  payment_method      TEXT,
  paid_date           DATE,
  paid_by             UUID,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_pending_receivables_tenant_id   ON public.pending_receivables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pending_receivables_customer_id ON public.pending_receivables(customer_id);
CREATE INDEX IF NOT EXISTS idx_pending_receivables_status      ON public.pending_receivables(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_pending_receivables_launch_date ON public.pending_receivables(launch_date);

-- 4) RLS
ALTER TABLE public.pending_receivables ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_select_pending_receivables" ON public.pending_receivables
    FOR SELECT USING (
      tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "tenant_insert_pending_receivables" ON public.pending_receivables
    FOR INSERT WITH CHECK (
      tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "tenant_update_pending_receivables" ON public.pending_receivables
    FOR UPDATE USING (
      tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5) updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at_pending_receivables()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pending_receivables_updated_at ON public.pending_receivables;
CREATE TRIGGER trg_pending_receivables_updated_at
  BEFORE UPDATE ON public.pending_receivables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_pending_receivables();
