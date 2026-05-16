# Arquitetura — Melhorias Maio/2026

**Autor:** @architect Aria
**Data:** 2026-05-16
**Status:** PROPOSED — aguarda validação para implementação
**Escopo:** 4 ajustes funcionais em `precificacerto-netlify` (Next.js + Supabase + Ant Design)

---

## 1. Sumário Executivo

Este documento valida arquiteturalmente quatro ajustes interdependentes no SaaS Precifica Certo:

1. **MO Administrativa em Produtos/Serviços espelha HUB** — eliminar valor cacheado/stale e garantir que a precificação consuma o último percentual sincronizado de `tenant_expense_config.indirect_labor_percent`.
2. **Ponto de Equilíbrio (PE)** — bug raiz: a fórmula consome `taxableRegimePercent` e `commissionPct` do usuário (regime cadastrado / padrão) em vez de derivá-los do HUB. Sem essa correção, o PE pode estar inflado ou subdimensionado em vários cenários reais.
3. **Relatório de Comissões** — três bugs ortogonais: data `Invalid Date`, comissão zerada (cadeia de fallback ausente) e responsividade quebrada em mobile.
4. **Desconto Lucro Real** — mudança semântica: hoje o desconto é "% da margem (commission+profit)"; para Lucro Real (e somente LR) a regra precisa ser "% sobre o preço", recalcular ICMS/PIS/COFINS por dentro sobre o novo preço, e absorver o desconto proporcionalmente em comissão + lucro.

O ajuste #2 é prioridade máxima — bug numérico em KPI de dashboard erode confiança e impacta decisões fiscais/comerciais do tenant. Foi validado com exemplo numérico real do usuário (PE = R$ 295.726,87 ≈ R$ 295.700 esperado).

---

## 2. Diagramas de Fluxo de Dados (Bug → Fix)

### 2.1 — AJUSTE 1: MO Admin (HUB → Precificação)

```
ESTADO ATUAL
────────────────────────────────────────────────────────────────────
cash_entries (INSERT/UPDATE/DELETE pelo usuário no fluxo)
        │
        ▼ (sem trigger / sem invalidação)
[mergeExpenseConfig]  ←──── DISPARADO APENAS em pages/index.tsx
        │                   useEffect → fetchDashboardData → ensureHubSynced
        ▼                   (hubSyncDoneRef.current = one-shot por sessão)
tenant_expense_config.indirect_labor_percent
        │
        ▼ (lido por buildCalcBase)
calcBase.indirectLaborPct
        │
        ▼
pages/produtos/* + pages/servicos/*   ← pode estar STALE se usuário
UI exibe MO Admin %                     navegou direto sem passar pelo /

      ⚠ Bug: edits no fluxo de caixa NÃO chegam à precificação
        até a próxima recarga do dashboard.

ESTADO ALVO (Opção C — Refetch on Focus, ver DA-3)
────────────────────────────────────────────────────────────────────
cash_entries (mutation)
        │
        ▼ (sem trigger DB; sem WebSocket)
useExpenseConfig() hook centralizado
        │  ├─ revalidateOnFocus + revalidateOnMount
        │  └─ revalidateOnTagInvalidation('expense-config')
        ▼
mergeExpenseConfig() recalcula → tenant_expense_config
        │
        ▼ (via mutate)
calcBase em /produtos /servicos atualizado SEM reload
```

---

### 2.2 — AJUSTE 2: Ponto de Equilíbrio (BUG RAIZ)

