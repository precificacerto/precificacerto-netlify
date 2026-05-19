# Story MRM-V2-S4.2 — Remover Todos os Call-Sites da Edge `calc-tax-engine`

**Sprint:** S4
**Esforço estimado:** 4h
**Owner:** @dev
**Status:** Draft
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro do motor de margem (Dex)**, I want **remover todas as referências a `supabase.functions.invoke('calc-tax-engine')` no código (exceto o caller do shadow-mode em `mrm-shadow.ts`), substituindo por chamadas diretas ao motor `src/utils/margin-reapuration.ts`, e adicionar regra ESLint custom que bloqueia reintrodução**, so that **o motor cliente V2 se torne o único source-of-truth efetivo (ADR-001), eliminando chamadas redundantes à edge legada antes do cutover para HTTP 410 (S4.3)**.

## Acceptance Criteria
- [ ] AC1: Busca exaustiva via Grep por `supabase.functions.invoke('calc-tax-engine')` e variações (`'calc-tax-engine'`, `calcTaxEngine`, etc.) em `src/pages/api/**`, `src/pages/**`, `src/lib/**`, `src/utils/**`, `src/components/**` retorna **zero matches** após este story, exceto em `src/utils/mrm-shadow.ts` (caller autorizado do shadow-mode).
- [ ] AC2: Cada call-site removido é substituído por chamada direta ao motor importado de `src/utils/margin-reapuration.ts`. Comportamento funcional preservado (mesmos inputs → mesmos outputs).
- [ ] AC3: Script `scripts/sync-pricing-engine.js` é avaliado: se sua única função era sincronizar lógica entre cliente e edge, é **removido**; se tem outras responsabilidades, é refatorado para remover apenas o trecho da edge.
- [ ] AC4: Regra ESLint custom em `.eslintrc.js` (ou plugin custom em `eslint-rules/no-calc-tax-engine-invoke.js`) falha CI se string `'calc-tax-engine'` aparecer em qualquer arquivo sob `src/**` (exceto `src/utils/mrm-shadow.ts` via override explícito).
- [ ] AC5: Smoke E2E manual (ou automatizado se possível): fluxo completo orçamento → pedido → venda passa SEM nenhuma chamada à edge `calc-tax-engine` (validado via Network tab DevTools ou telemetria S4.1).
- [ ] AC6: Telemetria de S4.1 confirma queda abrupta de chamadas à edge após deploy: contagem diária cai >90% comparado à semana anterior.
- [ ] AC7: Documentação `docs/motor-reapuracao-margem.md` atualizada: remover qualquer referência indicando que a edge é chamada do cliente; apenas mencionar shadow-mode (S3.1) como exceção.
- [ ] AC8: Nenhuma regressão funcional detectada em smoke tests (cálculo de margem, ponto de equilíbrio, comissões, RRO permanecem iguais).

## Technical Tasks
- [ ] T1: Rodar Grep exaustivo em `src/**` por padrões: `calc-tax-engine`, `calcTaxEngine`, `tax-engine`, `taxEngine` — listar todos os arquivos e linhas.
- [ ] T2: Para cada call-site identificado, mapear: arquivo, linha, contexto, input MRM enviado, uso do output. Documentar em tabela na story.
- [ ] T3: Substituir cada call-site por import + chamada direta a `reapurarMargem()` de `src/utils/margin-reapuration.ts`. Verificar tipos e adaptação de signature se necessário.
- [ ] T4: Avaliar `scripts/sync-pricing-engine.js`: remover se obsoleto, refatorar caso contrário.
- [ ] T5: Implementar regra ESLint custom `eslint-rules/no-calc-tax-engine-invoke.js` que detecta o padrão em AST e emite erro. Configurar override em `.eslintrc.js` para `src/utils/mrm-shadow.ts`.
- [ ] T6: Rodar smoke E2E manual: criar orçamento → converter em pedido → faturar venda. Verificar Network tab: nenhuma request para `/functions/v1/calc-tax-engine` (exceto a do shadow).
- [ ] T7: Comparar telemetria S4.1 antes/depois do deploy (24h janela): contagem de chamadas por dia.
- [ ] T8: Atualizar `docs/motor-reapuracao-margem.md` removendo menções legadas à edge como caller principal.

