-- Add CHEQUE_PRE_DATADO to payment_method enum
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'CHEQUE_PRE_DATADO';
