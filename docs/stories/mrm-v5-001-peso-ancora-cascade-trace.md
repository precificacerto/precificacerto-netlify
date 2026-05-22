# Story MRM-V5-001 — Adicionar Peso/Âncora Op Interna + Memória Cascata ao Motor

**Sprint:** S1
**Esforço estimado:** 10h
**Owner:** @dev (Dex)
**Status:** Done
**Created:** 2026-05-22
**Ready since:** 2026-05-22 (validado @po Pax — 10/10)
**InProgress since:** 2026-05-22 (branch `feature/mrm-v5-001-peso-ancora-cascade-trace`)
**InReview since:** 2026-05-22 (123/123 tests MRM passam — 33 novos)
**Done since:** 2026-05-22 (QA Gate PASS por @qa Quinn — 1 issue LOW não bloqueante)
**Created by:** @sm River
**Epic:** EPIC-MRM-V5-AJUSTES
**Validador:** @architect Aria + @qa Quinn
**Lacunas cobertas:** L1, L2, L3 (parte motor)

## User Story

As an **auditor/contador do cliente**, I want **ver explicitamente "Peso Op Interna" e "Âncora Interna" calculados pelo motor e a memória cascata dos 13 itens da spec oficial**, so that **possa validar etapa a etapa que o RRO foi apurado conforme o Relatório Motor Descontos Resultado Residual Operacional e o Excel oficial (`Motor de descontos do resultado residual operacional.xlsx`)**.

## Acceptance Criteria

- [x] **AC1 — Schema:** `TaxBreakdown` em `src/types/mrm.ts` ganha 3 novos campos opcionais retrocompatíveis: `peso_op_interna: number | null`, `ancora_interna: number | null`, `cascade_trace: CascadeStep[] | null`. Snapshots V4 (`engine_version='2.1.0'`) são lidos sem erro (campos = `null`).
- [x] **AC2 — Origem e cálculo do Peso (corrigido v1.1 D1):** O `peso_op_interna` é **propriedade da precificação ORIGINAL do item/serviço** (não cálculo runtime sobre cp/mod/dop do orçamento). Vem do markup divisor da configuração do produto:
  ```
  Op_Interna_Original = custo_unitario / (1 − Σ percentuais_internos)
  Op_Externa_Original = Σ (IBS, CBS, IPI, ICMS-ST, DIFAL, FCP)
                        aplicado sobre (Op_Interna_Original − ICMS − PIS/COFINS)
  RB_total            = Op_Interna_Original + Op_Externa_Original
  peso_op_interna     = Op_Interna_Original / RB_total       (célula I21 do Excel)
  peso_op_externa     = 1 − peso_op_interna                  (célula I26 do Excel)
  ```
  Excel ref (cenário canônico H4=R$ 53.509,92, RB total H28=R$ 190.055,94): `peso_op_interna ≈ 0,931585` (93,1585%). O motor consome esse peso como INPUT (snapshotado/carregado do item), não o computa em tempo de reapuração.
- [x] **AC3 — Âncora PÓS-desconto (corrigido v1.1 D2):** `ancora_interna = rv × peso_op_interna`, onde `rv = rb − desconto`. É a base operacional reapurada PÓS-desconto (célula H36 do Excel), **distinta** de `Op_Interna_Original` (H21, que é PRÉ-desconto). Excel ref no cenário canônico com 10% de desconto: `ancora_interna ≈ R$ 159.342,38` (= 171.050,35 × 0,931585).
- [x] **AC4 — Memória cascata (13 itens):** `cascade_trace` é um array de exatamente **13 entradas** conforme PDF Motor RR Seção 10. Cada entrada tem `{ step: number, label: string, base: number | null, rate: number | null, amount: number, formula: string, source: string }`. Ordem fixa:
  1. Receita Bruta
  2. Desconto aplicado
  3. Receita pós-desconto (RV)
  4. Aplicação do Peso Operação Interna
  5. Âncora Interna
  6. Reapuração ICMS
  7. Reapuração ISS
  8. Reapuração PIS/COFINS
  9. Redução de custos
  10. Redução de despesas
  11. Resultado Residual Operacional (RRO)
  12. Redistribuição proporcional
  13. Reapuração tributos por fora (recomposição final)
