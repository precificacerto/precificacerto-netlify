-- Epic MELHORIAS-22-ABR2026 T11
-- Garantir que a tabela customer_attachments exista com RLS correto em todos os ambientes.
-- A tabela já é usada em código (vendas, agenda, orçamentos, clientes); esta migration é idempotente
-- para assegurar consistência entre dev/staging/prod.
--
-- PADRÃO DE RLS DO PROJETO: tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())

CREATE TABLE IF NOT EXISTS public.customer_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  origin_type   TEXT NULL,           -- SALE | AGENDA | BUDGET | (NULL => anexo avulso)
  origin_id     UUID NULL,           -- id da entidade de origem (sale_id, calendar_event_id, budget_id)
  file_path     TEXT NOT NULL,       -- caminho no bucket 'comprovantes'
  file_name     TEXT NOT NULL,
  file_size     INT NULL,
  mime_type     TEXT NULL,
  description   TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_attachments_customer
  ON public.customer_attachments(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_attachments_origin
  ON public.customer_attachments(origin_type, origin_id)
  WHERE origin_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_attachments_tenant
  ON public.customer_attachments(tenant_id);

ALTER TABLE public.customer_attachments ENABLE ROW LEVEL SECURITY;

-- RLS: apenas membros do tenant têm acesso
DROP POLICY IF EXISTS "customer_attachments_tenant_select" ON public.customer_attachments;
CREATE POLICY "customer_attachments_tenant_select"
  ON public.customer_attachments FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "customer_attachments_tenant_insert" ON public.customer_attachments;
CREATE POLICY "customer_attachments_tenant_insert"
  ON public.customer_attachments FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "customer_attachments_tenant_update" ON public.customer_attachments;
CREATE POLICY "customer_attachments_tenant_update"
  ON public.customer_attachments FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "customer_attachments_tenant_delete" ON public.customer_attachments;
CREATE POLICY "customer_attachments_tenant_delete"
  ON public.customer_attachments FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

COMMENT ON TABLE public.customer_attachments IS
  'Anexos de clientes (comprovantes, notas, imagens). Vinculados a sale, calendar_event, budget ou avulsos. Arquivos reais ficam no bucket Storage "comprovantes".';
