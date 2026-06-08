-- ============================================================================
-- EPIC-POR-FORA-V2 / S2-DB — Campos avançados de ICMS-ST e DIFAL
-- Data: 2026-06-08
-- ============================================================================
--
-- Contexto: a guia "Alíquotas tributárias adicionais (avançado)" (doc v4 §5.4 e Manual §9)
-- exige parâmetros que hoje NÃO existem no banco. Os campos `icms_st_pct`/`difal_pct`
-- (EPIC-RR-V2 S10) guardam apenas um percentual simples — insuficiente para a fórmula real:
--   ICMS-ST = (BC própria × (1+MVA) × ALQ_interna_destino) − (BC própria × ALQ_próprio)
--   DIFAL   = BC × (ALQ_destino − ALQ_origem)   [base simples ou dupla LC 190/2022]
--
-- Esta migration adiciona, em products e services:
--   • Parâmetros avançados (MVA, ALQ interna destino, ALQ interestadual origem, flags)
--   • Valores apurados (icms_st_value, difal_value, fcp_value) — espelham is_value/ibs_value
-- E, em budgets/orders/sales, os valores consolidados (como icms_compl_value já faz).
--
-- Convenção de alíquotas: BASE 100 (ex.: 17 = 17%, 40 = 40% de MVA) — coerente com
-- products.icms_pct (que o sistema grava como 17, não 0.17). Valores em R$ (NUMERIC).
-- 100% retrocompatível: todas as colunas novas com DEFAULT 0 / NULL.
--
-- Como rodar: Supabase Dashboard → SQL Editor → colar tudo → Run.
-- ============================================================================

BEGIN;

-- ──────────── PRODUCTS ────────────
ALTER TABLE public.products
  -- Acionadores (ICMS-ST e DIFAL nunca coexistem na mesma operação)
  ADD COLUMN IF NOT EXISTS icms_st_active        boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS difal_active          boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS st_difal_interestadual boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS difal_base_dupla      boolean      NOT NULL DEFAULT false,
  -- Parâmetros avançados (base 100)
  ADD COLUMN IF NOT EXISTS mva_original_pct           NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_alq_interna_destino_pct     NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_alq_interestadual_origem_pct NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_interna_origem_pct    NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS fcp_alq_pct                NUMERIC(8,5) NULL,
  -- Valores apurados (R$)
  ADD COLUMN IF NOT EXISTS icms_st_value         NUMERIC      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_value           NUMERIC      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcp_value             NUMERIC      NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.fcp_alq_pct IS 'EPIC-POR-FORA-V2: alíquota FCP/FECP avançada (base 100, ex.: 2 = 2%) usada por computeDifal. Distinta de fcp_pct (S10, decimal).';
COMMENT ON COLUMN public.products.icms_st_active IS 'EPIC-POR-FORA-V2: ICMS-ST ativo nesta operação (acionador). ST e DIFAL nunca coexistem.';
COMMENT ON COLUMN public.products.difal_active IS 'EPIC-POR-FORA-V2: DIFAL ativo nesta operação (acionador).';
COMMENT ON COLUMN public.products.st_difal_interestadual IS 'EPIC-POR-FORA-V2: operação interestadual → ICMS-ST usa MVA ajustada e ICMS próprio pela ALQ interestadual.';
COMMENT ON COLUMN public.products.difal_base_dupla IS 'EPIC-POR-FORA-V2: DIFAL por base dupla "por dentro" (LC 190/2022) quando a UF de destino exige.';
COMMENT ON COLUMN public.products.mva_original_pct IS 'EPIC-POR-FORA-V2: MVA original do ICMS-ST (base 100, ex.: 40 = 40%). Fonte: RICMS do destino por NCM/CEST.';
COMMENT ON COLUMN public.products.icms_alq_interna_destino_pct IS 'EPIC-POR-FORA-V2: alíquota ICMS interna do estado de DESTINO (base 100). Usada em ICMS-ST e DIFAL.';
COMMENT ON COLUMN public.products.icms_alq_interestadual_origem_pct IS 'EPIC-POR-FORA-V2: alíquota interestadual de ORIGEM (base 100): 12, 7 ou 4.';
COMMENT ON COLUMN public.products.icms_interna_origem_pct IS 'EPIC-POR-FORA-V2: ICMS interno embutido na ORIGEM (base 100). Só p/ DIFAL base dupla.';
COMMENT ON COLUMN public.products.icms_st_value IS 'EPIC-POR-FORA-V2: ICMS-ST apurado (R$) = presumido − próprio. Etapa avançada por fora.';
COMMENT ON COLUMN public.products.difal_value IS 'EPIC-POR-FORA-V2: DIFAL apurado (R$) = ICMS destino − ICMS interestadual.';
COMMENT ON COLUMN public.products.fcp_value IS 'EPIC-POR-FORA-V2: FCP/FECP apurado (R$) — recolhido em GNRE separado.';

