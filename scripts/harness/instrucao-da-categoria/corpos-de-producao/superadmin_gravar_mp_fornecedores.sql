CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_fornecedores(p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_item   jsonb;
  v_pos    bigint;
  v_linha  jsonb;
  v_novos  jsonb := '[]'::jsonb;
  v_nicho  uuid;
  v_n      int;
  v_fora   text;
  v_set    text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_lista IS NULL OR jsonb_typeof(p_lista) <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e
                 WHERE jsonb_typeof(e) <> 'object'
                    OR coalesce(e ->> 'fornecedor_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    OR (e ? 'principal' AND jsonb_typeof(e -> 'principal') <> 'boolean')) THEN
    RAISE EXCEPTION 'a lista de fornecedores e uma lista de objetos com fornecedor_id (uuid) e principal true ou false' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT lower(e ->> 'fornecedor_id')) FROM jsonb_array_elements(p_lista) e) THEN
    RAISE EXCEPTION 'fornecedor repetido na lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e WHERE e ? 'ordem') THEN
    RAISE EXCEPTION 'ordem vem da posicao na lista, nao do corpo' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(p_lista) e, jsonb_object_keys(e) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_mp_categoria_fornecedor'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'ordem'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nos fornecedores: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- o fornecedor é do NICHO DA EMPRESA — o caminho único é orcamentista_config.nicho_id
  IF jsonb_array_length(p_lista) > 0 THEN
    SELECT cfg.nicho_id INTO v_nicho FROM public.orcamentista_config cfg WHERE cfg.tenant_id = p_tenant;
    IF v_nicho IS NULL THEN
      RAISE EXCEPTION 'a empresa nao tem nicho configurado: nenhum fornecedor pode ser dela' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT string_agg(e ->> 'fornecedor_id', ', ') INTO v_fora
      FROM jsonb_array_elements(p_lista) e
     WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_fornecedor f WHERE f.id = (e ->> 'fornecedor_id')::uuid AND f.nicho_id = v_nicho);
    IF v_fora IS NOT NULL THEN
      RAISE EXCEPTION 'fornecedor(es) que nao sao do nicho da empresa: %', v_fora USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_mp_fornecedores:' || p_tenant::text || ':' || p_mp_categoria::text, 0));
  -- a categoria tem de ser DESTA empresa: lida com o tenant, nunca confiada
  PERFORM 1 FROM public.orcamentista_mp_categoria c WHERE c.id = p_mp_categoria AND c.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'categoria inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ordem), '[]'::jsonb) INTO v_antes
    FROM (SELECT * FROM public.orcamentista_mp_categoria_fornecedor x WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant FOR UPDATE) f;

  -- o estado RESULTANTE de cada item, antes de gravar: antes || item, o id, a ordem e o principal
  FOR v_item, v_pos IN SELECT e, o FROM jsonb_array_elements(p_lista) WITH ORDINALITY x(e, o) LOOP
    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_mp_categoria_fornecedor x
     WHERE x.mp_categoria_id = p_mp_categoria AND x.fornecedor_id = (v_item ->> 'fornecedor_id')::uuid;
    v_novos := v_novos || jsonb_build_array(
      coalesce(v_linha, '{}'::jsonb) || v_item
      || jsonb_build_object('id', coalesce((v_linha ->> 'id')::uuid, gen_random_uuid()), 'tenant_id', p_tenant,
                            'mp_categoria_id', p_mp_categoria, 'ordem', v_pos,
                            'principal', coalesce(v_item -> 'principal', v_linha -> 'principal', 'false'::jsonb)));
  END LOOP;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_novos) e WHERE (e ->> 'principal')::boolean;
  IF jsonb_array_length(v_novos) > 0 AND v_n <> 1 THEN
    RAISE EXCEPTION 'a lista de fornecedores tem % principal(is): tem de ter exatamente um', v_n USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- o item que não veio sai
  DELETE FROM public.orcamentista_mp_categoria_fornecedor x
   WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant
     AND x.fornecedor_id <> ALL (ARRAY(SELECT (e ->> 'fornecedor_id')::uuid FROM jsonb_array_elements(p_lista) e));
  -- sem isto, trocar o principal violaria o índice único no meio do laço
  UPDATE public.orcamentista_mp_categoria_fornecedor x SET principal = false
   WHERE x.mp_categoria_id = p_mp_categoria AND x.tenant_id = p_tenant AND x.principal;

  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_mp_categoria_fornecedor'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('id', 'tenant_id', 'mp_categoria_id', 'fornecedor_id');
  FOR v_item IN SELECT e FROM jsonb_array_elements(v_novos) e LOOP
    EXECUTE format('INSERT INTO public.orcamentista_mp_categoria_fornecedor SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_mp_categoria_fornecedor, $1) ON CONFLICT (mp_categoria_id, fornecedor_id) DO UPDATE SET %s', v_set)
      USING v_item;
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ordem), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_mp_categoria_fornecedor f WHERE f.mp_categoria_id = p_mp_categoria AND f.tenant_id = p_tenant;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_categoria_fornecedor', p_mp_categoria::text,
          jsonb_build_object('orcamentista_mp_categoria_fornecedor', v_antes),
          jsonb_build_object('orcamentista_mp_categoria_fornecedor', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_mp_categoria_fornecedor', v_depois);
END
$function$
;

