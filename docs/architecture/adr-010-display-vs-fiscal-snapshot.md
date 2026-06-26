# ADR-010: Separação Motor RR (snapshot fiscal) vs Distribuição Display (UI consumer-friendly)

> ⚠️ **SUPERSEDED (PARCIAL) por [ADR-019](./adr-019-cards-etapa16-rro.md) — 2026-06-26.**
> A camada **Display-First de Comissão/Lucro** desta ADR (recalcular a partir do cadastro
> via `calculateDiscountedPrice` quando há desconto) foi REVOGADA pelo BUG-CARDS-RRO-001:
> os cards inflavam por proporção simples em vez de espelhar a Etapa 16 do Motor RRO.
> A partir do ADR-019, a Etapa 16 (snapshot `tax_breakdown.new_*` / runtime `motor_new_*`)
> é a fonte de verdade de Comissão e Lucro; o display-first sobrevive apenas como FALLBACK
> para itens sem fonte do motor. A separação conceitual snapshot-fiscal × display e o
> tratamento de IRPJ/CSLL no fallback permanecem válidos.

**Status:** SUPERSEDED (PARCIAL) BY ADR-019 (2026-06-26) — originalmente ACCEPTED (Aria, 2026-05-24 — promoção formal após review do PRD EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY v1.0; gates de QA Quinn pendentes em QA-VALIDATION-EPIC-MRM-V7.md mas escopo arquitetural está validado)
**Data:** 2026-05-24
**Author:** @architect Aria
**Decididores:** @architect Aria (arquitetura), @pm Morgan (PRD V7), Hyago (Founder — reportou bug visual em produção pós V6)
**Contexto:** Motor RR pós Epic MRM-V6 (`MRM_ENGINE_VERSION = 2.3.0`) — Epic EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY
**Engine baseline:** `MRM_ENGINE_VERSION = 2.3.0` (Epic V6 em produção)
**Engine alvo:** **inalterado** — `2.3.0` permanece. Esta ADR é estritamente sobre **fronteira de consumo** do output do motor, não sobre o motor em si.

---

## 1. Contexto

### 1.1 Sintoma observado em produção pós Epic V6

O Founder Hyago testou o sistema em produção após o deploy do Epic MRM-V6 (3 modos de desconto reativados, `MRM_ENGINE_VERSION = 2.3.0`) e identificou que os 4 cards do bloco "Distribuição do resultado" — exibidos em orçamento, balcão de vendas e visualização de pedidos — **não batem com os valores cadastrados no produto**, divergindo por uma ordem de magnitude (~18×).

**Cenário canônico do user (reportado em 2026-05-23):**

- Produto: preço unitário R$ 141.106,60
- Cadastro: Comissão 5% (R$ 7.055,33) / Lucro 10% (R$ 14.110,66)
- Desconto: 10% absoluto (R$ 14.110,66)
- Modo: PROPORTIONAL
- Tenant: IRPJ 1,8% / CSLL 1,08% (Lucro Real)

| Card | Esperado pelo user (consumer view) | Atual em produção (motor RR) |
|------|-----------------------------------:|-----------------------------:|
| Comissão | R$ 2.351,78 | R$ 372,89 |
| Lucro | R$ 4.703,55 | R$ 745,78 |
| IRPJ | R$ 2.285,93 | R$ 134,24 |
| CSLL | R$ 1.371,56 | R$ 80,54 |

### 1.2 Causa raiz (técnica)

O motor RR (`src/utils/margin-reapuration.ts`) — fonte de verdade fiscal canônica conforme [ADR-001](./adr-001-single-source-of-truth-motor.md) — reapura o RRO completo (13 etapas) durante o cálculo, o que inclui **deduzir despesas operacionais do tenant** (`MOD + DOP`) na Etapa 7. Como o produto **já foi precificado** com essas mesmas despesas embutidas no coeficiente de markup (na precificação inicial em `/produtos`), ocorre **dupla contagem**:

```
Motor RR esmaga RRO porque deduz DOP novamente:
  RB (141.106,60) − IMP (~7%) − CP (~75% — já inclui DOP do markup) − MOD − DOP (novamente, ~70%)
  ⇒ RRO ≈ R$ 1.333,46 (~1% do preço)

Distribuição proporcional do RRO esmagado:
  Comissão = RRO × peso_comm = 1.333,46 × (5/15) × ajuste = R$ 372,89
  (~18× menor que o esperado pelo cadastro)
```

`src/utils/residual-distribution.ts:112-144` consome `tax_breakdown.new_commission`, `tax_breakdown.new_profit`, `tax_breakdown.new_csll`, `tax_breakdown.new_irpj` diretamente do snapshot do motor RR — herdando integralmente a distorção.

### 1.3 Função canônica disponível mas não usada

`src/utils/calculate-discount.ts:33-80` (`calculateDiscountedPrice`) já implementa **exatamente** a spec correta de "Desconto com Preservação Operacional" (spec 4.0.10 / 4.0.11), incluindo os 3 modos (PROPORTIONAL com peso real do cadastro / SELLER_REDUCTION / PROFIT_REDUCTION). O header do arquivo declara:

