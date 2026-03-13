-- Criação da tabela de restituição de tributos (Lucro Real)

CREATE TABLE IF NOT EXISTS public.tax_restitution_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  reference_month DATE NOT NULL,
  total_purchases NUMERIC(15,2) DEFAULT 0,
  pis_credit NUMERIC(15,2) DEFAULT 0,
  cofins_credit NUMERIC(15,2) DEFAULT 0,
  icms_credit NUMERIC(15,2) DEFAULT 0,
  total_restitution NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_restitution_tenant
  ON public.tax_restitution_entries(tenant_id, reference_month);

ALTER TABLE public.tax_restitution_entries
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "tenant_restitution_policy"
  ON public.tax_restitution_entries
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.users
      WHERE id = auth.uid()
    )
  );

