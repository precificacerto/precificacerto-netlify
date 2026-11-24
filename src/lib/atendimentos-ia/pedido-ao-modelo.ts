/**
 * O PEDIDO AO MODELO — o que as duas chamadas da conversa mandam além do texto (dono do produto, 05/11/2026).
 *
 * O caso que originou: em 04/11 e 05/11 quatro primeiras mensagens de sessão passaram de 45 s na 1ª chamada, e a medição dos 21 turnos que
 * voltaram mostrou que o tempo NÃO acompanha o tamanho da entrada (25,8 a 28,9 mil tokens, r = +0,09) e acompanha o da saída (r = +0,87).
 * A primeira resposta (#226) desligou o raciocínio com `thinking: between_tools`, limitou a saída ao tamanho real da ferramenta e marcou o
 * prefixo estável para o cache. A causa, medida depois (05/11, caso Jorge Koss): a ferramenta `strict: true` com 24 opcionais — o limite da
 * API — não compilava sem `thinking` (45 a 50 s e `400 Schema is too complex`) e, com `between_tools`, compilava e DEGENERAVA a saída (nenhum
 * campo da esquadria). O `strict` saiu (`conversa-da-ia.ts`, a ferramenta) e o `between_tools` também: sem os dois, 3,7 s e ~400 tokens de
 * saída, contra 7 s e ~700 com o `between_tools`. Ficam o teto, o cache e a linha [IA] com `stop_reason`, raciocínio e cache.
 */

/**
 * O TETO DE SAÍDA da 1ª chamada É O MÁXIMO DO MODELO (dono do produto, 24/11/2026: "o vendedor vai mandar o arquivo que ele tiver e o agente tem
 * que fazer a leitura. Não precisa ter limite."). A lista do vendedor NÃO pode ser cortada por uma constante nossa: 40 esquadrias numa obra é
 * normal.
 *
 * O CASO, medido em produção em 24/11/2026 20h07 UTC, duas vezes seguidas: uma tabela de 14 esquadrias, `ia_saida=2000 ia_raciocinio=871
 * ia_parada=max_tokens` — o teto era 2.000 (de 05/11, calibrado para "dez esquadrias"), 871 foram para o raciocínio, a chamada da ferramenta
 * veio cortada no meio do JSON, a etapa 1 devolveu `faltou=ia` e o vendedor leu "o serviço de IA não respondeu". Às 20h03, uma de 9 passou.
 *
 * 128.000 é o teto de saída do `claude-sonnet-5-5` (`MODELO_PADRAO_DA_IA`); a chamada já é em fluxo, que é o que esse tamanho pede. O teto não
 * é gasto: só se paga o que o modelo escreve. Trocando o modelo, este número acompanha o do modelo novo.
 *
 * O RACIOCÍNIO NÃO DISPUTA MAIS O ORÇAMENTO DA LISTA: neste modelo o raciocínio é adaptativo e sai do MESMO `max_tokens` — a API não aceita
 * um orçamento separado para ele (`budget_tokens` é recusado) nem desligá-lo (`disabled` é recusado; o `between_tools`, que o desliga, foi
 * medido aqui em 05/11 e saiu: mais lento, e degenerava a ferramenta). Com o teto no máximo do modelo, sobra espaço para os dois; o
 * `effort: low` continua segurando o raciocínio curto, e a linha [IA] continua dizendo quanto ele gastou (`ia_raciocinio=`).
 */
export const MAX_TOKENS_DA_PRIMEIRA_CHAMADA = 128_000

/**
 * A RESPOSTA CORTADA NUNCA VIRA "NÃO RESPONDEU" (dono do produto, 24/11/2026). Com `stop_reason=max_tokens` a conversa guarda as esquadrias
 * que vieram INTEIRAS no JSON cortado, pede de novo SÓ as que faltam e junta as partes — até `CONTINUACOES_DA_LISTA_CORTADA` vezes, dentro do
 * mesmo prazo da chamada. Só depois disso o vendedor é avisado, com a verdade: a lista é grande demais para uma resposta só.
 */
export const CONTINUACOES_DA_LISTA_CORTADA = 2

/** O que o pedido de continuação diz ao modelo: quantas esquadrias já estão guardadas, e que ele devolva só as seguintes. */
export const instrucaoDaContinuacao = (guardadas: number): string => (guardadas > 0
    ? `ATENÇÃO: a sua resposta anterior a ESTA MESMA mensagem foi cortada pelo limite de tamanho depois de ${guardadas} ${guardadas === 1 ? 'esquadria' : 'esquadrias'}. `
        + `As ${guardadas} primeiras esquadrias da lista, na ordem em que aparecem, JÁ ESTÃO GUARDADAS: não as repita. Chame a ferramenta de novo com todos os outros campos como antes `
        + `e, em "itens", SÓ as esquadrias a partir da de número ${guardadas + 1} da lista, na mesma ordem, até a última.`
    : 'ATENÇÃO: a sua resposta anterior a ESTA MESMA mensagem foi cortada pelo limite de tamanho antes de trazer a primeira esquadria. '
        + 'Chame a ferramenta de novo, sem texto antes, com a lista inteira em "itens".')

