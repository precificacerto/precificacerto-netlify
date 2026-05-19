# Story MRM-V2-S4.3 — Edge `calc-tax-engine` Retorna HTTP 410 Gone + Runbook + Kill-Switch

**Sprint:** S4
**Esforço estimado:** 5h
**Owner:** @devops
**Status:** Draft
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro DevOps (Gage)**, I want **transformar a edge `calc-tax-engine` em HTTP 410 Gone após 60 dias do deploy de HTTP 299 (S4.1), implementar kill-switch via env var `MRM_EDGE_RESURRECT=true` que reverte para 299 em <5min, e entregar runbook formal com critérios de incident response**, so that **a deprecação seja concluída conforme Q4/ADR-005 com segurança operacional, permitindo reversão rápida em caso de incidente externo não previsto**.

## Acceptance Criteria
- [ ] AC1: Edge function `supabase/functions/calc-tax-engine/index.ts` é modificada para retornar HTTP 410 Gone com payload `{ error: "GONE", message: "This endpoint has been removed. Use the client-side motor (src/utils/margin-reapuration.ts).", migration_url: "/docs/motor-reapuracao-margem.md", removed_on: "{DATE_410}" }`.
- [ ] AC2: Headers de resposta 410 incluem: `Content-Type: application/json`, `Cache-Control: no-store`, `Link: </docs/motor-reapuracao-margem.md>; rel="successor-version"`.
- [ ] AC3: **Kill-switch**: env var `MRM_EDGE_RESURRECT=true` (em Supabase Edge env ou Vercel env) reverte comportamento para HTTP 299 (warning, igual S4.1). Mudança aplicada em <5min via redeploy de env var (sem code change).
- [ ] AC4: Reversão do kill-switch testada em staging: setar `MRM_EDGE_RESURRECT=true` → verificar via curl que response volta para 200+headers de warning em <5min.
- [ ] AC5: Runbook `docs/runbooks/mrm-edge-deprecation.md` é criado contendo: (a) data oficial do cutover 410, (b) critérios para acionar kill-switch (ex: outage massivo, contrato com tenant externo descoberto tarde), (c) procedimento exato de ativação (env var update + redeploy), (d) contatos de incident response (on-call DevOps, @architect, @pm), (e) métricas de monitoramento Sentry, (f) procedimento de rollback definitivo (caso 410 cause prejuízo irreversível).
- [ ] AC6: Sentry (ou equivalente) é configurado para capturar 410 responses com agregação por tenant. Alerta dispara se >10 tenants distintos hitam 410 em 1h (sinal de migration incompleta).
- [ ] AC7: Runbook revisado por @architect (sign-off documentado).
- [ ] AC8: Após 30 dias sem incidente pós-410: edge function é movida para `supabase/functions/_deprecated/calc-tax-engine/` e tarefa de remoção definitiva é agendada para sprint futura. Este AC pode ser cumprido em sprint posterior.
- [ ] AC9: 100% das chamadas à edge retornam 410 após deploy (validável via curl e telemetria Sentry).
- [ ] AC10: Comunicação proativa: email enviado a todos os tenants que apareceram em `mrm_edge_legacy_telemetry` nos 30d anteriores ao cutover, informando data exata e link de migração.

## Technical Tasks
- [ ] T1: Editar `supabase/functions/calc-tax-engine/index.ts` para verificar `Deno.env.get('MRM_EDGE_RESURRECT')` no início: se `true`, executar comportamento S4.1 (200 + warning); senão, retornar 410 com payload definido.
- [ ] T2: Configurar env var `MRM_EDGE_RESURRECT=false` em Supabase Edge production (default desligado).
- [ ] T3: Testar kill-switch em staging: deploy com `MRM_EDGE_RESURRECT=false` → curl retorna 410. Setar `MRM_EDGE_RESURRECT=true` → redeploy → curl retorna 200+warning em <5min.
- [ ] T4: Configurar Sentry para capturar 410 responses (tag `tenant_id`, `document_type`), criar alerta no Sentry: >10 tenants distintos / 1h.
- [ ] T5: Escrever runbook `docs/runbooks/mrm-edge-deprecation.md` com 6 seções (data, critérios kill-switch, procedimento, contatos, métricas, rollback definitivo).
- [ ] T6: Submeter runbook para review de @architect e capturar sign-off (commit assinado ou aprovação documentada).
- [ ] T7: Preparar template de email para tenants em `docs/communications/mrm-edge-deprecation-tenant-email.md` e disparar via Nodemailer 7d antes do cutover.
- [ ] T8: Após 30d pós-cutover sem incidente: PR para mover edge para `supabase/functions/_deprecated/calc-tax-engine/` (este passo pode ser story separada).
- [ ] T9: Monitorar Sentry por 30d pós-deploy e documentar findings em adendo ao runbook.

