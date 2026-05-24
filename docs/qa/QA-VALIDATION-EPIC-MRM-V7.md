# QA-VALIDATION-EPIC-MRM-V7 — Validação operacional da separação Display vs Snapshot Fiscal

**Versão:** 1.0
**Data:** 2026-05-24
**Autor:** @qa Quinn (Quality Assurance)
**Owner técnico:** @dev Dex (executor das 3 stories MRM-V7-001/002/003)
**Owner arquitetural:** @architect Aria (ADR-010 ACCEPTED)
**Owner de produto:** @pm Morgan (PRD EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY v1.0)
**Validador de aceite:** @founder Hyago (cenário canônico em staging)

**Referências:**
- `docs/prd/EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY.md` (PRD v1.0, APPROVED Aria)
- `docs/architecture/adr-010-display-vs-fiscal-snapshot.md` (ACCEPTED)
- `src/utils/calculate-discount.ts:33-80` (função canônica reaproveitada)
- `src/utils/residual-distribution.ts:60-268` (alvo do refator)
- `src/page-parts/shared/residual-distribution-block.component.tsx:99-207` (alvo do early-return)
- `src/utils/__tests__/discount-engine-integration.test.ts` (294 tests baseline)

---

## 1. Escopo

Esta QA-VALIDATION cobre **estritamente** a separação Camada Display vs Camada Fiscal introduzida por ADR-010 + Epic MRM-V7. Garante que:

1. Os 4 cards do bloco "Distribuição do resultado" passem a consumir `calculateDiscountedPrice` em vez do snapshot do motor RR.
2. O Cenário B (`discount_pct === 0` ⇒ bloco oculto) seja implementado em 3 páginas (orcamentos, vendas, pedidos).
3. **Zero regressão** no Motor RR (`margin-reapuration.ts`), na DRE Consolidada, nos snapshots persistidos (`*_items.tax_breakdown`) e nos 294 tests existentes da suíte.
4. O cenário canônico do Founder (R$ 141.106,60 / 5% comm / 10% lucro / 10% desc / PROPORTIONAL / LP IRPJ 1,8% CSLL 1,08%) seja reproduzido **bit-exact** (precisão ± R$ 0,01) nos 4 cards.

**Fora do escopo:**
- ❌ Mudanças em `margin-reapuration.ts` (motor RR permanece bit-exact, `MRM_ENGINE_VERSION = 2.3.0`).
- ❌ Migrations Supabase (zero migration nesta epic).
- ❌ Alterações em PDF de orçamento ou mensagem WhatsApp.
- ❌ Alterações em DRE Consolidada (continua consumindo snapshots fiscais).

---

## 2. Cenário canônico do user (referência matemática INEGOCIÁVEL)

**Inputs:**

| Parâmetro | Valor |
|-----------|-------|
| Receita Bruta (RB / preço unitário) | R$ 141.106,60 |
| `commission_percent` (cadastro do produto) | 5% |
| `profit_percent` (cadastro do produto) | 10% |
| `discount_pct` (UI) | 10% (= R$ 14.110,66 absoluto) |
| `discount_mode` | `PROPORTIONAL` |
| Regime tenant | `LUCRO_PRESUMIDO` |
| `tenantTaxRates.irpj` | 1,8% (0,018 decimal) |
| `tenantTaxRates.csll` | 1,08% (0,0108 decimal) |
| `totalNet` (= RB − desconto) | R$ 126.995,94 |

**Outputs esperados nos 4 cards (modo PROPORTIONAL):**

| Card | Fórmula | Valor esperado |
|------|---------|----------------|
| **Comissão do Vendedor** | 7.055,33 − 14.110,66 × (5 / (5+10)) = 7.055,33 − 4.703,55 | **R$ 2.351,78** |
| **Lucro da Empresa** | 14.110,66 − 14.110,66 × (10 / (5+10)) = 14.110,66 − 9.407,11 | **R$ 4.703,55** |
| **IRPJ** | 126.995,94 × 1,8% | **R$ 2.285,93** |
| **CSLL** | 126.995,94 × 1,08% | **R$ 1.371,56** |

**Conversão crítica de unidade (ADR-010 §5.2):**

```
discountAbsolute       = salePrice × (discountPct / 100) = 141.106,60 × 0,10 = 14.110,66
margin                 = salePrice × ((commPct + profPct) / 100) = 141.106,60 × 0,15 = 21.165,99
discountPercentOfMargin = (discountAbsolute / margin) × 100 = (14.110,66 / 21.165,99) × 100 ≈ 66,667%
```

