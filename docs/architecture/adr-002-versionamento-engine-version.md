# ADR-002: Versionamento do motor via coluna `engine_version`

**Status:** Accepted
**Data:** 2026-05-19
**Decididores:** @architect Aria, @pm Morgan, @qa Quinn, @aios-master Orion
**Aprovado por:** Hyago (Founder)
**Contexto:** Motor de Reapuração de Margem V2 — Sprint S0

## Contexto

O Motor de Reapuração de Margem V2 já está em produção (v2.0.0 desde 18/05/2026) e tem evolução planejada nos próximos sprints:

- **S1.1** adiciona CSLL e IRPJ ao rateio do RRO (bump para `2.1.0`).
- **S2.x** introduz tratamento explícito para Simples Nacional e MEI (potencial bump menor).
- **2027+** introduz IBS/CBS efetivos (bump major para `3.0.0`).

Ao mesmo tempo, o banco já contém milhares de registros pré-MRM marcados como `engine_version='legacy'` (via migration `20260518000003`). Esses registros precisam coexistir indefinidamente com novas versões do motor — sem nunca recalcular, pois fariam alíquotas antigas mudarem retroativamente e gerariam problemas regulatórios e auditoriais sérios.

Surgiu, portanto, a necessidade de uma política formal de versionamento que governe:
- Como um documento "adquire" sua versão de motor.
- Em quais transições é permitido (ou proibido) atualizar a versão.
- Como pedido herda do orçamento e venda herda do pedido.
- O que acontece quando o motor evolui mas o documento já está fechado.

## Decisão

A coluna `engine_version` existe em `budgets`, `orders` e `sales` e segue uma política única de **herança ascendente + imutabilidade em Done**:

1. **Atribuição inicial**: ao criar um documento novo do zero, `engine_version` recebe a versão atual canônica do motor (hoje `'2.0.0'`).
2. **Herança ascendente** (orçamento → pedido → venda): quando um pedido é gerado a partir de um orçamento, ele **copia** o `engine_version` do pai. Idem para venda gerada de pedido. Isso garante que toda a cadeia de um mesmo negócio compartilhe a mesma versão de motor — não há "upgrade silencioso" no meio do funil.
3. **Mutabilidade em Draft**: documentos com `status = 'draft'` **podem** ser explicitamente recalculados para a versão mais nova via ação consciente do usuário (botão "Recalcular com motor atual" — UX a ser definida em S2.4). Recálculo automático em background é proibido.
4. **Imutabilidade em Approved/Done**: documentos com `status ∈ {approved, done}` são **imutáveis** em `engine_version`. Mesmo que o motor seja atualizado para uma versão mais nova, o documento mantém a versão original para sempre. Isso vale também para reaberturas (status volta a draft) — a versão original permanece como referência de auditoria.
5. **Coexistência de versões**: `'legacy'` (V1, pré-MRM) coexiste com `'2.x.x'` e futuras versões em produção indefinidamente. Não há plano de "migrar legacy para 2.x" — a política Q2 (Drafts lazy / Done locked) governa isso.
6. **Esquema semver**: versões seguem `MAJOR.MINOR.PATCH`. MAJOR bump apenas em quebra fiscal estrutural (ex.: IBS/CBS substituindo ICMS/PIS/COFINS). MINOR bump em adição de tributos no rateio (ex.: CSLL/IRPJ em S1.1 → `2.1.0`). PATCH em correções de bug puramente computacionais.

A imutabilidade fiscal em Approved/Done é reforçada pelo invariante de snapshot definido em [ADR-003](./adr-003-snapshot-fiscal-invariante.md).

## Consequências

### Positivas
- Auditoria fiscal completa: qualquer venda fechada pode ser inspecionada com a mesma versão de motor que gerou seus números, mesmo anos depois.
- Reprodutibilidade total: dado o input + `engine_version` + snapshot fiscal, é possível recriar bit-a-bit o cálculo original.
- Evolução do motor sem medo: novas versões não afetam documentos passados, eliminando regressões silenciosas em relatórios fiscais.
- Compatibilidade com registros pré-MRM via marker `'legacy'`.

### Negativas / Trade-offs
- O código do motor precisa carregar lógica condicional por versão (`if engineVersion >= '2.1.0'`) para suportar recálculos de drafts antigos.
- UX precisa expor claramente quando um documento está em versão antiga e oferecer recálculo explícito (não automático) — adiciona um botão e mensagem.
- Banco acumula combinações `(engine_version, tax_breakdown)` heterogêneas — relatórios agregados precisam agrupar por versão ao comparar séries históricas.

### Neutras
- A coluna `engine_version` é VARCHAR/TEXT com regex de validação semver (ou enum se o conjunto for pequeno) — decisão de tipo fica a cargo da migration S2.1 (@data-engineer).
- Default value para inserts antigos sem `engine_version` definido é `'2.0.0'` para criados a partir do dia da migration; `'legacy'` para tudo anterior (já feito em `20260518000003`).

## Alternativas consideradas

### Alternativa A: Always-recalculate (sem versão fixa)
Rejeitada porque quebra auditoria fiscal: se a Receita Federal pedir o detalhamento de uma venda fechada em 2026, o sistema deve responder com os mesmos números registrados originalmente — não com os números "se eu recalcular hoje".

### Alternativa B: Force-upgrade automático em Done
Rejeitada por risco regulatório severo. Atualizar engine_version de documentos fechados poderia mudar tributos retroativamente e gerar inconsistências entre NF-e emitida e dados internos.

### Alternativa C: Versionamento por timestamp (`engine_at: TIMESTAMP`) ao invés de semver
Rejeitada porque timestamp não comunica intent (breaking change vs minor evolution) e dificulta lógica condicional no código (`if motor_de < 2026-06-01`). Semver é o padrão da indústria e legível por humanos.

### Alternativa D: Sem coluna, derivar versão da data de criação do documento
Rejeitada porque acopla versionamento a calendário — recálculos manuais de drafts antigos ficariam impossíveis de rastrear, e a coluna `created_at` passaria a carregar semântica fiscal que não é sua responsabilidade.

## Implementação

**Arquivos afetados**:
- `src/utils/margin-reapuration.ts` — passa a aceitar parâmetro `engineVersion?: string` para roteamento condicional (S1.1).
- `src/utils/mrm-orchestrator.ts` — propaga `engine_version` do documento ao motor.
- Migrations Supabase — colunas `engine_version` já existem em `budgets`/`orders`/`sales` (migration `20260518000003`); S1.1 adiciona suporte ao valor `'2.1.0'`.
- API routes que criam pedido/venda a partir de orçamento — devem copiar `engine_version` do pai (S2.1 task).
- UI (telas de edição de orçamento) — botão "Recalcular com motor atual" exposto apenas para drafts (S2.4).

**Validação**:
- Testes unitários cobrem: criação nova, herança orçamento→pedido→venda, bloqueio de update em status=done, recálculo permitido em draft.
- QA gate de S1.1 verifica que registros pré-bump (`2.0.0`) permanecem inalterados após deploy do motor `2.1.0`.

## Referências
- Story: `docs/stories/mrm-v2-s0-adrs.md`
- Spec: `Motor_Reapuracao_Margem_Precifica_Certo_v2.docx`
- Memória: `project_motor_v2_sprint_plan_2026_05_19.md`
- [ADR-001](./adr-001-single-source-of-truth-motor.md) — Single source of truth
- [ADR-003](./adr-003-snapshot-fiscal-invariante.md) — Snapshot fiscal invariante
