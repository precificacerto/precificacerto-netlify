# ADR-003: Snapshot fiscal invariante para documentos em Approved/Done

**Status:** Accepted
**Data:** 2026-05-19
**Decididores:** @architect Aria, @pm Morgan, @qa Quinn, @aios-master Orion
**Aprovado por:** Hyago (Founder)
**Contexto:** Motor de Reapuração de Margem V2 — Sprint S0

## Contexto

A coluna `tax_breakdown` (JSONB) em `budget_items`, `order_items` e `sale_items` armazena o detalhamento fiscal de cada item: alíquotas aplicadas (cofins_pct, pis_pct, icms_pct, iss_pct, csll_pct, irpj_pct, simples_pct, mei_fixo_value), bases de cálculo, valores intermediários e o resultado final do motor. Hoje essa coluna é nullable e pode ser sobrescrita a qualquer momento — inclusive recalculada automaticamente quando o usuário muda algo na tela.

Esse design abre brechas críticas:

- Se a tabela `tax_rates_periods` for editada (ex.: tenant corrige uma alíquota de ICMS), recálculos espontâneos podem alterar tributos de vendas fechadas.
- Configurações do tenant (regime tributário, ativação de impostos) podem mudar — e venda fechada continuaria refletindo nova config, distorcendo relatórios.
- Auditoria fiscal exige que cada venda fechada tenha um "fotograma" imutável do estado tributário no momento da emissão — sem isso, qualquer pergunta de auditor sobre "qual era a alíquota usada nesta NF?" fica indeterminável.

A spec V2 já estabeleceu o conceito de snapshot (D2 — `use_snapshot_rates`), mas até este ADR não havia formalização da invariante de imutabilidade em Approved/Done.

## Decisão

Para qualquer documento com `status ∈ {approved, done}`, a coluna `tax_breakdown` em `budget_items` / `order_items` / `sale_items` é **NOT NULL** e **imutável**. Esta é a invariante fiscal central do motor:

> **Snapshot is the law of the land**: depois que um documento atinge Approved ou Done, mudanças posteriores em `tax_rates_periods`, em configuração de tenant ou no próprio motor (`engine_version`) **NÃO afetam** o documento selado.

Regras detalhadas:

1. **Schema do snapshot (mínimo)**: `tax_breakdown` deve conter, no nível do item, ao menos os campos:
   - `cofins_pct`, `pis_pct`, `icms_pct`, `iss_pct` (impostos por dentro V2.0.0)
   - `csll_pct`, `irpj_pct` (adicionados em V2.1.0, S1.1)
   - `simples_pct` (regime SN) ou `mei_fixo_value` (regime MEI) — exclusivos
   - Bases sequenciais: `base_icms`, `base_pis`, `base_cofins`, `base_iss`
   - Tributos por fora aplicados: `ipi_value`, `icms_st_value`, `difal_value`, `fcp_value`
   - Resultado: `rro_value`, `nova_comissao_value`, `novo_lucro_value`, `peso_comm`, `peso_lucro`
   - Meta: `snapshot_taken_at` (timestamp), `snapshot_engine_version` (semver string)

2. **NOT NULL via CHECK constraint** ativado em migration S2.2 — backfill obrigatório de todos os documentos Approved/Done existentes antes da constraint entrar em vigor.

3. **Política de leitura (`use_snapshot_rates`)** — flag em `tenant_expense_config`, default `TRUE`:
   - **TRUE (default)**: snapshot vence sempre. Mesmo em draft, se há snapshot válido, ele é reutilizado em recálculos parciais (mudança de qtd, por exemplo), evitando que mudança em `tax_rates_periods` afete preço durante a negociação.
   - **FALSE**: cliente busca alíquotas atuais a cada cálculo. Útil para tenants que querem refletir reforma tributária ou ajustes imediatamente. **Vale apenas em draft** — em Approved/Done, snapshot continua imutável independentemente desta flag.

4. **Migration de S2.2 deve garantir**:
   - Backfill: rodar motor V2.0.0 (ou versão herdada via `engine_version`) sobre todos os items Approved/Done sem snapshot atual, populando `tax_breakdown`.
   - Validação: zero items com `status >= approved` AND `tax_breakdown IS NULL` após backfill.
   - Aplicar `CHECK (status IN ('draft') OR tax_breakdown IS NOT NULL)`.
   - Trigger BEFORE UPDATE bloqueando alteração de `tax_breakdown` quando `OLD.status IN ('approved','done')`.

