-- FEAT-SALES-NOTIFICATIONS (16/07/2026)
--
-- Feed de eventos de venda/pagamento para o painel super-admin. Toda venda
-- efetivada, tentativa, falha ou cancelamento vindo do Stripe gera um registro
-- aqui (além do e-mail para precificacerto@gmail.com).
--
-- Acesso: somente via service_role (endpoints /api/super-admin/*). RLS habilitado
-- SEM policies para anon/authenticated → negado por padrão; service_role ignora RLS.

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,                       -- SALE_SUCCESS | PAYMENT_FAILED | CHECKOUT_ABANDONED | SUBSCRIPTION_CANCELLED
  severity    text NOT NULL DEFAULT 'info',         -- success | error | warning | info
  title       text NOT NULL,
  message     text,
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  amount      numeric(12,2),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created
  ON public.admin_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications (created_at DESC)
  WHERE is_read = false;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
