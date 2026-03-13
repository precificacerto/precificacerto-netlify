-- Safe guard for a possible expense_group enum.
-- In this database cash_entries.expense_group is currently a text column,
-- and no enum named like '%expense_group%' exists (see pg_type scan).
-- Still, we defensively add the new values to an enum called expense_group_enum
-- IF (and only if) it exists, to fix environments where the column was created as enum.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typtype = 'e'
      AND typname = 'expense_group_enum'
  ) THEN
    ALTER TYPE expense_group_enum
      ADD VALUE IF NOT EXISTS 'MAO_DE_OBRA_PRODUTIVA';

    ALTER TYPE expense_group_enum
      ADD VALUE IF NOT EXISTS 'MAO_DE_OBRA_ADMINISTRATIVA';
  END IF;
END
$$;

