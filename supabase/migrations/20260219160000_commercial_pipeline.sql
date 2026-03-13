-- =====================================================
-- Migration: Commercial Pipeline (Budget → Sale)
-- Payment details, budget status PAID, link budget→sale
-- =====================================================

-- 1) ENUM para forma de pagamento
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM (
    'PIX', 'DINHEIRO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Adicionar status PAID ao budget (alter enum)
-- PostgreSQL não permite IF NOT EXISTS em ALTER TYPE, então verificamos
DO $$ BEGIN
  ALTER TYPE public.budget_status ADD VALUE IF NOT EXISTS 'PAID';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Expandir tabela BUDGETS com dados de pagamento
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS payment_method    public.payment_method,
  ADD COLUMN IF NOT EXISTS installments      integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS paid_date         date,
  ADD COLUMN IF NOT EXISTS notes             text,
  ADD COLUMN IF NOT EXISTS sale_id           uuid;

-- 4) Expandir tabela SALES com mais detalhes
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method    public.payment_method,
  ADD COLUMN IF NOT EXISTS installments      integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS budget_id         uuid REFERENCES public.budgets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_type         text DEFAULT 'MANUAL';
  -- sale_type: 'MANUAL' (balcão) ou 'FROM_BUDGET' (veio de orçamento)

-- 5) Criar tabela sale_items para itens da venda
CREATE TABLE IF NOT EXISTS public.sale_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity       numeric NOT NULL DEFAULT 1,
  unit_price     numeric NOT NULL DEFAULT 0,
  discount       numeric DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- 6) RLS
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "sale_items_via_sale" ON public.sale_items
    USING (sale_id IN (
      SELECT id FROM public.sales WHERE tenant_id = (
        SELECT tenant_id FROM public.users WHERE id = auth.uid()
      )
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7) Índices
CREATE INDEX IF NOT EXISTS idx_sales_budget ON public.sales(budget_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON public.budgets(status);
