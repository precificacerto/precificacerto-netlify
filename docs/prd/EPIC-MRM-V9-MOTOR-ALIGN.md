# EPIC-MRM-V9-MOTOR-ALIGN — Alinhamento Motor RR ↔ DRE Consolidada V8.8

**Status:** ✅ Implementação S1+S2 COMPLETA (Orion 2026-05-25) — 363/363 tests verdes
**Owner:** Morgan (PM) + Aria (Architect) + Quinn (QA)
**Criado:** 2026-05-25
**Engine version target:** 2.2.0 → 2.3.0 (MINOR — sem migração de schema)
**Origem:** Bug report Hyago (Founder) — cascade_trace 13 etapas com RRO negativo absurdo (-R$ 46.689,08) em cenário onde Excel oficial canônico fecha em RRO positivo (R$ 13.924,05).

---

## 1. Contexto e Justificativa

### 1.1. Cenário canônico do bug (Founder, 2026-05-25)

Orçamento com `RB=141.106,60`, desconto 10%, ICMS=17%, ISS=0, regime LR:

| Estado | Etapa 8 (PIS/COFINS) | Etapa 9 (Custos) | Etapa 10 (Despesas) | Etapa 11 (RRO) |
|---|---|---|---|---|
| **Atual (bugado)** | -R$ 8.092,59 sobre 105.406,63 (V4 ≈ 7,67%) | -R$ 39.929,94 (sem base sequencial) | -R$ 104.073,17 (MOD+DOP somados — **dupla contagem**) | **-R$ 46.689,08** (Distribuição zera) |
| **Esperado (Excel + ADR-008)** | -R$ 9.750,11 sobre 105.406,63 (9,25%) | -R$ 42.645,94 sobre R$ 95.656,51 (= 105.406,63 − 9.750,11) | -R$ 39.086,52 sobre R$ 53.010,57 (= 95.656,51 − 42.645,94) | **R$ 13.924,05** → Comissão R$ 4.001,16 / Lucro R$ 8.002,32 / IRPJ+CSLL R$ 1.920,56 |

### 1.2. Causa raiz (Orion 2026-05-25, decodificação Excel + leitura código)

**Causa #1 — Dupla contagem da Mão de Obra Produtiva:**
- `consolidated-dre.ts:284-287` (V8.8 commit 1189d9b) → `custosProduto = totalCost` (CMV TOTAL inclui MO produtiva), `modAmount = 0`, `tenant.mod_pct → bucket Administrativas`.
- `margin-reapuration.ts:299` → `rro = ancora − imp − cp − mod − dop` recebe `mod = RV × mrmConfig.mod_pct` como argumento separado pelos callers — dupla contagem.
- Callers afetados (3 ocorrências): `src/pages/orcamentos/index.tsx:586-589`, `src/pages/vendas/index.tsx:1035-1038, 1185-1188, 1239-1242`.

**Causa #2 — `cost_total` não-canônico no Motor RR:**
- DRE consolidada usa `resolveProductCostTotal()` (`item-tax-rates.ts:139`) que prioriza `pricing_calculations.cmv` (R$ 42.645,94 canônico).
- Motor RR consome `i.cost_total × qty` direto (R$ 39.929,94 — sem MO produtiva).
- Diff R$ 2.716 = MO produtiva ausente do CP do motor (mas presente na DRE).

**Causa #3 — `cascade_trace` não-sequencial:**
- `margin-reapuration.ts:577-695` em `buildCascadeTrace`: steps 6-10 têm `base` independente (não propagam `base_remanescente = base_anterior − valor_anterior`).
- Visual fica anti-pedagógico — Etapa 9 mostra `-CP total` sem base; usuário não consegue auditar a cascata.

**Causa #4 (correlacionada) — Alíquotas PIS/COFINS:**
- Motor aplica `(Âncora − ICMS − ISS) × (pis_rate + cofins_rate)` (V4 / STF).
- Quando alíquotas legacy somam 7,6775% (e.g. PIS=0,65 + COFINS=3,00 × ajuste), resultado fica em 8.092,59.
- ADR-008 (Founder approved 2026-05-22) prevê `(Âncora − ICMS) × 9,25%` produzindo 9.750,11.
- Investigação: confirmar se `mrm-rates-loader` está retornando alíquotas atuais (LR não-cumulativo: PIS=1,65% + COFINS=7,60% = 9,25%) ou legacy.

### 1.3. Por que agora (priorização)

