/**
 * SONDA DE REDE (dono do produto, 05/11/2026, autorizada como prioridade máxima): de dentro da função na Vercel, SEM chave, mede o
 * tempo até os cabeçalhos de um POST vazio a `api.anthropic.com` (esperado: 401 em ~0,1 s) e, para separar "a rede da Vercel está
 * ruim" de "só a Anthropic não responde de gru1", o mesmo contra outros dois hosts HTTPS. Desde 04/11 20:11 toda chamada ao modelo
 * feita da Vercel pendurou sem cabeçalhos, enquanto o mesmo pedido responde em 6 s de fora.
 *
 * Só roda fora de produção (preview): em produção responde 404. Não lê nem imprime chave nenhuma.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { lookup } from 'node:dns/promises'
import { FERRAMENTAS, MENSAGEM_REAL, SISTEMA_ESTAVEL } from './corpo-real'

export const config = { maxDuration: 60 }

const PRAZO_MS = 25_000

type Medida = {
    alvo: string
    ip: string | null
    status: number | null
    cabecalhos_ms: number | null
    fim_ms: number | null
    request_id: string | null
    cf_ray: string | null
    content_encoding: string | null
    corpo_chars: number | null
    resumo: string | null
    erro: string | null
}

/** stop_reason e usage de uma resposta JSON da API; nos SSE, o último message_delta. Nunca o conteúdo. */
function resumir(texto: string | null): string | null {
    if (!texto) return null
    try {
        const j = JSON.parse(texto) as { stop_reason?: unknown; usage?: unknown; error?: { type?: unknown } }
        return JSON.stringify({ stop_reason: j.stop_reason ?? null, usage: j.usage ?? null, erro: j.error?.type ?? null })
    } catch {
        const eventos = texto.split('\n').filter((l) => l.startsWith('data:'))
        const ultimo = [...eventos].reverse().find((l) => l.includes('message_delta'))
        return `sse: ${eventos.length} eventos; ${ultimo ? ultimo.slice(5, 300) : 'sem message_delta'}`
    }
}

async function medir(alvo: string, init: RequestInit): Promise<Medida> {
    const host = new URL(alvo).hostname
    const ip: string | null = await lookup(host).then((r): string => r.address).catch((): null => null)
    const controlador = new AbortController()
    const despertador = setTimeout(() => controlador.abort(), PRAZO_MS)
    const inicio = Date.now()
    try {
        const r = await fetch(alvo, { ...init, signal: controlador.signal })
        const cabecalhos = Date.now() - inicio
        // o corpo é lido até o fim DENTRO do prazo: se os cabeçalhos chegam e o corpo não termina, aparece como estouro com cabecalhos_ms preenchido
        const texto = await r.text().catch((): null => null)
        return { alvo, ip, status: r.status, cabecalhos_ms: cabecalhos, fim_ms: Date.now() - inicio, request_id: r.headers.get('request-id'), cf_ray: r.headers.get('cf-ray'), content_encoding: r.headers.get('content-encoding'), corpo_chars: texto === null ? null : texto.length, resumo: resumir(texto), erro: texto === null ? (controlador.signal.aborted ? `cabeçalhos em ${cabecalhos} ms, corpo não terminou em ${PRAZO_MS} ms` : 'corpo não lido') : null }
    } catch (e) {
        const estourou = controlador.signal.aborted
        return { alvo, ip, status: null, cabecalhos_ms: null, fim_ms: Date.now() - inicio, request_id: null, cf_ray: null, content_encoding: null, corpo_chars: null, resumo: null, erro: estourou ? `sem cabeçalhos em ${PRAZO_MS} ms` : `${e instanceof Error ? e.name : 'erro'}: ${e instanceof Error ? e.message : String(e)}` }
    } finally {
        clearTimeout(despertador)
    }
}

