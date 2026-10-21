-- ════════════════════════════════════════════════════════════════════════════════════════
-- SEGURANÇA — FECHAR AS NOVE ASSINATURAS SECURITY DEFINER ABERTAS A anon E authenticated
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
--   e uma NONA, medida em seguida (21/10/2026):
--     calc_item_net_cost(p_item_id uuid) ... anon e authenticated. Lê o item SÓ PELO ID, sem
--     conferir a conta: com a chave do navegador, devolve o custo de item de qualquer empresa.
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
--   calc_item_net_cost .......... NENHUMA chamada; só em `src/supabase/database.types.ts`, e
--                                 nenhuma outra função das migrações a chama por dentro
-- Nenhuma chamada a `/rest/v1/rpc/` destas no código. Fechá-las não quebra tela; o
-- `GRANT ... TO service_role` mantém as rotas funcionando.
--
-- ══ AS NOVE ASSINATURAS SÃO LITERAIS ══
-- O repositório NÃO tem as assinaturas de produção de três delas: `create_tenant_from_stripe`
-- aparece só com NOVE argumentos (`20260305000000`), e `create_tenant_with_admin` em duas versões.
-- As três foram MEDIDAS no banco de produção pelo dono do produto em 21/10/2026 e estão escritas
-- abaixo como ele as mediu. Uma assinatura que não existir faz o REVOKE falhar, e a migração
-- inteira volta.
--
-- ══ A ÚNICA TRAVA É A VERIFICAÇÃO FINAL ══
-- Depois dos REVOKE, um bloco lê `pg_proc` e ABORTA A MIGRAÇÃO INTEIRA se QUALQUER assinatura
-- destes oito nomes — as nove listadas e qualquer outra que exista com o mesmo nome — continuar
-- executável por PUBLIC, anon ou authenticated, ou deixar de ser executável por service_role; e
-- aborta se o número de assinaturas desses nomes não for exatamente nove.
--
-- ══ O QUE ESTA MIGRAÇÃO NÃO FAZ ══
-- Não muda o corpo de função nenhuma; não toca em tabela.
-- FICAM ABERTAS, de propósito (decisão do dono do produto, 21/10/2026):
--   - as quatro de RLS — `get_auth_tenant_id`, `is_super_admin`, `is_tenant_admin`,
--     `is_admin_or_manager`: as políticas rodam como o usuário, e `authenticated` PRECISA
--     executá-las; fechá-las quebraria a RLS;
--   - as de equipe — `invite_team_member`, `update_user_permissions`, `update_team_member_role`,
--     `deactivate_team_member`: conferem o chamador por dentro (`auth.uid()`, dono ou admin da
--     mesma conta).
-- Não conserta `calc-tax-engine`, `send-reminder`, `send-recurrence`, `eduzz` nem
-- `set-super-admin-password` — cada uma tem o seu PR.
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

-- ── 2. As TRÊS que o repositório não tem — literais, como medidas em produção em 21/10/2026 ──
REVOKE ALL ON FUNCTION public.create_tenant_from_stripe(
  p_name text, p_admin_email text, p_admin_name text,
  p_stripe_customer_id text, p_stripe_subscription_id text,
  p_revenue_tier text, p_plan_slug text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_from_stripe(
  p_name text, p_admin_email text, p_admin_name text,
  p_stripe_customer_id text, p_stripe_subscription_id text,
  p_revenue_tier text, p_plan_slug text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_from_stripe(
  p_name text, p_admin_email text, p_admin_name text,
  p_admin_phone text, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_revenue_tier text, p_plan_slug text, p_plan_status text,
  p_trial_ends_at timestamp with time zone
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_from_stripe(
  p_name text, p_admin_email text, p_admin_name text,
  p_admin_phone text, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_revenue_tier text, p_plan_slug text, p_plan_status text,
  p_trial_ends_at timestamp with time zone
) TO service_role;

REVOKE ALL ON FUNCTION public.create_tenant_with_admin(
  p_name text, p_admin_email text, p_admin_name text,
  p_caller_user_id uuid, p_cnpj_cpf text, p_segment text,
  p_company_email text, p_company_phone text, p_cep text, p_street text,
  p_number text, p_complement text, p_neighborhood text, p_city text,
  p_state_code character
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_admin(
  p_name text, p_admin_email text, p_admin_name text,
  p_caller_user_id uuid, p_cnpj_cpf text, p_segment text,
  p_company_email text, p_company_phone text, p_cep text, p_street text,
  p_number text, p_complement text, p_neighborhood text, p_city text,
  p_state_code character
) TO service_role;

-- ── 2b. A NONA — o custo de item de qualquer empresa pela chave do navegador ──────────────
REVOKE ALL ON FUNCTION public.calc_item_net_cost(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calc_item_net_cost(uuid) TO service_role;

-- ── 3. VERIFICAÇÃO — a ÚNICA trava: aborta a migração inteira se algo ficou aberto ──────────
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
                       'invite_user_to_tenant', 'cancel_sale_cascade', 'delete_budget_cascade', 'delete_order_cascade',
                       'calc_item_net_cost')
     AND (   has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF aberta IS NOT NULL THEN
    RAISE EXCEPTION 'ainda aberta (ou service_role sem EXECUTE): %. Nada foi alterado.', aberta;
  END IF;

  SELECT count(*) INTO fechadas
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('create_tenant_from_stripe', 'create_tenant_with_admin', 'delete_sale_cascade',
                       'invite_user_to_tenant', 'cancel_sale_cascade', 'delete_budget_cascade', 'delete_order_cascade',
                       'calc_item_net_cost');
  IF fechadas <> 9 THEN
    RAISE EXCEPTION 'esperadas 9 assinaturas (as 2 de create_tenant_from_stripe contam separado); o banco tem %. Nada foi alterado.', fechadas;
  END IF;
  RAISE NOTICE 'as 9 assinaturas fechadas para PUBLIC, anon e authenticated; service_role executa.';
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
--                       'invite_user_to_tenant', 'cancel_sale_cascade', 'delete_budget_cascade', 'delete_order_cascade',
--                       'calc_item_net_cost')
--   order by 1;
--   → 9 linhas; anon = false e authenticated = false em todas; service_role = true em todas.
--
-- (2) as rotas que as chamam continuam funcionando — elas usam service_role. Conferir com uma
--     exclusão de orçamento de teste, por exemplo, e o log da rota.
--
-- (3) NOTIFY pgrst, 'reload schema';  — passo separado; não vem junto com o COMMIT.