- **Severidade ALTA:** RRO negativo em orçamento com desconto comercial padrão (10%) bloqueia salvamento (S19 EPIC-RR-V4) e força usuários a aumentarem preço ou tirarem desconto — perde venda.
- **Impacto:** Todos os tenants LR/LP que usam desconto > 0 em orçamentos/vendas com MO produtiva no CMV.
- **Bloqueio comercial:** Cliente reportou impossibilidade de modelar cenário de 10% desconto que o Excel oficial fecha positivo.

---

## 2. Objetivos

| ID | Objetivo | Métrica de sucesso |
|---|---|---|
| O1 | Eliminar dupla contagem de MO produtiva entre Motor RR e DRE Consolidada | Motor.rro ≡ DRE.rro.valor (delta ≤ R$ 0,01) em todos os cenários (10 cenários golden) |
| O2 | Cascade_trace sequencial — base propagada etapa-a-etapa (PDF Motor RR Seção 10 + Excel oficial) | Cenário canônico Hyago 2026-05-25 produz exatamente os valores esperados (`13.924,05` RRO) |
| O3 | Motor RR consome CMV canônico via `resolveProductCostTotal()` | Diff motor vs DRE em CP = 0 em todos cenários golden |
| O4 | Refatorar 3 callers (orçamento/venda × 3) em 1 helper compartilhado `buildMotorInput()` | Cobertura de tests do helper ≥ 90%; callers reduzidos a chamada única |
| O5 | Validar ADR-008 em runtime (alíquotas PIS/COFINS = 9,25% para LR) | Cenário canônico produz PIS/COFINS R$ 9.750,11 |

---

## 3. Escopo

### 3.1. IN-SCOPE (V9)

- `src/utils/margin-reapuration.ts` — função `buildCascadeTrace` (cascata sequencial), assinatura de `cp` (passa a aceitar CMV canônico).
- `src/utils/mrm-orchestrator.ts` — novo helper `buildMotorInput()` exportado.
- `src/pages/orcamentos/index.tsx` — caller `motorResultsByItem` (linhas 564-606).
- `src/pages/vendas/index.tsx` — 3 callers `calculateMarginReapuration` (linhas 1027-1054, 1180-1206, 1235-1263).
- Tests novos: `buildMotorInput.test.ts`, `margin-reapuration-v9-cascade-sequential.test.ts`, golden test do cenário Hyago 2026-05-25.
- Documentação: ADR-010 (cascade sequencial — Aria), update em `docs/motor-reapuracao-margem.md`.

### 3.2. OUT-OF-SCOPE (V9)

- ❌ Migração Supabase / schema changes (ZERO migrations — campos cabem em `tax_breakdown` JSONB existente, igual a V5).
- ❌ Snapshots V5/V4 existentes em produção — preservados por ADR-003 (imutabilidade). `engine_version=2.2.0` continua renderizando como hoje.
- ❌ `src/pages/pedidos/**` — não consome motor diretamente (apenas DRE consolidada). Sem mudanças.
- ❌ Refatoração da DRE Consolidada — fonte de verdade já está correta (V8.8). Apenas o motor se alinha a ela.
- ❌ Reforma tributária 2027 (IBS/CBS) — ADR-005 + EPIC futuro.

---

## 4. Stories (3 Sprints, 18-24h)

### Sprint 1 (10-12h) — Alinhamento de CP/MOD entre Motor e DRE

**STORY-V9-001 — `buildMotorInput` helper + adoção em orçamentos/vendas**
- AC1: criar `buildMotorInput(item, tenantCtx, discount)` em `mrm-orchestrator.ts` retornando `ReapurationInput` com `cp = resolveProductCostTotal(item) × qty` e `mod = 0` (V8.8).
- AC2: `src/pages/orcamentos/index.tsx:586-606` substitui cálculo inline por `buildMotorInput()`.
- AC3: `src/pages/vendas/index.tsx` — 3 ocorrências substituídas por `buildMotorInput()`.
- AC4: `mrm-policies.ts` e tests existentes (158/158) continuam verdes.
- AC5: tests novos em `__tests__/build-motor-input.test.ts` ≥ 90% cobertura.
- AC6: golden test "Cenário Hyago 2026-05-25" (`RB=141.106,60, desc=10%, CMV=42.645,94, DOP=39.086,52, peso=1, ICMS=17%, PIS+COFINS=9,25%`) produz `RRO=13.924,05`.

**Decisão D1 (Founder confirmou via Orion):** MOD permanece 0 no motor (V8.8). Não voltar a separar.

### Sprint 2 (5-6h) — Cascade Sequencial

