# QA-VALIDATION-EPIC-MRM-V11

**Status:** APPROVED WITH CONDITIONS
**Owner:** Quinn

## Cenários

### GT-V11-001 — Produto com pricing_calculations populado

Input: produto Hyago com `cmv=42645.94/un`, `val_indirect_labor=14830.30/un`, `val_fixed_expense=15013.74/un`, `val_variable_expense=8635.72/un`, `val_financial_expense=606.76/un`.

Quantidade=1, RB=141.106,60, desc=10%.

Expected:
- `motorInput.cp = 42645.94`
- `motorInput.dop = 14830.30 + 15013.74 + 8635.72 + 606.76 = R$ 39086.52` (= planilha 13.17 exato)
- Step 10 children: 4 buckets com valores absolutos.

### GT-V11-002 — Invariante imutabilidade vs desconto (V11-I2)

Mesmo produto, comparar 0% desc vs 10% desc:
- DOP **igual** em ambos = R$ 39.086,52
- Custos **iguais** = R$ 42.645,94
- Apenas RV/Âncora/RRO mudam.

### GT-V11-003 — Fallback retrocompat (V11-I3)

Item sem `expense_breakdown_unit` → motor usa `RV × tenant.dop_pct` (comportamento V10 preservado).

## Gates

✅ V11-I1, V11-I2, V11-I3 testáveis.
✅ Snapshots V9/V10 não quebram.
✅ ZERO migrations.

## Smoke test (pós-deploy)

Cenário Hyago no browser: cascade step 10 mostra exatos R$ 39.086,52 (não R$ 89.240,05).
