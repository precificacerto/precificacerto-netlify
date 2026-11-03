-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261103000001 — A CATEGORIA DA FAMÍLIA CHEGA NA CONTA: marcar uma categoria na ramificação, criar uma matéria-prima e trocar a
-- matéria-prima de família passam a GARANTIR a linha de orcamentista_mp_categoria das categorias daquela família (config NULL).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a extensão: 20261103000001_garantia_da_categoria_na_conta.
-- ║ PRESSUPÕE a 20261029000004 (famílias do catálogo), a 20261028000001 (a família da matéria-prima), a 20261023000003 (os três níveis) e a
-- ║ 20261102000002 (as categorias do catálogo) APLICADAS: a guarda confere os quatro corpos que esta migração troca, pelo md5 medido em
-- ║ produção em 02/11/2026, e aborta nomeando o banco e o que difere.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ ⚠️  ESTA MIGRAÇÃO GRAVA DADO DE CONTA.
-- ║ Ela INSERE exatamente 1 (UMA) linha em orcamentista_mp_categoria, da empresa Esquadrias De Paula Ltda
-- ║ (tenant 20e08592-f957-4e72-b7eb-251387e34eb9), matéria-prima "Esquadrias de PVC WOLF" (79d764fe-4acd-43e2-bed9-38e20667ca3d),
-- ║ categoria VEDACAO, config NULL ("ainda não configurado"), atualizado_por NULL. É a falta medida em produção em 02/11/2026: a
-- ║ VEDACAO foi criada às 23:23:09 UTC e marcada na ramificação da PVC às 23:34:30, e nenhuma função criou a linha da conta.
-- ║ A linha é logada em superadmin_alteracao_log (tenant da De Paula, origem "preenchimento 20261103000001").
-- ║ A GUARDA ABORTA se, na hora de aplicar, faltar qualquer OUTRA linha (outra empresa, outra matéria-prima ou outra categoria): este
-- ║ cabeçalho nunca diz menos do que a migração grava. Se a linha da VEDACAO já existir, o INSERT não grava nada (ON CONFLICT DO NOTHING).
-- ║ Nenhuma linha de conta é APAGADA nem ALTERADA, nesta migração ou pelas funções que ela troca.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- Decisões do dono do produto (02/11/2026), registradas como foram ditas:
--   1. "DESMARCAR: mantém a regra de 27/10 — nada que está gravado some da tela. A categoria desmarcada SEM dado some; a desmarcada COM dado
--      continua aparecendo, marcada 'fora da família'. Não mude esse comportamento nesta PR." -> nenhuma função apaga linha; a tela não muda.
--   2. "COBRE OS TRÊS CAMINHOS: marcar categoria na ramificação, criar matéria-prima e trocar a matéria-prima de família [...] com ON CONFLICT
--      DO NOTHING. NÃO mude o que a matéria-prima nova já faz hoje (ganhar as linhas do catálogo inteiro): só acrescente a garantia."
--   3. "config NULL [...]. Nunca {}."
--   4. "PREENCHER A FALTA DE HOJE: sim, inclua o INSERT da VEDACAO da De Paula na migração, nos moldes da 20261024000004."
--   5. "Guarda por md5 de editar_familia (2553cf7c…) e criar_familia (aa90f740…)" -> e também das outras duas que esta migração troca.
--
-- O QUE FAZ:
--   A. orcamentista_garantir_categorias_da_familia(p_por, p_familia, p_materia_prima, p_origem) — NOVA, fechada (sem grant a ninguém; só as
--      funções SECURITY DEFINER abaixo a chamam): para cada matéria-prima da família (ou só a dada), uma linha por categoria que a família
--      declara em orcamentista_familia_ramificacao, config NULL, ON CONFLICT DO NOTHING; loga cada linha CRIADA com o tenant dela e a origem;
--      devolve quantas criou. A marcação e a troca de família em paralelo já se enfileiram na linha da família (o FOR UPDATE de
--      superadmin_editar_familia contra o FOR KEY SHARE da FK de orcamentista_materia_prima.familia): a auxiliar não precisa de trava própria,
--      e as corridas do harness provam as duas ordens.
--   B. Os quatro corpos de produção, sem tirar nem mudar uma linha, com a chamada ACRESCENTADA (o script de montagem prova pelo diff):
--        superadmin_editar_familia e superadmin_criar_familia      — depois de regravar as ramificações  (origem 'ramificacao');
--        superadmin_definir_familia_da_materia_prima               — quando a família muda               (origem 'troca_de_familia');
--        superadmin_gravar_materia_prima                           — matéria-prima nova, ou família mudada por ela
--                                                                    (origem 'materia_prima_nova' ou 'troca_de_familia').
--      Em criar_familia a garantia é sempre vazia hoje: a FK orcamentista_materia_prima_familia_fkey impede matéria-prima de apontar família
--      que ainda não existe. Fica pela coerência (a regra mora num lugar só), e o harness prova que ela não cria nada.
--      Na matéria-prima nova, as linhas do catálogo inteiro continuam nascendo como antes; a garantia só acrescenta (hoje, nada: a ramificação
--      é sempre parte do catálogo).
--   C. O PREENCHIMENTO da falta de hoje (o quadro acima).
--
-- O QUE NÃO FAZ: não apaga nem altera linha de conta; não muda a tela nem a regra de 27/10; não troca FK, CHECK ou grant das quatro funções.
-- GUARDA (aborta): os quatro corpos são os de produção (md5), cada um achado pela assinatura de entrada; a falta de hoje é só a da VEDACAO da
-- De Paula. VERIFICAÇÃO (aborta): nenhuma matéria-prima com família fica sem a linha de uma categoria declarada; a auxiliar é fechada e não é
-- SECURITY DEFINER; as quatro continuam SECURITY DEFINER, com search_path fixo e o mesmo grant; nenhuma linha de conta foi apagada.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── A GUARDA: o que esta migração troca é o que foi lido em produção ─────────────────────────
DO $guarda$
DECLARE
  v_esperado jsonb := jsonb_build_object(
    'public.superadmin_criar_familia(uuid, text, text, text[])', 'aa90f740d27a6f55902fd58a643c29dd',
    'public.superadmin_editar_familia(uuid, text, text, text[])', '2553cf7ce56248b9ad376839c4a4adca',
    'public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)', 'e7e49ec7a9eef706f49e5ea635543435',
    'public.superadmin_gravar_materia_prima(uuid, uuid, jsonb)', '49ffa56e7614f115aefc5d00d4881e3f');
  -- reaplicar esta migração encontra os corpos DELA: também valem (a reaplicação é inofensiva)
  v_desta    jsonb := jsonb_build_object(
    'public.superadmin_criar_familia(uuid, text, text, text[])', 'aa798afd03594cbd48d261a29af36188',
    'public.superadmin_editar_familia(uuid, text, text, text[])', '74341b18d85e1de8cd4988b3aa736d2d',
    'public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)', '6eb8c7ae7399661c1fbfcfd8299669f3',
    'public.superadmin_gravar_materia_prima(uuid, uuid, jsonb)', 'eef66de2e99fcc0c2e0b7f166e17d175');
  k         text;
  v_oid     regprocedure;
  v_md5     text;
  v_laudo   text := '';
  v_ok      boolean := true;
  v_tabelas bigint;
  v_falta   text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(v_esperado) ORDER BY 1 LOOP
    v_oid := to_regprocedure(k);
    IF v_oid IS NULL THEN
      v_laudo := v_laudo || k || ': nao existe; '; v_ok := false; CONTINUE;
    END IF;
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_md5 FROM pg_catalog.pg_proc p WHERE p.oid = v_oid;
    IF v_md5 = v_esperado ->> k THEN v_laudo := v_laudo || k || ': ok; ';
    ELSIF v_md5 = v_desta ->> k THEN v_laudo := v_laudo || k || ': ja e o corpo desta migracao; ';
    ELSE v_laudo := v_laudo || k || ': md5 ' || v_md5 || ', esperado ' || (v_esperado ->> k) || '; '; v_ok := false;
    END IF;
  END LOOP;
  -- a auxiliar ainda nao existe, ou e a desta migracao
  v_oid := to_regprocedure('public.orcamentista_garantir_categorias_da_familia(uuid, text, uuid, text)');
  IF v_oid IS NOT NULL THEN
    SELECT md5(replace(p.prosrc, chr(13), '')) INTO v_md5 FROM pg_catalog.pg_proc p WHERE p.oid = v_oid;
    IF v_md5 IS DISTINCT FROM '974d5ff4adc0935cae5fff2b06a39e99' THEN
      v_laudo := v_laudo || 'public.orcamentista_garantir_categorias_da_familia: ja existe com outro corpo (md5 ' || v_md5 || '); '; v_ok := false;
    END IF;
  END IF;
  IF NOT v_ok THEN
    SELECT count(*) INTO v_tabelas FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'orcamentista\_%';
    RAISE EXCEPTION 'dependencia ausente no banco % (usuario %, % tabelas orcamentista_*: e o projeto certo?): as funcoes que esta migracao troca nao sao as lidas em producao: %Nada foi alterado.',
      current_database(), current_user, v_tabelas, v_laudo;
  END IF;

  -- a falta de hoje e SO a da VEDACAO da De Paula: qualquer outra linha faltando muda o que o cabecalho diz, e a migracao para
  SELECT string_agg(format('%s / %s (%s) / %s', coalesce(t.name, '(sem nome)'), m.nome, m.id, r.categoria_chave), '; ' ORDER BY t.name, m.nome, r.ordem) INTO v_falta
    FROM public.orcamentista_materia_prima m
    JOIN public.orcamentista_familia_ramificacao r ON r.familia = m.familia
    LEFT JOIN public.tenants t ON t.id = m.tenant_id
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c WHERE c.materia_prima_id = m.id AND c.categoria_chave = r.categoria_chave)
     AND NOT (m.id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' AND m.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9' AND r.categoria_chave = 'VEDACAO');
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: faltam linhas de orcamentista_mp_categoria alem da VEDACAO da De Paula: %. O preenchimento desta migracao foi escrito para uma linha so. Nada foi alterado.', v_falta;
  END IF;
