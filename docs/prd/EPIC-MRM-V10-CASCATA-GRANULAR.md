# EPIC-MRM-V10-CASCATA-GRANULAR — Memória Cascata espelha Excel oficial + fix DOP

**Status:** Draft (Morgan/PM)
**Owner:** Morgan (PM) + Aria (Architect) + Quinn (QA)
**Criado:** 2026-05-25
**Engine version target:** 2.4.0 → 2.5.0 (MINOR — sem migração)

---

## 1. Contexto

V9 implementou (a) `buildMotorInput()` com MOD=0, (b) cascade sequencial nos steps 6-11, (c) golden test do cenário Hyago. Após review do user com o print da planilha oficial (`WhatsApp Image 2026-05-25 at 13.17.53.jpeg`), 2 problemas residuais foram identificados:

### 1.1. Bug residual — Dupla contagem MO Produtiva via `dop_pct`

`use-tenant-tax-context.ts:210`:
```typescript
const dop_pct = fixedPct + variablePct + financialPct + moiPct   // admin_labor (MOI)
const mod_pct = toDecimal(cfg?.production_labor_percent)         // production_labor (MO Produtiva)
```

`mrm-orchestrator.ts:buildMotorInput()` (V9):
```typescript
const dopRate = (Number(args.tenantCtx.mod_pct) || 0) + (Number(args.tenantCtx.dop_pct) || 0)
```

**Problema:** `dop_pct` JÁ inclui `moiPct` (mão de obra administrativa/indireta). E `mod_pct` (MO produtiva) JÁ está no CMV via `productive_labor_unit` (V8.8). Somar os dois resulta em **dupla contagem da MO Produtiva**.

**Evidência (sistema atual):** RV=126.995,94 × 81,95% = **R$ 104.073,17** (errado). Esperado pela planilha: R$ 39.086,52 (= 30,78%).

**Diff:** 81,95% − 30,78% = 51,17% = `production_labor_percent` do tenant.

**Fix V10 D1:** `dopRate = dop_pct` apenas (sem somar `mod_pct`). MO Produtiva permanece exclusivamente no CMV.

### 1.2. Memória cascata UI colapsada vs planilha oficial

A planilha oficial mostra **~20 linhas estruturadas**. A V9 tem 13 colapsadas:

| Bloco | Planilha (granular) | V9 atual (colapsado) |
|---|---|---|
| Custos/Despesas | **5 linhas**: Custos + MO Admin + Fixa + Variável + Financeira | 2 linhas: Custos + Despesas (DOP) |
| PIS/COFINS | **1 linha agregada (9,25%)** | 2 linhas separadas (PIS + COFINS) |
| Redistribuição | **4 linhas**: Comissão + Lucro + IRPJ + CSLL | 1 linha colapsada |
| Impostos por fora | **6 linhas**: IBS + CBS + IS + IPI + ICMS-ST + DIFAL | 1 linha colapsada |
| Resultados parciais | **3 linhas**: pós-ICMS, pós-impostos, Total Op. por dentro | Embutidos no `base` do step seguinte |

---

## 2. Objetivos

| ID | Objetivo | Métrica |
|---|---|---|
| O1 | Eliminar dupla contagem residual MO Produtiva via dop_pct | DOP esperado = 30,78% × RV (cenário Hyago) = R$ 39.086,52 |
| O2 | Cascade visual espelha planilha oficial (≥18 linhas estruturadas) | Conferência visual com PDF/Excel oficial |
| O3 | PIS/COFINS exibido como linha única agregada | UI mostra "PIS/COFINS 9,250%" (não PIS + COFINS separados) |
| O4 | 4 buckets de despesa exibidos separadamente | MO Admin / Fixa / Variável / Financeira como sub-itens |
| O5 | Redistribuição exibida com 4 componentes + pesos | Comissão / Lucro / IRPJ / CSLL com `pct` e `peso` (Excel cols I+J) |
| O6 | Impostos por fora exibidos como lista (independente do count) | Cada tributo configurado aparece em linha própria |

---

## 3. Escopo

### 3.1. IN-SCOPE (V10)

**Código:**
- `src/utils/mrm-orchestrator.ts` — fix em `buildMotorInput()`: `dopRate = dop_pct` (sem `mod_pct`).
- `src/utils/margin-reapuration.ts` — `buildCascadeTrace` expandido com sub-itens:
  - Step 8 (PIS/COFINS) — concatenar PIS+COFINS amount como linha agregada (label "PIS/COFINS").
  - Steps 10.1-10.4 (sub-itens de despesas) — novo array `step.children` opcional ou novo step 10b com bucket breakdown.
  - Steps 12.1-12.4 (sub-itens de redistribuição) — Comissão/Lucro/IRPJ/CSLL com `pct` + `peso`.
  - Steps 13.1-13.N (sub-itens de impostos por fora) — array dinâmico por tributo configurado.
  - Linhas de resultado parcial: "Resultado pós dedução ICMS", "Resultado pós impostos por dentro", "Resultado Residual Operacional", "Total Op. por dentro".