Essa conversão (% sobre preço → % da margem) é o ponto onde a função `calculateDiscountedPrice` é chamada. Sem ela, o cálculo inverte. Risco HIGH na §9.

---

## 3. Matriz de testes — Cálculo (8 cenários)

Todos os 8 cenários devem ser implementados em `src/utils/__tests__/residual-distribution.test.ts` (ou arquivo novo `residual-distribution-v7.test.ts`).

| # | Inputs | Outputs esperados |
|---|--------|-------------------|
| **C1** — Sem desconto + cadastro 5%/10% | RB 141.106,60; desc 0; PROPORTIONAL; LP 1,8% / 1,08% | Comissão = 5% × 141.106,60 = **R$ 7.055,33**; Lucro = 10% × 141.106,60 = **R$ 14.110,66**; IRPJ = 141.106,60 × 1,8% = R$ 2.539,92; CSLL = 141.106,60 × 1,08% = R$ 1.523,95; `hasDiscount = false` |
| **C2** — Desc 10% PROPORTIONAL (cenário canônico) | RB 141.106,60; desc 10%; PROPORTIONAL; LP | Comissão = **R$ 2.351,78**; Lucro = **R$ 4.703,55**; IRPJ = **R$ 2.285,93**; CSLL = **R$ 1.371,56**; `hasDiscount = true` |
| **C3** — Desc 10% SELLER_REDUCTION | RB 141.106,60; desc 10%; SELLER; LP | Comissão = **R$ 0,00** (clamp — desconto 14.110,66 > comissão original 7.055,33); Lucro = **R$ 14.110,66** (intacto); IRPJ/CSLL = idem C2 (base totalNet) |
| **C4** — Desc 10% PROFIT_REDUCTION | RB 141.106,60; desc 10%; PROFIT; LP | Comissão = **R$ 7.055,33** (intacta); Lucro ≈ **R$ 0,00** (clamp — desc 14.110,66 ≈ lucro original 14.110,66); IRPJ/CSLL = idem C2 |
| **C5** — Desc 5% PROPORTIONAL | RB 141.106,60; desc 5%; PROPORTIONAL; LP | desconto absoluto = 141.106,60 × 5% = R$ 7.055,33; redução commission = 7.055,33 × (5/15) = R$ 2.351,78; redução lucro = 7.055,33 × (10/15) = R$ 4.703,55 ⇒ Comissão = 7.055,33 − 2.351,78 = **R$ 4.703,55**; Lucro = 14.110,66 − 4.703,55 = **R$ 9.407,11**; totalNet = 134.051,27 ⇒ IRPJ = R$ 2.412,92; CSLL = R$ 1.447,75 |
| **C6** — Desc 5% SELLER_REDUCTION | RB 141.106,60; desc 5%; SELLER; LP | Comissão = **R$ 0,00** (clamp — desconto 7.055,33 ≈ comissão original 7.055,33); Lucro = **R$ 14.110,66** (intacto); IRPJ/CSLL = idem C5 |
| **C7** — Multi-produto (2 items) | Item A: RB 100.000 / 5% comm / 10% lucro; Item B: RB 50.000 / 3% comm / 8% lucro; desc 10% PROPORTIONAL; LP | Agregação correta: somar comissão/lucro pós-redução de cada item; verificar `totalGross = 150.000` e `totalNet = 135.000`; IRPJ = 135.000 × 1,8% = R$ 2.430,00; CSLL = R$ 1.458,00. **Crítico:** cada item usa seu próprio `commission_percent`/`profit_percent` na chamada de `calculateDiscountedPrice` — agregação NÃO usa média ponderada do tenant. |
| **C8** — Regime MEI/SN | RB 141.106,60; desc 10%; PROPORTIONAL; regime `MEI` | Comissão = R$ 2.351,78 (igual C2); Lucro = R$ 4.703,55 (igual C2); IRPJ = **R$ 0,00**; CSLL = **R$ 0,00**; `hidesProfitTaxes = true` |

**Critério de aceite:** todos os 8 cenários passam com `toBeCloseTo(expected, 2)` (precisão R$ 0,01).

---

## 4. Matriz de testes — UI (5 cenários)

Validação manual em ambiente de desenvolvimento. Para U1-U3, se `@testing-library/react 19` estabilizar até o sprint, criar testes de componente leves. Caso contrário, checklist manual + revisão @qa.

