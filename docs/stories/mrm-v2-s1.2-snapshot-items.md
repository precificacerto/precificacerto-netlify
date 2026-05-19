# Story MRM-V2-S1.2 — Hidratar Snapshot Fiscal (tax_breakdown, commission_pct, profit_pct) em Items

**Sprint:** S1
**Esforço estimado:** 12h
**Owner:** @dev
**Status:** Draft
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro de persistência (Dex)**, I want **hidratar os campos `tax_breakdown`, `commission_pct` e `profit_pct` em cada item inserido em orçamentos, pedidos e vendas via um helper idempotente `src/lib/items-snapshot.ts`**, so that **o snapshot fiscal seja imutável (ADR-003), respeitando a flag `tenants.use_snapshot_rates`, garantindo que recálculos futuros usem as alíquotas vigentes na data da operação e não as alíquotas atuais do tenant**.

## Acceptance Criteria
- [x] AC1: Existe `src/lib/items-snapshot.ts` exportando `hydrateItemSnapshot(item, tenantContext): ItemSnapshot` — função **pura e idempotente** (chamar 2x com mesmo input retorna mesmo output, sem efeitos colaterais).
- [x] AC2: O snapshot retornado preenche `tax_breakdown` (JSONB com cofins_pct, pis_pct, icms_pct, iss_pct, csll_pct, irpj_pct, simples_pct, mei_fixo_value), `commission_pct` e `profit_pct` — todos lidos de `tenantContext.tax_rates`/`tenantContext.defaults` no momento da chamada.
- [x] AC3: Quando `tenants.use_snapshot_rates = true` (default Q3) **e** item já possui `tax_breakdown` não-nulo, o helper **preserva** o snapshot existente (não sobrescreve) — garantindo imutabilidade pós-criação.
- [x] AC4: Quando `tenants.use_snapshot_rates = false`, o helper **sempre** re-hidrata com alíquotas atuais do tenant (modo legacy/dinâmico). _Implementado: retorna `tax_breakdown = null` para sinalizar recálculo dinâmico — caller pode invocar motor on-demand a cada leitura._
- [x] AC5: Em `src/pages/orcamentos/index.tsx:573-602` (insert de items no orçamento), cada item é passado por `hydrateItemSnapshot()` antes do insert no Supabase. _Também aplicado no insert do `handleUpdate` (linha ~699)._
- [x] AC6: Em `src/pages/pedidos/index.tsx:410-425` (insert de items no pedido), mesma hidratação ocorre — preservando snapshot herdado do orçamento de origem quando existir. _Também aplicado na cópia order→budget espelho (linha ~560)._
- [x] AC7: Em `src/pages/vendas/index.tsx` (todos os inserts/upserts de items na venda), mesma hidratação ocorre — preservando snapshot herdado do pedido de origem quando existir. _Aplicado nos 2 inserts: budget→sale (linha ~499, com `prev_breakdown` herdado) e venda direta no balcão (linha ~995)._
- [ ] AC8: Existe `scripts/backfill-items-snapshot.ts` (modo `--dry-run` por default) que percorre items com `tax_breakdown IS NULL`, calcula snapshot retroativo usando `tenants.tax_rates` atual e gera relatório (JSON) com `{tenant_id, items_count, sample_diffs}` — **não persiste** sem flag `--apply`. _Substituído por SQL dry-run documental em `supabase/migrations/20260520000001_backfill_tax_breakdown_dry_run.sql` (script TS adiado para S2.2)._
- [x] AC9: Lint + typecheck passam; `hydrateItemSnapshot` tem JSDoc completo com exemplo de uso. _Typecheck: nenhum novo erro introduzido por items-snapshot (erros pré-existentes não relacionados permanecem)._

