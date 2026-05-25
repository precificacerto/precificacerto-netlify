-- =============================================================================
-- V15.1 (Founder request 2026-05-25): coluna `products.productive_labor_total`
-- =============================================================================
-- Problema: orçamento/venda no balcão mostram step 9 "Redução de custos" apenas
-- com `products.cost_total`, sem somar Mão de Obra Produtiva. Essa MO vive em
-- `labor_costs.net_value` (tabela dedicada) ou `pricing_calculations.total_labor_net`,
-- mas o helper resolveProductLaborTotal pode retornar 0 quando ambas estão
-- desincronizadas com o cadastro do produto.
--
-- Solução: nova coluna canônica `products.productive_labor_total` (R$ unitário)
-- — fonte ÚNICA de verdade da MO produtiva consolidada. Populada via backfill
-- usando precedência: labor_costs > pricing_calculations.total_labor_net.
--
-- Esta migration:
--   1. Adiciona coluna em `products`
--   2. Faz backfill com SUM(labor_costs.net_value) e fallback total_labor_net
--   3. COMMENT explicativo
--
-- Isolation: migration aditiva, ZERO impacto em produtos existentes que NÃO usam
-- precificação avançada. Default 0 preserva comportamento V14 anterior.

BEGIN;

-- 1) Adiciona coluna (idempotente)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS productive_labor_total numeric DEFAULT 0;

COMMENT ON COLUMN public.products.productive_labor_total IS
  'V15.1 (2026-05-25): MO Produtiva consolidada por unidade (R$). Fonte canônica '
  'usada pelo motor RR no step 9 (Redução de custos). Populada via labor_costs.net_value '
  'ou pricing_calculations.total_labor_net pelo módulo de Formação de Preço.';

-- 2) Backfill — precedência: labor_costs.net_value (tabela dedicada) > pricing_calculations.total_labor_net
-- yield_quantity considerado pelo helper resolveProductLaborTotal no runtime; aqui salvamos POR UNIDADE.
WITH labor_from_dedicated AS (
  SELECT
    lc.product_id,
    SUM(COALESCE(NULLIF(lc.net_value, 0), lc.gross_value, 0)) AS labor_sum
  FROM public.labor_costs lc
  WHERE lc.product_id IS NOT NULL
  GROUP BY lc.product_id
  HAVING SUM(COALESCE(NULLIF(lc.net_value, 0), lc.gross_value, 0)) > 0
),
labor_from_pricing AS (
  SELECT DISTINCT ON (pc.product_id)
    pc.product_id,
    COALESCE(NULLIF(pc.total_labor_net, 0), pc.total_labor_gross, 0) AS labor_sum
  FROM public.pricing_calculations pc
  WHERE pc.product_id IS NOT NULL
    AND COALESCE(NULLIF(pc.total_labor_net, 0), pc.total_labor_gross, 0) > 0
  ORDER BY pc.product_id, pc.id  -- determinístico quando há múltiplas linhas
)
UPDATE public.products p
SET productive_labor_total = COALESCE(
  (SELECT labor_sum FROM labor_from_dedicated WHERE product_id = p.id),
  (SELECT labor_sum FROM labor_from_pricing WHERE product_id = p.id),
  0
)
WHERE p.productive_labor_total = 0 OR p.productive_labor_total IS NULL;

-- 3) Index opcional para consultas filtradas (raras — não criamos por enquanto)
-- CREATE INDEX IF NOT EXISTS idx_products_productive_labor ON public.products(productive_labor_total)
--   WHERE productive_labor_total > 0;

COMMIT;

-- Rollback (manual):
-- ALTER TABLE public.products DROP COLUMN IF EXISTS productive_labor_total;