> *"NOTA: esta função é a referência canônica da spec 'Desconto com Preservação Operacional' (precificação por dentro). Atualmente os call sites de produção (orçamentos e agenda) implementam a redistribuição inline com proporção real. Mantida aqui alinhada à spec para reuso futuro e evitar regressão silenciosa."*

Em outras palavras: a função correta existe, está testada conceitualmente como referência canônica, mas **nunca foi conectada ao bloco "Distribuição do resultado"**. O bloco hoje consome o motor RR (fonte fiscal) quando deveria consumir o cadastro do produto (fonte consumer/display).

### 1.4 Problema arquitetural a resolver

Há duas perguntas legítimas para um mesmo orçamento, com **respostas matematicamente diferentes** e **ambas corretas no seu domínio**:

| Pergunta | Domínio | Resposta correta |
|----------|---------|------------------|
| **"Quanto a Receita Federal vai me cobrar de IRPJ/CSLL/PIS/COFINS e quanto sobra de RRO depois de toda a apuração tributária + despesas?"** | Fiscal / DRE Consolidada / Auditoria | Motor RR (13 etapas, snapshot imutável ADR-003) |
| **"Quanto da comissão e do lucro cadastrados no produto sobra para o vendedor e para o dono depois deste desconto?"** | Display / Negociação / UX | `calculateDiscountedPrice` sobre cadastro do produto |

Hoje o bloco "Distribuição do resultado" responde a (2) usando os dados de (1) — daí a confusão visual. Esta ADR formaliza a separação.

### 1.5 Por que isto NÃO é um bug do motor RR

O motor RR está **matematicamente correto** ao calcular RRO = R$ 1.333,46 sob suas premissas: ele reapura tributos sobre Âncora, deduz CP+MOD+DOP, e o resíduo é de fato ~1% do preço quando o produto carrega 70% de DOP no markup. Esse valor é o que vai para a DRE Consolidada (visão gerencial) e para o snapshot fiscal (`tax_breakdown` persistido em DB) — preservado em `peso_op_interna`, `ancora_interna`, `taxes_outside_base`, `rro`, `new_*` por força de [ADR-003 (Snapshot fiscal invariante)](./adr-003-snapshot-fiscal-invariante.md) e [ADR-009 (3 modos de desconto)](./adr-009-discount-modes-revival.md).

O problema é que os **cards de UI** estão respondendo à pergunta errada com os dados certos para outra pergunta.

---

## 2. Decisão

**Separar formalmente, em duas camadas distintas, o consumo do output do Motor RR:**

### 2.1 Camada Fiscal — Snapshot do Motor RR (inalterada)

| Atributo | Valor |
|----------|-------|
| **Fonte** | `src/utils/margin-reapuration.ts` (motor puro, ADR-001/ADR-004) |
| **Output** | `TaxBreakdown` persistido em `*_items.tax_breakdown` (JSONB) |
| **Consumidores** | DRE Consolidada (visão gerencial), relatórios fiscais, auditoria, exports oficiais, integração contábil futura |
| **Imutabilidade** | **Imutável** após `status ∈ {approved, done}` (ADR-003) |
| **Quando recalcula** | Apenas em `draft` (D2 — `use_snapshot_rates`) |
| **Semântica do RRO** | Resíduo de toda a apuração fiscal + operacional. É o que sobra **depois** que IMP, CP, MOD, DOP foram deduzidos. |
| **Status** | **NÃO é alterado por esta ADR. Permanece bit-exact preservado.** |

### 2.2 Camada Display — Distribuição UI consumer-friendly (NOVA)

| Atributo | Valor |
|----------|-------|
| **Fonte** | `src/utils/calculate-discount.ts:33` (`calculateDiscountedPrice`) + alíquotas tenant aplicadas diretamente sobre `totalNet` |
| **Output** | `ResidualDistribution` calculada em memória (view-time) por `computeResidualDistribution` refatorada |
| **Consumidores** | 4 cards do bloco "Distribuição do resultado" em orçamento, balcão de vendas, pedido (UI only) |
| **Imutabilidade** | **View-time** — recalculado a cada render. NÃO persistido. NÃO substitui o snapshot fiscal. |
| **Quando recalcula** | Sempre que UI renderiza (mudança de desconto, modo, quantidade, etc.) |
| **Semântica de Comissão/Lucro** | "Quanto da Comissão/Lucro **cadastrados no produto** sobra após este desconto" — derivado de `calculateDiscountedPrice(salePrice, costWithTaxes, discountPctMargin, mode, commission_percent, profit_percent)` |
| **Semântica de IRPJ/CSLL** | `tenantTaxRates.irpj × totalNet` e `tenantTaxRates.csll × totalNet` (cálculo direto, sem motor RR). Respeita `hidesProfitTaxes` para MEI/SN. |
| **Status** | **NOVA camada introduzida por esta ADR + Epic V7.** |

### 2.3 Frase-chave de governança

> **"O motor RR é a fonte de verdade FISCAL. A distribuição display é a fonte de verdade VISUAL para o vendedor/usuário. As duas convivem porque respondem a perguntas diferentes; nenhuma substitui a outra."**

### 2.4 Decisão de UX complementar (Cenário B)

