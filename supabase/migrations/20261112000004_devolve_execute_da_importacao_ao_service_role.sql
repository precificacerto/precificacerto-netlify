-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261112000004 — DEVOLVE ao service_role o EXECUTE de `importar_conteudo_da_tabela`, que a 20261112000003
-- tirou cedo demais. Versiona o GRANT que o dono do produto já rodou à mão em produção em 12/11/2026.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE no repositório. Em produção o GRANT JÁ ESTÁ LÁ (rodado à mão pelo dono do produto,
-- ║ 12/11/2026, depois das 15:46 UTC): esta migração é IDEMPOTENTE e, aplicada sobre ele, não muda
-- ║ nada — o GRANT repetido não é erro, e a verificação passa.
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261112000004_devolve_execute_da_importacao_ao_service_role.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- O QUE ACONTECEU (medido, só leitura, 12/11/2026):
--   - às 15:37:56 UTC a 20261112000003 foi aplicada INTEIRA pelo SQL Editor (postgres_logs), inclusive a linha
--     `REVOKE EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role`;
--   - às 15:46 UTC a ACL da função era `{postgres=X/postgres}` e has_function_privilege('service_role', ...) = false:
--     a rota que está publicada, que importa chamando `importar_conteudo_da_tabela` direto pelo service_role, falhava
--     com permissão negada. Nenhuma importação foi tentada na janela (a última é de 08/11/2026);
--   - o dono do produto rodou à mão o GRANT abaixo; conferido por consulta depois: ACL
--     `{postgres=X/postgres,service_role=X/postgres}`, md5 do corpo (sem o \r) d98800431ea61fede9cab6593d01f007 inalterado,
--     1.096 itens e 10 tabelas, `superadmin_importar_tabela` presente com EXECUTE só do service_role.
--   O defeito é do assistente: a 20261112000003 cortava o acesso que a rota em produção usa, e o cabeçalho dela mandava
--   aplicá-la ANTES do merge. A 20261112000003 está aplicada e não muda (`migracao.md`, migração aplicada é imutável);
--   o que o cabeçalho dela diz de errado está corrigido na regra, não no arquivo.
--
-- O QUE FAZ: só o GRANT, exatamente o que foi rodado à mão. Nada mais é concedido, revogado ou alterado.
-- O CORTE do acesso (o REVOKE e a verificação dele, que eram a "verificação 3" da 20261112000003) foi para a
-- 20261112000005, que só se aplica depois que a rota nova estiver mergeada e publicada.
--
-- GUARDA (aborta, nada é alterado):
--   - `importar_conteudo_da_tabela(uuid, jsonb)` ausente, ou com o corpo de md5 (sem o \r) diferente de d98800431ea61fede9cab6593d01f007;
--   - `superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)` ausente (a 20261112000003 não aplicada).
--   A guarda NÃO confere o corpo da `superadmin_importar_tabela`: só que ela existe.
-- VERIFICAÇÃO (aborta, desfaz tudo):
--   1. o service_role executa `importar_conteudo_da_tabela`;
--   2. PUBLIC, anon e authenticated NÃO a executam (o GRANT não abriu a mais ninguém);
--   3. o corpo dela continua com o md5 da guarda.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  corpo text;
BEGIN
  SELECT replace(prosrc, chr(13), '') INTO corpo FROM pg_proc
   WHERE oid = to_regprocedure('public.importar_conteudo_da_tabela(uuid, jsonb)');
  IF corpo IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.importar_conteudo_da_tabela(uuid, jsonb). Nada foi alterado.';
  END IF;
  IF md5(corpo) <> 'd98800431ea61fede9cab6593d01f007' THEN
    RAISE EXCEPTION 'importar_conteudo_da_tabela tem outro corpo (md5 %), nao o medido em 12/11/2026. Nada foi alterado.', md5(corpo);
  END IF;
  IF to_regprocedure('public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)') IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.superadmin_importar_tabela (20261112000003). Nada foi alterado.';
  END IF;
END
$guarda$;

GRANT EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) TO service_role;

DO $verifica$
DECLARE
  quem text;
BEGIN
  IF NOT has_function_privilege('service_role', 'public.importar_conteudo_da_tabela(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao 1: o service_role nao executa importar_conteudo_da_tabela. Nada foi alterado.';
  END IF;
  SELECT string_agg(grantee, ',' ORDER BY grantee) INTO quem FROM information_schema.routine_privileges
   WHERE routine_schema = 'public' AND routine_name = 'importar_conteudo_da_tabela' AND privilege_type = 'EXECUTE'
     AND grantee IN ('PUBLIC', 'anon', 'authenticated');
  IF quem IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 2: importar_conteudo_da_tabela tem EXECUTE para %, alem do service_role. Nada foi alterado.', quem;
  END IF;
  IF (SELECT md5(replace(prosrc, chr(13), '')) FROM pg_proc
       WHERE oid = to_regprocedure('public.importar_conteudo_da_tabela(uuid, jsonb)')) <> 'd98800431ea61fede9cab6593d01f007' THEN
    RAISE EXCEPTION 'verificacao 3: o corpo de importar_conteudo_da_tabela mudou. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'importar_conteudo_da_tabela: EXECUTE do service_role (e do dono), de mais ninguem; corpo d98800431ea61fede9cab6593d01f007.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proacl, md5(replace(prosrc, chr(13), '')) from pg_proc where proname = 'importar_conteudo_da_tabela';
-- -- esperado: {postgres=X/postgres,service_role=X/postgres} e d98800431ea61fede9cab6593d01f007
