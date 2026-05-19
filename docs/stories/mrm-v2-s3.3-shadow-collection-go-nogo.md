# Story MRM-V2-S3.3 — Coleta 30d Shadow-Mode e Decisão Go/No-Go

**Sprint:** S3
**Esforço estimado:** 5-7h
**Owner:** @qa
**Status:** Draft
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro de QA (Quinn)**, I want **executar a janela de 30 dias corridos de coleta shadow-mode, monitorar diariamente o dashboard `/admin/mrm-divergences`, aplicar critério go/no-go ("7 dias consecutivos sem divergência crítica") e entregar o relatório formal `docs/qa/mrm-shadow-mode-go-nogo-report.md`**, so that **a decisão de avançar para a deprecação da edge `calc-tax-engine` (Sprint S4) seja baseada em evidência empírica de produção, conforme Q4 e ADR-005, evitando regressões em tenants pagantes**.

## Acceptance Criteria
- [ ] AC1: Período de coleta tem **30 dias corridos** a partir do deploy de S3.2 em produção. Data de início e fim documentadas no relatório.
- [ ] AC2: Monitoramento diário do dashboard (manual ou via screenshot automatizado): a cada dia útil, capturar p50/p95/p99 de `diff_percent` e `diff_amount` e número de divergências totais.
- [ ] AC3: **Critério GO**: 7 dias consecutivos com **zero divergência crítica** — divergência crítica = `diff_percent > 0.01%` OU `diff_amount > R$0,50`. Contador zera se qualquer dia violar.
- [ ] AC4: **Critério NO-GO** (reset imediato do contador): qualquer dia com p99 de `diff_amount > R$5,00` OU `AVG(diff_percent) > 0.5%`. Investigação obrigatória pelo @dev antes de retomar contagem.
- [ ] AC5: **Critério ESCALATE** (após 30d sem atingir 7 dias consecutivos limpos): escalation para @architect para decidir se (a) prorroga shadow por +30d, (b) investiga causa raiz e corrige motor V2, ou (c) aborta deprecação e mantém edge.
- [ ] AC6: Relatório final `docs/qa/mrm-shadow-mode-go-nogo-report.md` contém: (a) janela de coleta, (b) tabela diária com métricas, (c) lista de divergências críticas com investigação por @dev, (d) decisão final (GO/NO-GO/ESCALATE), (e) assinatura de @architect.
- [ ] AC7: Relatório é revisado e **aprovado explicitamente por @architect** (Aria) antes de S4 iniciar.
- [ ] AC8: Caso GO, relatório define a data oficial de deploy do HTTP 299 (S4.1) e a data de cutover para 410 (S4.3) — 60 dias após 299 conforme Q4.
- [ ] AC9: Todos os artefatos (screenshots, CSV exports do dashboard, logs de investigação) são anexados ao relatório ou referenciados via link/path.

## Technical Tasks
- [ ] T1: Criar template de relatório `docs/qa/mrm-shadow-mode-go-nogo-report.md` com seções pré-definidas (janela, métricas diárias, divergências críticas, decisão, sign-off).
- [ ] T2: Criar checklist diário `docs/qa/mrm-shadow-mode-daily-checklist.md` para QA executar a cada dia útil (verificar dashboard, capturar métricas, atualizar contador).
- [ ] T3: Setar reminder/cron (Google Calendar ou Notion) para QA executar checklist diariamente durante 30 dias.
- [ ] T4: Implementar query SQL `scripts/mrm-divergences-daily-report.sql` que gera CSV diário com métricas agregadas (input para preencher relatório).
- [ ] T5: Para cada divergência crítica detectada, abrir issue/sub-task atribuída a @dev para investigação root-cause (anexar input MRM completo, output client, output edge, diff por componente).
- [ ] T6: Ao final dos 30d (ou antes se 7 dias consecutivos limpos), preencher relatório final e submeter para review de @architect.
- [ ] T7: Caso GO, atualizar `docs/motor-reapuracao-margem.md` com decisão e datas oficiais de S4.1 e S4.3.

