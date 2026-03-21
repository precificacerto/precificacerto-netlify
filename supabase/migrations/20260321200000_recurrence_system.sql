-- ============================================================================
-- Recurrence System — Tables for product/service recurrence tracking & WhatsApp dispatch
-- ============================================================================

-- 1. Add recurrence_days to products and services
ALTER TABLE products ADD COLUMN IF NOT EXISTS recurrence_days INTEGER DEFAULT NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS recurrence_days INTEGER DEFAULT NULL;

-- 2. Recurrence records — tracks each sale that has a recurrence linked
CREATE TABLE IF NOT EXISTS recurrence_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    sale_date DATE NOT NULL,
    dispatch_date DATE NOT NULL,
    recurrence_days INTEGER NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'CANCELLED')),
    type TEXT NOT NULL CHECK (type IN ('PRODUCT', 'SERVICE')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recurrence_records_tenant ON recurrence_records(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_recurrence_records_dispatch ON recurrence_records(dispatch_date, status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_recurrence_records_customer ON recurrence_records(customer_id);

-- RLS
ALTER TABLE recurrence_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurrence_records_tenant_policy" ON recurrence_records
    FOR ALL USING (tenant_id = get_auth_tenant_id());

-- 3. Recurrence messages — template messages per user per tenant (one for products, one for services)
CREATE TABLE IF NOT EXISTS recurrence_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message_products TEXT DEFAULT '',
    message_services TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- RLS
ALTER TABLE recurrence_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recurrence_messages_tenant_policy" ON recurrence_messages
    FOR ALL USING (tenant_id = get_auth_tenant_id());

-- 4. Recurrence dispatch queue — queued messages for WhatsApp dispatch
CREATE TABLE IF NOT EXISTS recurrence_dispatch_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recurrence_record_id UUID NOT NULL REFERENCES recurrence_records(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED')),
    error_message TEXT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dispatch_queue_pending ON recurrence_dispatch_queue(scheduled_at, status)
    WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_dispatch_queue_tenant ON recurrence_dispatch_queue(tenant_id);

-- RLS
ALTER TABLE recurrence_dispatch_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatch_queue_tenant_policy" ON recurrence_dispatch_queue
    FOR ALL USING (tenant_id = get_auth_tenant_id());