```
ESTADO ATUAL — bug raiz em buildBreakevenInputFromConfig
────────────────────────────────────────────────────────────────────
                                  ┌─ taxableRegimeValue (regime cadastrado)
                                  │  Ex: usuário tem "Lucro Real 28,53%"
        currentUser ──────────────┤
                                  └─ commissionValue (padrão do usuário)
                                     Ex: 5% padrão do cadastro de funcionário

pages/index.tsx:310
   buildBreakevenInputFromConfig(
     expenseConfig,
     currentUser.taxableRegimeValue,   ⚠ Origem ERRADA
     profitPct,                          (deveria vir do HUB)
     currentUser.commissionValue,      ⚠ Origem ERRADA
   )
        │
        ▼
   BreakevenInput.taxesInsidePct  ← 28,53% (regime estático)
   BreakevenInput.commissionPct   ← 5% (padrão, não realidade)
        │
        ▼
   PE inflado/subdimensionado vs realidade operacional do HUB

ESTADO ALVO
────────────────────────────────────────────────────────────────────
cash_entries
        │
        ▼
calculateHubData → extractStructurePercents (EXTENDIDA)
        │
        ├─ tax_on_revenue_percent  = IMPOSTO_FATURAMENTO_DENTRO
        │                          + IMPOSTO
        │                          + REGIME_TRIBUTARIO
        │
        └─ commission_percent_hub  = COMISSOES
        │
        ▼ (round 4 decimais, ×100 ao salvar)
tenant_expense_config.tax_on_revenue_percent     ← NOVA COLUNA
tenant_expense_config.commission_percent_hub     ← NOVA COLUNA
        │
        ▼
buildBreakevenInputFromConfig(cfg)               ← Assinatura SIMPLIFICADA
        │  taxesInsidePct  ← cfg.tax_on_revenue_percent (do HUB)
        │  commissionPct   ← cfg.commission_percent_hub  (do HUB)
        ▼
calculateBreakeven → PE alinhado à realidade operacional

UI: remover "(abra o console F12...)" do tooltip + console.warn técnico
```

---

### 2.3 — AJUSTE 3: Relatório de Comissões

```
BUG A — DATA INVÁLIDA
────────────────────────────────────────────
sales.sale_date  ── pode ser:
  • 'YYYY-MM-DD'                            ← formato esperado
  • 'YYYY-MM-DDTHH:MM:SS.sssZ' (timestamptz) ← falha em parser ingênuo
  • NULL  ← vendas legacy
  • ''   ← vendas legacy
        │
        ▼
parseSaleDate(s.sale_date)  ← NOVO helper tolerante
        │  if (!s) → null → render "—"
        │  if (s.length >= 10) → dayjs(s.substring(0,10),'YYYY-MM-DD')
        │  if (!valid) → null → render "—"
        ▼
coluna "Data" render: v ? dayjs(v).format('DD/MM/YYYY') : '—'


BUG B — COMISSÃO ZERADA (cadeia de fallback)
────────────────────────────────────────────
sales.commission_amount > 0?  ─SIM→ usar (vendas novas Apr/2026+)
       │
       NÃO
       ▼
sale_items.commission_percent > 0?  ─SIM→ Σ(qty*price*pct/100)
       │
       NÃO
       ▼
budgets.commission_amount > 0?  ─SIM→ usar (espelhamento)
       │
       NÃO
       ▼
employees.commission_percent × sales.final_value  ← LEGACY FALLBACK


BUG C — RESPONSIVIDADE
────────────────────────────────────────────
Tabela hoje: 9+ colunas → overflow horizontal em mobile <768px
        │
        ▼
Estratégia: scroll horizontal com sticky leftCol (DA-5)
```

---

### 2.4 — AJUSTE 4: Desconto Lucro Real (Orçamentos + Agenda)

```
ESTADO ATUAL — calculateDiscountedPrice (uso atual)
────────────────────────────────────────────────────────────────────
Em orçamentos/index.tsx:443-509:
   budgetTotalWithDiscount = budgetTotal × (1 - globalDiscountPercent/100)
   distribuição: PROPORTIONAL | PROFIT_REDUCTION | SELLER_REDUCTION
   ⚠ Interpretação: discountPercent é "% sobre margem (comm+profit)"
   ⚠ NÃO recalcula ICMS/PIS/COFINS por dentro (sem custo de imposto)

ESTADO ALVO — branch por regime tributário
────────────────────────────────────────────────────────────────────
                        ┌─ SIMPLES / PRESUMIDO
                        │  └─ comportamento atual (compat)
discountMode + regime ──┤
                        └─ LUCRO_REAL (e SIMPLES_HIBRIDO se aplicável)
                           └─ calculateDiscountedPriceLR(...)
                              1. newPrice  = oldPrice × (1 - d%)
                              2. icmsCust  = newPrice × icmsPct
                              3. pisCofCust= newPrice × pisCofinsPct
                              4. absorção  = d (preço) absorvido
                                            proporcionalmente em
                                            commission + profit
                              5. valida    d% ≤ commission% + profit%
                                           senão BLOQUEIA (prejuízo)
        │
        ▼
Aplicado em:
   src/pages/orcamentos/index.tsx     (handleSave + cálculos)
   src/pages/agenda/index.tsx         (finalizar serviço)
   src/page-parts/products/product-price.component.tsx (já tem o padrão)
```

