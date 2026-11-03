
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_n      integer;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_familia IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_familia) THEN
    RAISE EXCEPTION 'familia fora da lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_definir_familia_da_materia_prima:' || p_tenant::text, 0));
  SELECT to_jsonb(m) INTO v_antes FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;
  IF v_antes IS NULL THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;

  -- as etapas sao desta familia e apontam motores do TIPO dela: trocar o tipo deixaria etapa apontando motor de outro tipo
  IF (v_antes ->> 'familia') IS DISTINCT FROM p_familia THEN
    SELECT count(*) INTO v_n FROM public.orcamentista_familia_etapa x WHERE x.materia_prima_id = p_materia_prima;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'a familia "%" tem % etapa(s) cadastrada(s): o tipo dela nao se troca com etapas', v_antes ->> 'nome', v_n USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  UPDATE public.orcamentista_materia_prima SET familia = p_familia, atualizado_por = p_por, atualizado_em = now()
   WHERE id = p_materia_prima AND tenant_id = p_tenant;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text,
          jsonb_build_object('orcamentista_materia_prima', v_antes),
          jsonb_build_object('orcamentista_materia_prima', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_materia_prima', v_depois);
END
