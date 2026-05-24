# QA-VALIDATION-EPIC-MRM-V8 — Validação operacional da Cadeia de Resolução de Custo do Produto

**Versão:** 1.0
**Data:** 2026-05-24
**Autor:** @qa Quinn (Quality Assurance)
**Owner técnico:** @dev Dex (executor das 3 stories MRM-V8-001/002/003)
**Owner arquitetural:** @architect Aria (ADR-011 ACCEPTED)
**Owner de produto:** @pm Morgan (PRD EPIC-MRM-V8-PRODUCT-COST-SOURCE v1.0)
**Validador de aceite:** @founder Hyago (cenário canônico produto "PVC" em staging)

**Referências:**
- `docs/prd/EPIC-MRM-V8-PRODUCT-COST-SOURCE.md` (PRD v1.0, APPROVED Aria)
- `docs/architecture/adr-011-product-cost-resolution-chain.md` (ACCEPTED Aria, 2026-05-24)
- `src/utils/resolveProductCostTotal.ts` (alvo do refator — Story V8-001)
- `src/hooks/useProducts.ts` e `src/hooks/useServices.ts` (alvos do SELECT expandido — Story V8-001)
- 4 call-sites da DRE Consolidada em orçamentos + vendas balcão (alvos do Story V8-002)
- Suíte de tests baseline: **333 tests** (294 V7 + 39 ADR-010 V7 já consolidados)

---

## 1. Escopo

Esta QA-VALIDATION cobre **estritamente** a nova cadeia de resolução de custo introduzida por ADR-011 + Epic MRM-V8. Garante que:

1. O helper `resolveProductCostTotal(product, pricingCalc)` passe a priorizar `SUM(product_items.item_cost_net) + pricing_calc.total_labor_net` (Nível 1) antes de `products.cost_total` (Nível 2) e `pricing_calc.cmv` (Nível 3).
2. `useProducts()` e `useServices()` incluam `product_items(item_cost_net, quantity_needed)` no SELECT do Supabase.
3. A divisão por `yield_quantity` (com clamp `Math.max(1, ...)`) seja aplicada nos Níveis 1 e 4.
4. As 4 call-sites da DRE Consolidada (orçamentos + vendas balcão × criação + edição) usem o helper atualizado, passando ambos os argumentos (`product` JOIN + `pricingCalc`).
5. **Zero regressão** nos 333 tests existentes, no Motor RR (`margin-reapuration.ts`), na DRE Consolidada (snapshots `*_items.tax_breakdown` continuam intactos) e nos snapshots persistidos.
6. O cenário canônico do Founder (produto "PVC" com `cost_total=0`, `product_items=[{item_cost_net: 39929.94}]`, `total_labor_net=2716`, `yield_quantity=1`) seja reproduzido **bit-exact** (precisão ± R$ 0,01): **R$ 42.645,94**.

**Fora do escopo:**
- Mudanças em `margin-reapuration.ts` (motor RR permanece bit-exact, `MRM_ENGINE_VERSION = 2.3.0` inalterado).
- Migrations Supabase (zero migration nesta epic — schema já suporta tudo).
- Alterações no fluxo de precificação (`/produtos *-pricing/save` continua persistindo `cost_total` da mesma forma).
- Alterações na tela de cadastro de produto (UI permanece como está — apenas leitura da DRE muda).
- Retroatividade de produtos legados (não há job de backfill — helper lê `product_items` direto a cada render).

---

## 2. Cenário canônico do user (referência matemática INEGOCIÁVEL)

**Produto "PVC" (Hyago, validação 2026-05-24):**

| Parâmetro | Valor |
|-----------|-------|
| `products.cost_total` | 0 (legado, nunca rodou recalculo) |
| `products.yield_quantity` | 1 |
| `product_items` (1 linha) | `{ item_cost_net: 39929.94, quantity_needed: 50000 }` |
| `pricing_calculations.total_labor_net` | 2716.00 |
| `pricing_calculations.cmv` | 0 (vazio) |

