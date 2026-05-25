# QA-VALIDATION-EPIC-MRM-V10

**Status:** APPROVED WITH CONDITIONS
**Owner:** Quinn (QA)
**Criado:** 2026-05-25

---

## Gates

| # | Critério | Resultado |
|---|---|---|
| 1 | PRD claro, causa raiz documentada | ✅ |
| 2 | ADR-011 (children) retrocompat | ✅ ACCEPTED |
| 3 | Fix V10 D1 testável (DOP = 30,78% × RV) | ✅ |
| 4 | 6 invariantes V10-I1..I6 mensuráveis | ✅ |
| 5 | Zero migrations | ✅ |
| 6 | Snapshots V9 não quebram UI | ✅ (validação visual) |

**Verdict:** ✅ APPROVED WITH CONDITIONS — liberado @dev para S1+S2+S3.

## Cenário GT-V10-001 — Hyago granular

Input (mesmo do GT-V9-001):
- RB=141.106,60, desc=10%, ICMS=17%, PIS+COFINS=9,25%
- CMV=42.645,94, mod_pct=0.5117, dop_pct=0.3078 (buckets: admin=0.1168, fixa=0.1182, var=0.0680, fin=0.0048)
- Comissão=5%, Lucro=10%, IRPJ=1,5%, CSLL=0,9%

Expected `cascade_trace`:

| Step | Label | Base | Rate | Amount | Children |
|---|---|---|---|---|---|
| 1 | RB | — | — | 141.106,60 | — |
| 2 | Desconto | 141.106,60 | 10% | -14.110,66 | — |
| 3 | RV | — | — | 126.995,94 | — |
| 4 | Peso Op Interna | 126.995,94 | 100% | 126.995,94 | — |
| 5 | Âncora Interna | — | — | 126.995,94 | — |
| 6 | ICMS | 126.995,94 | 17% | -21.589,31 | — |
| 7 | ISS | 105.406,63 | 0% | 0 | — |
| 8 | PIS/COFINS (agregado) | 105.406,63 | 9,25% | -9.750,11 | — |
| 9 | Custos (CMV) | 95.656,52 | — | -42.645,94 | — |
| 10 | Despesas DOP (total) | 53.010,58 | — | -39.086,52 | **4 children** |
| 10.1 | └─ MO Admin | — | 11,68% | -14.830,30 | — |
| 10.2 | └─ Fixa | — | 11,82% | -15.013,74 | — |
| 10.3 | └─ Variável | — | 6,80% | -8.635,72 | — |
| 10.4 | └─ Financeira | — | 0,48% | -606,76 | — |
| 11 | RRO | 13.924,06 | — | 13.924,06 | — |
| 12 | Redistribuição (total) | 13.924,06 | — | 13.924,06 | **4 children** |
| 12.1 | └─ Comissão | — | 5% (peso 0,287) | 4.001,17 | — |
| 12.2 | └─ Lucro | — | 10% (peso 0,575) | 8.002,33 | — |
| 12.3 | └─ IRPJ | — | 1,5% (peso 0,086) | 1.200,35 | — |
| 12.4 | └─ CSLL | — | 0,9% (peso 0,052) | 720,21 | — |
| 13 | Imp. por fora (total) | — | — | 0 | **0 children** (todos rate=0) |

Tolerância: ±R$ 0,02.

## Tests novos (mínimo 15)

| Suite | Quantidade |
|---|---|
| `margin-reapuration-v10-children.test.ts` | 8 (V10-I1..I4 + GT-V10-001) |
| `build-motor-input-v10-fix-dop.test.ts` | 4 (V10-I5 + retrocompat) |
| `cascade-expander-v10.test.tsx` (opcional UI) | 3 (V10-I6 retrocompat render) |

## Smoke tests pós-implementação

1. `/orcamentos` cria com Hyago scenario → cascata mostra 5 linhas custos/despesas + 4 redistribuição + RRO=R$ 13.924,06.
2. `/vendas` balcão idem.
3. Orçamento legacy (engine 2.4.0 ou anterior) → cascata renderiza sem children (degradação graceful).

## Verdict

✅ **APPROVED WITH CONDITIONS** — liberado @dev S1+S2+S3.

**Bloqueante para deploy:** smoke test browser cenário Hyago.

---

**Quinn (QA)**, 2026-05-25 — fim.