- [x] **AC5 — Engine version bump:** `MRM_ENGINE_VERSION` em `src/types/mrm.ts` é bumped de `'2.1.0'` para `'2.2.0'`. Constante exportada e usada no campo `engine_version` do `TaxBreakdown`.
- [x] **AC6 — Golden test Excel canônico (corrigido v1.1 D2):** Test do Excel (RB R$ 190.055,94, desc 10%) com tolerância R$ 0,02 para `rro` (esperado ≈ R$ 17.471,16 — célula H54) + asserções novas:
  - `peso_op_interna ≈ 0,931585` (célula I21, ± 1e-5)
  - `peso_op_externa ≈ 0,068415` (célula I26, ± 1e-5)
  - `ancora_interna ≈ R$ 159.342,38` (célula H36, PÓS desconto, ± R$ 0,02)
  - `cascade_trace.length === 13` (exatamente 13 itens)
- [x] **AC7 — Pureza motor (ADR-004 reforçado):** Motor (`calculateMarginReapuration`) permanece função pura — sem I/O, sem fetch, sem markup divisor. O `cascade_trace` é construído inline (output do motor, não side effect).
- [x] **AC8 — Documentação inline:** Comentários JSDoc no motor referenciam Etapas 1, 2, 3, 4, 5 da spec oficial (PDF Motor RR) + células do Excel oficial.
- [x] **AC9 — Snapshot do `peso_op_interna` no orchestrator (v1.1 D1):** O `peso_op_interna` é INPUT obrigatório do motor (não output computado). Fontes em ordem de prioridade implementadas em `src/utils/mrm-orchestrator.ts`:
  1. **Snapshot histórico**: se o item já possui `peso_op_interna` persistido em `budget_items.tax_breakdown` / `order_items.tax_breakdown` / `sale_items.tax_breakdown`, usar o valor histórico (imutabilidade — ADR-003).
  2. **Cálculo runtime no orchestrator** (não no motor puro): se ausente, ler configuração do produto/serviço (`products.cost`, percentuais de comissão/lucro/IRPJ/CSLL/MO/despesas, alíquotas internas e externas configuradas em `tax_rate_periods`), aplicar markup divisor e calcular `Op_Interna_Original`, `Op_Externa_Original` e `peso_op_interna = Op_Interna / (Op_Interna + Op_Externa)`.
  3. **Default conservador**: se config incompleta, `peso_op_interna = 1` (motor degrada para comportamento V4 — toda a operação é interna, zero tributos por fora).

## Technical Tasks

- [x] **T1 (1.5h):** Atualizar `src/types/mrm.ts`:
  - Bumpar `MRM_ENGINE_VERSION = '2.2.0'`
  - Adicionar tipo `CascadeStep` (interface com `step`, `label`, `base`, `rate`, `amount`, `formula`, `source`)
  - Adicionar `peso_op_interna?: number | null` e `peso_op_externa?: number | null` em `TaxBreakdown`
  - Adicionar `ancora_interna?: number | null` em `TaxBreakdown`
  - Adicionar `cascade_trace?: CascadeStep[] | null` em `TaxBreakdown`
  - Adicionar `peso_op_interna?: number` em `ReapurationInput`
- [x] **T2 (2h):** Em `src/utils/margin-reapuration.ts`, ajustar `calculateMarginReapuration`:
  - Consumir `input.peso_op_interna` (default 1 se ausente)
  - Calcular `ancora_interna = rv * peso_op_interna` (linha após desconto)
  - Refatorar Etapa 5 (reapuração impostos por dentro) para usar `ancora_interna` como base (não `rv`)
  - Construir array `cascade_trace` com 13 entradas em ordem fixa
  - Popular `peso_op_externa = 1 − peso_op_interna`
  - Bumpar `engine_version` no output para `'2.2.0'`
- [x] **T3 (3h):** Criar/atualizar `src/utils/mrm-orchestrator.ts`:
  - Função `resolvePesoOpInterna(item, snapshot, productConfig)` com 3 fontes de prioridade
  - Markup divisor: `Op_Interna = custo / (1 − Σ percentuais)`; `Op_Externa = Σ tributos_destacados × (Op_Interna − ICMS − PIS/COFINS)`
  - Default seguro `peso = 1` quando config incompleta
  - Documentação JSDoc explicando a árvore de decisão
