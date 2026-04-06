-- Add sale_code to sales table
-- Format: VD-XXXXXX for vendas (balcão and from budget)
--         AG-XXXXXX for agenda completions
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_code text;

-- Add agenda_code to calendar_events table
-- Format: AG-XXXXXX (same value as the sale_code on the linked sale)
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS agenda_code text;
