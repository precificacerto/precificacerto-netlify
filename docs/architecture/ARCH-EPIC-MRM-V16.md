# ARCH-EPIC-MRM-V16 — Labor resolver com múltiplas fontes

**Status:** Approved
**Owner:** Aria

## Decisão

Helper interno `resolveLaborFromAllSources(prod, pricingArr, yieldQty)` itera 5 fontes em ordem de precedência, retorna primeiro valor > 0 (por unidade).

## Implementação

```typescript
function resolveLaborFromAllSources(prod, pricingArr, yieldQty): number {
  // 1. pricing_calculations.total_labor_net (preferencial — spec V8.8)
  for (const p of pricingArr) {
    const v = Number(p?.total_labor_net) || 0
    if (v > 0) return v / yieldQty
  }
  // 2. pricing_calculations.product_workload_price (runtime min×R$/min)
  for (const p of pricingArr) {
    const v = Number(p?.product_workload_price) || 0
    if (v > 0) return v / yieldQty
  }
  // 3. pricing_calculations.total_labor_gross
  for (const p of pricingArr) {
    const v = Number(p?.total_labor_gross) || 0
    if (v > 0) return v / yieldQty
  }
  // 4. labor_costs[] (tabela dedicada V8.3)
  const laborCosts = Array.isArray(prod?.labor_costs) ? prod.labor_costs : []
  if (laborCosts.length > 0) {
    const sum = laborCosts.reduce(
      (s, lc) => s + (Number(lc?.net_value) || Number(lc?.gross_value) || 0),
      0,
    )
    if (sum > 0) return sum / yieldQty
  }
  // 5. products.productive_labor_total (V15.1 coluna)
  const productive = Number(prod?.productive_labor_total) || 0
  if (productive > 0) return productive
  return 0
}
```

Em `resolveProductExpenseBreakdown`:
```typescript
const laborResolved = resolveLaborFromAllSources(prod, pricingArr, yieldQty)
const cmvFromSum = materialNet + laborResolved  // ← usa labor robusto
let cmv_unit = Math.max(cmvFromColumn, cmvFromSum)
```

## ADR-014 (resumo)

**Decisão:** helper aceita múltiplas fontes de MO produtiva sem requerer pipeline de save padronizado.

**Status:** ACCEPTED.

**Trade-off:** complexidade no resolver (5 fontes) vs. simplicidade no save (cada handler salva onde achar). Founder priorizou simplicidade do save.
