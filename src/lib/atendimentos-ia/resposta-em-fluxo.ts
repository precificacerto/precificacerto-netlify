/**
 * A RESPOSTA DO MODELO EM FLUXO (streaming) — dono do produto, 05/11/2026: "com streaming os cabeçalhos chegam em 1,5 s, teríamos o
 * request-id para rastrear na Anthropic e saberíamos se é fila ou geração. Hoje a gente espera 45 s para descobrir que nada veio."
 *
 * A API manda eventos SSE (`event: nome\ndata: {json}\n\n`): `message_start` (o `usage` de entrada e do cache), `content_block_start`
 * e `content_block_delta` (o texto, ou o JSON da ferramenta em pedaços, `input_json_delta.partial_json`), `content_block_stop`,
 * `message_delta` (o `stop_reason` e o `usage` de saída), `message_stop`, `ping`, e `error` no meio do fluxo. Este módulo lê o corpo
 * até o fim e devolve a MESMA forma da resposta sem fluxo (`stop_reason`, `usage`, `content`): quem decide sobre a proposta não muda.
 *
 * O primeiro token é o primeiro `content_block_delta`: medido em ms desde o início da chamada, é o que separa a fila (cabeçalhos tarde)
 * da geração lenta (primeiro token cedo, fim tarde).
 */
export type MensagemMontada = {
    stop_reason: string | null
    usage: Record<string, unknown> | null
    content: Array<Record<string, unknown>>
    /** O evento `error` do fluxo, quando veio: a API desistiu no meio. */
    erro: { type?: unknown; message?: unknown } | null
}

export type LeituraDoFluxo = { mensagem: MensagemMontada; primeiroTokenMs: number | null; eventos: number }

type Bloco = { type: string; name?: string; id?: string; texto: string; jsonParcial: string }

function montarBloco(b: Bloco): Record<string, unknown> {
    if (b.type === 'tool_use') {
        let input: unknown = {}
        try { input = b.jsonParcial === '' ? {} : JSON.parse(b.jsonParcial) } catch { input = null }
        return { type: 'tool_use', id: b.id, name: b.name, input }
    }
    if (b.type === 'text') return { type: 'text', text: b.texto }
    return { type: b.type }
}

/** Um evento SSE: o `data:` em JSON; sem `data:` legível, nulo. */
function dadoDoEvento(bruto: string): Record<string, unknown> | null {
    const linhas = bruto.split('\n')
    const dados = linhas.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())
    if (dados.length === 0) return null
    try { return JSON.parse(dados.join('\n')) as Record<string, unknown> } catch { return null }
}

/**
 * Lê o corpo em fluxo até o fim. `inicio` é o `Date.now()` do começo da chamada: o primeiro token é medido contra ele. Um corpo que não
 * é SSE (nenhum evento) vira mensagem vazia — quem chama vê `sem-proposta`. O abort do `signal` do fetch derruba a leitura com exceção,
 * e quem chama trata como prazo.
 */
export async function lerFluxo(corpo: ReadableStream<Uint8Array> | null, inicio: number, agora: () => number = Date.now): Promise<LeituraDoFluxo> {
    const mensagem: MensagemMontada = { stop_reason: null, usage: null, content: [], erro: null }
    const blocos = new Map<number, Bloco>()
    let primeiroTokenMs: number | null = null
    let eventos = 0
    if (corpo) {
        const decodificador = new TextDecoder()
        let resto = ''
        const tratar = (bruto: string) => {
            eventos += 1
            const d = dadoDoEvento(bruto)
            if (!d) return
            const tipo = d.type
            if (tipo === 'message_start') {
                const m = d.message as { usage?: Record<string, unknown> } | undefined
                mensagem.usage = { ...(mensagem.usage ?? {}), ...(m?.usage ?? {}) }
            } else if (tipo === 'content_block_start') {
                const cb = (d.content_block ?? {}) as { type?: unknown; name?: unknown; id?: unknown; text?: unknown }
                blocos.set(Number(d.index), { type: String(cb.type ?? ''), name: typeof cb.name === 'string' ? cb.name : undefined, id: typeof cb.id === 'string' ? cb.id : undefined, texto: typeof cb.text === 'string' ? cb.text : '', jsonParcial: '' })
            } else if (tipo === 'content_block_delta') {
                if (primeiroTokenMs === null) primeiroTokenMs = agora() - inicio
                const b = blocos.get(Number(d.index))
                const delta = (d.delta ?? {}) as { type?: unknown; text?: unknown; partial_json?: unknown }
                if (b && delta.type === 'text_delta' && typeof delta.text === 'string') b.texto += delta.text
                if (b && delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') b.jsonParcial += delta.partial_json
            } else if (tipo === 'message_delta') {
                const delta = (d.delta ?? {}) as { stop_reason?: unknown }
                if (typeof delta.stop_reason === 'string') mensagem.stop_reason = delta.stop_reason
                // o usage da saída chega aqui; o de entrada veio no message_start — os dois se somam no mesmo objeto
                if (d.usage && typeof d.usage === 'object') mensagem.usage = { ...(mensagem.usage ?? {}), ...(d.usage as Record<string, unknown>) }
            } else if (tipo === 'error') {
                mensagem.erro = (d.error ?? {}) as { type?: unknown; message?: unknown }
            }
        }
        for await (const pedaco of corpo as unknown as AsyncIterable<Uint8Array>) {
            resto += decodificador.decode(pedaco, { stream: true })
            let i: number
            while ((i = resto.indexOf('\n\n')) >= 0) {
                tratar(resto.slice(0, i))
                resto = resto.slice(i + 2)
            }
        }
        resto += decodificador.decode()
        if (resto.trim() !== '') tratar(resto)
    }
    mensagem.content = [...blocos.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => montarBloco(b))
    return { mensagem, primeiroTokenMs, eventos }
}