| # | Cenário | Resultado esperado |
|---|---------|--------------------|
| **U1** — `discount=0` ⇒ bloco NÃO renderiza (Cenário B) | Abrir orçamento sem desconto aplicado | `<div>` raiz do bloco "Distribuição do resultado" **não existe no DOM** (`querySelector('[data-testid="residual-distribution-block"]')` retorna `null`). Componente retornou `null` via early-return. |
| **U2** — `discount>0` ⇒ bloco renderiza com 4 cards | Aplicar desc 10% em orçamento com regime LP | Bloco renderiza; 4 cards visíveis: Comissão, Lucro, IRPJ, CSLL (ou 2 cards se regime MEI/SN). |
| **U3** — Troca de modo PROPORTIONAL ↔ SELLER ↔ PROFIT | Em orçamento com desc=10%, alternar o `<Select>` de modo | Cards recalculam reativamente; SELLER esconde card Lucro (ADR-009); PROFIT esconde card Comissão; PROPORTIONAL mostra ambos. |
| **U4** — `regimeGuardActive` continua aparecendo | Tenant MEI com CSLL > 0 configurado + desc > 0 | Banner amarelo `role="alert"` aparece no topo do bloco (V5 AC4 preservado). |
| **U5** — `configWarning` continua aparecendo | Produto sem custo cadastrado + desc > 0 | Banner amarelo "Configure custos dos produtos..." aparece (V5 S9 preservado). |

---

## 5. Matriz de testes — Retrocompat (4 cenários)

Validação combinada (unit + manual em staging).

| # | Cenário | Resultado esperado |
|---|---------|--------------------|
| **R1** — Orçamento V5/V6 antigo aberto | Reabrir documento `approved`/`done` criado pré-V7 | Display **recalcula em runtime** com base em `commission_percent`/`profit_percent` salvos em `budget_items` (não em `tax_breakdown`). Valores podem divergir do snapshot — divergência intencional documentada (DR2 do ADR-010). Não quebra render. |
| **R2** — Snapshot persistido nunca é modificado | Inspecionar DB pós-deploy V7 | **Zero write novo** em `*_items.tax_breakdown` causado por V7. ADR-003 (imutabilidade) preservado. Snapshots V5/V6 continuam servindo DRE/auditoria. |
| **R3** — DRE Consolidada continua mostrando RRO real do motor | Abrir página DRE Consolidada para tenant LP com orçamentos V5/V6/V7 misturados | RRO + Memória Cascata + Peso/Âncora + taxes_inside/outside continuam consumindo `tax_breakdown` do motor RR. Zero alteração visual ou numérica na DRE. Suíte `consolidated-dre.test.ts` passa 100%. |
| **R4** — Pedido/Venda salvo pré-V7 reaberto | Abrir pedido/venda finalizada criada pré-V7 | UI não quebra (sem `TypeError`/render error); cards recalculam com regra V7 (valores derivados do cadastro do produto); fallback legacy ativa quando `commission_percent`/`profit_percent` ausentes ⇒ `requiresReview = true` sinaliza ao user. |

---

## 6. Matriz de testes — Páginas (4 cenários)

Validação manual obrigatória em staging. Cada cenário deve ser executado nas combinações `discount ∈ {0, 10%, 20%}` × `mode ∈ {PROPORTIONAL, SELLER, PROFIT}`.

| # | Página / View | Resultado esperado |
|---|---------------|--------------------|
| **P1** — Orçamento drawer (criar / editar) — `src/pages/orcamentos/index.tsx` | Criar orçamento novo + editar orçamento `draft` | Cards corretos nos 3 modos × 3 cenários de desconto. Cenário B (sem desc) esconde bloco. |
| **P2** — Venda Balcão drawer (criar) — `src/pages/vendas/index.tsx` (drawer balcão) | Iniciar nova venda no balcão sem orçamento prévio | Cards corretos; `discount_pct`/`discount_mode` propagados do form local ao hook. |
| **P3** — Visualização de venda salva (`selectedSale`) — `src/pages/vendas/index.tsx` | Abrir venda finalizada no histórico | Cards recalculam display em runtime (NÃO leem `tax_breakdown.new_*`). Consistente com P1/P2 para mesmos inputs. |
| **P4** — Pedido visualização (read-only) — `src/pages/pedidos/index.tsx` | Abrir pedido aprovado/concluído | Cards corretos read-only; propagação a partir do snapshot persistido funciona. |

**Checklist:** marcar checkbox por (página × modo × desconto), 4 × 3 × 3 = 36 combinações totais. Mínimo aceitável para release: 4 × 3 × 2 = 24 combinações (sem 20% se tempo apertar).

---

## 7. Critérios globais para release

