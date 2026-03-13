-- =============================================================================
-- Painel Super Admin: trial/plan dates, approved flag, tenant_billing
-- =============================================================================

-- 1. Colunas em tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_super_admin boolean DEFAULT false;

COMMENT ON COLUMN public.tenants.trial_ends_at IS 'Fim do período de trial (ex.: 14 dias).';
COMMENT ON COLUMN public.tenants.plan_ends_at IS 'Fim do ciclo do plano (Stripe/subscription).';
COMMENT ON COLUMN public.tenants.approved_by_super_admin IS 'Cadastro aprovado pelo super_admin (manual para signup; true automático para Stripe).';

-- Backfill: tenants já existentes na data da migration ficam aprovados
UPDATE public.tenants SET approved_by_super_admin = true;

-- 2. Enum para status de billing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_status') THEN
    CREATE TYPE public.billing_status AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED');
  END IF;
END$$;

-- 3. Tabela tenant_billing (SaaS)
CREATE TABLE IF NOT EXISTS public.tenant_billing (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status public.billing_status NOT NULL DEFAULT 'PENDING',
  amount numeric(12, 2),
  due_date date,
  paid_at timestamptz,
  external_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_tenant_id ON public.tenant_billing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_status ON public.tenant_billing(status);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_external_id ON public.tenant_billing(external_id) WHERE external_id IS NOT NULL;

COMMENT ON TABLE public.tenant_billing IS 'Faturas/billing SaaS por tenant (Stripe).';

ALTER TABLE public.tenant_billing ENABLE ROW LEVEL SECURITY;

-- Tenant vê só o próprio billing; super_admin vê tudo
CREATE POLICY "tenant_billing_select_own" ON public.tenant_billing
  FOR SELECT
  USING (tenant_id = public.get_auth_tenant_id());

CREATE POLICY "tenant_billing_super_admin_all" ON public.tenant_billing
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