/** O que o fetch deste runtime manda em accept-encoding: um servidor local ecoa o cabeçalho do pedido. */
async function ecoDoAcceptEncoding(): Promise<string | null> {
    const { createServer } = await import('node:http')
    const srv = createServer((req, res) => { res.end(String(req.headers['accept-encoding'] ?? '')) })
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()))
    try {
        const end = srv.address()
        if (!end || typeof end === 'string') return null
        return await (await fetch(`http://127.0.0.1:${end.port}/`)).text()
    } catch { return null } finally { srv.close() }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (process.env.VERCEL_ENV === 'production') return res.status(404).end()
    const corpoVazio = { method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2026-10-21' }, body: '{}' } as const
    const medidas: Medida[] = []
    const ferramenta: Array<Record<string, unknown>> = []
    const accept_encoding = await ecoDoAcceptEncoding()
    const apenasKoss = req.query.apenas === 'koss'
    const turnoPedido = typeof req.query.turno === 'string' ? req.query.turno : null
    if (!apenasKoss) medidas.push(await medir('https://www.cloudflare.com/', { method: 'GET' }))
    // em série, de propósito: cada alvo numa conexão própria, sem concorrência entre eles
    if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages', corpoVazio))
    if (!apenasKoss) medidas.push(await medir('https://api.openai.com/v1/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    if (!apenasKoss) medidas.push(await medir('https://www.cloudflare.com/cdn-cgi/trace', { method: 'GET' }))
    // a Anthropic de novo, numa segunda conexão: a primeira pode ter sido a azarada
    if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages', corpoVazio))
    // o corpo do TAMANHO da produção (≈ 37 KB), ainda sem chave válida: se o envio do corpo travar de gru1, aparece aqui (esperado: 401 rápido)
    const sistemaGrande = 'PROMPT DE TESTE DE REDE. '.repeat(1400)
    const corpoGrande = JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 20, system: [{ type: 'text', text: sistemaGrande, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'diga ok' }] })
    if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2026-10-21', 'x-api-key': 'sem-chave' }, body: corpoGrande }))
    // COM a chave, se ela existir no ambiente de preview (o dono do produto a põe só neste branch): o pedido real, "diga ok" e o grande
    const chave = process.env.ANTHROPIC_API_KEY
    if (chave) {
        const cab = { 'content-type': 'application/json', 'anthropic-version': '2026-10-21', 'x-api-key': chave }
        if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages#com-chave-diga-ok', { method: 'POST', headers: cab, body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 20, messages: [{ role: 'user', content: 'diga ok' }] }) }))
        if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages#com-chave-corpo-grande', { method: 'POST', headers: cab, body: corpoGrande }))
        // o corpo REAL da produção: sistema em dois blocos com cache_control, ferramenta, thinking between_tools, effort low, a mensagem do Jeison
        const real = {
            model: 'claude-sonnet-5-5', max_tokens: 2000, thinking: { type: 'between_tools' }, output_config: { effort: 'low' },
            system: [{ type: 'text', text: SISTEMA_ESTAVEL, cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Levantamento em montagem: nenhum.' }],
            tools: FERRAMENTAS, tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: MENSAGEM_REAL }],
        }
        if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages#real-sem-stream', { method: 'POST', headers: cab, body: JSON.stringify(real) }))
        if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages#real-com-stream', { method: 'POST', headers: cab, body: JSON.stringify({ ...real, stream: true }) }))
        if (!apenasKoss) medidas.push(await medir('https://api.anthropic.com/v1/messages#real-sem-stream-de-novo', { method: 'POST', headers: cab, body: JSON.stringify(real) }))
        // OS CINCO TURNOS DO JORGE KOSS (05/11 14:04-14:08): o que o modelo devolve na ferramenta (nome, cliente, novo, itens, escolhas), com o
        // histórico e o volátil de cada turno reconstruídos das mensagens gravadas. Só a entrada da ferramenta é devolvida — nunca o texto do modelo.
        const T1 = 'quero orçamento\n1 Porta janelas de correr 2 folhas com vidro comum 6 mm incolor 2,50 x 2,20\n1 janela maxim ar, mini boreal 60 x60\n\nJorge Koss, porto alegre'
        const S1 = 'Qual o nome do cliente desse orçamento? Se for de um levantamento que você já fez, me diga de quem é.'
        const T2 = 'Nome é Jorge Koss'
        const S2 = 'Jorge Koss já veio na mensagem anterior, mas não consegui vincular como cliente. Me diga de novo só o nome da obra, ou o nome de um levantamento que você já tenha feito, e eu sigo com a lista.'
        const T3 = 'Levantamento novo em nome de Jorge Koss'
        const S3 = 'Jorge Koss, levantamento novo. Para montar a lista, preciso saber de cada esquadria:\n\n- É janela ou porta?\n- Abre de correr, de abrir ou maxim-ar?\n- Tem persiana?\n- Largura e altura em mm.\n- Cor do perfil e vidro.'
        const T4 = '1 Porta janelas de correr 2 folhas com vidro comum 6 mm incolor 2,50 x 2,20\n1 janela maxim ar, mini boreal 60 x60'
        const S4 = 'Preciso só de duas coisas para fechar a lista:\n\n- Cor do perfil (vale para as duas esquadrias).\n- Vidro da maxim-ar mini boreal 60 x 60: é o mesmo comum incolor, ou outro?\n\nSe a porta-janela de correr tem persiana, bandeira ou peitoril fixo, me avise. Se não tem, sigo assim.'
        const T5 = 'Branco\nVidro Comum'
        const SEM_NOME = 'Para eu anotar, me diga o nome do cliente — por exemplo: Cliente João Silva. Se for sobre um levantamento que você já fez, me diga de quem é.'
        const MONTAGEM_VAZIA = 'Levantamento em montagem: “Jorge Koss”, esquadrias (null = ainda não dito): [{"ordem":1,"tipologia":null,"largura_mm":null,"altura_mm":null,"quantidade":1,"cor_perfil":null,"vidro":null}]'
        const turnos: Array<{ nome: string; volatil: string; messages: Array<{ role: string; content: string }> }> = [
            { nome: 'T1', volatil: 'Levantamento em montagem: nenhum.', messages: [{ role: 'user', content: T1 }] },
            { nome: 'T2', volatil: `Levantamento em montagem: nenhum.\nPergunta em aberto: ${SEM_NOME}`, messages: [{ role: 'user', content: T1 }, { role: 'assistant', content: S1 }, { role: 'user', content: T2 }] },
            { nome: 'T3', volatil: `Levantamento em montagem: nenhum.\nPergunta em aberto: ${SEM_NOME}`, messages: [{ role: 'user', content: T1 }, { role: 'assistant', content: S1 }, { role: 'user', content: T2 }, { role: 'assistant', content: S2 }, { role: 'user', content: T3 }] },
            { nome: 'T4', volatil: `${MONTAGEM_VAZIA}\nPergunta em aberto: ${S3}`, messages: [{ role: 'user', content: T1 }, { role: 'assistant', content: S1 }, { role: 'user', content: T2 }, { role: 'assistant', content: S2 }, { role: 'user', content: T3 }, { role: 'assistant', content: S3 }, { role: 'user', content: T4 }] },
            { nome: 'T5', volatil: `${MONTAGEM_VAZIA}\nPergunta em aberto: ${S4}`, messages: [{ role: 'user', content: T1 }, { role: 'assistant', content: S1 }, { role: 'user', content: T2 }, { role: 'assistant', content: S2 }, { role: 'user', content: T3 }, { role: 'assistant', content: S3 }, { role: 'user', content: T4 }, { role: 'assistant', content: S4 }, { role: 'user', content: T5 }] },
        ]
        for (const t of turnos.filter((t) => turnoPedido === null || t.nome === turnoPedido)) {
            // VARIANTES (medição, 05/11): ?variante=sem-effort tira o output_config; sem-thinking tira o thinking; ambos tira os dois
            const variante = typeof req.query.variante === 'string' ? req.query.variante : null
            const { thinking: _thinking, output_config: _effort, ...semOsDois } = real
            // sem-strict: a MESMA ferramenta sem `strict: true` (a saída deixa de ser forçada pela gramática); sem-strict-sem-thinking: e sem o thinking
            const semStrict = (FERRAMENTAS as Array<Record<string, unknown>>).map(({ strict: _s, ...f }) => { void _s; return f })
            const base = variante === 'ambos' ? semOsDois
                : variante === 'sem-effort' ? { ...semOsDois, thinking: _thinking }
                : variante === 'sem-thinking' ? { ...semOsDois, output_config: _effort }
                : variante === 'sem-strict' ? { ...real, tools: semStrict }
                : variante === 'sem-strict-sem-thinking' ? { ...semOsDois, output_config: _effort, tools: semStrict }
                : real
            const pedido = { ...base, system: [{ type: 'text', text: SISTEMA_ESTAVEL, cache_control: { type: 'ephemeral' } }, { type: 'text', text: t.volatil }], messages: t.messages }
            // tempo e aborto em 50 s (a leitura pelo painel tem 60 s): a variante que não responde aparece como interrompida, com o tempo
            const t0 = Date.now()
            let r2: Response
            try {
                r2 = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: cab, body: JSON.stringify(pedido), signal: AbortSignal.timeout(50_000) })
            } catch (e) {
                ferramenta.push({ turno: t.nome, variante, status: null, ms: Date.now() - t0, interrompido: true, erro: e instanceof Error ? e.name : String(e) })
                continue
            }
            const j = (await r2.json().catch((): null => null)) as { stop_reason?: unknown; usage?: { output_tokens?: unknown; output_tokens_details?: unknown }; error?: { type?: unknown; message?: unknown }; content?: Array<{ type?: unknown; name?: unknown; input?: unknown }> } | null
            const ms = Date.now() - t0
            const chamada = j?.content?.find((b) => b.type === 'tool_use')
            const entrada = (chamada?.input ?? null) as Record<string, unknown> | null
            const { fala: _fala, ...semFala } = entrada ?? {}
            void _fala
            ferramenta.push({ turno: t.nome, variante, status: r2.status, ms, stop_reason: j?.stop_reason ?? null, output_tokens: j?.usage?.output_tokens ?? null, saida_detalhe: j?.usage?.output_tokens_details ?? null, erro: j?.error ? { type: j.error.type ?? null, message: typeof j.error.message === 'string' ? j.error.message.slice(0, 300) : null } : null, entrada: entrada ? semFala : null })
        }
    }
    const resultado = { quando: new Date().toISOString(), ferramenta, accept_encoding, com_chave: Boolean(chave), tamanho_corpo_grande: corpoGrande.length, regiao: process.env.VERCEL_REGION ?? null, ambiente: process.env.VERCEL_ENV ?? null, node: process.version, medidas }
    console.error(`[SONDA-REDE] ${JSON.stringify(resultado)}`)
    res.status(200).json(resultado)
}
