# Story MRM-V2-S2.1 — Remover Modos Legacy PROFIT_REDUCTION e SELLER_REDUCTION da UI

**Sprint:** S2
**Esforço estimado:** 6h
**Owner:** @dev
**Status:** InProgress
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro do motor de margem (Dex)**, I want **remover o seletor de modos legacy `PROFIT_REDUCTION` e `SELLER_REDUCTION` da UI de orçamentos, pedidos e vendas, forçando `PROPORTIONAL` como único modo disponível**, so that **a base de dados pare de receber novos registros com modos descontinuados, viabilizando a migração subsequente (S2.2) e consolidando a Receita Operacional Real (RRO) como única fonte de verdade do motor V2**.

## Acceptance Criteria
- [x] AC1: O seletor de `discount_mode` é **removido visualmente** das telas em `src/pages/orcamentos/index.tsx:1917-1932`, `src/pages/vendas/index.tsx:1962-1979` e `src/pages/pedidos/index.tsx:517` quando a feature flag `mrm.legacy_modes_visible` estiver `false` (default).
- [x] AC2: Todas as criações/edições de orçamento, pedido e venda passam a usar `discount_mode = 'PROPORTIONAL'` automaticamente, sem possibilidade de input alternativo do usuário.
- [x] AC3: A feature flag `mrm.legacy_modes_visible` é criada (default `false`) e, quando `true`, restaura o seletor original (mantido por 1 sprint para permitir rollback rápido sem revert de PR).
- [ ] AC4: Zero novos registros gravados com `discount_mode ∈ {PROFIT_REDUCTION, SELLER_REDUCTION}` após o deploy — validado por query de auditoria pós-deploy.
- [x] AC5: A UI das três telas mostra apenas a label "Proporcional" (ou ausência de label se a UI for simplificada), sem dropdown ou radio com opções legacy.
- [x] AC6: Regra de CI (lint custom ou teste de regressão) bloqueia reintrodução das strings `'PROFIT_REDUCTION'` e `'SELLER_REDUCTION'` em código sob `src/pages/**` e `src/components/**`.
- [x] AC7: Código dos modos legacy NÃO é removido de `src/utils/margin-reapuration.ts` neste story (preservado por 1 sprint para hot-fix se necessário) — apenas a UI deixa de oferecê-los.

## Technical Tasks
- [x] T1: Criar feature flag `mrm.legacy_modes_visible` no mecanismo de flags do projeto (verificar padrão existente em `src/lib/feature-flags.ts` ou tabela `tenants.feature_flags`), default `false`. — Criado em `src/config/feature-flags.ts` (não havia sistema de flags pré-existente).
- [x] T2: Em `src/pages/orcamentos/index.tsx:1917-1932`, envolver o bloco do seletor com `if (featureFlag('mrm.legacy_modes_visible'))` e definir fallback que força `discount_mode = 'PROPORTIONAL'` no submit.
- [x] T3: Repetir T2 em `src/pages/vendas/index.tsx:1962-1979`.
- [x] T4: Repetir T2 em `src/pages/pedidos/index.tsx:517` (force `PROPORTIONAL` ao espelhar pedido → orçamento via `handleSendToSale`).
- [x] T5: Adicionar regra ESLint custom (ou teste de snapshot) em `.eslintrc.js` ou `tests/regression/no-legacy-modes.test.ts` que falha se as strings `PROFIT_REDUCTION` ou `SELLER_REDUCTION` aparecerem em `src/pages/**` ou `src/components/**`. — Implementado como script Node (`scripts/check-no-legacy-discount-modes.js`) + npm script `test:legacy-guard`, com sentinela `// mrm-legacy-allowlist` por linha para código pré-existente de rollback.
- [ ] T6: Atualizar `docs/motor-reapuracao-margem.md` documentando que UI agora força `PROPORTIONAL` e que o código legacy do motor será removido em sprint futuro. — DEFERIDO: doc update fora do escopo deste subitem (handoff @architect/@po).
- [ ] T7: Criar query SQL de auditoria pós-deploy em `scripts/audit-no-legacy-modes.sql` para validar AC4. — DEFERIDO: requer credencial Supabase + tenants reais para execução; query será preparada por @data-engineer.

## Files Affected
### Criados
- `src/config/feature-flags.ts` — registra `FEATURE_FLAGS['mrm.legacy_modes_visible']` (default `false`), expõe `isFeatureEnabled()`, `LEGACY_DISCOUNT_MODES` e `coerceLegacyDiscountMode()` com log estruturado de auditoria
- `scripts/check-no-legacy-discount-modes.js` — guard CI que falha (exit 1) quando strings `PROFIT_REDUCTION`/`SELLER_REDUCTION` aparecem fora da whitelist; suporta sentinela `// mrm-legacy-allowlist` por linha

