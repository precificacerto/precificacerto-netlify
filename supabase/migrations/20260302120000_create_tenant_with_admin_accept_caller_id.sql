-- =============================================================================
-- RPC create_tenant_with_admin: aceitar p_caller_user_id para chamadas via API
-- (service role não envia JWT do usuário, então is_super_admin() falha)
-- =============================================================================

DROP FUNCTION public.create_tenant_with_admin(text, text, text, text, text, text, text, text, text, text, text, text, text, character);

CREATE OR REPLACE FUNCTION public.create_tenant_with_admin(
  p_name text,
  p_admin_email text,
  p_admin_name text DEFAULT NULL,
  p_caller_user_id uuid DEFAULT NULL,
  p_cnpj_cpf text DEFAULT NULL,
  p_segment text DEFAULT NULL,
  p_company_email text DEFAULT NULL,
  p_company_phone text DEFAULT NULL,
  p_cep text DEFAULT NULL,
  p_street text DEFAULT NULL,
  p_number text DEFAULT NULL,
  p_complement text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state_code char(2) DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_ok boolean;
BEGIN
  IF p_caller_user_id IS NOT NULL THEN
    SELECT (role = 'SUPER_ADMIN' OR COALESCE(is_super_admin, false) = true)
    INTO v_caller_ok
    FROM public.users
    WHERE id = p_caller_user_id;
    IF NOT COALESCE(v_caller_ok, false) THEN
      RAISE EXCEPTION 'Apenas super_admin pode criar tenants';
    END IF;
  ELSE
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Apenas super_admin pode criar tenants';
    END IF;
  END IF;

  INSERT INTO public.tenants (
    name, cnpj_cpf, segment, email, phone,
    cep, street, number, complement, neighborhood, city, state_code,
    trial_ends_at, approved_by_super_admin
  ) VALUES (
    coalesce(trim(p_name), 'Nova Empresa'),
    nullif(trim(p_cnpj_cpf), ''),
    nullif(trim(p_segment), ''),
    nullif(trim(p_company_email), ''),
    nullif(trim(p_company_phone), ''),
    nullif(trim(p_cep), ''),
    nullif(trim(p_street), ''),
    nullif(trim(p_number), ''),
    nullif(trim(p_complement), ''),
    nullif(trim(p_neighborhood), ''),
    nullif(trim(p_city), ''),
    p_state_code,
    now() + interval '14 days',
    true
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

COMMENT ON FUNCTION public.create_tenant_with_admin IS 'Super_admin cria tenant. Se p_caller_user_id for passado (API com service role), valida na tabela users; senão usa is_super_admin() (JWT).';
