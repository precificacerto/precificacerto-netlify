-- ════════════════════════════════════════════════════════════════════════════════════════
-- SEGURANÇA — FECHAR AS FUNÇÕES SECURITY DEFINER ABERTAS A anon E authenticated
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════
-- ║ NÃO APLICADA. Escrita em 21/10/2026, para ser lida antes de o dono do produto autorizar.
-- ║ Migração é PENDENTE POR PADRÃO (`migration-delivery.md`): o estado dela só muda com a
-- ║ consulta ao schema depois de aplicada.
-- ║
-- ║ Ao aplicar fora do CLI, o `name` da migração é o nome completo deste arquivo, sem a
-- ║ extensão: 20261021000003_fecha_funcoes_abertas.
-- ╚══════════════════════════════════════════════════════════════════════════════════════
--
-- ══ O QUE FOI MEDIDO NO BANCO DE PRODUÇÃO (dono do produto, 21/10/2026) ══
-- Por consulta a `pg_proc` com `has_function_privilege`, todas SECURITY DEFINER:
--   executáveis por ANON (a chave pública, que está no navegador):
--     create_tenant_from_stripe ........ DUAS assinaturas, de 10 e de 7 argumentos
--     create_tenant_with_admin
--     delete_sale_cascade(p_sale_id uuid, p_tenant_id uuid)
--     invite_user_to_tenant(p_email text, p_role user_role)
--   executáveis por AUTHENTICATED, de qualquer conta:
--     cancel_sale_cascade(p_sale_id uuid, p_tenant_id uuid)
--     delete_budget_cascade(p_budget_id uuid, p_tenant_id uuid)
--     delete_order_cascade(p_order_id uuid, p_tenant_id uuid)
-- As quatro "cascade" recebem p_tenant_id POR ARGUMENTO: quem chama escolhe a conta que sofre.
--
-- ══ POR QUE AS TRÊS CASCATAS ESTAVAM ABERTAS, SE TINHAM REVOKE ══
-- `20260514000001_cascade_delete_pipeline.sql:431-433` revoga só de PUBLIC. No Supabase, `anon` e
-- `authenticated` recebem EXECUTE EXPLÍCITO pelos privilégios padrão do schema — revogar de PUBLIC
-- não tira o deles. O padrão da área (`20261016000001`, `20261017000003`, `20261020000002`) revoga
-- dos TRÊS: PUBLIC, anon e authenticated.
--
-- ══ NINGUÉM DO NAVEGADOR AS CHAMA — medido no código em 21/10/2026 ══
-- Todo `.rpc(` destas sete sai de rota de API com `supabaseAdmin` (service_role):
--   create_tenant_from_stripe ... src/pages/api/stripe/webhook.ts:282
--   create_tenant_with_admin .... src/pages/api/super-admin/create-admin.ts:57-58
--   delete_sale_cascade ......... src/pages/api/delete/sales-permanent.ts:45
--   cancel_sale_cascade ......... src/pages/api/delete/sales.ts:38
--   delete_budget_cascade ....... src/pages/api/delete/budgets.ts:38
--   delete_order_cascade ........ src/pages/api/delete/orders.ts:44
--   invite_user_to_tenant ....... NENHUMA chamada; só em `src/supabase/database.types.ts`
-- Nenhuma chamada a `/rest/v1/rpc/` destas no código. Fechá-las não quebra tela; o
-- `GRANT ... TO service_role` mantém as rotas funcionando.
--
-- ══ AS ASSINATURAS QUE O REPOSITÓRIO NÃO CONHECE — e por que há um bloco dinâmico ══
-- `create_tenant_from_stripe`: o repositório só tem UMA definição, de NOVE argumentos
-- (`20260305000000`); a produção tem duas, de DEZ e de SETE. `create_tenant_with_admin`: o
-- repositório tem duas versões, com e sem `p_caller_user_id`, e não diz qual está em produção.
-- Escrever essas assinaturas à mão seria inventar o estado do banco. Então:
--   - as CINCO de assinatura conhecida são fechadas por nome e assinatura LITERAIS;
--   - as TRÊS de assinatura desconhecida são fechadas por um bloco que lê `pg_proc` e EXIGE o
--     que foi medido — `create_tenant_from_stripe` com exatamente duas assinaturas, de 10 e de 7
--     argumentos; `create_tenant_with_admin` com exatamente uma. Se o banco tiver outra coisa, o
--     bloco ABORTA a migração inteira, sem fechar nada pela metade. Cada assinatura fechada sai
--     num NOTICE, por extenso;
--   - no fim, uma VERIFICAÇÃO que aborta se QUALQUER assinatura destes sete nomes continuar
--     executável por PUBLIC, anon ou authenticated, ou deixar de ser executável por service_role.
--
-- ══ O QUE ESTA MIGRAÇÃO NÃO FAZ ══
-- Não muda o corpo de função nenhuma; não toca em tabela; não fecha as outras SECURITY DEFINER
-- sem REVOKE do repositório (estão listadas no relatório do PR — algumas são helpers de RLS que
-- `authenticated` PRECISA executar). Não conserta `calc-tax-engine`, `send-reminder`,
-- `send-recurrence`, `eduzz` nem `set-super-admin-password` — cada uma tem o seu PR.
--
-- ══ CUIDADO PARA O FUTURO ══
-- `CREATE OR REPLACE FUNCTION` preserva estes privilégios. `DROP FUNCTION` + `CREATE` NÃO: a função
-- nasce de novo com o EXECUTE padrão para anon e authenticated. Toda redefinição por DROP precisa
-- repetir o REVOKE — foi exatamente o que faltou em `delete_sale_cascade` (`20260909000001`).
-- ════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. As CINCO de assinatura conhecida — literais ──────────────────────────────────────
REVOKE ALL ON FUNCTION public.delete_sale_cascade(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sale_cascade(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.invite_user_to_tenant(text, public.user_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invite_user_to_tenant(text, public.user_role) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_sale_cascade(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_sale_cascade(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.delete_budget_cascade(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_budget_cascade(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.delete_order_cascade(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_cascade(uuid, uuid) TO service_role;

-- ── 2. As TRÊS de assinatura que o repositório não conhece — lidas do banco, com o medido exigido ──
DO $fecha$
DECLARE
  f record;
  n_stripe int;
  aridades int[];
  n_admin int;
BEGIN
  SELECT count(*), array_agg(p.pronargs::int ORDER BY p.pronargs DESC)
    INTO n_stripe, aridades
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'create_tenant_from_stripe';
  IF n_stripe <> 2 OR aridades <> ARRAY[10, 7] THEN
    RAISE EXCEPTION 'create_tenant_from_stripe: o medido em 21/10/2026 eram 2 assinaturas, de 10 e de 7 argumentos; o banco tem % assinatura(s), com % argumentos. Nada foi alterado — confira antes de aplicar.', n_stripe, aridades;
  END IF;

  SELECT count(*) INTO n_admin
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'create_tenant_with_admin';
  IF n_admin <> 1 THEN
    RAISE EXCEPTION 'create_tenant_with_admin: o medido em 21/10/2026 era 1 assinatura; o banco tem %. Nada foi alterado — confira antes de aplicar.', n_admin;
  END IF;

  FOR f IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS assinatura
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public' AND p.proname IN ('create_tenant_from_stripe', 'create_tenant_with_admin')
     ORDER BY p.proname, p.pronargs DESC
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.assinatura);
    RAISE NOTICE 'fechada: %', f.assinatura;
  END LOOP;
END
$fecha$;

-- ── 3. VERIFICAÇÃO — aborta se alguma assinatura destes sete nomes ficou aberta ─────────────
DO $verifica$
DECLARE
  aberta text;
  fechadas int;
BEGIN
  SELECT string_agg(format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), '; ')
    INTO aberta
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('create_tenant_from_stripe', 'create_tenant_with_admin', 'delete_sale_cascade',
                       'invite_user_to_tenant', 'cancel_sale_cascade', 'delete_budget_cascade', 'delete_order_cascade')
     AND (   has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF aberta IS NOT NULL THEN
    RAISE EXCEPTION 'ainda aberta (ou service_role sem EXECUTE): %', aberta;
  END IF;

  SELECT count(*) INTO fechadas
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('create_tenant_from_stripe', 'create_tenant_with_admin', 'delete_sale_cascade',
                       'invite_user_to_tenant', 'cancel_sale_cascade', 'delete_budget_cascade', 'delete_order_cascade');
  IF fechadas <> 8 THEN
    RAISE EXCEPTION 'esperadas 8 assinaturas (as 2 de create_tenant_from_stripe contam separado); o banco tem %', fechadas;
  END IF;
  RAISE NOTICE 'as 8 assinaturas fechadas para PUBLIC, anon e authenticated; service_role executa.';
END
$verifica$;

COMMIT;

-- ── DEPOIS DE APLICAR — pela consulta, não pelo retorno do comando ──────────────────────────
-- (1) a mesma medição de 21/10/2026, que agora tem de vir com anon e authenticated FALSOS:
--   select format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) as assinatura,
--          p.prosecdef as security_definer,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_role
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('create_tenant_from_stripe', 'create_tenant_with_admin', 'delete_sale_cascade',
--                       'invite_user_to_tenant', 'cancel_sale_cascade', 'delete_budget_cascade', 'delete_order_cascade')
--   order by 1;
--   → 8 linhas; anon = false e authenticated = false em todas; service_role = true em todas.
--
-- (2) as rotas que as chamam continuam funcionando — elas usam service_role. Conferir com uma
--     exclusão de orçamento de teste, por exemplo, e o log da rota.
--
-- (3) NOTIFY pgrst, 'reload schema';  — passo separado; não vem junto com o COMMIT.