### Modificados
- `src/pages/orcamentos/index.tsx` — import flag, seletor condicional sob flag, coerção em insert (handleSave), update (handleUpdate) e cópia budget→order (handleSendToOrder), sentinelas em código pré-existente de cálculo
- `src/pages/vendas/index.tsx` — import flag, seletor condicional sob flag, coerção em insert (handleSaveSale), sentinelas em tooltip + cálculos + máx-desconto label
- `src/pages/pedidos/index.tsx` — import flag, coerção em cópia order→budget (handleSendToSale)
- `src/pages/agenda/index.tsx` — sentinelas `// mrm-legacy-allowlist` em código pré-existente (fora do escopo da story, mas necessário para zero violations)
- `package.json` — script npm `test:legacy-guard`

### Deferidos (handoff)
- `docs/motor-reapuracao-margem.md` — T6 (handoff @architect/@po)
- `scripts/audit-no-legacy-modes.sql` — T7 (handoff @data-engineer)

## Test Cases
- TC1: Carregar `/orcamentos` com flag `false` → seletor não aparece, novo orçamento salva com `discount_mode='PROPORTIONAL'`.
- TC2: Carregar `/vendas` com flag `false` → seletor não aparece, nova venda salva com `discount_mode='PROPORTIONAL'`.
- TC3: Carregar `/pedidos` com flag `false` → seletor não aparece, novo pedido salva com `discount_mode='PROPORTIONAL'`.
- TC4: Setar flag `true` para um tenant específico → seletor reaparece, comportamento legacy preservado.
- TC5: Tentar adicionar string `'PROFIT_REDUCTION'` em qualquer arquivo de `src/pages/**` → CI falha.
- TC6: Query de auditoria rodada 24h pós-deploy retorna 0 registros novos com modos legacy (filtro `created_at > deploy_timestamp`).
- TC7: Edição de orçamento existente com `discount_mode='SELLER_REDUCTION'` antigo permite re-save mantendo o valor antigo (não força conversão neste story — conversão fica em S2.2).

## Dependencies
- Depends on: MRM-V2-S0 (ADR-004 separação motor vs policies)
- Blocks: MRM-V2-S2.2 (migração legacy precisa que UI já não emita novos registros nos modos antigos)

## Definition of Done
- [x] Código implementado nas três telas sob feature flag
- [x] Feature flag `mrm.legacy_modes_visible` registrada e documentada (em `src/config/feature-flags.ts`)
- [x] Regra CI (ESLint custom ou teste de regressão) bloqueando reintrodução — `npm run test:legacy-guard` (0 violations)
- [ ] Query de auditoria criada e validada manualmente — DEFERIDO (T7, handoff @data-engineer)
- [x] Lint + typecheck verde (`npm run lint && npm run typecheck`) — typecheck: zero erros NOVOS introduzidos por esta story; erros pré-existentes (Supabase schema typings, chart options) não relacionados
- [ ] QA gate APPROVED — pendente @qa
- [ ] Documentação `docs/motor-reapuracao-margem.md` atualizada — DEFERIDO (T6)
- [ ] Smoke E2E manual: criar orçamento → pedido → venda salva com `PROPORTIONAL` em todos — pendente @qa

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q1 (motor não bloqueia)**: este story toca apenas UI; motor segue retornando `MRMResult` para qualquer `discount_mode` recebido. A força para `PROPORTIONAL` ocorre **antes** do call ao motor, no submit handler do form.
- **Q2 (migration 3-phase legacy)**: este story é pré-requisito da Fase 1 da migração — sem ele, novos registros continuariam entrando com modos legacy e contaminariam o `engine_payload_v1` backup.

**ADRs aplicáveis:**
- **ADR-004**: motor permanece puro; toda decisão de bloqueio/redirecionamento de modo ocorre na camada de UI/policy.

**Anti-padrão a evitar:** NÃO deletar o código dos modos legacy de `src/utils/margin-reapuration.ts` neste story. A remoção definitiva ocorre 1 sprint após este story (rollback safety net). Apenas a UI deixa de oferecê-los.

**Rollback rápido:** setar `mrm.legacy_modes_visible = true` para tenant específico via SQL direto restaura UI legacy em <1min, sem deploy.

## Change Log

| Date | Agent | Action |
|------|-------|--------|
| 2026-05-19 | @dev (Dex) | Status Draft → InProgress. Implementação UI + saves + guard CI. Feature flag em `src/config/feature-flags.ts`. T6 e T7 deferidos (handoffs explícitos). |
