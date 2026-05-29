# ADR-013 — PIS/COFINS apuração na cascata via fórmula `/(1−ICMS)`

**Status:** SUPERSEDED por [ADR-016](adr-016-pis-cofins-base-ancora-icms-iss.md) (Founder 2026-05-29)
> A base `Âncora − ICMS` (sem subtrair ISS) definida aqui foi revogada. No Motor V17,
> o PIS/COFINS passa a incidir sobre `Âncora − ICMS − ISS` com alíquota efetiva
> consolidada dos produtos. Esta ADR permanece como registro histórico (motor V10/V12).
**Engine version:** 2.6.0

## Context

ADR-008 (V5) aceitou a fórmula de apuração STF: `(Âncora − ICMS) × 9,25%`. Mas o motor V10 ainda implementa a fórmula V4 antiga: `(Âncora − ICMS − ISS) × (pis + cofins)`. Founder requereu (2026-05-25) que motor RR aplique a conversão `apuracao = construcao / (1 − ICMS)` na Etapa 8 da cascata.

## Decision

Em `computeTaxesInside` — heurística por regime + alíquota:

```ts
const isLR = regime === 'LUCRO_REAL'
const hasBothPisCofins = pisRate > 0 && cofinsRate > 0
const pisCofinsAggregate = pisRate + cofinsRate
// Só converte quando LR + AMBOS PIS/COFINS presentes + soma < 8,5%
const isConstrucao = isLR && hasBothPisCofins && pisCofinsAggregate < 0.085

const denom = 1 - icmsRate
const pisCofinsApuracao = isConstrucao && denom > 0
  ? pisCofinsAggregate / denom
  : pisCofinsAggregate
const baseApuracao = ancora - icmsAmount   // sem ISS
const pisCofinsAmount = baseApuracao * pisCofinsApuracao
```

**Cenários cobertos:**

| Regime | Alíquotas cadastradas | Detecção | Cálculo |
|---|---|---|---|
| LR | PIS=1,65% + COFINS=6,0275% = 7,6775% | CONSTRUÇÃO (< 8,5%) | converte para 9,25% via `/(1−ICMS)` |
| LR | PIS=1,65% + COFINS=7,60% = 9,25% | APURAÇÃO (≥ 8,5%) | aplica direto 9,25% |
| LP | PIS+COFINS = 3,65% | APURAÇÃO (regime cumulativo) | aplica direto |
| SN/MEI | — | APURAÇÃO (DAS unificado) | aplica direto |
| Snapshot só com PIS (test) | apenas PIS, sem COFINS | APURAÇÃO (falta COFINS) | aplica direto |

Distribuição entre TaxLines PIS e COFINS proporcional (`pisRate / aggregate × apuração`), mantendo 2 linhas separadas para retrocompat.

## Rationale

1. **Convenção contábil (STF RE 574.706):** alíquota PIS/COFINS em modo construção (que o módulo de precificação usa) deve ser convertida para apuração no motor de reapuração — a base contábil real exclui ICMS, e a alíquota correta nessa base é 9,25% (não 7,6775%).
2. **Alinhamento Excel:** célula H43 do Excel oficial confirma 9,25% sobre `(Âncora − ICMS)`.
3. **Imutabilidade preservada:** snapshots V5/V6/V9/V10 (engine_version anterior) continuam com cálculo antigo. ADR-003 mantido.

## Alternativas rejeitadas

- A1: Adicionar campo `pis_cofins_perspective` configurável (CONSTRUCAO|APURACAO). **Rejeitado** — adiciona complexidade sem benefício (tenant sempre cadastra construção pelo módulo de precificação).
- A2: Aplicar fórmula só na UI (cascade_trace), mantendo motor antigo. **Rejeitado** — motor é fonte de verdade matemática; divergência UI vs RRO seria pior.

## Consequences

### Positivas
- ✅ Motor RR alinhado com Excel oficial + STF.
- ✅ Etapa 8 produz exatamente R$ 9.750,11 no cenário Hyago.
- ✅ Snapshots antigos preservados via ADR-003.

### Negativas
- ⚠️ Cálculo RRO de orçamentos NOVOS muda (~R$ 1.657 a menos vs V10 no cenário Hyago).
- ⚠️ V7 validation atualizada (checa construção em vez de apuração).
- ⚠️ Tests V5/V6/V9/V10 que assumem fórmula antiga precisam ajuste.

## Acceptance criteria

1. ✅ Founder aprovou via instrução literal (2026-05-25).
2. ⏳ Quinn (QA): GT-V12-001 cenário Hyago verifica R$ 9.750,11 exato.
3. ⏳ Smoke test browser: cascade step 8 mostra 9,25% e R$ 9.750,11.
