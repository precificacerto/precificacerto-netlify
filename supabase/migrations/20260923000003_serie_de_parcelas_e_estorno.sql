-- 20260923000003_serie_de_parcelas_e_estorno.sql
-- Comando do PO de 23/09/2026, §7 — a série de parcelas e o estorno.
--
-- ORDEM DE APLICAÇÃO: cria COLUNAS que o código novo GRAVA e LÊ.
-- >>> APLICAR ANTES OU JUNTO DO MERGE. <<<
-- `migration-delivery.md`: migração mergeada NÃO está aplicada, e o default é PENDENTE até
-- alguém consultar o schema e ver a coluna lá.
--
-- ADITIVA. E **SEM BACKFILL, DE PROPÓSITO**.
--
-- >>> POR QUE A SÉRIE ANTIGA FICA SEM GRUPO <<<
-- A coluna existe justamente porque agrupar por descrição ("2/6") + categoria + data NÃO é
-- confiável. Preenchê-la retroativamente por esse critério acertaria nove em dez séries e,
-- na décima, marcaria como irmãs parcelas de compras diferentes — e aí a exclusão de série
-- apagaria a parcela de outra nota. O lançamento antigo é tratado como SOZINHO, e a tela
-- diz isso ao usuário antes de confirmar.
--
-- >>> `reversed_at` E `paid_date` COEXISTEM, E ISSO É A REGRA <<<
-- Estorno não apaga o pagamento: o pagamento OCORREU. `paid_date` permanece no original e
-- `reversed_at` registra que ele foi desfeito, com o espelho carregando o efeito no mês do
-- evento. Limpar `paid_date` seria o "Cancelar Pagamento", que é outra ação e já existe.
--
-- MEDIÇÃO — ANTES (executada em 23/09/2026, contra o banco de produção):
--   select count(*) from information_schema.columns where table_schema='public'
--     and table_name='cash_entries'
--     and column_name in ('installment_group_id','reversal_of_entry_id','reversal_entry_id','reversed_at');  -- 0
--   select count(*) from public.cash_entries;                                                                -- 1642
--
-- DEPOIS, esperado: 4 na primeira; 1642 INALTERADO na segunda; e
--   select count(*) from public.cash_entries where installment_group_id is not null;       -- 0
-- porque nenhum lançamento anterior recebe grupo.
--
--   NOTIFY pgrst, 'reload schema';   -- passo SEPARADO: ele NÃO vem com o COMMIT

BEGIN;

ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS installment_group_id  uuid,
  ADD COLUMN IF NOT EXISTS reversal_of_entry_id  uuid REFERENCES public.cash_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_entry_id     uuid REFERENCES public.cash_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at           date;

-- O índice é por `(tenant_id, installment_group_id)` porque toda leitura de série já filtra
-- o tenant: um índice só no grupo obrigaria o Postgres a ler linhas de outros tenants antes
-- de descartá-las.
CREATE INDEX IF NOT EXISTS cash_entries_installment_group_idx
  ON public.cash_entries (tenant_id, installment_group_id);

-- >>> ACRÉSCIMO AO TEXTO DO §7, E ELE ESTÁ DECLARADO NO CORPO DO PR <<<
--
-- O §6.4 manda DESATIVAR A NOTA quando a série inteira sai e nada mais ativo aponta para
-- ela. `purchase_invoices` NÃO TEM coluna de desativação — medido em 23/09/2026:
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='purchase_invoices'
--      and column_name in ('is_active','reversed_at');   -- 0 linhas
--
-- Sem ela, "a nota também é desativada" não tem onde ser escrito. As saídas eram: deduzir o
-- estado por "nota sem nenhuma entrada ativa" a cada leitura — dedução no lugar de fato, que
-- é o que `ausente-vs-falso.md` desaconselha — ou apagar a nota, que leva o documento junto.
--
-- `deactivated_at` é nulável e sem default: NULL é "ativa", e a data diz QUANDO saiu.
-- Um `is_active boolean DEFAULT true` afirmaria que as 327 notas existentes foram avaliadas.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS deactivated_at date,
  ADD COLUMN IF NOT EXISTS reversed_at    date;

COMMENT ON COLUMN public.cash_entries.installment_group_id IS
  'Agrupa as parcelas de UM lançamento. Gerado uma vez por lançamento e gravado em todas as parcelas. NULL = lançamento anterior a 23/09/2026, tratado como sozinho na exclusão.';

COMMENT ON COLUMN public.cash_entries.reversal_of_entry_id IS
  'No lançamento ESPELHO: o lançamento original que ele estorna.';

COMMENT ON COLUMN public.cash_entries.reversal_entry_id IS
  'No lançamento ORIGINAL: o espelho que o estornou.';

COMMENT ON COLUMN public.cash_entries.reversed_at IS
  'Data do estorno. NÃO limpa paid_date: o pagamento ocorreu, e o estorno é outro fato, em outro mês.';

COMMENT ON COLUMN public.purchase_invoices.deactivated_at IS
  'Data em que a nota saiu, junto com a série inteira de parcelas. NULL = ativa. Não é estorno: aqui nada foi pago nem apurado.';

COMMENT ON COLUMN public.purchase_invoices.reversed_at IS
  'Data do estorno da nota. O crédito dela sai da apuração DO MÊS DO ESTORNO; a apuração do mês original não muda (LC 87/1996 art. 21).';

COMMIT;
