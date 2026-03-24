-- Add service_id to budget_items to support services in budgets
ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

-- Relax the NOT NULL constraint on product_id since now items can be services
ALTER TABLE public.budget_items
  ALTER COLUMN product_id DROP NOT NULL;

-- Remove orphaned rows where product_id was set to NULL (via ON DELETE SET NULL)
-- and service_id is also NULL — these are invalid/dangling records
DELETE FROM public.budget_items
  WHERE product_id IS NULL AND service_id IS NULL;

-- Add constraint: at least one of product_id or service_id must be set
ALTER TABLE public.budget_items
  DROP CONSTRAINT IF EXISTS budget_items_product_or_service_check;

ALTER TABLE public.budget_items
  ADD CONSTRAINT budget_items_product_or_service_check
  CHECK (product_id IS NOT NULL OR service_id IS NOT NULL);

-- Index for service lookups
CREATE INDEX IF NOT EXISTS idx_budget_items_service_id
  ON public.budget_items(service_id)
  WHERE service_id IS NOT NULL;
