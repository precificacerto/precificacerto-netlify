-- Update CHECK constraint on cash_entries.expense_group
-- to allow new labor groups for productive vs administrative labor.

-- Drop old constraint (if exists)
ALTER TABLE public.cash_entries
  DROP CONSTRAINT IF EXISTS cash_entries_expense_group_check;

-- Recreate with extended allowed values
ALTER TABLE public.cash_entries
  ADD CONSTRAINT cash_entries_expense_group_check
  CHECK (expense_group = ANY (ARRAY[
    'MAO_DE_OBRA'::text,
    'MAO_DE_OBRA_PRODUTIVA'::text,
    'MAO_DE_OBRA_ADMINISTRATIVA'::text,
    'DESPESA_FIXA'::text,
    'DESPESA_FINANCEIRA'::text,
    'DESPESA_VARIAVEL'::text,
    'IMPOSTO'::text
  ]));