Quando `discount_pct === 0`, o bloco "Distribuição do resultado" inteiro fica **oculto** na UI. Decisão validada pelo Founder no PRD V7 §1.3 (Cenário B). Justificativa: quando não há desconto, o usuário já enxerga Comissão/Lucro corretos diretamente no cadastro do item — exibir o bloco apenas duplica informação e gera ruído visual.

---

## 3. Consequências

### 3.1 Positivas

- **UX coerente com o cadastro do produto.** Vendedor vê no card "Comissão" exatamente o valor cadastrado (menos o desconto, conforme o modo escolhido). Elimina a divergência de ~18× reportada em produção.
- **Função pronta reaproveitada.** `calculateDiscountedPrice` existe desde antes de V5 como referência canônica da spec 4.0.10/4.0.11 — esta ADR só conecta o que sempre deveria ter estado conectado. Zero invenção (Constitution Artigo IV).
- **Motor RR e DRE Consolidada intactos.** Toda a infraestrutura fiscal (snapshots imutáveis, ADR-003; bit-exact, ADR-009; PIS/COFINS, ADR-008) permanece preservada. Auditoria e contábil continuam consumindo a fonte canônica.
- **Zero migration Supabase.** Nenhuma coluna nova. Nenhum CHECK/trigger novo. Schema permanece estável.
- **Custo de implementação mínimo.** PRD V7 estima ~7h totais (3 stories sequenciais 001→002→003).
- **Separação de responsabilidades clara.** Os dois domínios (fiscal vs display) ficam explicitamente nomeados na arquitetura, evitando que futuros desenvolvedores cometam o mesmo equívoco de ligar UI ao motor fiscal.

### 3.2 Negativas / Trade-offs

- **Divergência intencional entre "Cards Distribuição" e "Distribuição do RRO" na DRE.** O mesmo orçamento mostrará dois conjuntos de números (UI cards ≠ DRE Consolidada). Isto **NÃO é bug — é a consequência direta de a UI responder a outra pergunta.** Mitigação: documentação inline (tooltip ou nota no rodapé do bloco, opcional na UI — não bloqueia esta ADR) explicando que cards são "valores de cadastro pós-desconto" e DRE é "apuração fiscal completa".
- **Snapshots V5/V6 reabertos via UI mostrarão valores diferentes do que mostravam quando foram criados.** Como display recalcula a cada render via `calculateDiscountedPrice` (e não lê mais do `tax_breakdown`), documentos antigos abertos no balcão ou no histórico passarão a exibir cards consistentes com o cadastro atual — não com o snapshot persistido. Mitigação: aceitar por consistência ponta-a-ponta (decisão Founder no PRD V7 R1); snapshots persistidos continuam fonte de verdade fiscal — visíveis pela DRE Consolidada.
- **Cobertura mental adicional.** Desenvolvedores precisam entender quando consumir motor RR (snapshot fiscal) vs `calculateDiscountedPrice` (display). Mitigação: JSDoc explícito em ambas as funções + esta ADR referenciada no header de `residual-distribution.ts`.

### 3.3 Neutras

- **`MRM_ENGINE_VERSION` permanece `2.3.0`.** Nenhuma mudança no motor justifica bump.
- **Cobertura de testes cresce em `residual-distribution.test.ts`** com cenários do user (5+ cenários para os 3 modos × com/sem desconto × regime hides) — manutenção mais rica mas isolada.
- **`coerceLegacyDiscountMode`** (`src/config/feature-flags.ts:83-107`) continua intocada — esta ADR não altera o ciclo de vida dos modos no motor.

### 3.4 Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| DR1 | Vendedor confunde "Comissão do card" com "Comissão da DRE" e questiona divergência | MÉDIA | Documentação inline opcional (rodapé "Valores derivados do cadastro do produto. Para a visão fiscal completa, consulte a DRE Consolidada.") — recomendação @ux fora do escopo bloqueante. Tooltip futuro pode explicar "este valor reflete o cadastro do produto, não a apuração fiscal." |
| DR2 | Snapshot V5/V6 reaberto mostra valores diferentes do momento da criação | MÉDIA | Aceito pela diretriz do Founder (PRD V7 R1) — display sempre reflete cadastro atual; snapshot fiscal continua intacto no DB e visível pela DRE. |
| DR3 | Em `SELLER_REDUCTION`, desconto excede a comissão original (clamp em 0) | BAIXA | Clamp dentro de `computeResidualDistribution` (idêntico ao tratamento já feito por `maxDiscountPercent` do Epic V6 + AR1 do ADR-009 — fallback nativo). Optional warning amarelo "desconto excede comissão neste modo". |
| DR4 | Itens sem `commission_percent`/`profit_percent` informados (snapshot persistido sem dados originais) | BAIXA | Fallback documentado em PRD V7 §4 STORY-001 Task 4: cai em retrocompat com `tax_breakdown.new_commission` (modo legacy). Marca `requiresReview=true` para sinalizar ao user. |
| DR5 | Cobertura limitada de testes de componente (sem @testing-library/react 19 estável) impede assertion direta de Cenário B no DOM | BAIXA | Cobrir via teste de lógica (`hasDiscount=false` ⇒ retorno `null` direto). Validação manual nas 3 páginas + revisão QA Quinn. Quando lib estabilizar, adicionar teste de render (TODO no header). |

