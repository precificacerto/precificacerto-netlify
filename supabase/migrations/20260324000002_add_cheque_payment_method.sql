-- Add CHEQUE to payment_method enum
DO $$ BEGIN
  ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'CHEQUE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
