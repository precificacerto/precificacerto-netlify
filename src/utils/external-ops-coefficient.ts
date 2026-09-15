/**
 * external-ops-coefficient.ts — re-export do resolvedor do `c` da R3.
 *
 * O CORPO NÃO MORA MAIS AQUI. Ele foi para `pricing-engine.ts` porque o espelho
 * da edge é produzido por `scripts/sync-pricing-engine.js`, que copia UM arquivo:
 * qualquer import dentro de `pricing-engine.ts` deixa o espelho apontando para um
 * módulo inexistente. Este arquivo existe para preservar o caminho de import.
 *
 * Quem consome:
 *   - `src/utils/__tests__/external-ops-coefficient.test.ts` (23 casos, oráculos
 *     em precisão cheia, tolerância 1e-9)
 *   - qualquer chamador futuro que precise do `c` sem calcular preço
 *
 * Quem NÃO consome: `pricing-engine.ts`, que agora é a origem. A ligação com o
 * motor acontece por `PricingInput.taxBreakdown` — o motor recebe os tributos
 * separados e resolve o `c` sozinho.
 *
 * >>> ATENÇÃO AO NOME <<<
 * Neste repositório `coefficient`, sozinho, significa outra coisa: é o DIVISOR DA
 * MARGEM DE CONTRIBUIÇÃO em `pricing-engine.ts` (~0,69). O `c` daqui vale ~0,074
 * num caso típico. São grandezas diferentes, com uma ordem de magnitude de
 * distância. Por isso nada aqui se chama `coefficient` sem qualificação — é
 * sempre `externalOpsCoefficient` ou `c` no contexto da R3.
 *
 * Regra: R3 em `.claude/rules/cascata-lucro-real.md`.
 */

export {
  resolveExternalOpsCoefficient,
  type BaseCode,
  type ExternalTax,
  type ExternalOpsInput,
  type ExternalOpsResult,
} from './pricing-engine'
