# ADR-004: Separação entre motor puro (cálculo) e policies (aplicação)

**Status:** Accepted
**Data:** 2026-05-19
**Decididores:** @architect Aria, @pm Morgan, @qa Quinn, @aios-master Orion
**Aprovado por:** Hyago (Founder)
**Contexto:** Motor de Reapuração de Margem V2 — Sprint S0

## Contexto

A spec V2 do MRM contém uma contradição aparente que precisa ser resolvida arquiteturalmente antes de avançar para S1-S4:

- **Diretriz R5** (oficial): "Se RRO ≤ 0, sistema **orienta** usuário (não força valor)". Ou seja: o motor não toma decisão de bloqueio — apenas reporta status.
- **Spec V2 §8.1**: descreve regras explícitas de bloqueio — "venda com RRO ≤ 0 deve ser **bloqueada** para salvamento". Ou seja: alguém precisa decidir bloquear.

Essas duas afirmações só são consistentes se houver **duas camadas distintas**: uma que calcula sem opinar (motor) e outra que aplica regras de UX/negócio sobre o resultado (policies).

Adicionalmente, há outros casos onde o "o que fazer com o resultado" depende de contexto que o motor não conhece:

- Tipo de documento: orçamento (negociação preliminar) tolera RRO negativo com aviso, venda (transação consumada) não tolera.
- Role do usuário: admin pode aprovar exceção, vendedor não.
- Regime tributário: Simples Nacional/MEI tem CSLL/IRPJ = 0 e gera warning de log (Q5), enquanto Lucro Real exige preenchimento obrigatório.
- Configurações de tenant: alguns tenants podem optar por "permitir RRO negativo em qualquer documento com revisão obrigatória" via flag.

Misturar essas decisões dentro do motor o tornaria intransportável, intestável em isolamento e impossível de reusar para análises hipotéticas ("e se eu der 15% de desconto, o que acontece?").

## Decisão

Adotar **separação estrita em duas camadas**:

### Camada 1: Motor puro — `src/utils/margin-reapuration.ts`

- **Função pura**: dado um input (`ReapurationInput`), retorna um output (`ReapurationResult`) com `status` ∈ `{VALID, RRO_ZERO, RRO_NEGATIVE, ERROR}` e todos os números calculados.
- **Nunca bloqueia, nunca decide, nunca consulta contexto externo** (sem `documentType`, sem `userRole`, sem `tenantSettings` como parâmetros).
- **Sem side effects**: não escreve em banco, não loga, não emite eventos, não chama API.
- **Mesma entrada → mesma saída**: 100% determinístico, ideal para testes e simulações.
- Continua sendo a fonte canônica do cálculo conforme [ADR-001](./adr-001-single-source-of-truth-motor.md).

### Camada 2: Policies — `src/utils/mrm-policies.ts` (novo, criado em S2.3)

- **Função de decisão**: recebe `(motorResult, documentType, userRole, tenantSettings)` e retorna uma policy decision: `{ action: 'allow' | 'warn' | 'block_save', message?: string, requires_review?: boolean }`.
- **Concentra toda regra de negócio sobre o que fazer com o resultado**.
- Pode ter side effects controlados: log de warning, telemetria, evento de auditoria.

### Defaults de policy (mínimo viável, S2.3)

| Documento | Resultado do motor | Decisão de policy |
|-----------|---------------------|--------------------|
| `sales`   | `RRO_NEGATIVE` / `RRO_ZERO` | `block_save` + mensagem orientativa |
| `budgets` / `orders` | `RRO_NEGATIVE` / `RRO_ZERO` | `warn` + `requires_review=true` |
| qualquer  | `VALID`                      | `allow`                                |
| qualquer  | `ERROR`                      | `block_save` + log crítico             |

Além disso, regimes Simples Nacional/MEI: ao computar com `csll_pct=0` e `irpj_pct=0`, policy emite warning de log (Q5) para sinalizar que esses tributos não foram aplicáveis — não bloqueia, apenas alerta para auditoria.

Essa separação resolve a contradição R5 vs Spec §8.1: motor não força (R5 satisfeita), policies bloqueiam por document type (Spec §8.1 satisfeita).

## Consequências

