-- Epic MELHORIAS-22-ABR2026 - Fix
-- Corrige o FK de public.orders.employee_id:
-- ANTES: REFERENCES auth.users(id)  -- incompatível com budgets.employee_id / sales.employee_id
-- DEPOIS: REFERENCES public.employees(id) ON DELETE SET NULL

-- Dropa o FK conhecido (nome convencional do Postgres)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_employee_id_fkey;

-- Fallback: remove qualquer outro FK remanescente na coluna employee_id (nome não-convencional)
DO $$
DECLARE
  v_name TEXT;
BEGIN
  FOR v_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema    = kcu.table_schema
    WHERE tc.table_schema    = 'public'
      AND tc.table_name      = 'orders'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name    = 'employee_id'
  LOOP
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || quote_ident(v_name);
  END LOOP;
END $$;

-- Recria o FK apontando para public.employees(id)
ALTER TABLE public.orders
  ADD CONSTRAINT orders_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.employee_id IS
  'Vendedor responsável pelo pedido. FK para public.employees(id) (alinhado com budgets/sales).';
