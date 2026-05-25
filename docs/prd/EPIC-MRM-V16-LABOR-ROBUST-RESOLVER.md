# EPIC-MRM-V16 — Helper labor robusto (fontes múltiplas)

**Status:** Approved (Founder 2026-05-25)
**Engine:** sem bump (lógica interna do helper)

## Problema (Founder report 2026-05-25)

Produto novo cadastrado: Ferragens R$ 79.859,88 (material) + MO produtiva R$ 13.579,98 (= 25.000 min) = **R$ 93.439,86** ("Custo produto" na UI).

Cascade step 9 mostra apenas **R$ 79.859,88** — perde MO produtiva.

V15.4 tenta `Math.max(cmv, material_net + labor_net)` mas só lê `total_labor_net`. O pipeline de cadastro NOVO está salvando MO em `pricing_calculations.product_workload_price` (calculado runtime: min × productive_value_per_minute), não em `total_labor_net`.

## Solução

Helper `resolveProductExpenseBreakdown` tenta **TODAS as fontes** de labor em ordem de precedência:

| # | Fonte | Onde fica |
|---|---|---|
| 1 | `pricing_calculations.total_labor_net` | spec V8.8 |
| 2 | `pricing_calculations.product_workload_price` | runtime min×R$/min |
| 3 | `pricing_calculations.total_labor_gross` | gross (sem créditos) |
| 4 | SUM(`labor_costs[].net_value ‖ gross_value`) | tabela dedicada V8.3 |
| 5 | `products.productive_labor_total` | coluna canônica V15.1 |

Caller monta `cmv_unit = material_net + Σ labor_resolvido`. Se cmv direto (`pricing_calculations.cmv`) for MAIOR, usa esse (já consolidado).

## Out-of-scope

- Pipeline de save: NÃO altera cadastro nesse epic (helper sozinho resolve TODAS as variações)
- Migrations: ZERO

## Invariante

V16-I1: Produto com material=X e MO populada em QUALQUER das 5 fontes → cmv_unit = X + MO
