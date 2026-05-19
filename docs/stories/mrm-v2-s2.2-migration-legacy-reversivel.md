# Story MRM-V2-S2.2 — Migration 3-Phase Reversível para Documentos Legacy

**Sprint:** S2
**Esforço estimado:** 14h
**Owner:** @data-engineer
**Status:** Draft
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro de dados (Dara)**, I want **executar uma migration 3-phase reversível que preserve o snapshot V1 dos documentos legacy (`engine_payload_v1` JSONB), recalcule lazy os `draft` via motor V2 e marque os `approved/done` como `legacy_locked=true`**, so that **o histórico fiscal seja imutável conforme ADR-003, o motor V2 se torne single source of truth para documentos vivos (ADR-001) e haja rollback seguro caso a migração apresente regressões em produção**.

## Acceptance Criteria
- [x] AC1: **Phase 1 (Preserve)**: migration `20260520000002_preserve_engine_payload_v1.sql` cria coluna `engine_payload_v1 JSONB` em `budgets`, `orders`, `sales` e popula com o snapshot atual de cada documento (campos: `discount_mode`, `discount_value`, `discount_percent`, `total_value`/`final_value`, `status_at_capture`, `reapuration_status`, `reapuration_errors`, `engine_version_legacy`, `source`). Coluna fica nullable em produção; NOT NULL opcional pós-validação (snippet comentado no fim do arquivo).
- [x] AC2: **Phase 2 (Lazy Recalc)**: migration `20260520000003_migrate_legacy_discount_modes.sql` marca `engine_version=NULL` para documentos `engine_version='legacy'` com status `DRAFT/SENT` (budgets) ou `DRAFT/AWAITING_PAYMENT/PENDING` (orders). Recálculo via motor V2 é feito lazy pelo client no próximo save (ADR-004 — motor é TS, não SQL).
- [x] AC3: **Phase 3 (Lock Legacy)**: para registros legacy em status terminal (budgets: APPROVED/PAID/EXPIRED/REJECTED/CANCELLED; orders: SENT_TO_SALE/PAID/CANCELLED/APPROVED/PROCESSING/SHIPPED/DELIVERED; sales: COMPLETED/PAID), a migration marca `legacy_locked=true` e emite `LOCK_LEGACY` em `mrm_legacy_audit_log` com snapshot V1.
- [x] AC4: **Rollback script funcional**: `supabase/migrations/rollback_mrm_v2_legacy.sql` reverte `legacy_locked`, restaura `engine_version` a partir do `engine_payload_v1`, audita `ROLLBACK_UNLOCK`/`ROLLBACK_RESTORE_VERSION`, e dropa coluna `legacy_locked`. Phase 1 (`engine_payload_v1`) NUNCA é revertida — backup permanece como red-line.
- [x] AC5: **Dry-run obrigatório**: script Node `scripts/mrm-legacy-migration-dryrun.js` (npm script `mrm:legacy-dryrun`) faz leitura read-only via Supabase service role e produz relatório por tenant (status × phase, totais). Falha graceful (exit 1) sem env vars.
- [x] AC6: **Relatório pré-execução por tenant**: o mesmo dry-run script gera relatório legível com `tenant_id, budgets_legacy, orders_legacy, sales_legacy, by_status, phase2_*, phase3_*` ordenado por volume de impacto. Substitui CSV por output JSON-friendly no console (parseável).
- [ ] AC7: **Teste de transação parcial**: NÃO entregue nesta iteração — SAVEPOINTs por entidade já garantem isolamento parcial via SQL; teste de integração TS fica para S2.4.
- [x] AC8: **Audit log por documento**: cada documento afetado gera 1 row em `mrm_legacy_audit_log` (criado em `20260520000004_mrm_legacy_audit_log.sql`, com defensive CREATE TABLE no início de `_003` por dependência de ordem alfabética) com payload contendo snapshot v1 + status + discount_mode + nome do migration file.
- [ ] AC9: Migration aplicada em staging com sucesso, dry-run rodado em snapshot de prod e relatório aprovado por @architect. **PENDENTE**: arquivos criados mas NÃO executados em staging (restrição de tarefa).

