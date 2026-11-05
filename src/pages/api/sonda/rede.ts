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
    erro: string | null
}

async function medir(alvo: string, init: RequestInit): Promise<Medida> {
    const host = new URL(alvo).hostname
    const ip = await lookup(host).then((r) => r.address).catch(() => null)
    const controlador = new AbortController()
    const despertador = setTimeout(() => controlador.abort(), PRAZO_MS)
    const inicio = Date.now()
    try {
        const r = await fetch(alvo, { ...init, signal: controlador.signal })
        const cabecalhos = Date.now() - inicio
        await r.text().catch(() => '')
        return { alvo, ip, status: r.status, cabecalhos_ms: cabecalhos, fim_ms: Date.now() - inicio, request_id: r.headers.get('request-id'), cf_ray: r.headers.get('cf-ray'), erro: null }
    } catch (e) {
        const estourou = controlador.signal.aborted
        return { alvo, ip, status: null, cabecalhos_ms: null, fim_ms: Date.now() - inicio, request_id: null, cf_ray: null, erro: estourou ? `sem cabeçalhos em ${PRAZO_MS} ms` : `${e instanceof Error ? e.name : 'erro'}: ${e instanceof Error ? e.message : String(e)}` }
    } finally {
        clearTimeout(despertador)
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (process.env.VERCEL_ENV === 'production') return res.status(404).end()
    const corpoVazio = { method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2026-10-21' }, body: '{}' } as const
    const medidas: Medida[] = []
    // em série, de propósito: cada alvo numa conexão própria, sem concorrência entre eles
    medidas.push(await medir('https://api.anthropic.com/v1/messages', corpoVazio))
    medidas.push(await medir('https://api.openai.com/v1/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    medidas.push(await medir('https://www.cloudflare.com/cdn-cgi/trace', { method: 'GET' }))
    // a Anthropic de novo, numa segunda conexão: a primeira pode ter sido a azarada
    medidas.push(await medir('https://api.anthropic.com/v1/messages', corpoVazio))
    const resultado = { quando: new Date().toISOString(), regiao: process.env.VERCEL_REGION ?? null, ambiente: process.env.VERCEL_ENV ?? null, node: process.version, medidas }
    console.error(`[SONDA-REDE] ${JSON.stringify(resultado)}`)
    res.status(200).json(resultado)
}
