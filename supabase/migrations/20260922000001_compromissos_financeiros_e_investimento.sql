-- ============================================================================================
-- COMPROMISSOS FINANCEIROS NO PREÇO · INVESTIMENTO FORA DELE
--
-- Comando do PO de 21/09/2026, §10. Migração ADITIVA: nenhuma coluna existente é alterada e
-- NENHUM lançamento é reclassificado. A reclassificação é escolha do usuário, lançamento a
-- lançamento — `fato-vs-referencia.md`: o grupo gravado é fato histórico daquele lançamento.
--
-- ── 1. O GRUPO `INVESTIMENTO` ───────────────────────────────────────────────────────────────
-- Investimento só acontece se sobrar dinheiro: sai do lucro e NÃO entra no rateio do preço.
-- Hoje ele não tem grupo — as 10 linhas de "INVESTIMENTOS (Máquinas, Equipamentos, Expansão e
-- Melhorias)", R$ 47.023,17, estão em `LUCRO`, que a Análise Financeira DESCARTA da
-- demonstração (`DFC_GROUPS_QUE_SOMAM` exclui `LUCRO` de propósito).
--
-- Esta migração NÃO as move. Ela só abre a porta para o grupo existir.
--
-- ── 2. `juros_value` E `principal_value` ───────────────────────────────────────────────────
-- A parcela de um compromisso tem duas naturezas: os juros são despesa de verdade
-- (`DESPESA_FINANCEIRA`) e o principal é amortização, que entra no preço.
--
-- >>> NULLABLE E SEM DEFAULT, E A RAZÃO NÃO É DE ESTILO <<<
-- Formulação do dono do produto: *"Parcela sem juros informado NÃO é parcela com juros zero."*
-- `NULL` = não separado; `0` = o usuário afirmou que a parcela não tem juros. Um
-- `DEFAULT 0` afirmaria a segunda coisa em todo lançamento antigo e apagaria a distinção para
-- sempre (`ausente-vs-falso.md`, o corolário no schema).
--
-- ── ORDEM E VERIFICAÇÃO ─────────────────────────────────────────────────────────────────────
-- `migration-delivery.md`: merge NÃO é entrega. O default é PENDENTE até alguém consultar o
-- schema. Aplicar ANTES do merge — o código novo GRAVA `expense_group = 'INVESTIMENTO'` e as
-- duas colunas; mergear sem aplicar deixa o lançamento falhando no INSERT.
--
-- ANTES (medido em 21/09/2026):
--   select count(*) from cash_entries where expense_group = 'INVESTIMENTO';           -- 0
--   select count(*) from information_schema.columns
--     where table_name='cash_entries' and column_name in ('juros_value','principal_value');
--   -- 0
--
-- DEPOIS:
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'cash_entries_expense_group_check';   -- deve conter 'INVESTIMENTO'
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='cash_entries'
--      and column_name in ('juros_value','principal_value');
--   -- 2 linhas, numeric, YES, NULL
--
-- E o `NOTIFY` é passo SEPARADO — ele não vem com o COMMIT.
-- ============================================================================================

BEGIN;

-- ── 1. `INVESTIMENTO` no CHECK de `expense_group` ──────────────────────────────────────────
-- A CHECK é recriada com a lista ANTERIOR INTEIRA mais o grupo novo. A lista de 19 grupos foi
-- lida de `pg_constraint` em 21/09/2026, não de memória — `estado-relatado-vs-real.md`.
ALTER TABLE public.cash_entries
  DROP CONSTRAINT IF EXISTS cash_entries_expense_group_check;

ALTER TABLE public.cash_entries
  ADD CONSTRAINT cash_entries_expense_group_check CHECK (
    expense_group = ANY (ARRAY[
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
      'INVESTIMENTO'::text,
      'OUTROS'::text
    ])
  );

-- ── 2. Juros e principal da parcela ────────────────────────────────────────────────────────
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS juros_value numeric,
  ADD COLUMN IF NOT EXISTS principal_value numeric;

COMMENT ON COLUMN public.cash_entries.juros_value IS
  'Parcela de JUROS do compromisso financeiro, em R$. Vai para DESPESA_FINANCEIRA. NULL = não separado, que NÃO é zero.';

COMMENT ON COLUMN public.cash_entries.principal_value IS
  'Parcela de PRINCIPAL (amortização) do compromisso financeiro, em R$. Entra no rateio da despesa fixa. NULL = não separado.';

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
