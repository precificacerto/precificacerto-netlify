-- Vincular clientes diretamente a funcionários (employees) em vez de users
-- Altera a FK de customers.owner_id para apontar para public.employees(id)

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_owner_id_fkey;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.employees(id) ON DELETE SET NULL;

