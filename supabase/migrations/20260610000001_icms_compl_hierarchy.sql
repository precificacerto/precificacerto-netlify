-- ============================================================================
-- ICMS Complementar — hierarquia de ativação (documento oficial 2026-06-10)
-- Data: 2026-06-10
-- ============================================================================
--
-- Contexto: o ICMS Complementar (LC 87/96 art. 13 §1º II) deixava de ser apurado
-- corretamente — o sistema só cobrava quando `customers.is_icms_contributor = false`
-- (binário), ignorando a hierarquia de 3 níveis do documento oficial:
--
--   Nível 1 — destinatário contribuinte do ICMS?  (customers.is_icms_contributor)
--     ├─ NÃO → Nível 2B: ST/DIFAL ativo? → BLOQUEADO ; senão base = IPI + frete + seguro + desp.
--     └─ SIM → Nível 2A: frete CIF/FOB?
--           ├─ FOB → base = só IPI (frete fora)
--           └─ CIF → Nível 3: ST ativo? → BLOQUEADO ; senão base = IPI + frete
--
-- A hierarquia depende de dois dados de OPERAÇÃO que ainda não existiam no banco:
--   • freight_mode (CIF/FOB) — modalidade de frete do pedido.
--   • icms_compl_override   — escape manual para casos excepcionais (isenção por estado).
--
-- A alíquota é herdada da operação (icms_pct) — NÃO se cria coluna de alíquota própria.
-- O valor consolidado continua em `icms_compl_value` (já existente — migration 20260605000001).
--
-- 100% retrocompatível: freight_mode default 'CIF' (caso conservador → entra na base);
-- icms_compl_override default NULL (= automático, hierarquia decide).
--
-- Como rodar: Supabase Dashboard → SQL Editor → colar tudo → Run.
-- ============================================================================

BEGIN;

-- ──────────── BUDGETS ────────────
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS freight_mode         text NOT NULL DEFAULT 'CIF'
    CHECK (freight_mode IN ('CIF', 'FOB')),
  ADD COLUMN IF NOT EXISTS icms_compl_override  text NULL
    CHECK (icms_compl_override IN ('FORCE_OFF'));

-- ──────────── ORDERS ────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS freight_mode         text NOT NULL DEFAULT 'CIF'
    CHECK (freight_mode IN ('CIF', 'FOB')),
  ADD COLUMN IF NOT EXISTS icms_compl_override  text NULL
    CHECK (icms_compl_override IN ('FORCE_OFF'));

-- ──────────── SALES ────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS freight_mode         text NOT NULL DEFAULT 'CIF'
    CHECK (freight_mode IN ('CIF', 'FOB')),
  ADD COLUMN IF NOT EXISTS icms_compl_override  text NULL
    CHECK (icms_compl_override IN ('FORCE_OFF'));

COMMENT ON COLUMN public.budgets.freight_mode IS
  'Modalidade de frete da operação (CIF/FOB). Nível 2A da hierarquia do ICMS Complementar. FOB → base só IPI.';
COMMENT ON COLUMN public.budgets.icms_compl_override IS
  'Override manual do ICMS Complementar. NULL = automático (hierarquia decide). FORCE_OFF = isenta a operação.';

COMMIT;
