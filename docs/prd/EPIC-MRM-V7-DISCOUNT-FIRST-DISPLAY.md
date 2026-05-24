# EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY — Distribuição Display via "Preservação Operacional"

**ID:** EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY
**Versão:** 1.0
**Data:** 2026-05-24
**Status:** Draft (PRD v1.0 — aguardando validação @po + @architect)
**Owner:** @pm Morgan (Product Management)
**Engine baseline:** `MRM_ENGINE_VERSION = 2.3.0` (Epic V6 em produção — 3 modos de desconto)
**Engine alvo:** **inalterado** — `2.3.0` permanece (esta epic NÃO toca `margin-reapuration.ts`)
**Regime:** Todos (MEI, SN, LP, LR)
**Template:** `aios-core/development/templates/brownfield-prd-tmpl.yaml`

> **Frase-chave de governança:** Os 4 cards "Distribuição do resultado" são VIEW de display do desconto — não fonte de verdade fiscal. Motor RR continua emitindo snapshots imutáveis para auditoria (ADR-003).

> **Restrição CRÍTICA do usuário (HERDADA dos Epics V5/V6):** *"Não é para criar novas abas, somente ajustar a lógica."*
> Nenhum novo screen/tab/route. Esta epic mexe em (a) `residual-distribution.ts` (função de agregação), (b) `residual-distribution-block.component.tsx` (componente compartilhado) e (c) 3 call-sites de páginas existentes.

> **Invariante INEGOCIÁVEL:** **"DRE Consolidada e snapshots fiscais persistidos (`*_items.tax_breakdown`) NÃO são alterados por esta epic. Apenas o RENDER dos 4 cards no bloco 'Distribuição do resultado' troca de fonte: passa do motor RR para a função `calculateDiscountedPrice` + alíquotas tenant aplicadas sobre `totalNet`."**

---

## 1. Resumo Executivo

### 1.1 Problema

Hyago testou o sistema em produção pós Epic V6 e identificou que os 4 cards "Distribuição do resultado" (Comissão do Vendedor, Lucro da Empresa, IRPJ, CSLL) exibidos no orçamento e na venda no balcão **não batem com os valores cadastrados no produto** — divergem por uma ordem de magnitude (~18× menores que o esperado).

**Cenário de validação (reportado pelo Founder):**

- Produto: preço unitário R$ 141.106,60
- Cadastro do produto: Comissão 5% = R$ 7.055,33 / Lucro 10% = R$ 14.110,66
- Desconto aplicado: 10% (= R$ 14.110,66 absoluto)
- Modo: PROPORTIONAL (default)
- Tenant: IRPJ 1,8% / CSLL 1,08%
- Preço pós-desconto (`totalNet`): R$ 126.995,94

**Comparativo numérico (causa raiz):**

| Card | Esperado pelo user (consumer view) | Atual em produção (motor RR) | Diferença |
|------|-----------------------------------:|-----------------------------:|----------:|
| **Comissão do Vendedor** | R$ 2.351,78 | R$ 372,89 | **−84,1%** |
| **Lucro da Empresa** | R$ 4.703,55 | R$ 745,78 | **−84,1%** |
| **IRPJ** (1,8% × 126.995,94) | R$ 2.285,93 | R$ 134,24 | **−94,1%** |
| **CSLL** (1,08% × 126.995,94) | R$ 1.371,56 | R$ 80,54 | **−94,1%** |
| **RRO subjacente do motor** | — | R$ 1.333,46 (esmagado) | — |

**Matemática esperada (Cenário do user):**

```
Pool original = Comissão + Lucro = 7.055,33 + 14.110,66 = 21.165,99
Desconto absoluto = 14.110,66 (10% de 141.106,60)
% desconto da margem = 14.110,66 / 21.165,99 = 66,667%

PROPORTIONAL (peso pelo cadastro):
  peso_comm  = 5 / (5+10) = 33,333%
  peso_lucro = 10 / (5+10) = 66,667%

Redução Comissão = 14.110,66 × 33,333% = 4.703,55  → Comissão = 7.055,33 − 4.703,55 = 2.351,78 ✓
Redução Lucro    = 14.110,66 × 66,667% = 9.407,11  → Lucro     = 14.110,66 − 9.407,11 = 4.703,55 ✓

IRPJ = 126.995,94 × 1,8%  = 2.285,93 ✓
CSLL = 126.995,94 × 1,08% = 1.371,56 ✓
```

**Causa raiz técnica:**

O motor RR (`src/utils/margin-reapuration.ts`) recalcula despesas operacionais do tenant (DOP ≈ 70%) **sobre o preço final** durante a reapuração. Como o produto já foi precificado com essas mesmas despesas embutidas no coeficiente de markup, ocorre **dupla contagem**: o motor "come" novamente as despesas, esmagando o RRO para R$ 1.333,46 (~1% do preço) em vez dos R$ 14.110,66 reais do pool comissão+lucro. Os 4 cards então rateiam esse RRO esmagado, resultando nos valores 18× menores.

