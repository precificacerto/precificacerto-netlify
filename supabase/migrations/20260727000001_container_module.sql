-- MÓDULO CONTÊINER E TAG (Relatório de Correções 24/07/2026 — Parte D)
--
-- Especificação funcional para operações com carregamento físico limitado e
-- distribuição por rota (caminhões, veículos ou pontos de venda com estoque
-- próprio). Modelo OPCIONAL e configurável por funcionário (flag), aditivo — não
-- altera o fluxo comercial de quem não usa (venda debitando do estoque geral).
--
-- Entidades (§12.1): Contêiner (persistente) → Tags (ciclos) → Capturas (imutáveis)
--   → Captura_Item / Captura_Origem. Vínculo Funcionário↔Contêiner flexível (N:N,
--   com no máximo 1 vínculo ATIVO por funcionário). Colunas novas (§12.2) em
--   budgets/orders/sales. Auditoria de fechamento por produto (§8) em
--   tag_reconciliations.
--
-- Multi-tenant: toda tabela tem tenant_id + RLS (tenant_id = get_auth_tenant_id()),
-- padrão do projeto.

-- ─────────────────────────────── CONTÊINER ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.containers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           text NOT NULL,
  general_status text NOT NULL DEFAULT 'ACTIVE'
                   CHECK (general_status IN ('ACTIVE', 'INACTIVE')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_containers_tenant ON public.containers (tenant_id);

-- ───────────────────────────── TAG (ciclos) ─────────────────────────────
-- É a Tag — não o Contêiner — que carrega o status Aberta/Fechada/Finalizada.
CREATE TABLE IF NOT EXISTS public.container_tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  container_id    uuid NOT NULL REFERENCES public.containers(id) ON DELETE CASCADE,
  identifier      integer NOT NULL,                 -- número sequencial exibido ("Tag #14")
  status          text NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN', 'CLOSED', 'FINALIZED')),
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  finalized_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (container_id, identifier)
);
CREATE INDEX IF NOT EXISTS idx_container_tags_tenant ON public.container_tags (tenant_id);
CREATE INDEX IF NOT EXISTS idx_container_tags_container ON public.container_tags (container_id);
-- Trava sequencial (§6.3): no máximo UMA Tag não-finalizada por Contêiner. Uma nova
-- Tag só nasce depois que a anterior está FINALIZED.
CREATE UNIQUE INDEX IF NOT EXISTS uq_container_active_tag
  ON public.container_tags (container_id)
  WHERE status <> 'FINALIZED';

-- ─────────────────────────────── CAPTURA ────────────────────────────────
-- Agrupamento imutável de orçamentos/pedidos que alimenta a Tag aberta.
CREATE TABLE IF NOT EXISTS public.captures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES public.container_tags(id) ON DELETE CASCADE,
  code         text NOT NULL,                       -- 'CAP-0001' (manual) | 'ENV-0001' (envio automático)
  origin_type  text NOT NULL
                 CHECK (origin_type IN ('BUDGET', 'ORDER', 'AUTO_TRANSFER')),
  status       text NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'DELETED')),
  notes        text,                                -- lista de clientes envolvidos (§3.3)
  created_by   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_captures_tenant ON public.captures (tenant_id);
CREATE INDEX IF NOT EXISTS idx_captures_tag ON public.captures (tag_id);

