-- Migration: SH-001 — Simples Híbrido espelha Lucro Real
-- Epic: SH-ESPELHAMENTO-LR
-- Data: 2026-04-15
--
-- O regime SIMPLES_HIBRIDO já existe no enum tax_regime (migration 20260213000000).
-- Esta migration NÃO cria colunas novas — apenas documenta via COMMENT ON que as
-- colunas existentes do Lucro Real são COMPARTILHADAS com o Simples Híbrido.
--
-- Todas as colunas referenciadas abaixo já existem. Idempotente por design.

-- Documentar compartilhamento de colunas LR → SH em tenant_settings
COMMENT ON COLUMN public.tenant_settings.icms_contribuinte IS
  'Empresa contribuinte de ICMS. Usado por: LUCRO_REAL, LUCRO_PRESUMIDO, SIMPLES_HIBRIDO.';

COMMENT ON COLUMN public.tenant_settings.iss_municipality_rate IS
  'Alíquota ISS municipal (decimal 0-1). Usado por: LUCRO_REAL, LUCRO_PRESUMIDO, LUCRO_PRESUMIDO_RET, SIMPLES_HIBRIDO.';

COMMENT ON COLUMN public.tenant_settings.lp_estimated_annual_revenue IS
  'Receita bruta anual estimada (R$). Usado para cálculo do adicional IRPJ. Usado por: LUCRO_PRESUMIDO, LUCRO_REAL, SIMPLES_HIBRIDO.';

COMMENT ON COLUMN public.tenant_settings.ibs_reference_pct IS
  'Alíquota de referência IBS — IVA Dual (decimal 0-1). Usado por: LUCRO_REAL, SIMPLES_HIBRIDO.';

COMMENT ON COLUMN public.tenant_settings.cbs_reference_pct IS
  'Alíquota de referência CBS — IVA Dual (decimal 0-1). Usado por: LUCRO_REAL, SIMPLES_HIBRIDO.';

-- Documentar compartilhamento em products
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'additional_irpj_percent'
  ) THEN
    COMMENT ON COLUMN public.products.additional_irpj_percent IS
      'Alíquota adicional IRPJ (%) por produto. Usado por: LUCRO_REAL, LUCRO_PRESUMIDO, SIMPLES_HIBRIDO.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'valor_precificado_icms_piscofins'
  ) THEN
    COMMENT ON COLUMN public.products.valor_precificado_icms_piscofins IS
      'Preço grosseado com ICMS e PIS/COFINS embutidos. Usado por: LUCRO_REAL, SIMPLES_HIBRIDO.';
  END IF;
END $$;

-- Documentar compartilhamento em services
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'services'
      AND column_name = 'additional_irpj_percent'
  ) THEN
    COMMENT ON COLUMN public.services.additional_irpj_percent IS
      'Alíquota adicional IRPJ (%) por serviço. Usado por: LUCRO_REAL, LUCRO_PRESUMIDO, SIMPLES_HIBRIDO.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'services'
      AND column_name = 'valor_precificado_icms_piscofins'
  ) THEN
    COMMENT ON COLUMN public.services.valor_precificado_icms_piscofins IS
      'Preço grosseado com ICMS e PIS/COFINS embutidos. Usado por: LUCRO_REAL, SIMPLES_HIBRIDO.';
  END IF;
END $$;
