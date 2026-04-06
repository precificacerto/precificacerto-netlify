-- Add installment_preset to budgets so that the parcel conditions chosen
-- in the budget form can be inherited when launching the receipt in Vendas.
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS installment_preset text;