-- ───────────────────────────── CAPTURA_ITEM ─────────────────────────────
-- Produtos agrupados (por código+nome = soma) dentro de cada captura.
CREATE TABLE IF NOT EXISTS public.capture_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capture_id   uuid NOT NULL REFERENCES public.captures(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity     numeric(14,4) NOT NULL DEFAULT 0,
  unit_value   numeric(14,4) NOT NULL DEFAULT 0,    -- herdado do orçamento/pedido de origem
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_capture_items_tenant ON public.capture_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_capture_items_capture ON public.capture_items (capture_id);

-- ──────────────────────────── CAPTURA_ORIGEM ────────────────────────────
-- Ligação N:N: uma captura pode agrupar vários orçamentos e/ou pedidos.
CREATE TABLE IF NOT EXISTS public.capture_origins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capture_id  uuid NOT NULL REFERENCES public.captures(id) ON DELETE CASCADE,
  budget_id   uuid REFERENCES public.budgets(id) ON DELETE CASCADE,
  order_id    uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (budget_id IS NOT NULL OR order_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_capture_origins_tenant ON public.capture_origins (tenant_id);
CREATE INDEX IF NOT EXISTS idx_capture_origins_capture ON public.capture_origins (capture_id);

-- ───────────────────────── FUNCIONÁRIO_CONTÊINER ─────────────────────────
-- Vínculo flexível. Cardinalidade (revisão 27/07): 1 Contêiner : N funcionários,
-- com no máximo 1 vínculo ATIVO por funcionário (constraint parcial abaixo).
CREATE TABLE IF NOT EXISTS public.employee_containers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  container_id  uuid NOT NULL REFERENCES public.containers(id) ON DELETE CASCADE,
  is_active     boolean NOT NULL DEFAULT true,       -- flag "Vendas regidas por Contêiner"
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_containers_tenant ON public.employee_containers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_containers_container ON public.employee_containers (container_id);
-- No máximo UM vínculo ativo por funcionário (um funcionário opera 1 Contêiner por vez).
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_active_container
  ON public.employee_containers (employee_id)
  WHERE is_active = true;

-- ─────────────────── TAG_RECONCILIATIONS (fechamento §8) ──────────────────
-- Auditoria de retorno por produto no fechamento da Tag: Carregado / Vendido /
-- Saldo / Avariado / Faltante / Saldo corrigido + destino (devolver x enviar).
CREATE TABLE IF NOT EXISTS public.tag_reconciliations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tag_id           uuid NOT NULL REFERENCES public.container_tags(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES public.products(id) ON DELETE SET NULL,
  loaded_qty       numeric(14,4) NOT NULL DEFAULT 0,   -- Carregado (Σ capturas)
  sold_qty         numeric(14,4) NOT NULL DEFAULT 0,   -- Vendido (Σ vendas)
  balance_qty      numeric(14,4) NOT NULL DEFAULT 0,   -- Saldo = Carregado − Vendido
  damaged_qty      numeric(14,4) NOT NULL DEFAULT 0,   -- Avariado (manual, valorizado a CUSTO)
  missing_qty      numeric(14,4) NOT NULL DEFAULT 0,   -- Faltante (manual)
  corrected_qty    numeric(14,4) NOT NULL DEFAULT 0,   -- Saldo corrigido = Saldo − Avariado − Faltante
  destination      text CHECK (destination IN ('RETURN_STOCK', 'SEND_NEXT_TAG')),
  destination_qty  numeric(14,4) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_tag_reconciliations_tenant ON public.tag_reconciliations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tag_reconciliations_tag ON public.tag_reconciliations (tag_id);

-- ─────────────── Colunas novas em entidades existentes (§12.2) ───────────────
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS capture_id     uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capture_status text NOT NULL DEFAULT 'SAVED'
                             CHECK (capture_status IN ('SAVED', 'CAPTURED'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS capture_id     uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capture_status text NOT NULL DEFAULT 'OPEN'
                             CHECK (capture_status IN ('OPEN', 'CAPTURED'));

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES public.container_tags(id) ON DELETE SET NULL;

-- ─────────────────────────────── RLS ────────────────────────────────────
ALTER TABLE public.containers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.container_tags        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captures              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_origins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_containers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_reconciliations   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "containers_policy" ON public.containers
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "container_tags_policy" ON public.container_tags
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "captures_policy" ON public.captures
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "capture_items_policy" ON public.capture_items
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "capture_origins_policy" ON public.capture_origins
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "employee_containers_policy" ON public.employee_containers
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY "tag_reconciliations_policy" ON public.tag_reconciliations
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());
