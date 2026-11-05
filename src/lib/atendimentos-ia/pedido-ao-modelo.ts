/**
 * O PEDIDO AO MODELO — o que as duas chamadas da conversa mandam além do texto (dono do produto, 05/11/2026).
 *
 * O caso que originou: em 04/11 e 05/11 quatro primeiras mensagens de sessão passaram de 45 s na 1ª chamada, e a medição dos 21 turnos que
 * voltaram mostrou que o tempo NÃO acompanha o tamanho da entrada (25,8 a 28,9 mil tokens, r = +0,09) e acompanha o da saída (r = +0,87); os
 * dois turnos lentos que voltaram geraram a 15 e 20 tokens/s contra 35 a 110 nos normais. Duas hipóteses cabiam nos dados: a API lenta, ou
 * o raciocínio adaptativo (a chamada ia sem `thinking`, que no Sonnet 5.5 liga o raciocínio) pensando milhares de tokens antes da ferramenta.
 * Este módulo desliga o raciocínio na 1ª chamada, limita a saída ao tamanho real da ferramenta mais folga, e marca o prefixo estável do
 * sistema para o cache — e a linha [IA] passa a dizer `stop_reason`, os tokens de raciocínio e os do cache, para a gente parar de adivinhar.
 */

/**
 * O RACIOCÍNIO da 1ª chamada, DESLIGADO: no Sonnet 5.5 `disabled` é recusado (400); `between_tools` é o jeito de não pensar antes da
 * ferramenta, aceito com `effort` até `high`. A 1ª chamada é uma extração curta: a ferramenta, uma vez.
 */
export const RACIOCINIO_DA_EXTRACAO = { type: 'between_tools' } as const

/**
 * O TETO DE SAÍDA da 1ª chamada: a resposta é UMA chamada da ferramenta. Medido nos 21 turnos de produção (03/11/2026): 86 a 574 tokens de saída.
 * 2.000 é mais de três vezes o maior medido e cabe a mensagem de dez esquadrias; o que passar disso pára em `max_tokens`, e a linha [IA] diz.
 * Antes era 16.000 — folga para um raciocínio que não deveria existir.
 */
export const MAX_TOKENS_DA_PRIMEIRA_CHAMADA = 2_000

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