END
$guarda$;

-- a foto: quantas linhas de conta havia, e o md5 de cada uma (a verificação prova que nenhuma foi apagada nem alterada)
CREATE TEMP TABLE _garantia_antes ON COMMIT DROP AS
SELECT c.id, md5(to_jsonb(c)::text) AS h FROM public.orcamentista_mp_categoria c;

-- ── A. A AUXILIAR: garante as linhas das categorias da família ─────────────────────────────
CREATE OR REPLACE FUNCTION public.orcamentista_garantir_categorias_da_familia(p_por uuid, p_familia text, p_materia_prima uuid, p_origem text) RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_n integer;
BEGIN
  IF p_familia IS NULL THEN
    RETURN 0;
  END IF;
  -- sem trava propria: quem marca a ramificacao (superadmin_editar_familia) trava a linha da familia com FOR UPDATE, e quem poe uma
  -- materia-prima na familia passa pela FK orcamentista_materia_prima_familia_fkey, que pede FOR KEY SHARE na mesma linha. Os dois se
  -- enfileiram, e o segundo le, num comando novo (READ COMMITTED), o que o primeiro gravou (harness, as corridas 1 e 2)
  WITH criadas AS (
    INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave, config, atualizado_por)
    SELECT m.tenant_id, m.id, r.categoria_chave, NULL, p_por
      FROM public.orcamentista_materia_prima m
      JOIN public.orcamentista_familia_ramificacao r ON r.familia = m.familia
     WHERE m.familia = p_familia AND (p_materia_prima IS NULL OR m.id = p_materia_prima)
     ORDER BY m.tenant_id, m.id, r.ordem
    -- a linha que ja existe fica como esta: config, fornecedores, vidros, ferragens e instalacao nao sao tocados
    ON CONFLICT (materia_prima_id, categoria_chave) DO NOTHING
    RETURNING *)
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  SELECT c.tenant_id, 'orcamentista_mp_categoria', c.id::text, NULL,
         jsonb_build_object('orcamentista_mp_categoria', to_jsonb(c), 'garantia_da_familia', jsonb_build_object('familia', p_familia, 'origem', p_origem)), p_por
    FROM criadas c;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$fn$;
