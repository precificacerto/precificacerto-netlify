/**
 * O TRIBUTO POR DENTRO NÃO INFORMADO NÃO VIRA ZERO — dono do produto, 10/11/2026: "fazer a gravação preservar nulo [...] e fazer o motor
 * recusar formar preço quando o campo é nulo, do mesmo jeito que faltasDaPrecificacao já faz no orçamento I.A. Nenhum dado existente é
 * alterado por migração: a regra passa a valer daqui para a frente."
 *
 * `products.icms_pct` e `products.pis_cofins_pct` eram lidos com `?? 0` e gravados com `|| 0`: um produto aberto e salvo trocava "não
 * informado" por "alíquota zero", e o preço saía como se o tributo existisse zerado (`ausente-vs-falso.md`). Nulo agora é FALTA nomeada,
 * e zero continua sendo zero — o valor digitado.
 *
 * QUANDO o campo é exigido é a MESMA condição em que a tela põe a linha do tributo na margem (product-price.component.tsx, as linhas
 * 'icms' e 'pisCofins'): Lucro Real e Lucro Presumido, e o ICMS só onde a matriz regime × segmento diz que ele existe. O RET fica fora:
 * ele não tem ICMS nem PIS/COFINS em separado (alíquota única), e zerá-los ali está certo. Simples, Híbrido e MEI não usam os dois
 * campos para formar preço.
 *
 * Puro e sem banco: a tela e o salvar leem as MESMAS faltas (`copia-divergente.md`).
 */
import type { CalcType } from '@/utils/pricing-engine'
import { tributoExisteNoSegmento } from '@/utils/campos-do-segmento'

export const FALTA_DO_ICMS = 'o ICMS do produto: sem ele o preço não se forma, e a tela não o trata como zero'
export const FALTA_DO_PIS_COFINS = 'o PIS/COFINS do produto: sem ele o preço não se forma, e a tela não o trata como zero'

export function faltasDosTributosPorDentro(args: {
    taxableRegime: string | null | undefined
    segmento: CalcType
    icmsPct: number | null | undefined
    pisCofinsPct: number | null | undefined
}): string[] {
    const exige = args.taxableRegime === 'LUCRO_REAL' || args.taxableRegime === 'LUCRO_PRESUMIDO'
    if (!exige) return []
    const faltas: string[] = []
    if (tributoExisteNoSegmento(args.segmento, 'ICMS') && !informado(args.icmsPct)) faltas.push(FALTA_DO_ICMS)
    if (tributoExisteNoSegmento(args.segmento, 'PIS_COFINS') && !informado(args.pisCofinsPct)) faltas.push(FALTA_DO_PIS_COFINS)
    return faltas
}

/**
 * As MESMAS faltas, a partir do preço que `formarPrecoDoProduto` formou (o segmento é o que ele resolveu): é a forma que o servidor do orçamento I.A.
 * usa (`preco-do-orcamento.ts`, 13/11/2026), para que a tela e o servidor decidam o preço não formado pela mesma condição.
 */
export function faltasDosTributosDoPreco(args: {
    taxableRegime: string | null | undefined
    preco: { _segmento: CalcType }
    icmsPct: number | null | undefined
    pisCofinsPct: number | null | undefined
}): string[] {
    return faltasDosTributosPorDentro({ taxableRegime: args.taxableRegime, segmento: args.preco._segmento, icmsPct: args.icmsPct, pisCofinsPct: args.pisCofinsPct })
}

/** Informado = um número finito, zero incluído. Nulo, indefinido e NaN são "não informado". */
const informado = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** O valor como vai para o banco: o número digitado, ou nulo quando não informado — nunca o 0 inventado. */
export const paraGravar = (v: number | null | undefined): number | null => (informado(v) ? v : null)

/** O valor como o banco o devolve (numeric chega como texto ou número), sem transformar nulo em zero. */
export const doBanco = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}
