-- =============================================================================
-- MIGRATION: Item Type, Product Type & Pricing Sale Context
-- Ajuste 1: Item precisa ter "tipo" (insumo, revenda, embalagem)
-- Ajuste 2: Imposto não fica fixo no produto — fica na precificação/simulação
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUM: Tipo do Item
-- -----------------------------------------------------------------------------
CREATE TYPE public.item_type AS ENUM ('INSUMO', 'REVENDA', 'EMBALAGEM');

-- -----------------------------------------------------------------------------
-- 2. ENUM: Tipo do Produto
-- -----------------------------------------------------------------------------
CREATE TYPE public.product_type AS ENUM ('PRODUZIDO', 'REVENDA');

-- -----------------------------------------------------------------------------
-- 3. ENUM: Escopo de Venda (já existia como text, agora como enum)
-- -----------------------------------------------------------------------------
CREATE TYPE public.sale_scope AS ENUM ('INTRAESTADUAL', 'INTERESTADUAL');

-- -----------------------------------------------------------------------------
-- 4. ENUM: Tipo de Comprador
-- -----------------------------------------------------------------------------
CREATE TYPE public.buyer_type_enum AS ENUM ('CONSUMIDOR_FINAL', 'CONTRIBUINTE_PJ');

-- -----------------------------------------------------------------------------
-- 5. EXPANDIR TABELA ITEMS
-- -----------------------------------------------------------------------------
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS item_type public.item_type DEFAULT 'INSUMO',
  ADD COLUMN IF NOT EXISTS cost_per_base_unit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_unit public.unit_measure DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS has_st boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_monofasico boolean DEFAULT false;

-- Comentários descritivos
COMMENT ON COLUMN public.items.item_type IS 'Tipo: INSUMO (entra em receita), REVENDA (produto acabado), EMBALAGEM';
COMMENT ON COLUMN public.items.cost_per_base_unit IS 'Custo por unidade base, calculado: cost_price / quantity. Ex: R$8/kg → R$0,008/g';
COMMENT ON COLUMN public.items.base_unit IS 'Unidade base para conversão (g, ml, un, etc.)';
COMMENT ON COLUMN public.items.has_st IS 'Tem Substituição Tributária?';
COMMENT ON COLUMN public.items.is_monofasico IS 'É monofásico (PIS/COFINS)?';

-- -----------------------------------------------------------------------------
-- 6. EXPANDIR TABELA PRODUCTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type public.product_type DEFAULT 'PRODUZIDO',
  ADD COLUMN IF NOT EXISTS base_item_id uuid REFERENCES public.items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.product_type IS 'PRODUZIDO = receita com itens, REVENDA = 1 item mercadoria como base de custo';
COMMENT ON COLUMN public.products.base_item_id IS 'Para produto tipo REVENDA: o item de referência de custo';

-- -----------------------------------------------------------------------------
-- 7. EXPANDIR PRICING_CALCULATIONS COM CONTEXTO DE VENDA
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_calculations
  ADD COLUMN IF NOT EXISTS sale_scope public.sale_scope DEFAULT 'INTRAESTADUAL',
  ADD COLUMN IF NOT EXISTS buyer_type public.buyer_type_enum DEFAULT 'CONSUMIDOR_FINAL',
  ADD COLUMN IF NOT EXISTS destination_state char(2),
  ADD COLUMN IF NOT EXISTS icms_rate_applied numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difal_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_st_applied boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_monofasico_applied boolean DEFAULT false;

COMMENT ON COLUMN public.pricing_calculations.sale_scope IS 'Contexto: venda dentro ou fora do estado';
COMMENT ON COLUMN public.pricing_calculations.buyer_type IS 'Contexto: consumidor final ou PJ contribuinte';
COMMENT ON COLUMN public.pricing_calculations.destination_state IS 'UF de destino da venda (para interestadual)';
COMMENT ON COLUMN public.pricing_calculations.icms_rate_applied IS 'Alíquota ICMS efetiva usada neste cálculo';
COMMENT ON COLUMN public.pricing_calculations.difal_value IS 'Valor do DIFAL quando aplicável';

-- -----------------------------------------------------------------------------
-- 8. FUNÇÃO: Calcular custo por unidade base automaticamente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_cost_per_base_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity IS NOT NULL AND NEW.quantity > 0 AND NEW.cost_price IS NOT NULL THEN
    NEW.cost_per_base_unit := NEW.cost_price / NEW.quantity;
  ELSE
    NEW.cost_per_base_unit := 0;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para calcular automaticamente ao inserir ou atualizar
DROP TRIGGER IF EXISTS trg_calc_cost_per_base_unit ON public.items;
CREATE TRIGGER trg_calc_cost_per_base_unit
  BEFORE INSERT OR UPDATE OF cost_price, quantity
  ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.calc_cost_per_base_unit();

-- Atualizar itens existentes (recalcular cost_per_base_unit)
UPDATE public.items
SET cost_per_base_unit = CASE
  WHEN quantity > 0 THEN cost_price / quantity
  ELSE 0
END
WHERE cost_per_base_unit = 0 OR cost_per_base_unit IS NULL;