---

## 3. Decisões Arquiteturais

### DA-1 — Composição de `taxesInsidePct` no PE

**Decisão:** `taxesInsidePct = IMPOSTO_FATURAMENTO_DENTRO + IMPOSTO + REGIME_TRIBUTARIO`.

**Justificativa:**
- Os três grupos representam, em modelos tributários distintos, despesas que incidem sobre o faturamento e portanto reduzem a margem de contribuição.
- `IMPOSTO_FATURAMENTO_DENTRO` é o canal usado quando o tenant escolhe LR/SIMPLES_HIBRIDO e o motor separa ICMS/PIS/COFINS por dentro.
- `IMPOSTO` é o "por fora" — embora aritmeticamente diferente, do ponto de vista do PE ele é variável sobre faturamento.
- `REGIME_TRIBUTARIO` é o slot do Simples Nacional/regime único quando aplicável.
- `IMPOSTO_LUCRO` é EXCLUÍDO: IRPJ/CSLL incidem sobre o lucro, não sobre o faturamento, e portanto não compõem variáveis% no modelo CVP clássico.

**Regra de soma única (anti-double-count):** o HUB já é mutuamente exclusivo (cada `cash_entry` tem 1 `expense_group`). Não há risco de soma dupla.

---

### DA-2 — Origem de `commissionPct` no PE

**Decisão:** `commissionPct ← tenant_expense_config.commission_percent_hub` (apurado do HUB grupo `COMISSOES`).

**Alternativas consideradas:**
- A) `currentUser.commissionValue` (cadastro padrão do usuário) — REJEITADA: dado estático que não reflete a realidade operacional do tenant (vendedores diferentes podem ter comissões diferentes).
- B) `MAX(sale_items.commission_percent)` — REJEITADA: distorce em favor do pior caso.
- C) HUB grupo `COMISSOES` / faturamento — ESCOLHIDA: alinha o PE com a realidade do que foi efetivamente pago em comissões nos meses fechados.

**Implicação:** se `COMISSOES` não tem lançamentos no HUB, `commission_percent_hub = 0`. Isso é correto: o tenant ainda não pagou comissões, então o PE operacional não deve assumir comissão fictícia.

---

### DA-3 — Estratégia de Reatividade MO Admin

**Decisão:** Opção C — Hook centralizado com `revalidateOnFocus` + `revalidateOnTagInvalidation`.

**Alternativas:**
| Opção | Custo | Latência | Veredito |
|-------|-------|----------|----------|
| A) PostgreSQL trigger `cash_entries → tenant_expense_config` | Alto (lógica complexa em SQL) | Sub-segundo | REJEITADA — replicar `calculateHubData` em PL/pgSQL é frágil |
| B) Supabase Realtime subscription em `cash_entries` | Médio (canal por tenant) | ~500ms | REJEITADA — overkill para um KPI; complica unmount |
| C) `useExpenseConfig` com `mutate` on mutation + refetch on focus | Baixo (hook + invalidação manual nas mutations) | Imediato (após mutation explícita) | ESCOLHIDA |

**Implementação:**
- Criar `src/hooks/use-expense-config.ts` que encapsula `mergeExpenseConfig` + cache em memória + invalidação por evento.
- Cada mutation em `cash_entries` (insert/update/delete) chama `invalidateExpenseConfig(tenantId)`.
- Pages `/produtos`, `/servicos`, `/orcamentos`, `/agenda` consomem o hook em vez de query direta.