-- ──────────── SERVICES ────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS icms_st_active        boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS difal_active          boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS st_difal_interestadual boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS difal_base_dupla      boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mva_original_pct           NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_alq_interna_destino_pct     NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_alq_interestadual_origem_pct NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_interna_origem_pct    NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS fcp_alq_pct                NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_st_value         NUMERIC      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_value           NUMERIC      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcp_value             NUMERIC      NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.services.fcp_alq_pct IS 'EPIC-POR-FORA-V2: alíquota FCP/FECP avançada (base 100). Distinta de fcp_pct (S10, decimal).';
COMMENT ON COLUMN public.services.icms_st_value IS 'EPIC-POR-FORA-V2: ICMS-ST apurado (R$). Geralmente 0 para serviços.';
COMMENT ON COLUMN public.services.difal_value IS 'EPIC-POR-FORA-V2: DIFAL apurado (R$).';
COMMENT ON COLUMN public.services.fcp_value IS 'EPIC-POR-FORA-V2: FCP/FECP apurado (R$).';

-- ──────────── BUDGETS / ORDERS / SALES (consolidado, como icms_compl_value) ────────────
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS icms_st_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_value   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcp_value     NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS icms_st_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_value   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcp_value     NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS icms_st_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_value   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcp_value     NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.budgets.icms_st_value IS 'EPIC-POR-FORA-V2: ICMS-ST consolidado do orçamento (Σ produtos). Recalculado sobre a âncora no desconto.';
COMMENT ON COLUMN public.budgets.difal_value IS 'EPIC-POR-FORA-V2: DIFAL consolidado do orçamento. Recalculado sobre a âncora (frete fixo) no desconto.';
COMMENT ON COLUMN public.budgets.fcp_value IS 'EPIC-POR-FORA-V2: FCP/FECP consolidado (GNRE separado).';

COMMIT;

-- ──────────── ROLLBACK ────────────
-- BEGIN;
-- ALTER TABLE public.products DROP COLUMN IF EXISTS icms_st_active, DROP COLUMN IF EXISTS difal_active,
--   DROP COLUMN IF EXISTS st_difal_interestadual, DROP COLUMN IF EXISTS difal_base_dupla,
--   DROP COLUMN IF EXISTS mva_original_pct, DROP COLUMN IF EXISTS icms_alq_interna_destino_pct,
--   DROP COLUMN IF EXISTS icms_alq_interestadual_origem_pct, DROP COLUMN IF EXISTS icms_interna_origem_pct,
--   DROP COLUMN IF EXISTS fcp_alq_pct,
--   DROP COLUMN IF EXISTS icms_st_value, DROP COLUMN IF EXISTS difal_value, DROP COLUMN IF EXISTS fcp_value;
-- ALTER TABLE public.services DROP COLUMN IF EXISTS icms_st_active, DROP COLUMN IF EXISTS difal_active,
--   DROP COLUMN IF EXISTS st_difal_interestadual, DROP COLUMN IF EXISTS difal_base_dupla,
--   DROP COLUMN IF EXISTS mva_original_pct, DROP COLUMN IF EXISTS icms_alq_interna_destino_pct,
--   DROP COLUMN IF EXISTS icms_alq_interestadual_origem_pct, DROP COLUMN IF EXISTS icms_interna_origem_pct,
--   DROP COLUMN IF EXISTS fcp_alq_pct,
--   DROP COLUMN IF EXISTS icms_st_value, DROP COLUMN IF EXISTS difal_value, DROP COLUMN IF EXISTS fcp_value;
-- ALTER TABLE public.budgets DROP COLUMN IF EXISTS icms_st_value, DROP COLUMN IF EXISTS difal_value, DROP COLUMN IF EXISTS fcp_value;
-- ALTER TABLE public.orders  DROP COLUMN IF EXISTS icms_st_value, DROP COLUMN IF EXISTS difal_value, DROP COLUMN IF EXISTS fcp_value;
-- ALTER TABLE public.sales   DROP COLUMN IF EXISTS icms_st_value, DROP COLUMN IF EXISTS difal_value, DROP COLUMN IF EXISTS fcp_value;
-- COMMIT;
