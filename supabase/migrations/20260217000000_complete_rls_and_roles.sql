-- =============================================================================
-- MIGRATION: Complete RLS, OWNER Role & Team Management
-- Date: 2026-02-17
-- Description:
--   1. Adds OWNER role to user_role enum
--   2. Updates handle_new_auth_user() to assign OWNER on signup
--   3. Enables RLS on ALL remaining tables
--   4. Creates policies for ALL tables (including those enabled without policies)
--   5. Creates invite_team_member() function
--   6. Creates update_user_permissions() function
--   7. Seeds default permissions catalog
-- =============================================================================

-- =============================================================================
-- 1. ADD OWNER ROLE
-- =============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'OWNER';

-- =============================================================================
-- 2. UPDATE TRIGGER: New users get OWNER role (they are tenant creators)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  -- 1. Create a new Tenant for the user
  INSERT INTO public.tenants (name)
  VALUES (coalesce(new.raw_user_meta_data->>'company_name', 'Minha Empresa'))
  RETURNING id INTO new_tenant_id;

  -- 2. Create user record with OWNER role
  INSERT INTO public.users (id, tenant_id, email, role)
  VALUES (new.id, new_tenant_id, new.email, 'OWNER');

  -- 3. Create default tenant_settings
  INSERT INTO public.tenant_settings (tenant_id)
  VALUES (new_tenant_id);

  -- 4. Create default expense config
  INSERT INTO public.tenant_expense_config (tenant_id)
  VALUES (new_tenant_id);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. SEED DEFAULT PERMISSIONS CATALOG
-- =============================================================================

INSERT INTO public.permissions (code, description, module) VALUES
  -- Dashboard
  ('VIEW_DASHBOARD', 'Visualizar dashboard e KPIs', 'DASHBOARD'),
  -- Sales
  ('VIEW_SALES', 'Visualizar vendas e pipeline', 'SALES'),
  ('MANAGE_SALES', 'Criar/editar/excluir vendas', 'SALES'),
  ('VIEW_BUDGETS', 'Visualizar orçamentos', 'SALES'),
  ('MANAGE_BUDGETS', 'Criar/editar/excluir orçamentos', 'SALES'),
  ('VIEW_CUSTOMERS', 'Visualizar clientes', 'SALES'),
  ('MANAGE_CUSTOMERS', 'Criar/editar/excluir clientes', 'SALES'),
  -- Products
  ('VIEW_PRODUCTS', 'Visualizar produtos e itens', 'PRODUCTS'),
  ('MANAGE_PRODUCTS', 'Criar/editar/excluir produtos', 'PRODUCTS'),
  ('VIEW_STOCK', 'Visualizar estoque', 'PRODUCTS'),
  ('MANAGE_STOCK', 'Gerenciar movimentações de estoque', 'PRODUCTS'),
  -- Financial
  ('VIEW_FINANCIAL', 'Visualizar caixa, DRE e fluxo', 'FINANCIAL'),
  ('MANAGE_FINANCIAL', 'Criar/editar lançamentos financeiros', 'FINANCIAL'),
  -- Settings
  ('VIEW_SETTINGS', 'Visualizar configurações', 'SETTINGS'),
  ('MANAGE_SETTINGS', 'Alterar configurações da empresa', 'SETTINGS'),
  -- Users
  ('VIEW_USERS', 'Visualizar equipe', 'USERS'),
  ('MANAGE_USERS', 'Convidar/editar/remover membros da equipe', 'USERS')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 4. ENABLE RLS ON ALL REMAINING TABLES
-- =============================================================================

-- Tables that already have RLS enabled (from previous migrations):
--   tenants, users, items, products, stock, customers, budgets, orders, sales,
--   cashier_months, tenant_expense_config, item_tax_credits, labor_costs,
--   pricing_calculations, pricing_history, whatsapp_config, whatsapp_dispatches,
--   employees, employee_schedules,
--   ncm_codes, nbs_codes, brazilian_states, icms_interstate_rates,
--   simples_nacional_brackets, lucro_presumido_rates, lucro_real_params

