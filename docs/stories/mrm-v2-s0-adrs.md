# Story MRM-V2-S0 — ADRs Fundacionais do Motor de Reapuração de Margem V2

**Sprint:** S0
**Esforço estimado:** 8h
**Owner:** @architect
**Status:** Draft
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **arquiteto técnico (Aria)**, I want **formalizar 5 ADRs (Architecture Decision Records) que estabelecem os princípios fundacionais do Motor de Reapuração de Margem V2**, so that **toda implementação subsequente (S1-S4) tenha base arquitetural sólida, decisões rastreáveis e contratos imutáveis para evitar retrabalho e drift técnico**.

## Acceptance Criteria
- [ ] AC1: Existe `docs/architecture/adr/ADR-001-single-source-of-truth-motor.md` definindo `src/utils/margin-reapuration.ts` como cliente canônico do motor, com proibição explícita de duplicação de lógica em edge functions, pages ou outros utils.
- [ ] AC2: Existe `docs/architecture/adr/ADR-002-engine-version.md` definindo o campo `engine_version` (semver), regra de herança ascendente (orçamento → pedido → venda preserva versão original) e imutabilidade quando status >= `approved`.
- [ ] AC3: Existe `docs/architecture/adr/ADR-003-snapshot-fiscal-invariante.md` definindo `tax_breakdown JSONB NOT NULL` quando `status >= approved`, schema do snapshot (cofins_pct, pis_pct, icms_pct, iss_pct, csll_pct, irpj_pct, simples_pct, mei_fixo_value) e fonte da verdade (snapshot vence sobre tenant atual).
- [ ] AC4: Existe `docs/architecture/adr/ADR-004-motor-pure-vs-policies.md` definindo separação: `src/utils/margin-reapuration.ts` = funções puras (sem side effects, sem decisões de bloqueio) e `src/utils/mrm-policies.ts` = camada de policies (decide bloqueio por document_type conforme Q1).
- [ ] AC5: Existe `docs/architecture/adr/ADR-005-deprecacao-edge.md` definindo estratégia de deprecação da edge function legacy: 30d shadow mode → 60d HTTP 299 (warning) → corte para HTTP 410 (Gone), com critérios de rollback documentados.
- [ ] AC6: Todos os ADRs seguem template MADR (Markdown Any Decision Record): Status, Context, Decision, Consequences (positive/negative), Alternatives Considered.
- [ ] AC7: Cada ADR referencia decisões Q1-Q5 aprovadas quando aplicável e cita arquivos `file:line` impactados.

## Technical Tasks
- [ ] T1: Criar diretório `docs/architecture/adr/` se não existir.
- [ ] T2: Redigir ADR-001 (Single Source of Truth) — cobrir motor canônico, anti-padrão de duplicação, exceções autorizadas (testes).
- [ ] T3: Redigir ADR-002 (engine_version) — semver, herança ascendente, imutabilidade pós-approved, migrações de versão.
- [ ] T4: Redigir ADR-003 (Snapshot Fiscal Invariante) — schema completo tax_breakdown, constraint NOT NULL condicional, política snapshot-wins (Q3 default true).
- [ ] T5: Redigir ADR-004 (Motor Pure vs Policies) — assinaturas de funções puras, contrato de policies, exemplo Q1 (sales bloqueia, budgets/orders avisa).
- [ ] T6: Redigir ADR-005 (Deprecação Edge) — timeline 30d+60d, métricas de observabilidade, plano de rollback, comunicação a consumidores.
- [ ] T7: Atualizar `docs/motor-reapuracao-margem.md` com seção "ADRs Relacionados" linkando os 5 documentos.
- [ ] T8: Criar `docs/architecture/adr/README.md` com índice dos ADRs e processo de criação de novos ADRs.

## Files Affected
- `docs/architecture/adr/ADR-001-single-source-of-truth-motor.md` — novo (canonicidade do motor)
- `docs/architecture/adr/ADR-002-engine-version.md` — novo (versionamento e herança)
- `docs/architecture/adr/ADR-003-snapshot-fiscal-invariante.md` — novo (invariante de snapshot)
- `docs/architecture/adr/ADR-004-motor-pure-vs-policies.md` — novo (separação de responsabilidades)
- `docs/architecture/adr/ADR-005-deprecacao-edge.md` — novo (estratégia de descontinuação)
- `docs/architecture/adr/README.md` — novo (índice e processo)
- `docs/motor-reapuracao-margem.md` — atualizar seção ADRs Relacionados

## Test Cases
- TC1: Revisão por pares (@aios-master) confirma que cada ADR tem todas as seções MADR obrigatórias.
- TC2: Conferir que ADR-001 explicitamente proíbe duplicação em `supabase/functions/*` e `src/pages/**`.
- TC3: Conferir que ADR-003 lista o schema completo `tax_breakdown` incluindo csll_pct e irpj_pct (alinhamento com S1.1).
- TC4: Conferir que ADR-004 documenta `src/utils/mrm-policies.ts` como módulo a ser criado e descreve assinatura mínima `decide(documentType, mrmResult) → {block, warn, message}`.
- TC5: Conferir que ADR-005 contém critérios objetivos de avanço entre fases (ex: "≥99% paridade em shadow por 7 dias consecutivos").

## Dependencies
- Depends on: nenhuma (story raiz da iniciativa MRM V2)
- Blocks: MRM-V2-S1.1, MRM-V2-S1.2, MRM-V2-S1.3, MRM-V2-S1.4 (todas dependem das decisões formalizadas)

## Definition of Done
- [ ] 5 ADRs criados em `docs/architecture/adr/` no formato MADR
- [ ] README.md do diretório ADR criado com índice
- [ ] `docs/motor-reapuracao-margem.md` atualizado com referências
- [ ] Lint markdown verde (sem links quebrados)
- [ ] QA gate APPROVED por @qa
- [ ] @aios-master revisou e aprovou consistência arquitetural

## Notes
**Decisões Q1-Q5 a referenciar nos ADRs:**
- **Q1** (motor não bloqueia; policies decidem por document_type) → impacta ADR-004 diretamente.
- **Q2** (3-phase migration legacy: preservar V1 JSONB, Drafts lazy, Done locked) → impacta ADR-002 e ADR-003 (snapshot imutável em Done).
- **Q3** (`use_snapshot_rates = true` default) → impacta ADR-003 (snapshot vence sobre tenant atual).
- **Q4** (30d shadow + 60d HTTP 299 antes 410) → impacta ADR-005 inteiramente.
- **Q5** (Simples Nacional/MEI: CSLL/IRPJ = 0 + log warning) → mencionar em ADR-004 como exemplo de policy defensiva.

**Por que esta story é S0 (não S1):** Sem ADRs formalizados, as próximas stories podem implementar contra premissas conflitantes. Esta story é gate fundacional — `@architect` (Aria) é owner exclusivo conforme matriz de delegação (`@architect` owns system architecture decisions).

**Não confundir com:** Implementação dos princípios (isso ocorre em S1.x). Esta story entrega APENAS documentos `.md`.