**STORY-V9-002 — `buildCascadeTrace` com base propagada etapa-a-etapa**
- AC1: `buildCascadeTrace` recebe novo helper interno `computeStepBase(prev_base, prev_amount)`.
- AC2: Steps 6 (ICMS), 7 (ISS), 8 (PIS/COFINS), 9 (Custos), 10 (Despesas), 11 (RRO) propagam `base = base_anterior − abs(amount_anterior)`.
- AC3: Step 11 (RRO) deixa de calcular fórmula global e passa a refletir `base_step10 − abs(amount_step10)`.
- AC4: Steps 1-5 e 12-13 inalterados (já corretos).
- AC5: Tests em `margin-reapuration-v9-cascade-sequential.test.ts` cobrem cenário Hyago + 3 cenários V5 existentes (zero regressão).
- AC6: `consolidated-dre-block.component.tsx` renderiza coluna "Base (R$)" agora preenchida em steps 6-11.

### Sprint 3 (3-6h) — ADR-008 runtime + golden tests

**STORY-V9-003 — Validar e ativar ADR-008 (PIS/COFINS 9,25% LR) em runtime**
- AC1: investigar `mrm-rates-loader.ts` — confirmar se alíquotas PIS/COFINS atuais (banco de dados ou tenant_settings) somam 9,25% para regime LR não-cumulativo.
- AC2: se alíquotas legacy (somando 7,6775%), criar migration **opcional** docs-only ou orientar Founder a atualizar config tenant. **NÃO** alterar fórmula `computeTaxesInside` — manter `(Âncora − ICMS − ISS) × (pis + cofins)` (preserva ADR-008 acceptance via alíquotas, não via fórmula).
- AC3: Golden test GT-9: cenário Hyago 2026-05-25 com PIS/COFINS=9,25% produz `9.750,11`.
- AC4: Golden test GT-10: cenário Excel canônico V5 (RB=190.055,94, ICMS=18%) continua produzindo valores V5 documentados (zero regressão).
- AC5: Update `docs/motor-reapuracao-margem.md` com cenário canônico V9.

**Decisão D2 (Founder confirmou via Orion):** `cost_total` do item no motor passa a usar `resolveProductCostTotal()` (V9 default).

---

## 5. Requisitos não-funcionais

| Categoria | Requisito |
|---|---|
| Performance | Helper `buildMotorInput()` sem I/O (puro). Cascade sequencial mantém O(13) — sem regressão. |
| Compatibilidade | Snapshots V5 (`engine_version=2.2.0`) preservados — ADR-003. Motor V9 (`engine_version=2.3.0`) só aplica em novos cálculos/edições. |
| Observabilidade | `mrm-shadow.ts` registra diff Motor V8/V9 durante 7 dias pós-deploy (shadow mode obrigatório). |
| Testes | 158/158 V5 baseline + 20+ novos V9 (10 buildMotorInput, 5 cascade sequential, 3 golden, 2 regressão). |

---

## 6. Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| R1 — Tenants existentes com `mod_pct` diferente de zero veem RRO mudar | ALTA | Shadow mode 7 dias + comunicação via banner "Atualizando para nova versão do motor" (já existe `requiresReview`) |
| R2 — Cascade sequencial diverge do Excel em cenários peso<1 | MÉDIA | Aria valida via testes do Excel canônico V5 (peso=0.931585) sem alterar valor matemático — só visualização |
| R3 — ADR-008 não ativável em runtime sem mudar alíquotas DB | MÉDIA | Story V9-003 explicitamente NÃO altera fórmula — apenas confirma alíquotas. Se alíquotas erradas no tenant, banner explica |
| R4 — Pedidos não tem motor mas usa DRE — divergência visual com orçamento/venda V9 | BAIXA | DRE já está alinhada (V8.8) — sem ação. Pedidos continuam vendo a DRE consolidada correta |

---

## 7. Gates de aprovação

1. ✅ PRD revisado e approved (Morgan + Founder)
2. ⏳ ARCH approved (Aria) + ADR-010 PROPOSED
3. ⏳ QA-VAL approved (Quinn) — gate "APPROVED" ou "APPROVED WITH CONDITIONS"
4. ⏳ Founder confirma D1 + D2 explicitamente (este PRD)
5. ⏳ Shadow mode 7 dias pós-deploy obrigatório (regressão de tenants reais)

---

## 8. Próximos handoffs

→ **@architect Aria**: criar `docs/architecture/ARCH-EPIC-MRM-V9.md` + `docs/architecture/adr-010-cascade-sequential-base-propagation.md`
→ **@qa Quinn**: criar `docs/qa/QA-VALIDATION-EPIC-MRM-V9.md` com cenários golden + checklist
→ **@sm River**: fatiar STORY-V9-001 / 002 / 003 em sprint operacional
→ **@dev Dex**: implementar S1 (estimativa 10-12h)

---

**Morgan (PM)**, 2026-05-25 — fim do PRD v1.0.