-- Enable RLS on remaining tables
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_price_table_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_yearly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_update_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. CREATE POLICIES FOR TABLES WITH tenant_id (direct tenant scope)
-- =============================================================================

-- Helper: check if user is OWNER or ADMIN of their tenant
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role IN ('OWNER', 'ADMIN')
  );
$$;

-- ── tenant_settings ──
CREATE POLICY "tenant_settings_all" ON public.tenant_settings
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── payment_methods ──
CREATE POLICY "payment_methods_all" ON public.payment_methods
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── stock (RLS was enabled but no policy) ──
CREATE POLICY "stock_all" ON public.stock
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── orders (RLS was enabled but no policy) ──
CREATE POLICY "orders_all" ON public.orders
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── sales (RLS was enabled but no policy) ──
CREATE POLICY "sales_all" ON public.sales
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── cashier_months (RLS was enabled but no policy) ──
CREATE POLICY "cashier_months_all" ON public.cashier_months
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── cashier_categories ──
CREATE POLICY "cashier_categories_all" ON public.cashier_categories
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── cash_entries ──
CREATE POLICY "cash_entries_all" ON public.cash_entries
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── dre_yearly ──
CREATE POLICY "dre_yearly_all" ON public.dre_yearly
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── calendar_events ──
CREATE POLICY "calendar_events_all" ON public.calendar_events
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── report_snapshots ──
CREATE POLICY "report_snapshots_all" ON public.report_snapshots
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── message_templates ──
CREATE POLICY "message_templates_all" ON public.message_templates
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── automation_rules ──
CREATE POLICY "automation_rules_all" ON public.automation_rules
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- ── ai_agent_config ──
CREATE POLICY "ai_agent_config_all" ON public.ai_agent_config
  FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- =============================================================================
-- 6. CREATE POLICIES FOR CHILD TABLES (via JOIN with parent)
-- =============================================================================

-- ── product_items (via products.tenant_id) ──
CREATE POLICY "product_items_all" ON public.product_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_items.product_id
      AND p.tenant_id = public.get_auth_tenant_id()
    )
  );

-- ── budget_items (via budgets.tenant_id) ──
CREATE POLICY "budget_items_all" ON public.budget_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.budgets b
      WHERE b.id = budget_items.budget_id
      AND b.tenant_id = public.get_auth_tenant_id()
    )
  );

-- ── stock_movements (via stock.tenant_id) ──
CREATE POLICY "stock_movements_all" ON public.stock_movements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.stock s
      WHERE s.id = stock_movements.stock_id
      AND s.tenant_id = public.get_auth_tenant_id()
    )
  );

-- ── allocations (via orders.tenant_id) ──
CREATE POLICY "allocations_all" ON public.allocations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = allocations.order_id
      AND o.tenant_id = public.get_auth_tenant_id()
    )
  );

-- ── automation_logs (via automation_rules.tenant_id) ──
CREATE POLICY "automation_logs_all" ON public.automation_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.automation_rules ar
      WHERE ar.id = automation_logs.rule_id
      AND ar.tenant_id = public.get_auth_tenant_id()
    )
  );

-- =============================================================================
-- 7. CREATE POLICIES FOR USER-SCOPED TABLES
-- =============================================================================

-- ── permissions (catalog — public read for all authenticated users) ──
CREATE POLICY "permissions_read" ON public.permissions
  FOR SELECT USING (true);

-- ── user_permissions ──
-- Users can view their own permissions; OWNER/ADMIN can view/manage all in tenant
CREATE POLICY "user_permissions_select" ON public.user_permissions
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_permissions.user_id
      AND u.tenant_id = public.get_auth_tenant_id()
    )
  );

