# EPIC-MRM-V8 — Custo do Produto via product_items

**Versao:** 1.0
**Data:** 2026-05-24
**Autor:** Morgan (PM AIOS)
**Status:** Draft
**Epic anterior:** EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY
**Tipo:** Bugfix critico de fonte de dados (DRE Consolidada)

---

## 1. Problema

A **DRE Consolidada** continua exibindo **Custo do produto: R$ 0,00** mesmo apos as duas tentativas anteriores de correcao:

- Commit `dec232b` — adicionou Mao de Obra Direta (MOD) no bloco de Custos.
- Commit `eddf6e4` — adicionou fallback via `pricing_calculations.cmv`.

Validacao do user (Hyago, 2026-05-24) apos deploy:

> "ainda nao esta batendo... continua exatamente igual a stava antes"

### 1.1 Cenario real

Produto **"PVC"** cadastrado no sistema:

| Item                          | Quantidade   | Bruto    | Liquido   |
|-------------------------------|--------------|----------|-----------|
| Item PVC (`product_items`)    | 50.000 un    | R$ 50.000,00 | **R$ 39.929,94** |
| Mao de obra produtiva         | 5.000 min    | -        | **R$ 2.716,00**  |
| **Custo total do produto**    | -            | -        | **R$ 42.645,94** |

- Tela "Cadastro do Produto" exibe corretamente **R$ 42.645,94**.
- DRE do orcamento exibe **R$ 0,00** (incorreto).

### 1.2 Causa raiz

Investigacao no schema Supabase revelou que para este produto:

1. **`products.cost_total`** = 0 (produto antigo ou nunca rodou recalculo).
2. **`pricing_calculations`** = vazia ou com `cmv = 0` (motor de precificacao nunca persistiu).
3. **A fonte real e `product_items.item_cost_net`** (somatorio dos itens), que existe e tem o valor correto, mas:
   - O hook `useProducts()` **nao traz** o relacionamento `product_items` no `SELECT`.
   - O helper `resolveProductCostTotal()` **nao tem fallback** para somar `product_items.item_cost_net`.

Por isso, as cadeias de fallback V7 (`cost_total` -> `pricing_calculations.cmv` -> 0) caem direto no zero.

---

## 2. Decisao estrategica

**Inverter a prioridade da cadeia de fallback** do helper `resolveProductCostTotal()` para refletir a hierarquia que a UI ja usa no cadastro de produto.

### 2.1 Nova cadeia de fallback

| Prioridade | Fonte                                                                     | Quando se aplica                              |
|------------|---------------------------------------------------------------------------|-----------------------------------------------|
| **1** (NOVA) | `SUM(product_items.item_cost_net) + pricing_calculations.total_labor_net` | Produto com itens cadastrados (caso real)     |
| 2          | `products.cost_total`                                                     | Produtos modernos que ja persistiram total    |
| 3          | `pricing_calculations.cmv`                                                | Produtos com CMV unitario calculado           |
| 4          | `0`                                                                       | Produto sem nenhuma fonte de custo (legitimo) |

### 2.2 Por que prioridade 1 e a soma de itens

- E o **unico campo que reflete a realidade do que o user ve na tela** ao cadastrar o produto.
- `cost_total` so e populado apos um recalculo bem-sucedido — produtos legados ficam zerados.
- `pricing_calculations` so e populada apos rodar o motor de precificacao — pode estar vazia.
- `product_items` e populado no momento em que o user adiciona itens — fonte mais confiavel.

### 2.3 Divisao por `yield_quantity`

O custo dos `product_items` representa o custo total do **lote produzido** (yield). Para custo unitario por produto vendido, e preciso dividir pelo `yield_quantity` quando aplicavel:

```
custo_unitario = (SUM(item_cost_net) + total_labor_net) / yield_quantity
```

Se `yield_quantity` for nulo ou 1, divide por 1 (custo total = custo unitario).

---

## 3. Acceptance Criteria

