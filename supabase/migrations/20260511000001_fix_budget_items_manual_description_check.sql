-- Fix: budget_items_product_or_service_check rejeita itens manuais
--
-- Contexto:
-- A constraint anterior exigia product_id OU service_id NOT NULL, impedindo
-- o salvamento de itens manuais (somente manual_description preenchido).
-- O fluxo de orçamentos (src/pages/orcamentos/index.tsx) já popula a coluna
-- manual_description para itens manuais. Atualizamos a constraint para o
-- mesmo padrão já usado em order_items.

-- Garantir que a coluna manual_description existe (idempotente).
ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS manual_description TEXT NULL;

-- Substituir a constraint antiga por uma versão que aceita itens manuais.
ALTER TABLE public.budget_items
  DROP CONSTRAINT IF EXISTS budget_items_product_or_service_check;

ALTER TABLE public.budget_items
  ADD CONSTRAINT budget_items_product_or_service_check
  CHECK (
    product_id IS NOT NULL
    OR service_id IS NOT NULL
    OR manual_description IS NOT NULL
  );
