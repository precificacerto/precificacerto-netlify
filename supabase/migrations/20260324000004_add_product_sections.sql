CREATE TABLE IF NOT EXISTS public.product_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_sections_tenant_id ON public.product_sections(tenant_id);

ALTER TABLE public.product_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.product_sections
  USING (tenant_id = (SELECT auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.product_sections(id) ON DELETE SET NULL;
