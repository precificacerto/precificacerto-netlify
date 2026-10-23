-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261023000001 — as FUNÇÕES que gravam a base de conhecimento, cada uma com o seu log, na
-- MESMA transação — e que NASCEM FECHADAS
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- ESTADO: NÃO APLICADA por quem a escreveu. Quem aplica é o dono do produto.
--
-- ORDEM: aplicar ANTES do merge das rotas de `/api/super-admin/base-de-conhecimento/`, que CHAMAM
-- estas funções — mergear antes deixa o botão chamando função inexistente
-- (`migration-delivery.md`, "a ordem depende do que a migração cria"). Depende das tabelas da
-- `20261022000004` (aplicada em 23/10/2026).
--
-- ══ POR QUE FUNÇÕES, e não duas chamadas da rota ══
-- O super admin não tem tenant: a empresa que ele edita chega pelo PEDIDO, e é por essa porta que
-- uma escrita cairia na empresa errada. `superadmin_alteracao_log` é como se descobre isso depois —
-- e um log que pode FALTAR justamente quando algo deu errado é pior que nenhum, porque dá
-- confiança falsa (dono do produto, 23/10/2026). Pelo PostgREST cada chamada é uma transação; duas
-- chamadas (gravar, depois logar) nunca são atômicas. Uma função é: o corpo de uma função plpgsql
-- roda dentro da transação da chamada, e QUALQUER exceção — na validação, na gravação ou no
-- INSERT do log — desfaz tudo. Por isso o log é gravado DENTRO de cada função, e por último.
--
-- ══ O QUE CADA FUNÇÃO FAZ, nesta ordem ══
--   1. confere que o `por` é super admin (`users.is_super_admin`). O `por` é ARGUMENTO: a função
--      nunca o deduz — quem chama é a rota, com service_role, e `auth.uid()` ali é nulo;
--   2. confere que a empresa (ou o nicho) existe → `no_data_found` (P0002);
--   3. valida o que o banco sabe validar: o formato do JSON, as chaves (só colunas da tabela, lidas
--      do catálogo — nunca a chave nem as colunas de auditoria), item repetido, funcionário de
--      outra empresa → `invalid_parameter_value` (22023) / `foreign_key_violation` (23503). Os
--      CHECK das tabelas fazem o resto (23514);
--   4. trava (`pg_advisory_xact_lock` por empresa ou nicho, mais `FOR UPDATE` nas linhas) e lê o
--      ANTES. O advisory existe porque `FOR UPDATE` não trava linha que ainda não existe: sem ele,
--      duas primeiras gravações simultâneas leriam ambas "antes = nada", e o segundo log mentiria;
--   5. grava. AUSENTE × NULL × FALSE: o estado novo é `antes || corpo` — chave ausente no corpo
--      mantém o valor de antes; chave com null grava NULL (na base da empresa: volta a HERDAR o
--      padrão do nicho); false grava false. Nas LISTAS (ambiente, vendedor) a lista É o estado:
--      item que não veio sai; dentro de um item que já existia, a mesma regra de campo;
--   6. insere UMA linha em `superadmin_alteracao_log`: tabela, chave, antes, depois, por (e `em`
--      pelo default). `antes` e `depois` são objetos com o nome da tabela como chave — numa
--      chamada que grava duas tabelas, as duas vêm na MESMA linha;
--   7. devolve o DEPOIS.
--
-- ══ NASCEM FECHADAS (dono do produto, 23/10/2026 — não negociável) ══
-- Em 21/10/2026 nove funções SECURITY DEFINER estavam alcançáveis por anon e authenticated, uma
-- delas apagando venda em cascata a partir da chave do navegador (`20261021000003`). O Supabase
-- dá EXECUTE a anon e authenticated em toda função nova (default privileges), e o Postgres dá a
-- PUBLIC. Por isso cada função aqui tem:
--   - `SECURITY DEFINER` com `SET search_path = public, pg_temp` NA DEFINIÇÃO;
--   - `REVOKE ALL ... FROM PUBLIC, anon, authenticated` e `GRANT EXECUTE ... TO service_role`, e só;
-- e o bloco de VERIFICAÇÃO no fim ABORTA a migração inteira se alguma das quatro não existir, for
-- executável por PUBLIC, anon ou authenticated, não for executável por service_role, não for
-- SECURITY DEFINER, ou não tiver o search_path fixo no `proconfig`. Formato da `20261021000003`.
--
-- IDEMPOTENTE: CREATE OR REPLACE, e REVOKE/GRANT repetem sem efeito. A assinatura de cada função
-- é a mesma em toda aplicação.
--
-- COMO APLICAR (`migration-delivery.md`)
--   - pelo conector: tire o BEGIN e o COMMIT e registre o `name` como o nome COMPLETO deste arquivo,
--     sem a extensão: `20261023000001_funcoes_da_base_de_conhecimento`. ATENÇÃO: o corpo de função
--     entre `$fn$` É O ARTEFATO — o catálogo guarda o texto (`prosrc`). Não enxugue comentário de
--     dentro dos corpos sem a prova da árvore PL/pgSQL (`transformacao-quebra-a-cadeia-de-hash.md`).
--     Publique o md5 do arquivo E o do payload, com a transformação nomeada entre eles;
--   - pelo SQL Editor: como está.
--   - DEPOIS: `NOTIFY pgrst, 'reload schema';` — sem ele o PostgREST não enxerga as funções novas.
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. A BASE DA EMPRESA: esquadrias e adicionais, numa chamada e numa linha de log ─────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_base_da_empresa(
  p_tenant uuid, p_por uuid, p_esquadrias jsonb, p_adicionais jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes_e jsonb;
  v_antes_a jsonb;
  v_antes   jsonb := '{}'::jsonb;
  v_depois  jsonb := '{}'::jsonb;
  v_tabelas text[] := '{}';
  v_fora    text;
  v_set     text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant) THEN
    RAISE EXCEPTION 'empresa inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF (p_esquadrias IS NOT NULL AND jsonb_typeof(p_esquadrias) <> 'object')
     OR (p_adicionais IS NOT NULL AND jsonb_typeof(p_adicionais) <> 'object') THEN
    RAISE EXCEPTION 'esquadrias e adicionais sao objetos' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF coalesce(p_esquadrias, '{}'::jsonb) = '{}'::jsonb AND coalesce(p_adicionais, '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'nada a gravar' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- as chaves: só colunas de configuração, lidas do catálogo
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_object_keys(coalesce(p_esquadrias, '{}'::jsonb)) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_esquadrias_base'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('tenant_id', 'atualizado_por', 'atualizado_em'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) em esquadrias: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_object_keys(coalesce(p_adicionais, '{}'::jsonb)) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_base_conhecimento'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('tenant_id', 'atualizado_por', 'atualizado_em'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) em adicionais: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_base_da_empresa:' || p_tenant::text, 0));

  IF coalesce(p_esquadrias, '{}'::jsonb) <> '{}'::jsonb THEN
    SELECT to_jsonb(b) INTO v_antes_e FROM public.orcamentista_esquadrias_base b WHERE b.tenant_id = p_tenant FOR UPDATE;
    SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
      FROM pg_attribute a
     WHERE a.attrelid = 'public.orcamentista_esquadrias_base'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'tenant_id';
    -- antes || corpo: o ausente fica, o null limpa, o false grava
    EXECUTE format('INSERT INTO public.orcamentista_esquadrias_base SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_esquadrias_base, $1) ON CONFLICT (tenant_id) DO UPDATE SET %s', v_set)
      USING coalesce(v_antes_e, '{}'::jsonb) || p_esquadrias
            || jsonb_build_object('tenant_id', p_tenant, 'atualizado_por', p_por, 'atualizado_em', now());
    v_tabelas := v_tabelas || 'orcamentista_esquadrias_base'::text;
    v_antes   := v_antes || jsonb_build_object('orcamentista_esquadrias_base', v_antes_e);
    v_depois  := v_depois || jsonb_build_object('orcamentista_esquadrias_base',
                   (SELECT to_jsonb(b) FROM public.orcamentista_esquadrias_base b WHERE b.tenant_id = p_tenant));
  END IF;

  IF coalesce(p_adicionais, '{}'::jsonb) <> '{}'::jsonb THEN
    SELECT to_jsonb(b) INTO v_antes_a FROM public.orcamentista_base_conhecimento b WHERE b.tenant_id = p_tenant FOR UPDATE;
    SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
      FROM pg_attribute a
     WHERE a.attrelid = 'public.orcamentista_base_conhecimento'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'tenant_id';
    -- a coerência (CHECK) é do estado RESULTANTE: um valor ausente no corpo continua valendo
    EXECUTE format('INSERT INTO public.orcamentista_base_conhecimento SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_base_conhecimento, $1) ON CONFLICT (tenant_id) DO UPDATE SET %s', v_set)
      USING coalesce(v_antes_a, '{}'::jsonb) || p_adicionais
            || jsonb_build_object('tenant_id', p_tenant, 'atualizado_por', p_por, 'atualizado_em', now());
    v_tabelas := v_tabelas || 'orcamentista_base_conhecimento'::text;
    v_antes   := v_antes || jsonb_build_object('orcamentista_base_conhecimento', v_antes_a);
    v_depois  := v_depois || jsonb_build_object('orcamentista_base_conhecimento',
                   (SELECT to_jsonb(b) FROM public.orcamentista_base_conhecimento b WHERE b.tenant_id = p_tenant));
  END IF;

  -- o LOG, por último e na mesma transação: se falhar, a gravação acima é desfeita
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, array_to_string(v_tabelas, ','), p_tenant::text, v_antes, v_depois, p_por);

  RETURN v_depois;
