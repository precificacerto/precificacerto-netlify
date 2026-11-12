-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261112000003 — a TROCA DO ARQUIVO da tabela no MESMO lugar, com a trava que protege: a importação
-- que não encolhe sem permissão, numa transação só, com as contagens e o sha256 no log.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, ANTES do merge do PR que a traz.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261112000003_importacao_que_nao_encolhe.
-- ║ SEM ELA a rota da importação falha com a frase nomeada (a função nova não existe): o código
-- ║ novo só importa por ela. As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÊ — decisão do dono do produto, 12/11/2026: "atualizar a tabela de um fornecedor é trocar o arquivo
-- da tabela que já existe, no mesmo lugar. Não se cria tabela nova a cada reajuste e não se exclui a antiga."
-- No lugar da recusa da tela ("o arquivo dela não se troca"), a trava que realmente protege — a mesma de
-- `superadmin_importar_desenhos`: o parâmetro de encolher OBRIGATÓRIO, as contagens antes e depois no log
-- com o sha256 do arquivo e quem importou, e tudo numa transação.
--
-- POR QUE UMA FUNÇÃO (e não a rota fazendo os passos): o PostgREST não abre uma transação que atravesse duas
-- chamadas. Contar, apagar, regravar, trocar o arquivo e logar em chamadas separadas deixaria, numa falha no
-- meio, a tabela com o arquivo novo e os itens velhos, ou sem itens. Numa função, qualquer exceção desfaz tudo.
--
-- O LIMITE DE TEMPO (`20261026000001`): o PostgREST IÇA para a transação o `statement_timeout` da função que ele CHAMA,
-- antes da chamada. A porta de entrada passa a ser esta função: sem o SET dela, a importação voltaria aos 8 s do
-- papel `authenticator` — o defeito de 25/10/2026. Por isso o mesmo SET de 35 s, e a verificação o confere.
--
-- POR QUE ENVOLVER, E NÃO REDEFINIR, `importar_conteudo_da_tabela`: ela tem 12.259 caracteres, está aplicada e
-- imutável (`migracao.md`), e faz o trabalho certo (apaga e regrava os itens e o conteúdo do motor por
-- tabela_id, e grava `orcamentista_importacao`). A função nova a CHAMA dentro da mesma transação: se a conferência
-- depois dela falhar, a exceção desfaz também o DELETE e o INSERT de dentro. A guarda confere o corpo dela pelo md5.
--
-- O QUE FAZ:
--   1. `superadmin_importar_tabela(p_por uuid, p_tabela_id uuid, p_sha256 text, p_payload jsonb,
--      p_permitir_encolher boolean, p_arquivo_path text, p_arquivo_nome text) RETURNS jsonb`,
--      SECURITY DEFINER, search_path fixo, SEM parâmetro com default (todos obrigatórios; o arquivo nulo
--      é "o mesmo de antes", dito de propósito):
--        a. recusa (22023) p_permitir_encolher nulo, sha256 fora da forma, arquivo pela metade;
--        b. trava a linha da tabela (FOR UPDATE) e conta os itens ANTES;
--        c. ENCOLHER sem permissão é recusa (23514), com as duas contagens na frase, ANTES de apagar;
--        d. chama `importar_conteudo_da_tabela(p_tabela_id, p_payload)`;
--        e. conta DEPOIS e confere contra o que entrou — diferença é exceção (desfaz tudo);
--        f. troca o arquivo da tabela (o gatilho de `arquivo_em` grava o instante), se veio arquivo;
--        g. loga em `superadmin_alteracao_log`: antes (itens, arquivo) e depois (itens, arquivo, sha256,
--           permitiu encolher), por quem.
--   2. REVOKE EXECUTE de `importar_conteudo_da_tabela` FROM service_role: a rota só importa pela função nova,
--      e ninguém passa por fora da trava. (O dono da função, que a nova chama, continua podendo.)
-- Nenhuma linha de dado é alterada pela migração.
--
-- GUARDA (aborta): as tabelas e a função de dentro existem, com o corpo medido em produção em 12/11/2026
-- (md5 sem o \r d98800431ea61fede9cab6593d01f007); a função nova já existente com outro corpo.
-- VERIFICAÇÃO (aborta): a função nova com a assinatura, SECURITY DEFINER, o search_path, sem default, e só o
-- service_role com EXECUTE; a de dentro sem EXECUTE para anon, authenticated e service_role.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  corpo text;
BEGIN
  IF to_regclass('public.orcamentista_tabela') IS NULL OR to_regclass('public.orcamentista_tabela_item') IS NULL
     OR to_regclass('public.superadmin_alteracao_log') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: orcamentista_tabela, orcamentista_tabela_item ou superadmin_alteracao_log. Nada foi alterado.';
  END IF;
  SELECT replace(prosrc, chr(13), '') INTO corpo FROM pg_proc
   WHERE oid = to_regprocedure('public.importar_conteudo_da_tabela(uuid, jsonb)');
  IF corpo IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.importar_conteudo_da_tabela(uuid, jsonb). Nada foi alterado.';
  END IF;
  IF md5(corpo) <> 'd98800431ea61fede9cab6593d01f007' THEN
    RAISE EXCEPTION 'importar_conteudo_da_tabela tem outro corpo (md5 %), nao o medido em 12/11/2026. Nada foi alterado.', md5(corpo);
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.superadmin_importar_tabela(
  p_por uuid, p_tabela_id uuid, p_sha256 text, p_payload jsonb, p_permitir_encolher boolean, p_arquivo_path text, p_arquivo_nome text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '35s'
AS $fn$
DECLARE
  antes        int;
  entram       int;
  depois       int;
  arquivo_antes record;
  r            jsonb;
BEGIN
  -- a. as recusas de forma, antes de qualquer leitura
  IF p_permitir_encolher IS NULL THEN
    RAISE EXCEPTION 'p_permitir_encolher e obrigatorio: diga true ou false.' USING ERRCODE = '22023';
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'o sha256 do arquivo tem de vir em 64 hexadecimais minusculos.' USING ERRCODE = '22023';
  END IF;
  IF (p_arquivo_path IS NULL) <> (p_arquivo_nome IS NULL) OR btrim(coalesce(p_arquivo_path, 'x')) = '' OR btrim(coalesce(p_arquivo_nome, 'x')) = '' THEN
    RAISE EXCEPTION 'o arquivo novo chegou pela metade: o caminho e o nome andam juntos.' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload -> 'itens') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'o payload nao tem a lista de itens.' USING ERRCODE = '22023';
  END IF;

  -- b. a linha da tabela travada, e a contagem de antes
  SELECT arquivo_path, arquivo_nome INTO arquivo_antes FROM public.orcamentista_tabela WHERE id = p_tabela_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tabela nao encontrada.' USING ERRCODE = 'P0002';
  END IF;
  SELECT count(*) INTO antes FROM public.orcamentista_tabela_item WHERE tabela_id = p_tabela_id;
  entram := jsonb_array_length(p_payload -> 'itens');

  -- c. ENCOLHER sem permissao e recusa, antes de apagar qualquer coisa
  IF entram < antes AND NOT p_permitir_encolher THEN
    RAISE EXCEPTION 'o arquivo novo traz % itens, e a tabela tem % hoje: a tabela encolheria % itens. Confirme que pode encolher. Nada foi alterado.',
      entram, antes, antes - entram USING ERRCODE = '23514';
  END IF;

  -- d. a importacao de sempre, na MESMA transacao
  r := public.importar_conteudo_da_tabela(p_tabela_id, p_payload);

  -- e. a conferencia: o que ficou e o que entrou
  SELECT count(*) INTO depois FROM public.orcamentista_tabela_item WHERE tabela_id = p_tabela_id;
  IF depois <> entram THEN
    RAISE EXCEPTION 'a gravacao deixou % itens, e entraram %: nada foi alterado.', depois, entram;
  END IF;

  -- f. o arquivo novo, no MESMO lugar (o gatilho de arquivo_em grava o instante da troca)
  IF p_arquivo_path IS NOT NULL THEN
    UPDATE public.orcamentista_tabela SET arquivo_path = p_arquivo_path, arquivo_nome = p_arquivo_nome WHERE id = p_tabela_id;
  END IF;

  -- g. o log: as contagens, o arquivo e o sha256, por quem
  INSERT INTO public.superadmin_alteracao_log (tenant_id, tabela, chave, antes, depois, por)
  VALUES (NULL, 'orcamentista_tabela_item', p_tabela_id::text,
    jsonb_build_object('itens', antes, 'arquivo_path', arquivo_antes.arquivo_path, 'arquivo_nome', arquivo_antes.arquivo_nome),
    jsonb_build_object('itens', depois, 'arquivo_path', coalesce(p_arquivo_path, arquivo_antes.arquivo_path),
      'arquivo_nome', coalesce(p_arquivo_nome, arquivo_antes.arquivo_nome), 'sha256', p_sha256, 'permitiu_encolher', p_permitir_encolher,
      'importacao', 'superadmin_importar_tabela 20261112000003'),
    p_por);

  RETURN r || jsonb_build_object('itens_antes', antes, 'itens_depois', depois, 'sha256', p_sha256, 'arquivo_trocado', p_arquivo_path IS NOT NULL);
