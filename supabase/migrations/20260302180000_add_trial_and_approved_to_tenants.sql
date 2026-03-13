-- Colunas necessárias para create_tenant_with_admin e painel super_admin
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_super_admin boolean DEFAULT false;

COMMENT ON COLUMN public.tenants.trial_ends_at IS 'Fim do período de trial (ex.: 14 dias).';
COMMENT ON COLUMN public.tenants.plan_ends_at IS 'Fim do ciclo do plano (Stripe/subscription).';
COMMENT ON COLUMN public.tenants.approved_by_super_admin IS 'Cadastro aprovado pelo super_admin.';

-- Tenants já existentes ficam aprovados
UPDATE public.tenants SET approved_by_super_admin = true WHERE approved_by_super_admin IS NULL;
