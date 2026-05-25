# EPIC-MRM-V11-DESPESAS-POR-PRODUTO

**Status:** Draft → Approved (Founder OK 2026-05-25)
**Owner:** Morgan (PM) + Aria (Architect) + Quinn (QA)
**Engine version:** 2.5.0 → 2.6.0 (MINOR)

## Contexto

Após print 13.57, usuário identificou que despesas no quadrante 10 estão usando `tenant.dop_pct` (alíquotas dinâmicas do tenant), causando:
- Despesa Financeira = 43% × RV = R$ 54.608,25 (absurdo — 43% é configuração ruim do tenant).
- Bug de configuração do tenant CONTAMINA todos os orçamentos abertos.

## Diretiva (Founder)

**Custos** e **Despesas** no motor RR devem vir do **snapshot do produto** (tabela `pricing_calculations` populada quando produto foi precificado), **não** dos percentuais dinâmicos do tenant.

**Decisão D1 (Opção A — Founder approved):** Despesas **NÃO** rateiam quando há desconto comercial. Permanecem congeladas no valor absoluto do `pricing_calculations` por unidade × quantidade.

## Fonte canônica

Tabela `pricing_calculations` (migration `20260213000000_fiscal_tax_engine.sql`) já guarda:
- `cmv` — Custo unitário (V10 já usa)
- `val_indirect_labor` — MO Administrativa unitária (R$)
- `val_fixed_expense` — Despesa Fixa unitária (R$)
- `val_variable_expense` — Despesa Variável unitária (R$)
- `val_financial_expense` — Despesa Financeira unitária (R$)

## Stories

| Story | Sprint | Status |
|---|---|---|
| STORY-V11-001 — Helper `resolveProductExpenses()` | S1 | Liberada |
| STORY-V11-002 — `BudgetItemRow.expense_breakdown_unit` + callers | S1 | Liberada |
| STORY-V11-003 — `buildMotorInput` usa breakdown_unit em vez de dop_pct | S2 | Liberada |
| STORY-V11-004 — Tests V11 + golden Hyago | S3 | Liberada |

## Invariantes V11

- V11-I1: `motorInput.dop === SUM(item.expense_breakdown_unit.total × qty)` (sem `tenant.dop_pct`)
- V11-I2: cenário 10% desc — despesas permanecem **iguais** ao cenário 0% desc (não rateadas)
- V11-I3: snapshot V9/V10 sem `expense_breakdown_unit` cai em fallback `tenant.dop_pct × RV` (retrocompat)

## ZERO migrations Supabase
