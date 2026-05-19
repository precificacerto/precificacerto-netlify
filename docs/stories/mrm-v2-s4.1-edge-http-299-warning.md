# Story MRM-V2-S4.1 — Edge `calc-tax-engine` Responde HTTP 299 Warning Deprecation

**Sprint:** S4
**Esforço estimado:** 6h
**Owner:** @dev
**Status:** Draft
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro do motor de margem (Dex)**, I want **instrumentar a edge function `calc-tax-engine` para responder com header HTTP `Warning: 299` indicando deprecação iminente, incluir headers `Sunset` (data ISO do 410) e `Retry-After`, e logar telemetria de chamadas por tenant**, so that **clients consumindo a edge sejam avisados graciosamente sobre a deprecação durante a janela de 60 dias antes do cutover para HTTP 410 (Q4 + ADR-005), mantendo backwards-compat enquanto rastreamos quem ainda depende da edge**.

## Acceptance Criteria
- [ ] AC1: Edge function `supabase/functions/calc-tax-engine/index.ts` continua respondendo HTTP 200 com payload correto, **sem alterar comportamento funcional**.
- [ ] AC2: Toda resposta inclui header `Warning: 299 - "Deprecated: this endpoint will be removed on {DATE_410}. See migration: /docs/motor-reapuracao-margem.md"`, onde `{DATE_410}` é a data oficial definida em S3.3 (formato ISO 8601, ex `2026-07-19`).
- [ ] AC3: Toda resposta inclui header `Sunset: {DATE_410_RFC1123}` no formato RFC 1123 (ex `Fri, 19 Jul 2026 00:00:00 GMT`), conforme RFC 8594.
- [ ] AC4: Toda resposta inclui header `Retry-After: {SECONDS_UNTIL_SUNSET}` calculado dinamicamente como segundos restantes até `DATE_410`.
- [ ] AC5: Toda resposta inclui header `Link: </docs/motor-reapuracao-margem.md>; rel="deprecation"; type="text/html"` apontando para documentação de migração.
- [ ] AC6: Cada chamada incrementa contador `edge_legacy_calls_total{tenant_id, document_type}` em tabela `mrm_edge_legacy_telemetry` (tenant_id, document_type, called_at TIMESTAMPTZ, user_agent TEXT) — INSERT row por chamada (não agregado).
- [ ] AC7: Endpoint `/api/admin/mrm-edge-legacy-tenants` (super-admin) retorna lista de tenants que chamaram a edge nos últimos 30d com `count`, `first_call`, `last_call` — usado para outreach individual antes do cutover.
- [ ] AC8: Headers `Warning`, `Sunset`, `Retry-After`, `Link` presentes em **100% das respostas** da edge (testável via curl + integration test).
- [ ] AC9: Cron `/api/cron/mrm-edge-legacy-report` (diário, 9h BRT) gera relatório CSV de tenants ativos e envia por email para @architect e @devops.
- [ ] AC10: Telemetria não bloqueia resposta — INSERT da row é fire-and-forget (errors logam mas não retornam erro ao client).

## Technical Tasks
- [ ] T1: Editar `supabase/functions/calc-tax-engine/index.ts` para adicionar 4 headers (Warning, Sunset, Retry-After, Link) em todos os response paths (success e error).
- [ ] T2: Definir constante `DATE_410` em arquivo de config da edge (env var `MRM_EDGE_SUNSET_DATE`, default = data definida em S3.3).
- [ ] T3: Implementar cálculo dinâmico de `Retry-After` baseado em `DATE_410 - NOW()`.
- [ ] T4: Escrever migration `supabase/migrations/20260620000001_mrm_edge_legacy_telemetry.sql` criando tabela + índice em `(tenant_id, called_at)` + RLS (super-admin only para SELECT).
- [ ] T5: Adicionar INSERT fire-and-forget na edge function após cada call (capturar `tenant_id` do JWT, `document_type` do payload, `user_agent` do header).
- [ ] T6: Criar endpoint `src/pages/api/admin/mrm-edge-legacy-tenants.ts` (super-admin guard) com query agregada (`SELECT tenant_id, COUNT(*), MIN(called_at), MAX(called_at) FROM mrm_edge_legacy_telemetry WHERE called_at > NOW() - INTERVAL '30 days' GROUP BY tenant_id`).
- [ ] T7: Criar cron handler `src/pages/api/cron/mrm-edge-legacy-report.ts` gerando CSV + enviando email via Nodemailer existente.
- [ ] T8: Adicionar entrada em `vercel.json` para cron `0 12 * * *` (9h BRT = 12h UTC).
- [ ] T9: Escrever integration test em `tests/integration/edge-calc-tax-engine-headers.test.ts` validando presença dos 4 headers em response.
- [ ] T10: Atualizar `docs/motor-reapuracao-margem.md` com seção "Deprecação Edge" incluindo data oficial e instruções de migração para consumers externos (se houver).

