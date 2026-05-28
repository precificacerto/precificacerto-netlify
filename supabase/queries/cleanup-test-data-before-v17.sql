-- ============================================================================
-- ⚠️ LIMPEZA DE DADOS DE TESTE — Pré-Lançamento V17
-- ============================================================================
-- EPIC-MRM-V17 Onda 2 (2026-05-28)
--
-- ⛔ ATENÇÃO ⛔
-- Este script APAGA TODOS os documentos transacionais (orçamentos, pedidos,
-- vendas, allocations, cash_entries de origem transacional).
--
-- O que NÃO é apagado (preservado):
--   - tenants (contas)
--   - users (usuários)
--   - customers (clientes cadastrados)
--   - products / services (catálogo)
--   - pricing_calculations (snapshots V14 dos produtos)
--   - tenant_expense_config (configurações)
--   - tax_rates (alíquotas)
--   - cashier_categories (categorias de fluxo)
--   - cash_entries MANUAIS (sem sale_id ou order_id de origem)
--
-- Como rodar:
--   1. Execute PRIMEIRO `supabase/migrations/20260528000001_v17_absorption_policy.sql`
--   2. Backup mental: confirme que NÃO há clientes reais ainda
--   3. Abra Supabase Dashboard → SQL Editor
--   4. Cole TODO o conteúdo deste arquivo
--   5. Execute em ordem (linha a linha ou bloco completo)
--   6. Veja contagens "Antes" e "Depois" para confirmar
-- ============================================================================

-- ANTES — contagem inicial (para você ver o impacto)
-- ----------------------------------------------------------------------------
SELECT 'budgets'      AS tabela, COUNT(*) AS qtd_antes FROM public.budgets
UNION ALL SELECT 'budget_items',   COUNT(*) FROM public.budget_items
UNION ALL SELECT 'orders',         COUNT(*) FROM public.orders
UNION ALL SELECT 'sales',          COUNT(*) FROM public.sales
UNION ALL SELECT 'allocations',    COUNT(*) FROM public.allocations
UNION ALL SELECT 'cash_entries',   COUNT(*) FROM public.cash_entries;

-- ============================================================================
-- LIMPEZA — ordem importante por causa de foreign keys
-- ============================================================================

-- 1) Lançamentos de caixa originados de vendas (preserva entradas manuais)
DELETE FROM public.cash_entries
WHERE EXISTS (
  SELECT 1 FROM public.sales s WHERE s.id = cash_entries.id
)
OR description ILIKE '%venda%'
OR description ILIKE '%recebimento%';

-- (Se você quiser limpar TODOS os cash_entries, inclusive lançamentos manuais
-- de teste, descomente a linha abaixo e comente o DELETE acima)
-- DELETE FROM public.cash_entries;

-- 2) Allocations (reservas de estoque vinculadas a pedidos)
DELETE FROM public.allocations;

-- 3) Sales (vendas finalizadas)
-- Filhas: sale_items (CASCADE automático se existir)
DELETE FROM public.sales;

-- 4) Orders (pedidos)
-- Filhas: order_items (CASCADE automático), allocations (já deletado acima)
DELETE FROM public.orders;

-- 5) Budget Items (filhos de orçamentos)
DELETE FROM public.budget_items;

-- 6) Budgets (orçamentos)
DELETE FROM public.budgets;

-- ============================================================================
-- DEPOIS — contagem final (todos zeros indicam sucesso)
-- ============================================================================
SELECT 'budgets'      AS tabela, COUNT(*) AS qtd_depois FROM public.budgets
UNION ALL SELECT 'budget_items',   COUNT(*) FROM public.budget_items
UNION ALL SELECT 'orders',         COUNT(*) FROM public.orders
UNION ALL SELECT 'sales',          COUNT(*) FROM public.sales
UNION ALL SELECT 'allocations',    COUNT(*) FROM public.allocations
UNION ALL SELECT 'cash_entries',   COUNT(*) FROM public.cash_entries;

-- Preservados (devem MANTER valores > 0):
SELECT 'tenants'                  AS tabela, COUNT(*) AS qtd FROM public.tenants
UNION ALL SELECT 'users',                     COUNT(*) FROM public.users
UNION ALL SELECT 'customers',                 COUNT(*) FROM public.customers
UNION ALL SELECT 'products',                  COUNT(*) FROM public.products
UNION ALL SELECT 'pricing_calculations',      COUNT(*) FROM public.pricing_calculations;

-- ============================================================================
-- ROLLBACK (caso queira reverter — NÃO É POSSÍVEL após executado)
-- ============================================================================
-- DELETE não tem rollback após commit no Supabase. Tem certeza que executou?
-- Se SIM, você está pronto pra usar o motor V17 com base limpa.
