/**
 * A REGRA DAS BARRAS — UM SÓ JEITO DE CONTAR (dono do produto, 26/11/2026, pedido 0034; `REFERENCIA_UNICA.md` §3.3 do bridge):
 * "O relatório de barras é oriundo da tipologia e das medidas." Antes havia dois jeitos: o agrupador do levantamento e do relatório de corte
 * (first fit, sem refilo, a serra só quando sobra) e as barras do pedido (a regra do WVetro). Dois relatórios podiam dizer números diferentes
 * para o mesmo perfil. Agora todos chamam ESTE núcleo, que é a regra do WVetro, medida contra ele (41 de 41 perfis do orçamento 661,
 * `claude/REGRA_Otimizacao_Barras_WVetro.md`):
 *   - FFD best-fit: os cortes do maior para o menor; cada um vai na barra ABERTA com a MENOR sobra que o comporte; nenhuma, barra nova.
 *     Desempate: a barra aberta primeiro. Determinístico.
 *   - SERRA por corte, INCLUSIVE o último: cada peça consome o comprimento dela mais a serra.
 *   - REFILO: 45 mm por ponta SÓ na cor de acabamento MADEIRA (pintura madeira, amadeirado, golden oak, nogueira, oak); branco, preto liso e as
 *     demais cores lisas não refilam (`refiloDaCor`). É a regra do WVetro: ela nasceu "só em PINTURA MADEIRA" (22/11/2026), o PO a ampliou a toda
 *     cor menos o branco no mesmo dia, e o gabarito do orçamento 1207 (PRETO LISO, 256 barras só SEM refilo) a trouxe de volta (0045-2 (b), 27/11/2026).
 *     A cor ausente, ou um nome composto com BRANCO, não se decide aqui: volta o motivo, nomeado.
 *   - A peça que não cabe na barra útil (barra − 2 × refilo), com a serra, não se emenda.
 * As contas são em micrômetros inteiros. Puro: não lê banco nem rede.
 */

export const REFILO_POR_PONTA_MM = 45
/** A ÚNICA cor sem refilo, normalizada (sem acento, maiúscula, espaço simples). */
export const COR_SEM_REFILO = 'BRANCO'
/** O acabamento madeira, a única cor que o WVetro refila: pelas palavras do nome (as cores da tabela: AMADEIRADO GOLDEN OAK, AMADEIRADO NOGUEIRA, PINTURA MADEIRA). */
export const COR_DE_MADEIRA = /\b(MADEIRA|AMADEIRADO|AMADEIRADA|GOLDEN OAK|NOGUEIRA|OAK)\b/
export const normalizarCor = (cor: string | null) => (cor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
/**
 * O refilo por ponta da cor: 45 no acabamento madeira, 0 em qualquer outra (branco, preto liso…); ou o motivo de não decidir — a cor ausente, ou um nome composto com BRANCO
 * ("EXTERNO BRANCO"), que o PO decide antes.
 */
export function refiloDaCor(cor: string | null): number | { motivo: string } {
    const c = normalizarCor(cor)
    if (c === '') return { motivo: 'o item não tem a cor do perfil, e o refilo depende dela (o branco aproveita a barra inteira; as outras cores perdem 45 mm por ponta)' }
    if (c === COR_SEM_REFILO) return 0
    if (COR_DE_MADEIRA.test(c)) return REFILO_POR_PONTA_MM
    if (/\bBRANCO\b/.test(c)) return { motivo: `a cor "${cor}" tem BRANCO num nome composto: se leva o refilo de 45 mm por ponta é decisão do dono do produto, e nenhuma é suposta` }
    return 0
}

export const UM_POR_MM = 1000
export const paraUm = (mm: number) => Math.round(mm * UM_POR_MM)
export const paraMm = (um: number) => um / UM_POR_MM

/** Uma barra aberta: o que ela já consome (peças + serra de cada corte) e as peças, na ordem em que entraram. */
export type BarraEmpacotada<T> = { ocupadoUm: number; pecas: T[] }

/**
 * O FFD best-fit: `cortes` JÁ ORDENADOS do maior para o menor (quem chama decide o desempate), cada um com `um` (o comprimento em µm).
 * `utilUm`: a barra útil (a barra menos os dois refilos). Quem chama confere antes que todo corte cabe (`um + serraUm <= utilUm`).
 */
export function empacotar<T extends { um: number }>(cortes: readonly T[], utilUm: number, serraUm: number): BarraEmpacotada<T>[] {
    const abertas: BarraEmpacotada<T>[] = []
    for (const c of cortes) {
        const consumo = c.um + serraUm
        let melhor = -1
        for (let k = 0; k < abertas.length; k++) {
            const resto = utilUm - abertas[k].ocupadoUm
            if (consumo <= resto && (melhor === -1 || resto < utilUm - abertas[melhor].ocupadoUm)) melhor = k
        }
        if (melhor === -1) abertas.push({ ocupadoUm: consumo, pecas: [c] })
        else { abertas[melhor].ocupadoUm += consumo; abertas[melhor].pecas.push(c) }
    }
    return abertas
}
