-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S1.1
-- Tabela tax_rates_periods: alíquotas tributárias com vigência por período.
--
-- Suporta tributos atuais (2026): ICMS, PIS, COFINS, ISS, IPI, ICMS_ST,
-- DIFAL, FCP. Modelo extensível para reforma tributária 2027+ (IBS, CBS)
-- sem alteração de schema.
--
-- Uso pelo motor: GET /api/tax-periods?tenant_id=X&date=Y retorna alíquotas
-- vigentes na data. Snapshot opcional em tax_breakdown dos itens.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tax_rates_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tax_type      TEXT NOT NULL,
  origin_state  CHAR(2) NULL,
  dest_state    CHAR(2) NULL,
  rate_pct      NUMERIC(8,5) NOT NULL,
  valid_from    DATE NOT NULL,
  valid_until   DATE NULL,
  notes         TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tax_rates_periods_tax_type_chk CHECK (
    tax_type IN ('ICMS','PIS','COFINS','ISS','IPI','ICMS_ST','DIFAL','FCP','IBS','CBS','ISS_RETIDO')
  ),
  CONSTRAINT tax_rates_periods_rate_chk CHECK (rate_pct >= 0 AND rate_pct <= 1),
  CONSTRAINT tax_rates_periods_period_chk CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_periods_lookup
  ON public.tax_rates_periods(tenant_id, tax_type, valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_tax_rates_periods_active
  ON public.tax_rates_periods(tenant_id, tax_type)
  WHERE valid_until IS NULL;

ALTER TABLE public.tax_rates_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_rates_periods_tenant_select" ON public.tax_rates_periods;
CREATE POLICY "tax_rates_periods_tenant_select" ON public.tax_rates_periods FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tax_rates_periods_tenant_insert" ON public.tax_rates_periods;
CREATE POLICY "tax_rates_periods_tenant_insert" ON public.tax_rates_periods FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tax_rates_periods_tenant_update" ON public.tax_rates_periods;
CREATE POLICY "tax_rates_periods_tenant_update" ON public.tax_rates_periods FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tax_rates_periods_tenant_delete" ON public.tax_rates_periods;
CREATE POLICY "tax_rates_periods_tenant_delete" ON public.tax_rates_periods FOR DELETE
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

COMMENT ON TABLE public.tax_rates_periods IS
  'Alíquotas tributárias por tenant com vigência por período. Consultadas pelo Motor de Reapuração de Margem (MRM) durante cálculo de impostos sequencial por dentro (ICMS, PIS, COFINS, ISS) e por fora (IPI, ICMS_ST, DIFAL, FCP, IBS, CBS). rate_pct em decimal (0.07 = 7%). origin_state/dest_state opcionais para tributos interestaduais.';

COMMENT ON COLUMN public.tax_rates_periods.rate_pct IS
  'Alíquota em decimal (0.07 = 7%). Range [0, 1].';

COMMENT ON COLUMN public.tax_rates_periods.valid_until IS
  'Data fim da vigência (inclusiva). NULL = vigência aberta (atual).';
