# ADR-022: Fator de Redução IVA Dual — referência bruta por item + derivação determinística on-read

**Status:** ACCEPTED (Orion, 2026-06-29 — review @qa Quinn = PASS, @architect Aria = APPROVED WITH CONDITIONS)
**Data:** 2026-06-29
**Author:** @aios-master Orion
**Decididores:** Hyago (Founder — documento "Precifica Certo — Correção Fator de Redução IVA Dual v1", 28/06/2026), @qa Quinn, @architect Aria
**Engine/UI:** `src/utils/item-tax-rates.ts`, `src/page-parts/{products,services}/content.component.tsx`, `src/pages/{orcamentos,vendas}/index.tsx`, `src/components/lancamento-impostos-modal.tsx`.

---

## 1. Contexto

A LC 214/2025 (art. 16, parágrafo único) prevê um **fator de redução** que incide **exclusivamente** sobre as alíquotas de **IBS e CBS**: `efetiva = bruta × (1 − fator/100)`. IPI, IS e ICMS **não** sofrem o fator.

A implementação anterior pré-calculava a alíquota reduzida no **handler de UI** (`handleIvaDualFactorChange`) e persistia o **resultado** em `products/services.ibs_pct/cbs_pct`. Isso tornava a corretude dependente de efeitos colaterais de UI: a redução só ocorria se (a) o usuário interagisse com o dropdown **e** (b) a alíquota de referência (`tenant_settings.ibs_reference_pct`) estivesse carregada naquele instante. Quando a alíquota era digitada direto, o produto era antigo, ou a referência estava vazia, o sistema cobrava a **alíquota cheia** → **sobrepreço ao consumidor** (ex.: fator 50% ignorado → IBS R$ 120,45 em vez de R$ 60,12). Além disso, a referência bruta tornava-se irrecuperável do valor salvo (não-idempotente, sujeito a deriva se o tenant mudasse).

## 2. Decisão

### D1 — Fonte da verdade = inputs persistidos (referência bruta + fator)
Nova migration (`20260629000001`) adiciona **`ibs_reference_pct`/`cbs_reference_pct` NUMERIC(8,5)** em `products` e `services` (escala percentual, ex.: `0.1` = 0,1%). O cadastro **snapshota** a referência bruta usada (imune a mudança posterior do tenant). `ibs_pct`/`cbs_pct` salvos passam a ser **cache/fallback**, não a autoridade.

### D2 — Derivação determinística e idempotente on-read
Helper `resolveIvaDualEffectiveRate(referenceBruta, factor, savedEffective)` em `item-tax-rates.ts`, usado por `buildItemTaxRatesFromProduct` **só para IBS/CBS**, sem mudar assinatura (lê `prod.ibs_reference_pct`/`prod.iva_dual_reduction_factor`):
```
efetiva = (reference > 0 && factor != null) ? reference × (1 − factor/100) : savedEffective
```
Parte SEMPRE da referência bruta → reaplicar não reduz duas vezes (idempotente). Escala percentual; `mergeItemAndTenantRates` (regra `alwaysPercent`) divide por 100 → decimal correto (0,05% → 0,0005), sem inflar 100×.

### D3 — Fallback legado (anti-dupla-redução, sem backfill)
Quando a **referência está ausente/≤0** (produtos pré-ADR-022), usa-se `ibs_pct`/`cbs_pct` salvo (já efetivo). A chave do fallback é a **ausência de referência**, não de fator — produtos antigos com fator preenchido mas sem referência **não** sofrem dupla redução. Decisão do usuário: **só daqui pra frente**, sem backfill de documentos salvos.

### D4 — Propagação nos fluxos
- **Orçamento (criação):** `useProducts()`/`useServices()` usam `select('*')` → já trazem as colunas.
- **Orçamento (edição):** SELECT de `budget_items.products/services` ampliado com `ibs_reference_pct`, `cbs_reference_pct`, `iva_dual_reduction_factor` (+ `icms_st_active`/`difal_active`).
- **Venda balcão:** SELECT de products/services ampliado (`taxCols`/`svcTaxCols`).
- **Pedidos / documentos salvos:** consomem `tax_breakdown` persistido (snapshot imutável) — intactos (D2/legado).

### D5 — Lançamento manual = override total
`lancamento-impostos-modal.tsx` (lançamento manual de impostos) zera `ibs_reference_pct`/`cbs_reference_pct`/`iva_dual_reduction_factor` ao gravar, fazendo o valor efetivo **digitado** ser a fonte (via fallback) — evita que a derivação ignore o lançamento manual.

## 3. Consequências
- IBS/CBS efetivos passam a ser garantidamente derivados de `referência × (1 − fator)` em todos os fluxos de cálculo (formação de preço, orçamento criar/editar, venda balcão).
- IPI, IS, ICMS, ICMS Compl. (derivado do ICMS na Etapa 17) **inalterados** — fator não vaza.
- Oráculos do motor (injetam rates diretos) intactos. Snapshots salvos intactos (D2).
- `ibs_pct`/`cbs_pct` salvos viram cache derivado — dívida técnica aceita e documentada (redundância benigna: handler e motor derivam da mesma fórmula).

## 4. Invariantes / Testes
`item-tax-rates.test.ts` (16 casos ADR-022): fator 50% (0,1%→0,05% / 0,9%→0,45%); idempotência; fator 100%→0; fator 0→bruta; fallback legado sem dupla redução; escopo (IPI/IS/ICMS intactos); escala pós-merge (0,05%→0,0005). Suíte `src/utils`: **671/671** verde. Typecheck: zero erro novo (baseline 369).

## 5. Dependência arquitetural (guarda)
A derivação assume que IBS/CBS são gravados em **percentual** (regra `alwaysPercent` em `mergeItemAndTenantRates`). A referência por item segue a mesma escala. Mudanças nessa convenção exigem revisão do helper.
