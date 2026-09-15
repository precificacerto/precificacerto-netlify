-- Migration: a travessia dos acréscimos — `orders`, `sales` e `sale_items`
--
-- FONTE: `.claude/rules/cascata-lucro-real.md` R21 (a travessia), R11 · R12 · R18.
--
-- >>> POR QUE ESTA MIGRAÇÃO EXISTE <<<
-- A seção 7.2 do relatório listou `budgets`, `budget_items` e `order_items`, e a migração
-- `20260915000004` seguiu a lista. O que ficou registrado lá como consequência é o que esta
-- corrige: o documento de VENDA ficava sem onde guardar o valor cotado e sem a parcela por
-- item, e `orders` ficava com as parcelas nos itens e sem o cotado no cabeçalho.
--
-- É a forma da `copia-divergente.md` — o campo existe num lado da travessia e não no outro —
-- e o remédio registrado lá não é conferir os dois lados, é não deixar um sem o outro.
--
-- >>> ORDEM DE APLICAÇÃO: ANTES OU JUNTO DO MERGE <<<
-- São COLUNAS que o código novo GRAVA (`.claude/rules/migration-delivery.md`).
--
-- >>> TODAS NULÁVEIS E SEM DEFAULT <<<
-- `NULL` em `freight_value` é NÃO COTADO; `0` é "cotado e não houve frete". É a distinção que
-- decide se o rateio vale ou se o cadastro do produto prevalece (R11), então `NOT NULL
-- DEFAULT 0` não apagaria só uma informação: mudaria o comportamento de todo documento
-- existente (`.claude/rules/ausente-vs-falso.md`).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- `freight_allocation_base` — A COLUNA QUE NÃO ESTAVA NA LISTA, E POR QUE ELA ENTRA
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- Acréscimo à seção 7.2, assumido como tal.
--
-- A R21 congela a PARCELA POR ITEM enquanto o conjunto que a produziu não muda. Sem gravar o
-- MONTANTE A CARREGAR vigente no rateio, "o conjunto mudou" é INDETECTÁVEL: comparar a soma
-- das parcelas com o valor cotado pega item removido ou acrescentado, mas NÃO pega troca de
-- quantidade que preserve a soma — e nesse caso o share correto mudou e o congelado continua
-- fechando, em silêncio.
--
-- Um congelamento que não sabe dizer quando deixou de valer é `ausente-vs-falso` em outra
-- forma: ele afirma "esta parcela é a deste item" quando o certo seria não afirmar nada.
--
-- Custo: uma coluna numérica por documento. O que se compra é a diferença entre um número
-- herdado e um número herdado VERIFICÁVEL.
-- ═══════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS freight_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS insurance_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS accessory_expenses_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS freight_allocation_criteria text,
  ADD COLUMN IF NOT EXISTS freight_allocation_base numeric(14, 2);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS freight_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS insurance_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS accessory_expenses_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS freight_allocation_criteria text,
  ADD COLUMN IF NOT EXISTS freight_allocation_base numeric(14, 2);

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS freight_allocated_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS accessories_allocated_value numeric(14, 2);

-- `budgets` recebe só a base: os outros quatro campos vieram na `20260915000004`.
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS freight_allocation_base numeric(14, 2);

DO $$
DECLARE
  t text;
BEGIN
  -- Os quatro critérios da R12, iguais aos de `budgets`. Enumerada e não em faixa: um
  -- critério desconhecido não é valor fora de intervalo, é uma mecânica que não existe.
  FOREACH t IN ARRAY ARRAY['orders', 'sales'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_freight_allocation_criteria_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
           freight_allocation_criteria IS NULL
           OR freight_allocation_criteria IN (''VALOR'', ''PESO'', ''VOLUME'', ''MANUAL''))',
        t, t || '_freight_allocation_criteria_check'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_accessory_values_non_negative_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
           (freight_value IS NULL OR freight_value >= 0) AND
           (insurance_value IS NULL OR insurance_value >= 0) AND
           (accessory_expenses_value IS NULL OR accessory_expenses_value >= 0))',
        t, t || '_accessory_values_non_negative_check'
      );
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['budgets', 'orders', 'sales'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_freight_allocation_base_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
           freight_allocation_base IS NULL OR freight_allocation_base >= 0)',
        t, t || '_freight_allocation_base_check'
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.orders.freight_value IS
  'R11 — frete COTADO neste documento. NULL = não cotado; 0 = cotado e sem frete. Herdado do orçamento na travessia (R21).';
