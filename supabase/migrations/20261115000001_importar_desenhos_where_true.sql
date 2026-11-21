-- 20261115000001 — superadmin_importar_desenhos: o DELETE ganha "WHERE true" (a extensao safeupdate)
--
-- JA APLICADA EM PRODUCAO, em 15/11/2026, pelo SQL Editor, SEM ESTE ARQUIVO NO REPOSITORIO. Este arquivo VERSIONA o que esta no banco
-- (tarefa 0011 do ciclo, 21/11/2026): o corpo abaixo tem o md5 do prosrc de producao, medido em 21/11/2026 (be16513def2c92be4dcb1eff51c585ff,
-- sem \r), e a importacao de 15/11/2026 21:22:35 UTC gravou 3.190 linhas com 'migracao' = '20261115000001' no log. Reaplicar nao muda nada.
--
-- O DEFEITO (medido em producao, 15/11/2026, dpl_CjHDzp8YNrFvqfebGYamJNepDjpP): o botao "Importar o indice" respondia "Nao foi possivel
-- importar o indice dos desenhos" com SQLSTATE 21000, "DELETE requires a WHERE clause". O papel authenticator (por onde o PostgREST entra,
-- inclusive como service_role) tem session_preload_libraries=safeupdate (medido em pg_roles.rolconfig), e a extensao recusa DELETE sem WHERE
-- tambem dentro de funcao PL/pgSQL. A 20261111000001 apagava com "DELETE FROM public.orcamentista_tipologia_desenho;".
--
-- O QUE MUDA, e so isto: o DELETE passa a "DELETE ... WHERE true" (mesmo efeito), com o comentario do porque, e o log marca
-- 'migracao' = '20261115000001'. Assinatura, SECURITY DEFINER, search_path, trava do encolhimento, conferencia da contagem e o apagar e
-- regravar numa transacao so (a funcao) ficam como na 20261111000001.
--
-- GUARDA: o corpo em producao tem de ser o da 20261111000001 (md5 e8ceae7ea3b44bd00e542f3792521e9b) ou o desta (be16513d...); outro aborta.
-- Sem dado de conta: a tabela e do catalogo global; nada e apagado nem gravado pela migracao.

BEGIN;

