-- BUG-FLUXO-CAIXA-RT-CATEGORIA-AUSENTE-001 (Relatório 15/07/2026, Seção 7)
--
-- A categoria de despesa "RT — Comissão Reserva Técnica" já é oferecida no
-- dropdown de "Novo Lançamento de Despesa" (dentro da seção "Comissões"), porém
-- seu expense_group interno é 'RESERVA_TECNICA', que NÃO constava na constraint
-- cash_entries_expense_group_check. Isso fazia o INSERT do pagamento manual de
-- RT ao vendedor falhar no banco.
--
-- Esta migração adiciona 'RESERVA_TECNICA' à lista permitida. Também inclui
-- 'DEDUCAO_RECEITA', usado nas constantes de categorias e que também estava
-- ausente, evitando o mesmo tipo de bloqueio.

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
    'LUCRO'::text
  ]));
