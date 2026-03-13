ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_message TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_budget_message TEXT DEFAULT NULL;

COMMENT ON COLUMN tenant_settings.whatsapp_reminder_message IS 'Template da mensagem de lembrete de agendamento. Use {{nome_cliente}} para o nome do cliente.';
COMMENT ON COLUMN tenant_settings.whatsapp_budget_message IS 'Template da mensagem de envio de orcamento. Use {{nome_cliente}} para o nome do cliente.';
