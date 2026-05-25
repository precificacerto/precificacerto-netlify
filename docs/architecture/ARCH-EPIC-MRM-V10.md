# ARCH-EPIC-MRM-V10 — Cascade granular com sub-itens (children)

**Status:** Approved with Conditions
**Owner:** Aria (Architect)
**Versão:** 1.0
**Criado:** 2026-05-25
**PRD:** `docs/prd/EPIC-MRM-V10-CASCATA-GRANULAR.md`
**ADR:** `adr-011-cascade-granular-children.md`
**Engine target:** 2.4.0 → 2.5.0 (MINOR retrocompat)

---

## 1. Decisão arquitetural principal

**Adicionar campo opcional `children?: CascadeStep[]` ao `CascadeStep`** — preserva ordem fixa dos 13 steps principais e enriquece cada step com sub-itens auditáveis.

**Razão:** Adição de campo opcional é retrocompat (ADR-003 — snapshots V5/V6/V9 sem children continuam válidos). UI degrada graciosamente quando `children` ausente ou vazio.

**Alternativas rejeitadas:**
- A1: Expandir os 13 steps em 20+ steps. **Rejeitado** — quebra contrato "13 etapas obrigatórias" (PDF Motor RR Seção 10) + invariante de ordem.
- A2: Renderizar UI a partir de `taxes_inside`/`taxes_outside` direto, ignorando `cascade_trace`. **Rejeitado** — duplica lógica, viola "motor é fonte de verdade do trace" (ADR-006).

## 2. Diagrama de fluxo (V10)

```
buildMotorInput() — V10 D1 (fix)
   dopRate = dop_pct  ← APENAS (sem mod_pct)
   mod = 0             ← invariante V9 preservada
   cp = (cost_total + productive_labor_unit) × qty  ← invariante V9 preservada
        │
        ▼
calculateMarginReapuration(input)
        │
        ▼
buildCascadeTrace(args) — V10 emite 13 steps + sub-itens
        │
        ├─ Step 8 (PIS/COFINS) — amount = pis + cofins, SEM children
        ├─ Step 10 (Despesas DOP) — children: [MO Admin, Fixa, Variável, Financeira]
        ├─ Step 12 (Redistribuição) — children: [Comissão, Lucro, IRPJ, CSLL]
        └─ Step 13 (Impostos por fora) — children: por tributo configurado
        │
        ▼
ConsolidatedDREBlock → CascadeExpander
        renderiza step + step.children?.map() com indent 16px
```

## 3. Mudanças por camada

### 3.1. L1 — Tipos (`src/types/mrm.ts`)

```typescript
export interface CascadeStep {
  step: number
  label: string
  base: number | null
  rate: number | null
  amount: number
  formula: string
  source: string
  /**
   * V10 (ADR-011): sub-itens opcionais que detalham o step pai.
   * Ex: step 10 (Despesas DOP) tem 4 children (MO Admin, Fixa, Variável, Financeira).
   * Soma de children.amount deve aproximar parent.amount (±R$ 0,01).
   * Snapshots V5/V6/V9 sem este campo continuam válidos (retrocompat).
   */
  children?: CascadeStep[]
  /**
   * V10 (ADR-011): peso decimal usado em redistribuição proporcional.
   * Exibido apenas em sub-itens do step 12 (Comissão/Lucro/IRPJ/CSLL).
   * `null` ou ausente quando não aplicável.
   */
  peso?: number | null
}
```

### 3.2. L2 — Helper (`src/utils/mrm-orchestrator.ts`)

**Fix V10 D1 em `buildMotorInput`:**

```typescript
// V10 D1 (2026-05-25): MO Produtiva (mod_pct) NÃO entra em dopRate.
// Já está contabilizada no CMV via productive_labor_unit (V8.8 cascade).
// dop_pct do tenant já inclui MO Admin (moiPct) — somar mod_pct seria
// dupla contagem da MO Produtiva.
const dopRate = Number(args.tenantCtx.dop_pct) || 0
const dopItem = rvItem * dopRate
const modItem = 0  // V9 D1 invariante preservada
```

### 3.3. L1 — Motor (`src/utils/margin-reapuration.ts`)

**`buildCascadeTrace` ganha argumentos adicionais para construir sub-itens:**

```typescript
function buildCascadeTrace(args: {
  // ... args V9 existentes ...
  // V10 novos:
  expense_breakdown?: {
    mo_admin: { rate: number; amount: number }
    fixa: { rate: number; amount: number }
    variavel: { rate: number; amount: number }
    financeira: { rate: number; amount: number }
  } | null
  redistribution_components?: {
    commission: { rate: number; peso: number; amount: number }
    profit: { rate: number; peso: number; amount: number }
    csll: { rate: number; peso: number; amount: number }
    irpj: { rate: number; peso: number; amount: number }
  }
}): CascadeStep[]
```

**Mudanças nos steps:**

