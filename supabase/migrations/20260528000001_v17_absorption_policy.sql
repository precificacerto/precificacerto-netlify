-- ============================================================================
-- Migration V17 — Motor RRO Aderente ao PDF Oficial (Camada 1 + Camada 2)
-- ============================================================================
-- EPIC-MRM-V17 Onda 2 (2026-05-28)
-- ADR-015: docs/architecture/adr-015-motor-v17-policies-absorption.md
--
-- Como rodar:
--   1. Abra Supabase Dashboard → SQL Editor
--   2. Cole TODO o conteúdo deste arquivo
--   3. Clique em Run
--   4. Deve retornar "Success. No rows returned"
--
-- O que faz:
--   - Adiciona coluna `absorption_policy` em tenants (default RRO_PROPORTIONAL)
--   - Adiciona coluna `consolidated_breakdown` (JSONB) em budgets/orders/sales
--   - 100% retrocompatível com schema V16 (todas as colunas novas têm default ou NULL)
-- ============================================================================

-- 1) Política de absorção por tenant (Camada 2 V17)
-- ----------------------------------------------------------------------------
-- Default 'RRO_PROPORTIONAL' = comportamento PDF Seção 23 (distribuição proporcional)
-- Outra opção atual: 'COMMISSION_PROTECTED' = comissão integral, lucro absorve desconto
-- Flavors futuros (PROFIT_ABSORBS_ALL, SELLER_ABSORBS_PCT, HYBRID) serão adicionados via ALTER CHECK
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS absorption_policy TEXT NOT NULL
    DEFAULT 'RRO_PROPORTIONAL'
    CHECK (absorption_policy IN ('RRO_PROPORTIONAL', 'COMMISSION_PROTECTED'));

COMMENT ON COLUMN public.tenants.absorption_policy IS
  'V17 Camada 2: política de absorção do desconto. RRO_PROPORTIONAL (default, ≡ comportamento PDF Seção 23) ou COMMISSION_PROTECTED (vendedor preservado, lucro absorve diferença). Outros flavors podem ser adicionados conforme demanda.';

-- 2) Snapshot consolidado V17 nos documentos (auditoria + DRE consolidada)
-- ----------------------------------------------------------------------------
-- Estrutura JSON: { engine_version, consolidated_view, motor_output, distribution }
-- Nullable para retrocompatibilidade com documentos pré-V17

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS consolidated_breakdown JSONB NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS consolidated_breakdown JSONB NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS consolidated_breakdown JSONB NULL;

COMMENT ON COLUMN public.budgets.consolidated_breakdown IS
  'V17: snapshot ConsolidatedView + MotorOutput + FinalDistribution para auditoria/DRE. Imutável após save quando status != DRAFT.';

COMMENT ON COLUMN public.orders.consolidated_breakdown IS
  'V17: snapshot herdado do orçamento de origem (princípio: pedido consolida, não recalcula).';

COMMENT ON COLUMN public.sales.consolidated_breakdown IS
  'V17: snapshot herdado do pedido de origem (princípio: venda consolida, não recalcula).';

-- 3) Verificação de sucesso
-- ----------------------------------------------------------------------------
-- Esta query deve retornar 4 linhas (1 tenants + 3 colunas consolidated_breakdown)
-- Descomente para validar manualmente após o ALTER:
--
-- SELECT
--   table_name,
--   column_name,
--   data_type,
--   column_default,
--   is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND (
--     (table_name = 'tenants' AND column_name = 'absorption_policy')
--     OR (table_name IN ('budgets', 'orders', 'sales') AND column_name = 'consolidated_breakdown')
--   )
-- ORDER BY table_name, column_name;
