-- Add missing columns to cash_entries that are used by the frontend
-- but were never added via migrations (likely added via Supabase dashboard)

ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS expense_group    text,
  ADD COLUMN IF NOT EXISTS recurrence_type  text,
  ADD COLUMN IF NOT EXISTS expense_category text;

-- Ensure is_active exists with default true (may already exist from
-- 20260310000003_soft_delete_is_active.sql, IF NOT EXISTS makes this safe)
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Backfill is_active = true for any existing NULL rows
UPDATE public.cash_entries SET is_active = true WHERE is_active IS NULL;

-- Recreate the expense_group check constraint to cover all valid values
-- (safe to drop-and-recreate; IF NOT EXISTS already removed it above if it existed)
ALTER TABLE public.cash_entries
  DROP CONSTRAINT IF EXISTS cash_entries_expense_group_check;

ALTER TABLE public.cash_entries
  ADD CONSTRAINT cash_entries_expense_group_check
  CHECK (expense_group IS NULL OR expense_group = ANY (ARRAY[
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
