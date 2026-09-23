-- 20260924000001_descascamento_da_nota.sql
-- Comando do PO de 24/09/2026, §9 — a hierarquia fiscal completa do lançamento de despesa.
--
-- ORDEM DE APLICAÇÃO: cria COLUNAS que o código novo GRAVA e LÊ.
-- >>> APLICAR ANTES OU JUNTO DO MERGE. <<<
-- `migration-delivery.md`: migração mergeada NÃO está aplicada, e o default é PENDENTE até
-- alguém consultar o schema e ver a coluna lá. Mergear antes deixa o lançamento gravando em
-- coluna inexistente, e o usuário vê "Could not find the 'valor_is' column of
-- 'purchase_invoices' in the schema cache" — o erro de 01/09/2026.
--
-- ADITIVA: nenhum DROP, nenhum UPDATE, nenhum backfill.
--
-- >>> TODAS NULÁVEIS E SEM DEFAULT <<<
-- `ipi_por_dentro` é nulável DE PROPÓSITO: NULL é "não informado" e cai no padrão POR FORA;
-- `false` é o usuário dizendo que é por fora. `DEFAULT false` afirmaria que as 327 notas
-- existentes foram avaliadas e que alguém decidiu por elas (`ausente-vs-falso.md`).
--
-- MEDIÇÃO — ANTES (executada em 24/09/2026, contra o banco de produção):
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='purchase_invoices';   -- 39
--   select count(*) from public.purchase_invoices;                     -- 327
--
-- DEPOIS, esperado: 50 colunas; 327 notas INALTERADAS; e as 11 novas NULL em 100% das linhas.
--
--   NOTIFY pgrst, 'reload schema';   -- passo SEPARADO: ele NÃO vem com o COMMIT

BEGIN;

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS frete                    numeric,
  ADD COLUMN IF NOT EXISTS seguro                   numeric,
  ADD COLUMN IF NOT EXISTS valor_is                 numeric,
  ADD COLUMN IF NOT EXISTS parcela_st               numeric,
  ADD COLUMN IF NOT EXISTS parcela_monofasica       numeric,
  ADD COLUMN IF NOT EXISTS base_manual_icms         numeric,
  ADD COLUMN IF NOT EXISTS base_manual_pis_cofins   numeric,
  ADD COLUMN IF NOT EXISTS ipi_por_dentro           boolean,
  ADD COLUMN IF NOT EXISTS cst_icms                 text,
  ADD COLUMN IF NOT EXISTS cst_ipi                  text,
  ADD COLUMN IF NOT EXISTS cst_pis_cofins           text;

COMMENT ON COLUMN public.purchase_invoices.frete IS
  'Frete cobrado na nota. INTEGRA a base e gera crédito — não é dedução (LC 87/1996 art. 13 §1º II; RIPI art. 190 §1º; LC 214/2025 art. 12 §1º).';

COMMENT ON COLUMN public.purchase_invoices.seguro IS
  'Seguro cobrado na nota. INTEGRA a base e gera crédito — não é dedução. Mesma fundamentação do frete.';

COMMENT ON COLUMN public.purchase_invoices.valor_is IS
  'IS destacado. NÃO gera crédito e NÃO sai da base (EC 132/2023 art. 153 §6º V; LC 214/2025).';

COMMENT ON COLUMN public.purchase_invoices.parcela_st IS
  'Fatia do valor da mercadoria em substituição tributária. Sai da base do ICMS, nunca do total.';

COMMENT ON COLUMN public.purchase_invoices.parcela_monofasica IS
  'Fatia do valor da mercadoria em regime monofásico. Sai da base do PIS/COFINS, nunca do total.';

COMMENT ON COLUMN public.purchase_invoices.base_manual_icms IS
  'NULL = base nativa. Quando informada, é usada COMO ESTÁ — o ICMS e a fatia em ST não são deduzidos de novo.';

COMMENT ON COLUMN public.purchase_invoices.base_manual_pis_cofins IS
  'NULL = base nativa. Quando informada, é usada COMO ESTÁ — o ICMS não é deduzido de novo.';

COMMENT ON COLUMN public.purchase_invoices.ipi_por_dentro IS
  'O IPI creditável está por dentro do preço? NULL = não informado, cai no padrão POR FORA. false = o usuário disse que é por fora.';

COMMENT ON COLUMN public.purchase_invoices.cst_icms IS
  'CST de ICMS do documento. Quando veda, é o documento decidindo o crédito — não o usuário.';

COMMENT ON COLUMN public.purchase_invoices.cst_ipi IS
  'CST de IPI do documento. Quando veda, é o documento decidindo o crédito — não o usuário.';

COMMENT ON COLUMN public.purchase_invoices.cst_pis_cofins IS
  'CST de PIS/COFINS do documento. 02 a 09 vedam o crédito: monofásica, ST, alíquota zero, isenta, sem incidência e suspensão (STJ, Tema 1.093, para 02 e 03).';

COMMIT;
