-- Extend CHECK constraint on cash_entries.expense_group
-- to allow all expense groups used by Simples Nacional / MEI regimes.

-- Drop old constraint
ALTER TABLE public.cash_entries
  DROP CONSTRAINT IF EXISTS cash_entries_expense_group_check;

-- Recreate with all required values
ALTER TABLE public.cash_entries
  ADD CONSTRAINT cash_entries_expense_group_check
  CHECK (expense_group = ANY (ARRAY[
    'MAO_DE_OBRA'::text,
    'MAO_DE_OBRA_PRODUTIVA'::text,
    'MAO_DE_OBRA_ADMINISTRATIVA'::text,
    'DESPESA_FIXA'::text,
    'DESPESA_FINANCEIRA'::text,
    'DESPESA_VARIAVEL'::text,
    'IMPOSTO'::text,
    'CUSTO_PRODUTOS'::text,
    'ATIVIDADES_TERCEIRIZADAS'::text,
    'REGIME_TRIBUTARIO'::text,
    'COMISSOES'::text,
    'LUCRO'::text
  ]));
