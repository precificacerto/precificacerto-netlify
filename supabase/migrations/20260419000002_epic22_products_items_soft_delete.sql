-- Epic MELHORIAS-22-ABR2026 T10
-- Soft delete para produtos e itens (insumos/revenda) — usado pela tela de Estoque.
-- Stock já tem is_active (20260310000003). Aqui adicionamos em products e items.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.items    ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_active
  ON public.products(tenant_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_items_active
  ON public.items(tenant_id) WHERE is_active = true;

COMMENT ON COLUMN public.products.is_active IS 'Soft delete: false oculta o produto na UI sem apagar histórico.';
COMMENT ON COLUMN public.items.is_active    IS 'Soft delete: false oculta o item na UI sem apagar histórico.';
