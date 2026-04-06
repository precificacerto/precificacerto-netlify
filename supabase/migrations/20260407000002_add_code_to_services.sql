-- Add code column to services table
-- Same pattern as products.code (text, nullable, unique per service)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS code text;
