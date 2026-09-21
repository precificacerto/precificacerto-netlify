-- 20260923000001_entrada_de_imposto_por_linha.sql
-- Comando do PO de 22/09/2026, §4 — a entrada de cada linha de imposto em % OU em R$.
--
-- ORDEM DE APLICAÇÃO: esta migração cria COLUNAS que o código novo GRAVA.
-- >>> APLICAR ANTES OU JUNTO DO MERGE. <<<
-- Mergear antes de aplicar deixa o lançamento de despesa gravando em coluna inexistente, e
-- o erro chega ao usuário como "Could not find the '...' column of 'purchase_invoices' in
-- the schema cache" — foi exatamente o que derrubou produção em 01/09/2026
-- (`migration-delivery.md`).
--
-- É ADITIVA: nenhum DROP, nenhum UPDATE, nenhum default. Toda nota já gravada continua
-- exatamente como está.
--
-- >>> POR QUE AS COLUNAS SÃO NULÁVEIS E SEM DEFAULT <<<
--
-- `rate_*` NULL é "alíquota não informada"; zero é "o tributo incidiu e deu nada". As duas
-- são afirmações diferentes sobre a nota, e um `NOT NULL DEFAULT 0` apagaria a distinção
-- para sempre, inclusive nas 254 notas do legado — que não têm alíquota nenhuma, só o
-- crédito em R$ que a migração `20260922000003` deduziu (`ausente-vs-falso.md`).
--
-- `input_mode_*` NULL é "formato não gravado", e a leitura o trata como % pelo padrão de
-- APRESENTAÇÃO, em `entrada-de-imposto.ts`. O default mora na leitura, não na coluna: no
-- banco ele afirmaria que alguém escolheu percentual para uma nota de 2026 que nasceu antes
-- do seletor existir.

BEGIN;

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS rate_icms        numeric,
  ADD COLUMN IF NOT EXISTS rate_pis_cofins  numeric,
  ADD COLUMN IF NOT EXISTS rate_ipi         numeric,
  ADD COLUMN IF NOT EXISTS rate_cbs         numeric,
  ADD COLUMN IF NOT EXISTS rate_ibs         numeric;

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS input_mode_icms        text,
  ADD COLUMN IF NOT EXISTS input_mode_pis_cofins  text,
  ADD COLUMN IF NOT EXISTS input_mode_ipi         text,
  ADD COLUMN IF NOT EXISTS input_mode_cbs         text,
  ADD COLUMN IF NOT EXISTS input_mode_ibs         text;

-- As CHECK aceitam NULL de propósito: a restrição é sobre o VALOR quando ele existe, e
-- proibir NULL aqui obrigaria a inventar um formato para toda nota anterior ao seletor.
DO $$
DECLARE
  coluna text;
BEGIN
  FOREACH coluna IN ARRAY ARRAY[
    'input_mode_icms', 'input_mode_pis_cofins', 'input_mode_ipi', 'input_mode_cbs', 'input_mode_ibs'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'purchase_invoices_' || coluna || '_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.purchase_invoices ADD CONSTRAINT %I CHECK (%I IS NULL OR %I IN (''PCT'', ''BRL''))',
        'purchase_invoices_' || coluna || '_check', coluna, coluna
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.purchase_invoices.rate_icms IS
  'Alíquota do ICMS como foi informada, em PERCENTUAL. NULL = não informada; 0 = incidiu e deu zero.';
COMMENT ON COLUMN public.purchase_invoices.input_mode_icms IS
  'Como a linha foi DIGITADA: PCT (alíquota) ou BRL (valor da nota, convertido na borda). NULL = nota anterior ao seletor.';

COMMIT;

-- Depois do COMMIT, e em passo SEPARADO — ele não vem junto:
--   NOTIFY pgrst, 'reload schema';
-- É o PostgREST que produz o erro de "coluna não encontrada", e o cache dele não se recarrega
-- com o commit.
