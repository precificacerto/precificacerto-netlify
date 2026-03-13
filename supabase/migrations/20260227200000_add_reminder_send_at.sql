-- Adicionar coluna reminder_send_at para controlar quando o lembrete deve ser enviado
-- Regra: calculado ao criar/editar agendamento
--   - Se falta <24h: reminder_send_at = agora + 10 minutos
--   - Se falta ≥24h: reminder_send_at = start_time - 24h
ALTER TABLE public.calendar_events 
  ADD COLUMN IF NOT EXISTS reminder_send_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.calendar_events.reminder_send_at IS 'Horário em que o lembrete WhatsApp deve ser enviado. Calculado ao criar/editar agendamento.';

-- Para agendamentos já existentes que têm cliente e ainda não tiveram lembrete:
-- define reminder_send_at = start_time - 24h (se o evento ainda está no futuro)
UPDATE public.calendar_events
SET reminder_send_at = start_time - interval '24 hours'
WHERE customer_id IS NOT NULL
  AND whatsapp_reminder_sent = false
  AND start_time > now()
  AND reminder_send_at IS NULL;
