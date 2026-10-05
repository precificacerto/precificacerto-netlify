-- ============================================================================================
-- PASSO 2 de 3 — LIGAR A RLS ONDE ELA ESTÁ DESLIGADA
--
-- Comando do PO de 05/10/2026, §3.
--
-- Medido em 05/10/2026:
--   purchase_invoices        relrowsecurity = FALSE — 327 linhas, 2 tenants, política NENHUMA
--   tax_restitution_entries  relrowsecurity = FALSE — 1 política escrita (`tenant_restitution_policy`,
--                            cmd ALL, por `users.tenant_id`) que NUNCA RODOU, porque política sem
--                            RLS ligada é texto morto no catálogo
--
-- >>> A POLÍTICA VEM JUNTO, NO MESMO ARQUIVO E NA MESMA TRANSAÇÃO <<<
--
-- `ENABLE ROW LEVEL SECURITY` sem política de SELECT torna a tabela INACESSÍVEL para
-- `authenticated`: o default de RLS é NEGAR. A tela de notas de compra cairia no instante do
-- COMMIT. Separar os dois comandos em execuções diferentes abre uma janela em que a tela está
-- quebrada, e o tamanho dessa janela é o tempo que alguém levar para rodar o segundo.
--
-- `tax_restitution_entries` NÃO precisa de política nova: a dela já existe e passa a valer no
-- momento em que a RLS liga. É por isso que esta tabela tem uma linha e a outra tem cinco.
--
-- ── DEPENDÊNCIA CONFERIDA ANTES ─────────────────────────────────────────────────────────────
--   get_auth_tenant_id()  SECURITY DEFINER  ✓ existe
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────────────────────
-- ANTES:
--   select relname, relrowsecurity from pg_class
--    where relnamespace='public'::regnamespace
--      and relname in ('purchase_invoices','tax_restitution_entries');   -- esperado: false, false
--   select count(*) from public.purchase_invoices;                        -- esperado: 327
--
-- DEPOIS, as duas primeiras como service_role (que ignora RLS):
--   -- relrowsecurity = true nas DUAS
--   -- select count(*) from public.purchase_invoices  AINDA devolve 327
--   -- a contagem é o que distingue "RLS ligada" de "dado perdido": ligar RLS não apaga linha,
--   -- e conferir a contagem é o que prova isso em vez de supor
--
-- E a conferência que importa de verdade é com um usuário REAL, autenticado: abrir a tela de
-- notas de compra de cada um dos 2 tenants e ver as notas DELE. Uma contagem por service_role
-- passa verde com a política errada.
-- ============================================================================================

BEGIN;

-- ── purchase_invoices: RLS + as quatro políticas, juntas ────────────────────────────────────
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_invoices_select ON public.purchase_invoices;
DROP POLICY IF EXISTS purchase_invoices_insert ON public.purchase_invoices;
DROP POLICY IF EXISTS purchase_invoices_update ON public.purchase_invoices;
DROP POLICY IF EXISTS purchase_invoices_delete ON public.purchase_invoices;

CREATE POLICY purchase_invoices_select ON public.purchase_invoices
  FOR SELECT USING (tenant_id = (SELECT public.get_auth_tenant_id()));
CREATE POLICY purchase_invoices_insert ON public.purchase_invoices
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));
CREATE POLICY purchase_invoices_update ON public.purchase_invoices
  FOR UPDATE USING (tenant_id = (SELECT public.get_auth_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_auth_tenant_id()));
CREATE POLICY purchase_invoices_delete ON public.purchase_invoices
  FOR DELETE USING (tenant_id = (SELECT public.get_auth_tenant_id()));

-- ── tax_restitution_entries: só ligar. A política já está lá, esperando. ────────────────────
ALTER TABLE public.tax_restitution_entries ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
