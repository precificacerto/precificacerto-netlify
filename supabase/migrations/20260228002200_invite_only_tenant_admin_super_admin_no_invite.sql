-- Apenas admin da tenant (ADMIN) pode convidar usuários no tenant.
-- Super_admin não cadastra user nas tenants; só cria o admin ao criar a tenant e controla os administradores.
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

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Voce precisa estar autenticado em um tenant';
  END IF;

  IF NOT is_tenant_admin() THEN
    RAISE EXCEPTION 'Somente o administrador (ADMIN) da tenant pode convidar usuarios';
  END IF;

  IF p_role = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Super_admin nao pode ser criado via convite';
  END IF;

  IF p_role NOT IN ('ADMIN', 'USER') THEN
    RAISE EXCEPTION 'Role deve ser ADMIN ou USER';
  END IF;

  INSERT INTO public.tenant_invitations (tenant_id, email, role, invited_by)
  VALUES (v_tenant_id, lower(trim(p_email)), p_role, auth.uid())
  ON CONFLICT (tenant_id, email) DO UPDATE SET
    role = EXCLUDED.role,
    token = gen_random_uuid(),
    accepted_at = NULL,
    expires_at = now() + interval '7 days',
    invited_by = EXCLUDED.invited_by
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

COMMENT ON FUNCTION public.invite_user_to_tenant IS 'Apenas ADMIN da tenant convida USER ou ADMIN no proprio tenant. Super_admin nao cadastra usuarios nas tenants; apenas cria o admin ao criar a tenant e controla os administradores.';