- [x] **T4 (2h):** Golden test Excel canônico em `src/utils/__tests__/margin-reapuration.test.ts`:
  - Fixture com inputs do Excel (RB=190.055,94, desc=10%, ICMS=17%, peso=0,931585)
  - Asserts: `rro ≈ 17.471,16`, `ancora_interna ≈ 159.342,38`, `peso_op_interna ≈ 0,931585`, `cascade_trace.length === 13`
- [x] **T5 (1h):** Teste de orchestrator em `src/utils/__tests__/mrm-orchestrator.test.ts`:
  - Cenário 1: snapshot presente → usa valor histórico
  - Cenário 2: snapshot ausente, config completa → calcula via markup divisor
  - Cenário 3: snapshot e config ausentes → default `peso = 1`
- [x] **T6 (0.5h):** Atualizar comentários JSDoc no motor referenciando Etapas 1-5 do PDF + células I21/H35/H36/H41/H43 do Excel.

## Files Affected

- `src/types/mrm.ts` — Bump engine version + tipos `CascadeStep`, campos novos em `TaxBreakdown` e `ReapurationInput`
- `src/utils/margin-reapuration.ts` — Consumir peso via input, calcular Âncora, construir cascade_trace 13 itens
- `src/utils/mrm-orchestrator.ts` — Função `resolvePesoOpInterna` com 3 fontes de prioridade
- `src/utils/__tests__/margin-reapuration.test.ts` — Golden test Excel canônico
- `src/utils/__tests__/mrm-orchestrator.test.ts` — Testes do markup divisor + fallbacks

## File List (Dev)

**Modified:**
- `src/types/mrm.ts` (bump 2.1.0 → 2.2.0; nova interface `CascadeStep`; 4 campos opcionais em `TaxBreakdown`: `peso_op_interna`, `peso_op_externa`, `ancora_interna`, `cascade_trace`; 1 campo opcional em `ReapurationInput`: `peso_op_interna`)
- `src/utils/margin-reapuration.ts` (motor consome peso; calcula Âncora; refatora Etapa 5 para usar Âncora como base; nova função `buildCascadeTrace` 13 etapas; JSDoc atualizado referenciando PDF Motor RR Seção 10)
- `src/utils/mrm-orchestrator.ts` (nova interface `ProductPricingConfig`; nova função exportada `calculatePesoOpInternaFromMarkup`; nova função exportada `resolvePesoOpInterna` com 3 fontes de prioridade; integração nas funções `orchestrateReapuration` async + sync)
- `src/utils/__tests__/margin-reapuration.test.ts` (17 testes novos: retrocompat V4, golden Excel canônico, cascade_trace 13 etapas)
- `src/utils/__tests__/margin-reapuration-v2.1.test.ts` (1 ajuste: expect engine_version '2.2.0')
- `src/utils/__tests__/mrm-orchestrator.test.ts` (16 testes novos: markup divisor, resolvePesoOpInterna 3 fontes, integração sync)
- `src/utils/__tests__/mrm-shadow.test.ts` (1 ajuste: motor_version_client '2.2.0')

**Created:** nenhum (todas as mudanças em arquivos existentes — restrição-mãe preservada).

**Deleted:** nenhum.

## Test Cases

- **TC1 (golden Excel canônico):** RB=190.055,94, desc=10%, ICMS=17%, peso=0,931585 → RRO=17.471,16, Âncora=159.342,38 (tolerância R$ 0,02)
- **TC2 (snapshot histórico):** item com `tax_breakdown.peso_op_interna=0,85` → motor usa 0,85 (não recalcula)
- **TC3 (orchestrator markup):** sem snapshot, config completa → orchestrator calcula peso via markup divisor
- **TC4 (default seguro):** sem snapshot, config incompleta → `peso = 1`, motor degrada para comportamento V4
- **TC5 (cascade trace ordem fixa):** verificar 13 entries em ordem fixa, mesmo quando step value=0 (ex: ISS=0 não omite o step)
- **TC6 (engine version):** `expect(result.engine_version).toBe('2.2.0')`
- **TC7 (retrocompatibilidade):** snapshot V4 com `engine_version='2.1.0'` lê sem erro (campos novos = null)
- **TC8 (pureza ADR-004):** motor não faz I/O nem markup divisor (assert sobre dependências)

