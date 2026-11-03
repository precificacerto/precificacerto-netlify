CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_vidros(p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb)
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
                 WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'descricao') IS DISTINCT FROM 'string'
                    OR btrim(e ->> 'descricao') = '') THEN
    RAISE EXCEPTION 'a lista de vidros e uma lista de objetos com descricao preenchida' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- onde_predomina: lista de textos quando veio; vazio e ausente não são a mesma coisa
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e
              WHERE e ? 'onde_predomina' AND jsonb_typeof(e -> 'onde_predomina') <> 'null'
                AND (jsonb_typeof(e -> 'onde_predomina') <> 'array'
                     OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e -> 'onde_predomina') = 'array' THEN e -> 'onde_predomina' ELSE '[]'::jsonb END) x
                                 WHERE jsonb_typeof(x) <> 'string'))) THEN
    RAISE EXCEPTION 'onde_predomina e uma lista de textos' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT lower(e ->> 'descricao')) FROM jsonb_array_elements(p_lista) e) THEN
    RAISE EXCEPTION 'vidro repetido na lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e WHERE e ? 'ordem') THEN
    RAISE EXCEPTION 'ordem vem da posicao na lista, nao do corpo' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(p_lista) e, jsonb_object_keys(e) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_mp_vidro'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'categoria_chave', 'ordem'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nos vidros: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_mp_vidros:' || p_tenant::text || ':' || p_mp_categoria::text, 0));
  SELECT c.categoria_chave INTO v_categoria
    FROM public.orcamentista_mp_categoria c WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_categoria <> 'VIDRO' THEN
    RAISE EXCEPTION 'a categoria % nao e VIDRO: vidro so pendura na categoria VIDRO', v_categoria USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.ordem), '[]'::jsonb) INTO v_antes
    FROM (SELECT * FROM public.orcamentista_mp_vidro x WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant FOR UPDATE) v;

  DELETE FROM public.orcamentista_mp_vidro x
   WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant
     AND lower(x.descricao) <> ALL (ARRAY(SELECT lower(e ->> 'descricao') FROM jsonb_array_elements(p_lista) e));

  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_mp_vidro'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'categoria_chave');
  FOR v_item, v_pos IN SELECT e, o FROM jsonb_array_elements(p_lista) WITH ORDINALITY x(e, o) LOOP
    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_mp_vidro x
     WHERE x.mp_categoria_id = p_mp_categoria AND lower(x.descricao) = lower(v_item ->> 'descricao');
    EXECUTE format('INSERT INTO public.orcamentista_mp_vidro SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_mp_vidro, $1) ON CONFLICT (mp_categoria_id, lower(descricao)) DO UPDATE SET %s', v_set)
      USING coalesce(v_linha, '{}'::jsonb) || v_item
            || jsonb_build_object('id', coalesce((v_linha ->> 'id')::uuid, gen_random_uuid()), 'tenant_id', p_tenant,
                                  'mp_categoria_id', p_mp_categoria, 'categoria_chave', 'VIDRO', 'ordem', v_pos);
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.ordem), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_mp_vidro v WHERE v.mp_categoria_id = p_mp_categoria AND v.tenant_id = p_tenant;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_vidro', p_mp_categoria::text,
          jsonb_build_object('orcamentista_mp_vidro', v_antes),
          jsonb_build_object('orcamentista_mp_vidro', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_mp_vidro', v_depois);
END
$function$
;