---

## 4. Alternativas consideradas

### A — Alimentar cards diretamente do motor RR (estado atual em produção)

- **Descrição:** Manter `residual-distribution.ts` lendo `tax_breakdown.new_*` do snapshot do motor RR. Aceitar que cards mostrem valores fiscais (RRO esmagado por dupla contagem).
- **Veredito:** **REJEITADA explicitamente pelo Founder** (Hyago, 2026-05-23 após teste em produção).
- **Por quê:** O usuário enxerga Comissão R$ 372 quando cadastrou Comissão R$ 7.055 — quebra de confiança imediata. Não há narrativa de UX que reconcilie essa diferença de 18× para um vendedor que está negociando ali na hora. Reclamação #1 pós-V6.

### B — Recalcular o motor RR para não fazer dupla contagem

- **Descrição:** Refatorar `margin-reapuration.ts` para detectar quando produto já foi precificado com DOP embutido e não deduzir DOP novamente na Etapa 7.
- **Veredito:** **REJEITADA.**
- **Por quê:**
  - Quebra DRE Consolidada (que assume motor RR = apuração fiscal completa).
  - Quebra ADR-003 — snapshots fiscais existentes ficariam inconsistentes com nova lógica do motor.
  - Bump MAJOR de `MRM_ENGINE_VERSION` (2.3.0 → 3.0.0) com toda a complexidade de migração de snapshots.
  - Cria ambiguidade fiscal: "o RRO é resíduo de quê, exatamente?" — motor perde clareza semântica para resolver problema de UI.
  - Risco de regressão em integração contábil e relatórios fiscais.

### C — Adicionar segundo "motor display" via `calculateDiscountedPrice` (ESCOLHIDA)

- **Descrição:** Manter motor RR canônico para fiscal; criar camada display em `residual-distribution.ts` que consome `calculateDiscountedPrice` + alíquotas tenant para alimentar os 4 cards.
- **Veredito:** **ACEITA — esta ADR.**
- **Por quê:**
  - Função canônica `calculateDiscountedPrice` já existe e implementa exatamente a semântica desejada (spec 4.0.10/4.0.11 com 3 modos).
  - Zero alteração no motor RR — preserva ADR-001, ADR-003, ADR-004, ADR-008, ADR-009 integralmente.
  - Custo de implementação minúsculo (~7h pelo PRD V7).
  - Separação de responsabilidades formal e auditável (esta ADR).
  - Não invasivo: callers existentes que ainda passem só `(items, totalGross, totalNet, regime, tenantTaxRates)` continuam funcionando via parâmetros opcionais novos.

### D — Migration Supabase para normalizar despesas no banco

- **Descrição:** Criar tabela paralela `pricing_decomposition` com componentes separados (preço base, comissão isolada, lucro isolado, DOP isolado) para que motor RR não precise inferir.
- **Veredito:** **REJEITADA.**
- **Por quê:**
  - Escopo enorme — migração de 144+ tabelas existentes, backfill de produtos históricos, alteração de fluxo de precificação em `/produtos`.
  - Risco fiscal: backfill pode alterar tributos calculados em vendas fechadas (violação ADR-003).
  - Resolve problema de UI inventando complexidade de domínio — quebra Constitution Artigo IV.
  - Alternativa C resolve com 7h vs estimativa D de 80-120h.

---

## 5. Implementation Notes

### 5.1 Local exato das mudanças

| Arquivo | Linhas-alvo | Mudança |
|---------|-------------|---------|
| `src/utils/residual-distribution.ts` | 112-144 (`extractItemValues`), 175-268 (`computeResidualDistribution`) | Aceitar novos parâmetros `discountPct`, `discountMode`, `costWithTaxes` (= total − margem original). Quando `discountPct > 0`: derivar `commission`/`profit` via `calculateDiscountedPrice`. Quando `discountPct === 0`: usar diretamente `commission_percent × unit_price × quantity` e análogo para `profit_percent`. |
| `src/utils/residual-distribution.ts` | (mesmo arquivo) | IRPJ/CSLL: substituir consumo de `tax_breakdown.new_csll/new_irpj` por cálculo direto `tenantTaxRates.csll × totalNet` e `tenantTaxRates.irpj × totalNet`. Respeitar `hidesProfitTaxes` (MEI/SN) — comportamento V5 mantido. |
| `src/page-parts/shared/residual-distribution-block.component.tsx` | 99-107 (início do return do componente) | Adicionar early-return `if (!distribution.hasDiscount) return null` (Cenário B). |
| `src/hooks/use-residual-distribution.ts` | (toda a assinatura) | Aceitar novos parâmetros `discountPct`, `discountMode`. Propagar à chamada interna de `computeResidualDistribution`. |
| `src/pages/orcamentos/index.tsx` | (call-site do hook) | Passar `discount_pct` e `discount_mode` do form/state ao hook. |
| `src/pages/vendas/index.tsx` | (call-site do hook — 2 visões: drawer balcão + `selectedSale`) | Passar `discount_pct`/`discount_mode` em ambas visões. Visão `selectedSale` (venda persistida) ignora `tax_breakdown` para os 4 cards e recalcula via display. |
| `src/pages/pedidos/index.tsx` | (call-site do hook na visualização) | Mesma propagação. |

