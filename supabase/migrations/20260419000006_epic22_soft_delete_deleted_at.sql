-- Epic MELHORIAS-22-ABR2026 T10
-- Adiciona deleted_at (timestamp) para soft delete completo em produtos, serviços e itens.
-- Complementa is_active já existente (migration 20260419000002).

ALTER TABLE public.products  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.items     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.services  ADD COLUMN IF NOT EXISTS is_active  boolean DEFAULT true;
ALTER TABLE public.services  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_services_active
  ON public.services(tenant_id) WHERE is_active = true;

COMMENT ON COLUMN public.products.deleted_at IS 'Data/hora da exclusão lógica (soft delete).';
COMMENT ON COLUMN public.items.deleted_at    IS 'Data/hora da exclusão lógica (soft delete).';
COMMENT ON COLUMN public.services.is_active  IS 'Soft delete: false oculta o serviço na UI sem apagar histórico.';
COMMENT ON COLUMN public.services.deleted_at IS 'Data/hora da exclusão lógica (soft delete).';