A função `extractItemValues` em `src/utils/residual-distribution.ts:112-144` lê `tb.new_commission`, `tb.new_profit`, `tb.new_csll`, `tb.new_irpj` diretamente do snapshot do motor RR — herdando a distorção.

**Função pronta não usada:**

`src/utils/calculate-discount.ts:33` (`calculateDiscountedPrice`) já implementa **exatamente** a spec correta (4.0.10/4.0.11 — "Desconto com Preservação Operacional"), incluindo os 3 modos (PROPORTIONAL com peso real / PROFIT_REDUCTION / SELLER_REDUCTION). Hoje é referenciada apenas como spec canônica e nunca é chamada em produção. Esta epic faz a ponte: cards passam a consumir essa função em vez do motor RR.

### 1.2 Valor

- **Consistência visual ponta-a-ponta:** vendedor vê no card "Comissão" exatamente o que foi cadastrado no produto (menos o desconto). Elimina a #1 reclamação de UX pós-V6.
- **Separação de responsabilidades limpa:** Motor RR continua como única fonte de verdade fiscal/gerencial (snapshots imutáveis ADR-003, DRE Consolidada). Cards são reposicionados como **view de display do desconto** — coisa que de fato sempre foram, mas estavam erradamente ligados ao motor RR.
- **Custo de desenvolvimento mínimo:** todas as funções necessárias já existem. Trabalho restante: 1 refator em `residual-distribution.ts`, 1 ajuste em `residual-distribution-block.component.tsx` (Cenário B), 3 call-sites para propagar `discount_pct`/`discount_mode`.
- **Zero migration / zero mudança de motor:** preserva totalmente Epic V4/V5/V6, ADR-003 (imutabilidade), ADR-008 (PIS/COFINS) e ADR-009 (3 modos no motor).

### 1.3 Decisão estratégica — Separação de responsabilidades

| Camada | Fonte de cálculo | Onde aparece | Imutabilidade |
|--------|------------------|--------------|---------------|
| **Motor RR** (`margin-reapuration.ts`) | Reapuração completa com tributos, MOD, DOP, RRO | Snapshot fiscal (`tax_breakdown` em DB), DRE Consolidada (visão gerencial), relatórios fiscais, auditoria | **Imutável** (ADR-003) — bit-exact preservado |
| **Distribuição Display** (`computeResidualDistribution` refatorada via `calculateDiscountedPrice`) | Pool comissão+lucro do cadastro × peso × redução proporcional ao modo. IRPJ/CSLL = alíquota tenant × `totalNet` | Cards "Distribuição do resultado" em orçamento, balcão, pedido (UI apenas) | **View-time** (recalculado a cada render — não persistido) |

**Decisão do Founder (Cenário B):** quando `discount_pct === 0`, o bloco "Distribuição do resultado" inteiro fica **oculto** (Cenário B). Quando `discount_pct > 0`, o bloco aparece exibindo os valores derivados do cadastro do produto (preservação operacional).

### 1.4 Impacto

- **Engine:** zero. `margin-reapuration.ts` não é tocado. `MRM_ENGINE_VERSION = 2.3.0` mantido.
- **DRE Consolidada:** zero impacto. Continua consumindo `tax_breakdown` persistido normalmente.
- **Snapshots persistidos:** zero impacto. `tax_breakdown` em `budget_items`/`order_items`/`sale_items` continuam gravados pelo motor RR sem modificação.
- **UI:** mudança visual perceptível apenas nos 4 cards do bloco "Distribuição do resultado" + ocultação total do bloco quando `desc=0`.
- **Migrations Supabase:** **ZERO**. Nenhuma coluna nova. Nenhuma alteração de schema.
- **Feature flag:** não requerida (a refatoração é determinística e a UI muda para a versão correta esperada pelo user).
- **Novos ADRs:** opcional. @architect pode optar por **ADR-010** ("Distribuição Display desacoplada do Motor RR") para formalizar a separação consumer-view vs fiscal-snapshot. Esta epic não bloqueia caso ADR seja diferido.

---

## 2. Objetivos do Epic (mensuráveis)

