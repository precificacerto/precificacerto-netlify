# ADR-011: Cadeia de Resolução de Custo do Produto (Product Cost Resolution Chain)

**Status:** ACCEPTED
**Data:** 2026-05-24
**Author:** @architect Aria
**Decididores:** @architect Aria (arquitetura), @pm Morgan (PRD EPIC-MRM-V8 v1.0), Hyago (Founder — reportou em 2026-05-24 que DRE Consolidada exibe Custo do Produto = R$ 0,00 mesmo após V7)
**Contexto:** Pós Epic MRM-V7 (`MRM_ENGINE_VERSION = 2.3.0` inalterado) — Epic EPIC-MRM-V8-PRODUCT-COST-SOURCE
**Engine baseline:** `MRM_ENGINE_VERSION = 2.3.0` (V7 em produção)
**Engine alvo:** **inalterado** — `2.3.0` permanece. Esta ADR opera estritamente na fronteira de **leitura de custo a montante** (`resolveProductCostTotal`), não no motor RR.

---

## 1. Context

A DRE Consolidada exibe "Custo do produto: R$ 0,00" para o cenário canônico do user, mesmo após dois deploys de fix anteriores (`dec232b` MOD + `eddf6e4` fallback `pricing_calculations.cmv`). A investigação do schema Supabase revelou que **três fontes distintas** de custo coexistem em produtos do banco, com cobertura heterogênea conforme a "idade" e o fluxo de cadastro do produto:

### 1.1 As três fontes possíveis de custo

| Fonte | Tabela / Campo | Quando é populada | Cobertura em produção |
|-------|---------------|--------------------|----------------------|
| **F1 — Itens do produto** | `product_items.item_cost_net` (e companion `quantity_needed`) | Toda vez que o user adiciona uma linha na tabela "Itens" do cadastro de produto. Já vem **multiplicado pela quantidade da linha** (custo líquido total da linha, não unitário). | **Universal** entre produtos cadastrados via UI atual — é o que a tela do cadastro lê e soma para exibir o "Custo Total do Produto". |
| **F2 — Custo agregado persistido** | `products.cost_total` (e `services.cost_total`) | Quando o motor de precificação grava o cadastro após `*-pricing/save`. Snapshot do custo total já consolidado. | **Apenas produtos modernos** que passaram por `save` recente. Produtos legados, importados ou nunca recalculados ficam com `cost_total = 0`. |
| **F3 — CMV unitário canônico** | `pricing_calculations.cmv` (CMV por unidade já calculado pelo motor) + `pricing_calculations.total_labor_net` (mão de obra agregada) | Quando o motor de precificação roda o pipeline completo e grava `pricing_calculations`. Inclui MO. | **Apenas produtos que rodaram o motor** com sucesso. Vazia para produtos novos sem precificação rodada, ou produtos antigos importados. |

**Cenário canônico do user (Hyago, 2026-05-24) — produto "PVC":**

| Fonte | Valor encontrado |
|-------|------------------|
| F1 `SUM(product_items.item_cost_net)` | **R$ 39.929,94** (1 linha de item PVC) |
| F1 `pricing_calculations.total_labor_net` | **R$ 2.716,00** (5.000 min de MO) |
| F1 (total esperado) | **R$ 42.645,94** ← bate com a tela do cadastro |
| F2 `products.cost_total` | **R$ 0,00** ← produto legado |
| F3 `pricing_calculations.cmv` | **0** (objeto existe mas CMV nunca foi persistido) |

A cadeia de fallback atual (`cost_total > cmv > 0`, V7) cai direto no zero porque ignora F1. Por isso a DRE mostra R$ 0,00.

### 1.2 Pergunta arquitetural a responder

> **Qual fonte deve ser consultada primeiro quando o produto tem múltiplas fontes ou nenhuma das esperadas?**

Hoje a resposta tácita ("`cost_total` primeiro") foi otimizada para produtos novos, mas falha para o caso real do user (produto cujos itens estão cadastrados mas `cost_total` nunca foi persistido). É preciso uma cadeia que cubra **todas as gerações de produtos** sem regredir o caso já funcional.