CREATE POLICY "user_permissions_insert" ON public.user_permissions
  FOR INSERT WITH CHECK (
    public.is_tenant_admin()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_permissions.user_id
      AND u.tenant_id = public.get_auth_tenant_id()
    )
  );

CREATE POLICY "user_permissions_delete" ON public.user_permissions
  FOR DELETE USING (
    public.is_tenant_admin()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_permissions.user_id
      AND u.tenant_id = public.get_auth_tenant_id()
    )
  );

-- ── user_price_table_access ──
CREATE POLICY "user_pta_select" ON public.user_price_table_access
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_price_table_access.user_id
      AND u.tenant_id = public.get_auth_tenant_id()
    )
  );

CREATE POLICY "user_pta_manage" ON public.user_price_table_access
  FOR INSERT WITH CHECK (
    public.is_tenant_admin()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_price_table_access.user_id
      AND u.tenant_id = public.get_auth_tenant_id()
    )
  );

CREATE POLICY "user_pta_delete" ON public.user_price_table_access
  FOR DELETE USING (
    public.is_tenant_admin()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_price_table_access.user_id
      AND u.tenant_id = public.get_auth_tenant_id()
    )
  );

-- ── user_sessions ──
CREATE POLICY "user_sessions_select" ON public.user_sessions
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      public.is_tenant_admin()
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = user_sessions.user_id
        AND u.tenant_id = public.get_auth_tenant_id()
      )
    )
  );

CREATE POLICY "user_sessions_insert" ON public.user_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── users: allow OWNER/ADMIN to update users in same tenant ──
CREATE POLICY "Admin can update users in tenant" ON public.users
  FOR UPDATE USING (
    tenant_id = public.get_auth_tenant_id()
    AND (
      id = auth.uid()
      OR public.is_tenant_admin()
    )
  );

CREATE POLICY "Admin can insert users in tenant" ON public.users
  FOR INSERT WITH CHECK (
    tenant_id = public.get_auth_tenant_id()
    AND public.is_tenant_admin()
  );

-- =============================================================================
-- 8. GLOBAL/ADMIN TABLES
-- =============================================================================

-- ── n8n_sync_config (global, only service_role or admin) ──
CREATE POLICY "n8n_config_read" ON public.n8n_sync_config
  FOR SELECT USING (true);

-- ── tax_update_logs (global, read-only for all authenticated) ──
CREATE POLICY "tax_logs_read" ON public.tax_update_logs
  FOR SELECT USING (true);

-- =============================================================================
-- 9. TEAM MANAGEMENT FUNCTIONS
-- =============================================================================

-- 9.1 Invite a team member (only OWNER or ADMIN can call this)
-- Creates a Supabase Auth user and links to the same tenant
CREATE OR REPLACE FUNCTION public.invite_team_member(
  p_email text,
  p_password text,
  p_role public.user_role DEFAULT 'SELLER',
  p_name text DEFAULT NULL,
  p_permissions text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_tenant_id uuid;
  v_caller_role public.user_role;
  v_new_user_id uuid;
  v_perm_id uuid;
  v_perm_code text;
BEGIN
  -- 1. Verify caller is OWNER or ADMIN
  SELECT tenant_id, role INTO v_caller_tenant_id, v_caller_role
  FROM public.users
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only OWNER or ADMIN can invite team members';
  END IF;

  -- 2. Prevent inviting OWNER role
  IF p_role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot assign OWNER role to invited members';
  END IF;

  -- 3. Prevent non-OWNER from creating ADMIN
  IF p_role = 'ADMIN' AND v_caller_role != 'OWNER' THEN
    RAISE EXCEPTION 'Only OWNER can create ADMIN users';
  END IF;

  -- 4. Check if email already exists in the tenant
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE email = p_email AND tenant_id = v_caller_tenant_id
  ) THEN
    RAISE EXCEPTION 'A user with this email already exists in your organization';
  END IF;

  -- 5. Create auth user via Supabase Admin API (using auth.users directly)
  v_new_user_id := extensions.uuid_generate_v4();

  -- Insert into auth.users (Supabase internal)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    aud,
    role,
    created_at,
    updated_at
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('name', COALESCE(p_name, p_email), 'invited_by', auth.uid()::text),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  -- 6. Create public.users record linked to the SAME tenant
  INSERT INTO public.users (id, tenant_id, email, role)
  VALUES (v_new_user_id, v_caller_tenant_id, p_email, p_role);

  -- 7. Assign permissions if provided
  IF array_length(p_permissions, 1) > 0 THEN
    FOREACH v_perm_code IN ARRAY p_permissions LOOP
      SELECT id INTO v_perm_id FROM public.permissions WHERE code = v_perm_code;
      IF v_perm_id IS NOT NULL THEN
        INSERT INTO public.user_permissions (user_id, permission_id)
        VALUES (v_new_user_id, v_perm_id)
        ON CONFLICT (user_id, permission_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_new_user_id,
    'email', p_email,
    'role', p_role::text,
    'tenant_id', v_caller_tenant_id
  );
