-- ============================================================================================
-- PASSO 1 de 3 — FECHAR AS POLÍTICAS PERMISSIVAS
--
-- Comando do PO de 05/10/2026, §2. Autorização explícita e pontual para mexer no banco.
--
-- ── O QUE ESTAS POLÍTICAS DEIXAVAM ACONTECER ────────────────────────────────────────────────
-- `anon` é a chave PÚBLICA que viaja dentro do bundle JavaScript: qualquer um a copia do
-- DevTools e fala direto com o PostgREST. Medido em produção em 05/10/2026 — `anon` podia LER
-- e ESCREVER nas 79 tabelas de `public`, e o caminho eram políticas com `true`:
--
--   schedule_employees   SELECT true · DELETE true · INSERT WITH CHECK true
--   service_items        SELECT/UPDATE/DELETE true · INSERT WITH CHECK true
--   completed_services   SELECT true
--   tenant_billing       UPDATE true · INSERT WITH CHECK true
--
-- Mais 9 políticas de UPDATE SEM `WITH CHECK`. Um `UPDATE` cujo `USING` passa mas que não tem
-- `WITH CHECK` permite `SET tenant_id = <outro>`: o dado de um cliente sai da linha dele e
-- entra na de outro, e a política não tem como recusar porque ela só examina a linha ANTES.
--
-- ── A FORMA DA CORREÇÃO, e por que ela não tira acesso de ninguém ───────────────────────────
-- Cada `USING` abaixo é o ORIGINAL, medido em `pg_policies` antes de editar; o `WITH CHECK`
-- é IDÊNTICO ao `USING`. Quem podia editar continua podendo — o que deixa de ser possível é
-- gravar a linha com `tenant_id` de outro.
--
-- `tenant_billing_select_own` NÃO É TOCADA. Ela é
-- `(tenant_id = get_my_tenant_id()) OR is_super_admin()` — mais larga do que o padrão desta
-- migração, de propósito: recriá-la no molde das outras tiraria o super admin da tela de
-- cobrança. As DUAS de escrita saem e não são recriadas, porque quem grava cobrança é o
-- service_role, que ignora RLS.
--
-- ── DEPENDÊNCIAS CONFERIDAS ANTES, conforme `migration-delivery.md` ─────────────────────────
--   get_auth_tenant_id()  SECURITY DEFINER  ✓ existe
--   get_my_tenant_id()    SECURITY DEFINER  ✓ existe
--   is_super_admin()      SECURITY DEFINER  ✓ existe
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────────────────────
-- ANTES (esperado: 7, 3, 9):
--   select count(*) from pg_policies where schemaname='public' and qual='true'
--    and tablename in ('schedule_employees','service_items','completed_services','tenant_billing');
--   select count(*) from pg_policies where schemaname='public' and with_check='true'
--    and tablename in ('schedule_employees','service_items','completed_services','tenant_billing');
--   select count(*) from pg_policies where schemaname='public' and cmd='UPDATE' and with_check is null
--    and tablename in ('card_anticipations','customer_attachments','order_items',
--                      'order_purchase_tracking','orders','pending_receivables','services',
--                      'tax_rates_periods');
-- DEPOIS: os três têm de devolver 0.
--
-- O `BEGIN`/`COMMIT` é DO ARQUIVO, e quem aplica decide se tira: o conector do Supabase abre
-- transação própria e avisa `there is already a transaction in progress`; o SQL Editor e o psql
-- aceitam como está. Sem eles, uma falha no meio deixaria metade das políticas trocada.
--
-- E o `NOTIFY` do fim é passo SEPARADO — ele não vem com o COMMIT.
-- ============================================================================================

BEGIN;

-- ── schedule_employees ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS schedule_employees_tenant_select ON public.schedule_employees;
DROP POLICY IF EXISTS schedule_employees_tenant_insert ON public.schedule_employees;
DROP POLICY IF EXISTS schedule_employees_tenant_delete ON public.schedule_employees;
CREATE POLICY schedule_employees_tenant_select ON public.schedule_employees
  FOR SELECT USING (tenant_id = (SELECT public.get_auth_tenant_id()));
