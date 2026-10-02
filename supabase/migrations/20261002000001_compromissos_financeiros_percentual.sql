-- ============================================================================================
-- COMPROMISSOS FINANCEIROS — CATEGORIA INDEPENDENTE, MESMO PERCENTUAL
--
-- Comando do PO de 02/10/2026. Migração ADITIVA: nenhuma coluna existente é alterada, nenhum
-- lançamento é reclassificado, nenhum dado é movido.
--
-- ── §0 — A TRAVA: NENHUM PREÇO MUDA ────────────────────────────────────────────────────────
-- O compromisso JÁ ESTÁ dentro do preço hoje, dentro da despesa fixa. Ele sai de lá e vira
-- categoria própria COM O MESMO PERCENTUAL, NO MESMO DIVISOR. A soma do divisor não muda, então
-- o preço não muda. Esta migração só dá ao percentual um lugar para morar separado.
--
-- ── 1. `tenant_expense_config.financial_commitments_percent` ──────────────────────────────────
-- O percentual que SAIU de `fixed_expense_percent`. Gravado em FORMATO PERCENTUAL (0..100),
-- como as outras colunas `*_percent` desta tabela — ver `recalc-expense-config.ts`, que
-- converte com `round2(x * 100)`.
--
-- >>> NULLABLE E SEM DEFAULT, E A RAZÃO NÃO É DE ESTILO — §7 do comando <<<
--
-- `ausente-vs-falso.md`: `NOT NULL DEFAULT 0` numa coluna que pode legitimamente valer zero
-- apaga a distinção PARA SEMPRE. E aqui as duas leituras levam a contas diferentes:
--
--   NULL = o tenant ainda NÃO foi recalculado sob a separação. `fixed_expense_percent` AINDA
--          CARREGA o compromisso dentro dele, e o termo novo contribui ZERO para o divisor.
--          Somar um valor aqui DOBRARIA o compromisso no preço.
--
--   0    = o tenant foi recalculado e NÃO TEM compromisso lançado. `fixed_expense_percent` já
--          está sem ele (por não haver nada a tirar), e o termo contribui zero.
--
-- As duas contribuem zero HOJE, e é justamente por isso que confundi-las é fácil: a diferença
-- só aparece no dia em que alguém quiser saber se o tenant já foi classificado. Com `DEFAULT 0`
-- essa pergunta deixa de ter resposta.
--
-- ── 2. `COMPROMISSOS_FINANCEIROS` no CHECK de `cash_entries.expense_group` ───────────────────
-- >>> ESTE GRUPO NÃO É GRAVADO HOJE, E A CHECK O ACEITA ASSIM MESMO <<<
--
-- O grupo é DERIVADO: quem o produz é a leitura (`classificarLancamentoDeDespesa`), e o
-- `expense_group` das cinco categorias do bloco continua sendo `DESPESA_FIXA` ou `AMORTIZACAO`.
-- Nenhum INSERT grava este valor, então a CHECK não precisaria dele para a aplicação funcionar.
--
-- Ele entra por duas razões:
--
--   (a) O PORTÃO. `o-repasse-e-linha-propria-ao-lado-da-devolucao.test.ts` afirma que a CHECK
--       aceita TODA chave de `EXPENSE_GROUP_KEYS` — derivando da fonte única em vez de listar à
--       mão, para que a próxima chave esquecida fique vermelha. Abrir exceção para esta abriria
--       a porta para a próxima, que talvez seja gravada de verdade.
--
--   (b) Se um dia o grupo passar a ser gravado, o INSERT não falha por constraint.
--
-- A CHECK é recriada com a lista ANTERIOR INTEIRA mais o grupo novo — ela é ALARGAMENTO, nunca
-- substituição: uma CHECK que esquecesse um grupo já gravado recusaria dado existente. A lista
-- de 20 grupos veio da migração `20260922000001`, que é a última a redefinir a constraint.
--
-- ── ORDEM E VERIFICAÇÃO — `migration-delivery.md` ──────────────────────────────────────────
-- >>> APLICAR **ANTES OU JUNTO** DO MERGE <<<
--
-- O código novo GRAVA `financial_commitments_percent` (`mergeExpenseConfig`). Mergear sem aplicar
-- deixa o recálculo de percentuais do HUB falhando no UPDATE, com a mensagem do PostgREST —
-- exatamente o que derrubou produção em 01/09/2026 com `expense_snapshot`.
--
-- Merge NÃO é entrega. O default é PENDENTE até alguém consultar o schema.
--
-- ANTES (a consultar, não presumir):
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='tenant_expense_config'
--      and column_name='financial_commitments_percent';                       -- esperado: 0
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'cash_entries_expense_group_check';
--   -- NÃO deve conter 'COMPROMISSOS_FINANCEIROS'
--   select count(*) from cash_entries where expense_group = 'COMPROMISSOS_FINANCEIROS';  -- 0
--
-- DEPOIS:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and table_name='tenant_expense_config'
--      and column_name='financial_commitments_percent';
--   -- 1 linha, numeric, is_nullable = YES, column_default = NULL
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'cash_entries_expense_group_check';
--   -- deve conter 'COMPROMISSOS_FINANCEIROS'
--
-- E o `NOTIFY` é passo SEPARADO — ele NÃO vem com o COMMIT, e "esqueci o NOTIFY" é
-- indistinguível de "a coluna não existe" pela mensagem que o usuário vê.
--
-- >>> O `BEGIN`/`COMMIT` É DO ARQUIVO, E QUEM APLICA DECIDE SE TIRA <<<
-- O conector do Supabase abre transação própria e avisa `there is already a transaction in
-- progress`; o SQL Editor e o psql aceitam o arquivo como está. Escrever sem eles seria pior:
-- uma falha no meio não teria rollback.
--
-- Ao aplicar por fora do CLI, o `name` registrado é o nome COMPLETO deste arquivo, com o
-- prefixo e sem a extensão: `20261002000001_compromissos_financeiros_percentual`.
-- ============================================================================================

BEGIN;

-- ── 1. O percentual do Compromissos Financeiros ──────────────────────────────────────────────
ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS financial_commitments_percent numeric;

COMMENT ON COLUMN public.tenant_expense_config.financial_commitments_percent IS
  'Compromissos Financeiros como % do faturamento (0..100). Saiu de fixed_expense_percent: a soma dos dois é o fixed_expense_percent de antes de 02/10/2026, e por isso o preço não muda. NULL = tenant ainda não recalculado sob a separação (o compromisso segue DENTRO de fixed_expense_percent, e este termo contribui ZERO). 0 = recalculado e sem compromisso. NULL não é zero.';

-- ── 2. O grupo derivado no CHECK de `expense_group` ────────────────────────────────────────
ALTER TABLE public.cash_entries
  DROP CONSTRAINT IF EXISTS cash_entries_expense_group_check;

ALTER TABLE public.cash_entries
  ADD CONSTRAINT cash_entries_expense_group_check CHECK (
    expense_group = ANY (ARRAY[
      'MAO_DE_OBRA'::text,
      'MAO_DE_OBRA_PRODUTIVA'::text,
      'MAO_DE_OBRA_ADMINISTRATIVA'::text,
      'DESPESA_FIXA'::text,
      'COMPROMISSOS_FINANCEIROS'::text,
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

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