COMMENT ON COLUMN public.orders.insurance_value IS
  'R11 — seguro cotado neste documento. NULL = não cotado.';
COMMENT ON COLUMN public.orders.accessory_expenses_value IS
  'R11 — demais despesas acessórias cotadas neste documento. NULL = não cotado.';
COMMENT ON COLUMN public.orders.freight_allocation_criteria IS
  'R12 — critério de rateio herdado do orçamento. NULL = não escolhido; o código usa VALOR.';
COMMENT ON COLUMN public.orders.freight_allocation_base IS
  'R21 — o MONTANTE A CARREGAR vigente quando o rateio foi feito. Divergir do montante atual significa que o conjunto mudou e as parcelas herdadas deixaram de ser aplicáveis. NULL = rateio anterior a esta coluna, ou documento sem acréscimo cotado.';

COMMENT ON COLUMN public.sales.freight_value IS
  'R11 — frete COTADO neste documento. NULL = não cotado; 0 = cotado e sem frete. Herdado na travessia (R21).';
COMMENT ON COLUMN public.sales.insurance_value IS
  'R11 — seguro cotado neste documento. NULL = não cotado.';
COMMENT ON COLUMN public.sales.accessory_expenses_value IS
  'R11 — demais despesas acessórias cotadas neste documento. NULL = não cotado.';
COMMENT ON COLUMN public.sales.freight_allocation_criteria IS
  'R12 — critério de rateio herdado. NULL = não escolhido; o código usa VALOR.';
COMMENT ON COLUMN public.sales.freight_allocation_base IS
  'R21 — o MONTANTE A CARREGAR vigente quando o rateio foi feito. Ver `orders.freight_allocation_base`.';

COMMENT ON COLUMN public.sale_items.freight_allocated_value IS
  'R12/R18 — parcela do frete deste item, CONGELADA em R$ e herdada do documento de origem. Não encolhe com desconto.';
COMMENT ON COLUMN public.sale_items.accessories_allocated_value IS
  'R12/R18 — parcela de seguro + demais acessórias deste item, congelada em R$ e herdada.';

COMMENT ON COLUMN public.budgets.freight_allocation_base IS
  'R21 — o MONTANTE A CARREGAR vigente quando o rateio foi feito. É o que torna DETECTÁVEL que o conjunto mudou; sem ele, uma troca de quantidade que preserve a soma passa despercebida.';

-- VERIFICAÇÃO (rodar DEPOIS de aplicar; zero linhas = não aplicada):
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and (
--        (table_name in ('orders','sales') and column_name in
--           ('freight_value','insurance_value','accessory_expenses_value',
--            'freight_allocation_criteria','freight_allocation_base'))
--        or (table_name = 'sale_items' and column_name in
--           ('freight_allocated_value','accessories_allocated_value'))
--        or (table_name = 'budgets' and column_name = 'freight_allocation_base')
--      )
--    order by table_name, column_name;
--   -- esperado: 13 linhas, todas is_nullable = YES e column_default nulo
--
--   select conname from pg_constraint
--    where conname like '%_freight_allocation_criteria_check'
--       or conname like '%_accessory_values_non_negative_check'
--       or conname like '%_freight_allocation_base_check'
--    order by conname;
--   -- esperado: 7 (4 novas de orders/sales, 3 de base, mais as 2 de budgets da 0004)
--
--   NOTIFY pgrst, 'reload schema';