**Fórmula esperada (Nível 1 da cadeia ADR-011 §2):**

```
custo = (SUM(item_cost_net) + total_labor_net) / yield_quantity
     = (39929.94 + 2716.00) / 1
     = 42645.94
```

**Resultado esperado em todos os pontos de leitura:**

| Local | Valor esperado |
|-------|----------------|
| Helper `resolveProductCostTotal(product, pricingCalc)` retorna | **R$ 42.645,94** |
| Tela "Cadastro do Produto" (referência — já bate) | **R$ 42.645,94** |
| DRE Consolidada → bloco "Custos" → linha "Custo do produto" (orçamento) | **R$ 42.645,94** |
| DRE Consolidada → bloco "Custos" → linha "Custo do produto" (venda balcão) | **R$ 42.645,94** |

**Tolerância:** ± R$ 0,01 (precisão de centavo). Diferença ≥ R$ 0,02 = FAIL.

---

## 3. Matriz de testes (7 cenários)

Todos os 7 cenários devem ser implementados em `src/utils/__tests__/resolveProductCostTotal.test.ts` (arquivo dedicado).

### C1 — Cenário canônico do user (Nível 1)

**Inputs:**
- `product = { cost_total: 0, yield_quantity: 1, product_items: [{ item_cost_net: 39929.94, quantity_needed: 50000 }] }`
- `pricingCalc = { total_labor_net: 2716.00, cmv: 0 }`

**Output esperado:** `42645.94` (bit-exact, tolerância ± 0.01)

**Justificativa:** golden test do Founder — reproduz produto "PVC" reportado em 2026-05-24.

---

### C2 — Produto moderno com `cost_total > 0` (Nível 2 — não regredir)

**Inputs:**
- `product = { cost_total: 100.00, yield_quantity: 1, product_items: [] }`
- `pricingCalc = { total_labor_net: 0, cmv: 0 }`

**Output esperado:** `100.00`

**Justificativa:** prioridade de `cost_total` quando `product_items` está vazio. Garante que produtos modernos pré-V8 continuam funcionando exatamente como antes (zero regressão fluxo feliz V7).

---

### C3 — Multi-item (Nível 1 com SUM correto)

**Inputs:**
- `product = { cost_total: 0, yield_quantity: 1, product_items: [
    { item_cost_net: 1000.00, quantity_needed: 10 },
    { item_cost_net: 500.50, quantity_needed: 5 },
    { item_cost_net: 250.25, quantity_needed: 1 }
  ] }`
- `pricingCalc = { total_labor_net: 0, cmv: 0 }`

**Output esperado:** `1750.75` (= 1000.00 + 500.50 + 250.25)

**Justificativa:** valida que SUM de múltiplas linhas é correto e que `item_cost_net` é tratado como TOTAL da linha (NÃO multiplicado novamente por `quantity_needed`).

---

### C4 — `yield_quantity > 1` (Nível 1 dividido)

**Inputs:**
- `product = { cost_total: 0, yield_quantity: 50, product_items: [{ item_cost_net: 39929.94 }] }`
- `pricingCalc = { total_labor_net: 2716.00 }`

**Output esperado:** `852.92` (= 42645.94 / 50, com tolerância ± 0.01)

**Justificativa:** valida divisão por `yield_quantity` para obter custo por unidade. Produtos com lote > 1 devem retornar custo unitário, não custo total do lote.

---

### C5 — Produto sem nenhuma fonte (Nível 5 — zero legítimo)

**Inputs:**
- `product = { cost_total: 0, yield_quantity: 1, product_items: [] }`
- `pricingCalc = null` (ou `{ total_labor_net: 0, cmv: 0, total_material_cost_net: 0 }`)

**Output esperado:** `0`

**Justificativa:** comportamento legítimo — produto sem custo cadastrado retorna 0 explicitamente. Não é bug; é estado válido (produto recém-criado vazio).

---

### C6 — `product_items` existe mas todos com `item_cost_net = null/0` (fallback para próximo nível)

