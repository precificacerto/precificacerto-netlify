
DECLARE
  v_rotulo     text := btrim(coalesce(p_rotulo, ''));
  v_igual      text;
  v_fora       text;
  v_ordem      integer;
  v_depois     jsonb;
  v_constraint text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_ramificacoes IS NULL OR cardinality(p_ramificacoes) = 0 THEN
    RAISE EXCEPTION 'a familia declara ao menos uma ramificacao (categoria). Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT x) FROM unnest(p_ramificacoes) x) THEN
    RAISE EXCEPTION 'uma ramificacao aparece mais de uma vez na lista. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT x INTO v_fora FROM unnest(p_ramificacoes) x WHERE x IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_categoria_catalogo c WHERE c.chave = x) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'a ramificacao "%" nao e do catalogo de categorias. Nada foi gravado.', coalesce(v_fora, '(vazia)') USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- uma criacao por vez: a ordem e a ultima + 1 e o nome nao repete - as duas conferencias valem so sob a trava
  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_familia_catalogo', 0));
  IF EXISTS (SELECT 1 FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave) THEN
    RAISE EXCEPTION 'a familia de chave "%" ja existe. Nada foi gravado.', p_chave USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT f.rotulo INTO v_igual FROM public.orcamentista_familia_catalogo f WHERE lower(btrim(f.rotulo)) = lower(v_rotulo) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a familia "%": o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(max(f.ordem), 0) + 1 INTO v_ordem FROM public.orcamentista_familia_catalogo f;

  BEGIN
    INSERT INTO public.orcamentista_familia_catalogo (chave, rotulo, ordem) VALUES (p_chave, v_rotulo, v_ordem);
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_familia_catalogo_chave_forma' THEN 'a chave da familia e maiuscula, comeca por letra e tem ate 40 caracteres (letras, digitos e _). Nada foi gravado.'
      WHEN 'orcamentista_familia_catalogo_rotulo_forma' THEN 'o nome da familia tem de 1 a 60 caracteres. Nada foi gravado.'
      ELSE 'um valor nao passou numa regra do banco. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;
  INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)
  SELECT p_chave, x, n::integer FROM unnest(p_ramificacoes) WITH ORDINALITY AS r(x, n);

  v_depois := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ordem) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_catalogo', p_chave, NULL, v_depois, p_por);
  RETURN v_depois;
END