| # | Objetivo | KPI / Critério de medição |
|---|---------|---------------------------|
| **O1** | Cards "Comissão" e "Lucro" devem bater EXATAMENTE com o cadastro do produto quando `desc=0` (e ficar ocultos por Cenário B, mas o cálculo subjacente deve ser correto) | Teste unitário com produto comm=5%, prof=10%, preço 141.106,60 ⇒ commission=7.055,33; profit=14.110,66 (precisão ±0,01) |
| **O2** | Com desconto > 0, redução é proporcional aos pesos do cadastro (modo PROPORTIONAL) | Cenário user: desc=10%, modo=PROPORTIONAL ⇒ commission=2.351,78; profit=4.703,55 (±0,01) |
| **O3** | Modo SELLER_REDUCTION: toda redução sai da comissão | Cenário user: desc=10%, modo=SELLER ⇒ commission=0,00 (ou clamp positivo); profit=14.110,66 (intacto) |
| **O4** | Modo PROFIT_REDUCTION: toda redução sai do lucro | Cenário user: desc=10%, modo=PROFIT ⇒ commission=7.055,33 (intacto); profit=0,00 (ou clamp positivo) |
| **O5** | Bloco "Distribuição do resultado" oculto quando `desc=0` (Cenário B) | DOM não renderiza `<div>` raiz do bloco em orçamento/balcão/pedido quando `hasDiscount=false` |
| **O6** | IRPJ/CSLL = alíquota tenant × `totalNet` (cálculo direto, sem motor RR) | Cenário user: irpj = 126.995,94 × 1,8% = 2.285,93 (±0,01); csll = 126.995,94 × 1,08% = 1.371,56 (±0,01) |
| **O7** | Zero regressão na DRE Consolidada | Suíte `dre-consolidada.test.ts` continua passando 100% sem alteração |
| **O8** | Zero regressão em snapshots persistidos | Suíte `margin-reapuration*.test.ts` + `mrm-snapshot-compat.test.ts` continua passando 100% sem alteração |
| **O9** | 3 páginas (orcamentos / vendas balcão+visualização / pedidos visualização) com mesmo comportamento | Teste manual + assertion DOM em cada página: cards consistentes nos 3 modos × 3 cenários (sem desc / 10% / 20%) |

---

## 3. Escopo

### 3.1 In-scope

| Item | Arquivo | Mudança |
|------|---------|---------|
| Refator `computeResidualDistribution` | `src/utils/residual-distribution.ts` | Aceitar novos params `discountPct`, `discountMode`, dados originais do cadastro (`commission_percent`, `profit_percent` por item). Internamente usar `calculateDiscountedPrice` para derivar comissão/lucro pós-desconto. Calcular IRPJ/CSLL via `tenantTaxRates × totalNet`. |
| Refator `extractItemValues` | `src/utils/residual-distribution.ts` | Quando `discountPct > 0`, derivar `commission`/`profit` via `calculateDiscountedPrice`. Manter retrocompat: itens sem `commission_percent`/`profit_percent` informados caem em fallback do snapshot. |
| Ocultação Cenário B | `src/page-parts/shared/residual-distribution-block.component.tsx` | Quando `!distribution.hasDiscount` ⇒ `return null` (esconde bloco inteiro). Banner `regimeGuardActive` e `configWarning` permanecem intactos via condicional anterior à ocultação geral (decisão de design: warnings só fazem sentido quando bloco renderizaria; se bloco está oculto, warnings também ficam ocultos — alinhado com Cenário B). |
| Propagação de `discount_pct` / `discount_mode` | `src/pages/orcamentos/index.tsx`, `src/pages/vendas/index.tsx`, `src/pages/pedidos/index.tsx` + `src/hooks/use-residual-distribution.ts` | Passar `discount_pct`/`discount_mode` ao hook + ao `computeResidualDistribution`. Em `vendas/index.tsx`, garantir consistência nas 2 visões (drawer balcão + visualização `selectedSale`). |

### 3.2 Out-of-scope (NÃO fazer nesta epic)

- ❌ Não criar nova tabela / coluna / migration
- ❌ Não modificar `margin-reapuration.ts` (motor RR permanece bit-exact)
- ❌ Não alterar DRE Consolidada (continua consumindo snapshots fiscais)
- ❌ Não tocar lógica de Memória Cascata (vem do motor RR via DRE — fora do bloco Distribuição)
- ❌ Não tocar cálculo de Peso/Âncora (vem do motor RR via DRE — fora do bloco Distribuição)
- ❌ Não alterar `maxDiscountPercent` (cap usado em UI/validação — semântica já alinhada: pool original 15% conforme Risco R3)
- ❌ Não tocar PDF de orçamento (`create-budget-pdf.ts`) nem mensagem WhatsApp nesta epic — escopo separado se houver demanda. Esta epic é exclusivamente cards in-app.

---

## 4. Stories propostas (executáveis)

### STORY-MRM-V7-001 — Refatorar `residual-distribution.ts` para usar `calculateDiscountedPrice`

**Estimativa:** 4h
**Owner:** @dev

**Objetivo:** desacoplar a função `computeResidualDistribution` do motor RR persistido, passando a derivar Comissão/Lucro do cadastro do produto + `calculateDiscountedPrice`, e IRPJ/CSLL diretamente das alíquotas do tenant.

**Tasks:**

1. Adicionar parâmetros opcionais ao `computeResidualDistribution`:
   - `discountPct: number` (0-100, % de desconto absoluto sobre o preço bruto — não da margem)
   - `discountMode: DiscountMode` (default `'PROPORTIONAL'`)
2. Refatorar `extractItemValues` (ou criar `deriveDisplayValues`) para:
   - Aceitar o item original (com `unit_price`, `quantity`, `commission_percent`, `profit_percent`, `cost_total`)
   - Quando `discountPct > 0`: chamar `calculateDiscountedPrice(salePrice, costWithTaxes, discountPercentOfMargin, mode, commission_percent, profit_percent)` por item e somar `(commission_percent × salePrice − commissionReduction)` e análogo para lucro. **NOTA:** `discountPercent` de `calculateDiscountedPrice` é % da margem; converter o desconto absoluto da UI para % da margem usando `(discountAbsolute / margin) × 100`.
   - Quando `discountPct === 0`: usar diretamente `commission_percent × unit_price × quantity` e `profit_percent × unit_price × quantity` (cadastro puro do produto, sem motor RR).