**Inputs:**
- `product = { cost_total: 250.00, yield_quantity: 1, product_items: [
    { item_cost_net: null, quantity_needed: 10 },
    { item_cost_net: 0, quantity_needed: 5 }
  ] }`
- `pricingCalc = { total_labor_net: 0, cmv: 0 }`

**Output esperado:** `250.00` (cai em Nível 2 — `cost_total`)

**Justificativa:** quando `SUM(item_cost_net)` resulta em 0 (todos null/zero), a cadeia deve cair graceful para `cost_total`. Garante que itens placeholder não bloqueiam fallback.

---

### C7 — `pricing_calculations` é array vazio OU objeto null (Optional chaining)

**Inputs (variante A — pricingCalc null):**
- `product = { cost_total: 0, yield_quantity: 1, product_items: [{ item_cost_net: 1000.00 }] }`
- `pricingCalc = null`

**Output esperado:** `1000.00` (Nível 1 funciona sem MO — `total_labor_net ?? 0 = 0`)

**Inputs (variante B — pricingCalc undefined):**
- `product = { cost_total: 500.00, yield_quantity: 1, product_items: [] }`
- `pricingCalc = undefined`

**Output esperado:** `500.00` (Nível 2 dispara, optional chaining seguro)

**Justificativa:** valida defesa em profundidade contra `pricing_calculations` ausente. Helper não deve crashar quando o segundo argumento é falsy.

---

## 4. Critérios globais

### CG-1 — Zero regressão nos 333 tests