## Files Affected
- `supabase/functions/calc-tax-engine/index.ts` — adicionar headers + telemetria fire-and-forget
- `supabase/migrations/20260620000001_mrm_edge_legacy_telemetry.sql` (CRIAR)
- `src/pages/api/admin/mrm-edge-legacy-tenants.ts` (CRIAR)
- `src/pages/api/cron/mrm-edge-legacy-report.ts` (CRIAR)
- `vercel.json` — adicionar cron
- `tests/integration/edge-calc-tax-engine-headers.test.ts` (CRIAR)
- `docs/motor-reapuracao-margem.md` — seção deprecação

## Test Cases
- TC1 (header Warning): curl POST à edge → response contém `Warning: 299 - "..."`.
- TC2 (header Sunset RFC 1123): response contém `Sunset: Fri, 19 Jul 2026 00:00:00 GMT` (formato exato).
- TC3 (header Retry-After dinâmico): chamada hoje vs daqui a 30 dias → `Retry-After` decresce monotonicamente.
- TC4 (header Link): response contém `Link: </docs/motor-reapuracao-margem.md>; rel="deprecation"`.
- TC5 (telemetria insert): chamar edge 10x → tabela `mrm_edge_legacy_telemetry` tem 10 rows com `tenant_id` correto.
- TC6 (telemetria fire-and-forget): forçar erro de INSERT (ex: RLS rejection) → edge ainda responde 200 com payload correto.
- TC7 (endpoint admin): GET `/api/admin/mrm-edge-legacy-tenants` retorna agregado com 30d de dados, super-admin only (não super-admin → 403).
- TC8 (cron diário): cron executa, gera CSV, envia email a @architect (validar em staging com email de teste).
- TC9 (backwards-compat): payload de response da edge é **idêntico** ao antes (nenhum field novo, nenhum field removido).
- TC10 (error path): edge retorna 400 (input inválido) → headers de deprecação AINDA presentes na response de erro.

## Dependencies
- Depends on: MRM-V2-S3.3 (decisão GO formal aprovada + data `DATE_410` definida)
- Blocks: MRM-V2-S4.2 (remoção de call-sites pode iniciar em paralelo, mas validação depende de headers funcionando), MRM-V2-S4.3 (HTTP 410 só após 60 dias do HTTP 299 deploy)

## Definition of Done
- [ ] Edge function editada com 4 headers em 100% dos response paths
- [ ] Migration aplicada e RLS validada
- [ ] Endpoint admin funcional com guard super-admin
- [ ] Cron diário enviando relatório por email (validado em staging)
- [ ] Integration test verde para headers
- [ ] Telemetria fire-and-forget validada (insert error não quebra response)
- [ ] Lint + typecheck verde
- [ ] QA gate APPROVED
- [ ] Documentação `docs/motor-reapuracao-margem.md` atualizada com data oficial
- [ ] Deploy em produção e validado via curl externo

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q4 (60d HTTP 299 antes de 410)**: este story implementa a Fase 2 da deprecação Q4. Janela de 60d começa após deploy desta story.

**ADRs aplicáveis:**
- **ADR-005 (estratégia deprecação edge)**: HTTP 299 + Sunset + Retry-After é a estratégia oficial para deprecação graciosa.

**RFCs referenciados:**
- **RFC 7234 §7.1**: define HTTP Warning header `299 - "miscellaneous persistent warning"`.
- **RFC 8594**: define header `Sunset` para indicar fim-de-vida de recurso HTTP.
- **RFC 5988**: define header `Link` com `rel="deprecation"`.

**Anti-padrão a evitar:**
- NÃO mudar comportamento funcional da edge — apenas adicionar headers e telemetria.
- NÃO usar HTTP 299 como código de status — é um Warning header (response continua 200).
- NÃO bloquear resposta se telemetria falhar.

**Outreach a tenants externos:** se relatório `edge-legacy-tenants` mostrar tenants chamando edge diretamente (ex: integração customizada, n8n, API externa), @pm + @devops devem fazer outreach individual via email durante a janela de 60d, fornecendo guia de migração.

**Monitoramento esperado:**
- D+0 (deploy): ~100% das chamadas vêm do cliente shadow-mode (esperado).
- D+15 (S4.2 deploy): chamadas do cliente caem para 0 (call-sites removidos).
- D+30: chamadas residuais = consumers externos (target para outreach).
- D+60: idealmente 0 chamadas; senão, decidir caso a caso antes de 410.

**Fallback se Supabase Edge não suportar custom headers:** validar previamente — se Deno Deploy ou Supabase Functions limita headers, alternativas (a) usar header customizado `X-Deprecation` ou (b) embutir warning em body JSON `_deprecation` field (menos ideal, quebra backwards-compat).
