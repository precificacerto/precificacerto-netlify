-- Add employee_id (seller) to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_sales_employee_id ON sales(employee_id) WHERE employee_id IS NOT NULL;

-- Add service_id to sale_items for service-type items
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_sale_items_service_id ON sale_items(service_id) WHERE service_id IS NOT NULL;
