-- Trigger e invite: apenas SUPER_ADMIN, ADMIN, USER

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

  v_tenant_id := (meta->>'tenant_id')::uuid;
  IF v_tenant_id IS NOT NULL AND (meta->>'from_admin_invite' = 'true' OR meta->>'is_employee' = 'true') THEN
    v_role := coalesce(nullif(meta->>'role', ''), 'USER');

    INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
    VALUES (new.id, v_tenant_id, new.email, coalesce(meta->>'name', ''), meta->>'phone', meta->>'cpf', v_role::public.user_role, false);

    IF v_role = 'ADMIN' THEN
      INSERT INTO public.tenant_owners (tenant_id, user_id) VALUES (v_tenant_id, new.id)
      ON CONFLICT (tenant_id) DO NOTHING;
    END IF;
    RETURN new;
  END IF;

  SELECT * INTO v_invitation FROM public.tenant_invitations
  WHERE email = lower(trim(new.email)) AND accepted_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF v_invitation IS NOT NULL THEN
    INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
    VALUES (new.id, v_invitation.tenant_id, new.email, coalesce(meta->>'name', ''), meta->>'phone', meta->>'cpf', v_invitation.role, false);

    IF v_invitation.role = 'ADMIN' THEN
      INSERT INTO public.tenant_owners (tenant_id, user_id) VALUES (v_invitation.tenant_id, new.id)
      ON CONFLICT (tenant_id) DO NOTHING;
    END IF;
    UPDATE public.tenant_invitations SET accepted_at = now() WHERE id = v_invitation.id;
    RETURN new;
  END IF;

  INSERT INTO public.tenants (name, cnpj_cpf, segment, email, phone, cep, street, number, complement, neighborhood, city, state_code)
  VALUES (
    coalesce(meta->>'company_name', 'Minha Empresa'), meta->>'company_cnpj', meta->>'company_segment',
    meta->>'company_email', meta->>'company_phone', meta->>'company_cep', meta->>'company_street', meta->>'company_number',
    meta->>'company_complement', meta->>'company_neighborhood', meta->>'company_city', meta->>'company_state_code'
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
  VALUES (new.id, new_tenant_id, new.email, coalesce(meta->>'name', ''), meta->>'phone', meta->>'cpf', 'SUPER_ADMIN', true);

  INSERT INTO public.tenant_owners (tenant_id, user_id) VALUES (new_tenant_id, new.id) ON CONFLICT (tenant_id) DO NOTHING;
  INSERT INTO public.tenant_settings (tenant_id) VALUES (new_tenant_id);
  INSERT INTO public.tenant_expense_config (tenant_id) VALUES (new_tenant_id);

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_user_to_tenant(p_email text, p_role user_role DEFAULT 'USER'::user_role)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_invite_id uuid;
BEGIN
  v_tenant_id := get_auth_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Voce precisa estar autenticado em um tenant'; END IF;
  IF NOT is_tenant_admin() THEN
    RAISE EXCEPTION 'Somente o administrador (ADMIN) da tenant pode convidar usuarios';
  END IF;
  IF p_role = 'SUPER_ADMIN' THEN RAISE EXCEPTION 'Super_admin nao pode ser criado via convite'; END IF;
  IF p_role NOT IN ('ADMIN', 'USER') THEN RAISE EXCEPTION 'Role deve ser ADMIN ou USER'; END IF;

  INSERT INTO public.tenant_invitations (tenant_id, email, role, invited_by)
  VALUES (v_tenant_id, lower(trim(p_email)), p_role, auth.uid())
  ON CONFLICT (tenant_id, email) DO UPDATE SET role = EXCLUDED.role, token = gen_random_uuid(), accepted_at = NULL, expires_at = now() + interval '7 days', invited_by = EXCLUDED.invited_by
  RETURNING id INTO v_invite_id;
  RETURN v_invite_id;
END;
$$;

COMMENT ON FUNCTION public.invite_user_to_tenant IS 'Apenas ADMIN da tenant convida USER ou ADMIN. Super_admin nao cadastra usuarios nas tenants; apenas cria o admin ao criar a tenant e controla os administradores.';
