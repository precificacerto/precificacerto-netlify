/**
 * largura-de-modal.ts — a largura dos modais, numa fonte só.
 *
 * Comando do PO de 21/09/2026, §2:
 *
 *   > O padrão dos modais de lançamento é 75vw. O de despesa passa a 50vw, com mínimo de
 *   > 720px e máximo de 1100px; tablet 92vw; mobile tela cheia.
 *
 * >>> POR QUE `clamp` E NÃO TRÊS `if` DE BREAKPOINT <<<
 *
 * O mínimo existe para que o bloco de impostos não seja espremido, e o máximo para que a
 * tabela não fique com colunas perdidas numa tela larga. `clamp(720px, 50vw, 1100px)` diz as
 * três coisas de uma vez e não depende de medir a janela em JavaScript — que é o caminho que
 * erra no primeiro render e no redimensionamento.
 *
 * TABLET e MOBILE entram por media query no CSS global, porque `Modal` do AntD aplica a
 * largura inline e `width` inline vence classe. A variável CSS é o ponto onde as duas regras
 * se encontram.
 */

/** 50vw com piso e teto — o modal de DESPESA e o de VENCIDOS. */
export const LARGURA_MODAL_50 = {
  width: 'clamp(720px, 50vw, 1100px)',
  style: { maxWidth: '96vw' },
} as const

/** 75vw — o padrão dos demais modais de lançamento. NÃO muda nesta rodada. */
export const LARGURA_MODAL_75 = {
  width: 'clamp(720px, 75vw, 1400px)',
  style: { maxWidth: '96vw' },
} as const
