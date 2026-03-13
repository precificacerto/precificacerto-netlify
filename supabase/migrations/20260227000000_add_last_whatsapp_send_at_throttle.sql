-- Throttle: 1 mensagem a cada 60 segundos por tenant (lembrete + envio orçamento)
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS last_whatsapp_send_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.tenant_settings.last_whatsapp_send_at IS 'Último envio WhatsApp (throttle 60s entre disparos de lembrete e orçamento).';

-- Garantir coluna de lembrete no calendar_events (caso migration anterior não tenha rodado)
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent boolean DEFAULT false;
