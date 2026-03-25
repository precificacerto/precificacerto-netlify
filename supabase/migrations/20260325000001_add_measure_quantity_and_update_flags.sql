-- =============================================================================
-- MIGRATION: Add measure_quantity to items + needs_cost_update flags
-- Data: 2026-03-25
--
-- Mudanças:
-- 1. items.measure_quantity — quantidade de medida da embalagem/unidade de compra
--    Ex: um pacote de 500g → quantity=500, measure_quantity=1 (pacote)
--    Permite calcular cost_per_base_unit considerando a unidade de medida real
--
-- 2. Atualização do trigger calc_cost_per_base_unit para considerar
--    measure_quantity na divisão: cost_price / (quantity * measure_quantity)
--
-- 3. products.needs_cost_update — flag para indicar que o custo do produto
--    precisa ser recalculado (ex: um item de receita teve preço alterado)
--
-- 4. services.needs_cost_update — flag análoga para serviços
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ADICIONAR COLUNA measure_quantity NA TABELA items
-- -----------------------------------------------------------------------------
-- measure_quantity representa a quantidade de "pacotes/unidades de compra"
-- que compõem o lote adquirido. Padrão 1 mantém comportamento anterior.
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS measure_quantity NUMERIC DEFAULT 1;

COMMENT ON COLUMN public.items.measure_quantity IS
  'Quantidade de unidades de medida por embalagem/lote comprado. '
  'Ex: caixa com 12 unidades → measure_quantity=12. '
  'Usado em: cost_per_base_unit = cost_price / (quantity * measure_quantity)';

-- -----------------------------------------------------------------------------
-- 2. ATUALIZAR FUNÇÃO TRIGGER calc_cost_per_base_unit
--    ANTES: cost_price / quantity
--    DEPOIS: cost_price / (quantity * COALESCE(measure_quantity, 1))
--
--    Idempotente via CREATE OR REPLACE FUNCTION.
--    O trigger trg_calc_cost_per_base_unit já existe e não precisa ser recriado,
--    mas é redefinido com DROP/CREATE para garantir que dispara também em
--    UPDATE OF measure_quantity.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_cost_per_base_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quantity IS NOT NULL AND NEW.quantity > 0 AND NEW.cost_price IS NOT NULL THEN
    -- Divide pelo produto quantity * measure_quantity para obter custo por
    -- unidade base real. measure_quantity padrão 1 preserva comportamento anterior.
    NEW.cost_per_base_unit := NEW.cost_price / NULLIF(
      NEW.quantity * COALESCE(NEW.measure_quantity, 1),
      0
    );
  ELSE
    NEW.cost_per_base_unit := 0;
  END IF;
  RETURN NEW;
END;
$$;

-- Recriar trigger para incluir measure_quantity como coluna gatilho
DROP TRIGGER IF EXISTS trg_calc_cost_per_base_unit ON public.items;
CREATE TRIGGER trg_calc_cost_per_base_unit
  BEFORE INSERT OR UPDATE OF cost_price, quantity, measure_quantity
  ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.calc_cost_per_base_unit();

-- Recalcular itens existentes com a nova fórmula
UPDATE public.items
SET cost_per_base_unit = CASE
  WHEN quantity > 0 THEN
    cost_price / NULLIF(quantity * COALESCE(measure_quantity, 1), 0)
  ELSE 0
END
WHERE cost_price IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. ADICIONAR COLUNA needs_cost_update NA TABELA products
-- -----------------------------------------------------------------------------
-- Flag que indica se o custo total do produto está desatualizado.
-- Deve ser setada para TRUE quando qualquer item da receita tem custo alterado.
-- A UI/backend usa essa flag para alertar o usuário e acionar recalculo.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS needs_cost_update BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.products.needs_cost_update IS
  'TRUE quando o custo do produto pode estar desatualizado. '
  'Setado automaticamente quando itens da receita têm custo alterado. '
  'Resetado para FALSE após recálculo do custo total.';

-- -----------------------------------------------------------------------------
-- 4. ADICIONAR COLUNA needs_cost_update NA TABELA services
-- -----------------------------------------------------------------------------
-- Flag análoga para serviços: indica que o custo do serviço pode ter mudado
-- porque algum item ou produto associado teve custo atualizado.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS needs_cost_update BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.services.needs_cost_update IS
  'TRUE quando o custo do serviço pode estar desatualizado. '
  'Setado automaticamente quando itens/produtos associados têm custo alterado. '
  'Resetado para FALSE após recálculo do custo total.';

-- -----------------------------------------------------------------------------
-- 5. ÍNDICES PARA CONSULTAS DE ATUALIZAÇÃO PENDENTE
-- -----------------------------------------------------------------------------
-- Permite queries eficientes como: SELECT * FROM products WHERE needs_cost_update = TRUE
CREATE INDEX IF NOT EXISTS idx_products_needs_cost_update
  ON public.products(tenant_id, needs_cost_update)
  WHERE needs_cost_update = TRUE;

CREATE INDEX IF NOT EXISTS idx_services_needs_cost_update
  ON public.services(tenant_id, needs_cost_update)
  WHERE needs_cost_update = TRUE;
