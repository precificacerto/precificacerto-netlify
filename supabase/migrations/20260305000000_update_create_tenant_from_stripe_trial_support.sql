-- =============================================================================
-- Atualiza create_tenant_from_stripe para suportar trial (free trial 7 dias)
-- Novos parâmetros: p_plan_status e p_trial_ends_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_tenant_from_stripe(
  p_name text,
  p_admin_email text,
  p_admin_name text DEFAULT NULL,
  p_stripe_customer_id text DEFAULT NULL,
  p_stripe_subscription_id text DEFAULT NULL,
  p_revenue_tier text DEFAULT NULL,
  p_plan_slug text DEFAULT NULL,
  p_plan_status text DEFAULT 'ACTIVE',
  p_trial_ends_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_status public.plan_status;
BEGIN
  v_status := coalesce(p_plan_status, 'ACTIVE')::public.plan_status;

  INSERT INTO public.tenants (
    name, email, plan_status, approved_by_super_admin,
    stripe_customer_id, stripe_subscription_id,
    revenue_tier, plan_slug,
    plan_ends_at, trial_ends_at
  ) VALUES (
    coalesce(nullif(trim(p_admin_name), ''), 'Empresa de ' || p_admin_email),
    lower(trim(p_admin_email)),
    v_status,
    true,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_revenue_tier,
    p_plan_slug,
    CASE WHEN v_status = 'ACTIVE' THEN now() + interval '1 month' ELSE NULL END,
    p_trial_ends_at
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_settings (tenant_id) VALUES (v_tenant_id);
  INSERT INTO public.tenant_expense_config (tenant_id) VALUES (v_tenant_id);

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'admin_email', lower(trim(p_admin_email)),
    'admin_name', coalesce(nullif(trim(p_admin_name), ''), lower(trim(p_admin_email)))
  );
END;
$$;
