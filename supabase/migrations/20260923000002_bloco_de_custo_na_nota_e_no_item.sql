-- 20260923000002_bloco_de_custo_na_nota_e_no_item.sql
-- Comando do PO de 23/09/2026, §7 — o bloco "não gera crédito, compõe o custo".
--
-- ORDEM DE APLICAÇÃO: cria COLUNAS que o código novo GRAVA.
-- >>> APLICAR ANTES OU JUNTO DO MERGE. <<<
-- Mergear antes de aplicar deixa o lançamento de despesa gravando em coluna inexistente, e
-- o usuário vê "Could not find the 'valor_ipi_custo' column of 'purchase_invoices' in the
-- schema cache" — o erro que derrubou produção em 01/09/2026 (`migration-delivery.md`).
--
-- ADITIVA: nenhum DROP, nenhum UPDATE, nenhum backfill.
--
-- >>> TODAS NULÁVEIS E SEM DEFAULT <<<
-- `DEFAULT 0` afirmaria que toda nota e todo item já cadastrado FOI APURADO e deu zero. São
-- 327 notas e 72 itens que nunca tiveram esses campos, e o zero apagaria para sempre a
-- diferença entre "não há FCP nesta nota" e "ninguém olhou" (`ausente-vs-falso.md`).
--
-- MEDIÇÃO — ANTES (executada em 23/09/2026, contra o banco de produção):
--   select count(*) from information_schema.columns where table_schema='public'
--     and table_name='purchase_invoices'
--     and column_name in ('valor_ipi_custo','valor_icms_st','valor_difal','valor_fcp');  -- 0
--   select count(*) from information_schema.columns where table_schema='public'
--     and table_name='items' and column_name='fcp_value';                                -- 0
--   select count(*) from public.purchase_invoices;                                       -- 327
--   select count(*) from public.items;                                                   --  72
--
-- DEPOIS, esperado: 4 e 1 nas duas primeiras; 327 e 72 INALTERADOS nas duas últimas.
--
--   NOTIFY pgrst, 'reload schema';   -- passo SEPARADO: ele NÃO vem com o COMMIT

BEGIN;

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS valor_ipi_custo numeric,
  ADD COLUMN IF NOT EXISTS valor_icms_st   numeric,
  ADD COLUMN IF NOT EXISTS valor_difal     numeric,
  ADD COLUMN IF NOT EXISTS valor_fcp       numeric;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS fcp_value numeric;

COMMENT ON COLUMN public.purchase_invoices.valor_ipi_custo IS
  'Parcela do IPI da nota que NÃO gera crédito (revenda, uso e consumo). A parcela creditável fica em credit_ipi. A mesma nota pode ter as duas.';

COMMENT ON COLUMN public.purchase_invoices.valor_icms_st IS
  'ICMS-ST da nota (vICMSST), em R$. Sempre custo: a substituição encerra a cadeia e o adquirente não credita.';

COMMENT ON COLUMN public.purchase_invoices.valor_difal IS
  'DIFAL da nota, em R$, como apurado no documento. Informado (inclusive zero) vence a fórmula de base dupla.';

COMMENT ON COLUMN public.purchase_invoices.valor_fcp IS
  'FCP da nota (vFCPUFDest), em R$. Sempre custo. NULL = não informado; 0 = informado e não houve.';

COMMENT ON COLUMN public.items.fcp_value IS
  'FCP do item, em R$. Sempre custo. NULL = não informado; 0 = informado e não houve.';

COMMIT;
