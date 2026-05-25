# QA-VALIDATION-EPIC-MRM-V16

**Status:** APPROVED

## Cenários golden (5 fontes de labor)

| Fonte | Cenário | Expected cmv_unit |
|---|---|---|
| 1 | total_labor_net=543, material_net=167 | 710 |
| 2 | product_workload_price=13579.98, material_net=79859.88 | 93439.86 (Founder) |
| 3 | total_labor_gross=200, material_net=100 | 300 |
| 4 | labor_costs=[{net_value:543}], material_net=167 | 710 |
| 5 | productive_labor_total=543, cost_total=167 | 710 |

## Invariante

V16-I1: Produto com qualquer das 5 fontes populada → cmv_unit = material + MO (em vez de só material).

## Verdict

✅ APPROVED — liberado @dev.
