
DECLARE
  v_antes   jsonb;
  v_depois  jsonb;
  v_item    jsonb;
  v_pos     bigint;
  v_linha   jsonb;
  v_id      uuid;
  v_fora    text;
  v_set     text;
  v_criou   boolean := false;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_lista IS NULL OR jsonb_typeof(p_lista) <> 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e
                 WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'nome') IS DISTINCT FROM 'string'
                    OR btrim(e ->> 'nome') = '') THEN
    RAISE EXCEPTION 'a lista de materias-primas e uma lista de objetos com nome preenchido' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_array_length(p_lista) = 0 THEN
    RAISE EXCEPTION 'nada a gravar: esta funcao nao apaga materia-prima' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT lower(e ->> 'nome')) FROM jsonb_array_elements(p_lista) e) THEN
    RAISE EXCEPTION 'materia-prima repetida na lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lista) e WHERE e ? 'ordem') THEN
    RAISE EXCEPTION 'ordem vem da posicao na lista, nao do corpo' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(p_lista) e, jsonb_object_keys(e) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_materia_prima'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('id', 'tenant_id', 'ordem', 'atualizado_por', 'atualizado_em'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nas materias-primas: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_materia_prima:' || p_tenant::text, 0));
  SELECT jsonb_build_object(
           'orcamentista_materia_prima',
             coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ordem, m.nome)
                         FROM (SELECT * FROM public.orcamentista_materia_prima x WHERE x.tenant_id = p_tenant FOR UPDATE) m), '[]'::jsonb),
           'orcamentista_mp_categoria',
             coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.materia_prima_id, c.categoria_chave)
                         FROM public.orcamentista_mp_categoria c WHERE c.tenant_id = p_tenant), '[]'::jsonb))
    INTO v_antes;

  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_materia_prima'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('id', 'tenant_id');
  FOR v_item, v_pos IN SELECT e, o FROM jsonb_array_elements(p_lista) WITH ORDINALITY x(e, o) LOOP
    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_materia_prima x
     WHERE x.tenant_id = p_tenant AND lower(x.nome) = lower(v_item ->> 'nome');
    v_id := coalesce((v_linha ->> 'id')::uuid, gen_random_uuid());
    -- antes || item; o id é o de antes ou um novo; a ordem é a POSIÇÃO
    EXECUTE format('INSERT INTO public.orcamentista_materia_prima SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_materia_prima, $1) ON CONFLICT (tenant_id, lower(nome)) DO UPDATE SET %s', v_set)
      USING coalesce(v_linha, '{}'::jsonb) || v_item
            || jsonb_build_object('id', v_id, 'tenant_id', p_tenant, 'ordem', v_pos, 'atualizado_por', p_por, 'atualizado_em', now());
    IF v_linha IS NULL THEN
      -- matéria-prima NOVA: as seis categorias, com config NULL — "ainda não configurado"
      INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave, atualizado_por)
      SELECT p_tenant, v_id, k.chave, p_por FROM public.orcamentista_categoria_catalogo k ORDER BY k.ordem
      ON CONFLICT (materia_prima_id, categoria_chave) DO NOTHING;
      v_criou := true;
    END IF;
  END LOOP;

  SELECT jsonb_build_object(
           'orcamentista_materia_prima',
             coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ordem, m.nome)
                         FROM public.orcamentista_materia_prima m WHERE m.tenant_id = p_tenant), '[]'::jsonb),
           'orcamentista_mp_categoria',
             coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.materia_prima_id, c.categoria_chave)
                         FROM public.orcamentista_mp_categoria c WHERE c.tenant_id = p_tenant), '[]'::jsonb))
    INTO v_depois;

  -- o LOG, por último e na mesma transação
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant,
          CASE WHEN v_criou THEN 'orcamentista_materia_prima,orcamentista_mp_categoria' ELSE 'orcamentista_materia_prima' END,
          p_tenant::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