---

## 2. Decision

**Adotar uma cadeia de fallback canônica em 5 níveis no helper `resolveProductCostTotal(product, pricingCalc)`**, priorizando a fonte mais próxima do que o user vê na tela do cadastro:

```text
Nível 1 (REAL — caso user)
  IF product.product_items.length > 0 AND SUM(item_cost_net) > 0:
    custo = (SUM(product_items.item_cost_net) + (pricingCalc?.total_labor_net ?? 0))
            / (product.yield_quantity ?? 1)

Nível 2 (MODERNO — produto recalculado)
  ELSE IF product.cost_total > 0:
    custo = product.cost_total

Nível 3 (CMV CANÔNICO — motor rodou)
  ELSE IF pricingCalc?.cmv > 0:
    custo = pricingCalc.cmv

Nível 4 (FALLBACK AGREGADO — motor parcial)
  ELSE IF (pricingCalc?.total_material_cost_net ?? 0) + (pricingCalc?.total_labor_net ?? 0) > 0:
    custo = ((pricingCalc.total_material_cost_net ?? 0) + (pricingCalc.total_labor_net ?? 0))
            / (product.yield_quantity ?? 1)

Nível 5 (ZERO LEGÍTIMO)
  ELSE:
    custo = 0  // produto realmente sem custo cadastrado
```

### 2.1 Frase-chave de governança

> **"A cadeia de resolução de custo prioriza o que o user vê na tela do cadastro do produto. `product_items` é a fonte mais próxima da realidade do usuário; os demais níveis são otimizações para produtos que já passaram pelo motor de precificação."**

### 2.2 Por que esta ordem (justificativa por nível)

| Nível | Justificativa |
|-------|---------------|
| **1** | É a única fonte que reflete **exatamente** o que o user enxerga e cadastra na tela "Itens do Produto". Cobre produtos legados, importados e novos antes do primeiro `save`. |
| **2** | Snapshot do `*-pricing/save` — confiável quando existe, mantém compat total com produtos modernos (zero regressão). |
| **3** | Saída canônica do motor de precificação — disponível quando o user rodou cálculo completo mas não persistiu items custom. |
| **4** | Robustez extra: se o motor populou parcialmente (apenas componentes agregados, sem `cmv` unitário), ainda conseguimos derivar custo. Defesa em profundidade. |
| **5** | Comportamento legítimo: produto sem nenhuma fonte de custo retorna 0 explicitamente (não é bug, é estado válido — produto recém-criado vazio). |

---

## 3. Implementation notes

### 3.1 Semântica de `product_items.item_cost_net`

`item_cost_net` é o **custo líquido TOTAL da linha de item**, já incluindo a multiplicação por `quantity_needed` daquela linha. Ou seja: a fórmula da tela é `SUM(item_cost_net)` **direto**, sem multiplicar de novo por quantidade.

> **Exemplo do user:** linha PVC com `quantity_needed = 50.000`, `unit_cost_net ≈ R$ 0,7986`, `item_cost_net = R$ 39.929,94`. A coluna `item_cost_net` já é o produto `0,7986 × 50.000`.

### 3.2 Divisão por `yield_quantity` (custo por unidade de produto)

O custo agregado em F1/F4 representa o custo total do **lote produzido** pelo produto (yield). Para obter custo **por unidade de produto vendida** (semântica esperada pela DRE), dividir por `products.yield_quantity`:

```text
custoUnitario = custoTotalLote / yield_quantity
```

**Defesa em profundidade:** `yield_quantity` deve ser **clampado em 1** quando nulo, zero ou negativo:

```typescript
const yieldQty = Math.max(1, Number(product.yield_quantity) || 1)
```

Isso evita divisão por zero e cobre produtos legados que nunca preencheram `yield_quantity`. Para produtos sem lote (venda 1:1), `yield_quantity = 1` é o caso default — custo total = custo unitário.

### 3.3 SELECT em `useProducts` e `useServices`

Os dois hooks devem incluir explicitamente `product_items` no SELECT do Supabase:

