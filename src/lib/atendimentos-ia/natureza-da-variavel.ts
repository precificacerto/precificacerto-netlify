/**
 * A NATUREZA DA VARIÁVEL (dono do produto, 20/11/2026, item (2) da ordem; comando de 21/11/2026; migração `20261121000001`).
 *
 *   chave (empresa, família, [linha], [formato], variável) → natureza + opção padrão
 *
 *   - POLITICA — a empresa define; o agente NUNCA pergunta. A opção padrão é TEXTO (o começo do rótulo da opção no motor), nunca o número: a
 *     opção 2 da MAE é "VÃO+50" em 165 tipologias e "VÃO+90" em 3 (medido em 20/11/2026, motor 259035a9).
 *   - ITEM — o vendedor diz no item; o agente só pergunta se o padrão do motor acrescenta peça (a fronteira de sempre).
 *   - CALCULO — o motor resolve com o padrão dele; o agente nem vê.
 *
 * Sem linha para a variável, vale o que valia antes da estrutura (`fronteira-das-escolhas.ts`): o vendedor, o padrão do motor que não acrescenta
 * peça, a principal, senão volta ao agente.
 *
 * A ESPECIFICIDADE: a linha que diz a linha de produto e o formato vence a que só diz um deles, que vence a da família inteira. Na primeira fase
 * (CHECK da migração), linha e formato só existem no VIDRO — as variáveis do motor valem para a família inteira.
 *
 * Puro: quem lê o banco é `politica-da-empresa-servidor.ts` e `vidro-padrao.ts`.
 */

export const NATUREZAS = ['POLITICA', 'ITEM', 'CALCULO'] as const
export type Natureza = (typeof NATUREZAS)[number]
export const TABELA_DA_NATUREZA = 'orcamentista_natureza_da_variavel'

/** Uma linha de `orcamentista_natureza_da_variavel`, só com o que o código lê. */
export type LinhaDaNatureza = { familia: string; linha: string | null; formato: string | null; variavel: string; natureza: Natureza; opcao_padrao: string | null }
/** Onde a variável é pedida: a família da esquadria e, quando se sabe, a linha de produto e o formato (o grupo da tipologia). */
export type OndeDaVariavel = { familia: string | null; linha: string | null; formato: string | null }
/** A natureza que vale para uma variável num lugar. */
export type NaturezaResolvida = { natureza: Natureza; opcao: string | null }

/** A linha que vale para a variável neste lugar: a mais específica que casa; nenhuma, null. */
export function naturezaPara(linhas: readonly LinhaDaNatureza[], variavel: string, onde: OndeDaVariavel): NaturezaResolvida | null {
    const casam = linhas.filter((l) => l.variavel === variavel && l.familia === onde.familia
        && (l.linha === null || l.linha === onde.linha) && (l.formato === null || l.formato === onde.formato))
    if (casam.length === 0) return null
    const peso = (l: LinhaDaNatureza) => (l.linha !== null ? 2 : 0) + (l.formato !== null ? 1 : 0)
    const [melhor] = [...casam].sort((a, b) => peso(b) - peso(a))
    return { natureza: melhor.natureza, opcao: melhor.opcao_padrao }
}

/** Todas as variáveis que têm natureza neste lugar, cada uma com a linha mais específica. */
export function naturezasPara(linhas: readonly LinhaDaNatureza[], onde: OndeDaVariavel): Record<string, NaturezaResolvida> {
    const out: Record<string, NaturezaResolvida> = {}
    for (const v of new Set(linhas.map((l) => l.variavel))) {
        const r = naturezaPara(linhas, v, onde)
        if (r !== null) out[v] = r
    }
    return out
}

/**
 * O FORMATO de uma tipologia, como a natureza o guarda: o grupo que o leitor da descrição diz — "janela correr", "porta correr", "maxim-ar" (a
 * abertura, quando a descrição a declara, e o tipo). Sem tipo lido, nenhum formato.
 */
export function formatoDoGrupo(grupo: { abertura: string | null; tipo: string } | null): string | null {
    return grupo === null ? null : grupo.abertura === null ? grupo.tipo : `${grupo.abertura} ${grupo.tipo}`
}
/** O inverso, para o vidro padrão: "janela correr" → abertura janela, tipo correr; "maxim-ar" → sem abertura. */
export function grupoDoFormato(formato: string): { abertura: 'porta' | 'janela' | null; tipo: string } {
    const [primeira, ...resto] = formato.split(' ')
    return (primeira === 'porta' || primeira === 'janela') && resto.length > 0 ? { abertura: primeira, tipo: resto.join(' ') } : { abertura: null, tipo: formato }
}