A imutabilidade do snapshot é par com a imutabilidade do `engine_version` definida em [ADR-002](./adr-002-versionamento-engine-version.md).

## Consequências

### Positivas
- Reprodutibilidade fiscal absoluta: qualquer relatório do passado pode ser recalculado bit-a-bit a partir do snapshot.
- Conformidade com exigências de auditoria fiscal (Receita Federal, contadores, conciliação NF-e).
- Tenant tem controle granular via `use_snapshot_rates` para casos legítimos de recálculo dinâmico em draft.
- Mudanças em alíquotas (reforma tributária, correção de bug em config) não causam regressões em relatórios fechados.

### Negativas / Trade-offs
- Storage adicional: cada item carrega ~1-2 KB de JSON com snapshot. Para tenants com centenas de milhares de items, isso somou ~GB de payload — aceitável dado o valor fiscal.
- Backfill em S2.2 é operação cara: precisa rodar motor sobre histórico inteiro. Mitigação: rodar em lotes durante janela de baixa atividade, monitorar tempo de execução.
- Caso o motor seja alterado e descubra-se bug em cálculo passado, **não há "redo automático"** — correção exige migration manual explícita com aprovação documentada (CHANGELOG fiscal).

### Neutras
- Trigger de bloqueio adiciona overhead mínimo em UPDATEs (microssegundos).
- Cliente passa a sempre olhar `tax_breakdown` antes de recalcular, alterando ordem das operações em `mrm-orchestrator.ts` (já preparado para D2 desde V2.0.0).

## Alternativas consideradas

### Alternativa A: Recálculo dinâmico sempre (sem snapshot)
Rejeitada porque quebra reprodutibilidade fiscal. Tornaria impossível responder com integridade a uma auditoria sobre venda passada — alíquota poderia ter mudado desde então.

### Alternativa B: Snapshot opcional (nullable forever)
Rejeitada porque gera **dual-write problem**: parte dos documentos teria snapshot, parte não, e relatórios precisariam de lógica condicional. Garantir uniformidade é mais barato que conviver com inconsistência.

### Alternativa C: Snapshot em tabela separada (`tax_snapshots`) ao invés de JSONB inline
Avaliada. Tem mérito (queries de auditoria mais fáceis), mas adiciona JOIN em todos os reads de items — impacto perceptível em telas com muitos itens. Reavaliar se telemetria mostrar gargalo em JSONB queries.

### Alternativa D: Snapshot apenas em `sales` (não em budgets/orders)
Rejeitada porque orçamentos e pedidos aprovados também precisam preservar contexto fiscal — cliente pode reabrir pedido antigo para análise, e a recalculação espontânea quebraria comparações históricas.

## Implementação

**Arquivos afetados**:
- `src/utils/margin-reapuration.ts` — output do motor já contém todos os campos necessários para preencher snapshot (sem mudança em S2.2).
- `src/utils/mrm-orchestrator.ts` — orquestrador já implementa lógica de "use snapshot se válido, senão recarrega" (D2 vigente).
- `src/types/mrm.ts` — tipo `TaxBreakdown` precisa adicionar `csll_pct`, `irpj_pct` (S1.1) e campos meta (`snapshot_taken_at`, `snapshot_engine_version`) em S2.2.
- Migration Supabase `S2.2_*_tax_breakdown_invariant.sql` — backfill + CHECK constraint + trigger BEFORE UPDATE.

**Validação**:
- Sprint S2.2: post-deploy assertion `SELECT count(*) FROM sale_items WHERE status IN ('approved','done') AND tax_breakdown IS NULL` deve retornar 0.
- Teste unitário cobre tentativa de UPDATE em sale_item com status='done' — deve falhar com erro de trigger.
- Teste cobre cenário `use_snapshot_rates=false` em draft — verifica que motor recalcula com alíquotas atuais.
- Teste cobre cenário `use_snapshot_rates=true` em draft — verifica que snapshot prévio é reutilizado mesmo após mudança em `tax_rates_periods`.

## Referências
- Story: `docs/stories/mrm-v2-s0-adrs.md`
- Spec: `Motor_Reapuracao_Margem_Precifica_Certo_v2.docx`
- Memória: `project_motor_v2_sprint_plan_2026_05_19.md`
- [ADR-002](./adr-002-versionamento-engine-version.md) — Versionamento engine_version
- [ADR-004](./adr-004-separacao-motor-pure-vs-policies.md) — Separação motor vs policies