### 5.2 Algoritmo proposto (pseudocódigo arquitetural — Dev refina implementação)

```typescript
// src/utils/residual-distribution.ts — refator de computeResidualDistribution

export function computeResidualDistribution(
  items: ResidualItemInput[],
  totalGross: number,
  totalNet: number,
  regime: TaxRegime | null,
  tenantTaxRates?: TenantOriginalTaxRates,
  // NOVOS PARÂMETROS (opcionais — retrocompat):
  discountPct: number = 0,                       // 0-100, % absoluto sobre preço bruto
  discountMode: DiscountMode = 'PROPORTIONAL',   // ADR-009
): ResidualDistribution {
  const hidesProfitTaxes = isHiddenRegime(regime)
  const hasDiscount = discountPct > 0  // semântica atualizada — driver é o flag explícito

  // Agregação display por item via calculateDiscountedPrice
  let commAmount = 0
  let profitAmount = 0
  let itemsWithoutSource = 0

  for (const item of items) {
    const unitPrice = Number(item.unit_price) || 0
    const qty = Number(item.quantity) || 0
    const salePrice = unitPrice * qty
    const commPct = Number(item.commission_percent) || 0
    const profPct = Number(item.profit_percent) || 0

    if (commPct === 0 && profPct === 0) {
      // Fallback legacy — snapshot persistido sem cadastro original
      const v = extractItemValues(item)
      commAmount += v.commission
      profitAmount += v.profit
      if (!v.hasSource) itemsWithoutSource += 1
      continue
    }

    if (discountPct === 0) {
      // Cadastro puro (sem desconto, sem motor)
      commAmount += (commPct / 100) * salePrice
      profitAmount += (profPct / 100) * salePrice
    } else {
      // Display via calculateDiscountedPrice
      const margin = salePrice * ((commPct + profPct) / 100)
      const costWithTaxes = salePrice - margin
      // CONVERSÃO: discountPct (% sobre preço) → discountPercentOfMargin (% da margem)
      const discountAbsolute = salePrice * (discountPct / 100)
      const discountPercentOfMargin = margin > 0 ? (discountAbsolute / margin) * 100 : 0

      const result = calculateDiscountedPrice(
        salePrice,
        costWithTaxes,
        discountPercentOfMargin,
        discountMode,
        commPct,
        profPct,
      )

      const commissionOriginal = (commPct / 100) * salePrice
      const profitOriginal = (profPct / 100) * salePrice

      // Clamp em 0 (DR3): commission ou profit pós-redução não pode ser negativa
      commAmount += Math.max(0, commissionOriginal - result.commissionReduction)
      profitAmount += Math.max(0, profitOriginal - result.profitReduction)
    }
  }

  // IRPJ/CSLL: cálculo direto, sem motor RR (ADR-010 §2.2)
  const irpjAmount = hidesProfitTaxes ? 0 : (Number(tenantTaxRates?.irpj) || 0) * totalNet
  const csllAmount = hidesProfitTaxes ? 0 : (Number(tenantTaxRates?.csll) || 0) * totalNet

  // Restante da função (% original, % efetivo, montagem do ResidualDistribution) — inalterado
  // ...
}
```

### 5.3 Fallback de retrocompat (modo legacy)

Quando um item NÃO tem `commission_percent` nem `profit_percent` informados (cenário: snapshot persistido antigo aberto em UI read-only sem dados originais — ex: pedido importado de versão pré-V5), a função cai no `extractItemValues` original que lê `tax_breakdown.new_commission`/`new_profit`. Este caminho deve ser **explicitamente documentado como "modo legacy"** via JSDoc e marca `requiresReview=true` no `ResidualDistribution` para que a UI sinalize ao user que valores são derivados de snapshot antigo.

### 5.4 Engine version (sem bump)

`MRM_ENGINE_VERSION` permanece `'2.3.0'`. **Nenhum bump justificado** porque o motor RR não é tocado. Esta ADR opera estritamente na fronteira de consumo do output do motor (camada de UI display) — escopo formal: não é arquitetura do motor.

### 5.5 Contract test sugerido (cenário do user)

Adicionar em `src/utils/__tests__/residual-distribution.test.ts`:

