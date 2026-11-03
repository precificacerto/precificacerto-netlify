CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_instalacao(p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_antes     jsonb;
  v_depois    jsonb;
  v_item      jsonb;
  v_linha     jsonb;
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
                 WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'produto') IS DISTINCT FROM 'string'
                    OR (e ? 'usa' AND jsonb_typeof(e -> 'usa') NOT IN ('boolean', 'null'))) THEN
    RAISE EXCEPTION 'a lista de instalacao e uma lista de objetos com produto, e usa true, false ou null' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT e ->> 'produto') FROM jsonb_array_elements(p_lista) e) THEN
    RAISE EXCEPTION 'produto repetido na lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(p_lista) e, jsonb_object_keys(e) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_mp_instalacao'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'categoria_chave'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) na instalacao: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_mp_instalacao:' || p_tenant::text || ':' || p_mp_categoria::text, 0));
  SELECT c.categoria_chave INTO v_categoria
    FROM public.orcamentista_mp_categoria c WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_categoria <> 'INSTALACAO' THEN
    RAISE EXCEPTION 'a categoria % nao e INSTALACAO: instalacao so pendura na categoria INSTALACAO', v_categoria USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.produto), '[]'::jsonb) INTO v_antes
    FROM (SELECT * FROM public.orcamentista_mp_instalacao x WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant FOR UPDATE) i;

  DELETE FROM public.orcamentista_mp_instalacao x
   WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant
     AND x.produto <> ALL (ARRAY(SELECT e ->> 'produto' FROM jsonb_array_elements(p_lista) e));

  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_mp_instalacao'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'categoria_chave', 'produto');
  FOR v_item IN SELECT e FROM jsonb_array_elements(p_lista) e LOOP
    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_mp_instalacao x
     WHERE x.mp_categoria_id = p_mp_categoria AND x.produto = v_item ->> 'produto';
    -- antes || item: usa ausente fica, usa null grava NULL, usa false grava false
    EXECUTE format('INSERT INTO public.orcamentista_mp_instalacao SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_mp_instalacao, $1) ON CONFLICT (mp_categoria_id, produto) DO UPDATE SET %s', v_set)
      USING coalesce(v_linha, '{}'::jsonb) || v_item
            || jsonb_build_object('id', coalesce((v_linha ->> 'id')::uuid, gen_random_uuid()), 'tenant_id', p_tenant,
                                  'mp_categoria_id', p_mp_categoria, 'categoria_chave', 'INSTALACAO');
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.produto), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_mp_instalacao i WHERE i.mp_categoria_id = p_mp_categoria AND i.tenant_id = p_tenant;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_instalacao', p_mp_categoria::text,
          jsonb_build_object('orcamentista_mp_instalacao', v_antes),
          jsonb_build_object('orcamentista_mp_instalacao', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_mp_instalacao', v_depois);
END
$function$
;