- `src/types/mrm.ts` — `CascadeStep` ganha `children?: CascadeStep[]` ou novo `CascadeSubStep[]`.
- `src/page-parts/shared/consolidated-dre-block.component.tsx` — `CascadeExpander` renderiza children com indent + estilo.
- `src/utils/__tests__/margin-reapuration-v9-cascade-sequential.test.ts` — ajustar GT-V9-001 para validar children.

**Docs:**
- ADR-011 (V10): "Cascade granular com sub-itens — alinhamento Excel oficial".
- Update `docs/motor-reapuracao-margem.md` Seção 10 com mock visual.

### 3.2. OUT-OF-SCOPE (V10)

- ❌ Mudanças no `tenant_expense_config` (Supabase) — dop_pct continua sendo soma dos 4 buckets.
- ❌ Migrations — `cascade_trace` continua JSONB.
- ❌ ADR-008 runtime — separadamente confirmar se tenant tem alíquotas PIS+COFINS=9,25% (não é escopo aqui, é dado de tenant).
- ❌ DRE Consolidada — já está correta (V8.8). Apenas o `CascadeExpander` é atualizado.

---

## 4. Stories (3 sprints, 12-16h)

### Sprint 1 (4-6h) — Fix DOP source

**STORY-V10-001 — `buildMotorInput` corrige dupla contagem residual**
- AC1: `mrm-orchestrator.ts:buildMotorInput()` usa `dopRate = dop_pct` (sem `mod_pct`).
- AC2: Comentário inline explica: "MO Produtiva (mod_pct) JÁ está no CMV via productive_labor_unit (V8.8). dop_pct já inclui MO Admin (moiPct)."
- AC3: Golden test GT-V9-001 atualizado: novo cenário Hyago usa `mod_pct=0.51, dop_pct=0.3078` e produz DOP = R$ 39.086,52.
- AC4: Tests V9 existentes (363) continuam verdes — zero regressão.

### Sprint 2 (5-7h) — Cascade granular com sub-itens

**STORY-V10-002 — Memória cascata espelha planilha (sub-itens)**
- AC1: `CascadeStep` ganha campo opcional `children?: CascadeStep[]`.
- AC2: Step 8 (PIS/COFINS) — `amount` agregado, `formula = "(pós-ICMS) × (PIS% + COFINS%)"`, sem children.
- AC3: Step 10 (Despesas DOP) ganha 4 children: MO Admin / Fixa / Variável / Financeira (cada um com `base=null, rate=respectivo_pct, amount=−valor`).
- AC4: Step 12 (Redistribuição) ganha 4 children: Comissão / Lucro / IRPJ / CSLL (cada um com `rate=pct_original, peso=peso_componente, amount=valor`). Coluna "peso" exibida pela UI.
- AC5: Step 13 (Impostos por fora) ganha N children: um por tributo configurado em `taxes_outside` (apenas os com rate>0). Quando todos zero, fica como linha única "Sem impostos por fora".
- AC6: Adicionar 3 steps "resultado parcial" entre os existentes (opcionais, identificados via `source`):
  - Step 6b: "Resultado pós dedução ICMS"
  - Step 8b: "Resultado pós dedução impostos por dentro"
  - Step 12b: "Total Operação por dentro" (= Âncora, ≡ recomposição via redistribuição)
- AC7: Tests novos cobrem sub-itens e ordem.

### Sprint 3 (3-4h) — UI render dos sub-itens

**STORY-V10-003 — `CascadeExpander` renderiza granularmente**
- AC1: Grid CSS muda de 5 colunas para 6 (adiciona "Peso" para step 12 children).
- AC2: Children renderizados com `indent: 16px` + cor `#94a3b8` (subtle).
- AC3: Step 12 children mostram coluna "Peso" (decimal com 3 casas: "0,287").
- AC4: Step 13 children renderizam só os tributos com rate > 0 (omite zerados visualmente).
- AC5: Resultado parcial entre etapas em destaque (negrito + linha divisória sutil).
- AC6: Smoke test manual no browser (`/orcamentos` e `/vendas`) com cenário Hyago.

---

## 5. Riscos

| ID | Risco | Mitigação |
|---|---|---|
| R1 | Snapshots V5/V6/V9 sem `children` quebram UI | `CascadeExpander` checa `step.children?.length > 0` antes de renderizar — graceful degradation. |
| R2 | DOP correto reduz despesas — tenants veem RRO subir | Esperado e desejado (= alinhar com planilha oficial). Banner "Atualizando" já cobre. |
| R3 | Step 12 children quebram totais (precisão de soma) | Tests validam `Σ children.amount ≈ parent.amount` (±R$ 0,01). |
| R4 | Step 13 lista vazia quando todos tributos por fora = 0 | Renderiza "—" silencioso (não quebra layout). |

---

## 6. Próximos handoffs

→ **@architect Aria**: criar `docs/architecture/ARCH-EPIC-MRM-V10.md` + `docs/architecture/adr-011-cascade-granular-children.md`
→ **@qa Quinn**: criar `docs/qa/QA-VALIDATION-EPIC-MRM-V10.md`
→ **Orion**: implementar S1+S2+S3 direto após aprovação dos 3 docs

---

**Morgan (PM)**, 2026-05-25 — fim do PRD v1.0.