| Step | V9 | V10 |
|---|---|---|
| 8 (PIS/COFINS) | `amount = pis + cofins` (já agregado em V9) | mantém — label/formula reforçam "agregado" |
| 10 (Despesas DOP) | `amount = -dop` único | `amount = -dop` + `children: [4 sub-itens]` |
| 12 (Redistribuição) | `amount = rateio_total` único | `amount = rateio_total` + `children: [4 sub-itens com peso]` |
| 13 (Impostos por fora) | `amount = taxes_outside_total` único | `amount = total` + `children: taxes_outside.map(line)` |

**Origem dos dados para sub-itens:**

- **Step 10 children:** `expense_breakdown` precisa ser propagado do orchestrator (passou de `tenant_expense_config`) até o motor. Por isso é um arg novo do `buildCascadeTrace`. Caller (`buildMotorInput`) calcula:
  ```typescript
  mo_admin    = rvItem × expense_breakdown.administrative_pct
  fixa        = rvItem × expense_breakdown.fixed_pct
  variavel    = rvItem × expense_breakdown.variable_pct
  financeira  = rvItem × expense_breakdown.financial_pct
  // Σ = dopItem (validar invariante V10-I1)
  ```

- **Step 12 children:** motor já computa internamente — só popular sub-itens. `peso` vem de `combined_pct > 0 ? component_pct / combined_pct : 0`.

- **Step 13 children:** motor já gera `taxes_outside: TaxLine[]` — só mapear para `CascadeStep[]`.

### 3.4. L3 — UI (`src/page-parts/shared/consolidated-dre-block.component.tsx`)

**`CascadeExpander` adiciona renderização de children:**

```tsx
{trace.map((step) => (
  <React.Fragment key={step.step}>
    {/* row do step pai */}
    <StepRow step={step} bold={step.children?.length > 0} />
    {/* children opcionais (indent + cor subtle) */}
    {step.children?.map((child, idx) => (
      <StepRow
        key={`${step.step}-${idx}`}
        step={child}
        indent={16}
        muted
        showPeso={step.step === 12}
      />
    ))}
  </React.Fragment>
))}
```

Grid CSS muda de 5 colunas para 6 (Peso adicionado, condicional).

## 4. Invariantes V10

| ID | Invariante | Onde valida |
|---|---|---|
| V10-I1 | `Σ step10.children.amount === step10.amount` (±R$ 0,01) | Test sub-itens despesa |
| V10-I2 | `Σ step12.children.amount === step12.amount` (±R$ 0,01) | Test sub-itens redistribuição |
| V10-I3 | `Σ step12.children.peso === 1` (quando rateio > 0) | Test pesos |
| V10-I4 | `Σ step13.children.amount === step13.amount` | Test impostos por fora |
| V10-I5 | `buildMotorInput().dop === rv × dop_pct` (SEM mod_pct) | Test fix dupla contagem |
| V10-I6 (retrocompat) | Snapshot V9 (sem children) renderiza sem erro | Test UI fallback |

## 5. Plano de migração

| Fase | Ação |
|---|---|
| F1 | Implementar fix V10 D1 (`buildMotorInput`) | @dev S1 |
| F2 | Estender `CascadeStep` com `children?` + `peso?` | @dev S2 |
| F3 | Refator `buildCascadeTrace` (recebe expense_breakdown + redistribution_components) | @dev S2 |
| F4 | Atualizar `buildMotorInput` para passar `expense_breakdown` para o motor | @dev S2 |
| F5 | `CascadeExpander` renderiza children + coluna Peso | @dev S3 |
| F6 | Tests novos cobrem V10-I1..I6 | @dev S2+S3 |
| F7 | Bump engine 2.4.0 → 2.5.0 | @dev S2 |

**ZERO migrations.**

## 6. ADR-011 (resumo)

Detalhes completos em `adr-011-cascade-granular-children.md`.

**Decisão:** `CascadeStep.children?: CascadeStep[]` enriquece auditabilidade da cascata sem quebrar contrato "13 etapas fixas". Sub-itens reaproveitam mesma shape do parent (recursão natural).

**Consequências:**
- ✅ Visual cascata espelha planilha oficial (Excel).
- ✅ ZERO breaking change — V5/V6/V9 snapshots continuam renderizando.
- ✅ Auditável: contador fiscal pode rastrear cada tributo/despesa individual.
- ⚠️ UI fica mais densa — `details` collapse minimiza ruído visual.

## 7. Verdict de Aria

✅ **APPROVED WITH CONDITIONS**

**Condições:**
1. ADR-011 ACCEPTED pelo Founder (children retrocompat OK).
2. Quinn (QA) confirma 6 invariantes V10-I1..I6 testáveis.
3. Fix V10 D1 (`dopRate = dop_pct`) validado com cenário Hyago: DOP = R$ 39.086,52 exato.

---

**Aria (Architect)** — ARCH v1.0, 2026-05-25.