END
$fn$;

-- ── 2. O PADRÃO DO NICHO — sem empresa; o log vai com tenant_id NULL ─────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_esquadrias_padrao(
  p_nicho uuid, p_por uuid, p_campos jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_fora   text;
  v_set    text;
BEGIN
  IF p_por IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_por AND u.is_super_admin IS TRUE) THEN
    RAISE EXCEPTION 'o autor da alteracao nao e super admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_nicho IS NULL OR NOT EXISTS (SELECT 1 FROM public.orcamentista_nicho n WHERE n.id = p_nicho) THEN
    RAISE EXCEPTION 'nicho inexistente' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb THEN
    RAISE EXCEPTION 'nada a gravar' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_object_keys(p_campos) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_esquadrias_padrao'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('nicho_id', 'atualizado_por', 'atualizado_em'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) no padrao: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_esquadrias_padrao:' || p_nicho::text, 0));
  SELECT to_jsonb(p) INTO v_antes FROM public.orcamentista_esquadrias_padrao p WHERE p.nicho_id = p_nicho FOR UPDATE;
  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_esquadrias_padrao'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname <> 'nicho_id';
  EXECUTE format('INSERT INTO public.orcamentista_esquadrias_padrao SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_esquadrias_padrao, $1) ON CONFLICT (nicho_id) DO UPDATE SET %s', v_set)
    USING coalesce(v_antes, '{}'::jsonb) || p_campos
          || jsonb_build_object('nicho_id', p_nicho, 'atualizado_por', p_por, 'atualizado_em', now());
  SELECT to_jsonb(p) INTO v_depois FROM public.orcamentista_esquadrias_padrao p WHERE p.nicho_id = p_nicho;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_esquadrias_padrao', p_nicho::text,
          jsonb_build_object('orcamentista_esquadrias_padrao', v_antes),
          jsonb_build_object('orcamentista_esquadrias_padrao', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_esquadrias_padrao', v_depois);
END
$fn$;

-- ── 3. O PADRÃO POR AMBIENTE — a lista é o estado ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_padrao_ambiente(
  p_tenant uuid, p_por uuid, p_lista jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_item   jsonb;
  v_linha  jsonb;
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
                 WHERE jsonb_typeof(e) <> 'object' OR jsonb_typeof(e -> 'ambiente') IS DISTINCT FROM 'string'
                    OR btrim(e ->> 'ambiente') = '') THEN
    RAISE EXCEPTION 'a lista de ambientes e uma lista de objetos com ambiente preenchido' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT e ->> 'ambiente') FROM jsonb_array_elements(p_lista) e) THEN
    RAISE EXCEPTION 'ambiente repetido na lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(p_lista) e, jsonb_object_keys(e) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_padrao_ambiente'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('tenant_id', 'atualizado_por', 'atualizado_em'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nos ambientes: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_padrao_ambiente:' || p_tenant::text, 0));
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.ambiente), '[]'::jsonb) INTO v_antes
    FROM (SELECT * FROM public.orcamentista_padrao_ambiente x WHERE x.tenant_id = p_tenant FOR UPDATE) a;

  -- o item que não veio sai
  DELETE FROM public.orcamentista_padrao_ambiente x
   WHERE x.tenant_id = p_tenant
     AND x.ambiente <> ALL (ARRAY(SELECT e ->> 'ambiente' FROM jsonb_array_elements(p_lista) e));

  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_padrao_ambiente'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('tenant_id', 'ambiente');
  FOR v_item IN SELECT e FROM jsonb_array_elements(p_lista) e LOOP
    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_padrao_ambiente x
     WHERE x.tenant_id = p_tenant AND x.ambiente = v_item ->> 'ambiente';
    EXECUTE format('INSERT INTO public.orcamentista_padrao_ambiente SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_padrao_ambiente, $1) ON CONFLICT (tenant_id, ambiente) DO UPDATE SET %s', v_set)
      USING coalesce(v_linha, '{}'::jsonb) || v_item
            || jsonb_build_object('tenant_id', p_tenant, 'atualizado_por', p_por, 'atualizado_em', now());
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.ambiente), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_padrao_ambiente a WHERE a.tenant_id = p_tenant;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_padrao_ambiente', p_tenant::text,
          jsonb_build_object('orcamentista_padrao_ambiente', v_antes),
          jsonb_build_object('orcamentista_padrao_ambiente', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_padrao_ambiente', v_depois);
END
$fn$;

-- ── 4. O PERFIL DO VENDEDOR — a lista é o estado; o funcionário é da MESMA empresa ──────────
CREATE OR REPLACE FUNCTION public.superadmin_gravar_vendedor_perfil(
  p_tenant uuid, p_por uuid, p_lista jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes  jsonb;
  v_depois jsonb;
  v_item   jsonb;
  v_linha  jsonb;
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
                    OR coalesce(e ->> 'employee_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'a lista de vendedores e uma lista de objetos com employee_id (uuid)' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT lower(e ->> 'employee_id')) FROM jsonb_array_elements(p_lista) e) THEN
    RAISE EXCEPTION 'funcionario repetido na lista' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT string_agg(DISTINCT k, ', ' ORDER BY k) INTO v_fora
    FROM jsonb_array_elements(p_lista) e, jsonb_object_keys(e) k
   WHERE k NOT IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.orcamentista_vendedor_perfil'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND a.attname NOT IN ('tenant_id', 'atualizado_por', 'atualizado_em'));
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'campo(s) desconhecido(s) nos vendedores: %', v_fora USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- a FK composta já recusa; aqui a recusa vem ANTES, com o funcionário nomeado
  SELECT string_agg(e ->> 'employee_id', ', ') INTO v_fora
    FROM jsonb_array_elements(p_lista) e
   WHERE NOT EXISTS (SELECT 1 FROM public.employees x WHERE x.id = (e ->> 'employee_id')::uuid AND x.tenant_id = p_tenant);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'funcionario(s) que nao sao desta empresa: %', v_fora USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('superadmin_gravar_vendedor_perfil:' || p_tenant::text, 0));
  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.employee_id), '[]'::jsonb) INTO v_antes
    FROM (SELECT * FROM public.orcamentista_vendedor_perfil x WHERE x.tenant_id = p_tenant FOR UPDATE) v;

  DELETE FROM public.orcamentista_vendedor_perfil x
   WHERE x.tenant_id = p_tenant
     AND x.employee_id <> ALL (ARRAY(SELECT (e ->> 'employee_id')::uuid FROM jsonb_array_elements(p_lista) e));

  SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ') INTO v_set
    FROM pg_attribute a
   WHERE a.attrelid = 'public.orcamentista_vendedor_perfil'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('tenant_id', 'employee_id');
  FOR v_item IN SELECT e FROM jsonb_array_elements(p_lista) e LOOP
    SELECT to_jsonb(x) INTO v_linha FROM public.orcamentista_vendedor_perfil x
     WHERE x.tenant_id = p_tenant AND x.employee_id = (v_item ->> 'employee_id')::uuid;
    EXECUTE format('INSERT INTO public.orcamentista_vendedor_perfil SELECT * FROM jsonb_populate_record(NULL::public.orcamentista_vendedor_perfil, $1) ON CONFLICT (tenant_id, employee_id) DO UPDATE SET %s', v_set)
      USING coalesce(v_linha, '{}'::jsonb) || v_item
            || jsonb_build_object('tenant_id', p_tenant, 'atualizado_por', p_por, 'atualizado_em', now());
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.employee_id), '[]'::jsonb) INTO v_depois
    FROM public.orcamentista_vendedor_perfil v WHERE v.tenant_id = p_tenant;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (p_tenant, 'orcamentista_vendedor_perfil', p_tenant::text,
          jsonb_build_object('orcamentista_vendedor_perfil', v_antes),
          jsonb_build_object('orcamentista_vendedor_perfil', v_depois), p_por);

  RETURN jsonb_build_object('orcamentista_vendedor_perfil', v_depois);
