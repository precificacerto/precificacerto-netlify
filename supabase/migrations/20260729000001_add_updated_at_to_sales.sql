-- =============================================================================
-- Fix (Doc 28/07 — item 67): "Cancelar venda" quebra com erro de banco
--   "column \"updated_at\" does not exist in relation \"sales\"".
--
-- Causa raiz: a função public.cancel_sale_cascade (e o update client-side de
-- conclusão de venda) executam `UPDATE public.sales SET ... updated_at = NOW()`,
-- mas a tabela public.sales nunca teve a coluna updated_at (ver initial_schema).
--
-- Correção: adiciona a coluna updated_at, faz backfill com created_at e instala
-- um trigger BEFORE UPDATE para mantê-la automaticamente. Isso destrava o
-- cancelamento de vendas (RPC cancel_sale_cascade) sem alterar a lógica da função.
-- =============================================================================

-- 1) Coluna updated_at (idempotente)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

-- 2) Backfill dos registros existentes (usa created_at como base)
UPDATE public.sales
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- 3) Default para novos registros
ALTER TABLE public.sales
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- 4) Trigger de manutenção automática do updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_sales()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_sales ON public.sales;
CREATE TRIGGER trg_set_updated_at_sales
  BEFORE UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_sales();