**Critério:** Após implementação, a suíte completa (`npm test`) reporta **333 passed, 0 failed**. Caso algum teste V7 precise ser ajustado (ex: prioridade de `cmv` muda de #2 para #3), a alteração deve ser explícita e justificada no STORY-V8-003.

**Como validar:** Executar `npm test` antes e depois do refator. Diff de relatórios deve ser apenas em arquivos novos do V8 (`resolveProductCostTotal.test.ts`) ou ajustes pontuais documentados.

### CG-2 — Cenário canônico bate R$ 42.645,94 ± R$ 0,01

**Critério:** Quando `useProducts()` retorna o produto "PVC" com `product_items` populado, a chamada `resolveProductCostTotal(product, pricingCalc)` retorna `42645.94` (precisão de centavo).

**Como validar:** Test unitário C1 + validação manual em staging com produto real do tenant do Hyago.

### CG-3 — `useProducts` SELECT inclui `product_items`

**Critério:** Inspecionar o código de `useProducts.ts` (e `useServices.ts`) — string do `.select()` deve conter `product_items(item_cost_net, quantity_needed)` (ou equivalente expandido).

**Como validar:** Grep no código + verificar no Network DevTools que a query Supabase retorna o array `product_items` no JSON da response.

### CG-4 — Aplicado em orçamentos + vendas (4 ocorrências)

**Critério:** Todas as 4 call-sites identificadas no STORY-V8-002 chamam `resolveProductCostTotal(product, pricingCalc)` com ambos os argumentos. Nenhuma call-site lê `product.cost_total` diretamente para a DRE Consolidada.

**Como validar:**
- Grep `cost_total` no diretório de páginas (orçamentos + vendas) — qualquer leitura direta para a DRE deve ser flag de FAIL.
- Grep `resolveProductCostTotal` — esperado mínimo de 4 ocorrências (criação orçamento, edição orçamento, criação venda balcão, edição venda balcão).
- Validação manual em staging em todas as 4 telas com produto "PVC".

---

## 5. Quality Gates

### QG-001 (BLOCKING) — Cenário canônico bate R$ 42.645,94

**Critério:** Test C1 (`resolveProductCostTotal.test.ts`) passa com `toBeCloseTo(42645.94, 2)`. Validação manual do Founder em staging confirma DRE Consolidada exibindo "Custo do produto: R$ 42.645,94" para o produto "PVC".

**Severidade:** BLOCKING — release não pode prosseguir sem esta validação.

**Como demonstrar para release:** Screenshot da DRE em staging + log do test C1 verde + assinatura escrita do Founder Hyago confirmando "valores batem com o cadastro".

---

### QG-002 (BLOCKING) — Zero regressão nos 333 tests

**Critério:** `npm test` reporta `Tests: 333 passed, 0 failed` após o merge das 3 stories V8.

**Severidade:** BLOCKING — qualquer regressão em test V7/V6/V5 indica side effect arquitetural não previsto na ADR-011 e deve ser investigado antes do deploy.

**Como demonstrar para release:** Log completo de `npm test` no PR + comparação de baseline (333 baseline → 333 atual + N novos testes V8).

---

### QG-003 (NON-BLOCKING) — Aplicação consistente em 4 callers

**Critério:** As 4 call-sites identificadas no STORY-V8-002 (orçamentos criação/edição + vendas balcão criação/edição) usam `resolveProductCostTotal(product, pricingCalc)` com ambos os argumentos.

**Severidade:** NON-BLOCKING para release crítico (QG-001 já garante o caso visual), mas BLOCKING para o sign-off do PR — inconsistência entre callers gera divergência confusa entre orçamento e venda do mesmo produto.

**Como demonstrar para release:** Diff do PR mostrando as 4 modificações + grep `cost_total` no diretório de páginas retornando apenas usos legítimos (ex: dentro do próprio helper) ou zero usos diretos na DRE.

---

## 6. Estratégia de execução QA

### 6.1 Antes do merge do PR (gate de pre-flight)

1. **Code review:** validar implementação do helper contra ADR-011 §2 (cadeia de 5 níveis na ordem correta).
2. **Tests unitários:** rodar `npm test src/utils/__tests__/resolveProductCostTotal.test.ts` — esperado 7+ passed (C1-C7).
3. **Tests de regressão:** rodar `npm test` completo — esperado 333+ passed, 0 failed.
4. **Lint + typecheck:** `npm run lint && npm run typecheck` — sem warnings novos.
5. **Grep audit:** verificar que `product.cost_total` não é mais lido diretamente em call-sites da DRE.

### 6.2 Em staging (pre-release)

1. **Cenário canônico:** abrir orçamento com produto "PVC" → DRE deve mostrar R$ 42.645,94.
2. **Não-regressão visual:** abrir orçamento com produto moderno (`cost_total > 0`) → DRE deve mostrar valor de `cost_total` inalterado.
3. **Multi-item:** abrir orçamento com produto que tem 3+ itens → DRE deve mostrar soma correta.
4. **Venda balcão:** repetir cenários 1-3 na tela de vendas balcão (criação + edição).
5. **Sign-off do Founder:** Hyago valida visualmente que "valores batem com o cadastro" — registrar confirmação escrita.

### 6.3 Pós-deploy em produção (monitoramento)

1. Monitorar logs de erro do `resolveProductCostTotal` (qualquer exception indica edge case não coberto).
2. Validar amostra de 5-10 produtos representativos em produção (diferentes gerações: legado, médio, moderno).
3. Confirmar que DRE Consolidada de orçamentos ativos (status `draft`) recalcula corretamente após reload.

---

## 7. Veredito

**PRD EPIC-MRM-V8-PRODUCT-COST-SOURCE v1.0:** **APPROVED**
**ADR-011 — Product Cost Resolution Chain:** **APPROVED**

A solução proposta é arquiteturalmente conservadora (zero migration, zero mudança no motor RR, zero impacto em snapshots persistidos), endereça a causa raiz reportada pelo Founder (produto legado sem `cost_total` populado), e mantém compatibilidade total com produtos modernos via Nível 2 da cadeia. Os 7 cenários cobrem casos felizes, edge cases e zero legítimo. QG-001 + QG-002 são os gates inegociáveis de release.

**Recomendação:** prosseguir com Epic V8 para implementação por @dev Dex conforme stories MRM-V8-001/002/003 no PRD.

**Quinn, 2026-05-24** — APPROVED. Pode prosseguir para Dev.