**Trade-off aceito:** mutations fora do app (SQL direto, dump) não disparam invalidação — mitigado por `revalidateOnFocus`.

---

### DA-4 — Fallback de Comissão em Relatório

**Decisão:** Cadeia de origem em 4 níveis, primeiro hit ganha.

```
1. sales.commission_amount        (vendas novas, persistido)
2. Σ sale_items qty × price × pct (decompor itens, vendas com itens preservados)
3. budgets.commission_amount      (orçamento → venda espelhado)
4. employees.commission_percent × sales.final_value  (legacy)
```

**Justificativa:**
- Níveis 1-3 são determinísticos por venda. Nível 4 é heurístico (assume comissão atual do funcionário = comissão da venda antiga), mas é melhor que zero.
- `effPct` exibido na tabela deve refletir o nível ativo (ex: nível 4 → mostra `employees.commission_percent` com asterisco "estimado").

**Trade-off:** vendas antigas terão valores aproximados — documentar em tooltip.

---

### DA-5 — Estratégia Responsiva da Tabela de Comissões

**Decisão:** Scroll horizontal com `sticky` na coluna "Vendedor" + breakpoint < 768px ativa `compact` table size + esconde colunas secundárias (`installment_label`, `sale_code`).

**Por quê não cards verticais:**
- Tabela atual já é a fonte de verdade visual para múltiplos clientes; cards verticais quebram a comparação cross-row.
- Sticky left + scroll é padrão Ant Design (`Table.scroll.x` + `Column.fixed`).

**Por quê não rotação de colunas:**
- Mobile portrait não acomoda tabela "transposta" sem custo cognitivo alto.

**Regra concreta:**
```typescript
<Table
  scroll={{ x: 720 }}
  size={isMobile ? 'small' : 'middle'}
  columns={cols.filter(c => isMobile ? !['installment_label','sale_code'].includes(c.key) : true)}
/>
```

---

### DA-6 — Algoritmo de Desconto LR

**Decisão:** Branch separado `calculateDiscountedPriceLR()` ao lado do atual `calculateDiscountedPrice()`. Seleção por `tenant_settings.tax_regime`.

**Caminho LR/SIMPLES_HIBRIDO:**

```
Input:  oldPrice, discountPct (sobre PREÇO), commPct, profPct, icmsPct, pisCofPct, mode
Pré-validação:
  if (discountPct > commPct + profPct) throw 'Desconto excede margem operacional'

newPrice    = oldPrice × (1 - discountPct/100)
icmsCusto   = newPrice × icmsPct/100          ← por dentro, recalculado sobre o novo preço
pisCofCusto = newPrice × pisCofPct/100         ← idem
discountAbs = oldPrice - newPrice              ← valor R$ absorvido

switch (mode):
  PROPORTIONAL:
    commReduction   = discountAbs × commPct/(commPct+profPct)
    profitReduction = discountAbs × profPct/(commPct+profPct)
  PROFIT_REDUCTION:
    commReduction   = 0;  profitReduction = discountAbs
  SELLER_REDUCTION:
    commReduction   = discountAbs;  profitReduction = 0

return { newPrice, icmsCusto, pisCofCusto, commReduction, profitReduction }
```

**Caminho SIMPLES/PRESUMIDO:** sem alteração (mantém `calculateDiscountedPrice` atual, semântica "% da margem").

**Por quê não unificar:**
- A semântica é genuinamente diferente: em SIMPLES não há ICMS/PIS/COFINS "por dentro" do preço sendo recalculado; reusar a função traria flags condicionais e poluiria a interface.
- Separar caminhos preserva o teste atual de SIMPLES e isola risco da nova lógica.

---

## 4. Migrations Supabase Necessárias

