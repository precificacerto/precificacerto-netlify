# ADR-005: Estratégia de deprecação da edge function `calc-tax-engine`

**Status:** Accepted (atualizado em 2026-05-22 — vide Change Log no final)
**Data:** 2026-05-19 (atualizado 2026-05-22 com nota Story MRM-V5-003)
**Decididores:** @architect Aria, @pm Morgan, @qa Quinn, @aios-master Orion
**Aprovado por:** Hyago (Founder)
**Contexto:** Motor de Reapuração de Margem V2 — Sprint S0

> **🔄 Nota Story MRM-V5-003 (2026-05-22):** Confirmação formal de que `mrm-rates-loader.ts` é a **fonte autoritativa** de regime e alíquotas para o motor RR (single source of truth — ADR-001). O `mrm-orchestrator.ts` consome exclusivamente o loader; a edge `calc-tax-engine` continua em modo shadow conforme Fase 1-2 desta deprecação. STORY-MRM-V5-003.AC1 confirma a arquitetura.

## Contexto

A edge function `supabase/functions/calc-tax-engine/` foi criada na V1 do produto para servir cálculos fiscais a chamadas externas e à precificação inicial em `/produtos` e `/itens`. Com a definição em [ADR-001](./adr-001-single-source-of-truth-motor.md) de que `src/utils/margin-reapuration.ts` é a **única fonte canônica** do motor, a edge precisa ser descontinuada.

Descontinuar uma edge function em produção é arriscado:

- Pode haver callers externos não mapeados (integrações de parceiros, scripts internos, webhooks legados).
- Um corte abrupto (`HTTP 410 Gone` direto) quebra silenciosamente esses callers e degrada a experiência sem aviso.
- Por outro lado, manter a edge ativa indefinidamente perpetua o problema de dual source of truth e o débito técnico do `scripts/sync-pricing-engine.js`.

A spec V2 (decisão Q4) já indicou intenção de migração faseada — este ADR formaliza o plano operacional com critérios objetivos de avanço, gates de qualidade e plano de rollback.

## Decisão

Adotar **migração em 3 fases sequenciais com gates objetivos** entre cada uma:

### Fase 1: Shadow (30 dias) — Sprint S3

- A edge continua respondendo HTTP 200 com payload calculado normalmente.
- O cliente (`src/utils/margin-reapuration.ts`) passa a calcular em paralelo todo input que chega à edge.
- Divergências (resultado cliente vs edge) são logadas na tabela `mrm_engine_divergences` com schema mínimo: `{ id, request_id, input_hash, edge_result, client_result, diff_amount, diff_percent, created_at }`.
- **Cliente já é canônico** para callsites internos do app — edge serve apenas legacy/externos.
- **Gate para avançar**: 7 dias consecutivos com **zero divergências críticas**, onde "crítica" = `diff_percent > 0.01%` OR `diff_amount > R$0,50` em qualquer linha.
- Telemetria adicional: contagem de chamadas externas (User-Agent ≠ `precificacerto-app`) para mapear consumidores remanescentes.

### Fase 2: Warning (60 dias) — Sprint S4.1

- A edge passa a retornar HTTP 200 com cabeçalhos:
  - `Warning: 299 - "calc-tax-engine deprecated; migrate to client engine"`
  - `Sunset: <data_corte_HTTP_410_em_formato_RFC_7231>`
  - `Link: <https://docs.precificacerto.com/migracao-mrm-v2>; rel="deprecation"`
- Payload de resposta continua válido — clientes seguem funcionando.
- Telemetria registra: callers que receberam warning, frequência por User-Agent, evolução temporal (caem ou estabilizam?).
- Comunicação proativa: identificar top callers e enviar e-mail de aviso (responsabilidade @pm).
- **Gate para avançar**: queda contínua de chamadas externas por 30 dias **OU** ≤ 10 chamadas/dia por 7 dias consecutivos.

### Fase 3: Gone — Sprint S4.3

- A edge passa a retornar `HTTP 410 Gone` com payload JSON explicativo apontando para documentação.
- **Kill-switch de reversão**: variável de ambiente `MRM_EDGE_RESURRECT=true` reverte a edge para HTTP 299 (Fase 2) em menos de 5 minutos (apenas redeploy da edge, sem precisar de migration). Documentado em runbook operacional.
- Monitoramento ativo nas primeiras 72 horas pós-corte: qualquer pico inesperado de 410 → considerar reversão.
- **Após 30 dias sem incidentes**: mover diretório `supabase/functions/calc-tax-engine/` para `supabase/functions/_deprecated/calc-tax-engine/` (arquivamento) e remover `scripts/sync-pricing-engine.js` definitivamente.