## Dependencies

- **Depends on:** Motor RR V4 (commit `d13b54e`, baseline `engine_version='2.1.0'`)
- **Blocks:** STORY-MRM-V5-002 (campos novos no schema), STORY-MRM-V5-004 (créditos via input), STORY-MRM-V5-005 (UI cascata depende de `cascade_trace`)
- **Não depende de:** STORY-MRM-V5-003 (unificação rates loader pode rodar em paralelo após esta)

## Dev Notes

**Documentos de referência (fonte de verdade):**
- PRD v1.1: `docs/prd/EPIC-MRM-V5-AJUSTES.md` §4 STORY-MRM-V5-001 (ACs detalhados)
- ARCH v2.0: `docs/architecture/ARCH-EPIC-MRM-V5.md` §1.L1, §1.L2, §1.L3 (approach técnico)
- QA-VALIDATION v2.0: `docs/qa/QA-VALIDATION-EPIC-MRM-V5.md` §1.L1-L3, §4.GT-1, §4.GT-2
- ADRs: ADR-003 (snapshot imutável), ADR-004 (motor puro)
- Excel oficial: `Motor de descontos do resultado residual operacional.xlsx` — células I21, H21, H35, H36

**Pontos críticos:**
- `peso_op_interna` NÃO é cálculo runtime sobre cp/mod/dop. É propriedade do produto (markup divisor da precificação original).
- `ancora_interna ≠ Op_Interna_Original`. A primeira é PÓS desconto (motor), a segunda é PRÉ desconto (precificação).
- Motor puro (ADR-004): markup divisor vive no orchestrator, NUNCA no motor.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-05-22 | 1.0 | Story criada a partir do PRD v1.1 + ARCH v2.0 + QA-VALIDATION v2.0 (orquestração Orion) | @sm River |
| 2026-05-22 | 1.1 | Status promovido **Draft → Ready** após 10-point checklist (score **10/10**). Story liberada para @dev iniciar S1. | @po Pax |
| 2026-05-22 | 1.2 | Status promovido **Ready → InProgress**. Branch `feature/mrm-v5-001-peso-ancora-cascade-trace` criada. Pre-flight (plan-first) executado. | @dev Dex |
| 2026-05-22 | 1.3 | Status promovido **InProgress → InReview**. Todos os 9 ACs e 6 Tasks marcados como `[x]`. 4 commits atômicos locais. **123/123 tests MRM passam** (33 novos V5-001). File List preenchido. Dev Agent Record completo. Aguarda review do @qa Quinn. | @dev Dex |
| 2026-05-22 | 1.4 | **QA Gate PASS** — Status promovido **InReview → Done**. 7/7 quality checks aprovados. 1 issue LOW (JSDoc cosmetic, não bloqueante). Gate file: `docs/qa/gates/STORY-MRM-V5-001.yaml`. Trace requirements→tests documentado. Story pronta para @devops Gage push + PR. STORY-002 + STORY-003 liberadas para paralelizar no S2. | @qa Quinn |

## Dev Agent Record

### Agent Model Used
Claude Opus 4.7 (1M context) — @dev Dex orquestrado por Orion (aios-master)

### Implementação — Decisões técnicas

**Modo de operação:** Pre-Flight (plan-first) conforme sugerido pelo Orion. Pre-flight identificou:
1. Motor V4 atual usa `computeTaxesInside(rv, ...)` — refatorado para `computeTaxesInside(ancora, ...)` na V5.
2. `mrm-orchestrator.ts` JÁ EXISTIA com `orchestrateReapuration` (async) + `orchestrateReapurationSync`. Acrescentei `resolvePesoOpInterna` + `calculatePesoOpInternaFromMarkup` exportadas + integração nas duas funções existentes.
3. `computeTaxesOutside` (`baseOperacional = rv - imp_total`) deliberadamente **NÃO** foi tocada — escopo STORY-002 (D3 da v1.1 do PRD).

