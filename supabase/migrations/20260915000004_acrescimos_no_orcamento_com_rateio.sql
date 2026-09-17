-- Migration: frete, seguro e despesas acessórias NO DOCUMENTO, com rateio por item
--
-- FONTE: relatório "Motor RRO — Lucro Real", seção 7.2 (DDL aditivo necessário) e 5.3;
-- `.claude/rules/cascata-lucro-real.md` R10 · R11 · R12 · R13.
--
-- >>> ORDEM DE APLICAÇÃO: ANTES OU JUNTO DO MERGE <<<
-- São COLUNAS que o código novo GRAVA. Mergear sem aplicar deixa o save do orçamento
-- gravando em coluna inexistente — o caso do `expense_snapshot`, que derrubou a produção em
-- 01/09/2026 (`.claude/rules/migration-delivery.md`).
--
-- >>> R11: SEM MIGRAÇÃO RETROATIVA <<<
-- "Um frete atende vários produtos." `products.freight_value`, `insurance_value` e
-- `accessory_expenses_value` deixam de ser alimentados DAQUI PARA A FRENTE; os produtos que
-- já têm valor ali PERMANECEM COMO ESTÃO. Nenhum UPDATE nesta migração toca neles, e o
-- código resolve a precedência: orçamento com acréscimo cotado manda; sem ele, cai no
-- cadastro do produto, exatamente como hoje.
--
-- >>> NULÁVEIS E SEM DEFAULT <<<
-- `.claude/rules/ausente-vs-falso.md`. `NULL` em `freight_value` é "não cotado"; `0` é
-- "cotado e não houve frete". `NOT NULL DEFAULT 0` apagaria a diferença para sempre, e é
-- justamente ela que decide se o rateio roda ou se o cadastro do produto prevalece.
--
-- >>> O QUE ESTA MIGRAÇÃO NÃO FAZ, e está registrado por isso <<<
-- A seção 7.2 lista `budgets`, `budget_items` e `order_items`. Ela NÃO lista `orders`,
-- `sales` nem `sale_items`. Seguir a fonte é o certo, mas a consequência precisa estar
-- escrita: na travessia orçamento → pedido → venda, o documento de VENDA fica sem onde
-- guardar o valor cotado e sem a parcela rateada por item. É a forma da `copia-divergente`
-- — o campo existe num lado da travessia e não no outro. Quem decidir estender o DDL decide
-- também se a venda congela o rateio do orçamento ou o recalcula.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS freight_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS insurance_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS accessory_expenses_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS freight_allocation_criteria text;

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS freight_allocated_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS accessories_allocated_value numeric(14, 2);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS freight_allocated_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS accessories_allocated_value numeric(14, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budgets_freight_allocation_criteria_check'
  ) THEN
    -- Os quatro critérios da R12. A CHECK é enumerada aqui, e não em faixa, porque um
    -- critério desconhecido não tem como ser rateado: ele não é um valor fora de intervalo,
    -- é uma mecânica que não existe.
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_freight_allocation_criteria_check CHECK (
        freight_allocation_criteria IS NULL
        OR freight_allocation_criteria IN ('VALOR', 'PESO', 'VOLUME', 'MANUAL')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budgets_accessory_values_non_negative_check'
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_accessory_values_non_negative_check CHECK (
        (freight_value IS NULL OR freight_value >= 0) AND
        (insurance_value IS NULL OR insurance_value >= 0) AND
        (accessory_expenses_value IS NULL OR accessory_expenses_value >= 0)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.budgets.freight_value IS
  'R11 — frete COTADO no documento, não no cadastro do produto. NULL = não cotado (o cadastro do produto prevalece); 0 = cotado e sem frete.';
COMMENT ON COLUMN public.budgets.insurance_value IS
  'R11 — seguro cotado no documento. NULL = não cotado.';
COMMENT ON COLUMN public.budgets.accessory_expenses_value IS
  'R11 — demais despesas acessórias cotadas no documento. NULL = não cotado.';
COMMENT ON COLUMN public.budgets.freight_allocation_criteria IS
  'R12 — critério de rateio: VALOR (padrão), PESO, VOLUME ou MANUAL. NULL = não escolhido; o código usa VALOR.';
COMMENT ON COLUMN public.budget_items.freight_allocated_value IS
  'R12 — parcela do frete que coube a ESTE item, congelada em R$ (R18: não encolhe com desconto). A base do rateio é o montante a carregar, fixada ANTES do gross-up.';
COMMENT ON COLUMN public.budget_items.accessories_allocated_value IS
  'R12 — parcela de seguro + demais acessórias que coube a ESTE item, congelada em R$.';
COMMENT ON COLUMN public.order_items.freight_allocated_value IS
  'R12 — parcela do frete deste item, herdada do orçamento na travessia.';
COMMENT ON COLUMN public.order_items.accessories_allocated_value IS
  'R12 — parcela de seguro + demais acessórias deste item, herdada do orçamento.';

-- VERIFICAÇÃO (rodar DEPOIS de aplicar; zero linhas = não aplicada):
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and (
--        (table_name = 'budgets' and column_name in
--           ('freight_value','insurance_value','accessory_expenses_value','freight_allocation_criteria'))
--        or (table_name in ('budget_items','order_items') and column_name in
--           ('freight_allocated_value','accessories_allocated_value'))
--      )
--    order by table_name, column_name;
--   select conname from pg_constraint where conname like 'budgets_freight%' or conname like 'budgets_accessory%';
--   NOTIFY pgrst, 'reload schema';