### Critérios objetivos de rollback (em qualquer fase)

Reverter para fase anterior se ocorrer qualquer um:
- Taxa de erro (HTTP 5xx ou exceções não capturadas) > 1% no cliente após mudança.
- Reclamações de cliente externo (>3 tickets/dia) mencionando "tax engine" ou "calc-tax".
- Divergência crítica reaparecer em telemetria após Fase 1 ter sido marcada como estável.

## Consequências

### Positivas
- Migração previsível, com prazos definidos e gates objetivos — elimina ansiedade de "quando podemos cortar?".
- Janela de shadow mode dá segurança fiscal: qualquer bug de paridade aparece **antes** do corte, não depois.
- Cabeçalhos HTTP padrão (`Warning`, `Sunset`, `Link`) seguem RFC 7234/8594 — ferramentas de monitoramento de API detectam automaticamente.
- Kill-switch permite reverter em <5min sem precisar de hotfix de migration.
- Comunicação proativa a top callers reduz risco de churn por surpresa.

### Negativas / Trade-offs
- Total de ~90 dias entre início da Fase 1 e corte final — não é "rápido". Justificável dado o risco fiscal.
- Tabela `mrm_engine_divergences` cresce em volume durante Fase 1 — precisa de policy de retenção (sugerir 90 dias após corte final, depois drop).
- Operação requer engajamento ativo do @pm para comunicação a callers externos durante Fase 2.

### Neutras
- A edge `calc-tax-engine` ainda serve precificação inicial em `/produtos` e `/itens` (decisão D3 da spec original) — **isso não muda** com esta deprecação. O escopo do ADR é exclusivamente o cálculo de reapuração de margem.

## Alternativas consideradas

### Alternativa A: Deprecação imediata (HTTP 410 direto)
Rejeitada porque quebra clients ainda em uso sem aviso. Sem janela de shadow, bugs de paridade não seriam descobertos até depois do corte — exatamente quando custam mais.

### Alternativa B: Manter forever (não deprecar)
Rejeitada porque eterniza o débito técnico do `scripts/sync-pricing-engine.js`, perpetua o problema de dual source of truth e cria fardo de manutenção em cada nova versão do motor (S1.1, S2.x, 2027+).

### Alternativa C: Migração instantânea com redirect HTTP 308 para API route Next.js
Avaliada. Tecnicamente viável, mas mistura camadas (edge → API route) e não resolve a questão de paridade — só adia. Plano em 3 fases é mais transparente e auditável.

### Alternativa D: Pular Fase 1 (shadow) e ir direto para Fase 2 (warning)
Rejeitada porque assume paridade perfeita entre cliente e edge — assunção que historicamente falhou (já houve divergências detectadas em testes manuais). Shadow é cinto de segurança barato.

## Implementação

**Arquivos afetados**:
- `supabase/functions/calc-tax-engine/index.ts` — adiciona código de shadow logger em S3; adiciona cabeçalhos de deprecação em S4.1; retorna 410 em S4.3.
- Nova migration `S3_*_create_mrm_engine_divergences.sql` — tabela de logging de divergências.
- `src/utils/margin-reapuration.ts` — sem mudança (cliente já é canônico).
- `scripts/sync-pricing-engine.js` — **deletar** em S4.3 junto com cutover.
- Runbook operacional `docs/ops/mrm-edge-deprecation-runbook.md` — criar em S3 com instruções de monitoramento, kill-switch e rollback.
- Variável de ambiente `MRM_EDGE_RESURRECT` — adicionar ao Vercel/Supabase em S4.3 com default `false`.

**Validação**:
- Sprint S3: dashboard com gráfico de divergências críticas — gate de avanço é objetivo e verificável.
- Sprint S4.1: telemetria de top callers — gate é a curva de chamadas externas.
- Sprint S4.3: dry-run do kill-switch em staging antes do corte em produção — teste de revival em <5min.
- 72h pós-corte: alerta automático se chamadas 410 > X/min (X a definir baseado em volume baseline).

## Referências
- Story: `docs/stories/mrm-v2-s0-adrs.md`
- Spec: `Motor_Reapuracao_Margem_Precifica_Certo_v2.docx`
- Memória: `project_motor_v2_sprint_plan_2026_05_19.md`
- Decisão Q4: 30d shadow + 60d HTTP 299 antes 410
- [ADR-001](./adr-001-single-source-of-truth-motor.md) — Single source of truth (motivação da deprecação)
- RFC 8594 — The Sunset HTTP Header Field
- RFC 7234 §5.5 — Warning Response Header