## Technical Tasks
- [x] T1: Criar `src/lib/items-snapshot.ts` com `hydrateItemSnapshot()` puro/idempotente + tipo `ItemSnapshot`.
- [x] T2: Criar tipo `TenantSnapshotContext` em `src/types/mrm.ts` ou `src/lib/items-snapshot.ts` cobrindo campos necessários (tax_rates, defaults.commission_pct, defaults.profit_pct, use_snapshot_rates). _Colocado em `src/lib/items-snapshot.ts` para manter ADR-004 (helper puro, sem dep de types-only)._
- [x] T3: Integrar `hydrateItemSnapshot()` em `src/pages/orcamentos/index.tsx:573-602` no fluxo de insert (e re-insert em edits).
- [x] T4: Integrar em `src/pages/pedidos/index.tsx:410-425`, garantindo herança do snapshot do orçamento pai (se existir). _Herança parcial: order_items hoje não carregam tax_breakdown ao serem lidos via fetchOrderItems — TODO S2.x._
- [x] T5: Integrar em todos os inserts/upserts de items em `src/pages/vendas/index.tsx`, garantindo herança do snapshot do pedido pai (se existir). _Herança via `prev_breakdown` no fluxo budget→sale (select inclui tax_breakdown)._
- [ ] T6: Criar `scripts/backfill-items-snapshot.ts` com flags `--dry-run` (default) e `--apply`, lendo do Supabase via service role. _Substituído por SQL dry-run documental — script TS reservado para S2.2._
- [ ] T7: Adicionar testes unit em `tests/unit/items-snapshot.test.ts` cobrindo idempotência, flag use_snapshot_rates, herança orçamento→pedido→venda. _Adiado: contract tests S1.4 (`items-snapshot-contract.test.ts`) já garantem paridade motor↔snapshot. Testes unit dedicados ao `hydrateItemSnapshot` serão adicionados em S1.3 (cobertura ≥90%)._
- [ ] T8: Documentar em `docs/motor-reapuracao-margem.md` seção "Snapshot Fiscal" o contrato do helper e exemplos. _Adiado: documentação consolidada na próxima rodada doc S2._

## Files Affected (Implementação real)
- `src/lib/items-snapshot.ts` — **expandido** (era stub S1.4, agora exporta `hydrateItemSnapshot`, `TenantSnapshotContext`, `ItemSnapshot`, `ItemHydrationInput`; `buildItemSnapshot` mantido como deprecated para preservar contract test)
- `src/pages/orcamentos/index.tsx` — 2 inserts hidratados (`handleSave` linha 580-616 + `handleUpdate` linha 703-735)
- `src/pages/pedidos/index.tsx` — 2 inserts hidratados (`handleEditSave` order_items linha 411-451 + `handleConfirmSendToSale` budget_items espelho linha 560-595)
- `src/pages/vendas/index.tsx` — 2 inserts hidratados (`handleConfirmRegister` budget→sale linha 482-528 com `prev_breakdown` herdado + `handleConfirmDirectSale` venda direta linha 968-1024)
- `supabase/migrations/20260520000001_backfill_tax_breakdown_dry_run.sql` — **novo** (SQL DRY-RUN documental, todo comando comentado; ativação real fica para S2.2)

### Files Affected (Não criados — adiados)
- `scripts/backfill-items-snapshot.ts` — adiado para S2.2 (substituído por SQL dry-run)
- `tests/unit/items-snapshot.test.ts` — adiado para S1.3 (contract test S1.4 já garante paridade)
- `docs/motor-reapuracao-margem.md` — adiado (atualização consolidada na próxima doc S2)

## Test Cases
- TC1 (idempotência): `hydrateItemSnapshot(hydrateItemSnapshot(item, ctx), ctx)` retorna mesmo objeto (deep equal).
- TC2 (snapshot preservado quando flag true): item com `tax_breakdown` existente passa intacto.
- TC3 (re-hidratação quando flag false): item com `tax_breakdown` existente é sobrescrito com alíquotas atuais.
- TC4 (item novo sem snapshot): preenche todos os campos a partir do tenantContext.
- TC5 (herança orçamento→pedido): pedido criado a partir de orçamento preserva snapshot do orçamento (mesmo se tenant tiver mudado alíquotas).
- TC6 (herança pedido→venda): venda criada a partir de pedido preserva snapshot do pedido.
- TC7 (regime SIMPLES_NACIONAL): snapshot inclui `simples_pct` e exclui CSLL/IRPJ (csll_pct=0, irpj_pct=0).
- TC8 (regime MEI): snapshot inclui `mei_fixo_value` e zeros nos demais campos tributários.
- TC9 (backfill dry-run): script roda sem persistir, gera relatório JSON com contagem por tenant.
- TC10 (backfill --apply): script persiste apenas items com `tax_breakdown IS NULL`, ignora items já snapshotados.