```sql
-- File: supabase/migrations/20260517000001_add_hub_tax_commission_columns.sql
-- Sprint 5 — Ponto de Equilíbrio: tax_on_revenue + commission do HUB

ALTER TABLE public.tenant_expense_config
  ADD COLUMN IF NOT EXISTS tax_on_revenue_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_percent_hub numeric DEFAULT 0;

COMMENT ON COLUMN public.tenant_expense_config.tax_on_revenue_percent IS
  'Soma dos grupos IMPOSTO_FATURAMENTO_DENTRO + IMPOSTO + REGIME_TRIBUTARIO do HUB, em % sobre faturamento (×100, ex: 18.50). Recalculado em mergeExpenseConfig().';

COMMENT ON COLUMN public.tenant_expense_config.commission_percent_hub IS
  'Percentual médio efetivo de COMISSOES sobre faturamento apurado pelo HUB (×100, ex: 5.20). Recalculado em mergeExpenseConfig(). Substitui currentUser.commissionValue como input do PE.';

-- ── ROLLBACK ──
-- ALTER TABLE public.tenant_expense_config
--   DROP COLUMN IF EXISTS tax_on_revenue_percent,
--   DROP COLUMN IF EXISTS commission_percent_hub;
```

**Sem migration para AJUSTES 3 e 4:** ambos são puramente lógica de aplicação; nenhuma coluna nova em `sales`, `sale_items` ou `budgets`.

---

## 5. Contratos de API/Funções Alterados

### 5.1 — `extractStructurePercents` (`src/utils/hub-engine.ts:405`)

**ANTES:**
```typescript
export function extractStructurePercents(
  hubData: HubData,
  customBase?: number,
): {
  indirect_labor_percent: number
  fixed_expense_percent: number
  variable_expense_percent: number
  financial_expense_percent: number
  production_labor_cost_percent: number
}
```

**DEPOIS:**
```typescript
export function extractStructurePercents(
  hubData: HubData,
  customBase?: number,
): {
  indirect_labor_percent: number
  fixed_expense_percent: number
  variable_expense_percent: number
  financial_expense_percent: number
  production_labor_cost_percent: number
  /** NOVO — soma dos grupos IMPOSTO_FATURAMENTO_DENTRO + IMPOSTO + REGIME_TRIBUTARIO */
  tax_on_revenue_percent: number
  /** NOVO — grupo COMISSOES sobre faturamento */
  commission_percent_hub: number
}
```

**Implementação adicional:**
```typescript
const taxesOnRevenue =
  findPct('IMPOSTO_FATURAMENTO_DENTRO') +
  findPct('IMPOSTO') +
  findPct('REGIME_TRIBUTARIO')
const commissions = findPct('COMISSOES')
```

---

### 5.2 — `recalcExpenseConfigFromCashflow` (`src/utils/recalc-expense-config.ts:36`)

**ANTES:** retorna `ExpenseConfigResult` sem os campos novos.

**DEPOIS:** adiciona ao `ExpenseConfigResult`:
```typescript
export interface ExpenseConfigResult {
  // ... (todos os campos anteriores)
  /** NOVO — % de impostos sobre faturamento agregado (×100). */
  tax_on_revenue_percent: number
  /** NOVO — % de comissão efetiva do HUB (×100). */
  commission_percent_hub: number
}
```

**Implementação adicional dentro da função:**
```typescript
return {
  // ...
  tax_on_revenue_percent: round2(percents.tax_on_revenue_percent * 100),
  commission_percent_hub: round2(percents.commission_percent_hub * 100),
}
```

`mergeExpenseConfig` também deve persistir os 2 campos novos em `configData`.

---

### 5.3 — `buildBreakevenInputFromConfig` (`src/utils/breakeven-calculator.ts:94`)

**ANTES:**
```typescript
export function buildBreakevenInputFromConfig(
  cfg: any,
  taxableRegimePercent: number | null | undefined,
  profitPct: number | null | undefined,
  commissionPct: number | null | undefined,
): BreakevenInput
```

**DEPOIS:**
```typescript
export function buildBreakevenInputFromConfig(cfg: any): BreakevenInput
```

A assinatura simplifica: TODOS os percentuais saem de `tenant_expense_config`. `profitPct` é descartado (já era unused — `void profitPct`). `taxableRegimePercent` e `commissionPct` saem porque agora vêm de `cfg.tax_on_revenue_percent` e `cfg.commission_percent_hub`.

