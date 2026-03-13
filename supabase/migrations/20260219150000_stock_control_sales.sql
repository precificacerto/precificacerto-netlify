-- =====================================================
-- Migration: Stock Control + Sales → Cash Flow
-- Created: 2026-02-19
-- Adds stock_type, sales details, and production tracking
-- =====================================================

-- 1) ENUM para tipo de estoque
DO $$ BEGIN
  CREATE TYPE public.stock_type AS ENUM ('ITEM', 'PRODUCT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Expandir tabela STOCK
ALTER TABLE public.stock
  ADD COLUMN IF NOT EXISTS stock_type  public.stock_type DEFAULT 'ITEM',
  ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS unit        text DEFAULT 'UN';

-- 3) Expandir tabela SALES para registrar detalhe da venda
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity     numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS status       text DEFAULT 'COMPLETED';

-- 4) Tabela de PRODUÇÃO (registra quando um produto é produzido)
CREATE TABLE IF NOT EXISTS public.productions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity       numeric NOT NULL DEFAULT 1,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id)
);

-- 5) Tabela de itens consumidos na produção
CREATE TABLE IF NOT EXISTS public.production_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id  uuid NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  item_id        uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity_used  numeric NOT NULL,
  unit           text DEFAULT 'UN'
);

-- 6) RLS nas novas tabelas
ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "productions_tenant_isolation" ON public.productions
    USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "production_items_via_production" ON public.production_items
    USING (production_id IN (
      SELECT id FROM public.productions WHERE tenant_id = (
        SELECT tenant_id FROM public.users WHERE id = auth.uid()
      )
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7) Índices
CREATE INDEX IF NOT EXISTS idx_stock_tenant_type ON public.stock(tenant_id, stock_type);
CREATE INDEX IF NOT EXISTS idx_stock_item ON public.stock(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_product ON public.stock(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_product ON public.sales(product_id);
CREATE INDEX IF NOT EXISTS idx_productions_tenant ON public.productions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_productions_product ON public.productions(product_id);
