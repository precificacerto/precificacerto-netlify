-- =====================================================================
-- CRÍT-3 (Founder 2026-05-27): COMMENT ON FUNCTION nas 3 cascade RPCs.
-- =====================================================================
-- Contexto:
--   Auditoria de segurança classificou inicialmente o parâmetro `p_tenant_id`
--   client-controllable destas 3 functions como CRÍTICO. Após reconhecimento:
--
--   1) Functions têm `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`,
--      logo NÃO podem ser invocadas via PostgREST por cliente autenticado/anônimo.
--   2) Os 3 call sites (src/pages/api/delete/sales|orders|budgets.ts) JÁ derivam
--      `p_tenant_id` de `caller.tenant_id` (sessão JWT via getCallerContext),
--      nunca do request body, e fazem pré-validação `.eq('tenant_id', caller.tenant_id)`
--      antes da RPC.
--   3) Sistema usa Padrão A (supabaseAdmin com service_role puro, sem propagação
--      de JWT do usuário). Nesse contexto, `auth.uid()` retorna NULL e
--      `get_auth_tenant_id()` retorna NULL — substituir `p_tenant_id` por
--      `get_auth_tenant_id()` quebraria produção.
--
-- Reclassificação: CRÍTICO → MÉDIO (defense-in-depth).
--
-- Fix aplicado nesta migration:
--   Adiciona COMMENT explicativo nas 3 functions, servindo de guard-rail contra
--   regressão futura (qualquer dev/agente que tente "consertar" a function trocando
--   por `get_auth_tenant_id()` lê o comentário e entende o porquê de não fazer isso).
--
-- Não altera código das functions. Não altera permissões. Operação puramente
-- documentativa (zero risco operacional, zero downtime).
-- =====================================================================

COMMENT ON FUNCTION public.cancel_sale_cascade(uuid, uuid) IS
  'SEGURANÇA — defense-in-depth obrigatório no backend:
   Esta função é SECURITY DEFINER + REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO service_role apenas.
   Caller (sempre backend via supabaseAdmin / Padrão A) DEVE validar p_tenant_id contra caller.tenant_id (sessão JWT) ANTES de invocar.
   NÃO substituir p_tenant_id por get_auth_tenant_id() internamente: auth.uid() retorna NULL no contexto service_role e a função quebraria em produção.
   Ver: getCallerContext em src/lib/get-caller-tenant.ts. Auditoria CRÍT-3 (2026-05-27).';

COMMENT ON FUNCTION public.delete_order_cascade(uuid, uuid) IS
  'SEGURANÇA — defense-in-depth obrigatório no backend:
   Esta função é SECURITY DEFINER + REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO service_role apenas.
   Caller (sempre backend via supabaseAdmin / Padrão A) DEVE validar p_tenant_id contra caller.tenant_id (sessão JWT) ANTES de invocar.
   NÃO substituir p_tenant_id por get_auth_tenant_id() internamente: auth.uid() retorna NULL no contexto service_role e a função quebraria em produção.
   Ver: getCallerContext em src/lib/get-caller-tenant.ts. Auditoria CRÍT-3 (2026-05-27).';

COMMENT ON FUNCTION public.delete_budget_cascade(uuid, uuid) IS
  'SEGURANÇA — defense-in-depth obrigatório no backend:
   Esta função é SECURITY DEFINER + REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO service_role apenas.
   Caller (sempre backend via supabaseAdmin / Padrão A) DEVE validar p_tenant_id contra caller.tenant_id (sessão JWT) ANTES de invocar.
   NÃO substituir p_tenant_id por get_auth_tenant_id() internamente: auth.uid() retorna NULL no contexto service_role e a função quebraria em produção.
   Ver: getCallerContext em src/lib/get-caller-tenant.ts. Auditoria CRÍT-3 (2026-05-27).';

-- Validação pós-aplicação (rode manualmente após esta migration):
--
-- SELECT proname, obj_description(oid, 'pg_proc') AS comment
-- FROM pg_proc
-- WHERE proname IN ('cancel_sale_cascade', 'delete_order_cascade', 'delete_budget_cascade');
--
-- Esperado: 3 linhas, cada uma com o comentário aplicado.