```typescript
// useProducts e useServices
.select(`
  *,
  product_items (
    item_cost_net,
    quantity_needed
  )
`)
```

Impacto de payload: campos numéricos pequenos, JOIN simples por `product_id`. **Sem índice novo necessário** — `product_items.product_id` já é FK indexada.

### 3.4 Locais exatos das mudanças

| Arquivo | Mudança |
|---------|---------|
| `src/utils/resolveProductCostTotal.ts` (ou onde o helper vive) | Reescrever cadeia de fallback com 5 níveis conforme §2 |
| `src/hooks/useProducts.ts` | Adicionar `product_items(item_cost_net, quantity_needed)` ao SELECT |
| `src/hooks/useServices.ts` | Mesmo padrão de SELECT |
| 4 call-sites da DRE Consolidada (orçamentos + vendas balcão, em modos criação + edição) | Garantir que `resolveProductCostTotal(product, pricingCalc)` é chamado com **ambos os argumentos** (produto JOIN product_items + pricing_calculations correspondente) |

### 3.5 Types

Atualizar interface `Product` (ou tipo equivalente) para incluir array opcional `product_items?: ProductItem[]`. Tipo `ProductItem` mínimo:

```typescript
interface ProductItem {
  item_cost_net: number | null
  quantity_needed: number | null
}
```

---

## 4. Consequences

### 4.1 Positivas

- **Cobertura robusta de 3 gerações de produtos:** legados (só `product_items`), médios (`cost_total` persistido), modernos (motor rodado com `cmv`/`total_labor_net`). Nenhum produto fica órfão.
- **Bate com a tela do cadastro:** o user vê os mesmos R$ 42.645,94 na DRE que vê no card "Custo Total" do cadastro de produto. Elimina a divergência reportada.
- **Zero invenção (Constitution Artigo IV):** `product_items.item_cost_net` já existe no schema, é populado pelo fluxo de cadastro atual, e a tela do produto já o consome. Esta ADR apenas conecta esse mesmo dado à leitura da DRE.
- **Zero migration Supabase:** schema permanece inalterado. Apenas SELECT e helper mudam.
- **Não toca o motor RR:** `margin-reapuration.ts` permanece bit-exact. ADR-001/003/004/008/009/010 preservados integralmente.
- **Compatível com `cost_total > 0` existente:** Nível 2 garante que produtos modernos continuam usando o snapshot agregado sem regressão.

### 4.2 Negativas / Trade-offs

- **Payload do `useProducts` aumenta:** JOIN com `product_items` adiciona N linhas por produto. Mitigação: campos numéricos pequenos, impacto desprezível para tenants com até ~500 produtos × ~5 itens médios. Caso futuro com tenants grandes, considerar lazy-load por produto consultado.
- **Mais um nível de complexidade mental:** desenvolvedores precisam entender que o helper agora tem 5 níveis e que o argumento `pricingCalc` é necessário para Níveis 1 e 4. Mitigação: JSDoc detalhado + esta ADR referenciada no header do helper.

### 4.3 Neutras

- **`MRM_ENGINE_VERSION` permanece `2.3.0`.** Nenhuma mudança no motor justifica bump.
- **DRE Consolidada continua consumindo a mesma interface** (`resolveProductCostTotal`); apenas a implementação interna muda.
- **Snapshots fiscais persistidos (`*_items.tax_breakdown`) não são tocados.** ADR-003 (imutabilidade) preservado.

