ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.completed_services ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_employees_active ON public.employees(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_customers_active ON public.customers(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_budgets_active ON public.budgets(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sales_active ON public.sales(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cash_entries_active ON public.cash_entries(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_calendar_events_active ON public.calendar_events(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stock_active ON public.stock(tenant_id) WHERE is_active = true;
