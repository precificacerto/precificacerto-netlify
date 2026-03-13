-- Add columns for Inscrição Estadual, IE state, sales scope and buyer type
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS ie_state_code char(2),
  ADD COLUMN IF NOT EXISTS sales_scope text DEFAULT 'INTRAESTADUAL',
  ADD COLUMN IF NOT EXISTS buyer_type text DEFAULT 'CONSUMIDOR_FINAL';