3. Calcular IRPJ/CSLL direto: `irpjAmount = tenantTaxRates.irpj × totalNet`, idem CSLL. Respeitar `hidesProfitTaxes` (MEI/SN) como hoje.
4. Manter retrocompat de assinatura: parâmetros novos opcionais, callers legados continuam funcionando (caem em PROPORTIONAL + `discountPct=0` ⇒ devolve cadastro puro). Snapshots persistidos com `tax_breakdown` não interferem nos 4 cards display.
5. Atualizar JSDoc explicando que os 4 cards são **view-time** e separados do motor fiscal.
6. Adicionar/atualizar testes em `src/utils/__tests__/residual-distribution.test.ts`:
   - Caso cenário user sem desconto ⇒ commission=7.055,33; profit=14.110,66; irpj=141.106,60 × 1,8% = 2.539,92; csll=1.523,95
   - Caso cenário user 10% PROPORTIONAL ⇒ commission=2.351,78; profit=4.703,55; irpj=126.995,94 × 1,8% = 2.285,93; csll=1.371,56
   - Caso cenário user 10% SELLER ⇒ commission≈0; profit=14.110,66
   - Caso cenário user 10% PROFIT ⇒ commission=7.055,33; profit≈0
   - Regime MEI ⇒ irpj=0, csll=0 (hidesProfitTaxes)

**DoD:** todos os 5+ cenários de teste passam; lint+typecheck verdes; cobertura ≥ 90% no arquivo refatorado.

---

### STORY-MRM-V7-002 — Cenário B: ocultar bloco quando `desc=0`

**Estimativa:** 1h
**Owner:** @dev

**Objetivo:** quando não há desconto aplicado, o bloco "Distribuição do resultado" não aparece na UI (decisão Founder = Cenário B).

**Tasks:**

1. Em `src/page-parts/shared/residual-distribution-block.component.tsx`, no início do `return` do componente `ResidualDistributionBlock`:
   ```tsx
   if (!distribution.hasDiscount) return null
   ```
2. Documentar via comentário inline citando Epic MRM-V7 + Cenário B.
3. Validar que `regimeGuardActive` e `configWarning` continuam funcionando normalmente nas situações onde `hasDiscount=true` (não regredir o V5/S9). Banner `regimeGuardActive` permanece útil somente quando o bloco rendera — alinhado com a decisão Cenário B (sem desconto, não há distribuição para mostrar nem warning de regime a exibir contextualizado nesse bloco).
4. Atualizar `src/utils/__tests__/residual-distribution.test.ts` ou criar teste de componente leve (se @testing-library disponível) garantindo:
   - `hasDiscount=false` ⇒ retorno é null
   - `hasDiscount=true` ⇒ renderiza normalmente

**DoD:** ocultação verificada manualmente em orçamento sem desconto; banner guard MEI/SN ainda aparece quando aplicável e há desconto; testes passam.

---

### STORY-MRM-V7-003 — Propagar `discount_pct` + `discount_mode` aos 3 call-sites

**Estimativa:** 2h
**Owner:** @dev

**Objetivo:** garantir que os 3 lugares (orçamento, vendas balcão + visualização, pedidos visualização) passem `discount_pct` e `discount_mode` corretos ao hook `useResidualDistribution` / função `computeResidualDistribution`.

**Tasks:**

1. Em `src/hooks/use-residual-distribution.ts`: aceitar novos parâmetros `discountPct` e `discountMode` na assinatura do hook; propagar à chamada interna de `computeResidualDistribution`.
2. Em `src/pages/orcamentos/index.tsx`: passar `discount_pct` (já lido do form/state) e `discount_mode` do `<Select>` (Epic V6) ao hook. Garantir que mudanças em desconto/modo disparam re-render do bloco.
3. Em `src/pages/vendas/index.tsx`:
   - **Visão drawer balcão (venda em criação)**: passar `discount_pct`/`discount_mode` em uso no drawer.
   - **Visão `selectedSale` (venda finalizada já persistida)**: ler `selectedSale.discount_pct` e `selectedSale.discount_mode` (campos do schema V6) e passar ao hook. ATENÇÃO: vendas persistidas possuem `tax_breakdown` antigo no DB — esta visão precisa ignorar o snapshot e recalcular display via `calculateDiscountedPrice` para ficar consistente com o orçamento (ver Risco R1).
4. Em `src/pages/pedidos/index.tsx` (visualização do pedido selecionado): mesma propagação, lendo do pedido persistido.
5. Validar manualmente nas 3 páginas:
   - Sem desconto ⇒ bloco oculto
   - Com 10% PROPORTIONAL ⇒ cenário user bate (2.351,78 / 4.703,55 / 2.285,93 / 1.371,56)
   - Com 10% SELLER ⇒ lucro intacto, comissão zerada
   - Com 10% PROFIT ⇒ comissão intacta, lucro zerado

