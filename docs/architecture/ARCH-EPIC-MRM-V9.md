# ARCH-EPIC-MRM-V9 — Arquitetura de Alinhamento Motor RR ↔ DRE Consolidada

**Status:** Draft → Approved with Conditions
**Owner:** Aria (Architect)
**Versão:** 1.0
**Criado:** 2026-05-25
**Referência PRD:** `docs/prd/EPIC-MRM-V9-MOTOR-ALIGN.md`
**Engine target:** 2.2.0 → 2.3.0 (MINOR)

---

## 1. Princípios arquiteturais reforçados

| Princípio | Aplicação V9 |
|---|---|
| **ADR-003 (Snapshot imutável)** | Snapshots V5 (`engine_version=2.2.0`) NÃO recalculam. V9 ativa apenas para novos cálculos / edições. |
| **ADR-004 (Motor puro)** | Motor RR continua puro. Resolução de `cp` canônico via `resolveProductCostTotal()` fica no orchestrator (`buildMotorInput`), não no motor. |
| **ADR-006 (Cascade JSONB)** | `cascade_trace` continua em JSONB. Base sequencial é cálculo runtime — não muda schema. |
| **ADR-008 (PIS/COFINS 9,25%)** | Reforçado via alíquotas DB, não via fórmula. Motor preserva `(Âncora − ICMS − ISS) × Σrate`. |
| **NOVO: ADR-010 (Cascade sequencial)** | Steps 6-11 propagam base = base_anterior − abs(amount_anterior). Visual + auditoria, sem afetar RRO matemático final. |

## 2. Diagrama de fluxo (V9)

```
┌─────────────────────────────────────────────────────────────────┐
│ Caller (orcamentos/index.tsx OR vendas/index.tsx)               │
│                                                                  │
│  budgetItems.map(item => buildMotorInput(item, tenantCtx, disc))│
│         │                                                        │
│         ▼                                                        │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ buildMotorInput() — NOVO HELPER (mrm-orchestrator.ts) │      │
│  │  • cp = resolveProductCostTotal(item) × qty (CMV canônico)│  │
│  │  • mod = 0  ← V8.8 (era RV × mod_pct)                 │      │
│  │  • dop = RV × dop_pct                                 │      │
│  │  • commission/profit_pct, csll/irpj, rates...         │      │
│  └───────────────────────────────────────────────────────┘      │
│         │                                                        │
│         ▼                                                        │
│  calculateMarginReapuration(input) — motor puro V9              │
│         │                                                        │
│         ▼                                                        │
│  TaxBreakdown { rro, cascade_trace[13], taxes_*, ... }          │
│         │                                                        │
│         ▼                                                        │
│  ConsolidatedDREBlock — renderiza cascade_trace sequencial       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
         INVARIANTE V9-I1: Motor.rro ≡ DRE.rro.valor (±R$ 0,01)
```

## 3. Mudanças por camada

### 3.1. L1 — Motor puro (`src/utils/margin-reapuration.ts`)

**Mudanças cirúrgicas — preserva pureza:**

| Função | Antes | Depois |
|---|---|---|
| `calculateMarginReapuration` | Assinatura: `cp, mod, dop` separados | **Inalterada** — recebe `mod=0` do helper |
| `buildCascadeTrace` | Steps 6-11 com base independente | Steps 6-11 propagam `base = base_anterior − abs(amount_anterior)` (ADR-010) |
| Step 9 (Custos) | `base: null, amount: -cp` | `base: prev_base − abs(prev_amount), amount: -cp` |
| Step 10 (Despesas) | `base: null, amount: -(mod+dop)` | `base: step9.base − abs(step9.amount), amount: -dop` (label muda para "Redução de despesas (DOP)") |
| Step 11 (RRO) | `amount: args.rro` (fórmula global) | `amount: step10.base − abs(step10.amount)` (≡ rro matematicamente) |

**Invariante adicionada:**
```ts
// V9-I2: cascade_trace step 11 amount ≡ motor.rro (±R$ 0.01)
```

### 3.2. L2 — Orchestrator (`src/utils/mrm-orchestrator.ts`)

**Novo helper exportado:**

```typescript
export interface BuildMotorInputArgs {
  item: BudgetItem | SaleItem        // produto/serviço selecionado
  tenantCtx: TenantTaxContext        // regime, rates, mod_pct (ignored V9), dop_pct, csll/irpj
  globalDiscountPercent: number      // 0..100
  itemTaxRates: ItemTaxRates | null  // override por item
  discountMode: DiscountMode         // PROPORTIONAL | SELLER | PROFIT
}

export function buildMotorInput(args: BuildMotorInputArgs): ReapurationInput {
  const itemBase = args.item.unit_price * args.item.quantity
  const rvItem = itemBase * (1 - args.globalDiscountPercent / 100)

  // V9 D2: cost_total canônico via resolveProductCostTotal (CMV inclui MO produtiva)
  const cpItem = resolveProductCostTotal(args.item, args.tenantCtx) * args.item.quantity

  // V9 D1: MOD = 0 (V8.8 — migrada para Administrativas no consolidated-dre)
  const modItem = 0

  // DOP permanece proporcional à RV (mantém comportamento V5)
  const dopItem = rvItem * (Number(args.tenantCtx.mod_pct) || 0) +
                  rvItem * (Number(args.tenantCtx.dop_pct) || 0)
  // NOTA: mod_pct migra para DOP bucket (consistente com V8.8 que coloca em Administrativas)

  return {
    rb: itemBase,
    desc_value: itemBase * (args.globalDiscountPercent / 100),
    regime: args.tenantCtx.regime,
    rates: mergeItemAndTenantRates(args.itemTaxRates, args.tenantCtx.rates),
    cp: cpItem,
    mod: modItem,
    dop: dopItem,
    commission_pct: (args.item.commission_percent ?? 0) / 100,
    profit_pct: (args.item.profit_percent ?? 0) / 100,
    csll_pct: resolveItemCsllPct(args.itemTaxRates, args.tenantCtx.csll_pct),
    irpj_pct: resolveItemIrpjPct(args.itemTaxRates, args.tenantCtx.irpj_pct),
    discount_mode: args.discountMode,
    effective_date: new Date().toISOString().slice(0, 10),
    use_snapshot_rates: args.tenantCtx.useSnapshotRates,
  }
}
```

