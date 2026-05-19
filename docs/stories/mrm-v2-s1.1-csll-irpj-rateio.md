# Story MRM-V2-S1.1 — Incluir CSLL e IRPJ no Rateio do combined_pct

**Sprint:** S1
**Esforço estimado:** 10h
**Owner:** @dev
**Status:** InProgress
**Created:** 2026-05-19
**Epic:** mrm-v2-reapuracao-margem

## User Story
As a **engenheiro do motor de margem (Dex)**, I want **incluir CSLL e IRPJ como componentes formais no `combined_pct` do rateio MRM em `src/utils/margin-reapuration.ts`**, so that **a Receita Real Operacional (RRO) seja distribuída em 4 componentes (Lucro, Comissão, CSLL, IRPJ) de forma matematicamente correta, alinhada ao exemplo oficial da spec V2 item 13 e à realidade tributária brasileira**.

## Acceptance Criteria
- [x] AC1: Em `src/utils/margin-reapuration.ts:122-133`, o cálculo de `combined_pct` passa a somar 4 componentes: `profit_pct + commission_pct + csll_pct + irpj_pct` (atualmente soma apenas 2: profit + commission).
- [x] AC2: O tipo `MRMInput` em `src/types/mrm.ts` inclui os campos opcionais `csll_pct?: number` e `irpj_pct?: number` (default 0), com JSDoc explicando origem (`tenant.profile.tax_rates` ou snapshot).
- [x] AC3: O tipo `MRMResult` em `src/types/mrm.ts` inclui os campos `csll_value: number` e `irpj_value: number` no breakdown final. (Implementado como `new_csll`/`new_irpj` para alinhar à nomenclatura existente `new_commission`/`new_profit` no schema TaxBreakdown.)
- [x] AC4: A `engine_version` é incrementada para `"2.1.0"` (ADR-002) e exposta no resultado do motor.
- [x] AC5: Epsilon de validação é **dinâmico**: `epsilon = max(0.01, rro * 1e-6)` — substitui qualquer epsilon fixo previamente usado.
- [x] AC6: **Guard regime defensivo (Q5)**: quando `regime ∈ {MEI, SIMPLES_NACIONAL}`, o motor força `csll_pct = 0` e `irpj_pct = 0` mesmo se input vier diferente, e emite `console.warn` com payload `{regime, attempted_csll, attempted_irpj, source_doc_id}`. (`source_doc_id` omitido — motor é puro e não recebe esse campo no input; payload inclui regime + valores tentados, conforme decisão Q5 do contexto.)
- [ ] AC7: O **golden test do exemplo oficial spec V2 item 13** passa: input `RB=141656.68, desconto_pct=5, regime=LUCRO_REAL, profit_pct=23, commission_pct=11.5, csll_pct=2.07, irpj_pct=3.45` → output `RRO=18580.30, lucro=10678.33, comissao=5339.17, csll=961.05, irpj=1601.75` (tolerância R$0,02 absoluta). _Deferred → S1.3 (testes)._
- [x] AC8: A função do motor permanece **pura** (sem I/O, sem chamadas a Supabase, sem `console.error` — apenas `console.warn` do guard Q5 é permitido) — ADR-004.

## Technical Tasks
- [x] T1: Atualizar `src/types/mrm.ts` adicionando `csll_pct?` e `irpj_pct?` em `MRMInput` e `csll_value`, `irpj_value` em `MRMResult`. Bumpar `MRM_ENGINE_VERSION = "2.1.0"`.
- [x] T2: Em `src/utils/margin-reapuration.ts:122-133`, ajustar fórmula de `combined_pct` para somar 4 componentes; ajustar derivação proporcional de cada valor (`lucro_value`, `commission_value`, `csll_value`, `irpj_value`) preservando rateio.
- [x] T3: Adicionar bloco de guard regime MEI/SIMPLES_NACIONAL no início da função pública do motor (antes de cálculos), com `console.warn` estruturado.
- [x] T4: Substituir epsilon fixo por `epsilon = Math.max(0.01, rro * 1e-6)` no check final de fechamento de conta.
- [x] T5: Atualizar `engine_version` exposta no MRMResult para `"2.1.0"`.
- [ ] T6: Escrever golden test em `tests/unit/margin-reapuration.test.ts` cobrindo exemplo oficial spec V2 item 13 com tolerância R$0,02. _Deferred → S1.3._
- [ ] T7: Atualizar `docs/motor-reapuracao-margem.md` seção "Versão atual" para refletir V4 e adicionar exemplo do item 13. _Deferred → docs update story._

