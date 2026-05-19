# ADR-001: Single source of truth do Motor de Reapuração de Margem V2

**Status:** Accepted
**Data:** 2026-05-19
**Decididores:** @architect Aria, @pm Morgan, @qa Quinn, @aios-master Orion
**Aprovado por:** Hyago (Founder)
**Contexto:** Motor de Reapuração de Margem V2 — Sprint S0

## Contexto

A versão atual do motor de cálculo fiscal vive em dois lugares distintos: o cliente (`src/utils/margin-reapuration.ts`), responsável pelo cálculo em tempo real nas telas de orçamento/pedido/venda, e a edge function (`supabase/functions/calc-tax-engine/`), originalmente desenhada para servir cálculos a chamadas externas e à precificação inicial em `/produtos` e `/itens`.

Essa dualidade gerou uma série de problemas observados em produção e em desenvolvimento:

- O script `scripts/sync-pricing-engine.js` precisa ser executado manualmente sempre que uma das duas implementações é alterada, criando janelas de drift técnico.
- Bugs de paridade entre cliente e edge ja causaram divergências em casos de teste (RB R$10k, desconto 10%) cujo RRO calculado divergia em centavos.
- Cada alteração fiscal (ex.: inclusão de CSLL/IRPJ no rateio em S1.1) exige dois PRs, dois reviews e dois deploys, dobrando o custo de manutenção.
- A reforma tributária gradual (R1) e a evolução do motor planejada para S1-S4 tornam o dual source insustentável.

O motor de cálculo é o coração fiscal do produto: precisa de **uma única definição canônica**, auditável, versionável e reprodutível.

## Decisão

O arquivo `src/utils/margin-reapuration.ts` é declarado a **única fonte canônica** do Motor de Reapuração de Margem V2. Toda lógica de cálculo (11 etapas + V1-V6) vive exclusivamente nele.

Regras inegociáveis:

1. **Proibição de duplicação**: nenhum outro módulo (edge functions, páginas `src/pages/**`, hooks, utils) pode reimplementar etapas do motor. Consumidores chamam o cliente, não copiam fórmulas.
2. **Edge function `calc-tax-engine` será deprecada** seguindo o plano formal definido em [ADR-005](./adr-005-deprecacao-edge-function.md): 30 dias de shadow-mode → 60 dias de HTTP 299 (warning) → corte para HTTP 410 (Gone).
3. Durante a janela de migração (S3), a edge opera como **shadow**: recebe input, calcula em paralelo, mas o resultado do cliente prevalece. Divergências sao logadas para auditoria.
4. O script `scripts/sync-pricing-engine.js` é declarado **débito técnico** e será removido ao final de S4.
5. **Exceção autorizada única**: testes unitários (`tests/`) podem instanciar fixtures e mocks que repliquem trechos do motor, desde que claramente marcados como `// TEST FIXTURE — NOT CANON`.

A separação entre cálculo puro (motor) e regras de aplicação (policies) é tratada em [ADR-004](./adr-004-separacao-motor-pure-vs-policies.md).

## Consequências

### Positivas
- Elimina drift técnico entre cliente e edge — uma única implementação revisada e testada.
- Reduz custo de manutenção: mudanças fiscais (ex.: CSLL/IRPJ, IBS/CBS) exigem um único PR.
- Habilita versionamento determinístico do motor via `engine_version` (ver [ADR-002](./adr-002-versionamento-engine-version.md)).
- Acelera onboarding: novos desenvolvedores leem um único arquivo para entender o motor inteiro.
- Auditoria fiscal simplificada — sem ambiguidade sobre qual implementação produziu cada resultado.

### Negativas / Trade-offs
- Toda a responsabilidade de cálculo passa a ser do cliente — chamadas server-to-server (raras hoje) precisam ser orquestradas via API route Next.js que internamente invoque o motor cliente, ou migrar para SSR.
- A edge `calc-tax-engine` precisa ser cuidadosamente sunsetizada (ver [ADR-005](./adr-005-deprecacao-edge-function.md)) para não quebrar consumidores externos eventuais.
- Equipe perde flexibilidade de "patch rápido na edge" — toda correção vai pelo ciclo padrão de release do app.

### Neutras
- O arquivo `src/utils/margin-reapuration.ts` cresce em responsabilidade e exige disciplina de modularização interna (mas o motor já é função pura, então o impacto é controlado).
- A precificação inicial em `/produtos` e `/itens` é desacoplada do MRM (decisão D3 da spec original) — essa parte da edge **não** entra no escopo deste ADR.

## Alternativas consideradas

### Alternativa A: Edge como canônica + cliente como cache local
Rejeitada porque adiciona latência fiscal (chamada de rede a cada edição de item) e introduz problema de cache stale — exatamente o que motivou o cliente no design original. Além disso, o cliente já é a fonte usada em 100% das telas de cálculo em tempo real.

### Alternativa B: Manter `scripts/sync-pricing-engine.js` permanentemente
Rejeitada porque transforma drift em débito permanente. Cada execução manual depende de disciplina humana — e já houve incidentes em que o sync foi esquecido após hotfix.

### Alternativa C: Mover motor para package compartilhado (`@precificacerto/mrm-engine`)
Avaliada e descartada para o escopo S0-S4: monorepo workspace + publicação no npm interno adiciona complexidade de tooling que não se paga no curto prazo. Reavaliar em 2027 se houver consumidor externo legítimo (ex.: app mobile nativo).

## Implementação

**Arquivos afetados (canônico)**:
- `src/utils/margin-reapuration.ts` — motor puro (11 etapas + V1-V6), continua o que é hoje.
- `src/utils/mrm-orchestrator.ts` — orquestra loader + motor + snapshot, continua o que é hoje.

**Arquivos afetados (deprecação)**:
- `supabase/functions/calc-tax-engine/` — entra em shadow-mode em S3, HTTP 299 em S4.1, HTTP 410 em S4.3, mover para `_deprecated/` em S4.4.
- `scripts/sync-pricing-engine.js` — remover em S4.3 junto com o cutover.

**Validação**:
- Sprint S3: telemetria `mrm_engine_divergences` deve registrar zero divergências críticas (>0,01% ou >R$0,50) por 7 dias consecutivos antes de avançar para Fase Warning.
- Sprint S4.3: monitoramento de chamadas externas à edge deve estar em zero por 30 dias antes do corte HTTP 410.

## Referências
- Story: `docs/stories/mrm-v2-s0-adrs.md`
- Spec: `Motor_Reapuracao_Margem_Precifica_Certo_v2.docx`
- Memória: `project_motor_v2_sprint_plan_2026_05_19.md`
- [ADR-002](./adr-002-versionamento-engine-version.md) — Versionamento engine_version
- [ADR-004](./adr-004-separacao-motor-pure-vs-policies.md) — Separação motor (pure) vs policies
- [ADR-005](./adr-005-deprecacao-edge-function.md) — Estratégia de deprecação da edge function