| ID  | Criterio                                                                                                                                  |
|-----|-------------------------------------------------------------------------------------------------------------------------------------------|
| **AC1** | Para o produto "PVC" do user (`cost_total=0`, `item_cost_net=39929.94`, `total_labor_net=2716`), o helper retorna **R$ 42.645,94**. |
| **AC2** | Para produto com `cost_total > 0`, o helper continua retornando `cost_total` (nao regride comportamento atual).                       |
| **AC3** | Para produto multi-item (ex: 3 entradas em `product_items`), o helper soma corretamente todos os `item_cost_net`.                     |
| **AC4** | `useProducts()` inclui `product_items(item_cost_net, quantity_needed)` no `SELECT`.                                                   |
| **AC5** | `useServices()` recebe o mesmo padrao de SELECT + helper (servicos tambem podem ter itens).                                            |
| **AC6** | Aplicacao em orcamentos **e** vendas balcao funciona sem regressao (DRE bate em ambos os fluxos).                                     |
| **AC7** | `yield_quantity` e considerado: custo unitario = (soma_itens + labor_net) / yield_quantity (default 1 quando nulo).                   |

---

## 4. Stories propostas

### STORY-V8-001 — Helper + Hooks SELECT (1h)

**Objetivo:** Atualizar `resolveProductCostTotal()` com nova cadeia de fallback e expandir `useProducts()` / `useServices()` para trazer `product_items`.

**Tasks:**
- Modificar SELECT de `useProducts` para incluir `product_items(item_cost_net, quantity_needed, yield_quantity)`.
- Modificar SELECT de `useServices` para incluir os mesmos campos.
- Reescrever `resolveProductCostTotal(product, pricingCalc)`:
  1. Se `product.product_items.length > 0`: somar `item_cost_net` + `pricingCalc?.total_labor_net ?? 0`, dividir por `yield_quantity ?? 1`.
  2. Senao se `product.cost_total > 0`: retornar `cost_total`.
  3. Senao se `pricingCalc?.cmv > 0`: retornar `cmv`.
  4. Senao: retornar `0`.

**Definition of Done:** Helper exportado, types atualizados, sem callers quebrados.

---

### STORY-V8-002 — Aplicar nos callers (30min)

**Objetivo:** Garantir que todos os 4 pontos de uso (orcamentos + vendas balcao, criacao + edicao) chamem o helper atualizado.

**Tasks:**
- Mapear 4 ocorrencias de leitura de custo de produto na DRE Consolidada.
- Substituir leituras diretas de `product.cost_total` por `resolveProductCostTotal(product, pricingCalc)`.
- Verificar que `pricingCalc` (vindo de `pricing_calculations`) e passado corretamente.

**Definition of Done:** DRE em orcamento e venda balcao mostra custo correto para produto "PVC".

---

### STORY-V8-003 — Tests (1h)

**Objetivo:** Cobrir nova cadeia de fallback e atualizar tests V7 existentes.

**Tasks:**
- Test novo: produto com `cost_total=0` + `product_items` -> retorna soma + labor.
- Test novo: produto multi-item -> soma correta de todos os itens.
- Test novo: produto com `yield_quantity=10` -> divide custo total por 10.
- Test novo: produto sem nenhuma fonte -> retorna 0 (caso legitimo).
- Atualizar tests V7: fallback `pricing_calculations.cmv` agora e prioridade 3 (nao 1).
- Test de nao-regressao: produto com `cost_total=1000` continua retornando 1000.

**Definition of Done:** `npm test` passa com cobertura >= 90% no helper.

---

## 5. Out-of-scope

- **Nao** criar migration Supabase (schema atual ja suporta tudo).
- **Nao** alterar o Motor de Reapuracao de Margem (RR) — apenas a leitura de custo a montante.
- **Nao** alterar o fluxo de precificacao — `products.cost_total` continua sendo salvo da mesma forma quando user salva o cadastro.
- **Nao** retroativamente recalcular produtos legados (nao precisa: o helper le `product_items` direto).
- **Nao** alterar UI da tela de cadastro de produto.

---

## 6. Riscos e mitigacoes

| Risco                                                                                          | Severidade | Mitigacao                                                                       |
|------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------|
| Produto sem `product_items` E sem `cost_total` -> custo continua R$ 0,00.                       | Baixa      | Comportamento legitimo (produto realmente nao tem custo cadastrado). Sem acao. |
| `SELECT` com JOIN `product_items` aumenta payload do `useProducts()`.                           | Baixa      | Campos sao pequenos (numerics). Impacto desprezivel.                            |
| `yield_quantity` nulo em produtos legados causa divisao por nulo.                               | Media      | Default `?? 1` garante divisao segura.                                          |
| `total_labor_net` nao existe em `pricing_calculations` (tabela vazia).                          | Media      | Fallback `?? 0` no helper.                                                      |
| Produtos com itens cadastrados mas valores zerados em `item_cost_net`.                          | Baixa      | Soma = 0, cai no fallback de `cost_total`, depois `cmv`, depois 0.              |