**DoD:** as 3 páginas exibem cards consistentes; teste manual cobre 3 modos × 3 cenários (sem desc / 10% / 20%); zero regressão em outras seções (Memória Cascata, Peso/Âncora, DRE).

---

## 5. Acceptance Criteria globais (TESTÁVEIS)

| AC | Critério | Como verificar |
|----|----------|----------------|
| **AC1** | Sem desconto, bloco "Distribuição do resultado" NÃO renderiza em orçamento/balcão/pedido | Inspeção DOM: `querySelector` retorna null nas 3 páginas com `discount_pct=0` |
| **AC2** | Com desconto 10% modo PROPORTIONAL no cenário do user ⇒ **Comissão R$ 2.351,78 ± 0,01** e **Lucro R$ 4.703,55 ± 0,01** | Teste unitário `residual-distribution.test.ts` + verificação visual nas 3 páginas |
| **AC3** | Modo SELLER_REDUCTION ⇒ toda redução vem da Comissão; Lucro intacto em R$ 14.110,66 (cenário user, 10%) | Teste unitário + verificação visual |
| **AC4** | Modo PROFIT_REDUCTION ⇒ toda redução vem do Lucro; Comissão intacta em R$ 7.055,33 (cenário user, 10%) | Teste unitário + verificação visual |
| **AC5** | IRPJ = `tenantTaxRates.irpj × totalNet` e CSLL = `tenantTaxRates.csll × totalNet` (cálculo direto, NÃO via motor RR distribution) | Teste unitário valida fórmula direta; cenário user ⇒ IRPJ R$ 2.285,93 / CSLL R$ 1.371,56 com 10% desconto |
| **AC6** | DRE Consolidada permanece intacta — visão gerencial mantém valores do motor RR | Suíte `dre-consolidada.test.ts` passa 100% sem mudança; verificação visual da página DRE não mostra alteração |
| **AC7** | Snapshots persistidos em `budget_items/sale_items/order_items.tax_breakdown` não são afetados | Inspecionar DB pós-deploy: nenhum write novo no `tax_breakdown` por causa desta epic. Snapshots V5/V6 continuam servindo DRE/auditoria. |
| **AC8** | Comportamento idêntico nas 3 páginas (orcamentos / vendas balcão+visualização / pedidos visualização) | Checklist manual: mesmos 4 cenários (sem desc / 10% PROPORTIONAL / 10% SELLER / 10% PROFIT) renderizam mesmos valores nas 3 (4) telas |
| **AC9** | Regime MEI/SN: cards IRPJ/CSLL continuam ocultos via `hidesProfitTaxes` (regressão zero V5) | Teste unitário com regime MEI ⇒ irpj=0, csll=0 e `hidesProfitTaxes=true` |
| **AC10** | Banner `regimeGuardActive` (V5 AC4) continua funcionando quando há desconto + regime MEI/SN + alíquotas tentadas | Teste manual em tenant MEI com tentativa de configurar CSLL>0 |

---

## 6. Tabela comparativa "antes/depois" (cenário do user)

**Input:** preço 141.106,60; comissão cadastro 5%; lucro cadastro 10%; desc 10%; modo PROPORTIONAL; tenant LP IRPJ 1,8% / CSLL 1,08%.

| Card | Antes (V6 — motor RR esmagado) | Depois (V7 — preservação operacional) | Esperado pelo user | Diferença |
|------|------:|------:|------:|------:|
| Comissão | R$ 372,89 | R$ **2.351,78** | R$ 2.351,78 | **0,00 ✓** |
| Lucro | R$ 745,78 | R$ **4.703,55** | R$ 4.703,55 | **0,00 ✓** |
| IRPJ | R$ 134,24 | R$ **2.285,93** | R$ 2.285,93 | **0,00 ✓** |
| CSLL | R$ 80,54 | R$ **1.371,56** | R$ 1.371,56 | **0,00 ✓** |
| Total RRO subjacente (motor) | R$ 1.333,46 (snapshot fiscal — **permanece**) | R$ 1.333,46 (snapshot fiscal — **permanece**) | n/a | **inalterado** |

**Leitura chave:** o motor RR continua calculando exatamente o que calculava antes (R$ 1.333,46 de RRO). O snapshot fiscal `tax_breakdown` no DB permanece com esses valores para alimentar DRE Consolidada e auditoria. O que mudou é **apenas a fonte que os 4 cards consomem**: não mais o motor RR, mas a função `calculateDiscountedPrice` que opera sobre o cadastro do produto.

---

## 7. Funções existentes que serão usadas (reuso, não invenção)