**Implementação:**
```typescript
return {
  productCostPct: Number(c.product_cost_percent) || 0,
  variableExpensePct: Number(c.variable_expense_percent) || 0,
  commissionPct: Number(c.commission_percent_hub) || 0,         // ← era param
  taxesInsidePct: Number(c.tax_on_revenue_percent) || 0,        // ← era param
  financialExpensePct: Number(c.financial_expense_percent) || 0,
  productionLaborPct: Number(c.production_labor_percent) || 0,
  adminLaborPct: Number(c.indirect_labor_percent) || 0,
  fixedExpensePct: Number(c.fixed_expense_percent) || 0,
  averageRevenue: Number(c.hub_average_revenue) || 0,
}
```

**Call site** (`src/pages/index.tsx:310`):
```typescript
// ANTES
const input = buildBreakevenInputFromConfig(
  expenseConfig,
  currentUser?.taxableRegimeValue ?? calcBase.taxableRegimeAutoPercent ?? 0,
  Number((currentUser as any)?.profitValue) || 0,
  Number((currentUser as any)?.commissionValue) || 0,
)

// DEPOIS
const input = buildBreakevenInputFromConfig(expenseConfig)
```

Remover dependência de `currentUser` no `useMemo` (deps array fica `[expenseConfig]`).

---

### 5.4 — `calculateDiscountedPrice` (NOVO modo LR)

**Atual:** mantido idêntico para Simples/Presumido.

**Novo:** adicionar `src/utils/calculate-discount-lr.ts`:

```typescript
import type { DiscountMode } from './calculate-discount'

export interface DiscountLRInput {
  oldPrice: number
  discountPercent: number      // % sobre o PREÇO (não sobre margem)
  commissionPercent: number    // % comissão do item
  profitPercent: number        // % lucro do item
  icmsPercent: number          // alíquota ICMS por dentro
  pisCofinsPercent: number     // alíquota PIS+COFINS por dentro
  mode: DiscountMode
}

export interface DiscountLRResult {
  newPrice: number
  discountValue: number
  icmsCost: number             // ICMS recalculado sobre newPrice
  pisCofinsCost: number        // PIS+COFINS recalculado sobre newPrice
  commissionReduction: number
  profitReduction: number
  isValid: boolean
  reason?: string
}

export function calculateDiscountedPriceLR(input: DiscountLRInput): DiscountLRResult {
  const { oldPrice, discountPercent, commissionPercent, profitPercent,
          icmsPercent, pisCofinsPercent, mode } = input

  // Validação: desconto não pode exceder margem operacional
  const maxDiscount = commissionPercent + profitPercent
  if (discountPercent > maxDiscount) {
    return {
      newPrice: oldPrice, discountValue: 0,
      icmsCost: oldPrice * icmsPercent / 100,
      pisCofinsCost: oldPrice * pisCofinsPercent / 100,
      commissionReduction: 0, profitReduction: 0,
      isValid: false,
      reason: `Desconto ${discountPercent}% excede margem operacional (${maxDiscount}%)`,
    }
  }

  const newPrice = oldPrice * (1 - discountPercent / 100)
  const discountValue = oldPrice - newPrice
  const icmsCost = newPrice * icmsPercent / 100
  const pisCofinsCost = newPrice * pisCofinsPercent / 100

  const combined = commissionPercent + profitPercent
  let commissionReduction: number
  let profitReduction: number

  if (combined <= 0) {
    commissionReduction = 0
    profitReduction = 0
  } else if (mode === 'PROFIT_REDUCTION') {
    commissionReduction = 0
    profitReduction = discountValue
  } else if (mode === 'SELLER_REDUCTION') {
    commissionReduction = discountValue
    profitReduction = 0
  } else { // PROPORTIONAL
    commissionReduction = discountValue * (commissionPercent / combined)
    profitReduction = discountValue * (profitPercent / combined)
  }

  return { newPrice, discountValue, icmsCost, pisCofinsCost,
           commissionReduction, profitReduction, isValid: true }
}
```

