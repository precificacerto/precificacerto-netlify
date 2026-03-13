ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS
  pricing_engine_updated_notice_dismissed boolean DEFAULT false;
