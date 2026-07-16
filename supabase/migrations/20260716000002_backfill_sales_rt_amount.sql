-- BUG-RELATORIO-VENDAS-RT-PERSIST-001 (Relatório 15/07/2026, Seção 2)
--
-- Vendas finalizadas ANTES da persistência do snapshot de RT (EPIC-RT v8) ficaram
-- com sales.rt_amount nulo/zero, fazendo o Relatório de Vendas exibir "—" nas
-- colunas "RT %"/"RT R$" (casos VD-34E70E, VD-6FE7D9).
--
-- Este backfill grava o snapshot faltante usando EXATAMENTE a mesma fórmula do
-- fallback on-the-fly já aplicado na leitura (relatorio-vendas / rt-comissoes):
--
--   aliquota_efetiva_RT = Σ(qty · unit_price · rt_reserve_percent/100) / Σ(qty · unit_price)
--   rt_amount           = aliquota_efetiva_RT · final_value   (âncora pós-desconto)
--
-- A razão (numerador/denominador) é a alíquota efetiva de RT dos itens; multiplicada
-- pelo final_value (já pós-desconto) reproduz o valor herdado da Memória Cascata.
--
-- IDEMPOTENTE e NÃO-DESTRUTIVO: só atualiza vendas cujo rt_amount é NULL ou 0 e que
-- possuam RT efetiva > 0 nos produtos. Snapshots já gravados NÃO são tocados.
-- Rodar novamente é seguro (nenhuma linha já preenchida será sobrescrita).

WITH rt_calc AS (
  SELECT
    si.sale_id,
    SUM(si.quantity * si.unit_price)                                              AS valor_itens,
    SUM(si.quantity * si.unit_price * COALESCE(p.rt_reserve_percent, 0) / 100.0)  AS rt_weighted
  FROM public.sale_items si
  LEFT JOIN public.products p ON p.id = si.product_id
  GROUP BY si.sale_id
)
UPDATE public.sales s
SET rt_amount = (rt_calc.rt_weighted / rt_calc.valor_itens) * s.final_value
FROM rt_calc
WHERE s.id = rt_calc.sale_id
  AND rt_calc.valor_itens > 0
  AND rt_calc.rt_weighted > 0
  AND s.final_value IS NOT NULL
  AND (s.rt_amount IS NULL OR s.rt_amount = 0);