**Retrocompatibilidade:** quando `peso_op_interna` ausente no input do motor, default = 1 → Âncora ≡ RV → comportamento numérico idêntico à V4. **55/55 testes V4 existentes passam sem alteração funcional** (apenas hardcoded `'2.1.0'` foram atualizados para `'2.2.0'` em 3 locais).

**Pureza do motor (ADR-004) reforçada:** markup divisor (`Op_Interna = custo / (1 - Σ%)`) vive EXCLUSIVAMENTE em `mrm-orchestrator.ts`. O motor puro recebe `peso_op_interna` via `ReapurationInput` e nunca calcula via markup. Função `resolvePesoOpInterna` documentada com 3 fontes de prioridade.

**Clamp defensivo:** peso é clampado em `[0, 1]` tanto no orchestrator (`resolvePesoOpInterna`) quanto no motor (`calculateMarginReapuration`) para garantir invariante mesmo com inputs inválidos.

**Golden Excel canônico:** o motor V5 com PIS + COFINS separados (PIS=1,65% + COFINS=7,6%) sobre base reduzida produz o valor canônico do Excel (≈ R$ 12.233,5) — matematicamente equivalente à fórmula apuração 9,25% × (Âncora − ICMS) da STORY-002.AC5/ADR-008. **STORY-001 já atinge RRO ≈ R$ 17.471,16** quando rates são configurados corretamente.

### Resultados das validações
- **typecheck (`npx tsc --noEmit`):** 0 erros nos arquivos MRM tocados (`types/mrm.ts`, `utils/margin-reapuration.ts`, `utils/mrm-orchestrator.ts`). Erros pré-existentes do projeto (charts, contexts, mocks em testes) confirmados via `git stash` — não causados por esta story.
- **tests MRM (`npx jest mrm margin-reapur`):** **123/123 passam (5 suites)** — 90 existentes + 33 novos V5-001.
- **lint:** `next lint` deprecado e com problema de configuração pré-existente do projeto. Não bloqueia.
- **Pureza motor:** `margin-reapuration.ts` sem novos imports de I/O. `mrm-orchestrator.ts` ganhou apenas helpers de cálculo (sem I/O extra além do já existente em `loadTaxRates`).

### Commits atômicos locais (4)
1. `e2b6833` — feat(mrm-v5): bump engine 2.2.0 + tipos peso_op_interna/ancora_interna/cascade_trace (T1)
2. `517c2e7` — feat(mrm-v5): motor consume peso_op_interna via input + cascade_trace 13 etapas (T2 + T6)
3. `5426a8e` — feat(mrm-v5): orchestrator calcula peso_op_interna via markup divisor (3 fontes) (T3)
4. `e903fce` — test(mrm-v5): golden Excel canônico (RRO 17.471,16) + orchestrator markup divisor (T4 + T5)

Branch local: `feature/mrm-v5-001-peso-ancora-cascade-trace`. Push pendente — responsabilidade @devops Gage.

### Completion Notes List
1. ✅ Todos os 9 ACs implementados e testados.
2. ✅ Todas as 6 Technical Tasks (T1-T6) completas.
3. ✅ Zero regressão funcional (55/55 tests V4 existentes preservados).
4. ✅ Restrição-mãe respeitada (nenhuma nova aba/rota Next.js — apenas arquivos TypeScript de utilitário).
5. ✅ ADR-003 (snapshot imutável) preservado — snapshots V4 lidos sem erro.
6. ✅ ADR-004 (motor puro) reforçado — markup divisor isolado no orchestrator.
7. ⚠️ Lint (`next lint`) deprecado + problema pré-existente do projeto. **NÃO** bloqueia esta story.
8. ⏳ Story aguarda QA review (`@qa Quinn` via `*review`).

## QA Results

### Veredicto: ✅ **PASS**

**Reviewer:** @qa Quinn (Senior QA Engineer)
**Date:** 2026-05-22
**Gate file:** `docs/qa/gates/STORY-MRM-V5-001.yaml`

### Resumo dos 7 Quality Checks

