-- ============================================================================
-- EPIC-RR-V2 / Story S10 — Alíquotas tributárias por produto e serviço
-- Data: 2026-05-22
-- ============================================================================
--
-- Contexto: o motor RR exige que cada produto/serviço carregue sua estrutura
-- tributária própria (Produto A: ICMS 4% / PIS+COFINS 9,25%; Produto B:
-- ICMS 12% / PIS+COFINS 3,65%, etc). Hoje o motor consome rates do tenant,
-- uniformes para todos os items — violando a arquitetura correta da
-- precificação individual.
--
-- Esta migration adiciona 13 colunas decimais em products e services:
--   - 4 impostos POR DENTRO (Bloco A: ICMS, PIS, COFINS, ISS)
--   - 7 impostos POR FORA (Bloco B: IPI, ICMS-ST, DIFAL, FCP, IBS, CBS, ISS retido)
--   - 2 alíquotas de rateio RR (IRPJ, CSLL)
--
-- Convenção: todas em DECIMAL (0.05 = 5%), NUMERIC(8,5), NULL = "não cadastrado"
-- (motor faz fallback para alíquota do tenant quando NULL).
-- ============================================================================

-- Atomicidade: envolve os 2 ALTER TABLE numa transação única (Aria S10 review)
BEGIN;

-- ──────────── PRODUCTS ────────────

ALTER TABLE public.products
  -- Impostos POR DENTRO (incidem sobre RV no motor RR)
  ADD COLUMN IF NOT EXISTS icms_pct       NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS pis_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS cofins_pct     NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS iss_pct        NUMERIC(8,5) NULL,
  -- Impostos POR FORA (incidem sobre base operacional descontada)
  ADD COLUMN IF NOT EXISTS ipi_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_st_pct    NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS difal_pct      NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS fcp_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS ibs_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS cbs_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS iss_retido_pct NUMERIC(8,5) NULL,
  -- Alíquotas de rateio RR (substituem fallback tenant quando NOT NULL)
  ADD COLUMN IF NOT EXISTS irpj_pct       NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS csll_pct       NUMERIC(8,5) NULL;

COMMENT ON COLUMN public.products.icms_pct IS 'EPIC-RR-V2 S10: alíquota ICMS específica do produto (decimal, 0.18 = 18%). NULL = usa rate do tenant.';
COMMENT ON COLUMN public.products.pis_pct  IS 'EPIC-RR-V2 S10: alíquota PIS específica do produto (decimal). NULL = fallback tenant.';
COMMENT ON COLUMN public.products.cofins_pct IS 'EPIC-RR-V2 S10: alíquota COFINS específica do produto (decimal). NULL = fallback tenant.';
COMMENT ON COLUMN public.products.iss_pct IS 'EPIC-RR-V2 S10: alíquota ISS específica do produto (decimal). NULL = fallback tenant. Geralmente 0 para produtos.';
COMMENT ON COLUMN public.products.ipi_pct IS 'EPIC-RR-V2 S10: alíquota IPI (por fora) específica do produto. NULL = fallback tenant.';
COMMENT ON COLUMN public.products.icms_st_pct IS 'EPIC-RR-V2 S10: alíquota ICMS-ST (substituição tributária) específica. NULL = fallback tenant.';
COMMENT ON COLUMN public.products.difal_pct IS 'EPIC-RR-V2 S10: DIFAL (diferencial de alíquota) específico. NULL = fallback tenant.';
COMMENT ON COLUMN public.products.fcp_pct IS 'EPIC-RR-V2 S10: Fundo de Combate à Pobreza (por fora). NULL = fallback tenant.';
COMMENT ON COLUMN public.products.ibs_pct IS 'EPIC-RR-V2 S10: IBS (Reforma Tributária, ativo a partir de 2027). NULL = fallback tenant.';
COMMENT ON COLUMN public.products.cbs_pct IS 'EPIC-RR-V2 S10: CBS (Reforma Tributária, ativo a partir de 2027). NULL = fallback tenant.';
COMMENT ON COLUMN public.products.iss_retido_pct IS 'EPIC-RR-V2 S10: ISS retido na fonte (serviços). NULL = fallback tenant.';
COMMENT ON COLUMN public.products.irpj_pct IS 'EPIC-RR-V2 S10: IRPJ efetivo específico do produto para rateio RR (Lucro Real). NULL = fallback tenant via tax-sync.';
COMMENT ON COLUMN public.products.csll_pct IS 'EPIC-RR-V2 S10: CSLL efetivo específico do produto para rateio RR (Lucro Real). NULL = fallback tenant via tax-sync.';

-- ──────────── SERVICES ────────────