### 4.4 Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| CR1 | `yield_quantity` errado ou zero em produto legado → custo unitário inflado/zerado | MÉDIA | Clamp `Math.max(1, ...)` (§3.2) garante divisor mínimo de 1. Pior caso: produto sem yield retorna custo total como unitário — aceitável e seguro. |
| CR2 | `product_items` com `item_cost_net = null` em todas as linhas | BAIXA | Soma resulta em 0 → cai para Nível 2 (`cost_total`) automaticamente pela condição `SUM > 0`. |
| CR3 | `pricing_calculations` é array vazio OU `null` em vez de objeto | BAIXA | Optional chaining `pricingCalc?.total_labor_net ?? 0` em todos os acessos. Helper aceita `pricingCalc = null \| undefined`. |
| CR4 | Caller esquece de passar `pricingCalc` (chama com 1 arg) | BAIXA | Assinatura `pricingCalc?: PricingCalc` opcional. Sem pricingCalc, Nível 1 ainda funciona (sem MO), Nível 4 não dispara. Aceita degradação graciosa. |
| CR5 | Item PVC do user marcado como "deletado" lógico (soft delete) ainda aparece no SELECT | BAIXA | Adicionar `.eq('deleted_at', null)` no JOIN se aplicável (verificar schema durante implementação). |

---

## 5. Alternatives considered

### A — Forçar recálculo do motor de precificação na abertura do orçamento

- **Descrição:** Sempre que orçamento é aberto, disparar `*-pricing/recalculate` para o produto antes de exibir DRE, populando `pricing_calculations` e `cost_total`.
- **Veredito:** **REJEITADA.**
- **Por quê:**
  - **Viola ADR-003 (Snapshot fiscal invariante):** recalcular em orçamentos aprovados/done quebraria imutabilidade.
  - Latência adicional na abertura de cada orçamento (1 chamada extra ao motor por produto distinto).
  - Não resolve para produtos importados de versões antigas que nunca tiveram pipeline rodado e podem ter dados incompletos para o motor reapurar.
  - Side effects de recalculo automático são opaco para o user (UX confusa quando custo "muda sozinho").

### B — Migration Supabase para recalcular `cost_total` de todos os produtos legados

- **Descrição:** Job retroativo que itera todos os produtos com `cost_total = 0` e popula via `SUM(product_items.item_cost_net) + total_labor_net`.
- **Veredito:** **REJEITADA.**
- **Por quê:**
  - Custo operacional alto (migration em produção, tempo de execução, rollback complexo).
  - Risco de regressão fiscal: produtos cujo `cost_total = 0` é **legítimo** (sem itens) seriam pulados, mas produtos com `item_cost_net = 0` (item válido com custo zero) poderiam ter snapshot incorreto persistido.
  - Não resolve produtos criados **depois** da migration que ainda não passaram por `save` — bug volta no dia 1+.
  - Não-invasivo perde para invasivo neste caso: ADR-011 (alternativa C) resolve in-memory sem tocar dado persistido.

### C — Cadeia de fallback com priorização de `product_items` (ESCOLHIDA)

- **Descrição:** Reescrever `resolveProductCostTotal` para tentar `product_items` antes de `cost_total`, com fallback graceful. SELECT expandido para incluir o JOIN.
- **Veredito:** **ACEITA — esta ADR.**
- **Por quê:**
  - Resolve o caso real do user (Nível 1).
  - Preserva caso moderno (Nível 2 = `cost_total` continua sendo lido quando existe).
  - Zero migration, zero mudança no motor, zero invenção (`item_cost_net` já existe).
  - Custo de implementação minúsculo (PRD V8 estima ~2h30 totais em 3 stories).
  - Cobertura graceful de produtos futuros: novos produtos com itens funcionam **desde o dia 1** sem precisar rodar `save` antes.
  - Defesa em profundidade com 5 níveis cobre cenários patológicos (produto parcial, motor parcial, yield ausente).

---

## 6. Backward compatibility

### 6.1 Snapshots persistidos não tocados

- `*_items.tax_breakdown` (JSONB com snapshot fiscal do motor RR) **não é lido nem escrito** por esta ADR.
- `products.cost_total` **não é alterado** — apenas lido (Nível 2).
- `pricing_calculations` **não é alterado** — apenas lido (Níveis 1, 3, 4).
- ADR-003 (Snapshot fiscal invariante) preservado integralmente: nenhuma escrita em snapshot existente.

### 6.2 Comportamento por tipo de produto