```typescript
describe('ADR-010 — Distribuição Display vs Snapshot Fiscal', () => {
  const items: ResidualItemInput[] = [{
    unit_price: 141106.60,
    quantity: 1,
    commission_percent: 5,
    profit_percent: 10,
  }]
  const totalGross = 141106.60
  const tenantTaxRates = { irpj: 0.018, csll: 0.0108 }

  it('Cenário user SEM desconto: cards batem com cadastro puro', () => {
    const result = computeResidualDistribution(items, totalGross, totalGross, 'LUCRO_PRESUMIDO', tenantTaxRates, 0, 'PROPORTIONAL')
    expect(result.commission.amount).toBeCloseTo(7055.33, 2)
    expect(result.profit.amount).toBeCloseTo(14110.66, 2)
    expect(result.irpj.amount).toBeCloseTo(141106.60 * 0.018, 2)
    expect(result.csll.amount).toBeCloseTo(141106.60 * 0.0108, 2)
    expect(result.hasDiscount).toBe(false)
  })

  it('Cenário user COM 10% desconto PROPORTIONAL', () => {
    const totalNet = 141106.60 - 14110.66
    const result = computeResidualDistribution(items, totalGross, totalNet, 'LUCRO_PRESUMIDO', tenantTaxRates, 10, 'PROPORTIONAL')
    expect(result.commission.amount).toBeCloseTo(2351.78, 2)
    expect(result.profit.amount).toBeCloseTo(4703.55, 2)
    expect(result.irpj.amount).toBeCloseTo(totalNet * 0.018, 2)
    expect(result.csll.amount).toBeCloseTo(totalNet * 0.0108, 2)
  })

  it('SELLER_REDUCTION: lucro intacto, comissão clampada', () => {
    const totalNet = 141106.60 - 14110.66
    const result = computeResidualDistribution(items, totalGross, totalNet, 'LUCRO_PRESUMIDO', tenantTaxRates, 10, 'SELLER_REDUCTION')
    expect(result.commission.amount).toBeCloseTo(0, 2)  // clamp (DR3)
    expect(result.profit.amount).toBeCloseTo(14110.66, 2)
  })

  it('PROFIT_REDUCTION: comissão intacta, lucro clampado', () => {
    const totalNet = 141106.60 - 14110.66
    const result = computeResidualDistribution(items, totalGross, totalNet, 'LUCRO_PRESUMIDO', tenantTaxRates, 10, 'PROFIT_REDUCTION')
    expect(result.commission.amount).toBeCloseTo(7055.33, 2)
    expect(result.profit.amount).toBeCloseTo(0, 2)  // clamp se desconto > lucro original; senão 14110.66 - 14110.66 = 0
  })

  it('Regime MEI: IRPJ/CSLL = 0 (hidesProfitTaxes)', () => {
    const result = computeResidualDistribution(items, totalGross, totalGross, 'MEI', tenantTaxRates, 0, 'PROPORTIONAL')
    expect(result.irpj.amount).toBe(0)
    expect(result.csll.amount).toBe(0)
    expect(result.hidesProfitTaxes).toBe(true)
  })
})
```

---

## 6. Backward Compatibility

### 6.1 Snapshots fiscais persistidos (DB)

| Snapshot | `tax_breakdown` no DB | Comportamento V7 (UI display) | Comportamento V7 (DRE Consolidada) |
|----------|----------------------|-------------------------------|------------------------------------|
| Documento V5 antigo (`status='approved'/'done'`) | Imutável, contém `new_*` do motor RR V5 | UI cards **recalculam via display** (NÃO leem `new_*`); valores podem divergir do snapshot — divergência intencional documentada (DR2) | **Inalterado** — continua lendo `tax_breakdown` para Memória Cascata, Peso, RRO, taxes_inside/outside |
| Documento V6 (`status='approved'/'done'`) com `discount_mode` ∈ {PROPORTIONAL, SELLER, PROFIT} | Imutável | UI cards recalculam via display + respeitam `discount_mode` herdado | **Inalterado** |
| Documento V7+ novo | Igual ao V6 — motor RR continua gravando `tax_breakdown` da mesma forma | UI cards recalculam display + bloco oculto se `desc=0` | **Inalterado** |
| Documento legacy pré-V5 sem `commission_percent`/`profit_percent` em items | Pode ou não ter `tax_breakdown` | Cai em **fallback legacy** (`extractItemValues` original lê `tax_breakdown.new_*`); marca `requiresReview=true` | **Inalterado** |

**Garantia formal:** Nenhum write em `tax_breakdown` é causado por esta ADR ou pelo Epic V7. ADR-003 (imutabilidade) preservado integralmente. Snapshots V5/V6 continuam servindo DRE/auditoria sem alteração.

### 6.2 Hooks e funções existentes

- `useResidualDistribution`: ganha parâmetros opcionais `discountPct`, `discountMode`. Callers que não passam continuam recebendo comportamento legacy (modo fallback via `extractItemValues`).
- `computeResidualDistribution`: ganha mesmos parâmetros opcionais. Mesma garantia.
- `calculateDiscountedPrice`: **zero mudança**. Função já está pronta e correta.
- `ResidualDistributionBlock`: ganha early-return `if (!hasDiscount) return null`. Prop `discountMode` (V6) continua funcional.

---

## 7. Test Strategy Reference

A estratégia completa de testes desta ADR vive em **QA-VALIDATION-EPIC-MRM-V7.md** (será criada por @qa Quinn em paralelo a este ADR). Resumo do que é exigido:

