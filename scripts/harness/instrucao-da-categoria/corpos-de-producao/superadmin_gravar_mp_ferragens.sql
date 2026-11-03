CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_ferragens(p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_antes     jsonb;
  v_depois    jsonb;
  v_item      jsonb;
  v_pos       bigint;
  v_linha     jsonb;
  v_novo      jsonb;
  v_categoria text;
  v_fora      text;
  v_set       text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_lista IS NULL OR jsonb_typeof(p_lista) <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e
                 WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'referencia') IS DISTINCT FROM 'string'
                    OR btrim(e ->> 'referencia') = '') THEN
    RAISE EXCEPTION 'a lista de ferragens e uma lista de objetos com referencia preenchida' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT e ->> 'referencia') FROM jsonb_array_elements(p_lista) e) THEN
    RAISE EXCEPTION 'referencia repetida na lista: cada ferragem tem o seu codigo' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e WHERE e ? 'ordem') THEN
    RAISE EXCEPTION 'ordem vem da posicao na lista, nao do corpo' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(p_lista) e, jsonb_object_keys(e) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_mp_ferragem'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'categoria_chave', 'ordem'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nas ferragens: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_mp_ferragens:' || p_tenant::text || ':' || p_mp_categoria::text, 0));
  SELECT c.categoria_chave INTO v_categoria
    FROM public.orcamentista_mp_categoria c WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_categoria <> 'FERRAGENS' THEN
    RAISE EXCEPTION 'a categoria % nao e FERRAGENS: ferragem so pendura na categoria FERRAGENS', v_categoria USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ordem), '[]'::jsonb) INTO v_antes
    FROM (SELECT * FROM public.orcamentista_mp_ferragem x WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant FOR UPDATE) f;

  DELETE FROM public.orcamentista_mp_ferragem x
   WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant
     AND x.referencia <> ALL (ARRAY(SELECT e ->> 'referencia' FROM jsonb_array_elements(p_lista) e));

  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_mp_ferragem'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'categoria_chave', 'referencia');
  FOR v_item, v_pos IN SELECT e, o FROM jsonb_array_elements(p_lista) WITH ORDINALITY x(e, o) LOOP
    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_mp_ferragem x
     WHERE x.mp_categoria_id = p_mp_categoria AND x.referencia = v_item ->> 'referencia';
    v_novo := coalesce(v_linha, '{}'::jsonb) || v_item
              || jsonb_build_object('id', coalesce((v_linha ->> 'id')::uuid, gen_random_uuid()), 'tenant_id', p_tenant,
                                    'mp_categoria_id', p_mp_categoria, 'categoria_chave', 'FERRAGENS', 'ordem', v_pos);
    -- tipologia é NOT NULL: a recusa vem nomeada, não como violação de constraint
    IF jsonb_typeof(v_novo -> 'tipologia') IS DISTINCT FROM 'string' OR btrim(v_novo ->> 'tipologia') = '' THEN
      RAISE EXCEPTION 'ferragem % sem tipologia', v_item ->> 'referencia' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    EXECUTE format('INSERT INTO public.orcamentista_mp_ferragem SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_mp_ferragem, $1) ON CONFLICT (mp_categoria_id, referencia) DO UPDATE SET %s', v_set)
      USING v_novo;
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ordem), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_mp_ferragem f WHERE f.mp_categoria_id = p_mp_categoria AND f.tenant_id = p_tenant;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_ferragem', p_mp_categoria::text,
          jsonb_build_object('orcamentista_mp_ferragem', v_antes),
          jsonb_build_object('orcamentista_mp_ferragem', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_mp_ferragem', v_depois);
END
$function$
;

