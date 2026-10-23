-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261023000003 — as FUNÇÕES que gravam a base de conhecimento em TRÊS NÍVEIS, cada uma com o
-- seu log, na MESMA transação — e que NASCEM FECHADAS
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- ORDEM: depende das tabelas da `20261023000002` (aplicada em produção em 23/10/2026). Aplicar
-- ANTES do merge de qualquer rota que chame estas funções (`migration-delivery.md`, "a ordem
-- depende do que a migração cria"). Só funções: nenhum DDL de tabela.
--
-- ══ O PADRÃO É O DA 20261023000001 — e a lista é a de superadmin_gravar_padrao_ambiente ══
-- Cada função: (1) confere que o `por` é super admin — o `por` é ARGUMENTO, nunca deduzido;
-- (2) confere que a empresa existe; (3) valida o corpo; (4) trava com `pg_advisory_xact_lock` numa
-- chave com o tenant E o alvo, e lê o ANTES com `FOR UPDATE`; (5) grava; (6) insere UMA linha em
-- `superadmin_alteracao_log`, POR ÚLTIMO; (7) devolve o DEPOIS. Qualquer exceção desfaz tudo,
-- log inclusive. Nas listas: o item que não veio SAI, e dentro do item que já existia vale
-- `antes || item` — o ausente fica, o null limpa, o false grava.
--
-- ══ O ALVO É LIDO COM O TENANT — nunca confiado ══
-- A matéria-prima e a categoria vêm por id no pedido. Toda função relê a linha com
-- `tenant_id = p_tenant` antes de gravar: um id de outra empresa é "inexistente nesta empresa".
--
-- ══ DECISÕES DO DONO DO PRODUTO (23/10/2026) ══
--   1. `superadmin_gravar_materia_prima` NÃO APAGA: apagar uma matéria-prima derruba em cascata
--      categorias, fornecedores, vidros, ferragens e instalação, e isso não pode sair de um
--      "salvar". Quem apaga é `superadmin_remover_materia_prima`, e ela loga a ÁRVORE inteira.
--   2. Ao criar uma matéria-prima NOVA, a mesma função cria as SEIS categorias dela, com config
--      NULL ("ainda não configurado") — o alumínio é espelho do PVC. Sem isso a linha de
--      FERRAGENS, VIDRO e INSTALACAO nunca existiria: elas não têm campo escalar, e a função da
--      categoria recusa chave fora do catálogo e corpo vazio. Matéria-prima já existente não é
--      tocada nisso.
--   3. `ordem` vem da POSIÇÃO no array (1-based). `ordem` no corpo é recusada com o motivo.
--   4. Na categoria, `config = coalesce(antes, '{}') || corpo`: merge, nunca substituição, para
--      ausente e null continuarem diferentes. Chave fora de `orcamentista_categoria_campo` daquela
--      categoria é ERRO, nomeado. O tipo é conferido pelo catálogo: texto→string, numero→number,
--      inteiro→number SEM parte fracionária, booleano→boolean, lista_texto→array de strings,
--      mapa→object. Valor null passa: é o "limpar".
--   5. Fornecedores: lista não vazia tem EXATAMENTE um principal — zero também é erro; o índice
--      único só pega o segundo. O principal é o do estado RESULTANTE (o do item, se veio; senão o de
--      antes). E o fornecedor tem de ser do NICHO DA EMPRESA, medido em 23/10/2026: o caminho é
--      único, `orcamentista_config.nicho_id` (PK `tenant_id`, uma linha por empresa — o mesmo que
--      a rota usa em `nichoDaEmpresa`). `tenants.segment` é a segmentação fiscal do cliente, outra
--      coisa. Empresa sem nicho configurado não tem fornecedor que possa ser dela: recusa nomeada.
--
-- ══ O QUE O PADRÃO NÃO TINHA, e estas tabelas exigem ══
--   - `id` substituto: `jsonb_populate_record` devolve `id` NULL para linha nova, e NOT NULL com
--     DEFAULT não se aplica a NULL explícito. O id vai no registro: o de antes, ou um novo.
--   - o principal: antes do upsert, todos os principais da categoria viram false, e cada linha
--     recebe o principal RESULTANTE já calculado — sem isso a troca de principal violaria o índice
--     único no meio do laço.
--   - `orcamentista_mp_instalacao` não tem `ordem`; a chave natural é `produto`.
--
-- ══ NASCEM FECHADAS ══
-- `SECURITY DEFINER` com `SET search_path = public, pg_temp`; `REVOKE ALL ... FROM PUBLIC, anon,
-- authenticated` e `GRANT EXECUTE ... TO service_role`, e só. A VERIFICAÇÃO no fim aborta se alguma
-- das sete não existir, não for SECURITY DEFINER, perder o search_path, for executável por PUBLIC,
-- anon ou authenticated, não for por service_role — ou tiver ACL nula ou com entrada de PUBLIC,
-- que é por onde authenticated herdaria o EXECUTE.
--
-- IDEMPOTENTE: CREATE OR REPLACE, e REVOKE/GRANT repetem sem efeito.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT e registre o `name` como o nome COMPLETO deste arquivo,
--     sem a extensão: `20261023000003_funcoes_dos_tres_niveis`. ATENÇÃO: o corpo de função entre
--     `$fn$` É O ARTEFATO — o catálogo guarda o texto (`prosrc`). Não enxugue comentário de dentro
--     dos corpos sem a prova da árvore PL/pgSQL (`transformacao-quebra-a-cadeia-de-hash.md`);
--   - pelo SQL Editor: como está. O Editor transporta CRLF: o `prosrc` fica com `\r` a mais, e só.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';`.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. AS MATÉRIAS-PRIMAS — cria e atualiza; NÃO APAGA ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_materia_prima(
  p_tenant uuid, p_por uuid, p_lista jsonb
) RETURNS jsonb
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
$fn$;

