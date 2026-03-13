-- =============================================================================
-- Super_admin: criar tenant com admin (email/senha obrigatórios na aplicação)
-- =============================================================================

-- 1. Função: super_admin cria tenant + settings + expense_config.
--    Retorna tenant_id e dados do admin para a aplicação chamar auth.admin.createUser
--    com metadata: { tenant_id, from_admin_invite: true, role: 'ADMIN', name }.
--    A aplicação deve usar o email e a senha ao criar o usuário no Auth.
CREATE OR REPLACE FUNCTION public.create_tenant_with_admin(
  p_name text,
  p_admin_email text,
  p_admin_name text DEFAULT NULL,
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
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas super_admin pode criar tenants';
  END IF;

  INSERT INTO public.tenants (
    name, cnpj_cpf, segment, email, phone,
    cep, street, number, complement, neighborhood, city, state_code
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
    p_state_code
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

COMMENT ON FUNCTION public.create_tenant_with_admin IS 'Super_admin cria tenant e retorna tenant_id + admin_email/admin_name. Aplicação deve criar usuário em auth.admin.createUser com email, senha e raw_user_meta_data: { tenant_id, from_admin_invite: true, role: ''ADMIN'', name }. Apenas 3 roles: SUPER_ADMIN, ADMIN, USER.';

-- 2. Trigger: ao criar usuário com from_admin_invite e role ADMIN, registrar em tenant_owners
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  new_tenant_id uuid;
  meta jsonb;
  v_invitation record;
  v_tenant_id uuid;
  v_role text;
BEGIN
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- Caso 1: Usuário criado pelo admin/super_admin para um funcionário ou admin da tenant
  v_tenant_id := (meta->>'tenant_id')::uuid;
  IF v_tenant_id IS NOT NULL AND (meta->>'from_admin_invite' = 'true' OR meta->>'is_employee' = 'true') THEN
    v_role := coalesce(nullif(meta->>'role', ''), 'USER');

    INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
    VALUES (
      new.id,
      v_tenant_id,
      new.email,
      coalesce(meta->>'name', ''),
      meta->>'phone',
      meta->>'cpf',
      v_role::public.user_role,
      false
    );

    IF v_role = 'ADMIN' THEN
      INSERT INTO public.tenant_owners (tenant_id, user_id)
      VALUES (v_tenant_id, new.id)
      ON CONFLICT (tenant_id) DO NOTHING;
    END IF;

    RETURN new;
  END IF;

  -- Caso 2: Convite pendente (usuário aceitou convite)
  SELECT * INTO v_invitation
  FROM public.tenant_invitations
  WHERE email = lower(trim(new.email))
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation IS NOT NULL THEN
    INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
    VALUES (
      new.id,
      v_invitation.tenant_id,
      new.email,
      coalesce(meta->>'name', ''),
      meta->>'phone',
      meta->>'cpf',
      v_invitation.role,
      false
    );

    IF v_invitation.role = 'ADMIN' THEN
      INSERT INTO public.tenant_owners (tenant_id, user_id)
      VALUES (v_invitation.tenant_id, new.id)
      ON CONFLICT (tenant_id) DO NOTHING;
    END IF;

    UPDATE public.tenant_invitations
    SET accepted_at = now()
    WHERE id = v_invitation.id;

    RETURN new;
  END IF;

  -- Caso 3: Novo cadastro (signup) = cria tenant e super admin
  INSERT INTO public.tenants (
    name, cnpj_cpf, segment, email, phone,
    cep, street, number, complement, neighborhood, city, state_code
  ) VALUES (
    coalesce(meta->>'company_name', 'Minha Empresa'),
    meta->>'company_cnpj',
    meta->>'company_segment',
    meta->>'company_email',
    meta->>'company_phone',
    meta->>'company_cep',
    meta->>'company_street',
    meta->>'company_number',
    meta->>'company_complement',
    meta->>'company_neighborhood',
    meta->>'company_city',
    meta->>'company_state_code'
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
  VALUES (
    new.id,
    new_tenant_id,
    new.email,
    coalesce(meta->>'name', ''),
    meta->>'phone',
    meta->>'cpf',
    'SUPER_ADMIN',
    true
  );

  INSERT INTO public.tenant_owners (tenant_id, user_id)
  VALUES (new_tenant_id, new.id)
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO public.tenant_settings (tenant_id) VALUES (new_tenant_id);
  INSERT INTO public.tenant_expense_config (tenant_id) VALUES (new_tenant_id);

  RETURN new;
END;
$$;