---

## 7. Estimativa total

| Story          | Tempo  |
|----------------|--------|
| STORY-V8-001   | 1h     |
| STORY-V8-002   | 30min  |
| STORY-V8-003   | 1h     |
| **Total**      | **~2h30** |

---

## 8. Validacao final (criterio de aceite do user)

Apos deploy, o user Hyago abre o orcamento com o produto "PVC" e a DRE Consolidada deve exibir:

```
Custo do produto: R$ 42.645,94
```

Bate exatamente com o numero da tela de cadastro do produto.

---

## Architectural Review (Aria, 2026-05-24)

**Veredito:** **APPROVED**

**Referência arquitetural:** [`docs/architecture/adr-011-product-cost-resolution-chain.md`](../architecture/adr-011-product-cost-resolution-chain.md) (ACCEPTED, 2026-05-24).

1. **Cadeia em 5 níveis cobre as 3 gerações de produtos sem regressão.** A priorização de `product_items.item_cost_net` (Nível 1) bate exatamente com o que o user vê na tela do cadastro, enquanto `cost_total > 0` (Nível 2) preserva 100% do comportamento atual para produtos modernos. Níveis 3 (`cmv`), 4 (agregados parciais) e 5 (zero legítimo) garantem defesa em profundidade contra estados patológicos. Zero invenção (Constitution Artigo IV) — `item_cost_net` já existe no schema desde antes desta epic.

2. **Divisão por `yield_quantity` com clamp em 1 é a defesa correta.** O bloco "Implementation notes §3.2" especifica `Math.max(1, Number(product.yield_quantity) || 1)` como divisor, eliminando o risco de divisão por zero em produtos legados sem `yield_quantity` preenchido. Para produtos sem lote (venda 1:1), `yield_quantity = 1` é o caso default e custo total = custo unitário (sem mudança).

3. **Zero migration Supabase + zero impacto no Motor RR + zero alteração em snapshots persistidos.** ADR-001 (single source of truth do motor), ADR-003 (snapshot fiscal invariante) e ADR-010 (separação Display vs Snapshot fiscal) permanecem preservados integralmente. `MRM_ENGINE_VERSION` continua `2.3.0` — esta epic opera estritamente na leitura de custo a montante do motor, não no motor em si. PRD pode prosseguir para QA Quinn em paralelo.

**Aria, 2026-05-24**

---

## QA Review (Quinn, 2026-05-24)

**Veredito:** **APPROVED**

**Referência operacional:** [`docs/qa/QA-VALIDATION-EPIC-MRM-V8.md`](../qa/QA-VALIDATION-EPIC-MRM-V8.md) (v1.0, 2026-05-24).

1. **7 cenários da matriz cobrem caso canônico + edge cases + zero legítimo.** C1 reproduz o produto "PVC" do Founder (R$ 42.645,94 bit-exact). C2 garante não-regressão de produtos modernos com `cost_total > 0`. C3 valida SUM multi-item. C4 valida divisão por `yield_quantity = 50`. C5-C7 cobrem fallback gracioso, `item_cost_net` nulo e `pricing_calculations` ausente. Cobertura suficiente para o helper sem inflar suíte de testes.

2. **QG-001 + QG-002 são os gates inegociáveis de release.** QG-001 (BLOCKING) exige que cenário canônico bata R$ 42.645,94 ± 0,01 em test unitário + validação manual em staging do Founder. QG-002 (BLOCKING) exige zero regressão nos 333 tests existentes — qualquer falha indica side effect arquitetural não previsto. QG-003 (NON-BLOCKING) garante consistência entre as 4 call-sites de orçamentos + vendas balcão.

3. **Estratégia de execução em 3 fases (pre-merge, staging, pós-deploy) elimina risco operacional.** Pre-merge faz code review + tests + lint + grep audit. Staging valida 5 cenários práticos em ambiente real. Pós-deploy monitora logs e amostra produtos em produção. Sign-off escrito do Founder Hyago é gate final de aceite — alinhado com a validação canônica do produto "PVC".

**Quinn, 2026-05-24** — APPROVED. PRD EPIC-MRM-V8 pode prosseguir para Dev.

---

**Fim do PRD EPIC-MRM-V8 v1.0**