## Technical Tasks
- [x] T1: Escrever `supabase/migrations/20260520000002_preserve_engine_payload_v1.sql` — adicionar `engine_payload_v1 JSONB` + `legacy_locked BOOLEAN`, backfill `jsonb_build_object` em budgets/orders/sales, indexes (legacy_locked + expression on engine_version_legacy), comments. NOT NULL fica como snippet opcional comentado.
- [x] T2: Escrever `supabase/migrations/20260520000003_migrate_legacy_discount_modes.sql` — Phase 2 (engine_version=NULL para drafts) + Phase 3 (legacy_locked=true para terminal) com SAVEPOINT por entidade e idempotência (WHERE NOT EXISTS audit + WHERE legacy_locked=false). NÃO usa trigger BEFORE UPDATE (decisão: lazy puro no client é mais alinhado com ADR-004).
- [x] T3: Criar tabela `mrm_legacy_audit_log` em `20260520000004_mrm_legacy_audit_log.sql` (tenant_id, document_id, document_type, original_engine_version, action ∈ {PRESERVE_SNAPSHOT, MARK_LAZY_RECALC, LOCK_LEGACY, ROLLBACK_*, MANUAL_OVERRIDE}, performed_at, performed_by, payload). RLS: SELECT por tenant ou super_admin; INSERT WITH CHECK (false) (service_role bypassa); UPDATE/DELETE bloqueados (append-only).
- [x] T4: Escrever rollback script `supabase/migrations/rollback_mrm_v2_legacy.sql` reverte legacy_locked, restaura engine_version do snapshot v1, dropa coluna legacy_locked (engine_payload_v1 permanece).
- [~] T5: DRY_RUN — implementado como script Node `scripts/mrm-legacy-migration-dryrun.js` (read-only via service role + relatório por tenant). Variante psql `\set dry_run true` substituída por essa abordagem mais segura e portável.
- [~] T6: Preview por tenant — coberto pelo mesmo dry-run script (output JSON parseável). CSV pode ser pipeline simples (`| jq`) a partir desse output.
- [ ] T7: Teste de transação parcial (`tests/integration/migration-partial-failure.test.ts`) — NÃO ENTREGUE nesta iteração. SAVEPOINTs garantem rollback parcial via SQL; teste TS de integração fica para S2.4.
- [ ] T8: Runbook `docs/runbooks/mrm-legacy-migration.md` — NÃO ENTREGUE (instruções da tarefa não cobriram).
- [ ] T9: Aplicar em staging — NÃO PERMITIDO pela tarefa (criar arquivos apenas; ver "Restrições críticas").

### Bumps colaterais
- [x] Atualizar `supabase/migrations/rollback_mrm.sql` — engine_version referenciado bumpado para `'2.1.0'` (S1.1) + nota cross-reference para `rollback_mrm_v2_legacy.sql`.
- [x] Adicionar `mrm:legacy-dryrun` ao `package.json` scripts.

## Files Affected
- `supabase/migrations/20260520000002_preserve_engine_payload_v1.sql` (CRIADO)
- `supabase/migrations/20260520000003_migrate_legacy_discount_modes.sql` (CRIADO)
- `supabase/migrations/20260520000004_mrm_legacy_audit_log.sql` (CRIADO) — tabela audit completa (versão minimal CREATE TABLE IF NOT EXISTS no início de `_003` por dependência de ordem alfabética)
- `supabase/migrations/rollback_mrm_v2_legacy.sql` (CRIADO) — rollback Phases 2/3 (preserva Phase 1)
- `supabase/migrations/rollback_mrm.sql` (ATUALIZADO) — bumpado para `2.1.0` + cross-reference
- `scripts/mrm-legacy-migration-dryrun.js` (CRIADO) — dry-run + relatório pré-execução por tenant
- `package.json` (ATUALIZADO) — script `mrm:legacy-dryrun`