| Função | Localização | Uso na V7 |
|--------|-------------|-----------|
| `calculateDiscountedPrice` | `src/utils/calculate-discount.ts:33` | Núcleo do novo cálculo de display. Já implementa os 3 modos com pesos reais (PROPORTIONAL via `commissionPercent` + `profitPercent`, SELLER total, PROFIT total). |
| `computeResidualDistribution` | `src/utils/residual-distribution.ts:175` | Refatorada para chamar `calculateDiscountedPrice` em vez de ler `tb.new_*`. |
| `useResidualDistribution` | `src/hooks/use-residual-distribution.ts` | Acrescenta props `discountPct`/`discountMode` e repassa à função pura. |
| `ResidualDistributionBlock` | `src/page-parts/shared/residual-distribution-block.component.tsx:99` | Ganha early-return `if (!hasDiscount) return null` (Cenário B). |
| `tenantTaxRates` (já existente) | `src/contexts/tenant-tax-context.tsx` (parametrização) | Consumido diretamente para IRPJ/CSLL via `tenantTaxRates × totalNet`. |

---

## 8. Dependências

- ✅ **Epic MRM-V6 (3 modos de desconto)** em produção — provê o `<Select>` e a coluna `discount_mode` em `budgets`/`orders`/`sales` que o V7 vai consumir.
- ✅ **Epic MRM-V5 (regime guard + config warning)** em produção — provê `regimeGuardActive` e `configWarning` que continuam intactos.
- ✅ **`calculateDiscountedPrice` v atual** — já implementa a spec 4.0.10/4.0.11 corretamente; nenhuma alteração necessária na função.
- ✅ **`tenantTaxRates` context** — já expõe `irpj`/`csll` em decimal por tenant; nenhum trabalho de instrumentação adicional.

---

## 9. Riscos & Mitigações

| ID | Severidade | Risco | Mitigação |
|----|------------|-------|-----------|
| **R1** | **MEDIUM** | Snapshots V5/V6 antigos persistidos têm `tax_breakdown` com `new_commission/new_profit/new_csll/new_irpj` derivados do motor RR. Ao reabrir um documento antigo, os cards vão mostrar valores **diferentes** dos que foram exibidos quando o documento foi criado/finalizado (consumer-view recalculada em vez de snapshot). | Documentar explicitamente na UI (tooltip ou nota inline opcional) que os 4 cards são **view-time**. DRE Consolidada + snapshots `tax_breakdown` em DB permanecem fonte de verdade fiscal e auditoria (ADR-003 preservado). Acordar com Founder: para vendas históricas finalizadas, aceita-se a recálculo display por consistência ponta-a-ponta. |
| **R2** | **LOW** | Em modo SELLER_REDUCTION, se o desconto absoluto exceder a comissão original (ex: comissão 3% + desconto que come 5% da margem), a comissão pode ficar matematicamente negativa. | Clamp em 0 dentro de `computeResidualDistribution` antes de exibir + opcional warning amarelo "desconto excede comissão do vendedor neste modo". `maxDiscountPercent` da UI já bloqueia esse caso na entrada quando configurado por modo (vide Epic V6 O4). |
| **R3** | **LOW** | `maxDiscountPercent` atual (Epic V6) usa pool `comm+lucro` original como teto em modo PROPORTIONAL. Semântica continua compatível com a nova matemática (o pool é exatamente o mesmo). Em SELLER, V6 limita a `comm/total`; em PROFIT, a `prof/total`. | Não precisa mudar. Validar via teste manual que a UI de cap continua bloqueando excessos antes do clamp da R2 ser acionado. |
| **R4** | **LOW** | Cobertura de testes de componente é limitada hoje (vide TODO no header de `residual-distribution-block.component.tsx`). O Cenário B (early return) pode ficar sem teste automatizado. | Cobrir via teste de lógica (`hasDiscount=false` ⇒ retornar `null` é direto). Quando @testing-library/react 19 estabilizar, adicionar teste de render. Por ora, validação manual nas 3 páginas + revisão @qa. |
| **R5** | **LOW** | Memória Cascata e Peso/Âncora (que **continuam** vindo do motor RR via DRE) podem confundir o user se ele tentar conciliar manualmente com os 4 cards (que agora vêm de fonte diferente). | Documentação inline opcional: rodapé do bloco "Distribuição do resultado" pode ganhar nota "Valores derivados do cadastro do produto. Para a visão fiscal completa, consulte a DRE Consolidada." (recomendação @ux — fora do escopo crítico desta epic). |

---

## 10. Estimativa total

| Story | Horas |
|-------|------:|
| STORY-MRM-V7-001 | 4h |
| STORY-MRM-V7-002 | 1h |
| STORY-MRM-V7-003 | 2h |
| **Total** | **~7h** |

Recomendação @pm: alocação em sprint único (1 sprint de 1 dia ou meio sprint de 2 dias). Não há paralelização entre stories — execução sequencial (001 → 002 → 003) é a mais segura, pois 002 e 003 dependem da assinatura nova de 001.

---

## 11. O que permanece (sem mudança)