/**
 * As esquadrias que vieram INTEIRAS no JSON CORTADO da ferramenta: os objetos completos do array `itens` da raiz, na ordem. O objeto que o corte
 * pegou no meio NÃO entra (nenhum campo dele é aproveitado: uma medida cortada seria outra medida). Sem o array, ou com o corte antes dele: vazio.
 * Um leitor de caracteres, não um `JSON.parse` do todo — o todo é inválido por definição.
 */
export function itensCompletosDoJsonCortado(json: string): Array<Record<string, unknown>> {
    const itens: Array<Record<string, unknown>> = []
    let profundidade = 0
    let naString = false
    let escape = false
    let inicioDaString = -1
    let ultimaString: string | null = null
    /** A chave da raiz que acabou de ser lida e espera o valor (`"itens":`). */
    let chaveDaRaiz: string | null = null
    let noArray = false
    let inicioDoItem = -1
    for (let k = 0; k < json.length; k++) {
        const ch = json[k]
        if (naString) {
            if (escape) escape = false
            else if (ch === '\\') escape = true
            else if (ch === '"') { naString = false; ultimaString = json.slice(inicioDaString + 1, k) }
            continue
        }
        if (ch === '"') { naString = true; inicioDaString = k; continue }
        if (ch === ':' && profundidade === 1) { chaveDaRaiz = ultimaString; continue }
        if (ch === '{' || ch === '[') {
            if (ch === '[' && profundidade === 1 && chaveDaRaiz === 'itens') noArray = true
            else if (ch === '{' && noArray && profundidade === 2) inicioDoItem = k
            profundidade += 1
            continue
        }
        if (ch === '}' || ch === ']') {
            profundidade -= 1
            if (ch === '}' && noArray && profundidade === 2 && inicioDoItem >= 0) {
                try {
                    const item = JSON.parse(json.slice(inicioDoItem, k + 1)) as unknown
                    if (item && typeof item === 'object' && !Array.isArray(item)) itens.push(item as Record<string, unknown>)
                } catch { /* o objeto que não fecha num JSON válido não é uma esquadria inteira */ }
                inicioDoItem = -1
            }
            if (ch === ']' && noArray && profundidade === 1) return itens
            continue
        }
        if (ch === ',' && profundidade === 1) chaveDaRaiz = null
    }
    return itens
}

/**
 * O CACHE DO PREFIXO: o bloco estável do sistema (e, por vir antes dele, a ferramenta) é marcado; o que vem depois do marcador não entra.
 * TTL de 5 minutos, renovado a cada leitura — os turnos de uma sessão distam 30 a 60 s. A leitura custa 10 % do token de entrada.
 */
export const CACHE_DO_PREFIXO = { type: 'ephemeral' } as const

/**
 * O PRAZO ATÉ OS CABEÇALHOS da 1ª chamada, em fluxo (dono do produto, 05/11/2026): "10 s até os cabeçalhos, UMA repetição em conexão
 * nova". Medido de dentro da Vercel (gru1) e de fora: os cabeçalhos do pedido real chegam em 1,5 s. Sem cabeçalho em 10 s, a tentativa
 * é abortada — o abort derruba o socket dela — e a segunda abre outra conexão. A segunda sem cabeçalho é o prazo esgotado.
 */
export const PRAZO_ATE_OS_CABECALHOS_MS = 10_000
export const TENTATIVAS_DA_PRIMEIRA_CHAMADA = 2

export type BlocoDoSistema = { type: 'text'; text: string; cache_control?: typeof CACHE_DO_PREFIXO }

/**
 * Os blocos do sistema: o ESTÁVEL (igual entre as chamadas da mesma conta, enquanto o catálogo e a base de conhecimento não mudam) marcado
 * para o cache, e o VOLÁTIL (o que muda a cada mensagem) depois dele, sem marca. O volátil vazio não vira bloco: a API recusa texto vazio.
 */
export function blocosDoSistema(estavel: string, volatil: string | null = null): BlocoDoSistema[] {
    const blocos: BlocoDoSistema[] = [{ type: 'text', text: estavel, cache_control: CACHE_DO_PREFIXO }]
    if (volatil !== null && volatil !== '') blocos.push({ type: 'text', text: volatil })
    return blocos
}

/** O sistema inteiro como texto, na ordem dos blocos — para quem lê o pedido (testes, tela), não para a API. */
export function textoDoSistema(system: unknown): string {
    if (typeof system === 'string') return system
    if (!Array.isArray(system)) return ''
    return system.map((b) => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : '')).join('\n')
}