END
$fn$;

-- ── 5. FECHADAS: só service_role executa ────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.superadmin_gravar_base_da_empresa(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_base_da_empresa(uuid, uuid, jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_esquadrias_padrao(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_esquadrias_padrao(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_padrao_ambiente(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_padrao_ambiente(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.superadmin_gravar_vendedor_perfil(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_gravar_vendedor_perfil(uuid, uuid, jsonb) TO service_role;

-- ── 6. VERIFICAÇÃO — aborta a migração inteira se alguma das quatro nasceu aberta ──────────
DO $verifica$
DECLARE
  assinaturas text[] := ARRAY[
    'public.superadmin_gravar_base_da_empresa(uuid, uuid, jsonb, jsonb)',
    'public.superadmin_gravar_esquadrias_padrao(uuid, uuid, jsonb)',
    'public.superadmin_gravar_padrao_ambiente(uuid, uuid, jsonb)',
    'public.superadmin_gravar_vendedor_perfil(uuid, uuid, jsonb)'
  ];
  a        text;
  f        regprocedure;
  aberta   text;
  sem_path text;
BEGIN
  FOREACH a IN ARRAY assinaturas LOOP
    f := to_regprocedure(a);
    IF f IS NULL THEN
      RAISE EXCEPTION 'a funcao % nao existe. Nada foi alterado.', a;
    END IF;
    IF has_function_privilege('public', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      aberta := concat_ws('; ', aberta, a);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f AND p.prosecdef
                     AND 'search_path=public, pg_temp' = ANY (p.proconfig)) THEN
      sem_path := concat_ws('; ', sem_path, a);
    END IF;
  END LOOP;
  IF aberta IS NOT NULL THEN
    RAISE EXCEPTION 'aberta a PUBLIC/anon/authenticated (ou service_role sem EXECUTE): %. Nada foi alterado.', aberta;
  END IF;
  IF sem_path IS NOT NULL THEN
    RAISE EXCEPTION 'sem SECURITY DEFINER ou sem search_path fixo no proconfig: %. Nada foi alterado.', sem_path;
  END IF;
  RAISE NOTICE 'as 4 funcoes da base de conhecimento: fechadas para PUBLIC, anon e authenticated; service_role executa; search_path fixo.';
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
--   where n.nspname = 'public' and p.proname like 'superadmin_gravar_%'
--   order by 1;
--   → 4 linhas; prosecdef = true; proconfig = {"search_path=public, pg_temp"};
--     public, anon e authenticated = false; service_role = true.
-- E então: NOTIFY pgrst, 'reload schema';