| Categoria de produto | Nível resolvido | Comportamento vs hoje |
|----------------------|----------------|------------------------|
| Moderno com `cost_total > 0` (V7 fluxo feliz) | Nível 2 | **Inalterado** — continua retornando `cost_total` exatamente como hoje |
| Legado com itens mas sem `cost_total` (caso user) | Nível 1 | **CORRIGIDO** — passa a retornar soma de itens + MO, em vez de 0 |
| Pós-motor com `cmv > 0` mas sem `cost_total` | Nível 3 | **Inalterado** — fallback V7 (`pricing_calc.cmv`) continua funcionando |
| Sem nenhuma fonte (produto vazio recém-criado) | Nível 5 | **Inalterado** — retorna 0 (estado válido) |
| Novo produto criado pós-V8 | Nível 1 desde dia 1 | **MELHOR** — funcional imediatamente após adicionar primeira linha em `product_items`, sem precisar rodar `save` antes |

### 6.3 Callers existentes (`resolveProductCostTotal`)

- Assinatura aceita `pricingCalc?: PricingCalc` opcional → callers que ainda passam só `product` continuam funcionando (caem em Níveis 2 ou 5).
- Callers da DRE Consolidada **devem** passar ambos os argumentos para destravar Níveis 1 e 4 (decisão de implementação das 4 call-sites no STORY-V8-002).
- Tests V7 antigos que cobrem `cost_total > 0` continuam passando (Nível 2 inalterado).
- Tests V7 que assumem `cmv` como prioridade #2 precisam ser atualizados (passa a ser #3) — atualização explícita em STORY-V8-003.

---

## 7. Aria Sign-off

A causa raiz do bug "Custo do produto: R$ 0,00" é uma **lacuna de cobertura na cadeia de fallback** existente, não um bug do motor RR nem do schema Supabase. O dado correto (R$ 42.645,94) está populado em `product_items.item_cost_net` desde o momento em que o user cadastrou o item — apenas não estava sendo lido.

A correção é arquiteturalmente conservadora: adiciona um nível à cadeia de fallback (prioridade 1), expande dois SELECTs com JOIN barato, e preserva 100% do comportamento atual para produtos modernos. Zero migration, zero mudança no motor, zero impacto em snapshots persistidos.

O cenário real do user é o golden test (Nível 1 → R$ 42.645,94), e a cadeia em 5 níveis garante que produtos de qualquer geração tenham resposta correta sem regressão.

**Recomendação:** prosseguir com Epic V8 conforme PRD do Morgan. Veredito **APPROVED**.

**Aria, 2026-05-24**

---

## QA Review (Quinn, 2026-05-24)

**Veredito:** **APPROVED**

**Referência operacional:** [`docs/qa/QA-VALIDATION-EPIC-MRM-V8.md`](../qa/QA-VALIDATION-EPIC-MRM-V8.md) (v1.0, 2026-05-24).

1. **Cadeia de fallback em 5 níveis (§2) é determinística, auditável e implementável.** A ordem (`product_items` → `cost_total` → `cmv` → agregados parciais → 0) cobre as 3 gerações de produtos sem ambiguidade. Cada nível tem condição explícita de disparo (`SUM > 0`, `cost_total > 0`, `cmv > 0`) — sem zona cinza. QG-001 BLOCKING valida bit-exact o caminho Nível 1 (R$ 42.645,94 ± 0,01) e C2/C6 da matriz QA validam que Níveis 2 e fallback graceful continuam funcionando.

2. **Implementation notes §3 endereçam os 3 pontos críticos de execução:** semântica de `item_cost_net` (TOTAL da linha, não unitário — risco de duplicação se Dev multiplicar novamente por `quantity_needed`), clamp `Math.max(1, yield_quantity)` (risco CR1 de divisão por zero), e expansão de SELECT em `useProducts`/`useServices` (sem isso, Nível 1 nunca dispara). Os 4 call-sites em §3.4 estão mapeados — QG-003 NON-BLOCKING valida consistência.

