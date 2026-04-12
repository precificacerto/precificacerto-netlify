-- Add new expense groups for Lucro Real tax regime:
--   IMPOSTO_LUCRO            → Impostos sobre o Lucro (IRPJ, CSLL, Alíquota adicional IRPJ)
--   IMPOSTO_FATURAMENTO_DENTRO → Impostos sobre o Faturamento (Por dentro) (ICMS próprio, PIS, COFINS)

-- Drop old constraint
ALTER TABLE public.cash_entries
  DROP CONSTRAINT IF EXISTS cash_entries_expense_group_check;

-- Recreate with all required values including new LR groups
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
    'IMPOSTO_LUCRO'::text,
    'IMPOSTO_FATURAMENTO_DENTRO'::text,
    'CUSTO_PRODUTOS'::text,
    'ATIVIDADES_TERCEIRIZADAS'::text,
    'REGIME_TRIBUTARIO'::text,
    'COMISSOES'::text,
    'LUCRO'::text
  ]));
