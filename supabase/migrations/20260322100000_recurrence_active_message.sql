-- ============================================================================
-- Add recurrence_active and recurrence_message to products and services
-- Add custom_message to recurrence_records for per-record override
-- ============================================================================

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS recurrence_active BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS recurrence_message TEXT;

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS recurrence_active BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS recurrence_message TEXT;

ALTER TABLE recurrence_records
    ADD COLUMN IF NOT EXISTS custom_message TEXT;