3. **Backward Compatibility (§6) garante zero impacto em snapshots persistidos e ADRs anteriores.** ADR-001 (single source of truth do motor), ADR-003 (snapshot fiscal invariante), ADR-010 (separação Display vs Fiscal) preservados integralmente. `MRM_ENGINE_VERSION = 2.3.0` inalterado. Produtos modernos com `cost_total > 0` permanecem em Nível 2 (zero regressão fluxo feliz V7). Riscos CR1-CR5 cobertos por clamp + optional chaining + condições explícitas de SUM.

**Quinn, 2026-05-24** — APPROVED. ADR-011 ACCEPTED arquiteturalmente E operacionalmente. Pode prosseguir para Dev.

---

## Addendum V8.6 — Productive Labor Runtime Fallback (Aria, 2026-05-23)

**Status:** PATCH — extende a cadeia de fallback de **labor** (MOD) sem alterar a cadeia principal de custo de produto (§2). Cobre o cenario residual onde `pricing_calculations` foi gravado mas `product_workload_price` permaneceu `null` (engine nunca re-executou apos cadastro).

### 1. Nova cadeia de fallback para MOD (5 niveis)

```
Nivel 1: labor_costs.net_value                          (do banco — V8.1)
Nivel 2: pricing_calculations.product_workload_price     (do banco — V8.3)
Nivel 3: pricing_calculations.total_labor_net            (do banco — V8.4)
Nivel 4: RUNTIME calculation                             ← NOVO (V8.6)
         = product_workload × (production_labor_cost / monthly_workload_minutes)
Nivel 5: zero                                            (fallback final, clamp)
```

A cadeia preserva 100% do comportamento dos Niveis 1-3 (zero regressao). Nivel 4 so dispara quando os 3 primeiros retornam `null` ou `0` **E** `pricing_calculations.product_workload > 0` esta presente (input minimo). Nivel 5 e o clamp final inegociavel — nenhuma branch pode lancar exception ou retornar `NaN`.

### 2. Risco arquitetural e mitigacao

**Risco:** Nivel 4 depende de **duas tabelas externas** estarem populadas: `tenant_expense_config.production_labor_cost` (custo mensal da MOD) e `tenants.monthly_workload` + `tenants.num_productive_employees` + `tenants.workload_unit` (capacidade produtiva mensal). Se qualquer um for `null` ou zero, a divisao explode ou produz infinito.

**Mitigacao (obrigatoria):**
- Clamp em zero quando qualquer denominador for `<= 0` ou `null`.
- Optional chaining em todos os acessos (`tenant?.monthly_workload ?? 0`).
- Helper retorna `0` (nao `null`) — call-site decide se renderiza linha condicionalmente (AC2 do PRD).

### 3. Dois pontos criticos para Dev (Dex)

**3.1 Derivacao de `monthly_workload_minutes` depende de `workload_unit`:**

```
const hoursPerMonth =
  workload_unit === 'HOURS'   ? monthly_workload :
  workload_unit === 'DAYS'    ? monthly_workload × 8 :  // 8h/dia (convencao do tenant)
  workload_unit === 'MINUTES' ? monthly_workload / 60 :
  0;

const monthly_workload_minutes = num_productive_employees × hoursPerMonth × 60;
```

`workload_unit` e enum em `tenants` — Dev DEVE validar os 3 valores antes de calcular. Qualquer valor desconhecido cai em `0` (que dispara o clamp do Nivel 5).

**3.2 `production_labor_cost` ja e mensal — sem outras conversoes:**

`tenant_expense_config.production_labor_cost` ja esta armazenado como **custo total mensal da MOD em reais**, conforme contrato V5+ do tenant_expense_config. Dev NAO deve multiplicar por num_employees, nem dividir por semanas/dias. Usar valor cru.

### 4. Backward compatibility

`MRM_ENGINE_VERSION` permanece `2.3.0` (alteracao opera em camada de **display**, nao no motor). ADR-001/003/010 preservados. Zero migration Supabase. Snapshots persistidos em `budgets.snapshot_jsonb`/`sales.snapshot_jsonb` **nao mudam** — V8.6 so afeta render runtime da DRE Consolidada.

**Aria, 2026-05-23** — Addendum V8.6 **APPROVED (PATCH)**. Pode prosseguir para Quinn.