- ✅ **Motor RR** (`margin-reapuration.ts`): bit-exact preservado. `MRM_ENGINE_VERSION = 2.3.0`.
- ✅ **DRE Consolidada**: continua consumindo snapshots `tax_breakdown` do motor RR. Visão gerencial mantém Memória Cascata, Peso/Âncora, RRO, taxes_inside/outside, CSLL/IRPJ via fórmula do motor.
- ✅ **Snapshots persistidos** (`*_items.tax_breakdown`): nenhum write novo causado pela V7. Documentos finalizados V5/V6 mantêm seus snapshots fiscais.
- ✅ **ADR-003** (imutabilidade): respeitado integralmente.
- ✅ **ADR-008** (PIS/COFINS sobre base STF): respeitado integralmente.
- ✅ **ADR-009** (3 modos no motor — Epic V6): respeitado integralmente. Esta epic acresce um segundo consumidor dos 3 modos (display) mas não muda como o motor os aplica internamente.
- ✅ **`maxDiscountPercent`** (cap UI): semântica atual de pool 15% permanece coerente com a nova matemática.
- ✅ **Banner `regimeGuardActive`** (V5 AC4) e **`configWarning`** (V5 S9): permanecem funcionais quando o bloco renderiza.

---

## 12. Próximos passos

1. **@po Pax** valida este PRD (checklist 10 pontos) → GO/NO-GO.
2. **@architect Aria** opcional: avalia se ADR-010 ("Distribuição Display desacoplada do Motor RR") é necessário para formalizar a separação consumer-view vs fiscal. Não bloqueia caso seja diferido.
3. **@sm River** cria as 3 stories individuais (`docs/stories/MRM-V7-001.story.md`, `MRM-V7-002.story.md`, `MRM-V7-003.story.md`) a partir deste PRD.
4. **@dev Dex** executa stories em sequência (001 → 002 → 003).
5. **@qa Quinn** revisa via QA gate (7 checks) + validação manual nos 4 cenários × 3 páginas.
6. **@devops Gage** faz o push + deploy após APPROVED.

---

**Owner:** @pm Morgan
**Aprovação requerida:** @po Pax (validate-story-draft → este PRD); @architect Aria (opcional ADR-010)
**Constituição:** Artigo IV (No Invention) — toda statement deste PRD traça a: cenário reportado pelo user (Hyago), arquivos/funções existentes (citados com path:linha), Epics V5/V6 aprovados, ADR-003. Zero invenção.

---

## Architectural Review (Aria, 2026-05-24)

**Veredito:** **APPROVED** (escopo arquitetural validado; ADR-010 criado e promovido a ACCEPTED em paralelo a este review)

### Pontos APPROVED

1. **Separação de responsabilidades correta e auditável.** A frase-chave de governança no header ("Os 4 cards são VIEW de display do desconto — não fonte de verdade fiscal") + invariante INEGOCIÁVEL ("DRE Consolidada e snapshots fiscais persistidos NÃO são alterados") capturam exatamente o contrato arquitetural que esta epic precisa estabelecer. Formalizado em [ADR-010](../architecture/adr-010-display-vs-fiscal-snapshot.md) §2 (Camada Fiscal vs Camada Display).
2. **Zero invasão no motor RR + zero migration.** Tabela §1.4 declara explicitamente que `MRM_ENGINE_VERSION = 2.3.0` permanece, snapshots persistidos não recebem write novo, DRE Consolidada não é tocada. Esta restrição respeita integralmente ADR-001 (single source of truth), ADR-003 (snapshot invariante), ADR-004 (motor puro), ADR-008 (PIS/COFINS) e ADR-009 (3 modos). Confirma que esta epic opera estritamente na fronteira de consumo do output do motor.
3. **Reuso da função canônica existente.** §7 cita corretamente `calculateDiscountedPrice` em `src/utils/calculate-discount.ts:33` como núcleo do novo cálculo de display. Esta função já está alinhada à spec 4.0.10/4.0.11 e nunca foi conectada em produção — esta epic faz a ponte que sempre deveria ter existido. Aderente a Constitution Artigo IV (No Invention).
4. **Cenário canônico do user é o golden test.** A matemática detalhada em §1.1 (com os 4 valores esperados R$ 2.351,78 / R$ 4.703,55 / R$ 2.285,93 / R$ 1.371,56) + tabela comparativa §6 + ACs específicos (AC2, AC3, AC4, AC5) fornecem assertion bit-exact para Dev e QA. Replicado em ADR-010 §5.5 como contract test sugerido.
5. **Retrocompat de assinatura preservada.** STORY-MRM-V7-001 Task 4 declara explicitamente que callers legados continuam funcionando (`discountPct=0` default ⇒ devolve cadastro puro; itens sem `commission_percent`/`profit_percent` caem em fallback do snapshot via `extractItemValues` original). Risco DR4 mitigado.

### Concerns (não bloqueantes)

