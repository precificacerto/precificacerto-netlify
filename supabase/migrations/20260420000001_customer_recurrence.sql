-- ============================================================================
-- Customer Recurrence — Recurrence tied to customers (not products/services)
-- Dispatch: customer.recurrence_days after last sale. Any new sale resets the timer.
-- ============================================================================

-- 1. Add recurrence columns to customers
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS recurrence_active BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS recurrence_days INTEGER,
    ADD COLUMN IF NOT EXISTS recurrence_message TEXT;

-- 2. Extend recurrence_records.type to accept CUSTOMER
ALTER TABLE recurrence_records DROP CONSTRAINT IF EXISTS recurrence_records_type_check;
ALTER TABLE recurrence_records
    ADD CONSTRAINT recurrence_records_type_check
    CHECK (type IN ('PRODUCT', 'SERVICE', 'CUSTOMER'));

-- 3. Index to speed up lookup of pending CUSTOMER records per customer
CREATE INDEX IF NOT EXISTS idx_recurrence_records_customer_pending
    ON recurrence_records(customer_id, type, status)
    WHERE is_active = true AND status = 'PENDING';