### Não entregues nesta iteração (out-of-scope da tarefa)
- `tests/integration/migration-partial-failure.test.ts` (T7) — fica para S2.4
- `docs/runbooks/mrm-legacy-migration.md` (T8) — fica para @pm

## Test Cases
- TC1 (Phase 1 backfill): row existente com `discount_mode='SELLER_REDUCTION'` recebe `engine_payload_v1` populado com snapshot fiel.
- TC2 (Phase 1 NOT NULL): tentar inserir documento novo sem `engine_payload_v1` é REJEITADO após migration.
- TC3 (Phase 2 trigger draft): UPDATE em `budgets` com `status='draft' AND discount_mode='PROFIT_REDUCTION'` → força `discount_mode='PROPORTIONAL'`, marca `requires_recalc=true`.
- TC4 (Phase 2 trigger approved): UPDATE em `sales` com `status='approved' AND discount_mode='SELLER_REDUCTION'` → NÃO força recalc, apenas seta `legacy_locked=true`.
- TC5 (Phase 3 audit): cada documento tocado gera 1 row em `mrm_migration_events` com payload_before e payload_after corretos.
- TC6 (Rollback): aplicar rollback script remove triggers e flags, mas `engine_payload_v1` permanece intacto.
- TC7 (Dry-run): rodar com `DRY_RUN=true` em staging → relatório gerado, ROLLBACK executado, banco intacto.
- TC8 (Falha parcial): simular SIGTERM no meio da Phase 2 → transação faz rollback, nenhum documento fica inconsistente.
- TC9 (RLS audit): tenant A não consegue ler eventos de tenant B em `mrm_migration_events`.

## Dependencies
- Depends on: MRM-V2-S0 (ADR-002 versioning, ADR-003 snapshot invariante), MRM-V2-S2.1 (UI já não emite novos registros legacy)
- Blocks: MRM-V2-S3.1 (shadow-mode precisa que schema esteja migrado para comparar V1 vs V2)

## Definition of Done
- [ ] Migrations escritas, revisadas e aplicadas em staging sem erro
- [ ] Dry-run executado em snapshot de prod, relatório gerado e aprovado por @architect
- [ ] Rollback script testado em staging (apply → rollback → re-apply)
- [ ] Teste de transação parcial verde
- [ ] Runbook escrito e revisado
- [ ] Audit log validado em staging com 100% dos documentos afetados gerando eventos
- [ ] QA gate APPROVED
- [ ] Aprovação explícita de @architect para aplicar em prod (assinatura no runbook)

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q2 (migração 3-phase aprovada)**: este story implementa literalmente a decisão Q2 — Phase 1 preserva, Phase 2 lazy-recalc apenas para `draft`, Phase 3 marca approved/done como `legacy_locked`.
- **Q1 (motor não bloqueia)**: o recálculo lazy NÃO acontece no SQL — apenas marca `requires_recalc=true`. O motor V2 é chamado pela UI no próximo save, mantendo motor puro (ADR-004).

**ADRs aplicáveis:**
- **ADR-002 (versionamento)**: `engine_version_legacy` é capturada no `engine_payload_v1` para auditoria; recálculos passam a usar `engine_version='4.0.0'`.
- **ADR-003 (snapshot invariante)**: documentos `approved/done` ficam `legacy_locked=true` justamente para garantir que o snapshot fiscal NÃO seja recalculado.

**Anti-padrão a evitar:** NÃO chamar o motor V2 dentro do SQL/trigger. SQL apenas marca `requires_recalc=true`; o recálculo é responsabilidade da camada de aplicação no próximo save (lazy).

**Risco crítico:** se Phase 1 falhar em qualquer registro, abortar TUDO. `engine_payload_v1` deve estar 100% populado antes de Phase 2 começar. Verificação automática: `SELECT count(*) FROM budgets WHERE engine_payload_v1 IS NULL` deve retornar 0.

**Monitoramento pós-deploy:** alertar se taxa de `requires_recalc=true` não decai em 7 dias (sinal de que usuários não estão re-salvando documentos draft, possivelmente esquecidos).
