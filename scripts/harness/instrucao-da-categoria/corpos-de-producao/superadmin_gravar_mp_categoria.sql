CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_categoria(p_tenant uuid, p_por uuid, p_materia_prima uuid, p_categoria text, p_corpo jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_antes  jsonb;
  v_config jsonb;
  v_id     uuid;
  v_depois jsonb;
  v_fora   text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_categoria IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo k WHERE k.chave = p_categoria) THEN
    RAISE EXCEPTION 'categoria desconhecida: %', coalesce(p_categoria, '(nula)') USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_corpo IS NULL OR jsonb_typeof(p_corpo) <> 'object' OR p_corpo = '{}'::jsonb THEN
    RAISE EXCEPTION 'nada a gravar' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- chave desconhecida é ERRO, não campo novo
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_object_keys(p_corpo) k
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_campo c WHERE c.categoria_chave = p_categoria AND c.chave = k);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'chave(s) fora do catalogo de %: %', p_categoria, v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- o tipo, pelo catálogo; null passa (é o limpar)
  SELECT string_agg(format('%s (esperado %s)', e.key,
                         CASE WHEN c.tipo = 'opcao' THEN 'um de: ' || array_to_string(c.opcoes, ', ') ELSE c.tipo END),
                  ', ' ORDER BY e.key) INTO v_fora
    FROM jsonb_each(p_corpo) e
    JOIN public.orcamentista_categoria_campo c ON c.categoria_chave = p_categoria AND c.chave = e.key
   WHERE jsonb_typeof(e.value) <> 'null'
     AND NOT CASE c.tipo
           WHEN 'texto'       THEN jsonb_typeof(e.value) = 'string'
           WHEN 'numero'      THEN jsonb_typeof(e.value) = 'number'
           WHEN 'inteiro'     THEN CASE WHEN jsonb_typeof(e.value) = 'number'
                                        THEN (e.value #>> '{}')::numeric = trunc((e.value #>> '{}')::numeric)
                                        ELSE false END
           WHEN 'booleano'    THEN jsonb_typeof(e.value) = 'boolean'
           WHEN 'lista_texto' THEN CASE WHEN jsonb_typeof(e.value) = 'array'
                                        THEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) x WHERE jsonb_typeof(x) <> 'string')
                                        ELSE false END
           WHEN 'mapa'        THEN jsonb_typeof(e.value) = 'object'
           WHEN 'opcao'       THEN jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') = ANY (c.opcoes)
           ELSE false
         END;
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'valor(es) com tipo errado em %: %', p_categoria, v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_mp_categoria:' || p_tenant::text || ':' || p_materia_prima::text || ':' || p_categoria, 0));
  -- a matéria-prima tem de ser DESTA empresa: lida com o tenant, nunca confiada
  PERFORM 1 FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT to_jsonb(c), c.config, c.id INTO v_antes, v_config, v_id
    FROM public.orcamentista_mp_categoria c
   WHERE c.materia_prima_id = p_materia_prima AND c.tenant_id = p_tenant AND c.categoria_chave = p_categoria
   FOR UPDATE;

  -- merge, nunca substituição: o ausente fica, o null grava null
  INSERT INTO public.orcamentista_mp_categoria (id, tenant_id, materia_prima_id, categoria_chave, config, atualizado_por, atualizado_em)
  VALUES (coalesce(v_id, gen_random_uuid()), p_tenant, p_materia_prima, p_categoria, coalesce(v_config, '{}'::jsonb) || p_corpo, p_por, now())
  ON CONFLICT (materia_prima_id, categoria_chave) DO UPDATE
    SET config = EXCLUDED.config, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em
  RETURNING to_jsonb(orcamentista_mp_categoria.*), id INTO v_depois, v_id;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_mp_categoria', v_id::text,
          jsonb_build_object('orcamentista_mp_categoria', v_antes),
          jsonb_build_object('orcamentista_mp_categoria', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_mp_categoria', v_depois);
END
$function$
;

