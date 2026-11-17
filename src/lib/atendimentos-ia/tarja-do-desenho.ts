/**
 * A TARJA DA MARCA W.VETRO NAS FIGURAS DO CATÁLOGO (dono do produto, 16/11/2026): "A reprodução das figuras não pode ter a tarja da marca
 * W-vetro." Medida no orçamento 8 da De Paula (16/11/2026): a figura do item 3 (800 × 800, PNG) traz no alto uma faixa horizontal, do branco
 * à esquerda ao azul da marca à direita (13, 153, 255), com o logo "W.VETRO" — 98 linhas, as linhas 0 a 97 (12,25% da altura). As outras
 * figuras do mesmo orçamento (JPEG 520 × 468) não a têm.
 *
 * A medida é PURA e lê a ASSINATURA da faixa, linha a linha a partir do topo: o MEIO no azul claro do degradê (128, 202, 255, medido) e o
 * canto DIREITO no azul da marca, os dois opacos. O canto esquerdo NÃO serve: o logo "W.VETRO" mora lá (linhas 20 a 70, medido), e a primeira
 * versão, que lia o canto esquerdo como branco, parava no logo e não cortava nada. A faixa só conta entre 4% e 25% da altura: menos que isso não é a faixa (é um traço azul do próprio desenho), e mais que isso
 * seria cortar o desenho — nos dois casos, nada é cortado.
 */
export type Pixel = readonly [r: number, g: number, b: number, a: number]

const azulDaMarca = ([r, g, b, a]: Pixel) => a > 200 && r <= 60 && g >= 120 && g <= 190 && b >= 220
const azulDoDegrade = ([r, g, b, a]: Pixel) => a > 200 && r >= 90 && r <= 200 && g >= 170 && g <= 235 && b >= 235
const azulado = ([r, , b, a]: Pixel) => a > 200 && b >= 200 && b - r >= 60
export const LINHAS_DA_BORDA = 3
export const FRACAO_MINIMA_DA_TARJA = 0.04
export const FRACAO_MAXIMA_DA_TARJA = 0.25

/** Quantas linhas do topo são a tarja; 0 quando a imagem não a tem (ou a assinatura não fecha dentro dos limites). */
export function alturaDaTarja(largura: number, altura: number, pixel: (x: number, y: number) => Pixel): number {
    if (!(largura > 0 && altura > 0)) return 0
    const xDireita = Math.min(largura - 1, Math.floor(largura * 0.95))
    const xMeio = Math.floor(largura * 0.5)
    let y = 0
    while (y < altura && azulDaMarca(pixel(xDireita, y)) && azulDoDegrade(pixel(xMeio, y))) y++
    if (!(y >= altura * FRACAO_MINIMA_DA_TARJA && y <= altura * FRACAO_MAXIMA_DA_TARJA)) return 0
    // a BORDA da faixa numa JPEG: a compressão mistura a última linha com a de baixo, e ela deixa de ter a assinatura exata. Até
    // `LINHAS_DA_BORDA` linhas a mais saem enquanto o canto direito ainda for AZULADO (medido no teste da JPEG: sobrava 1 linha)
    let borda = 0
    while (borda < LINHAS_DA_BORDA && y < altura && azulado(pixel(xDireita, y))) { y++; borda++ }
    return y
}