| Camada | Test | Responsável | Story |
|--------|------|-------------|-------|
| Display — cenário user sem desconto | `commission=7.055,33; profit=14.110,66; irpj=141.106,60×1,8%; csll=141.106,60×1,08%` | @qa + @dev | STORY-MRM-V7-001 |
| Display — cenário user 10% PROPORTIONAL | `commission=2.351,78; profit=4.703,55; irpj=2.285,93; csll=1.371,56` | @qa + @dev | STORY-MRM-V7-001 |
| Display — SELLER/PROFIT | clamp em 0, rubrica intacta na contraparte | @qa + @dev | STORY-MRM-V7-001 |
| Display — regime MEI | `hidesProfitTaxes=true ⇒ irpj=0, csll=0` | @qa + @dev | STORY-MRM-V7-001 |
| UI — Cenário B (ocultação) | `hasDiscount=false ⇒ componente retorna null` | @qa | STORY-MRM-V7-002 |
| Propagação — 3 call-sites | orcamentos/vendas drawer/vendas selectedSale/pedidos visualização exibem cards consistentes nos 3 modos | @qa (manual) + @dev | STORY-MRM-V7-003 |
| **Regressão zero motor RR** | Suíte `margin-reapuration*.test.ts` + `mrm-snapshot-compat.test.ts` passa 100% sem alteração | @qa | gate global |
| **Regressão zero DRE** | Suíte `dre-consolidada.test.ts` passa 100% sem alteração | @qa | gate global |
| Snapshot V5/V6 read-only | Documento antigo reabre sem erro; cards recalculam display (divergência DR2 documentada) | @qa (manual) | STORY-MRM-V7-003 |

**Gate de Accepted desta ADR:** Veredito APPROVED de QA-VALIDATION-EPIC-MRM-V7.md por Quinn + validação manual do Hyago no cenário canônico (3 modos × com/sem desconto × 3 páginas) em ambiente de staging antes do deploy de produção.

---

## 8. Relation to Other ADRs

| Relação | ADR | Detalhe |
|---------|-----|---------|
| **Complementa** | [ADR-009 — Discount Modes Revival](./adr-009-discount-modes-revival.md) | Os 3 modos (PROPORTIONAL, SELLER_REDUCTION, PROFIT_REDUCTION) continuam funcionando exatamente como ADR-009 especifica — agora aplicados também na camada display via `calculateDiscountedPrice`. Display herda a mesma semântica do motor (alinhamento entre as duas camadas no que tange à intenção do user). |
| **Builds on** | [ADR-003 — Snapshot Fiscal Invariante](./adr-003-snapshot-fiscal-invariante.md) | Esta ADR **não viola** ADR-003 — apenas separa as camadas de consumo. Snapshots persistidos permanecem imutáveis (status approved/done). UI display recalcula em memória sem persistir. |
| **Respects (não substitui)** | [ADR-004 — Motor puro vs policies](./adr-004-separacao-motor-pure-vs-policies.md) | Motor RR continua puro (sem conhecimento de UI, sem side effects). Esta ADR introduz uma **terceira camada** (Display) ortogonal à dicotomia motor/policies — Display é um **consumidor** do motor, não uma policy. |
| **Respects** | [ADR-001 — Single source of truth do motor](./adr-001-single-source-of-truth-motor.md) | Motor RR continua sendo a fonte canônica única do cálculo fiscal. `calculateDiscountedPrice` NÃO é um segundo motor fiscal — é uma função utilitária de UI sobre semântica de cadastro. Não há duplicação de lógica tributária. |
| **Respects** | [ADR-002 — Semver engine_version](./adr-002-versionamento-engine-version.md) | Nenhum bump de `MRM_ENGINE_VERSION` justificado (motor não tocado). `2.3.0` permanece. |
| **Respects** | [ADR-008 — PIS/COFINS apuração](./adr-008-pis-cofins-apuracao-formula.md) | Fórmula PIS/COFINS está dentro do motor RR — não é tocada. IRPJ/CSLL na camada display usa alíquotas tenant diretas (não duplicação de fórmula tributária). |

---

## 9. Change Log

| Data | Versão | Status | Autor | Descrição |
|------|--------|--------|-------|-----------|
| 2026-05-24 | 1.0 | **PROPOSED → ACCEPTED** | @architect Aria | Criação após reporte do Founder Hyago (2026-05-23) de divergência ~18× entre cards UI e cadastro do produto em produção pós V6. Resposta arquitetural ao PRD EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY v1.0 do @pm Morgan. Status promovido a ACCEPTED após review do PRD (vide §11 do PRD V7) — escopo arquitetural validado; gate de QA Quinn em QA-VALIDATION-EPIC-MRM-V7.md pendente como gate operacional, não arquitetural. |

---

## 10. Referências