-- ── 2. A CATEGORIA DE UMA MATÉRIA-PRIMA — config por merge, chaves e tipos pelo catálogo ────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_categoria(
  p_tenant uuid, p_por uuid, p_materia_prima uuid, p_categoria text, p_corpo jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
  SELECT string_agg(format('%s (esperado %s)', e.key, c.tipo), ', ' ORDER BY e.key) INTO v_fora
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
$fn$;

-- ── 3. OS FORNECEDORES DE UMA CATEGORIA — exatamente um principal, e do nicho da empresa ────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_fornecedores(
  p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

-- ── 4. OS VIDROS — uma linha por vidro; chave natural lower(descricao) ─────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_vidros(
  p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

-- ── 5. AS FERRAGENS — uma linha por código; interna e externa são duas ─────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_ferragens(
  p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

-- ── 6. A INSTALAÇÃO — uma linha por produto; usa NULL e usa false sobrevivem ───────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_mp_instalacao(
  p_tenant uuid, p_por uuid, p_mp_categoria uuid, p_lista jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

-- ── 7. REMOVER UMA MATÉRIA-PRIMA — a única que apaga; loga a ÁRVORE antes do CASCADE ───────
CREATE OR REPLACE FUNCTION public.superadmin_remover_materia_prima(
  p_tenant uuid, p_por uuid, p_materia_prima uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_mp     jsonb;
  v_cats   uuid[];
  v_antes  jsonb;
  v_depois jsonb;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_remover_materia_prima:' || p_tenant::text || ':' || coalesce(p_materia_prima::text, ''), 0));
  SELECT to_jsonb(m) INTO v_mp
    FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant FOR UPDATE;
  IF v_mp IS NULL THEN
    RAISE EXCEPTION 'materia-prima inexistente nesta empresa' USING ERRCODE = 'no_data_found';
  END IF;
  -- trava a árvore inteira antes de lê-la: o que o log disser que havia é o que o CASCADE apaga
  SELECT coalesce(array_agg(c.id), '{}') INTO v_cats
    FROM (SELECT x.id FROM public.orcamentista_mp_categoria x WHERE x.materia_prima_id = p_materia_prima AND x.tenant_id = p_tenant FOR UPDATE) c;
  PERFORM 1 FROM public.orcamentista_mp_categoria_fornecedor x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;
  PERFORM 1 FROM public.orcamentista_mp_vidro x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;
  PERFORM 1 FROM public.orcamentista_mp_ferragem x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;
  PERFORM 1 FROM public.orcamentista_mp_instalacao x WHERE x.mp_categoria_id = ANY (v_cats) FOR UPDATE;

  -- o ANTES completo: depois do CASCADE não há de onde reconstruir
  v_antes := jsonb_build_object(
    'orcamentista_materia_prima', v_mp,
    'orcamentista_mp_categoria', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.categoria_chave)
                                             FROM public.orcamentista_mp_categoria c WHERE c.id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_categoria_fornecedor', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.mp_categoria_id, f.ordem)
                                             FROM public.orcamentista_mp_categoria_fornecedor f WHERE f.mp_categoria_id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_vidro', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.ordem)
                                             FROM public.orcamentista_mp_vidro v WHERE v.mp_categoria_id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_ferragem', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.ordem)
                                             FROM public.orcamentista_mp_ferragem g WHERE g.mp_categoria_id = ANY (v_cats)), '[]'::jsonb),
    'orcamentista_mp_instalacao', coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.produto)
                                             FROM public.orcamentista_mp_instalacao i WHERE i.mp_categoria_id = ANY (v_cats)), '[]'::jsonb));

  DELETE FROM public.orcamentista_materia_prima m WHERE m.id = p_materia_prima AND m.tenant_id = p_tenant;
  v_depois := jsonb_build_object('orcamentista_materia_prima', NULL);

  -- UMA linha de log, com a árvore inteira no antes
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_materia_prima', p_materia_prima::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
$fn$;

