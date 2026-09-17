-- 20260917000001 — REPASSE, AMORTIZACAO e OUTROS na CHECK de `cash_entries.expense_group`
--
-- ORDEM DE APLICAÇÃO: **ANTES OU JUNTO** do merge.
-- Esta migração amplia uma CHECK que o código novo passa a GRAVAR. Mergear sem aplicar deixa
-- o usuário escolhendo "Repasse", "Devoluções" ou "Amortização de Dívida (principal)" no
-- seletor e o INSERT falhando no banco — é o caso do `expense_snapshot` de 01/09/2026, e
-- `.claude/rules/migration-delivery.md` o registra.
--
-- ── O QUE ELA CORRIGE, MEDIDO EM 17/09/2026 ─────────────────────────────────
--
-- A CHECK vigente (`20260716000001_add_reserva_tecnica_expense_group.sql`) lista 16 grupos.
-- `EXPENSE_GROUP_KEYS`, a fonte única do código, tem 19 depois desta rodada. Os TRÊS que
-- faltam na CHECK são:
--
--   AMORTIZACAO — existe no código desde 09/09/2026, tem `case` no `switch` do DFC e linha
--                 nas três variantes de demonstração. NUNCA pôde ser gravado.
--   OUTROS      — está em `EXPENSE_GROUP_KEYS` e é o balde do desconhecido; não é oferecido
--                 no seletor (`noSeletor: true`), mas é um valor legítimo do tipo e a CHECK
--                 o recusaria se alguma rota o gravasse.
--   REPASSE     — o grupo novo desta rodada.
--
-- Nenhum dado existente é tocado: a CHECK só ALARGA o conjunto aceito. Toda linha que passava
-- antes continua passando, e por isso não há risco de a recriação falhar por linha violadora.
--
-- ── DEPOIS DE APLICAR ───────────────────────────────────────────────────────
--
-- Verificar por CONSULTA AO CATÁLOGO, não pelo retorno do comando:
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.cash_entries'::regclass
--     and conname  = 'cash_entries_expense_group_check';
--
-- E recarregar o cache do PostgREST — ele NÃO vem junto com o COMMIT:
--
--   NOTIFY pgrst, 'reload schema';

BEGIN;

ALTER TABLE public.cash_entries
  DROP CONSTRAINT IF EXISTS cash_entries_expense_group_check;

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
    'RESERVA_TECNICA'::text,
    'DEDUCAO_RECEITA'::text,
    'LUCRO'::text,
    'AMORTIZACAO'::text,
    'REPASSE'::text,
    'OUTROS'::text
  ]));

COMMIT;

-- NOTA PARA QUEM APLICAR PELO CONECTOR DO SUPABASE: ele abre transação própria, e o BEGIN
-- acima produz `WARNING: there is already a transaction in progress` enquanto o COMMIT fecha
-- a transação DELE. Remova os dois nesse caminho. Pelo SQL Editor ou por psql, o arquivo vai
-- como está — é o que garante rollback se algum comando falhar no meio.