DO $guarda$
DECLARE v text;
BEGIN
  SELECT md5(replace(prosrc, E'\r', '')) INTO v FROM pg_proc
   WHERE oid = to_regprocedure('public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)');
  IF v IS NULL THEN
    RAISE EXCEPTION 'guarda: superadmin_importar_desenhos(uuid, text, jsonb, boolean) nao existe em % (usuario %): aplique a 20261111000001 antes.', current_database(), current_user;
  END IF;
  IF v NOT IN ('e8ceae7ea3b44bd00e542f3792521e9b', 'be16513def2c92be4dcb1eff51c585ff') THEN
    RAISE EXCEPTION 'guarda: o corpo de superadmin_importar_desenhos em % tem md5 %, nem o da 20261111000001 nem o desta. Nada foi alterado.', current_database(), v;
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.superadmin_importar_desenhos(p_por uuid, p_sha256 text, p_linhas jsonb, p_permitir_encolher boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_antes int;
  v_depois int;
  v_recebidas int;
  v_ultimo text;
  v_chave text;
BEGIN
  -- o indice e identificado pelo sha256 do arquivo: sem ele, a importacao nao sabe dizer o que gravou
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'sha256 do indice: obrigatorio, 64 caracteres hexadecimais minusculos.' USING ERRCODE = '22023';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'linhas: obrigatorias, uma lista nao vazia.' USING ERRCODE = '22023';
  END IF;
  -- quem chama diz, toda vez, se aceita encolher: nulo nao e "nao", e recusa
  IF p_permitir_encolher IS NULL THEN
    RAISE EXCEPTION 'permitir_encolher: obrigatorio, true ou false.' USING ERRCODE = '22023';
  END IF;
  -- chave desconhecida no objeto e recusa nomeada, nunca ignorada (jsonb_to_recordset a ignoraria em silencio)
  SELECT k INTO v_chave
    FROM jsonb_array_elements(p_linhas) e, jsonb_object_keys(e) k
   WHERE k NOT IN ('fonte', 'grupo', 'codigo', 'codigo_dp', 'descricao', 'liberado_para_venda', 'condicao', 'caminho_no_storage')
   LIMIT 1;
  IF v_chave IS NOT NULL THEN
    RAISE EXCEPTION 'linhas: chave desconhecida "%".', v_chave USING ERRCODE = '22023';
  END IF;

  -- duas importacoes ao mesmo tempo se enfileiram
  PERFORM pg_advisory_xact_lock(hashtext('orcamentista_tipologia_desenho'));

  -- o mesmo indice da ultima importacao: nada a apagar nem a regravar
  SELECT l.chave INTO v_ultimo FROM public.superadmin_alteracao_log l
   WHERE l.tabela = 'orcamentista_tipologia_desenho' ORDER BY l.em DESC LIMIT 1;
  SELECT count(*) INTO v_antes FROM public.orcamentista_tipologia_desenho;
  IF v_ultimo = p_sha256 AND v_antes = jsonb_array_length(p_linhas) THEN
    RETURN jsonb_build_object('resultado', 'igual', 'linhas', v_antes);
  END IF;

  -- A TRAVA DO ENCOLHIMENTO: um indice com menos linhas do que a tabela tem so entra com permissao explicita
  v_recebidas := jsonb_array_length(p_linhas);
  IF v_recebidas < v_antes AND NOT p_permitir_encolher THEN
    RAISE EXCEPTION 'o indice novo tem % linhas e a tabela tem %: encolher exige permitir_encolher = true. Nada foi alterado.', v_recebidas, v_antes
      USING ERRCODE = '22023';
  END IF;

  -- APAGA E REGRAVA: todas as colunas vem do indice (tabela-que-a-importacao-apaga.md: o processo sabe reescrever cada uma)
  -- O "WHERE true" NAO muda o efeito: e a forma que a extensao safeupdate exige. O papel authenticator, por onde o
  -- PostgREST entra (inclusive como service_role), carrega session_preload_libraries=safeupdate, e ela recusa
  -- DELETE sem WHERE com SQLSTATE 21000 ("DELETE requires a WHERE clause"), tambem dentro de funcao PL/pgSQL.
  -- Medido em producao em 15/11/2026: era por isso que a importacao do indice dos desenhos nunca gravava.
  DELETE FROM public.orcamentista_tipologia_desenho WHERE true;
  INSERT INTO public.orcamentista_tipologia_desenho (fonte, grupo, codigo, codigo_dp, descricao, liberado_para_venda, condicao, caminho_no_storage)
  SELECT x.fonte, x.grupo, x.codigo, x.codigo_dp, x.descricao, x.liberado_para_venda, x.condicao, x.caminho_no_storage
    FROM jsonb_to_recordset(p_linhas) AS x(fonte text, grupo text, codigo text, codigo_dp text, descricao text,
                                           liberado_para_venda boolean, condicao text, caminho_no_storage text);
  GET DIAGNOSTICS v_depois = ROW_COUNT;
  IF v_depois <> v_recebidas THEN
    RAISE EXCEPTION 'a importacao gravou % linhas e recebeu %. Nada foi alterado.', v_depois, v_recebidas;
  END IF;

  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_tipologia_desenho', p_sha256,
          jsonb_build_object('linhas', v_antes),
          jsonb_build_object('linhas', v_depois, 'recebidas', v_recebidas, 'permitir_encolher', p_permitir_encolher,
                             'sha256', p_sha256, 'migracao', '20261115000001'),
          p_por);
  RETURN jsonb_build_object('resultado', 'importado', 'antes', v_antes, 'linhas', v_depois);
END
$fn$;
REVOKE ALL ON FUNCTION public.superadmin_importar_desenhos(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_importar_desenhos(uuid, text, jsonb, boolean) TO service_role;

DO $verifica$
DECLARE v_fn record;
BEGIN
  SELECT prosecdef, proconfig, md5(replace(prosrc, E'\r', '')) AS m INTO v_fn FROM pg_proc
   WHERE oid = to_regprocedure('public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)');
  IF v_fn.m IS DISTINCT FROM 'be16513def2c92be4dcb1eff51c585ff' THEN
    RAISE EXCEPTION 'verificacao: o corpo gravado tem md5 %, esperado be16513def2c92be4dcb1eff51c585ff.', v_fn.m;
  END IF;
  IF NOT v_fn.prosecdef OR v_fn.proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_fn.proconfig)) THEN
    RAISE EXCEPTION 'verificacao: a funcao nao e SECURITY DEFINER com search_path fixo.';
  END IF;
  IF has_function_privilege('anon', 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.superadmin_importar_desenhos(uuid, text, jsonb, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao: o EXECUTE da funcao nao e so do service_role.';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;
