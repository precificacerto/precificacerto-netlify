-- Reset all business data for tenant 20e08592-f957-4e72-b7eb-251387e34eb9
-- Keeps: tenants record, users, tenant_expense_config, tenant_settings
-- Deletes: all transactional/operational data

DO $$
DECLARE
  v_tenant_id uuid := '20e08592-f957-4e72-b7eb-251387e34eb9';
BEGIN

  -- Allocations (linked via orders, no direct tenant_id)
  DELETE FROM public.allocations
    WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = v_tenant_id);

  -- Orders
  DELETE FROM public.orders WHERE tenant_id = v_tenant_id;

  -- WhatsApp dispatches
  DELETE FROM public.whatsapp_dispatches WHERE tenant_id = v_tenant_id;

  -- Cash / Financial entries
  DELETE FROM public.cash_entries    WHERE tenant_id = v_tenant_id;
  DELETE FROM public.cashier_months  WHERE tenant_id = v_tenant_id;

  -- Sale items cascade from sales FK; delete sales directly
  DELETE FROM public.sales WHERE tenant_id = v_tenant_id;

  -- Budget items cascade from budgets FK; delete budgets directly
  DELETE FROM public.budgets WHERE tenant_id = v_tenant_id;

  -- Agenda / Calendar
  DELETE FROM public.completed_services WHERE tenant_id = v_tenant_id;
  DELETE FROM public.calendar_events    WHERE tenant_id = v_tenant_id;

  -- Production items (linked via productions, no direct tenant_id)
  DELETE FROM public.production_items
    WHERE production_id IN (SELECT id FROM public.productions WHERE tenant_id = v_tenant_id);
  DELETE FROM public.productions WHERE tenant_id = v_tenant_id;

  -- Stock movements (linked via stock, no direct tenant_id)
  DELETE FROM public.stock_movements
    WHERE stock_id IN (SELECT id FROM public.stock WHERE tenant_id = v_tenant_id);
  DELETE FROM public.stock WHERE tenant_id = v_tenant_id;

  -- Product items (linked via products, no direct tenant_id)
  DELETE FROM public.product_items
    WHERE product_id IN (SELECT id FROM public.products WHERE tenant_id = v_tenant_id);
  DELETE FROM public.products WHERE tenant_id = v_tenant_id;

  -- Service items (linked via services, no direct tenant_id)
  DELETE FROM public.service_items
    WHERE service_id IN (SELECT id FROM public.services WHERE tenant_id = v_tenant_id);
  DELETE FROM public.services WHERE tenant_id = v_tenant_id;

  -- Items / Insumos
  DELETE FROM public.items WHERE tenant_id = v_tenant_id;

  -- Customers
  DELETE FROM public.customers WHERE tenant_id = v_tenant_id;

  -- Employees and their commission table links
  DELETE FROM public.schedule_employees         WHERE tenant_id = v_tenant_id;
  DELETE FROM public.employee_commission_tables WHERE tenant_id = v_tenant_id;
  DELETE FROM public.employees WHERE tenant_id = v_tenant_id;

  -- Commission tables
  DELETE FROM public.commission_tables WHERE tenant_id = v_tenant_id;

  RAISE NOTICE 'Tenant % data reset complete.', v_tenant_id;
END $$;