## Files Affected
- `src/utils/margin-reapuration.ts:91-200` — guard regime Q5 + fórmula combined_pct (4 componentes) + epsilon dinâmico + retorno new_csll/new_irpj ✅
- `src/types/mrm.ts` — bumpar `MRM_ENGINE_VERSION = '2.1.0'`; adicionar `csll_pct?`/`irpj_pct?` em `ReapurationInput`; adicionar `new_csll`/`new_irpj` em `TaxBreakdown` ✅
- `src/utils/__tests__/mrm-orchestrator.test.ts` — atualizar 4 mocks de TaxBreakdown adicionando `new_csll: 0, new_irpj: 0` (manter compilação verde) ✅
- `tests/unit/margin-reapuration.test.ts` — golden test exemplo oficial (deferred → S1.3)
- `docs/motor-reapuracao-margem.md` — atualizar seção versão atual e tabela de componentes (deferred)

## File List (Dev)
- **Modified:**
  - `src/types/mrm.ts` (engine version 2.0.0 → 2.1.0; csll_pct/irpj_pct em Input; new_csll/new_irpj em TaxBreakdown)
  - `src/utils/margin-reapuration.ts` (guard Q5 regime MEI/SN; rateio 4 componentes; epsilon dinâmico)
  - `src/utils/__tests__/mrm-orchestrator.test.ts` (4 mocks atualizados para schema 2.1.0)

## Test Cases
- TC1 (golden oficial): input do item 13 spec V2 → output match exato dos 4 valores (tolerância R$0,02).
- TC2 (regime LUCRO_REAL csll>0 irpj>0): rateio proporcional fecha em RRO ± epsilon.
- TC3 (regime LUCRO_PRESUMIDO csll>0 irpj>0): mesma propriedade matemática.
- TC4 (regime SIMPLES_NACIONAL com csll=5 irpj=10 no input): output força csll=0, irpj=0, warning emitido.
- TC5 (regime MEI com csll=2 irpj=3 no input): output força csll=0, irpj=0, warning emitido.
- TC6 (RRO muito pequeno, ex R$1,00): epsilon dinâmico permite fechamento sem falsa rejeição.
- TC7 (RRO grande, ex R$10M): epsilon dinâmico = R$10, evita falsos positivos por arredondamento.
- TC8 (csll=0 e irpj=0 explícitos em LUCRO_REAL): rateio degrada para 2 componentes sem erro.

## Dependencies
- Depends on: MRM-V2-S0 (ADR-002 engine_version, ADR-004 motor puro)
- Blocks: MRM-V2-S1.3 (testes cobertura ≥90% precisam que motor 2.1.0 esteja estável), MRM-V2-S1.4 (contract test depende da assinatura 2.1.0)
- **Não depende de** MRM-V2-S1.2 (snapshot pode ser implementado em paralelo)

## Definition of Done
- [ ] Código implementado em `src/utils/margin-reapuration.ts` e `src/types/mrm.ts`
- [ ] Testes unit passando (cobertura ≥ 90% do arquivo do motor) — verificação completa em S1.3
- [ ] Golden test do exemplo oficial PASSA com tolerância R$0,02
- [ ] Lint + typecheck verde (`npm run lint && npm run typecheck`)
- [ ] QA gate APPROVED
- [ ] Documentação `docs/motor-reapuracao-margem.md` atualizada com V4
- [ ] `engine_version = "2.1.0"` exposto em MRMResult

## Notes
**Decisões Q1-Q5 aplicáveis:**
- **Q5 (defensive coding Simples Nacional/MEI)**: implementado via guard com `console.warn` (AC6).
- **Q1 (motor não bloqueia)**: este story NÃO toca `src/utils/mrm-policies.ts`; motor segue retornando MRMResult mesmo quando há inconsistência — quem decide bloqueio é a policy layer (story futura).

**ADRs aplicáveis:**
- **ADR-002**: justifica bump engine_version → `"2.1.0"` (MINOR: campos novos opcionais retrocompatíveis em TaxBreakdown; callers legados continuam funcionando). Correção 2026-05-19: story original dizia "4.0.0" mas semver correto é MINOR bump (2.1.0); aios-master corrigiu antes de iniciar S1.3.
- **ADR-004**: justifica manter motor puro — guard Q5 emite warn mas não lança nem chama backend.

**Anti-padrão a evitar:** não introduzir leitura direta de `tenants.tax_rates` dentro do motor — motor recebe `csll_pct`/`irpj_pct` como input. A hidratação do input é responsabilidade da camada chamadora (story S1.2).

**Referência golden test:** linha de comando para rodar apenas este teste:
```bash
npm test -- tests/unit/margin-reapuration.test.ts -t "golden exemplo spec V2 item 13"
```