- [docs/prd/EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY.md](../prd/EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY.md) — PRD do Morgan (v1.0, 2026-05-24) que motivou esta ADR
- [ADR-001](./adr-001-single-source-of-truth-motor.md) — Single source of truth do motor (motor RR permanece canônico)
- [ADR-002](./adr-002-versionamento-engine-version.md) — Semver engine_version (sem bump aqui)
- [ADR-003](./adr-003-snapshot-fiscal-invariante.md) — Snapshot fiscal invariante (preservado)
- [ADR-004](./adr-004-separacao-motor-pure-vs-policies.md) — Motor puro vs policies (ortogonal — Display é terceira camada)
- [ADR-008](./adr-008-pis-cofins-apuracao-formula.md) — PIS/COFINS apuração (intacto no motor)
- [ADR-009](./adr-009-discount-modes-revival.md) — Discount Modes Revival (complementado por esta ADR)
- `src/utils/calculate-discount.ts:33-80` — função canônica reaproveitada (spec 4.0.10/4.0.11)
- `src/utils/residual-distribution.ts:112-144` (`extractItemValues`), `:175-268` (`computeResidualDistribution`) — alvo do refator
- `src/utils/margin-reapuration.ts:1-50` (header), `:295-310` (Etapa 8 — referência semântica) — NÃO TOCAR
- `src/page-parts/shared/residual-distribution-block.component.tsx:99-107` — alvo do early-return Cenário B
- `src/hooks/use-residual-distribution.ts` — alvo da propagação de `discountPct`/`discountMode`
- `src/pages/orcamentos/index.tsx`, `src/pages/vendas/index.tsx`, `src/pages/pedidos/index.tsx` — 3 call-sites a atualizar
- Cenário canônico Hyago (2026-05-23): produto R$ 141.106,60; commission 5%; profit 10%; desc 10%; modo PROPORTIONAL; LP IRPJ 1,8% / CSLL 1,08%
- Memória: `project_motor_v2_sprint_plan_2026_05_19.md`, `project_epic_mrm_v5_2026_05_22.md`, `project_motor_reapuracao_margem.md`
- `.aios-core/constitution.md` — Artigo IV (No Invention — `calculateDiscountedPrice` já existe; esta ADR conecta o que já existe), Artigo V (Quality First — cenário do user é o golden test canônico)
- [docs/qa/QA-VALIDATION-EPIC-MRM-V7.md](../qa/QA-VALIDATION-EPIC-MRM-V7.md) — QA Validation a ser criada por @qa Quinn (gate operacional)

---

## 11. Aria Sign-off

Esta ADR formaliza a separação de duas perguntas que estavam misturadas em uma única implementação. O motor RR está correto no seu domínio (fiscal). O bug visual reportado é uma **falha de fronteira de consumo** — UI cards lendo a fonte errada para a pergunta que o usuário faz.

A correção é arquiteturalmente conservadora: usa uma função canônica que já existe (`calculateDiscountedPrice`), não toca o motor fiscal, não cria migration, preserva todos os ADRs anteriores. O custo (~7h) é proporcional ao escopo (3 arquivos de UI + 1 utility).

**Recomendação:** prosseguir com Epic V7 conforme PRD do Morgan. Gates de merge listados na §7 desta ADR.

**Aria, 2026-05-24**

---

## QA Review (Quinn, 2026-05-24)

**Veredito:** **APPROVED**

- **Separação Camada Fiscal vs Camada Display (§2) é arquiteturalmente sólida e auditável.** A tabela §2.1 vs §2.2 deixa claro quem grava em DB (motor RR via snapshot imutável ADR-003) e quem opera view-time (`computeResidualDistribution` refatorada via `calculateDiscountedPrice`). Frase-chave §2.3 ("Motor RR = fonte fiscal; Display = fonte visual; coexistem porque respondem a perguntas diferentes") é o contrato governante.
- **Pseudocódigo §5.2 é implementável e cobre os 3 modos + clamp.** O bloco `// CONVERSÃO:` na linha 254 (`discountPercentOfMargin = (discountAbsolute / margin) × 100`) é o ponto crítico identificado pelo QA como QR-H1 (HIGH) — bug ali inverte os 4 cards. QA-VALIDATION §3 C2 valida bit-exact (R$ 2.351,78 ± R$ 0,01) e QG-001 BLOCKING garante release-gate.
- **Contract test §5.5 é o golden test operacionalizado na QA-VALIDATION.** Os 5 testes propostos (sem desc, 10% PROPORTIONAL, SELLER, PROFIT, regime MEI) são exatamente C1/C2/C3/C4/C8 da matriz de cálculo §3 — alinhamento total entre ADR e plano de QA.
- **Backward Compatibility (§6) garante zero write em `tax_breakdown`.** ADR-003 (imutabilidade) e ADR-009 (3 modos no motor) preservados integralmente. R1 do PRD V7 / DR2 desta ADR / QR-M1 da QA-VALIDATION são o mesmo risco (display recalcula em runtime ⇒ docs V5/V6 reabertos podem divergir do snapshot) — mitigação via tooltip recomendada como QG-005 NON-BLOCKING.
- **Relação com outros ADRs (§8) é coerente:** respeita ADR-001/003/004/008 sem violação, complementa ADR-009. Display é terceira camada ortogonal a motor/policies (ADR-004) — não é segundo motor fiscal, é função de UI sobre semântica de cadastro. Zero invenção (Constitution Artigo IV).

**Gate operacional desta ADR (referência §7):** veredito APPROVED desta QA Review + validação manual @founder Hyago em staging no cenário canônico × 3 modos × 3 páginas. QA-VALIDATION §11 traz checklist final pré-release que serve de assinatura.

**Quinn, 2026-05-24** — APPROVED. ADR-010 ACCEPTED arquiteturalmente E operacionalmente. Pode prosseguir para implementação.
