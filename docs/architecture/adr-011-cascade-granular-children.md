# ADR-011 — Cascade granular com sub-itens (children)

**Status:** ACCEPTED (Founder Hyago confirmou via planilha 2026-05-25)
**Date:** 2026-05-25
**Author:** Aria (Architect)
**Related:** ADR-003, ADR-006, ADR-010
**Engine version:** 2.5.0

---

## Context

Após implementação V9 (ADR-010 — cascade sequencial), Founder Hyago enviou print da planilha oficial (`Motor de descontos do resultado residual operacional.xlsx`) mostrando memória cascata com **~20 linhas estruturadas** (Custos + 4 buckets despesa, 4 componentes redistribuição, 6 tributos por fora, 3 resultados parciais). V9 colapsa em 13 steps — usuário não consegue auditar individualmente.

## Decision

Adicionar campo opcional `children?: CascadeStep[]` ao tipo `CascadeStep`. Steps complexos (10, 12, 13) emitem sub-itens reaproveitando a mesma shape recursiva. Steps simples (1-9, 11) mantêm `children` ausente.

```typescript
export interface CascadeStep {
  step: number
  label: string
  base: number | null
  rate: number | null
  amount: number
  formula: string
  source: string
  children?: CascadeStep[]  // V10 ADR-011
  peso?: number | null      // V10 ADR-011 — usado em redistribuição
}
```

## Mapeamento children por step

| Step pai | Children (count) | Detalhes |
|---|---|---|
| 10 (Despesas DOP) | **4** | MO Admin, Fixa, Variável, Financeira (cada com `rate` = pct individual) |
| 12 (Redistribuição) | **4** | Comissão, Lucro, IRPJ, CSLL (cada com `rate` = pct original e `peso` = peso decimal) |
| 13 (Imp. por fora) | **N** (dinâmico) | Um por tributo configurado em `taxes_outside` (filtra rate > 0) |

## Invariantes

```
∀ step com children: Σ children.amount ≈ step.amount (±R$ 0,01)
∀ step.children: cada child preserva shape CascadeStep (recursão natural)
∀ step 12 children: Σ peso = 1 (quando rateio > 0)
```

## Consequences

### Positivas

- ✅ **Auditabilidade fiscal** — contador externo rastreia cada tributo/despesa individual.
- ✅ **Visual alinhado com Excel oficial** — usuário valida bater linha por linha.
- ✅ **Retrocompat 100%** — snapshots V5/V6/V9 sem children continuam válidos. UI tolera ausência.
- ✅ **ZERO migration** — `cascade_trace` permanece em JSONB.
- ✅ **Pureza preservada** — children são computados pelo motor a partir de inputs já existentes (não há I/O novo).

### Negativas

- ⚠️ UI fica mais densa (mitigado por `<details>` collapse default fechado).
- ⚠️ `buildCascadeTrace` recebe args extras (`expense_breakdown`, `redistribution_components`) — leve aumento de complexidade.

## Implementation reference

Ver `docs/architecture/ARCH-EPIC-MRM-V10.md` §3.3 para detalhes de implementação.

## Acceptance criteria

1. ✅ Aria — children recursivo é a solução mais limpa.
2. ✅ Founder — print da planilha confirma 5 buckets despesa + 4 redistribuição + 6 imp. por fora.
3. ⏳ Quinn — V10-I1..I6 testáveis.
4. ⏳ UI smoke test cenário Hyago no browser.

---

**Aria (Architect)** — ADR-011 v1.0, 2026-05-25.
