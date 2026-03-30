-- Add flag to track if onboarding data was already mirrored to cash_entries
ALTER TABLE tenant_settings
ADD COLUMN IF NOT EXISTS onboarding_mirrored_to_cashflow BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tenant_settings.onboarding_mirrored_to_cashflow IS
'Flag para controlar se os dados do onboarding já foram espelhados como cash_entries no mês anterior. Evita duplicação.';
