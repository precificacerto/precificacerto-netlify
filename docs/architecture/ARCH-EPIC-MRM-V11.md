# ARCH-EPIC-MRM-V11 — Despesas via snapshot do produto

**Status:** Approved
**Engine target:** 2.5.0 → 2.6.0

## Decisão arquitetural

Inverter a fonte do DOP: em vez de `RV × tenant.dop_pct` (dinâmico), usar `SUM(product.expense_breakdown_unit × qty)` (snapshot estável do produto).

**Princípio:** ADR-003 reforçado — produto é snapshot imutável; tenant.config muda mas orçamentos antigos não.

## Helper novo

```typescript
// src/utils/item-tax-rates.ts
export interface ProductExpenseBreakdown {
  mo_admin_unit: number     // R$/un — pricing_calculations.val_indirect_labor / yield_quantity
  fixa_unit: number         // R$/un — val_fixed_expense / yield_quantity
  variavel_unit: number     // R$/un — val_variable_expense / yield_quantity
  financeira_unit: number   // R$/un — val_financial_expense / yield_quantity
}

export function resolveProductExpenses(prod: any): ProductExpenseBreakdown {
  // Itera pricing_calculations (mesma lógica de resolveProductCostTotal)
  // Retorna valores POR UNIDADE — caller multiplica por qty
}
```

## Mudança em `BudgetItemRow` / `SaleItemRow`

```typescript
interface BudgetItemRow {
  // ... existentes ...
  expense_breakdown_unit?: ProductExpenseBreakdown  // V11
}
```

Populado em `handleProductSelect` / `handleServiceSelect` (paralelo ao `cost_total` e `productive_labor_unit`).

## Mudança em `buildMotorInput`

```typescript
const breakdown = args.item.expense_breakdown_unit
if (breakdown) {
  // V11 — usa snapshot do produto (Opção A: imutável vs desconto)
  const qty = Number(args.item.quantity) || 0
  const dopItem = (
    breakdown.mo_admin_unit +
    breakdown.fixa_unit +
    breakdown.variavel_unit +
    breakdown.financeira_unit
  ) * qty
  const expense_breakdown = {
    mo_admin: { rate: 0, amount: breakdown.mo_admin_unit * qty },
    fixa: { rate: 0, amount: breakdown.fixa_unit * qty },
    variavel: { rate: 0, amount: breakdown.variavel_unit * qty },
    financeira: { rate: 0, amount: breakdown.financeira_unit * qty },
  }
} else {
  // Fallback V10 — retrocompat com produtos antigos sem snapshot
  const dopRate = Number(args.tenantCtx.dop_pct) || 0
  const dopItem = rvItem * dopRate
  // ... expense_breakdown via pcts
}
```

## Invariantes V11 testáveis

- V11-I1: dop motor === Σ buckets snapshot × qty
- V11-I2: dop NÃO muda com desconto (compare 0% vs 10%)
- V11-I3: produto sem snapshot → fallback V10 (graceful)

## ADR-012 (resumido)

**Decisão:** despesas operacionais no motor RR vêm do snapshot `pricing_calculations` do produto, não do `tenant_expense_config` dinâmico. Modo absoluto (Opção A): não rateiam com desconto.

**Status:** ACCEPTED (Founder 2026-05-25).

**Retrocompat:** produtos sem `pricing_calculations` populadas caem no fallback V10 (`RV × tenant.dop_pct`) — preserva comportamento existente.
