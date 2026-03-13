-- Split labor expense groups into productive vs administrative
-- NOTE: cash_entries.expense_group is currently a text/varchar column (not enum),
-- so we don't need to ALTER TYPE, only update existing data and document semantics.

-- Legacy data: all existing 'MAO_DE_OBRA' entries become administrative labor by default.
-- The admin can later reclassify specific entries as MAO_DE_OBRA_PRODUTIVA no fluxo de caixa.
UPDATE public.cash_entries
SET expense_group = 'MAO_DE_OBRA_ADMINISTRATIVA'
WHERE expense_group = 'MAO_DE_OBRA';

COMMENT ON COLUMN public.cash_entries.expense_group IS
  'Grupos: '
  'MAO_DE_OBRA_PRODUTIVA (entra no CMV como custo direto), '
  'MAO_DE_OBRA_ADMINISTRATIVA (entra no coeficiente como % de estrutura), '
  'DESPESA_FIXA, DESPESA_VARIAVEL, DESPESA_FINANCEIRA, IMPOSTO.';

