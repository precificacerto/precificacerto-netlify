-- Add partial payment support to pending_receivables
ALTER TABLE public.pending_receivables
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_remaining NUMERIC(12,2);

-- Initialize amount_remaining = amount for existing PENDING records
UPDATE public.pending_receivables
  SET amount_remaining = amount - COALESCE(amount_paid, 0)
  WHERE amount_remaining IS NULL;
