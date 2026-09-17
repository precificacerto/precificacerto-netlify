/**
 * cascade-display-order.ts — a ORDEM em que as etapas da decomposição são EXIBIDAS.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md`, R19 — a ordem das deduções é
 *
 *   1º repasse (manuais e acréscimos) · 2º operação POR FORA · 3º operação POR DENTRO ·
 *   4º custos, despesas, comissão RT · 5º RRO, a última sobra
 *
 * >>> A CONTA JÁ ESTAVA CERTA. O QUE ESTAVA FORA DE ORDEM ERA A EXIBIÇÃO <<<
 *
 * Medido antes de mexer, e o resultado mudou a correção: a Etapa 12 (Âncora Interna) é
 * `rv_total × peso_op_interna_ponderado`, e `peso_externo = 1 − peso_op_interna_ponderado`
 * (`cascade-trace.ts:53`). Ou seja, **a operação por fora já é separada na Etapa 12** — antes
 * do por dentro (13), dos custos (14) e do RRO (16).
 *
 * A Etapa 17 não é uma dedução depois do RRO: ela nasce como PLACEHOLDER com `amount: 0` e a
 * Camada 2 a preenche com a própria fórmula dizendo o que ela é —
 * "Op. Externa pós-desconto (Step 12) redistribuída por pesos do Step 8". É o DETALHAMENTO,
 * por tributo, de um valor apurado lá atrás.
 *
 * Por isso a correção é de ordem de LEITURA, e não do motor: mover a Etapa 17 para junto da
 * 12, onde o valor dela é apurado. Mexer no motor para "corrigir" uma conta que já está certa
 * mudaria números em produção sem defeito que o justifique.
 *
 * >>> POR QUE OS NÚMEROS NÃO SÃO REATRIBUÍDOS <<<
 *
 * O número da etapa é IDENTIDADE, não posição. "A Etapa 16 é a fonte de verdade de Comissão e
 * Lucro" e "a hierarquia da Etapa 11" estão escritos em regra, em ADR e em comentário de
 * código; renumerar quebraria toda referência já feita, que é o mesmo motivo pelo qual a R21
 * mora ao lado da R12 em vez de no fim da Parte 3.
 */

import type { CascadeStep } from '@/types/mrm'

/** A etapa que detalha os tributos POR FORA (IBS · CBS · IS · IPI). */
export const STEP_POR_FORA = 17

/** A etapa em que a operação por fora é de fato separada — é depois dela que o detalhe entra. */
export const STEP_ANCORA_INTERNA = 12

/**
 * Reordena as etapas para a leitura da R19: o detalhamento do POR FORA sobe para logo depois
 * da Âncora Interna, que é onde ele foi apurado.
 *
 * Não altera nenhum valor, nenhum número de etapa e nenhum filho — só a ORDEM do array. Uma
 * etapa ausente (trace de 13 etapas do V16, trace só de manuais) passa intacta.
 */
export function orderCascadeForDisplay(trace: CascadeStep[]): CascadeStep[] {
  if (!Array.isArray(trace) || trace.length === 0) return trace

  const iPorFora = trace.findIndex((s) => Number(s.step) === STEP_POR_FORA)
  const iAncora = trace.findIndex((s) => Number(s.step) === STEP_ANCORA_INTERNA)
  // Sem uma das duas, não há o que reordenar — e inventar uma posição seria pior que deixar
  // como está: a ordem passaria a afirmar uma conta que ninguém conferiu.
  if (iPorFora < 0 || iAncora < 0) return trace
  // Já está no lugar certo: nada a fazer.
  if (iPorFora === iAncora + 1) return trace

  const porFora = trace[iPorFora]
  const resto = trace.filter((_, k) => k !== iPorFora)
  const destino = resto.findIndex((s) => Number(s.step) === STEP_ANCORA_INTERNA) + 1
  return [...resto.slice(0, destino), porFora, ...resto.slice(destino)]
}
