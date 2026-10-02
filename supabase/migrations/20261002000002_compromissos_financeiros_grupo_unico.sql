-- ============================================================================================
-- COMPROMISSOS FINANCEIROS — UM GRUPO, COM AS CINCO DENTRO
--
-- Decisão do dono do produto, 02/10/2026, registrada como está:
--
--   > Compromissos Financeiros é uma categoria só. As cinco são subcategorias dela. Nenhuma é
--   > despesa fixa. Amortização não é despesa fixa.
--   >
--   > Depois da rodada tem que existir um grupo, com as cinco dentro. Nada de somar dois.
--
-- ── O QUE ESTA MIGRAÇÃO FAZ, E É A ÚNICA DESTA CAMPANHA QUE MEXE EM DADO ───────────────────
-- Ela alinha o `expense_group` dos lançamentos JÁ GRAVADOS das cinco categorias (mais os dois
-- rótulos legados) para `COMPROMISSOS_FINANCEIROS`. Nenhuma coluna é criada, nenhum valor
-- monetário é tocado, nenhuma categoria é renomeada.
--
-- ── POR QUE RECLASSIFICAR DADO É LEGÍTIMO AQUI ────────────────────────────────────────────
-- A migração `20260922000001` registrou o contrário: *"NENHUM lançamento é reclassificado. A
-- reclassificação é escolha do usuário, lançamento a lançamento — `fato-vs-referencia.md`: o
-- grupo gravado é fato histórico daquele lançamento."*
--
-- Aquilo estava certo sob a regra da época (`decisao-sob-regra-da-epoca.md`): em 21/09/2026 não
-- existia grupo próprio para onde mover, e mover para `DESPESA_FIXA` ou para `AMORTIZACAO` era
-- escolher entre duas naturezas erradas.
--
-- O que torna este UPDATE outra coisa: **o usuário escolhe a CATEGORIA, e o grupo é DERIVADO
-- dela** — por `getGroupForCategoryByRegime` e `getDefaultGroupForCategory`. Corrigir uma
-- derivação não reescreve a escolha de ninguém. O `fato-vs-referencia.md` protege o que foi
-- decidido; aqui o que foi decidido ("Empréstimos") não muda, e `DESPESA_FIXA` era a derivação
-- da regra antiga.
--
-- ── O `WHERE` É PELA CATEGORIA, E RESTRINGE O GRUPO DE ORIGEM ──────────────────────────────
-- Pela CATEGORIA porque é ela que decide a natureza. E com o grupo de origem restrito aos dois
-- antigos, para que a migração seja IDEMPOTENTE e não alcance um lançamento que alguém tenha
-- posto noutro grupo de propósito — `CUSTO_PRODUTOS`, por exemplo, num erro de digitação que
-- vale corrigir à mão e não em massa.
--
-- ── ESTADO MEDIDO EM 02/10/2026, ANTES DE QUALQUER MUDANÇA ─────────────────────────────────
--   categoria                                 lançamentos          valor   tenants
--   Empréstimos                                        26  R$ 195.207,79         1
--   Aplicações / Consórcios      (legado)              15  R$  70.935,77         2
--   Empréstimos / Financiamentos (legado)               4  R$  14.150,00         1
--   ──────────────────────────────────────────────────────────────────────────────
--   TOTAL                                              45  R$ 280.293,56
--
--   Todos gravados como `DESPESA_FIXA`. `AMORTIZACAO` tem ZERO lançamentos.
--
-- Logo: esta migração deve afetar **45 linhas**. Um número diferente significa que o banco
-- mudou desde a medição, e aí a consulta de ANTES abaixo precisa ser refeita antes de aplicar.
--
-- ── ORDEM — `migration-delivery.md` ───────────────────────────────────────────────────────
-- >>> APLICAR DEPOIS DO MERGE, E DEPOIS DA `20261002000001` <<<
--
-- Esta é a ordem INVERSA da coluna, e a razão é a direção da dependência: o código novo LÊ os
-- dois estados (o `if` por categoria em `classificarLancamentoDeDespesa` cobre tanto
-- `DESPESA_FIXA` quanto `COMPROMISSOS_FINANCEIROS`), então aplicar antes do merge deixaria o
-- código ANTIGO vendo um grupo que ele não conhece — e o `default` do switch da Análise
-- Financeira engole grupo desconhecido em silêncio.
--
-- Depois do merge, qualquer ordem é segura; antes, não.
--
-- A `20261002000001` (que cria `financial_commitments_percent` e alarga a CHECK) é
-- PRÉ-REQUISITO: sem a CHECK alargada este UPDATE é RECUSADO pela constraint.
--
-- ANTES (a consultar, não presumir):
--   select expense_group, expense_category, count(*), sum(amount)
--     from cash_entries
--    where expense_category in (
--            'Amortização de Dívida (principal)', 'Financiamentos', 'Empréstimos',
--            'Consórcios', 'Aplicações',
--            'Empréstimos / Financiamentos', 'Aplicações / Consórcios')
--    group by 1, 2 order by 1, 2;
--   -- esperado: 45 linhas em DESPESA_FIXA, nenhuma em COMPROMISSOS_FINANCEIROS
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'cash_entries_expense_group_check';
--   -- DEVE conter 'COMPROMISSOS_FINANCEIROS' — se não, aplique a 20261002000001 primeiro
--
-- DEPOIS:
--   select expense_group, count(*), sum(amount)
--     from cash_entries
--    where expense_category in ( … as sete acima … )
--    group by 1;
--   -- esperado: uma linha só, COMPROMISSOS_FINANCEIROS, 45, R$ 280.293,56
--
--   select count(*) from cash_entries
--    where expense_group in ('DESPESA_FIXA', 'AMORTIZACAO')
--      and expense_category in ( … as sete acima … );
--   -- esperado: 0
--
-- ROLLBACK, se precisar: o inverso é ambíguo de propósito e NÃO está escrito como comando.
-- Reverter exigiria saber qual das sete categorias voltava para `DESPESA_FIXA` e qual para
-- `AMORTIZACAO` — a informação está na lista abaixo (só a amortização ia para `AMORTIZACAO`),
-- e quem reverter escreve o UPDATE com ela à vista, em vez de rodar um comando que parece
-- simétrico e não é.
--
-- E o `NOTIFY` é passo SEPARADO — ele não vem com o COMMIT.
-- ============================================================================================

BEGIN;

update public.cash_entries
   set expense_group = 'COMPROMISSOS_FINANCEIROS'
 where expense_group in ('DESPESA_FIXA', 'AMORTIZACAO')
   and expense_category in (
         'Amortização de Dívida (principal)',
         'Financiamentos',
         'Empréstimos',
         'Consórcios',
         'Aplicações',
         -- Os dois rótulos LEGADOS. Deixá-los fora faria esses 19 lançamentos manterem
         -- `DESPESA_FIXA` na coluna, e qualquer consulta que não passe pela leitura por
         -- categoria continuaria vendo compromisso como despesa fixa — que é a razão de esta
         -- migração existir.
         'Empréstimos / Financiamentos',
         'Aplicações / Consórcios'
       );

COMMIT;

-- Passo SEPARADO — não vem com o COMMIT:
-- NOTIFY pgrst, 'reload schema';
