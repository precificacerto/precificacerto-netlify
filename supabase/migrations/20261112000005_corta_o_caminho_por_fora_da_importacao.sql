-- SÓ SE APLICA DEPOIS QUE A ROTA NOVA ESTIVER MERGEADA E PUBLICADA (a que importa por superadmin_importar_tabela).
-- ════════════════════════════════════════════════════════════════════════════════════════
-- 20261112000005 — CORTA o caminho por fora da trava: tira o EXECUTE de `importar_conteudo_da_tabela` de PUBLIC,
-- anon, authenticated e service_role, e verifica o corte. Depois dela, a tabela só se importa por
-- `superadmin_importar_tabela` (a 20261112000003), que conta antes, recusa encolher sem permissão e loga.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ PENDENTE. NÃO APLICADA. Quem aplica é o dono do produto, e SÓ DEPOIS que:
-- ║   1. o PR da rota nova (a importação pela `superadmin_importar_tabela`) estiver MERGEADO; e
-- ║   2. o deploy de produção com esse código estiver PUBLICADO (conferido no Vercel, não pelo merge).
-- ║ APLICADA ANTES, ELA DERRUBA TODA IMPORTAÇÃO DE TABELA EM PRODUÇÃO: a rota de hoje importa chamando
-- ║ `importar_conteudo_da_tabela` direto pelo service_role. Foi o que aconteceu em 12/11/2026 entre
-- ║ 15:37:56 e o GRANT rodado à mão, quando este corte ainda estava dentro da 20261112000003
-- ║ (a 20261112000004 versiona o GRANT que o desfez).
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261112000005_corta_o_caminho_por_fora_da_importacao.
-- ║ As partes que executam são ASCII; os acentos estão só em comentário.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- O QUE FAZ: as duas peças que o dono do produto mandou mover JUNTAS da 20261112000003 para cá, e nada mais:
--   1. o REVOKE, com o texto que estava na 20261112000003 (linha 147);
--   2. a verificação do corte, que era a "verificação 3" dela, com o mesmo texto.
--
-- GUARDA (aborta, nada é alterado). O banco não sabe se o deploy foi publicado — isso quem confere é quem aplica.
-- O que a guarda confere é que, depois do corte, sobra um caminho que funciona:
--   - `importar_conteudo_da_tabela(uuid, jsonb)` ausente, ou com o corpo de md5 (sem o \r) diferente de d98800431ea61fede9cab6593d01f007;
--   - `superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)` ausente, ou com o corpo de md5 (sem o \r)
--     diferente de afae80234ff0b5857b923b3403ad7ae6 (o da 20261112000003, medido em produção em 12/11/2026), ou sem
--     SECURITY DEFINER (sem ele, a nova chamaria a de dentro como service_role e o corte a quebraria também), ou sem
--     EXECUTE para o service_role.
-- VERIFICAÇÃO (aborta, desfaz tudo):
--   3. `importar_conteudo_da_tabela` sem EXECUTE para PUBLIC, anon, authenticated e service_role (o texto da 20261112000003);
--   4. o service_role continua executando `superadmin_importar_tabela`.
-- ════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $guarda$
DECLARE
  corpo text;
  f record;
BEGIN
  SELECT replace(prosrc, chr(13), '') INTO corpo FROM pg_proc
   WHERE oid = to_regprocedure('public.importar_conteudo_da_tabela(uuid, jsonb)');
  IF corpo IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.importar_conteudo_da_tabela(uuid, jsonb). Nada foi alterado.';
  END IF;
  IF md5(corpo) <> 'd98800431ea61fede9cab6593d01f007' THEN
    RAISE EXCEPTION 'importar_conteudo_da_tabela tem outro corpo (md5 %), nao o medido em 12/11/2026. Nada foi alterado.', md5(corpo);
  END IF;
  SELECT md5(replace(p.prosrc, chr(13), '')) AS m, p.prosecdef INTO f FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)');
  IF f IS NULL THEN
    RAISE EXCEPTION 'dependencia ausente: public.superadmin_importar_tabela (20261112000003): sem ela, o corte deixa a tabela sem importacao nenhuma. Nada foi alterado.';
  END IF;
  IF f.m <> 'afae80234ff0b5857b923b3403ad7ae6' THEN
    RAISE EXCEPTION 'superadmin_importar_tabela tem outro corpo (md5 %), nao o da 20261112000003. Nada foi alterado.', f.m;
  END IF;
  IF NOT f.prosecdef THEN
    RAISE EXCEPTION 'superadmin_importar_tabela sem SECURITY DEFINER: o corte a quebraria tambem. Nada foi alterado.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'o service_role nao executa superadmin_importar_tabela: o corte deixaria a tabela sem importacao nenhuma. Nada foi alterado.';
  END IF;
END
$guarda$;

REVOKE EXECUTE ON FUNCTION public.importar_conteudo_da_tabela(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

DO $verifica$
DECLARE
  quem text;
BEGIN
  SELECT string_agg(grantee, ',' ORDER BY grantee) INTO quem FROM information_schema.routine_privileges
   WHERE routine_schema = 'public' AND routine_name = 'importar_conteudo_da_tabela' AND privilege_type = 'EXECUTE'
     AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role');
  IF quem IS NOT NULL THEN
    RAISE EXCEPTION 'verificacao 3: importar_conteudo_da_tabela ainda tem EXECUTE para %: a trava teria um caminho por fora. Nada foi alterado.', quem;
  END IF;
  IF NOT has_function_privilege('service_role', 'public.superadmin_importar_tabela(uuid, uuid, text, jsonb, boolean, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verificacao 4: o service_role deixou de executar superadmin_importar_tabela. Nada foi alterado.';
  END IF;
  RAISE NOTICE 'importar_conteudo_da_tabela sem EXECUTE direto; a importacao so passa por superadmin_importar_tabela.';
END
$verifica$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── VERIFICAÇÃO DEPOIS DE APLICAR, por consulta ao banco (não pelo retorno do comando) ──────
-- select proname, proacl from pg_proc where proname in ('importar_conteudo_da_tabela', 'superadmin_importar_tabela');
-- -- esperado: importar_conteudo_da_tabela {postgres=X/postgres}; superadmin_importar_tabela {postgres=X/postgres,service_role=X/postgres}
-- -- e, logo depois, uma importação pela tela, para ver a rota nova importando de verdade.