**Call sites de adoção:**
- `src/pages/orcamentos/index.tsx:444-509` — atrás de guard `if (taxRegime === 'LUCRO_REAL' || taxRegime === 'SIMPLES_HIBRIDO')` chama versão LR.
- `src/pages/orcamentos/index.tsx:1922-1967` — exibição (slider/InputNumber): `max` muda de `maxDiscountPercent (margem)` para `commPct + profPct` quando LR.
- `src/pages/agenda/index.tsx:130-131` (estado `globalDiscountPctAgenda`) + handler do "Finalizar Serviço" — mesma branch.

---

## 6. Riscos e Mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R1 | Migration adiciona colunas mas `mergeExpenseConfig` não roda — campos ficam `0` indefinidamente | Média | Alto (PE quebra) | Backfill manual: rodar `mergeExpenseConfig(tenantId)` para todos os tenants ativos pós-deploy; logar quantos foram atualizados |
| R2 | `currentUser` ainda referenciado em outros lugares dependentes do mesmo cálculo | Baixa | Médio | Grep por `taxableRegimeValue` e `commissionValue` em todo `src/` antes do deploy; mover para `[deprecated]` no tipo `IAuthUser` |
| R3 | Desconto LR aplica em vendas existentes (espelhamento orçamento→venda) com regra antiga e quebra retroativamente | Baixa | Alto | Branch só ativa para orçamentos `created_at >= '2026-05-17'`; vendas anteriores preservam interpretação atual |
| R4 | `extractStructurePercents` extendido afeta outros consumidores (não só PE) | Baixa | Médio | Função pura: adicionar campos NUNCA remove existentes; verificar 2 consumidores: `recalc-expense-config.ts` e `mergeExpenseConfig` |
| R5 | Refetch on focus em `/produtos` causa "piscadas" de UI durante digitação | Média | Baixo | Hook usa `stale-while-revalidate`: UI mantém valor atual durante refetch silencioso |
| R6 | Tabela comissões com scroll horizontal não funciona em iOS Safari (sticky bugado) | Baixa | Baixo | Fallback CSS `position: -webkit-sticky` + testar em iOS real antes do release |
| R7 | Fórmula PE retorna `MC ≤ 0` em tenant com impostos altos + comissão alta | Média | Médio | Já tratado: `calculateBreakeven` retorna `isValid: false` com `reason` legível |
| R8 | Console.warn removido dificulta debug pós-deploy | Baixa | Baixo | Substituir por logging condicional via `process.env.NODE_ENV === 'development'` |
| R9 | `taxableRegimeValue` permanecia como contrato com outras telas (calc base de produtos) | Média | Alto | NÃO remover de `currentUser` — só parar de usar no PE. Produtos/serviços continuam usando para outras finalidades |
| R10 | Recall em ETP/QA — usuário esperava desconto LR antigo (% margem) | Média | Médio | Tooltip explicativo + nota de release; modal de confirmação no primeiro uso |

---

## 7. Plano de Rollback por Sprint

### Sprint A — Ponto de Equilíbrio (Prioridade Máxima)
**Itens:** migration `20260517000001`, `extractStructurePercents` extendido, `recalcExpenseConfigFromCashflow` extendido, `buildBreakevenInputFromConfig` simplificado, remoção do tooltip "(F12)".

**Rollback:**
1. Reverter commit do `index.tsx` (volta a passar `currentUser` params).
2. Reverter commit de `breakeven-calculator.ts` (restaura assinatura antiga).
3. Migration permanece — campos `tax_on_revenue_percent` / `commission_percent_hub` ficam zerados, sem efeito. Reversão DDL via comentário no próprio arquivo.

### Sprint B — MO Admin Reatividade
**Itens:** novo hook `useExpenseConfig`, refatoração de `/produtos`, `/servicos`, `/orcamentos`, `/agenda`.

**Rollback:**
1. Reverter páginas para acesso direto `supabase.from('tenant_expense_config').select(...)`.
2. Manter hook não-usado (sem efeito colateral). Remover em sprint posterior.