## Files Affected
- `src/pages/api/**` — buscar e remover call-sites
- `src/pages/**` — buscar e remover call-sites
- `src/lib/**` — buscar e remover call-sites
- `src/utils/**` — buscar e remover call-sites (exceto `mrm-shadow.ts`)
- `src/components/**` — buscar e remover call-sites
- `scripts/sync-pricing-engine.js` — remover ou refatorar
- `.eslintrc.js` ou `eslint-rules/no-calc-tax-engine-invoke.js` (CRIAR) — regra custom
- `docs/motor-reapuracao-margem.md` — atualizar arquitetura

## Test Cases
- TC1 (Grep zero matches): após este story, `grep -r "calc-tax-engine" src/` retorna apenas matches em `src/utils/mrm-shadow.ts`.
- TC2 (CI bloqueia reintrodução): adicionar `supabase.functions.invoke('calc-tax-engine')` em qualquer arquivo novo → CI falha com mensagem clara.
- TC3 (smoke orçamento): criar orçamento → DevTools Network NÃO mostra request à edge (exceto shadow).
- TC4 (smoke pedido): converter orçamento em pedido → idem.
- TC5 (smoke venda): faturar pedido → idem.
- TC6 (telemetria caída): consultar `mrm_edge_legacy_telemetry` 24h após deploy → contagem cai >90%.
- TC7 (regressão cálculo): comparar `total`, `rro`, `lucro`, `commission`, `csll`, `irpj` antes/depois para mesmo orçamento de teste — diff < epsilon.
- TC8 (ESLint override): regra custom NÃO falha para `src/utils/mrm-shadow.ts`.

## Dependencies
- Depends on: MRM-V2-S4.1 (telemetria deve estar capturando para validar queda de chamadas)
- Blocks: MRM-V2-S4.3 (HTTP 410 só faz sentido após call-sites internos removidos)

## Definition of Done
- [ ] Grep retorna zero matches em `src/**` (exceto `mrm-shadow.ts`)
- [ ] Todos os call-sites substituídos por chamada direta ao motor
- [ ] `scripts/sync-pricing-engine.js` removido ou refatorado
- [ ] Regra ESLint custom funcionando (testada com PR sintético que viola)
- [ ] Smoke E2E manual passa sem chamadas à edge
- [ ] Telemetria S4.1 mostra queda >90%
- [ ] Lint + typecheck verde
- [ ] QA gate APPROVED
- [ ] Documentação atualizada
- [ ] Comparação de regressão entre 5+ orçamentos teste antes/depois com diff < epsilon

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q4 (deprecação edge)**: este story remove o "consumo interno" antes do cutover 410. Após este story, edge serve apenas: (a) shadow-mode (S3.1), (b) consumers externos (n8n, API integrations).

**ADRs aplicáveis:**
- **ADR-001 (single source of truth motor cliente)**: este story é a materialização efetiva deste ADR — antes, cliente e edge co-existiam como sources concorrentes; depois, cliente é único source efetivo no produto.

**Anti-padrão a evitar:**
- NÃO remover acidentalmente o caller do shadow-mode em `src/utils/mrm-shadow.ts` — esse caller permanece até S4.3.
- NÃO substituir call-sites por wrappers que ainda chamam edge "por compatibilidade" — substituição deve ser direta ao motor.

**Mapeamento esperado de call-sites (a confirmar via Grep):**
- `src/pages/api/orcamentos/calcular.ts` (se existir)
- `src/pages/api/pedidos/calcular.ts` (se existir)
- `src/pages/api/vendas/calcular.ts` (se existir)
- `src/lib/pricing/calculator.ts` (se existir)
- `src/components/PriceCalculator.tsx` (se existir)
- Outros — confirmar via Grep antes de iniciar implementação.

**ESLint custom rule (esboço):**
```js
module.exports = {
  meta: { type: 'problem', docs: { description: 'No direct calls to calc-tax-engine edge' } },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && node.value.includes('calc-tax-engine')) {
          context.report({ node, message: 'Use src/utils/margin-reapuration.ts directly. Edge is deprecated (Q4/ADR-005).' });
        }
      }
    };
  }
};
```

**Plano de rollback:** se queda de chamadas NÃO ocorrer ou se houver regressão funcional inesperada, revert este story (PR único e atômico facilita). Edge continua respondendo 200 graças a S4.1 — UX não quebra durante rollback.