- **(MINOR — clareza)** §7 lista `calculateDiscountedPrice` mas vale reforçar no JSDoc da função pós-refactor que `discountPercent` ali é **% DA MARGEM**, não % absoluto sobre o preço. A conversão `discountAbsolute = salePrice × (discountPct / 100)` → `discountPercentOfMargin = (discountAbsolute / margin) × 100` foi corretamente apontada na STORY-MRM-V7-001 Task 2 — Dev precisa garantir esse cast no callsite para evitar bug de unidade. Pseudocódigo de referência está em ADR-010 §5.2.
- **(MINOR — Risco DR2 do ADR-010)** Snapshots V5/V6 reabertos via UI vão mostrar valores diferentes do momento da criação (display recalcula a cada render). PRD V7 §9 R1 captura o risco e propõe documentação inline (tooltip ou nota no rodapé). Recomendação @architect: adicionar uma nota visual leve no bloco "Distribuição do resultado" do tipo: *"Valores derivados do cadastro do produto. Para a apuração fiscal, consulte a DRE Consolidada."* — pode ficar fora do escopo crítico desta epic mas o ticket de UX deveria ser criado em paralelo.
- **(MINOR — ordem de execução)** STORY-MRM-V7-002 (early-return Cenário B) depende da assinatura nova de STORY-MRM-V7-001 (`hasDiscount` agora driven por `discountPct > 0` explícito, não mais por `totalGross > totalNet`). Execução 001 → 002 → 003 (sequencial) está correta no PRD — Dev deve respeitar essa ordem.

### Decisão de ADR

- **ADR-010 criado** em `docs/architecture/adr-010-display-vs-fiscal-snapshot.md` com status **ACCEPTED** (data 2026-05-24).
- Formaliza a separação Camada Fiscal vs Camada Display que este PRD propõe.
- Documenta as 4 alternativas consideradas (A rejeitada pelo Founder, B/D rejeitadas por inviabilidade arquitetural, C escolhida — esta epic).
- Lista o gate operacional final: QA-VALIDATION-EPIC-MRM-V7.md por Quinn + validação manual do Hyago em staging com cenário canônico × 3 modos × 3 páginas.

### Próximos passos arquiteturais

1. **@sm River** cria as 3 stories individuais (`docs/stories/MRM-V7-001.story.md`, `MRM-V7-002.story.md`, `MRM-V7-003.story.md`) a partir deste PRD com referência cruzada a ADR-010 §5.2 (pseudocódigo) e §5.5 (contract test) no Dev Notes.
2. **@qa Quinn** elabora QA-VALIDATION-EPIC-MRM-V7.md cobrindo: (a) display em 4 cenários × 3 modos, (b) Cenário B (DOM null), (c) propagação em 3 call-sites, (d) regressão zero em motor RR + DRE, (e) snapshot read-only V5/V6.
3. **@dev Dex** executa 001 → 002 → 003 sequencial com o pseudocódigo do ADR-010 §5.2 como referência.

**Aria, 2026-05-24** — APPROVED. Pode prosseguir para criação de stories.

---

## QA Review (Quinn, 2026-05-24)

**Veredito:** **APPROVED**

- **Cenário canônico do user é o golden test bit-exact.** §1.1 do PRD traz a derivação matemática completa (Comissão R$ 2.351,78 / Lucro R$ 4.703,55 / IRPJ R$ 2.285,93 / CSLL R$ 1.371,56). QA-VALIDATION §3 C2 operacionaliza isso como `toBeCloseTo(2351.78, 2)` — falha aqui bloqueia release (QG-001 BLOCKING).
- **Acceptance Criteria globais (§5) são testáveis e auditáveis.** AC1-AC10 cobrem ocultação Cenário B, 3 modos de desconto, retrocompat snapshots V5/V6, regressão zero em DRE/snapshots persistidos, regime MEI/SN com `hidesProfitTaxes`. Cada AC tem método de verificação claro.
- **Riscos R1-R5 (§9) bem dimensionados.** R1 (snapshots antigos divergem em display recalculado) está alinhado com QR-M1 da QA-VALIDATION — mitigação via tooltip recomendada (QG-005 NON-BLOCKING). R2 (clamp SELLER) está coberto via teste C3. R3-R5 baixa severidade.
- **Escopo minimalista respeita restrição do Founder.** Zero nova tabela/coluna, zero migration, zero alteração no motor RR (`MRM_ENGINE_VERSION = 2.3.0` mantido). 3 stories sequenciais (001→002→003) em ~7h totais. Reuso de `calculateDiscountedPrice` honra Constitution Artigo IV (No Invention).
- **Concern QA cobrindo conversão de unidade (HIGH):** `discountPct → discountPercentOfMargin` (PRD §4 STORY-001 Task 2 + ADR-010 §5.2) é o ponto onde bug aqui INVERTE tudo. Code review obrigatório de @qa Quinn na PR antes de merge — listado como QR-H1 + QG-001 BLOCKING na QA-VALIDATION.

**Próximos passos pelo Quinn:** @sm River cria 3 stories (MRM-V7-001/002/003); @dev Dex executa sequencial respeitando ordem 001→002→003; QA Quinn revisa PR com checklist §11 da QA-VALIDATION-EPIC-MRM-V7.md antes de release.

**Quinn, 2026-05-24** — APPROVED. PRD pronto para sprint de implementação.
