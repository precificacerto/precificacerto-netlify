-- Migration: código de base por tributo por fora e coeficiente da operação por fora, em `products`
--
-- FONTE: relatório "Motor RRO — Lucro Real", seção 7.2 (DDL aditivo necessário), e
-- `.claude/rules/cascata-lucro-real.md` R3 (códigos de base) e Parte 4.
--
-- >>> ORDEM DE APLICAÇÃO: ANTES OU JUNTO DO MERGE <<<
-- São COLUNAS que o código novo GRAVA (`.claude/rules/migration-delivery.md`). Mergear sem
-- aplicar deixa o save do produto gravando em coluna inexistente — foi exatamente assim que
-- `expense_snapshot` derrubou a produção em 01/09/2026.
--
-- >>> TODAS NULÁVEIS E SEM DEFAULT, DE PROPÓSITO <<<
-- `.claude/rules/ausente-vs-falso.md`: `NULL` significa NÃO CLASSIFICADO — o produto nunca
-- teve código de base escolhido e segue no PADRÃO da R3 (IPI e IS no 1, IBS e CBS no 4). Um
-- `NOT NULL DEFAULT 1` apagaria para sempre a diferença entre "o usuário escolheu o código 1"
-- e "ninguém escolheu nada", e é o preço que o `rt_pct` do D8 pagou.
--
-- A CHECK aceita 1 a 5, a faixa inteira da R3, ainda que a tela ofereça menos: a tela
-- restringe, o banco tolera — a mesma decisão registrada para o fator de redução do IVA DUAL.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ibs_base_code smallint,
  ADD COLUMN IF NOT EXISTS cbs_base_code smallint,
  ADD COLUMN IF NOT EXISTS is_base_code  smallint,
  ADD COLUMN IF NOT EXISTS ipi_base_code smallint,
  ADD COLUMN IF NOT EXISTS icms_base_code smallint,
  ADD COLUMN IF NOT EXISTS external_ops_coefficient numeric(12, 8);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_base_codes_range_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_base_codes_range_check CHECK (
        (ibs_base_code  IS NULL OR ibs_base_code  BETWEEN 1 AND 5) AND
        (cbs_base_code  IS NULL OR cbs_base_code  BETWEEN 1 AND 5) AND
        -- IS e IPI aceitam apenas 1, 2 ou 3: os códigos 4 e 5 SOMAM o IS e o IPI, e deixá-los
        -- apontar para lá criaria a recursão que a R3 diz não existir.
        (is_base_code   IS NULL OR is_base_code   BETWEEN 1 AND 3) AND
        (ipi_base_code  IS NULL OR ipi_base_code  BETWEEN 1 AND 3) AND
        (icms_base_code IS NULL OR icms_base_code BETWEEN 1 AND 5)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_external_ops_coefficient_range_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_external_ops_coefficient_range_check CHECK (
        external_ops_coefficient IS NULL
        OR (external_ops_coefficient >= 0 AND external_ops_coefficient < 1)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.products.ibs_base_code IS
  'R3 — código de base do IBS (1 a 5). NULL = não classificado; o motor usa o padrão 4. Override manual do que o contexto da venda derivaria.';
COMMENT ON COLUMN public.products.cbs_base_code IS
  'R3 — código de base da CBS (1 a 5). NULL = não classificado; o motor usa o padrão 4.';
COMMENT ON COLUMN public.products.is_base_code IS
  'R3 — código de base do IS (1 a 3). NULL = não classificado; o motor usa o padrão 1. Os códigos 4 e 5 somam o IS e criariam recursão.';
COMMENT ON COLUMN public.products.ipi_base_code IS
  'R3 — código de base do IPI (1 a 3). NULL = não classificado; o motor usa o padrão 1.';
COMMENT ON COLUMN public.products.icms_base_code IS
  'RESERVADO. A seção 7.2 do relatório pede a coluna, mas a regra versionada NÃO define a semântica de um código de base para o ICMS — o que a R9 especifica é se o IPI integra ou não a base dele, e isso é derivado do contexto da venda, não de um código. Nasce NULL e NENHUM código a lê. Escolher um significado aqui seria inventar formato, que é o que a Parte 0 proíbe.';
COMMENT ON COLUMN public.products.external_ops_coefficient IS
  'R3 — o `c` que ESTA construção usou, congelado junto com o preço. FATO HISTÓRICO, não referência viva (.claude/rules/fato-vs-referencia.md): decompor um preço antigo com o `c` de hoje reescreve o passado. NULL = preço formado antes desta coluna existir.';

-- VERIFICAÇÃO (rodar DEPOIS de aplicar; zero linhas = não aplicada):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'products'
--      and column_name in ('ibs_base_code','cbs_base_code','is_base_code','ipi_base_code',
--                          'icms_base_code','external_ops_coefficient');
--   select conname from pg_constraint where conname like 'products_base_codes%';
--   NOTIFY pgrst, 'reload schema';