## Files Affected
- `supabase/functions/calc-tax-engine/index.ts` — adicionar 410 + kill-switch logic
- Supabase Edge env (`MRM_EDGE_RESURRECT`) — configurar (default false)
- `docs/runbooks/mrm-edge-deprecation.md` (CRIAR)
- `docs/communications/mrm-edge-deprecation-tenant-email.md` (CRIAR)
- Sentry config — alertas para 410 + tenants
- Após 30d: `supabase/functions/_deprecated/calc-tax-engine/` (mover)

## Test Cases
- TC1 (410 default): deploy com `MRM_EDGE_RESURRECT=false` → curl POST retorna 410 com payload correto.
- TC2 (headers 410): response 410 contém `Content-Type: application/json`, `Cache-Control: no-store`, `Link: rel="successor-version"`.
- TC3 (payload 410): payload JSON tem campos `error`, `message`, `migration_url`, `removed_on`.
- TC4 (kill-switch ativação): setar env `MRM_EDGE_RESURRECT=true` + redeploy → curl retorna 200 + headers Warning/Sunset em <5min.
- TC5 (kill-switch reversão): unset env → redeploy → curl retorna 410 novamente em <5min.
- TC6 (Sentry capture): 1 chamada à edge gera 1 event no Sentry com tag tenant_id.
- TC7 (Sentry alerta): simular 15 tenants diferentes chamando edge em 1h → alerta dispara.
- TC8 (telemetria): tabela `mrm_edge_legacy_telemetry` continua recebendo INSERTs mesmo com 410 (importante para auditoria).
- TC9 (email tenants): rodar template em staging → email recebido contém data, link de migração, contato.
- TC10 (runbook sign-off): PR do runbook tem aprovação documentada de @architect.

## Dependencies
- Depends on: MRM-V2-S4.2 (call-sites internos removidos), MRM-V2-S4.1 (60d desde deploy do HTTP 299)
- Blocks: nenhum (finaliza o epic MRM V2)

## Definition of Done
- [ ] Edge function retorna 410 em produção
- [ ] Kill-switch testado em staging (ativação E reversão em <5min)
- [ ] Sentry capturando 410 com alerta configurado
- [ ] Runbook escrito e revisado por @architect (sign-off documentado)
- [ ] Email enviado a tenants impactados 7d antes do cutover
- [ ] Lint + typecheck verde
- [ ] QA gate APPROVED
- [ ] Monitoramento Sentry por 30d sem incidente crítico
- [ ] Documentação `docs/motor-reapuracao-margem.md` finalizada com status "Edge Deprecated"

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q4 (HTTP 299 → 410)**: este story implementa a Fase 3 e final da deprecação Q4. Janela de 60d desde S4.1 deve ter sido cumprida antes de iniciar este story.

**ADRs aplicáveis:**
- **ADR-005 (estratégia deprecação edge)**: este story conclui o ADR. Após 30d sem incidente, edge é movida para `_deprecated/`.

**RFCs referenciados:**
- **RFC 9110 §15.5.11**: define HTTP 410 Gone — "the target resource is no longer available at the origin server and that this condition is likely to be permanent."

**Anti-padrão a evitar:**
- NÃO deletar a edge function imediatamente após cutover 410 — manter por 30d para permitir kill-switch.
- NÃO desativar telemetria `mrm_edge_legacy_telemetry` — continua útil para detectar quem ignorou comunicação prévia.
- NÃO retornar 200 com `error` field em vez de 410 — semântica HTTP correta importa para clients automatizados.

**Critérios para acionar kill-switch (a documentar no runbook):**
1. **Outage massivo**: >50 tenants reportam quebra de fluxo no mesmo dia.
2. **Contrato com tenant externo descoberto tarde**: tenant enterprise com SLA que não foi avisado em tempo.
3. **Bug crítico no motor cliente descoberto pós-cutover**: enquanto fix não está em prod.
4. **Auditoria/compliance externa** que demanda manter endpoint disponível.

**Procedimento exato do kill-switch (no runbook):**
1. Acessar Supabase Dashboard → Edge Functions → `calc-tax-engine` → Settings → Environment Variables.
2. Setar `MRM_EDGE_RESURRECT=true`.
3. Click "Save" → deploy automático em <2min.
4. Validar via curl: `curl -X POST https://{project}.supabase.co/functions/v1/calc-tax-engine -H "Authorization: Bearer {token}" -d '{...}'` → esperar 200 + header Warning.
5. Comunicar no Slack `#mrm-incidents` que kill-switch foi acionado.
6. Abrir incident retro em até 48h.

**Reversão definitiva (no runbook):**
- Após confirmação de causa raiz e fix, setar `MRM_EDGE_RESURRECT=false`, redeploy → 410 retoma.

**Encerramento do epic:** após 30d sem acionamento de kill-switch, considerar epic MRM V2 OFICIALMENTE COMPLETO. Comunicar fechamento em Sprint Review com métricas finais (chamadas à edge → 0, divergências client/edge históricas, performance gain).
