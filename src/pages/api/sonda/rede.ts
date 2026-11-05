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
    erro: string | null
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
        return { alvo, ip, status: r.status, cabecalhos_ms: cabecalhos, fim_ms: Date.now() - inicio, request_id: r.headers.get('request-id'), cf_ray: r.headers.get('cf-ray'), content_encoding: r.headers.get('content-encoding'), corpo_chars: texto === null ? null : texto.length, erro: texto === null ? (controlador.signal.aborted ? `cabeçalhos em ${cabecalhos} ms, corpo não terminou em ${PRAZO_MS} ms` : 'corpo não lido') : null }
    } catch (e) {
        const estourou = controlador.signal.aborted
        return { alvo, ip, status: null, cabecalhos_ms: null, fim_ms: Date.now() - inicio, request_id: null, cf_ray: null, content_encoding: null, corpo_chars: null, erro: estourou ? `sem cabeçalhos em ${PRAZO_MS} ms` : `${e instanceof Error ? e.name : 'erro'}: ${e instanceof Error ? e.message : String(e)}` }
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
    const accept_encoding = await ecoDoAcceptEncoding()
    medidas.push(await medir('https://www.cloudflare.com/', { method: 'GET' }))
    // em série, de propósito: cada alvo numa conexão própria, sem concorrência entre eles
    medidas.push(await medir('https://api.anthropic.com/v1/messages', corpoVazio))
    medidas.push(await medir('https://api.openai.com/v1/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    medidas.push(await medir('https://www.cloudflare.com/cdn-cgi/trace', { method: 'GET' }))
    // a Anthropic de novo, numa segunda conexão: a primeira pode ter sido a azarada
    medidas.push(await medir('https://api.anthropic.com/v1/messages', corpoVazio))
    // o corpo do TAMANHO da produção (≈ 37 KB), ainda sem chave válida: se o envio do corpo travar de gru1, aparece aqui (esperado: 401 rápido)
    const sistemaGrande = 'PROMPT DE TESTE DE REDE. '.repeat(1400)
    const corpoGrande = JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 20, system: [{ type: 'text', text: sistemaGrande, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'diga ok' }] })
    medidas.push(await medir('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2026-10-21', 'x-api-key': 'sem-chave' }, body: corpoGrande }))
    // COM a chave, se ela existir no ambiente de preview (o dono do produto a põe só neste branch): o pedido real, "diga ok" e o grande
    const chave = process.env.ANTHROPIC_API_KEY
    if (chave) {
        const cab = { 'content-type': 'application/json', 'anthropic-version': '2026-10-21', 'x-api-key': chave }
        medidas.push(await medir('https://api.anthropic.com/v1/messages#com-chave-diga-ok', { method: 'POST', headers: cab, body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 20, messages: [{ role: 'user', content: 'diga ok' }] }) }))
        medidas.push(await medir('https://api.anthropic.com/v1/messages#com-chave-corpo-grande', { method: 'POST', headers: cab, body: corpoGrande }))
    }
    const resultado = { quando: new Date().toISOString(), accept_encoding, com_chave: Boolean(chave), tamanho_corpo_grande: corpoGrande.length, regiao: process.env.VERCEL_REGION ?? null, ambiente: process.env.VERCEL_ENV ?? null, node: process.version, medidas }
    console.error(`[SONDA-REDE] ${JSON.stringify(resultado)}`)
    res.status(200).json(resultado)
}
