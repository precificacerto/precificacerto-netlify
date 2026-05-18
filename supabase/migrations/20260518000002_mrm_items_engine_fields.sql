-- =====================================================================
-- Motor de Reapuração de Margem (MRM) — S1.2
-- Adiciona campos do motor em budget_items, sale_items e order_items:
--   - commission_pct / profit_pct : pesos originais para redistribuição
--     proporcional do RRO após desconto (Tabela 18-19 da spec)
--   - tax_breakdown (jsonb)       : snapshot do cálculo sequencial do motor
--                                   (regime, alíquotas vigentes, valores por
--                                   tributo, RRO, validações V1-V6)
--
-- Schema esperado em tax_breakdown (jsonb):
-- {
--   "engine_version": "2.0.0",
--   "effective_date": "2026-05-18",
--   "regime": "SIMPLES_NACIONAL" | "MEI" | "LUCRO_PRESUMIDO" | "LUCRO_REAL",
--   "use_snapshot_rates": true,
--   "taxes_inside": [
--     { "type": "ICMS",       "rate_pct": 0.07,   "base": 100.0, "amount": 7.0 },
--     { "type": "PIS",        "rate_pct": 0.0165, "base": 93.0,  "amount": 1.53 },
--     { "type": "COFINS",     "rate_pct": 0.076,  "base": 93.0,  "amount": 7.07 },
--     { "type": "ISS",        "rate_pct": 0.05,   "base": 84.4,  "amount": 4.22 }
--   ],
--   "taxes_outside": [
--     { "type": "IPI",        "rate_pct": 0.05,   "base": 84.4,  "amount": 4.22 },
--     { "type": "ICMS_ST",    "rate_pct": 0.10,   "base": 84.4,  "amount": 8.44 }
--   ],
--   "rb": 100.0,
--   "desc_value": 10.0,
--   "rv": 90.0,
--   "cp": 45.0,
--   "mod": 5.0,
--   "dop": 12.0,
--   "rro": 14.0,
--   "new_commission": 4.67,
--   "new_profit": 9.33,
--   "validations": { "v1": true, "v2": true, "v3": true, "v4": true, "v5": true, "v6": true },
--   "valid": true,
--   "error_code": null
-- }
-- =====================================================================

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS profit_pct     NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS tax_breakdown  JSONB NULL;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS commission_pct  NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS profit_pct      NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS tax_breakdown   JSONB NULL,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(6,3) NULL;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS commission_pct  NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS profit_pct      NUMERIC(8,5) NULL,
  ADD COLUMN IF NOT EXISTS tax_breakdown   JSONB NULL,
  ADD COLUMN IF NOT EXISTS discount        NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(6,3) NULL;

CREATE INDEX IF NOT EXISTS idx_budget_items_tax_breakdown_valid
  ON public.budget_items((tax_breakdown->>'valid'))
  WHERE tax_breakdown IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_tax_breakdown_valid
  ON public.sale_items((tax_breakdown->>'valid'))
  WHERE tax_breakdown IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_tax_breakdown_valid
  ON public.order_items((tax_breakdown->>'valid'))
  WHERE tax_breakdown IS NOT NULL;

COMMENT ON COLUMN public.budget_items.commission_pct IS
  'MRM: % comissão original do item, usado como peso para redistribuição proporcional do RRO. Decimal (0.05 = 5%).';

COMMENT ON COLUMN public.budget_items.profit_pct IS
  'MRM: % lucro original do item, usado como peso para redistribuição proporcional do RRO. Decimal (0.10 = 10%).';

COMMENT ON COLUMN public.budget_items.tax_breakdown IS
  'MRM: snapshot completo do cálculo do motor — regime, alíquotas vigentes na criação, valores por tributo (sequencial dentro + por fora), RRO, validações V1-V6. Ver schema no header da migration 20260518000002.';

COMMENT ON COLUMN public.sale_items.commission_pct IS 'Idem budget_items.commission_pct';
COMMENT ON COLUMN public.sale_items.profit_pct IS 'Idem budget_items.profit_pct';
COMMENT ON COLUMN public.sale_items.tax_breakdown IS 'Idem budget_items.tax_breakdown';
COMMENT ON COLUMN public.sale_items.discount_percent IS 'MRM: % desconto aplicado ao item (alinhamento com budget_items).';

COMMENT ON COLUMN public.order_items.commission_pct IS 'Idem budget_items.commission_pct';
COMMENT ON COLUMN public.order_items.profit_pct IS 'Idem budget_items.profit_pct';
COMMENT ON COLUMN public.order_items.tax_breakdown IS 'Idem budget_items.tax_breakdown';
COMMENT ON COLUMN public.order_items.discount IS 'MRM: valor R$ do desconto aplicado ao item.';
COMMENT ON COLUMN public.order_items.discount_percent IS 'MRM: % desconto aplicado ao item.';
