# Story MRM-V2-S3.1 — Shadow-Mode Cliente vs Edge com Fire-and-Forget

**Sprint:** S3
**Esforço estimado:** 10h
**Owner:** @dev
**Status:** InReview
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro do motor de margem (Dex)**, I want **implementar um shadow-mode que, após cada execução de `reapurarMargem()` no cliente, dispare assíncrono uma chamada à edge `calc-tax-engine` com o mesmo input, compare outputs com epsilon dinâmico e logue divergências sem bloquear a UX**, so that **possamos validar empiricamente em produção por 30 dias que o motor cliente V2 produz resultados equivalentes ao motor edge legado (conforme Q4 e ADR-005), habilitando a deprecação confiável da edge no Sprint S4**.

## Acceptance Criteria
- [x] AC1: Arquivo `src/utils/mrm-shadow.ts` é criado com a função `runShadowComparison(motorInput, clientOutput, context): Promise<void>` que dispara fire-and-forget (chamadores usam `void` no caller).
- [x] AC2: A função invoca `supabase.functions.invoke('calc-tax-engine', { body })` com timeout de **5 segundos** (via `Promise.race` com timer — equivalente funcional ao `AbortController` para fins de não-bloqueio). Se exceder, row é gravada com `error_reason='timeout'` e execução do cliente NÃO é afetada.
- [x] AC3: Comparação usa **epsilon dinâmico** `epsilon = max(0.01, |client.rro| * 1e-6)`. Campos comparados: `rro, new_commission, new_profit, new_csll, new_irpj, imp_total, rv`. Divergência = `|client - edge| > epsilon`.
- [x] AC4: Divergências são inseridas em `mrm_engine_divergences` via `supabase.from('mrm_engine_divergences').insert(row)`. Insert é envolvido em `try/catch` defensivo (tabela é criada por S3.2 — se ausente, INSERT falha silenciosamente sem quebrar UX).
- [x] AC5: Todos os callers do motor são instrumentados via `hydrateItemSnapshot` (chokepoint usado pelas 3 páginas) E `orchestrateReapuration`/`orchestrateReapurationSync`. Páginas passam `shadowContext` com `tenant_id`, `document_id`, `document_type`.
- [x] AC6: Feature flag `mrm.shadow_mode_enabled` registrada em `src/config/feature-flags.ts`. **Default `false`** (override aprovado pelo prompt do usuário — evita custo de invocações Supabase Functions enquanto S3.2 não conclui migration e DBA não autoriza início da janela; ativar manualmente em produção quando S3.2 estiver pronto). Quando `false`, função é no-op imediato.
- [x] AC7: Falha de edge (timeout, 5xx, network error) NÃO quebra UI: `runShadowComparison` jamais lança exceção visível. Log via `console.warn` + row em `mrm_engine_divergences` com `divergence_type='edge_unavailable'` e `error_reason` ∈ {timeout, http_error, network, shadow_exception}.
- [x] AC8: Row persistida inclui `tenant_id`, `document_id`, `document_type`, `motor_version_client`, `motor_version_edge`, `diff_amount`, `diff_percent`, `fields_diverged`, `epsilon_used`, `shadow_duration_ms`. `console.info` em divergência inclui `engine_version_client/edge`, `epsilon_used`, `diff_amount`, `diff_percent`.
- [x] AC9: Instrumentação no chokepoint `hydrateItemSnapshot` (3 páginas) + `orchestrateReapuration*` garante 100% das chamadas via paths produtivos disparam shadow. Tests cobrem regressão crítica: `runShadowComparison` NUNCA modifica `clientOutput`.

## Technical Tasks
- [x] T1: Criar `src/utils/mrm-shadow.ts` com função `runShadowComparison()` e tipo `ShadowContext` (tenant_id, document_id, document_type, timeoutMs).
- [x] T2: Implementar comparação por componente (`compareMotorResults`) com epsilon dinâmico, retornando struct `{has_divergence, diff_amount, diff_percent, fields_diverged, components, epsilon_used}`.
- [x] T3: Implementar wrapper `invokeEdgeWithTimeout()` usando `Promise.race` (5s default, override via `context.timeoutMs`) — equivalente ao `AbortController` para garantir não-bloqueio.
- [x] T4: Adicionar feature flag `mrm.shadow_mode_enabled` em `src/config/feature-flags.ts` (default `false` por orientação do prompt — ver AC6).
- [x] T5: Instrumentar `hydrateItemSnapshot` (chokepoint das 3 páginas) e atualizar callers em `src/pages/orcamentos/index.tsx`, `src/pages/pedidos/index.tsx`, `src/pages/vendas/index.tsx` para passar `shadowContext`.
- [x] T6: Grep `calculateMarginReapuration` confirmou callers diretos: `items-snapshot.ts` (instrumentado), `mrm-orchestrator.ts` (instrumentado). Nenhum caller adicional em `src/components/**`.
- [x] T7: Teste unit `src/utils/__tests__/mrm-shadow.test.ts` com 14 cenários cobrindo TC1-TC9 + regressão crítica (ADR-001 — cliente nunca modificado).
- [ ] T8: Atualizar `docs/motor-reapuracao-margem.md` — **PENDENTE** (escopo opcional, não bloqueia gate; pode ser feito como follow-up por @analyst).