END
$fn$;

REVOKE ALL ON FUNCTION public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text) IS
  'A importacao da tabela no MESMO lugar (20261112000003): conta antes, recusa encolher sem p_permitir_encolher, chama importar_conteudo_da_tabela, confere depois, troca o arquivo e loga com o sha256 - numa transacao.';

DO $verifica$
DECLARE
  f record;
  quem text;
BEGIN
  SELECT p.prosecdef, p.proconfig, p.pronargdefaults INTO f FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)');
  IF f IS NULL OR NOT f.prosecdef OR f.pronargdefaults <> 0 OR NOT (f.proconfig @> ARRAY['search_path=public, pg_temp', 'statement_timeout=35s']) THEN
    RAISE EXCEPTION 'verificacao 1: superadmin_importar_tabela ausente, sem SECURITY DEFINER, com default, sem o search_path ou sem o statement_timeout de 35s. Nada foi alterado.';
  END IF;
  SELECT string_agg(grantee, ',' ORDER BY grantee) INTO quem FROM information_schema.routine_privileges
   WHERE routine_schema = 'public' AND routine_name = 'superadmin_importar_tabela' AND privilege_type = 'EXECUTE' AND grantee <> 'postgres';
  IF quem IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'verificacao 2: EXECUTE de superadmin_importar_tabela devia ser so do service_role (alem do dono), e e: %. Nada foi alterado.', quem;
  END IF;
  SELECT string_agg(grantee, ',' ORDER BY grantee) INTO quem FROM information_schema.routine_privileges
   WHERE routine_schema = 'public' AND routine_name = 'importar_conteudo_da_tabela' AND privilege_type = 'EXECUTE'
     AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role');
  IF quem IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 3: importar_conteudo_da_tabela ainda tem EXECUTE para %: a trava teria um caminho por fora. Nada foi alterado.', quem;
  END IF;
  RAISE NOTICE 'superadmin_importar_tabela (sem default, SECURITY DEFINER, so service_role) e importar_conteudo_da_tabela sem EXECUTE direto.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.pronargdefaults, p.proconfig
--   from pg_proc p where p.proname in ('superadmin_importar_tabela', 'importar_conteudo_da_tabela');
-- select routine_name, grantee from information_schema.routine_privileges
--  where routine_name in ('superadmin_importar_tabela', 'importar_conteudo_da_tabela') and privilege_type = 'EXECUTE';
-- -- esperado: superadmin_importar_tabela só service_role (e o dono); importar_conteudo_da_tabela só o dono