-- fechada: so as funcoes SECURITY DEFINER desta migracao a chamam (o dono delas e o desta); o privilegio padrao do projeto daria EXECUTE a
-- authenticated e service_role
REVOKE ALL ON FUNCTION public.orcamentista_garantir_categorias_da_familia(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── B. OS QUATRO CORPOS DE PRODUÇÃO, com a chamada acrescentada ─────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_criar_familia(p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
  -- 02/11/2026: marcar uma categoria na ramificacao garante a linha dela em toda materia-prima desta familia, com config NULL; desmarcar
  -- nao apaga nada da conta (a linha com dado continua aparecendo, marcada "fora da familia")
  PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, p_chave, NULL, 'ramificacao');

  v_depois := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ordem) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_catalogo', p_chave, NULL, v_depois, p_por);
  RETURN v_depois;
END
$fn$;

CREATE OR REPLACE FUNCTION public.superadmin_editar_familia(p_por uuid, p_chave text, p_rotulo text, p_ramificacoes text[]) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rotulo     text := btrim(coalesce(p_rotulo, ''));
  v_igual      text;
  v_fora       text;
  v_antes      jsonb;
  v_depois     jsonb;
  v_atuais     text[];
  v_rotulo_era text;
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

  PERFORM pg_advisory_xact_lock(hashtextextended('orcamentista_familia_catalogo', 0));
  SELECT f.rotulo INTO v_rotulo_era FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'familia inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT f.rotulo INTO v_igual FROM public.orcamentista_familia_catalogo f WHERE f.chave <> p_chave AND lower(btrim(f.rotulo)) = lower(v_rotulo) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ja existe a familia "%": o nome nao se repete. Nada foi gravado.', v_igual USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT coalesce(array_agg(r.categoria_chave ORDER BY r.ordem), '{}') INTO v_atuais FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave;
  IF v_rotulo_era = v_rotulo AND v_atuais = p_ramificacoes THEN
    RAISE EXCEPTION 'nada mudou: o nome e as ramificacoes sao os de agora. Nada foi gravado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_antes := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.ordem), '[]'::jsonb) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));

  BEGIN
    UPDATE public.orcamentista_familia_catalogo SET rotulo = v_rotulo WHERE chave = p_chave;
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_constraint
      WHEN 'orcamentista_familia_catalogo_rotulo_forma' THEN 'o nome da familia tem de 1 a 60 caracteres. Nada foi gravado.'
      ELSE 'um valor nao passou numa regra do banco. Nada foi gravado.' END
      USING ERRCODE = 'invalid_parameter_value';
  END;
  -- a lista e regravada inteira: as tres colunas (familia, categoria_chave, ordem) vem do corpo; nenhuma outra tabela aponta a ramificacao
  DELETE FROM public.orcamentista_familia_ramificacao WHERE familia = p_chave;
  INSERT INTO public.orcamentista_familia_ramificacao (familia, categoria_chave, ordem)
  SELECT p_chave, x, n::integer FROM unnest(p_ramificacoes) WITH ORDINALITY AS r(x, n);
  -- 02/11/2026: marcar uma categoria na ramificacao garante a linha dela em toda materia-prima desta familia, com config NULL; desmarcar
  -- nao apaga nada da conta (a linha com dado continua aparecendo, marcada "fora da familia")
  PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, p_chave, NULL, 'ramificacao');

  v_depois := jsonb_build_object(
    'orcamentista_familia_catalogo', (SELECT to_jsonb(f) FROM public.orcamentista_familia_catalogo f WHERE f.chave = p_chave),
    'orcamentista_familia_ramificacao', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.ordem) FROM public.orcamentista_familia_ramificacao r WHERE r.familia = p_chave));
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_familia_catalogo', p_chave, v_antes, v_depois, p_por);
  RETURN v_depois;