| # | Critério | Verificação |
|---|----------|-------------|
| **G1** | **Zero regressão** nos 294 tests existentes | `npm test` passa 100% (output: 294/294 verde). Inclui `margin-reapuration*.test.ts`, `mrm-snapshot-compat.test.ts`, `consolidated-dre.test.ts`, `discount-engine-integration.test.ts`. |
| **G2** | **20+ tests novos** cobrindo a matriz da §3 + §4 | Cobertura: 8 cenários cálculo (C1-C8) + 5 cenários UI (U1-U5, ao menos 3 automatizados) + 4 cenários retrocompat (R1-R4 onde possível) ≥ 20 tests. |
| **G3** | Cenário canônico do user **reproduzido bit-exact** | Teste C2 da §3 passa com `toBeCloseTo(2351.78, 2)` para Comissão e análogos para Lucro/IRPJ/CSLL (± R$ 0,01). |
| **G4** | Lint + typecheck + build limpos | `npm run lint && npm run typecheck && npm run build` sem erros. |
| **G5** | Testado manualmente nas 4 páginas | Checklist da §6 preenchido (mínimo 24/36 combinações). Hyago valida cenário canônico em staging antes de deploy de produção (gate operacional ADR-010 §7). |
| **G6** | DRE Consolidada **inalterada** | Captura de tela antes/depois da DRE para tenant LP com docs V5/V6/V7 misturados — diff visual zero. |

---

## 8. Riscos QA

| ID | Severidade | Risco | Mitigação obrigatória |
|----|------------|-------|----------------------|
| **QR-H1** | **HIGH** | **Conversão de unidade `discountPct → discountPercentOfMargin` (ADR-010 §5.2) — bug aqui INVERTE TUDO.** Exemplo: se Dev passar `discountPct` (0-100 sobre preço) direto como `discountPercent` para `calculateDiscountedPrice` em vez de converter via `(discountAbsolute / margin) × 100`, comissão/lucro virariam zero ou negativos com desc=15%+. | Teste C2 da §3 **bit-exact** é o golden test que detecta. Code review obrigatório de @qa Quinn na PR antes de merge. Inspeção visual do bloco `// CONVERSÃO:` no pseudocódigo §5.2 ADR-010 em `residual-distribution.ts`. |
| **QR-M1** | **MEDIUM** | Snapshots V5/V6 reabertos podem mostrar valores diferentes do que mostravam quando foram criados (display recalcula em runtime, snapshot fiscal continua imutável em DB). | Comunicar via tooltip ou rodapé inline opcional: *"Valores recalculados em runtime a partir do cadastro do produto. Para apuração fiscal, consulte a DRE Consolidada."* Recomendação @ux fora do escopo bloqueante mas listada como NON-BLOCKING gate QG-005. |
| **QR-M2** | **MEDIUM** | Fallback legacy para snapshots sem `commission_percent`/`profit_percent` informados (cenário: importação histórica pré-V5). Não pode bagunçar UI nem render. | Teste R4 da §5 valida que fallback ativa `extractItemValues` original e marca `requiresReview = true`. Render mostra badge "Atualizando para nova versão do motor" (já existente no componente). |
| **QR-L1** | **LOW** | Multi-produto: agregação dos cards com 2-3 itens com `commission_percent`/`profit_percent` diferentes. Erro comum: usar média do tenant em vez do peso por item. | Teste C7 da §3 cobre. Adicional: cenário manual com 3 itens diferentes em orçamento + verificação visual. |
| **QR-L2** | **LOW** | Em SELLER_REDUCTION, desconto absoluto pode exceder comissão original ⇒ comissão negativa sem clamp. | Clamp `Math.max(0, ...)` obrigatório no pseudocódigo ADR-010 §5.2 linha 271. Teste C3 da §3 cobre exatamente esse caso (desc 14.110 > comm 7.055). |
| **QR-L3** | **LOW** | Cobertura de testes de componente limitada (`@testing-library/react 19` instável). U1 (Cenário B) pode não ter teste DOM automatizado. | Cobrir via teste de lógica direto: `hasDiscount = false ⇒ componente retorna null` é trivial. Validação manual nas 3 páginas + revisão @qa. TODO de teste de render permanece no header do componente. |

---

## 9. Quality Gates

