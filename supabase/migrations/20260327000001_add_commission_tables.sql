-- Tabelas de comissão para produtos e serviços
CREATE TABLE IF NOT EXISTS public.commission_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PRODUCT', 'SERVICE')),
  name TEXT NOT NULL,
  commission_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_tables_tenant_id ON public.commission_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commission_tables_tenant_type ON public.commission_tables(tenant_id, type);

ALTER TABLE public.commission_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.commission_tables
  USING (tenant_id = get_auth_tenant_id());

-- FK de products para commission_tables
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS commission_table_id UUID REFERENCES public.commission_tables(id) ON DELETE SET NULL;

-- FK de services para commission_tables
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS commission_table_id UUID REFERENCES public.commission_tables(id) ON DELETE SET NULL;

-- Tabela de junção: funcionário <-> tabelas de comissão (N:N)
CREATE TABLE IF NOT EXISTS public.employee_commission_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  commission_table_id UUID NOT NULL REFERENCES public.commission_tables(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, commission_table_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_ct_employee ON public.employee_commission_tables(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_ct_tenant ON public.employee_commission_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_emp_ct_table ON public.employee_commission_tables(commission_table_id);

ALTER TABLE public.employee_commission_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.employee_commission_tables
  USING (tenant_id = get_auth_tenant_id());