END
$fn$;

CREATE OR REPLACE FUNCTION public.superadmin_definir_familia_da_materia_prima(p_tenant uuid, p_por uuid, p_materia_prima uuid, p_familia text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
  -- 02/11/2026: trocar a materia-prima de familia garante as linhas das categorias que a familia nova declara, com config NULL; a familia de
  -- antes nao perde nada
  IF (v_antes ->> 'familia') IS DISTINCT FROM p_familia THEN
    PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, p_familia, p_materia_prima, 'troca_de_familia');
  END IF;
  SELECT to_jsonb(m) INTO v_depois FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text,
          jsonb_build_object('orcamentista_materia_prima', v_antes),
          jsonb_build_object('orcamentista_materia_prima', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_materia_prima', v_depois);
END
$fn$;

CREATE OR REPLACE FUNCTION public.superadmin_gravar_materia_prima(p_tenant uuid, p_por uuid, p_lista jsonb) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
  v_familia text;
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
    -- 02/11/2026: a materia-prima nova, ou a que troca de familia por aqui, ganha a garantia das categorias da familia (config NULL). A nova
    -- continua ganhando as linhas do catalogo inteiro, acima: a garantia so acrescenta
    SELECT x.familia INTO v_familia FROM public.orcamentista_materia_prima x WHERE x.id = v_id;
    IF v_linha IS NULL OR (v_linha ->> 'familia') IS DISTINCT FROM v_familia THEN
      PERFORM public.orcamentista_garantir_categorias_da_familia(p_por, v_familia, v_id,
                                                                 CASE WHEN v_linha IS NULL THEN 'materia_prima_nova' ELSE 'troca_de_familia' END);
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
$fn$;
-- CREATE OR REPLACE preserva o grant de cada uma (service_role); repetido aqui, pela leitura
REVOKE ALL ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_criar_familia(uuid, text, text, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.superadmin_editar_familia(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_editar_familia(uuid, text, text, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.superadmin_gravar_materia_prima(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_materia_prima(uuid, uuid, jsonb) TO service_role;

-- ── C. O PREENCHIMENTO — GRAVA DADO DE CONTA: 1 linha, Esquadrias De Paula Ltda, "Esquadrias de PVC WOLF", VEDACAO (ver o cabeçalho) ─────
-- nos moldes da 20261024000004: INSERT ... SELECT ... ON CONFLICT DO NOTHING; aqui com a linha logada
WITH criada AS (
  INSERT INTO public.orcamentista_mp_categoria (tenant_id, materia_prima_id, categoria_chave, config, atualizado_por)
  SELECT m.tenant_id, m.id, 'VEDACAO', NULL, NULL
    FROM public.orcamentista_materia_prima m
   WHERE m.id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' AND m.tenant_id = '20e08592-f957-4e72-b7eb-251387e34eb9'
     AND EXISTS (SELECT 1 FROM public.orcamentista_familia_ramificacao r WHERE r.familia = m.familia AND r.categoria_chave = 'VEDACAO')
  ON CONFLICT (materia_prima_id, categoria_chave) DO NOTHING
  RETURNING *)
INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
SELECT c.tenant_id, 'orcamentista_mp_categoria', c.id::text, NULL,
       jsonb_build_object('orcamentista_mp_categoria', to_jsonb(c), 'garantia_da_familia', jsonb_build_object('familia', 'PVC', 'origem', 'preenchimento 20261103000001')), NULL
  FROM criada c;

-- ── VERIFICAÇÃO (aborta) ───────────────────────────────────────────────────────────────────
DO $verifica$
DECLARE
  v_tx   text;
  v_n    bigint;
  nome   text;
  f      regprocedure;
BEGIN
  -- a regra: nenhuma materia-prima com familia fica sem a linha de uma categoria que a familia declara
  SELECT string_agg(format('%s / %s', m.nome, r.categoria_chave), '; ') INTO v_tx
    FROM public.orcamentista_materia_prima m JOIN public.orcamentista_familia_ramificacao r ON r.familia = m.familia
   WHERE NOT EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c WHERE c.materia_prima_id = m.id AND c.categoria_chave = r.categoria_chave);
  IF v_tx IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao: materia-prima sem a linha de uma categoria da familia: %. Nada foi alterado.', v_tx;
  END IF;
  -- nenhuma linha de conta foi apagada nem alterada; as novas tem config NULL
  IF EXISTS (SELECT 1 FROM _garantia_antes a LEFT JOIN public.orcamentista_mp_categoria c ON c.id = a.id WHERE c.id IS NULL OR md5(to_jsonb(c)::text) <> a.h) THEN
    RAISE EXCEPTION 'verificacao: uma linha de orcamentista_mp_categoria foi apagada ou alterada. Nada foi alterado.';
  END IF;
  SELECT count(*) INTO v_n FROM public.orcamentista_mp_categoria c WHERE NOT EXISTS (SELECT 1 FROM _garantia_antes a WHERE a.id = c.id);
  IF v_n > 1 OR EXISTS (SELECT 1 FROM public.orcamentista_mp_categoria c WHERE NOT EXISTS (SELECT 1 FROM _garantia_antes a WHERE a.id = c.id)
                          AND (c.config IS NOT NULL OR c.categoria_chave <> 'VEDACAO' OR c.materia_prima_id <> '79d764fe-4acd-43e2-bed9-38e20667ca3d')) THEN
    RAISE EXCEPTION 'verificacao: o preenchimento gravou outra coisa que a linha da VEDACAO da De Paula com config NULL (% linha(s)). Nada foi alterado.', v_n;
  END IF;
  -- a auxiliar: existe, NAO e SECURITY DEFINER, search_path fixo, ninguem a executa alem do dono
  f := to_regprocedure('public.orcamentista_garantir_categorias_da_familia(uuid, text, uuid, text)');
  IF f IS NULL OR (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = f)
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND 'search_path=public, pg_temp' = ANY (p.proconfig))
     OR has_function_privilege('authenticated', f, 'execute') OR has_function_privilege('anon', f, 'execute') OR has_function_privilege('service_role', f, 'execute') THEN
    RAISE EXCEPTION 'verificacao: a auxiliar nao existe, ou e SECURITY DEFINER, ou esta aberta. Nada foi alterado.';
  END IF;
  -- as quatro: SECURITY DEFINER, search_path fixo, so o service_role executa, e chamam a auxiliar
  FOREACH nome IN ARRAY ARRAY['public.superadmin_criar_familia(uuid, text, text, text[])', 'public.superadmin_editar_familia(uuid, text, text, text[])',
                              'public.superadmin_definir_familia_da_materia_prima(uuid, uuid, uuid, text)', 'public.superadmin_gravar_materia_prima(uuid, uuid, jsonb)'] LOOP
    f := to_regprocedure(nome);
    IF f IS NULL OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = f)
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND 'search_path=public, pg_temp' = ANY (p.proconfig))
       OR has_function_privilege('authenticated', f, 'execute') OR has_function_privilege('anon', f, 'execute') OR NOT has_function_privilege('service_role', f, 'execute')
       OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosrc LIKE '%orcamentista_garantir_categorias_da_familia(%') THEN
      RAISE EXCEPTION 'verificacao: % nao existe, ou mudou de seguranca ou de grant, ou nao chama a garantia. Nada foi alterado.', nome;
    END IF;
  END LOOP;
  RAISE NOTICE 'garantia da categoria na conta: as quatro funcoes chamam a garantia; % linha(s) de conta criadas pelo preenchimento; nenhuma apagada ou alterada.', v_n;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Conferência depois de aplicar (só leitura):
-- select proname, md5(replace(prosrc, chr(13), '')) from pg_proc where proname in ('superadmin_criar_familia', 'superadmin_editar_familia',
--   'superadmin_definir_familia_da_materia_prima', 'superadmin_gravar_materia_prima', 'orcamentista_garantir_categorias_da_familia') order by 1;
-- select c.categoria_chave, c.config, c.atualizado_por from orcamentista_mp_categoria c
--  where c.materia_prima_id = '79d764fe-4acd-43e2-bed9-38e20667ca3d' order by 1;       -- 8 linhas, a VEDACAO com config NULL
-- select count(*) from orcamentista_materia_prima m join orcamentista_familia_ramificacao r on r.familia = m.familia
--  where not exists (select 1 from orcamentista_mp_categoria c where c.materia_prima_id = m.id and c.categoria_chave = r.categoria_chave);  -- 0
