-- Sprint 1 — Catálogo de despesas
-- Renomeia "Pedágios" → "Pedágios e Estacionamentos" em todos os lançamentos.
-- Não introduz novas categorias no DB (são strings livres em expense_category),
-- mas adiciona registros DAS na lista existente quando aplicável.
--
-- NOTA: a tabela fixed_expenses usa category_id (FK → cashier_categories), não
-- expense_category direta. Como Pedágios não está cadastrado em cashier_categories
-- (categoria custom no SaaS), nenhum UPDATE é necessário em fixed_expenses.

-- ── Passo 1: cash_entries (única tabela com expense_category texto livre) ──
UPDATE public.cash_entries
SET expense_category = 'Pedágios e Estacionamentos'
WHERE expense_category IN ('Pedágios', 'Pedagios', 'Pedágio', 'Pedagio');

-- ── ROLLBACK (descomente para reverter) ──
-- UPDATE public.cash_entries
-- SET expense_category = 'Pedágios'
-- WHERE expense_category = 'Pedágios e Estacionamentos';
