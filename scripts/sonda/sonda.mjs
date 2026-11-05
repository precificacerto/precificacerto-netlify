// SONDA — isola a chamada ao modelo, fora da rota, com a MESMA chave (ANTHROPIC_API_KEY no ambiente; nunca impressa) e o MESMO modelo.
// Uso: ANTHROPIC_API_KEY=... node sonda.mjs [1|2|3|todos]   (padrão: todos). Sem prazo: deixa rodar até o fim e diz quanto levou.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const AQUI = dirname(fileURLToPath(import.meta.url))
const MODELO = 'claude-sonnet-5-5', VERSAO = '2026-10-21', URL = 'https://api.anthropic.com/v1/messages'
const chave = process.env.ANTHROPIC_API_KEY
if (!chave) { console.error('faltou ANTHROPIC_API_KEY no ambiente'); process.exit(2) }
const cab = { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': VERSAO }
const ler = (f) => readFileSync(join(AQUI, f), 'utf8')
const estavel = ler('sistema-depaula.txt'), tools = JSON.parse(ler('tools.json'))
const JEISON = ler('mensagem-jeison.txt').trim()
const comSistema = (mensagem) => ({
    model: MODELO, max_tokens: 2000, thinking: { type: 'between_tools' }, output_config: { effort: 'low' },
    system: [{ type: 'text', text: estavel, cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Levantamento em montagem: nenhum.' }],
    tools, tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: mensagem }],
})
const PASSOS = {
    1: { nome: '1. mínima: "diga ok", sem ferramenta, sem sistema', corpo: { model: MODELO, max_tokens: 20, messages: [{ role: 'user', content: 'diga ok' }] } },
    2: { nome: '2. sistema real da De Paula (reconstruído) + ferramenta, mensagem trivial "oi"', corpo: comSistema('oi') },
    3: { nome: '3. sistema real + ferramenta, a mensagem real do Jeison', corpo: comSistema(JEISON) },
}
const ms = (t) => `${(t / 1000).toFixed(2)} s`
async function semStreaming(corpo) {
    const t0 = Date.now()
    const r = await fetch(URL, { method: 'POST', headers: cab, body: JSON.stringify(corpo) })
    const tCab = Date.now() - t0
    const texto = await r.text()
    const tFim = Date.now() - t0
    let j = null; try { j = JSON.parse(texto) } catch {}
    return { status: r.status, requestId: r.headers.get('request-id'), cabecalhos_em: tCab, fim_em: tFim, stop_reason: j?.stop_reason ?? null, usage: j?.usage ?? null,
        erro: r.ok ? null : texto.slice(0, 400), conteudo: Array.isArray(j?.content) ? j.content.map((b) => b.type === 'tool_use' ? `tool_use:${b.name}` : b.type === 'text' ? `text(${b.text.length})` : b.type) : null }
}
async function comStreaming(corpo) {
    const t0 = Date.now()
    const r = await fetch(URL, { method: 'POST', headers: cab, body: JSON.stringify({ ...corpo, stream: true }) })
    const tCab = Date.now() - t0
    if (!r.ok) return { status: r.status, cabecalhos_em: tCab, erro: (await r.text()).slice(0, 400) }
    let primeiroToken = null, stop = null, usage = null, eventos = 0
    const dec = new TextDecoder(); let resto = ''
    for await (const pedaco of r.body) {
        resto += dec.decode(pedaco, { stream: true })
        let i
        while ((i = resto.indexOf('\n\n')) >= 0) {
            const bloco = resto.slice(0, i); resto = resto.slice(i + 2); eventos++
            const linha = bloco.split('\n').find((l) => l.startsWith('data:')); if (!linha) continue
            let ev; try { ev = JSON.parse(linha.slice(5)) } catch { continue }
            if (ev.type === 'content_block_delta' && primeiroToken === null) primeiroToken = Date.now() - t0
            if (ev.type === 'message_delta') { stop = ev.delta?.stop_reason ?? stop; usage = { ...(usage ?? {}), ...(ev.usage ?? {}) } }
            if (ev.type === 'message_start') usage = { ...(ev.message?.usage ?? {}) }
        }
    }
    return { status: r.status, requestId: r.headers.get('request-id'), cabecalhos_em: tCab, primeiro_token_em: primeiroToken, fim_em: Date.now() - t0, stop_reason: stop, usage, eventos }
}
const pedidos = process.argv[2] && process.argv[2] !== 'todos' ? [process.argv[2]] : ['1', '2', '3']
for (const k of pedidos) {
    const p = PASSOS[k]
    const tam = JSON.stringify(p.corpo).length
    console.log(`\n=== ${p.nome} — pedido de ${tam} caracteres`)
    console.log('sem streaming (como a produção):', JSON.stringify(await semStreaming(p.corpo)))
    console.log('com streaming (tempo até o 1º token):', JSON.stringify(await comStreaming(p.corpo)))
}