| Gate | Tipo | Critério | Ação se falhar |
|------|------|----------|----------------|
| **QG-001** | **BLOCKING** | Cenário canônico do user (C2 da §3) reproduzido **bit-exact** em PROPORTIONAL (Comissão R$ 2.351,78; Lucro R$ 4.703,55; IRPJ R$ 2.285,93; CSLL R$ 1.371,56 com tolerância ± R$ 0,01) | BLOQUEIA release. Dev investiga conversão de unidade (QR-H1). |
| **QG-002** | **BLOCKING** | U1 (esconde bloco sem desconto, Cenário B) funciona nas 3 páginas (P1, P2, P3 + P4) | BLOQUEIA release. Dev revisa early-return em `residual-distribution-block.component.tsx`. |
| **QG-003** | **BLOCKING** | DRE Consolidada **não regride** — suíte `consolidated-dre.test.ts` passa 100% + diff visual zero antes/depois | BLOQUEIA release. Investigar se algum write em `tax_breakdown` foi acidentalmente introduzido pelo refator. |
| **QG-004** | **BLOCKING** | Os 3 modos (PROPORTIONAL, SELLER, PROFIT) funcionam corretamente — cenários C2/C3/C4 da §3 passam | BLOQUEIA release. Dev revisa switch case no pseudocódigo §5.2 ADR-010. |
| **QG-005** | NON-BLOCKING | Tooltip ou rodapé inline "Valores recalculados em runtime — para apuração fiscal consulte DRE Consolidada" considerado (recomendação @ux do PRD V7 §9 R5) | Não bloqueia release. Cria ticket @ux para sprint seguinte se não implementado. |

---

## 10. Veredito

### PRD `EPIC-MRM-V7-DISCOUNT-FIRST-DISPLAY.md` v1.0

**Veredito Quinn (QA):** **APPROVED**

**Justificativa:**
- O PRD é matematicamente rigoroso (§1.1 traz a derivação completa do cenário canônico com 4 valores esperados).
- Acceptance Criteria globais (§5) são testáveis e cobrem regressão zero em DRE/snapshots.
- Estimativa (~7h em 3 stories sequenciais) é proporcional ao escopo.
- Riscos R1-R5 do PRD §9 estão alinhados com QR-H1/M1/M2/L1/L2/L3 desta QA-VALIDATION.
- @architect Aria já validou (review APPROVED no §11 do PRD).
- Reuso correto de função canônica (`calculateDiscountedPrice`) — zero invenção (Constitution Artigo IV).

### ADR-010 `Display vs Snapshot Fiscal`

**Veredito Quinn (QA):** **APPROVED**

**Justificativa:**
- ADR formaliza separação arquitetural inegociável ("Motor RR = fonte fiscal; Display = fonte visual") em linguagem precisa.
- Pseudocódigo §5.2 fornece referência implementável e auditável.
- Contract test §5.5 é o golden test que esta QA-VALIDATION operacionaliza nos 8 cenários da §3.
- Backward Compatibility (§6) explicita garantia formal de zero write em `tax_breakdown`.
- Riscos DR1-DR5 do ADR estão devidamente mitigados — DR2 (display recalcula em runtime) requer comunicação visual (QG-005) mas não bloqueia.
- Relação com outros ADRs (§8) é coerente: respeita ADR-001/003/004/008, complementa ADR-009.

**Gate de aceite operacional da ADR:** veredito APPROVED desta QA-VALIDATION (esta seção) + validação manual do Founder Hyago em staging no cenário canônico × 3 modos × 3 páginas (referência ADR-010 §7).

---

## 11. Checklist final pré-release (assinatura)

- [ ] Story MRM-V7-001 implementada — `computeResidualDistribution` refatorada com `discountPct`/`discountMode` opcionais
- [ ] Story MRM-V7-002 implementada — early-return Cenário B em `residual-distribution-block.component.tsx`
- [ ] Story MRM-V7-003 implementada — propagação `discount_pct`/`discount_mode` nas 3 (4) call-sites
- [ ] G1 — 294 tests baseline passam (zero regressão)
- [ ] G2 — 20+ tests novos passam (matriz §3+§4)
- [ ] G3 — Cenário canônico C2 bit-exact (QG-001 BLOCKING)
- [ ] G4 — `lint && typecheck && build` limpos
- [ ] G5 — Checklist §6 preenchido (mínimo 24/36)
- [ ] G6 — DRE Consolidada diff zero (QG-003 BLOCKING)
- [ ] QG-002 — Cenário B em 3 páginas (BLOCKING)
- [ ] QG-004 — 3 modos funcionam (BLOCKING)
- [ ] @founder Hyago aprova cenário canônico em staging (ADR-010 §7)
- [ ] @devops Gage faz push + deploy de produção

---

**Quinn (QA), 2026-05-24** — QA-VALIDATION v1.0 entregue.
PRD APPROVED. ADR-010 APPROVED. Aguardando @sm River criar 3 stories + @dev Dex executar 001→002→003 sequencial.
