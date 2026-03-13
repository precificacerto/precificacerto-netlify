-- =============================================================================
-- Super_admin não tem tenant: tenant_id NULL, acesso apenas ao painel
-- =============================================================================

-- 1. Remover super_admins de tenant_owners (se houver)
DELETE FROM public.tenant_owners
WHERE user_id IN (SELECT id FROM public.users WHERE is_super_admin = true);

-- 2. Super_admin deve ter tenant_id NULL
UPDATE public.users SET tenant_id = NULL WHERE is_super_admin = true;

-- 3. Permitir tenant_id NULL (apenas para super_admin)
ALTER TABLE public.users ALTER COLUMN tenant_id DROP NOT NULL;

-- 4. Constraint: super_admin só com tenant_id NULL; demais com tenant_id obrigatório
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_super_admin_no_tenant;

ALTER TABLE public.users
  ADD CONSTRAINT users_super_admin_no_tenant CHECK (
    (is_super_admin = true AND tenant_id IS NULL)
    OR
    (COALESCE(is_super_admin, false) = false AND tenant_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT users_super_admin_no_tenant ON public.users IS 'Super_admin não possui tenant (tenant_id NULL). Demais usuários devem ter tenant_id.';

-- 5. Trigger: Caso 3 (signup) cria apenas user super_admin, sem tenant
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

  -- Caso 3: Novo cadastro (signup) = apenas super_admin, SEM tenant
  INSERT INTO public.users (id, tenant_id, email, name, phone, cpf, role, is_super_admin)
  VALUES (
    new.id,
    NULL,
    new.email,
    coalesce(meta->>'name', ''),
    meta->>'phone',
    meta->>'cpf',
    'SUPER_ADMIN',
    true
  );

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user IS 'Caso 3 (signup): cria apenas user com tenant_id NULL e is_super_admin true. Super_admin não possui tenant.';
