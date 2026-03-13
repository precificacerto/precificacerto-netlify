-- Trigger deve comparar role em minúsculas (enum user_role é lowercase)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  meta jsonb;
  v_invitation record;
  v_tenant_id uuid;
  v_role text;
BEGIN
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- Caso 1: usuário criado por admin/super_admin (invite ou novo admin da tenant)
  v_tenant_id := (meta->>'tenant_id')::uuid;
  IF v_tenant_id IS NOT NULL AND (meta->>'from_admin_invite' = 'true' OR meta->>'is_employee' = 'true') THEN
    v_role := lower(coalesce(nullif(trim(meta->>'role'), ''), 'user'));

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

    IF v_role = 'admin' THEN
      INSERT INTO public.tenant_owners (tenant_id, user_id)
      VALUES (v_tenant_id, new.id)
      ON CONFLICT (tenant_id) DO NOTHING;
    END IF;

    RETURN new;
  END IF;

  -- Caso 2: convite pendente
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

    IF v_invitation.role::text = 'admin' THEN
      INSERT INTO public.tenant_owners (tenant_id, user_id)
      VALUES (v_invitation.tenant_id, new.id)
      ON CONFLICT (tenant_id) DO NOTHING;
    END IF;

    UPDATE public.tenant_invitations
    SET accepted_at = now()
    WHERE id = v_invitation.id;

    RETURN new;
  END IF;

  -- Caso 3: signup (novo super_admin)
  INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
  VALUES (
    new.id,
    NULL,
    new.email,
    coalesce(meta->>'name', ''),
    meta->>'phone',
    meta->>'cpf',
    'super_admin'::public.user_role,
    true
  );

  RETURN new;
END;
$$;