**Crítico:** este helper NÃO faz I/O — recebe `tenantCtx` já carregado (mantém ADR-004).

### 3.3. L3 — Callers UI (`src/pages/orcamentos|vendas/index.tsx`)

**Refatoração:**
- `orcamentos/index.tsx:586-606` (20 linhas) → 4 linhas com `buildMotorInput()`
- `vendas/index.tsx:1027-1054, 1180-1206, 1235-1263` (3 × 20+ linhas) → 3 × 4 linhas

**Antes (orcamentos/index.tsx:586-606):**
```typescript
const cpItem = (Number(i.cost_total) || 0) * (Number(i.quantity) || 0)
const rvItem = itemBase - itemBase * (globalDiscountPercent / 100)
const modItem = rvItem * (Number(mrmConfig.mod_pct) || 0)
const dopItem = rvItem * (Number(mrmConfig.dop_pct) || 0)
return calculateMarginReapuration({ rb: itemBase, desc_value: ..., cp: cpItem, mod: modItem, dop: dopItem, ... })
```

**Depois (V9):**
```typescript
const input = buildMotorInput({
  item: i,
  tenantCtx: mrmConfig,
  globalDiscountPercent,
  itemTaxRates: i.item_tax_rates,
  discountMode,
})
return calculateMarginReapuration(input)
```

## 4. Plano de migração (cutover)

| Fase | Ação | Quem |
|---|---|---|
| F1 | Implementar `buildMotorInput` + tests (90% cobertura) | @dev S1 |
| F2 | Refatorar 4 callers (1 orçamento + 3 vendas) | @dev S1 |
| F3 | Atualizar `buildCascadeTrace` (steps 6-11 sequenciais) | @dev S2 |
| F4 | Bump engine_version 2.2.0 → 2.3.0 em `types/mrm.ts` | @dev S2 |
| F5 | Shadow mode 7 dias (mrm-shadow.ts auto-registra diff V8/V9) | @devops S3 |
| F6 | Promote V9 a default após shadow sem alertas | @devops pós-S3 |

**ZERO migrations Supabase** — todos os 13 steps cabem em JSONB existente `tax_breakdown.cascade_trace`.

## 5. Invariantes V9

| ID | Invariante | Onde valida |
|---|---|---|
| V9-I1 | `motor.rro ≡ DRE.rro.valor` (delta ≤ R$ 0,01) por item | Test golden Hyago 2026-05-25 |
| V9-I2 | `cascade_trace[10].amount ≡ motor.rro` (step 11) | Test cascade sequential |
| V9-I3 | `step[N].base ≡ step[N-1].base − abs(step[N-1].amount)` para N=7..11 | Test cascade sequential |
| V9-I4 | `motorInput.mod === 0` sempre (V8.8) | Test build-motor-input |
| V9-I5 | `motorInput.cp === resolveProductCostTotal(item) × qty` | Test build-motor-input |

## 6. ADR-010 (resumo — doc completo em `adr-010-cascade-sequential-base-propagation.md`)

**Decisão:** Steps 6-11 do `cascade_trace` propagam base sequencialmente.

**Contexto:** PDF Motor RR Seção 10 + Excel oficial "Motor de descontos do resultado residual operacional.xlsx" mostram cascata sequencial onde cada etapa "consome" a base anterior. Implementação V5 (`buildCascadeTrace`) gerava steps independentes, perdendo legibilidade auditável.

**Alternativas rejeitadas:**
- A1: Refatorar fórmula RRO no motor para subtração sequencial → REJEITADO (quebra equivalência matemática V4/V5, impacta snapshots imutáveis ADR-003).
- A2: Calcular cascata só na UI (extractor) → REJEITADO (duplicação de lógica, divergência risk).

**Escolha:** Calcular base sequencial em `buildCascadeTrace` (puro, dentro do motor) — mantém `rro` matemático global, só muda apresentação da memória cascata.

**Consequências:**
- ✅ Visual pedagógico (usuário entende como base reduz etapa-a-etapa)
- ✅ Auditoria fiscal facilitada (cada step rastreável)
- ✅ ZERO impacto em snapshots V5 existentes
- ⚠️ UI `ConsolidatedDREBlock` passa a renderizar coluna "Base (R$)" preenchida para steps 6-11 (era `—`)

**Status:** PROPOSED → Founder approval required.

## 7. Verdict de Aria

✅ **APPROVED WITH CONDITIONS**

**Condições para liberar @dev:**
1. ADR-010 ACCEPTED pelo Founder (confirma cascade sequencial é apresentação, não matemática)
2. Quinn (QA) confirma 5 invariantes V9-I1..V9-I5 testáveis
3. Shadow mode 7 dias obrigatório antes do promote para default (R1 do PRD)

**Liberado para @sm fatiar stories** sob essas condições.

---

**Aria (Architect)**, 2026-05-25 — fim do ARCH v1.0.