## Files Affected
- `docs/qa/mrm-shadow-mode-go-nogo-report.md` (CRIAR) — relatório final
- `docs/qa/mrm-shadow-mode-daily-checklist.md` (CRIAR) — checklist QA
- `scripts/mrm-divergences-daily-report.sql` (CRIAR) — query CSV diário
- `docs/motor-reapuracao-margem.md` — atualizar com decisão GO/NO-GO ao final

## Test Cases
- TC1 (critério GO atingido): 7 dias com 0 divergências críticas → contador atinge 7, decisão GO.
- TC2 (critério reset): dia 5 do contador tem 1 divergência crítica → contador zera, reinicia.
- TC3 (critério NO-GO imediato): dia 10 tem p99 R$8,00 → investigação imediata, contador zerado.
- TC4 (critério ESCALATE): 30d completos sem atingir 7 dias consecutivos → escalation para @architect.
- TC5 (relatório completo): relatório contém todas as 5 seções obrigatórias.
- TC6 (sign-off): commit final do relatório tem co-author ou mensagem explicit aprovação de @architect.

## Dependencies
- Depends on: MRM-V2-S3.2 (dashboard + alerting funcionando), MRM-V2-S3.1 (shadow-mode em produção)
- Blocks: MRM-V2-S4.1 (HTTP 299 só inicia após GO formal)

## Definition of Done
- [ ] 30 dias corridos rodados (ou GO antecipado se 7 consecutivos limpos)
- [ ] Checklist diário preenchido para cada dia útil da janela
- [ ] Todas as divergências críticas investigadas por @dev com root-cause documentado
- [ ] Relatório final preenchido e revisado
- [ ] Aprovação explícita de @architect (commit com assinatura ou aprovação em PR)
- [ ] Decisão (GO/NO-GO/ESCALATE) comunicada ao time
- [ ] Caso GO: datas oficiais de S4.1 e S4.3 documentadas
- [ ] QA gate APPROVED

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q4 (30d shadow + 60d HTTP 299 → 410)**: este story é a operacionalização dos primeiros 30d de Q4. Sem GO formal, S4 não inicia.

**ADRs aplicáveis:**
- **ADR-005 (estratégia deprecação edge)**: este story é o gate operacional do ADR — sem aprovação formal de @architect baseada em evidência empírica, edge permanece ativa.

**Anti-padrão a evitar:**
- NÃO declarar GO sem 7 dias consecutivos limpos, mesmo que métricas pareçam "boas o suficiente".
- NÃO ignorar divergências críticas individuais — cada uma DEVE ter investigação root-cause.
- NÃO automatizar a decisão GO/NO-GO — é humana, requer julgamento de @architect.

**Cenários comuns esperados de divergência (não-críticos, mas a documentar):**
- Diferença de timezone em `created_at` (motor cliente usa local, edge usa UTC) — mitigável via normalização.
- Diferença de precisão decimal em JS Number vs PostgreSQL NUMERIC — esperado dentro de epsilon.
- Cache stale em edge function (env vars não recarregadas após deploy) — exige cold start ou redeploy.

**Cenários críticos que devem disparar investigação imediata:**
- Divergência sistemática em tenants com regime `LUCRO_PRESUMIDO` (ex: CSLL calculada diferente).
- Divergência > R$10,00 em qualquer venda individual.
- Cluster de divergências em uma janela curta (sinal de bug introduzido por deploy).

**Comunicação:**
- Daily standup do time inclui status do contador (ex: "Dia 5 de 7 do contador limpo").
- Slack channel `#mrm-shadow-monitoring` para alertas e discussões.
- Relatório final compartilhado em reunião dedicada com @architect, @dev, @pm.

**Plano de contingência (NO-GO definitivo):**
- Manter edge como source-of-truth, motor cliente vira "preview" no UX.
- Reabrir investigação de divergências em sprint dedicada (potencialmente novo epic).
- Comunicar stakeholders sobre adiamento de S4.
