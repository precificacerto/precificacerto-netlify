-- Epic MELHORIAS-22-ABR2026 T14
-- Nova aba /pedidos: fluxo Orçamento -> Pedido -> Venda.
--
-- IMPORTANTE: A tabela public.orders JÁ EXISTE (criada em 20260212000000_initial_schema.sql)
-- com um schema enxuto usado pelo módulo de allocations. Esta migration ESTENDE a tabela
-- existente com as colunas necessárias para o fluxo de Pedidos comerciais.
--
-- Schema pré-existente de public.orders:
--   id, tenant_id, budget_id, customer_id, status (public.order_status), delivery_date,
--   total_value, created_at, updated_at
--
-- Colunas adicionadas por esta migration:
--   order_code, employee_id, sale_id, discount_mode, discount_value, discount_percent,
--   payment_method, installments, entry_value, notes, created_by
--
-- PADRÃO DE RLS DO PROJETO: tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())

-- =====================================================================
-- Extensão da tabela orders existente
-- =====================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_code       TEXT,
  ADD COLUMN IF NOT EXISTS employee_id      UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sale_id          UUID REFERENCES public.sales(id),
  ADD COLUMN IF NOT EXISTS discount_mode    TEXT,
  ADD COLUMN IF NOT EXISTS discount_value   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS payment_method   TEXT,
  ADD COLUMN IF NOT EXISTS installments     INT,
  ADD COLUMN IF NOT EXISTS entry_value      NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES auth.users(id);

-- Relaxar status: o schema original usa ENUM public.order_status ('PENDING' default).
-- Para o fluxo de Pedidos comerciais precisamos aceitar DRAFT | AWAITING_PAYMENT | SENT_TO_SALE | PAID | CANCELLED.
-- Convertemos a coluna para TEXT (preservando dados existentes) — compatível com enum via CAST para TEXT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status'
      AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.orders
      ALTER COLUMN status DROP DEFAULT,
      ALTER COLUMN status TYPE TEXT USING status::TEXT,
      ALTER COLUMN status SET DEFAULT 'DRAFT';
  END IF;
END $$;

-- Unique por (tenant_id, order_code) apenas quando order_code estiver preenchido
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_code_tenant_unique
  ON public.orders(tenant_id, order_code)
  WHERE order_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status
  ON public.orders(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_customer
  ON public.orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_sale
  ON public.orders(sale_id);

CREATE INDEX IF NOT EXISTS idx_orders_budget
  ON public.orders(budget_id);

-- =====================================================================
-- Tabela order_items
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id     UUID NULL REFERENCES public.products(id),
  service_id     UUID NULL REFERENCES public.services(id),
  quantity       NUMERIC(14,3) NOT NULL,
  unit_price     NUMERIC(14,2) NOT NULL,
  total_price    NUMERIC(14,2) NOT NULL,
  manual_description TEXT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_items_product_or_service CHECK (
    (product_id IS NOT NULL) OR (service_id IS NOT NULL) OR (manual_description IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON public.order_items(product_id)
  WHERE product_id IS NOT NULL;

-- =====================================================================
-- Tabela order_purchase_tracking (checkbox "Comprado" por produto)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.order_purchase_tracking (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_purchased   BOOLEAN NOT NULL DEFAULT false,
  purchased_at   TIMESTAMPTZ NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_purchase_tracking_unique UNIQUE (tenant_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_purchase_tracking_tenant
  ON public.order_purchase_tracking(tenant_id);

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.orders                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_purchase_tracking  ENABLE ROW LEVEL SECURITY;

-- orders
DROP POLICY IF EXISTS "orders_tenant_select" ON public.orders;
CREATE POLICY "orders_tenant_select" ON public.orders FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "orders_tenant_insert" ON public.orders;
CREATE POLICY "orders_tenant_insert" ON public.orders FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "orders_tenant_update" ON public.orders;
CREATE POLICY "orders_tenant_update" ON public.orders FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "orders_tenant_delete" ON public.orders;
CREATE POLICY "orders_tenant_delete" ON public.orders FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- order_items (via order.tenant_id)
DROP POLICY IF EXISTS "order_items_tenant_select" ON public.order_items;
CREATE POLICY "order_items_tenant_select" ON public.order_items FOR SELECT
  USING (order_id IN (
    SELECT id FROM public.orders
    WHERE tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "order_items_tenant_insert" ON public.order_items;
CREATE POLICY "order_items_tenant_insert" ON public.order_items FOR INSERT
  WITH CHECK (order_id IN (
    SELECT id FROM public.orders
    WHERE tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "order_items_tenant_update" ON public.order_items;
CREATE POLICY "order_items_tenant_update" ON public.order_items FOR UPDATE
  USING (order_id IN (
    SELECT id FROM public.orders
    WHERE tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "order_items_tenant_delete" ON public.order_items;
CREATE POLICY "order_items_tenant_delete" ON public.order_items FOR DELETE
  USING (order_id IN (
    SELECT id FROM public.orders
    WHERE tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  ));

-- order_purchase_tracking
DROP POLICY IF EXISTS "order_purchase_tracking_tenant_select" ON public.order_purchase_tracking;
CREATE POLICY "order_purchase_tracking_tenant_select" ON public.order_purchase_tracking FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "order_purchase_tracking_tenant_insert" ON public.order_purchase_tracking;
CREATE POLICY "order_purchase_tracking_tenant_insert" ON public.order_purchase_tracking FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "order_purchase_tracking_tenant_update" ON public.order_purchase_tracking;
CREATE POLICY "order_purchase_tracking_tenant_update" ON public.order_purchase_tracking FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "order_purchase_tracking_tenant_delete" ON public.order_purchase_tracking;
CREATE POLICY "order_purchase_tracking_tenant_delete" ON public.order_purchase_tracking FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- =====================================================================
-- Comentários
-- =====================================================================
COMMENT ON COLUMN public.orders.order_code IS
  'Código legível PED-XXXXXX (derivado do id). Unique por tenant.';

COMMENT ON COLUMN public.orders.sale_id IS
  'Venda resultante quando o pedido é enviado para vendas. Quando sale.status=PAID, pedido some do frontend de /pedidos.';

COMMENT ON TABLE public.order_items IS
  'Itens de pedidos. Aceita produto OU serviço OU descrição manual.';

COMMENT ON TABLE public.order_purchase_tracking IS
  'Checkbox "Comprado" por produto+tenant para lista compilada de pedidos abertos.';