CREATE POLICY schedule_employees_tenant_insert ON public.schedule_employees
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));
CREATE POLICY schedule_employees_tenant_delete ON public.schedule_employees
  FOR DELETE USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- ── service_items ───────────────────────────────────────────────────────────────────────────
-- A tabela não tem `tenant_id`: o vínculo é pelo serviço-pai, e por isso as quatro políticas
-- usam EXISTS contra `services`.
DROP POLICY IF EXISTS service_items_select ON public.service_items;
DROP POLICY IF EXISTS service_items_insert ON public.service_items;
DROP POLICY IF EXISTS service_items_update ON public.service_items;
DROP POLICY IF EXISTS service_items_delete ON public.service_items;
CREATE POLICY service_items_select ON public.service_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.services s
    WHERE s.id = service_items.service_id
      AND s.tenant_id = (SELECT public.get_auth_tenant_id())));
CREATE POLICY service_items_insert ON public.service_items
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.services s
    WHERE s.id = service_items.service_id
      AND s.tenant_id = (SELECT public.get_auth_tenant_id())));
CREATE POLICY service_items_update ON public.service_items
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.services s
    WHERE s.id = service_items.service_id
      AND s.tenant_id = (SELECT public.get_auth_tenant_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.services s
    WHERE s.id = service_items.service_id
      AND s.tenant_id = (SELECT public.get_auth_tenant_id())));
CREATE POLICY service_items_delete ON public.service_items
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.services s
    WHERE s.id = service_items.service_id
      AND s.tenant_id = (SELECT public.get_auth_tenant_id())));

-- ── completed_services ──────────────────────────────────────────────────────────────────────
-- `completed_services_insert` NÃO é tocada: ela já tem o WITH CHECK por tenant.
DROP POLICY IF EXISTS completed_services_select ON public.completed_services;
DROP POLICY IF EXISTS completed_services_update ON public.completed_services;
CREATE POLICY completed_services_select ON public.completed_services
  FOR SELECT USING (tenant_id = (SELECT public.get_auth_tenant_id()));
CREATE POLICY completed_services_update ON public.completed_services
  FOR UPDATE USING (tenant_id = (SELECT public.get_auth_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

-- ── tenant_billing: só as DUAS de escrita saem. Ver o cabeçalho. ────────────────────────────
DROP POLICY IF EXISTS tenant_billing_insert_service ON public.tenant_billing;
DROP POLICY IF EXISTS tenant_billing_update_service ON public.tenant_billing;

-- ── As 9 de UPDATE sem WITH CHECK ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS card_anticipations_update_tenant ON public.card_anticipations;
CREATE POLICY card_anticipations_update_tenant ON public.card_anticipations
  FOR UPDATE USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS customer_attachments_tenant_update ON public.customer_attachments;
CREATE POLICY customer_attachments_tenant_update ON public.customer_attachments
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

DROP POLICY IF EXISTS customer_attachments_update_tenant ON public.customer_attachments;
CREATE POLICY customer_attachments_update_tenant ON public.customer_attachments
  FOR UPDATE USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS order_items_tenant_update ON public.order_items;
CREATE POLICY order_items_tenant_update ON public.order_items
  FOR UPDATE USING (order_id IN (SELECT o.id FROM public.orders o
    WHERE o.tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())))
  WITH CHECK (order_id IN (SELECT o.id FROM public.orders o
    WHERE o.tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())));

DROP POLICY IF EXISTS order_purchase_tracking_tenant_update ON public.order_purchase_tracking;
CREATE POLICY order_purchase_tracking_tenant_update ON public.order_purchase_tracking
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

DROP POLICY IF EXISTS orders_tenant_update ON public.orders;
CREATE POLICY orders_tenant_update ON public.orders
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

DROP POLICY IF EXISTS tenant_update_pending_receivables ON public.pending_receivables;
CREATE POLICY tenant_update_pending_receivables ON public.pending_receivables
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

DROP POLICY IF EXISTS services_update ON public.services;
CREATE POLICY services_update ON public.services
  FOR UPDATE USING (tenant_id = (SELECT public.get_auth_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));

DROP POLICY IF EXISTS tax_rates_periods_tenant_update ON public.tax_rates_periods;
CREATE POLICY tax_rates_periods_tenant_update ON public.tax_rates_periods
  FOR UPDATE USING (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