### Positivas
- Motor testável em 100% via testes unitários sem mocks de contexto.
- Motor reutilizável para simulações hipotéticas (ex.: "calcule cenários de 5%, 10%, 15% de desconto") — não dispara bloqueios indevidos.
- Regras de negócio (quem bloqueia o quê) ficam concentradas em **um único arquivo** (`mrm-policies.ts`), fácil de revisar com PM/contador.
- UX consistente: todas as telas (orçamento, pedido, venda) usam o mesmo decisor de policy, eliminando lógica duplicada espalhada em 3 páginas.
- Auditoria facilita: log de policy traz contexto completo (quem, quando, em qual documento, qual decisão tomada).

### Negativas / Trade-offs
- Adiciona uma camada de indireção: callsites precisam invocar motor **e** policy (em vez de só motor) — mais código boilerplate (mitigável via helper `runReapurationWithPolicy()` no orchestrator).
- Mudanças em regras de bloqueio precisam tocar `mrm-policies.ts` (não `margin-reapuration.ts`) — exige disciplina e documentação clara.
- Novas decisões (ex.: "exceto se user é admin") precisam atravessar o pipeline de props/context — pode aumentar acoplamento entre UI e camada de policies.

### Neutras
- Tipo `PolicyDecision` precisa ser definido em `src/types/mrm.ts` em S2.3.
- Testes de policy ficam separados dos testes de motor (`tests/mrm-policies.test.ts`) — facilita revisão pelo time de produto/contábil.

## Alternativas consideradas

### Alternativa A: Motor bloqueia direto
Rejeitada por dois motivos: (1) viola explicitamente R5, que estabelece motor como ferramenta de orientação não de imposição; (2) acopla regras de UX e negócio ao domínio fiscal, tornando o motor frágil a mudanças de processo.

### Alternativa B: Bloqueio implementado em cada tela (sales, orders, budgets)
Rejeitada porque duplica lógica em 3+ páginas. Já vimos esse padrão causar drift em outras features do produto — uma tela atualiza a regra, outras esquecem.

### Alternativa C: Motor retorna `should_block: boolean`
Versão "light" da A. Rejeitada porque ainda força o motor a conhecer document_type para responder corretamente — o que viola pureza. Além disso, `should_block` é decisão binária, mas precisamos de um leque (allow/warn/block/review).

### Alternativa D: Policy embutida no orchestrator (`mrm-orchestrator.ts`)
Avaliada. Tem mérito (menos arquivos), mas mistura responsabilidades: orchestrator hoje cuida de loader+motor+snapshot (D2), e adicionar decisão de bloqueio ali aumenta sua complexidade sem ganho claro. Manter `mrm-policies.ts` como módulo dedicado é mais aderente ao princípio de responsabilidade única.

## Implementação

**Arquivos afetados**:
- `src/utils/margin-reapuration.ts` — **nenhuma mudança de assinatura**. Já é função pura desde V2.0.0.
- `src/utils/mrm-policies.ts` — **novo arquivo**, criado em S2.3. Exporta `decidePolicy(motorResult, context): PolicyDecision`.
- `src/utils/mrm-orchestrator.ts` — adiciona helper opcional `runReapurationWithPolicy(input, context)` que combina motor + policy em uma chamada (S2.3).
- `src/types/mrm.ts` — adiciona tipos `PolicyDecision`, `PolicyContext` (S2.3).
- Páginas que consomem o motor (`src/pages/orcamentos/**`, `src/pages/pedidos/**`, `src/pages/vendas/**`) — passam a usar `runReapurationWithPolicy` ou invocar policy explicitamente (S2.3/S2.4).
- `tests/mrm-policies.test.ts` — **novo arquivo**, cobertura mínima dos defaults da tabela acima.

**Validação**:
- Sprint S2.3: testes unitários cobrem cada cell da matriz `(documentType, motorStatus) → decisão`.
- QA gate: verificar que página de venda bloqueia salvamento com RRO negativo e exibe mensagem orientativa.
- QA gate: verificar que página de orçamento permite salvar com RRO negativo, marca `requires_review=true` e mostra aviso.
- QA gate: verificar que Simples Nacional/MEI gera log de warning sobre CSLL/IRPJ=0 sem bloquear (Q5).

## Referências
- Story: `docs/stories/mrm-v2-s0-adrs.md`
- Spec: `Motor_Reapuracao_Margem_Precifica_Certo_v2.docx` (§8.1)
- Memória: `project_motor_v2_sprint_plan_2026_05_19.md`
- Diretriz oficial R5: motor orienta, não força
- [ADR-001](./adr-001-single-source-of-truth-motor.md) — Single source of truth
- [ADR-002](./adr-002-versionamento-engine-version.md) — Versionamento engine_version
