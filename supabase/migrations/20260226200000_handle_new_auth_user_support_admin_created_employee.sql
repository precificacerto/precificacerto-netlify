-- Quando o admin cria um usuário para um funcionário (auth.admin.createUser com tenant_id + from_admin_invite),
-- o trigger não deve criar novo tenant nem marcar como super admin; deve apenas inserir em users no tenant existente.
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
BEGIN
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- Caso 1: Usuário criado pelo admin para um funcionário (metadata com tenant_id e from_admin_invite)
  v_tenant_id := (meta->>'tenant_id')::uuid;
  IF v_tenant_id IS NOT NULL AND (meta->>'from_admin_invite' = 'true' OR meta->>'is_employee' = 'true') THEN
    INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
    VALUES (
      new.id,
      v_tenant_id,
      new.email,
      coalesce(meta->>'name', ''),
      meta->>'phone',
      meta->>'cpf',
      coalesce(nullif(meta->>'role', ''), 'SELLER'),
      false
    );
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
    'ADMIN',
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