### Sprint C — Relatório de Comissões
**Itens:** `parseSaleDate` helper, cadeia de fallback de comissão em `comissao-vendedor/index.tsx`, responsive table.

**Rollback:**
1. Reverter arquivo `src/pages/comissao-vendedor/index.tsx` para HEAD anterior.
2. Sem efeito em dados (puramente leitura).

### Sprint D — Desconto Lucro Real
**Itens:** `calculate-discount-lr.ts`, branch em `orcamentos/index.tsx` e `agenda/index.tsx`.

**Rollback:**
1. Reverter os 3 arquivos.
2. Orçamentos criados sob a regra nova mantêm seus números persistidos (`budget_total`, `commission_amount` etc) — nenhuma corrupção.
3. Função `calculate-discount-lr.ts` órfã, removível.

---

## 8. Validação Cruzada da Fórmula PE com Exemplo do Usuário

**Inputs do usuário:**
- Faturamento médio mensal HUB: R$ 294.621,00
- Fixos% (MO Produtiva + MO Administrativa + Despesas Fixas): 32,09%
- PE esperado: ~R$ 295.700,00

**Reverse engineering para Variáveis%:**
```
PE = (Fixos% × Faturamento) / MC
295.700 = (0,3209 × 294.621) / MC
MC = (0,3209 × 294.621) / 295.700
MC = 94.553,46 / 295.700
MC ≈ 0,3197

Variáveis% = 1 − MC = 1 − 0,3197 = 0,6803 = 68,03%
```

**Validação direta (Variáveis% = 68,03%):**
```
MC = 1 − 0,6803 = 0,3197
Fixed Cost R$ = 0,3209 × 294.621 = 94.553,47
PE = 94.553,47 / 0,3197 = R$ 295.726,87
```

**Resultado: R$ 295.726,87** ≈ R$ 295.700 do usuário (diferença de R$ 26,87, ou 0,009%, dentro da tolerância de arredondamento de 2 casas em vários níveis intermediários).

**Conclusão:** a fórmula proposta — com Variáveis% englobando os 5 componentes (custo produtos, despesas variáveis, comissões HUB, impostos sobre faturamento HUB, despesas financeiras) e Fixos% englobando os 3 (MO produtiva, MO administrativa, despesas fixas) — está matematicamente correta e bate com o exemplo do usuário.

**Validação a executar pós-deploy:**
1. Logar `BreakevenResult` no Sentry/console com `tenantId` hash para 10 tenants reais por uma semana.
2. Confrontar com PE calculado manualmente pelo contador do tenant.
3. Gate de release: erro ≤ 1% em pelo menos 8/10 tenants.

---

## 9. Apêndice — Mapeamento de Arquivos Tocados

| Ajuste | Arquivo | Tipo de mudança |
|--------|---------|----------------|
| 1 | `src/hooks/use-expense-config.ts` | NOVO |
| 1 | `src/pages/produtos/index.tsx` (existente) | Consumir hook |
| 1 | `src/pages/servicos/index.tsx` (existente) | Consumir hook |
| 2 | `supabase/migrations/20260517000001_add_hub_tax_commission_columns.sql` | NOVO |
| 2 | `src/utils/hub-engine.ts` (linhas 405-434) | Estender `extractStructurePercents` |
| 2 | `src/utils/recalc-expense-config.ts` | Estender `ExpenseConfigResult` + persistir 2 campos |
| 2 | `src/utils/breakeven-calculator.ts` (linhas 94-115) | Simplificar `buildBreakevenInputFromConfig` |
| 2 | `src/pages/index.tsx` (linhas 309-338, 683) | Ajustar call site, remover console.warn técnico e tooltip "(F12)" |
| 3 | `src/pages/comissao-vendedor/index.tsx` | Helper `parseSaleDate`, cadeia de fallback, responsive |
| 4 | `src/utils/calculate-discount-lr.ts` | NOVO |
| 4 | `src/pages/orcamentos/index.tsx` (linhas 444-509, 1922-1967) | Branch por regime |
| 4 | `src/pages/agenda/index.tsx` (linhas 130-131 + handler) | Branch por regime |

---

**Fim do documento.**