END;
$$;

-- 9.2 Update permissions for a team member
CREATE OR REPLACE FUNCTION public.update_user_permissions(
  p_target_user_id uuid,
  p_permissions text[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_tenant_id uuid;
  v_caller_role public.user_role;
  v_target_tenant_id uuid;
  v_target_role public.user_role;
  v_perm_id uuid;
  v_perm_code text;
BEGIN
  -- 1. Verify caller
  SELECT tenant_id, role INTO v_caller_tenant_id, v_caller_role
  FROM public.users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only OWNER or ADMIN can manage permissions';
  END IF;

  -- 2. Verify target is in same tenant
  SELECT tenant_id, role INTO v_target_tenant_id, v_target_role
  FROM public.users WHERE id = p_target_user_id;

  IF v_target_tenant_id != v_caller_tenant_id THEN
    RAISE EXCEPTION 'User not found in your organization';
  END IF;

  -- 3. Cannot modify OWNER permissions
  IF v_target_role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot modify OWNER permissions';
  END IF;

  -- 4. Only OWNER can modify ADMIN permissions
  IF v_target_role = 'ADMIN' AND v_caller_role != 'OWNER' THEN
    RAISE EXCEPTION 'Only OWNER can modify ADMIN permissions';
  END IF;

  -- 5. Remove all existing permissions for the target
  DELETE FROM public.user_permissions WHERE user_id = p_target_user_id;

  -- 6. Assign new permissions
  IF array_length(p_permissions, 1) > 0 THEN
    FOREACH v_perm_code IN ARRAY p_permissions LOOP
      SELECT id INTO v_perm_id FROM public.permissions WHERE code = v_perm_code;
      IF v_perm_id IS NOT NULL THEN
        INSERT INTO public.user_permissions (user_id, permission_id)
        VALUES (p_target_user_id, v_perm_id)
        ON CONFLICT (user_id, permission_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'permissions', p_permissions
  );
END;
$$;

-- 9.3 Update a team member's role
CREATE OR REPLACE FUNCTION public.update_team_member_role(
  p_target_user_id uuid,
  p_new_role public.user_role
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_tenant_id uuid;
  v_caller_role public.user_role;
  v_target_tenant_id uuid;
  v_target_role public.user_role;
BEGIN
  -- 1. Verify caller
  SELECT tenant_id, role INTO v_caller_tenant_id, v_caller_role
  FROM public.users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only OWNER or ADMIN can change roles';
  END IF;

  -- 2. Verify target
  SELECT tenant_id, role INTO v_target_tenant_id, v_target_role
  FROM public.users WHERE id = p_target_user_id;

  IF v_target_tenant_id != v_caller_tenant_id THEN
    RAISE EXCEPTION 'User not found in your organization';
  END IF;

  -- 3. Cannot change OWNER role
  IF v_target_role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot change the OWNER role';
  END IF;

  -- 4. Cannot assign OWNER role
  IF p_new_role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot assign OWNER role';
  END IF;

  -- 5. Only OWNER can promote to ADMIN
  IF p_new_role = 'ADMIN' AND v_caller_role != 'OWNER' THEN
    RAISE EXCEPTION 'Only OWNER can promote to ADMIN';
  END IF;

  -- 6. Update role
  UPDATE public.users
  SET role = p_new_role, updated_at = now()
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_role', p_new_role::text
  );
END;
$$;

-- 9.4 Deactivate a team member
CREATE OR REPLACE FUNCTION public.deactivate_team_member(
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_tenant_id uuid;
  v_caller_role public.user_role;
  v_target_tenant_id uuid;
  v_target_role public.user_role;
BEGIN
  -- 1. Verify caller
  SELECT tenant_id, role INTO v_caller_tenant_id, v_caller_role
  FROM public.users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'Only OWNER or ADMIN can deactivate members';
  END IF;

  -- 2. Verify target
  SELECT tenant_id, role INTO v_target_tenant_id, v_target_role
  FROM public.users WHERE id = p_target_user_id;

  IF v_target_tenant_id != v_caller_tenant_id THEN
    RAISE EXCEPTION 'User not found in your organization';
  END IF;

  -- 3. Cannot deactivate OWNER
  IF v_target_role = 'OWNER' THEN
    RAISE EXCEPTION 'Cannot deactivate the OWNER';
  END IF;

  -- 4. Deactivate
  UPDATE public.users
  SET is_active = false, updated_at = now()
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'is_active', false
  );
END;
$$;

-- =============================================================================
-- 10. HELPER VIEW: Get current user with permissions
-- =============================================================================

CREATE OR REPLACE VIEW public.my_profile AS
SELECT
  u.id,
  u.tenant_id,
  u.email,
  u.role,
  u.is_active,
  t.name AS tenant_name,
  t.plan_status,
  COALESCE(
    array_agg(p.code) FILTER (WHERE p.code IS NOT NULL),
    '{}'
  ) AS permissions
FROM public.users u
JOIN public.tenants t ON t.id = u.tenant_id
LEFT JOIN public.user_permissions up ON up.user_id = u.id
LEFT JOIN public.permissions p ON p.id = up.permission_id
WHERE u.id = auth.uid()
GROUP BY u.id, u.tenant_id, u.email, u.role, u.is_active, t.name, t.plan_status;

-- =============================================================================
-- 11. HELPER VIEW: Team members for admin
-- =============================================================================

CREATE OR REPLACE VIEW public.team_members AS
SELECT
  u.id,
  u.email,
  u.role,
  u.is_active,
  u.created_at,
  u.updated_at,
  COALESCE(
    array_agg(p.code) FILTER (WHERE p.code IS NOT NULL),
    '{}'
  ) AS permissions
FROM public.users u
LEFT JOIN public.user_permissions up ON up.user_id = u.id
LEFT JOIN public.permissions p ON p.id = up.permission_id
WHERE u.tenant_id = public.get_auth_tenant_id()
GROUP BY u.id, u.email, u.role, u.is_active, u.created_at, u.updated_at;

-- =============================================================================
-- 12. INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_entries_tenant ON public.cash_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_entries_type ON public.cash_entries(type);
CREATE INDEX IF NOT EXISTS idx_cashier_months_tenant ON public.cashier_months(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dre_yearly_tenant ON public.dre_yearly(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant ON public.calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON public.sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_tenant ON public.stock(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_budget ON public.budget_items(budget_id);
CREATE INDEX IF NOT EXISTS idx_product_items_product ON public.product_items(product_id);
CREATE INDEX IF NOT EXISTS idx_allocations_order ON public.allocations(order_id);