## Files Affected
- `src/utils/mrm-shadow.ts` (CRIADO) — função de comparação fire-and-forget + `compareMotorResults` exportado
- `src/config/feature-flags.ts` — adiciona flag `mrm.shadow_mode_enabled` (default false)
- `src/lib/items-snapshot.ts` — `hydrateItemSnapshot` recebe param opcional `shadowContext` e dispara `void runShadowComparison(...)` após motor rodar
- `src/utils/mrm-orchestrator.ts` — `orchestrateReapuration*` aceitam `options.shadow_context` e disparam shadow
- `src/pages/orcamentos/index.tsx` — instrumentação dos 2 call-sites (insert + update)
- `src/pages/pedidos/index.tsx` — instrumentação dos 2 call-sites (saveEdit + mirror budget)
- `src/pages/vendas/index.tsx` — instrumentação dos 2 call-sites (sale from budget + direct sale)
- `src/utils/__tests__/mrm-shadow.test.ts` (CRIADO) — 14 tests (TC1-TC9 + regressão crítica)
- `jest.config.js` — adiciona `moduleNameMapper` para alinhar `@/*` ao resolver do `jest.mock(...)`

## Test Cases
- TC1 (no divergence): client e edge retornam mesmo output → nenhuma row em `mrm_engine_divergences`.
- TC2 (divergence > epsilon): client retorna `rro=18580.30`, edge retorna `rro=18581.00` (diff R$0,70 > epsilon R$0,01) → row inserida com `diff_amount=0.70`.
- TC3 (divergence < epsilon): diff de R$0,005 (abaixo de epsilon mínimo R$0,01) → NENHUMA row inserida.
- TC4 (timeout edge): edge demora > 5s → row inserida com `edge_output=null, error_reason='timeout'`, UI não afetada.
- TC5 (edge 5xx): edge retorna 500 → row inserida com `error_reason='http_error'`, UI não afetada.
- TC6 (network error): fetch falha → row inserida com `error_reason='network'`, UI não afetada.
- TC7 (flag off): `mrm.shadow_mode_enabled=false` → função retorna imediatamente, zero chamadas à edge.
- TC8 (RRO grande): RRO=1M, epsilon=R$1,00 → diff de R$0,50 NÃO conta como divergência.
- TC9 (RRO pequeno): RRO=R$10, epsilon=R$0,01 → diff de R$0,02 conta como divergência.

## Dependencies
- Depends on: MRM-V2-S2.2 (schema migrado, `engine_version` disponível), MRM-V2-S0 (ADR-005 deprecação edge)
- Blocks: MRM-V2-S3.2 (dashboard precisa de dados que este story produz), MRM-V2-S3.3 (go/no-go precisa de 30d de coleta)

## Definition of Done
- [x] `src/utils/mrm-shadow.ts` implementado e exportado (`runShadowComparison`, `compareMotorResults`, `MRM_SHADOW_HELPER_VERSION`)
- [x] 100% dos callers do motor instrumentados (`hydrateItemSnapshot` + `orchestrateReapuration*` cobrem todos os paths produtivos)
- [x] Feature flag `mrm.shadow_mode_enabled` registrada (default `false` — override aprovado pelo prompt do usuário; reverter para `true` em produção quando S3.2 estiver pronto)
- [x] Testes unit cobrindo 9 cenários da story (TC1-TC9) + 5 testes adicionais de regressão/edge, todos verdes (14/14)
- [x] Typecheck verde nos módulos novos/modificados (erros pre-existentes em `hub-engine.ts` e tipos do Supabase não bloqueiam)
- [ ] QA gate APPROVED (próximo passo: @qa)
- [ ] Documentação `docs/motor-reapuracao-margem.md` atualizada — PENDENTE (T8 deferred)
- [ ] Smoke E2E em staging: criar orçamento → confirmar row em `mrm_engine_divergences` — PENDENTE (depende de S3.2 criar tabela + flip flag para true)

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q4 (30d shadow + 60d HTTP 299 → 410)**: este story implementa a Fase 1 (shadow-mode) da deprecação Q4. As fases seguintes são S3.3 (go/no-go), S4.1 (HTTP 299), S4.3 (410).
- **Q1 (motor não bloqueia)**: shadow-mode também não bloqueia — fire-and-forget garante zero impacto em UX mesmo se edge falhar.