ALTER TABLE public.services
  -- Impostos POR DENTRO
  ADD COLUMN IF NOT EXISTS icms_pct       NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS pis_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS cofins_pct     NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS iss_pct        NUMERIC(8,5) NULL,
  -- Impostos POR FORA
  ADD COLUMN IF NOT EXISTS ipi_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS icms_st_pct    NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS difal_pct      NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS fcp_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS ibs_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS cbs_pct        NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS iss_retido_pct NUMERIC(8,5) NULL,
  -- Alíquotas de rateio RR
  ADD COLUMN IF NOT EXISTS irpj_pct       NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS csll_pct       NUMERIC(8,5) NULL;

COMMENT ON COLUMN public.services.icms_pct IS 'EPIC-RR-V2 S10: alíquota ICMS específica do serviço (decimal). Geralmente 0 para serviços puros. NULL = fallback tenant.';
COMMENT ON COLUMN public.services.pis_pct IS 'EPIC-RR-V2 S10: alíquota PIS específica do serviço (decimal). NULL = fallback tenant.';
COMMENT ON COLUMN public.services.cofins_pct IS 'EPIC-RR-V2 S10: alíquota COFINS específica do serviço (decimal). NULL = fallback tenant.';
COMMENT ON COLUMN public.services.iss_pct IS 'EPIC-RR-V2 S10: alíquota ISS específica do serviço (decimal, 0.05 = 5%). NULL = fallback tenant.';
COMMENT ON COLUMN public.services.ipi_pct IS 'EPIC-RR-V2 S10: IPI específica do serviço (decimal). Geralmente 0 para serviços. NULL = fallback tenant.';
COMMENT ON COLUMN public.services.icms_st_pct IS 'EPIC-RR-V2 S10: ICMS-ST específica do serviço (decimal). Geralmente 0. NULL = fallback tenant.';
COMMENT ON COLUMN public.services.difal_pct IS 'EPIC-RR-V2 S10: DIFAL específico do serviço (decimal). NULL = fallback tenant.';
COMMENT ON COLUMN public.services.fcp_pct IS 'EPIC-RR-V2 S10: FCP específico do serviço (decimal). NULL = fallback tenant.';
COMMENT ON COLUMN public.services.ibs_pct IS 'EPIC-RR-V2 S10: IBS (Reforma Tributária 2027) específico do serviço. NULL = fallback tenant.';
COMMENT ON COLUMN public.services.cbs_pct IS 'EPIC-RR-V2 S10: CBS (Reforma Tributária 2027) específico do serviço. NULL = fallback tenant.';
COMMENT ON COLUMN public.services.iss_retido_pct IS 'EPIC-RR-V2 S10: ISS retido na fonte do serviço (decimal). NULL = fallback tenant.';
COMMENT ON COLUMN public.services.irpj_pct IS 'EPIC-RR-V2 S10: IRPJ efetivo específico do serviço para rateio RR. NULL = fallback tenant.';
COMMENT ON COLUMN public.services.csll_pct IS 'EPIC-RR-V2 S10: CSLL efetivo específico do serviço para rateio RR. NULL = fallback tenant.';

COMMIT;

-- ──────────── ÍNDICES (opcional, performance em queries futuras) ────────────

-- Sem índices por enquanto — colunas são lidas no select normal de products/services
-- e não em filtros WHERE diretos. Adicionar somente se telemetria mostrar gargalo.

-- ──────────── ROLLBACK ────────────
--
-- Em caso de rollback:
--
-- ALTER TABLE public.products
--   DROP COLUMN IF EXISTS icms_pct, DROP COLUMN IF EXISTS pis_pct,
--   DROP COLUMN IF EXISTS cofins_pct, DROP COLUMN IF EXISTS iss_pct,
--   DROP COLUMN IF EXISTS ipi_pct, DROP COLUMN IF EXISTS icms_st_pct,
--   DROP COLUMN IF EXISTS difal_pct, DROP COLUMN IF EXISTS fcp_pct,
--   DROP COLUMN IF EXISTS ibs_pct, DROP COLUMN IF EXISTS cbs_pct,
--   DROP COLUMN IF EXISTS iss_retido_pct, DROP COLUMN IF EXISTS irpj_pct,
--   DROP COLUMN IF EXISTS csll_pct;
--
-- ALTER TABLE public.services
--   DROP COLUMN IF EXISTS icms_pct, DROP COLUMN IF EXISTS pis_pct,
--   DROP COLUMN IF EXISTS cofins_pct, DROP COLUMN IF EXISTS iss_pct,
--   DROP COLUMN IF EXISTS ipi_pct, DROP COLUMN IF EXISTS icms_st_pct,
--   DROP COLUMN IF EXISTS difal_pct, DROP COLUMN IF EXISTS fcp_pct,
--   DROP COLUMN IF EXISTS ibs_pct, DROP COLUMN IF EXISTS cbs_pct,
--   DROP COLUMN IF EXISTS iss_retido_pct, DROP COLUMN IF EXISTS irpj_pct,
--   DROP COLUMN IF EXISTS csll_pct;
