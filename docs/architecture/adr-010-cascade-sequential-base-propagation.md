# ADR-010 — Cascade Sequential Base Propagation (V9)

**Status:** ACCEPTED (Founder Hyago aprovou em 2026-05-25)
**Date:** 2026-05-25
**Author:** Aria (Architect)
**Related:** ADR-003, ADR-004, ADR-006, ADR-008
**Engine version:** 2.3.0

---

## Context

A `cascade_trace` materializa as 13 etapas do Motor RR (PDF Seção 10) para auditoria e exibição ao usuário. Na implementação V5 (Story MRM-V5-001), os steps 6-11 foram populados com base **independente** (cada step recebe base do motor diretamente):

```typescript
// V5 (atual)
{ step: 9, label: 'Redução de custos', base: null, amount: -args.cp }
{ step: 10, label: 'Redução de despesas (MOD + DOP)', base: null, amount: -despesas_total }
{ step: 11, label: 'RRO', base: null, amount: args.rro }
```

**Problema:** O PDF Motor RR Seção 10 + Excel oficial ("Motor de descontos do resultado residual operacional.xlsx") definem a cascata como **sequencial** — cada etapa "consome" a base anterior:

```
Etapa N.base = Etapa (N-1).base − abs(Etapa (N-1).amount)
```

**Reportado pelo Founder em 2026-05-25** com cenário canônico mostrando expectativa de base que reduz etapa-a-etapa (R$ 95.656,51 → 53.010,57 → 13.924,05).

## Decision

Em `buildCascadeTrace` (`src/utils/margin-reapuration.ts`), propagar base sequencialmente para steps 6-11:

| Step | Label | Base | Amount |
|---|---|---|---|
| 6 | Reapuração ICMS | `ancora_interna` | `-icms` |
| 7 | Reapuração ISS | `step6.base − abs(step6.amount)` | `-iss` |
| 8 | Reapuração PIS/COFINS | `step7.base − abs(step7.amount)` | `-(pis + cofins)` |
| 9 | Redução de custos | `step8.base − abs(step8.amount)` | `-cp` |
| 10 | Redução de despesas (DOP) | `step9.base − abs(step9.amount)` | `-dop` (V9 D1: MOD = 0, label drops "MOD +") |
| 11 | RRO | `step10.base − abs(step10.amount)` | `step10.base − abs(step10.amount)` |

**Invariante matemática preservada:** O valor de `motor.rro` (calculado em linha 299: `ancora - imp - cp - mod - dop`) **continua sendo a fonte de verdade**. A cascade sequencial só **reorganiza visualmente** a mesma matemática.

**Prova de equivalência:**
```
rro_motor = ancora − ICMS − ISS − PIS/COFINS − cp − mod − dop
         (mod=0 V9 D1)
         = ancora − ICMS − ISS − PIS/COFINS − cp − dop
         = ((((ancora − ICMS) − ISS) − PIS/COFINS) − cp) − dop
         = step10.base − abs(step10.amount)
         = step11.amount ✓
```

## Consequences

### Positivas

- ✅ **Apresentação alinhada com PDF/Excel oficial** — usuário entende a cascata como ela é fiscal/contabilmente.
- ✅ **Auditoria facilitada** — cada step rastreável; contador fiscal externo consegue reconciliar.
- ✅ **ZERO impacto matemático** — `rro` final inalterado vs V5 quando inputs (`cp`, `mod=0`, `dop`) também forem V9 (Decisão D1+D2 do PRD).
- ✅ **ZERO migration** — `cascade_trace` continua em JSONB existente.
- ✅ **UI auto-atualiza** — coluna "Base (R$)" do `ConsolidatedDREBlock` já existe, atualmente exibe `—` para steps sem base; passa a renderizar valores reais.

### Negativas / Riscos

- ⚠️ **Snapshots V5 (`engine_version=2.2.0`) preservam steps com base=null** — visualmente diferentes de novos snapshots V9. Mitigação: `requiresReview` badge já cobre essa transição (V5 → V9).
- ⚠️ **Cenário V8 onde MOD ≠ 0 (legacy)** — step 10 label permanece "(MOD + DOP)" se motor recebe `mod > 0` (fallback). Mitigação: V9 D1 zera MOD pelo helper, eliminando o caso.

### Não-impactos

- ✅ Motor `rro` matemático — inalterado.
- ✅ `taxes_outside_base` — inalterado (continua `ancora − ICMS − PIS/COFINS`).
- ✅ Redistribuição comissão/lucro/IRPJ/CSLL — inalterado (sempre proporcional sobre RRO positivo).

## Alternatives considered

### A1: Refatorar motor para subtração sequencial real

Alterar `calculateMarginReapuration` linha 299 para:
```typescript
const baseAfterICMS = ancora - icms
const baseAfterISS = baseAfterICMS - iss
const baseAfterPIS = baseAfterISS - pisCofins
const baseAfterCP = baseAfterPIS - cp
const rro = baseAfterCP - dop
```

**Rejeitado porque:**
- Quebra equivalência matemática com V5 (snapshots imutáveis ADR-003 ficam órfãos).
- Não muda `rro` (associativa: a−b−c = (a−b)−c), apenas dificulta leitura.
- Aumenta risco de regressão sem benefício.

### A2: Calcular cascada na camada UI (extractor)

Mover lógica de propagação para `mrm-display-extractor.ts`.

**Rejeitado porque:**
- Duplicação de lógica (motor produz trace + extractor recomputa).
- Risco de divergência (motor decidir uma coisa, extractor outra).
- Viola princípio "motor é fonte de verdade do trace" (ADR-006).

## Implementation reference

Ver `docs/architecture/ARCH-EPIC-MRM-V9.md` §3.1 para detalhes do diff em `buildCascadeTrace`.

## Acceptance criteria

1. ✅ Aria (Architect) — decodificação Excel confirmada cascata sequencial é a interpretação correta do PDF Seção 10.
2. ✅ Founder (Hyago) — aprovação estratégica em 2026-05-25 ("Liberado") com D1 (MOD=0) e D2 (CMV canônico via cost_total + productive_labor_unit) confirmados.
3. ⏳ Quinn (QA) — invariantes V9-I2, V9-I3 testáveis e cobertas (golden tests S3).
4. ⏳ Shadow mode 7 dias — sem alertas de divergência matemática V8→V9.
5. ⏳ Update `docs/motor-reapuracao-margem.md` Seção 10 com novo trace.

---

**Aria (Architect)** — ADR-010 v1.0, 2026-05-25.