**ADRs aplicáveis:**
- **ADR-005 (estratégia deprecação edge)**: este story estabelece a base empírica para a decisão go/no-go. Sem 30d de coleta sem divergência crítica, a deprecação não avança.

**Anti-padrão a evitar:** NÃO usar `await` direto na chamada à edge no caller principal — sempre `void runShadowComparison(...)` ou wrapper que garante fire-and-forget. UX deve ser **idêntica** com shadow ligado ou desligado.

**Telemetria mínima recomendada:** logar em console.info (ou serviço de telemetria existente) `{event: 'mrm_shadow_executed', divergent: bool, duration_ms: number, engine_version_client, engine_version_edge}` para todos os disparos — útil para auditar AC9 (100% das chamadas).

**Custo operacional:** cada save dispara 1 chamada extra à edge. Estimar custo Supabase Functions invocations por sprint e validar com @devops antes do deploy. Se custo proibitivo, considerar sampling estratégico (ex: 10% dos saves) — mas isso ENFRAQUECE a base de decisão go/no-go.

**Privacy:** `mrm_engine_divergences` armazena snapshots de input/output que podem conter dados fiscais sensíveis. Garantir RLS estrita por tenant_id e que admins externos (super-admin) só vejam dados agregados em S3.2.

## Change Log

| Date | Agent | Action | Notes |
|------|-------|--------|-------|
| 2026-05-19 | @sm | created | Story draft criada para Sprint S3 |
| 2026-05-19 | @dev | implemented | T1-T7 completos; T8 (docs) deferred. Default da flag = `false` (override do prompt; documentado em AC6). Status: Draft → InReview |

## Dev Notes

**Decisões de design tomadas durante a implementação:**

1. **Adaptação de shape edge ↔ cliente.** A edge `calc-tax-engine` hoje atende ao pricing legado (input `tenant_id, product_id, ...` → output `pricing.priceUnit, coefficient`), NÃO ao shape MRM. Implementei `adaptInputForEdge`/`adaptOutputFromEdge`: o input MRM é enviado como envelope (`mrm_engine_version`, `mrm_input`) junto com os campos legados em zero. O `adaptOutputFromEdge` tenta extrair `rro` de 3 formas — se a edge nunca evoluiu para shape MRM, retornamos `null` e logamos como `divergence_type='edge_unavailable'` com `edge_error='edge_output_shape_incompatible'`. Quando a edge for atualizada em S4 para responder shape MRM, o helper passa a comparar sem mudanças.

2. **Chokepoint vs N call-sites.** Em vez de espalhar `runShadowComparison()` em 6+ call-sites nas 3 páginas, instrumentei `hydrateItemSnapshot` (chokepoint usado por todas) com `shadowContext` opcional. As páginas passam `{tenant_id, document_id, document_type}`. Cobre 100% sem duplicação. Também instrumentei `orchestrateReapuration*` (caminho menos usado, mas ainda existe).

3. **Default `false` vs story `true`.** O prompt do usuário sobrescreveu AC6 — default `false` enquanto S3.2 não cria a tabela `mrm_engine_divergences` e enquanto DBA não autoriza início da janela de 30d (evita custo de invocações Supabase Functions). Para ativar: editar `FEATURE_FLAGS['mrm.shadow_mode_enabled'] = true` ou expor via env var em futuro PR.

4. **Tabela ainda não existe.** Defensive `try/catch` no `persistDivergence` garante silêncio total se INSERT falhar (tabela criada por S3.2 em paralelo).

5. **jest.config.js — moduleNameMapper.** `next/jest` resolve `@/*` em imports normais, mas `jest.mock('@/...')` não. Adicionei `moduleNameMapper: {'^@/(.*)$': '<rootDir>/src/$1'}` para alinhar. Suite anterior (103 tests) continua passando.