| # | Check | Status | Observação |
|---|-------|--------|------------|
| 1 | **Code review** | ✅ PASS | Refatoração Etapa 5 limpa; clamp defensivo em uma linha; encapsulamento via `buildCascadeTrace` privado; 3 fontes do orchestrator com Number.isFinite guard |
| 2 | **Unit tests** | ✅ PASS | 123/123 tests MRM (verificação independente). 33 novos testes V5-001 cobrindo todos os ACs |
| 3 | **Acceptance criteria** | ✅ PASS | 9/9 ACs verificados via tests (AC1-AC9 mapeados no gate YAML) |
| 4 | **No regressions** | ✅ PASS | 55 testes V4 passam sem alteração funcional; snapshots V4 lidos sem erro; default peso=1 → Âncora≡RV |
| 5 | **Performance** | ✅ PASS | buildCascadeTrace O(13) constante; ~2KB/item no jsonb (aceitável ARCH v2.0 §2A) |
| 6 | **Security** | ✅ PASS | Motor puro preservado (ADR-004); inputs validados (clamp + isFinite); zero eval/dynamic code |
| 7 | **Documentation** | ✅ PASS | JSDoc cross-referenciado (PRD v1.1, ARCH v2.0, Excel células, PDF Motor RR §10); Story Dev Agent Record completo |

### Issues encontrados (1 LOW, não bloqueante)

| Severidade | Categoria | Local | Descrição | Recomendação |
|------------|-----------|-------|-----------|--------------|
| 🟡 LOW | docs | `src/types/mrm.ts:109` | JSDoc do `CascadeStep.amount` menciona `"value"` em vez de `"amount"` — pequena inconsistência semântica nos comentários | Substituir `value` por `amount` em revisão futura. Não bloqueante; não impacta runtime nem testability |

**Nenhum issue MEDIUM/HIGH/CRITICAL identificado.**

### Métricas validadas independentemente

```
npx jest mrm margin-reapur --no-watch
Test Suites: 5 passed, 5 total
Tests:       123 passed, 123 total
Time:        ~1.2s
```

- Tests novos V5-001: **33** (17 em margin-reapuration + 16 em mrm-orchestrator)
- Regressão V4: **0**
- ACs implementados: **9/9** ✓
- Tasks completas: **6/6** ✓
- Arquivos modificados: **7** (0 criados, 0 deletados — restrição-mãe preservada)
- Engine version: **2.1.0 → 2.2.0** ✓

### Trace Requirements → Tests (Given-When-Then)

| AC | Test(s) que validam |
|----|---------------------|
| AC1 (Schema) | `Schema V5: campos novos sempre populados` em margin-reapuration.test.ts |
| AC2 (Peso ORIGINAL) | `peso_op_interna persistido bate célula I21 do Excel (0,931585)` |
| AC3 (Âncora PÓS-desc) | `Âncora Interna bate célula H36 do Excel (R$ 159.342,38, PÓS desconto)` |
| AC4 (Cascade 13) | `cascade_trace tem exatamente 13 entradas em ordem fixa` + `Labels dos 13 steps alinhados ao PDF` |
| AC5 (Engine 2.2.0) | `Engine version reflete bump V5 (2.2.0)` |
| AC6 (Golden Excel) | 6 testes do bloco `V5-001 — Golden test Excel canônico` |
| AC7 (Motor puro) | `Pureza ADR-004` — assert sem imports de I/O |
| AC8 (JSDoc) | Inspeção manual: header do motor lista 13 etapas + refs |
| AC9 (3 fontes peso) | 8 testes do bloco `V5-001 — resolvePesoOpInterna` |

### Recomendações para próximas stories

1. **STORY-002 + STORY-003 podem iniciar em paralelo (S2)** — STORY-001 não é mais bloqueante.
2. **STORY-002.AC5** (fórmula PIS/COFINS apuração 9,25%) já tem ADR-008 ACCEPTED — pode prosseguir.
3. **Considerar** fix do issue LOW (JSDoc `value` → `amount`) em commit de cleanup futuro — pode ser absorvido na STORY-005 (UI cascada).
4. **Shadow mode 7 dias** (critério 5 do ADR-008) é responsabilidade do @devops Gage antes do promote para produção — não bloqueia stories.

### Authorization

Conforme `.claude/rules/story-lifecycle.md` Fase 4, **@qa Quinn está autorizado** a promover Status `InReview → Done` após QA Gate PASS.

— Quinn, guardião da qualidade 🛡️