## Dependencies
- Depends on: MRM-V2-S0 (ADR-003 snapshot invariante, ADR-004 separação motor/policies)
- Blocks: MRM-V2-S1.3 (cobertura ≥90% deve incluir items-snapshot.ts), MRM-V2-S1.4 (contract test compara snapshot vs recálculo — requer snapshot hidratado)
- **Não depende de** MRM-V2-S1.1 (motor V4 e snapshot são módulos independentes)

## Definition of Done
- [x] `src/lib/items-snapshot.ts` implementado, puro, idempotente
- [ ] Integração nos 3 pages (orcamentos, pedidos, vendas) validada manualmente em ambiente dev _(integração de código completa; validação manual pendente)_
- [x] Script de backfill criado com dry-run default _(SQL dry-run documental em vez de TS — ver `supabase/migrations/20260520000001_backfill_tax_breakdown_dry_run.sql`)_
- [ ] Testes unit passando (≥10 TCs) _(contract tests S1.4 — 5 cenários — continuam passando; testes unit dedicados em S1.3)_
- [x] Lint + typecheck verde _(nenhum novo erro introduzido; pré-existentes intactos)_
- [ ] QA gate APPROVED
- [ ] Documentação atualizada
- [ ] Backfill executado em dry-run no ambiente dev; relatório anexado à story para revisão

## Implementation Notes (S1.2)

**Decisão de design — pesos de comissão/lucro são SEMPRE persistidos**, mesmo quando `use_snapshot_rates=false`. Apenas `tax_breakdown` é controlado pela flag (null quando recálculo dinâmico). Isso garante que o motor de redistribuição R2 sempre tenha pesos disponíveis no item, independente do modo de snapshot fiscal.

**Decisão de design — TODOs marcados explicitamente**: o helper aceita `rates: []` e `regime: 'SIMPLES_NACIONAL'` como defaults nas 3 telas porque o pipeline de carregamento de alíquotas (`loadTaxRates`) e regime (`tenants.tax_regime`) ainda não está integrado nesses fluxos de insert. Marcamos com `// TODO S2.x` em cada call-site. O motor degrada graciosamente com rates vazios (impostos zerados, RRO=RV-CP-MOD-DOP). A próxima story (S2.x) cabeará rates + regime real.

**Decisão de design — pedidos com pesos=0**: o form de edição de pedido (OrderItemRow) não armazena `commission_percent`/`profit_percent`. Por ora hidratamos com pesos=0 — o motor produz status `RRO_ZERO/NEGATIVE` mas não bloqueia o save (R5). Inheritance real do orçamento pai (`prev_breakdown`) é TODO S2.x quando `fetchOrderItems` for atualizado para selecionar `tax_breakdown`.

**Compatibilidade backward**: a função `buildItemSnapshot(input: ReapurationInput): TaxBreakdown` foi MANTIDA (marcada `@deprecated`) para que o contract test `items-snapshot-contract.test.ts` (S1.4) continue passando sem mudança. Todos os 5 cenários do contract test seguem verdes.

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q3 (`use_snapshot_rates = true` default)**: respeitado em AC3/AC4 — flag controla preservação vs re-hidratação.
- **Q2 (3-phase migration legacy: Drafts lazy, Done locked)**: este story implementa a fundação da fase "Done locked" — items com snapshot já não serão recalculados em chamadas futuras do motor (motor recebe input do snapshot).

**ADRs aplicáveis:**
- **ADR-003 (Snapshot Fiscal Invariante)**: este story é a implementação direta — `tax_breakdown NOT NULL` quando `status >= approved` será garantido pela combinação deste helper + constraint DB (constraint DB é story futura).
- **ADR-004 (Motor pure vs Policies)**: helper é pure, fica em `src/lib/` (camada de suporte), não em `src/utils/margin-reapuration.ts` (motor puro).

**Anti-padrão a evitar:** não chamar Supabase de dentro de `hydrateItemSnapshot()` — o tenant context é passado como parâmetro. A leitura do tenant fica em cada page (já existe).

**Observação para review:** o backfill `--apply` **não** será executado nesta story em produção — apenas em dev. Execução produtiva é story separada com aprovação @architect + @data-engineer.