-- ── 8. FECHADAS: só service_role executa ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.superadmin_gravar_materia_prima(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_materia_prima(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_mp_fornecedores(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_fornecedores(uuid, uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_mp_vidros(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_vidros(uuid, uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_mp_instalacao(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_mp_instalacao(uuid, uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_remover_materia_prima(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_remover_materia_prima(uuid, uuid, uuid) TO service_role;

-- ── 9. VERIFICAÇÃO — aborta a migração inteira se alguma das sete nasceu aberta ────────────
DO $verifica$
DECLARE
  assinaturas text[] := ARRAY[
    'public.superadmin_gravar_materia_prima(uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_categoria(uuid, uuid, uuid, text, jsonb)',
    'public.superadmin_gravar_mp_fornecedores(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_vidros(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_ferragens(uuid, uuid, uuid, jsonb)',
    'public.superadmin_gravar_mp_instalacao(uuid, uuid, uuid, jsonb)',
    'public.superadmin_remover_materia_prima(uuid, uuid, uuid)'
  ];
  a        text;
  f        regprocedure;
  aberta   text;
  sem_path text;
  herdada  text;
BEGIN
  FOREACH a IN ARRAY assinaturas LOOP
    f := to_regprocedure(a);
    -- (1) existe, é SECURITY DEFINER e tem o search_path fixo
    IF f IS NULL THEN
      RAISE EXCEPTION 'a funcao % nao existe. Nada foi alterado.', a;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef
                     AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      sem_path := concat_ws('; ', sem_path, a);
    END IF;
    -- (2) PUBLIC, anon e authenticated não executam; service_role executa
    IF has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      aberta := concat_ws('; ', aberta, a);
    END IF;
    -- (3) nenhuma herança por PUBLIC: ACL nula é o default do Postgres — EXECUTE para PUBLIC —, e
    --     uma entrada de grantee 0 é PUBLIC explícito. Os dois abririam para authenticated.
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.proacl IS NULL)
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x
                   WHERE p.oid = f AND x.grantee = 0 AND x.privilege_type = 'EXECUTE') THEN
      herdada := concat_ws('; ', herdada, a);
    END IF;
  END LOOP;
  IF sem_path IS NOT NULL THEN
    RAISE EXCEPTION 'sem SECURITY DEFINER ou sem search_path fixo no proconfig: %. Nada foi alterado.', sem_path;
  END IF;
  IF aberta IS NOT NULL THEN
    RAISE EXCEPTION 'aberta a PUBLIC/anon/authenticated (ou service_role sem EXECUTE): %. Nada foi alterado.', aberta;
  END IF;
  IF herdada IS NOT NULL THEN
    RAISE EXCEPTION 'EXECUTE herdavel por PUBLIC (ACL nula ou com PUBLIC): %. Nada foi alterado.', herdada;
  END IF;
  RAISE NOTICE 'as 7 funcoes dos tres niveis: fechadas para PUBLIC, anon e authenticated; service_role executa; search_path fixo.';
END
$verifica$;

COMMIT;

-- ── DEPOIS DE APLICAR — pela consulta, não pelo retorno do comando ──────────────────────────
--   select format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) as assinatura,
--          p.prosecdef, p.proconfig,
--          has_function_privilege('public', p.oid, 'EXECUTE')        as public,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (p.proname like 'superadmin_gravar_m%' or p.proname = 'superadmin_remover_materia_prima')
--   order by 1;
--   → 7 linhas; prosecdef = true; proconfig = {"search_path=public, pg_temp"};
--     public, anon e authenticated = false; service_role = true.
-- E então: NOTIFY pgrst, 'reload schema';
