/**
 * PORTÃO DE REDE DOS TESTES — nenhum teste abre conexão de rede.
 *
 * Por quê (dono do produto, 04/11/2026): um teste chamava uma rota que consultava o WUZAPI por
 * `fetch` real. No container a saída falhava na hora e o teste passava; no runner do GitHub a
 * conexão saía de verdade e estourava os 5 s do Jest, derrubando o CI de PRs que não tocavam o
 * arquivo (#220). O #221 simulou aquele `fetch`; este portão impede a classe de voltar.
 *
 * Como funciona: `net.Socket.prototype.connect` é embrulhado UMA vez por processo (o módulo `net`
 * é compartilhado entre os arquivos de teste do mesmo worker, por isso a instalação é idempotente e
 * o estado mora no próprio módulo `net`). Conexão com destino fora do loopback (127.0.0.1, ::1,
 * localhost) ou de socket unix NÃO sai: o socket é destruído com um erro nomeado, e a tentativa fica
 * anotada. O `jest.setup.js` zera as anotações antes de cada teste e, depois dele, FALHA o teste que
 * tentou sair, dizendo o destino e a pilha. Falhar, não só bloquear: um `fetch` recusado costuma ser
 * engolido por try/catch no código e o teste passaria em silêncio — exatamente o que não queremos.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require('net')

const CHAVE = Symbol.for('precificacerto.portao-de-rede')
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost', '0.0.0.0', '::', '[::1]'])

function estado() {
    if (!net[CHAVE]) net[CHAVE] = { instalado: false, violacoes: [] }
    return net[CHAVE]
}

/** Destino de uma chamada a `socket.connect(...)`: `{ host, port }`, ou `null` quando é local. */
function destinoDe(args) {
    const primeiro = args[0]
    // `net.connect(...)` normaliza os argumentos e chama `socket.connect([opcoes, callback])`: um ARRAY.
    if (Array.isArray(primeiro)) return destinoDe(primeiro)
    if (primeiro && typeof primeiro === 'object') {
        if (primeiro.path) return null // socket unix: local
        const host = primeiro.host || 'localhost'
        return LOOPBACK.has(host) ? null : { host, port: primeiro.port ?? null }
    }
    if (typeof primeiro === 'string') return null // connect(path): socket unix
    if (typeof primeiro === 'number') {
        const host = typeof args[1] === 'string' ? args[1] : 'localhost'
        return LOOPBACK.has(host) ? null : { host, port: primeiro }
    }
    return null
}

function instalar() {
    const e = estado()
    if (e.instalado) return
    e.instalado = true
    const connectOriginal = net.Socket.prototype.connect
    net.Socket.prototype.connect = function portaoDeRede(...args) {
        const destino = destinoDe(args)
        if (!destino) return connectOriginal.apply(this, args)
        const pilha = (new Error().stack || '').split('\n').slice(2, 8).map((l) => l.trim()).join('\n    ')
        e.violacoes.push({ ...destino, pilha })
        const erro = new Error(`Portão de rede dos testes: conexão com ${destino.host}:${destino.port} bloqueada.`)
        erro.code = 'PORTAO_DE_REDE'
        process.nextTick(() => this.destroy(erro))
        return this
    }
}

/** Esquece as anotações (antes de cada teste). */
function zerar() { estado().violacoes.length = 0 }

/** Devolve e esquece as anotações (depois de cada teste). */
function colher() { return estado().violacoes.splice(0) }

function mensagem(violacoes, nomeDoTeste) {
    const linhas = violacoes.map((v) => `  - ${v.host}:${v.port}\n    ${v.pilha}`)
    return `O teste "${nomeDoTeste}" tentou abrir ${violacoes.length} conexão(ões) de rede. Teste não sai à internet: ` +
        `simule o fetch ou o módulo que fala com o serviço (veja scripts/jest/portao-de-rede.js).\n${linhas.join('\n')}`
}

module.exports = { instalar, zerar, colher, mensagem, destinoDe, LOOPBACK }
