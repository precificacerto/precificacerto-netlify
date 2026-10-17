/**
 * PORTÃO 5c.1 — a rota `/api/cash-entries/baixa`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * O `supabaseAdmin` é FALSO. Nada aqui fala com o Postgres: a RPC não é executada, o `GRANT`
 * não é exercido e a conta da redistribuição não roda. A RPC está provada pelo harness
 * (`scripts/harness/baixa-com-valor-diferente/`, 14 casos e 8 mutações num Postgres real) e
 * pelo catálogo de produção. O que ESTE portão prova é o que a ROTA decide: quem pode
 * chamar, com que autor e tenant, e para onde vai cada código de erro.
 *
 * A checagem de permissão é a REAL (`permissao-do-modulo.ts`); falsos são só o cliente e o
 * `getCallerContext`, que lê cookie e token.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */

import type { NextApiRequest, NextApiResponse } from 'next'

// ── O estado que cada caso monta ─────────────────────────────────────────────────────────
interface ChamadaRpc { nome: string; args: Record<string, unknown> }
interface ChamadaUpdate { tabela: string; payload: Record<string, unknown>; filtros: [string, string, unknown][] }

const estado: {
    caller: { user_id: string; tenant_id: string; role: string; is_super_admin: boolean } | null
    podeEditar: boolean
    rpc: ChamadaRpc[]
    updates: ChamadaUpdate[]
    respostaRpc: { data: unknown; error: unknown }
    linhasAfetadas: number
} = {
    caller: null, podeEditar: true, rpc: [], updates: [],
    respostaRpc: { data: null, error: null }, linhasAfetadas: 1,
}

jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async (_req: unknown, res: { status(n: number): { json(b: unknown): unknown } }) => {
        if (!estado.caller) { res.status(401).json({ error: 'Unauthorized' }); return null }
        return estado.caller
    },
}))

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        rpc: (nome: string, args: Record<string, unknown>) => {
            estado.rpc.push({ nome, args })
            return Promise.resolve(estado.respostaRpc)
        },
        from: (tabela: string) => {
            if (tabela === 'user_module_permissions') {
                const q: any = {
                    select: () => q, eq: () => q,
                    single: () => Promise.resolve({ data: { can_edit: estado.podeEditar }, error: null }),
                }
                return q
            }
            return {
                update: (payload: Record<string, unknown>) => {
                    const c: ChamadaUpdate = { tabela, payload, filtros: [] }
                    estado.updates.push(c)
                    const q: any = {
                        eq: (col: string, v: unknown) => { c.filtros.push(['eq', col, v]); return q },
                        is: (col: string, v: unknown) => { c.filtros.push(['is', col, v]); return q },
                        select: () => q,
                        then: (ok: (v: unknown) => unknown) => Promise.resolve(estado.linhasAfetadas < 0
                            ? { data: null, error: { code: '22P02', message: 'invalid input value for enum payment_method: "CARTAO_FIADO"' } }
                            : { data: Array.from({ length: estado.linhasAfetadas }, (_, i) => ({ id: `l${i}` })), error: null },
                        ).then(ok),
                    }
                    return q
                },
            }
        },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const handler = require('@/pages/api/cash-entries/baixa').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
import {
    DESTINO_DO_CODIGO, MOTIVOS, ROTA_DA_BAIXA, TEXTO_BAIXA_REGISTRADA,
    avisoDaBaixa, chamarBaixaPelaRota, destinoDaFormaInexistente, destinoDoErroDaRpc, lerCorpoDaBaixa, type BuscarRota,
} from '@/utils/baixa-pela-rota'
import { hojeNoFusoDoNegocio } from '@/utils/dia-de-hoje'

const SESSAO = { user_id: 'usuario-da-sessao', tenant_id: 'tenant-da-sessao', role: 'user', is_super_admin: false }
const P1 = '00000000-0000-0000-0000-0000000000c1'
const CORPO = { parcela_id: P1, forma: 'PIX', valor_pago: 80 }

/**
 * O RELÓGIO DO SERVIDOR É FIXADO num instante em que o dia UTC e o dia do negócio DIFEREM:
 * 02:00Z de 17/10 é 23:00 de 16/10 em São Paulo. Um `toISOString()` na rota daria 17; o
 * certo é 16. E o corpo manda uma TERCEIRA data, 2020-01-01 — as três são distintas, então o
 * caso diz de onde a data veio.
 */
const INSTANTE_DO_SERVIDOR = new Date('2026-10-17T02:00:00Z')
const DIA_DO_SERVIDOR = hojeNoFusoDoNegocio(INSTANTE_DO_SERVIDOR)
const DATA_FORJADA = '2020-01-01'

async function chamar(body: unknown, metodo = 'POST'): Promise<{ status: number; json: Record<string, unknown> }> {
    let status = 0
    let json: Record<string, unknown> = {}
    const res = {
        status(n: number) { status = n; return res },
        json(b: Record<string, unknown>) { json = b; return res },
    }
    await handler({ method: metodo, body, cookies: { token: 't' } } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

beforeAll(() => {
    // Só o relógio. Promessas, `nextTick` e microtarefas seguem reais — a rota é assíncrona.
    jest.useFakeTimers({ now: INSTANTE_DO_SERVIDOR, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] })
})
afterAll(() => { jest.useRealTimers() })

beforeEach(() => {
    estado.caller = { ...SESSAO }
    estado.podeEditar = true
    estado.rpc = []
    estado.updates = []
    estado.respostaRpc = { data: { success: true, reajustadas: 2 }, error: null }
    estado.linhasAfetadas = 1
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('PORTÃO 1 — sem `cash_flow.can_edit`, recusa E a RPC não é chamada', () => {
    // MUTAÇÃO: trocar `exigirPermissaoDeEdicao` por `getCallerContext` puro na rota.
    it('usuário sem permissão: 403, motivo SEM_PERMISSAO, zero RPC, zero UPDATE', async () => {
        estado.podeEditar = false
        const r = await chamar(CORPO)
        expect(r.status).toBe(403)
        expect(estado.rpc).toEqual([])
        expect(estado.updates).toEqual([])
    })

    it('o par: o MESMO usuário COM permissão chama a RPC — o caso acima discrimina', async () => {
        estado.podeEditar = true
        const r = await chamar(CORPO)
        expect(r.status).toBe(200)
        expect(estado.rpc).toHaveLength(1)
    })

    it('sem sessão: 401 e nada chamado', async () => {
        estado.caller = null
        const r = await chamar(CORPO)
        expect(r.status).toBe(401)
        expect(estado.rpc).toEqual([])
    })

    it('admin passa sem consultar a permissão — o mesmo critério de `cash-entries/update`', async () => {
        estado.caller = { ...SESSAO, role: 'admin' }
        estado.podeEditar = false
        const r = await chamar(CORPO)
        expect(r.status).toBe(200)
        expect(estado.rpc).toHaveLength(1)
    })

    it('GET não chama nada', async () => {
        const r = await chamar(CORPO, 'GET')
        expect(r.status).toBe(405)
        expect(estado.rpc).toEqual([])
    })
})

describe('PORTÃO 2 — autor e tenant vêm da SESSÃO; os do corpo são IGNORADOS', () => {
    // MUTAÇÃO: `p_usuario_id: req.body.p_usuario_id ?? caller.user_id` na rota.
    it('um corpo com autor e tenant forjados chega na RPC com os da sessão', async () => {
        await chamar({
            ...CORPO,
            p_usuario_id: 'forjado', usuario_id: 'forjado', criado_por: 'forjado',
            p_tenant_id: 'tenant-alheio', tenant_id: 'tenant-alheio',
        })
        expect(estado.rpc).toHaveLength(1)
        expect(estado.rpc[0].args.p_usuario_id).toBe(SESSAO.user_id)
        expect(estado.rpc[0].args.p_tenant_id).toBe(SESSAO.tenant_id)
        // e não sobrou nenhum valor forjado em argumento nenhum
        expect(Object.values(estado.rpc[0].args)).not.toContain('forjado')
        expect(Object.values(estado.rpc[0].args)).not.toContain('tenant-alheio')
    })

    it('os seis argumentos, com os nomes da assinatura aplicada', async () => {
        await chamar(CORPO)
        expect(estado.rpc[0]).toEqual({
            nome: 'dar_baixa_com_valor_diferente',
            args: {
                p_parcela_id: P1, p_tenant_id: SESSAO.tenant_id, p_usuario_id: SESSAO.user_id,
                p_valor_pago: 80, p_pago_em: DIA_DO_SERVIDOR, p_forma: 'PIX',
            },
        })
    })

    it('a baixa SIMPLES filtra pelo tenant da sessão, não pelo do corpo', async () => {
        const { valor_pago: _v, ...simples } = CORPO
        await chamar({ ...simples, tenant_id: 'tenant-alheio' })
        expect(estado.rpc).toEqual([])
        expect(estado.updates).toHaveLength(1)
        expect(estado.updates[0].filtros).toContainEqual(['eq', 'tenant_id', SESSAO.tenant_id])
        expect(estado.updates[0].filtros).not.toContainEqual(['eq', 'tenant_id', 'tenant-alheio'])
    })
})

describe('os dois caminhos', () => {
    it('sem `valor_pago`: UM update, as duas colunas da 5b, e nenhuma RPC', async () => {
        const { valor_pago: _v, ...simples } = CORPO
        const r = await chamar(simples)
        expect(r.status).toBe(200)
        expect(r.json).toEqual({ ok: true, modo: 'SIMPLES' })
        expect(estado.rpc).toEqual([])
        expect(estado.updates).toHaveLength(1)
        expect(Object.keys(estado.updates[0].payload)).toEqual(['paid_date', 'payment_method'])
        expect(estado.updates[0].filtros).toContainEqual(['is', 'paid_date', null])
    })

    it('baixa simples que não pega linha é JA_PAGA — o mesmo destino do PC004', async () => {
        estado.linhasAfetadas = 0
        const { valor_pago: _v, ...simples } = CORPO
        const r = await chamar(simples)
        expect(r.status).toBe(DESTINO_DO_CODIGO.PC004.status)
        expect(r.json.motivo).toBe(DESTINO_DO_CODIGO.PC004.motivo)
    })

    it('com `valor_pago`: devolve o resultado da RPC sem reinterpretar', async () => {
        const resultado = { success: true, delta: 20, reajustadas: 2, outras_em_aberto: 2 }
        estado.respostaRpc = { data: resultado, error: null }
        const r = await chamar(CORPO)
        expect(r.json).toEqual({ ok: true, modo: 'VALOR_DIFERENTE', resultado })
        expect(estado.updates).toEqual([])
    })

    it('corpo malformado não chega a nada: 400 ENTRADA_INVALIDA', async () => {
        for (const ruim of [null, {}, { ...CORPO, valor_pago: '80' }, { ...CORPO, parcela_id: '' }, { ...CORPO, parcela_id: 'p1' }, { ...CORPO, forma: 7 }]) {
            estado.rpc = []
            const r = await chamar(ruim)
            expect(r.status).toBe(400)
            expect(r.json.motivo).toBe('ENTRADA_INVALIDA')
            expect(estado.rpc).toEqual([])
        }
    })
})

describe('BLOQUEANTE 2 — forma AUSENTE não é escrita', () => {
    const { valor_pago: _v, forma: _f, ...semForma } = CORPO

    // MUTAÇÃO: a rota passar `forma: corpo.forma ?? null` para o UPDATE.
    it('baixa simples SEM forma: o UPDATE leva só `paid_date` — a coluna da forma fica fora', async () => {
        await chamar(semForma)
        expect(estado.updates).toHaveLength(1)
        expect(Object.keys(estado.updates[0].payload)).toEqual(['paid_date'])
        expect('payment_method' in estado.updates[0].payload).toBe(false)
    })

    it('forma `null` explícita é o MESMO pedido: não mexer', async () => {
        await chamar({ ...semForma, forma: null })
        expect('payment_method' in estado.updates[0].payload).toBe(false)
    })

    it('o par: COM forma, ela vai — o caso acima discrimina', async () => {
        await chamar({ ...semForma, forma: 'BOLETO' })
        expect(estado.updates[0].payload.payment_method).toBe('BOLETO')
    })

    it('na RPC, forma ausente chega como NULL — que o `coalesce` dela preserva', async () => {
        await chamar({ ...semForma, valor_pago: 80 })
        expect(estado.rpc[0].args.p_forma).toBeNull()
    })
})

describe('BLOQUEANTE 3 — a data é do SERVIDOR, no fuso do negócio', () => {
    it('as três datas do caso são distintas — senão ele não discrimina nada', () => {
        expect(DIA_DO_SERVIDOR).toBe('2026-10-16')
        expect(new Set([DIA_DO_SERVIDOR, INSTANTE_DO_SERVIDOR.toISOString().slice(0, 10), DATA_FORJADA]).size).toBe(3)
    })

    // MUTAÇÃO: `p_pago_em: req.body.pago_em ?? hojeNoFusoDoNegocio()` na rota.
    it('RPC: outra data no corpo, e o que chega é a do servidor', async () => {
        await chamar({ ...CORPO, pago_em: DATA_FORJADA })
        expect(estado.rpc[0].args.p_pago_em).toBe(DIA_DO_SERVIDOR)
    })

    // MUTAÇÃO: `toISOString().slice(0, 10)` no lugar de `hojeNoFusoDoNegocio()`.
    it('baixa simples: outra data no corpo, e o UPDATE grava a do servidor', async () => {
        const { valor_pago: _v, ...simples } = CORPO
        await chamar({ ...simples, pago_em: DATA_FORJADA })
        expect(estado.updates[0].payload.paid_date).toBe(DIA_DO_SERVIDOR)
    })
})

describe('ITEM 5 — forma fora do enum tem destino PRÓPRIO, e "desconhecido" segue sendo NÃO SEI', () => {
    // MEDIDO no harness: `22P02 invalid input value for enum payment_method: "CARTAO_FIADO"`,
    // igual na RPC e no UPDATE.
    const ERRO_DO_ENUM = { code: '22P02', message: 'invalid input value for enum payment_method: "CARTAO_FIADO"' }

    // MUTAÇÃO: tirar o `22P02` de `destinoDoErro` — cai no desconhecido.
    it('RPC: 400 FORMA_INEXISTENTE, nomeando a forma que veio NO CORPO', async () => {
        estado.respostaRpc = { data: null, error: ERRO_DO_ENUM }
        const r = await chamar({ ...CORPO, forma: 'CARTAO_FIADO' })
        expect(r.status).toBe(400)
        expect(r.json.motivo).toBe('FORMA_INEXISTENTE')
        expect(r.json.error).toBe(destinoDaFormaInexistente('CARTAO_FIADO').mensagem)
        expect(r.json.error).toContain('"CARTAO_FIADO"')
    })

    it('baixa simples: o mesmo destino', async () => {
        estado.linhasAfetadas = -1 // o UPDATE falso devolve o erro do enum
        const { valor_pago: _v, ...simples } = CORPO
        const r = await chamar({ ...simples, forma: 'CARTAO_FIADO' })
        expect(r.status).toBe(400)
        expect(r.json.motivo).toBe('FORMA_INEXISTENTE')
    })

    // MUTAÇÃO: aceitar `parcela_id` sem formato de uuid — o 22P02 do uuid viraria "forma".
    it('o 22P02 só identifica a forma porque o uuid é conferido ANTES', () => {
        expect(lerCorpoDaBaixa({ ...CORPO, parcela_id: 'nao-e-uuid' })).toBeNull()
        expect(lerCorpoDaBaixa(CORPO)).not.toBeNull()
    })

    it('outro código continua no desconhecido', async () => {
        estado.respostaRpc = { data: null, error: { code: '42501', message: 'permission denied' } }
        const r = await chamar(CORPO)
        expect(r.json.motivo).toBe('ERRO_DESCONHECIDO')
    })
})

describe('ITEM 4 — valor com mais de duas casas é RECUSADO pela rota', () => {
    // MEDIDO: com três casas a RPC e o cliente divergem no delta (`deltas.json`).
    // MUTAÇÃO: tirar `emCentavosExatos` de `lerCorpoDaBaixa`.
    it('1,005 · 1,015 · 9,995 → 400, e a RPC não é chamada', async () => {
        for (const valor of [1.005, 1.015, 9.995]) {
            estado.rpc = []
            const r = await chamar({ ...CORPO, valor_pago: valor })
            expect(r.status).toBe(400)
            expect(estado.rpc).toEqual([])
        }
    })

    it('o par: 1,01 e 0,1 + 0,2 passam — duas casas, mesmo com o ruído do float', async () => {
        for (const valor of [1.01, 0.1 + 0.2]) {
            estado.rpc = []
            await chamar({ ...CORPO, valor_pago: valor })
            expect(estado.rpc).toHaveLength(1)
        }
    })
})

describe('PORTÃO 4 — PC001..PC009: nove códigos, nove destinos, PELO CÓDIGO', () => {
    /**
     * A MENSAGEM DE CADA ERRO É A DE OUTRO CÓDIGO, de propósito. Uma rota que decidisse pelo
     * texto (`/ja esta paga/`) mandaria o PC001 para JA_PAGA. Só a decisão pelo `code` passa.
     */
    const MENSAGEM_ENGANOSA = 'Esta parcela ja esta paga. INVARIANTE VIOLADA. ultima parcela em aberto.'
    const ESPERADO: Record<string, { motivo: string; status: number }> = {
        PC001: { motivo: 'ENTRADA_INVALIDA', status: 400 },
        PC002: { motivo: 'PARCELA_FORA_DE_ALCANCE', status: 404 },
        PC003: { motivo: 'RESTANTE_NAO_POSITIVA', status: 422 },
        PC004: { motivo: 'JA_PAGA', status: 409 },
        PC005: { motivo: 'ULTIMA_EM_ABERTO', status: 422 },
        PC006: { motivo: 'SERIE_SOMA_ZERO', status: 422 },
        PC007: { motivo: 'SERIE_MUDOU', status: 409 },
        PC008: { motivo: 'VALOR_NULO_NO_BANCO', status: 500 },
        PC009: { motivo: 'INVARIANTE_VIOLADA', status: 500 },
    }

    for (const [codigo, esperado] of Object.entries(ESPERADO)) {
        // MUTAÇÃO: decidir pela mensagem, ou trocar o destino de um código.
        it(`${codigo} → ${esperado.motivo} (${esperado.status}), com mensagem enganosa`, async () => {
            estado.respostaRpc = { data: null, error: { code: codigo, message: MENSAGEM_ENGANOSA } }
            const r = await chamar(CORPO)
            expect(r.status).toBe(esperado.status)
            expect(r.json.motivo).toBe(esperado.motivo)
            expect(r.json.codigo).toBe(codigo)
            // A frase da tela é a do destino, nunca a do banco.
            expect(r.json.error).toBe(DESTINO_DO_CODIGO[codigo].mensagem)
            expect(r.json.error).not.toBe(MENSAGEM_ENGANOSA)
        })
    }

    it('os nove motivos são DISTINTOS entre si', () => {
        const motivos = Object.keys(ESPERADO).map((c) => DESTINO_DO_CODIGO[c].motivo)
        expect(new Set(motivos).size).toBe(9)
        expect(Object.keys(DESTINO_DO_CODIGO).sort()).toEqual(Object.keys(ESPERADO))
    })

    it('código fora dos nove cai no desconhecido — e não em "gravou"', async () => {
        estado.respostaRpc = { data: null, error: { code: '42501', message: 'Esta parcela ja esta paga.' } }
        const r = await chamar(CORPO)
        expect(r.status).toBe(500)
        expect(r.json.motivo).toBe('ERRO_DESCONHECIDO')
        expect(r.json.ok).toBe(false)
    })

    it('`destinoDoErroDaRpc` sem código não lê a mensagem', () => {
        expect(destinoDoErroDaRpc({ message: 'Esta parcela ja esta paga.' } as { code?: unknown }).motivo).toBe('ERRO_DESCONHECIDO')
        expect(MOTIVOS).toContain(destinoDoErroDaRpc(null).motivo)
    })
})

describe('a tela: a chamada e o aviso', () => {
    // O `fetch` falso devolve o que a rota devolveria.
    const buscarFalso = (status: number, json: unknown) => {
        const chamadas: { url: string; corpo: unknown }[] = []
        const buscar: BuscarRota = async (url, init) => {
            chamadas.push({ url, corpo: JSON.parse(init.body) })
            return { ok: status >= 200 && status < 300, status, json: async () => json }
        }
        return { buscar, chamadas }
    }

    it('a tela manda as chaves do contrato, e nenhum autor, tenant ou data', async () => {
        const { buscar, chamadas } = buscarFalso(200, { ok: true, modo: 'SIMPLES' })
        await chamarBaixaPelaRota(buscar, { parcela_id: P1, forma: 'PIX' })
        expect(chamadas[0].url).toBe(ROTA_DA_BAIXA)
        expect(Object.keys(chamadas[0].corpo as object).sort()).toEqual(['forma', 'parcela_id'])
    })

    it('JA_PAGA é AVISO, recusa é ERRO com o código, aceite é sucesso', async () => {
        const ja = await chamarBaixaPelaRota(buscarFalso(409, { ok: false, motivo: 'JA_PAGA', error: DESTINO_DO_CODIGO.PC004.mensagem, codigo: 'PC004' }).buscar,
            { parcela_id: P1 })
        expect(avisoDaBaixa(ja)).toEqual({ tipo: 'warning', texto: DESTINO_DO_CODIGO.PC004.mensagem })

        const ultima = await chamarBaixaPelaRota(buscarFalso(422, { ok: false, motivo: 'ULTIMA_EM_ABERTO', error: DESTINO_DO_CODIGO.PC005.mensagem, codigo: 'PC005' }).buscar,
            { parcela_id: P1, valor_pago: 10 })
        expect(avisoDaBaixa(ultima)).toEqual({ tipo: 'error', texto: `${DESTINO_DO_CODIGO.PC005.mensagem} [PC005]` })

        const aceita = await chamarBaixaPelaRota(buscarFalso(200, { ok: true, modo: 'SIMPLES' }).buscar,
            { parcela_id: P1 })
        expect(avisoDaBaixa(aceita)).toEqual({ tipo: 'success', texto: TEXTO_BAIXA_REGISTRADA })
    })

    it('resposta que não é JSON, ou 200 sem `ok`, NÃO vira "gravou"', async () => {
        const quebrado: BuscarRota = async () => ({ ok: true, status: 200, json: async () => { throw new Error('html') } })
        expect((await chamarBaixaPelaRota(quebrado, { parcela_id: P1 })).ok).toBe(false)
        const semOk = await chamarBaixaPelaRota(buscarFalso(200, { success: true }).buscar, { parcela_id: P1 })
        expect(semOk.ok).toBe(false)
        expect(avisoDaBaixa(semOk).tipo).toBe('error')
    })
})

describe('PORTÃO 3 — nenhum `.rpc(` nem escrita direta na ficha', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    function arquivos(dir: string): string[] {
        const abs = path.join(process.cwd(), dir)
        if (!fs.existsSync(abs)) return []
        return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) =>
            d.isDirectory() ? arquivos(path.join(dir, d.name)) : /\.(tsx?|jsx?)$/.test(d.name) ? [path.join(dir, d.name)] : [])
    }
    const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    const ALVOS = [...arquivos('src/pages/clientes'), ...arquivos('src/page-parts/clientes')]

    // O instrumento é testado antes de ser usado (`instrumento-que-nao-enxerga.md`): a mesma
    // função de varredura, sobre um texto que TEM a chamada, precisa achá-la.
    it('o detector enxerga `.rpc(` em todas as formas conhecidas', () => {
        const amostra = "supabase.rpc('x')\n(supabase as any)\n  .rpc('y')\nawait cliente . rpc ('z')"
        expect((semComentarios(amostra).match(/\.\s*rpc\s*\(/g) ?? []).length).toBe(3)
    })

    it('há arquivos a varrer — um diretório vazio deixaria o caso verde por construção', () => {
        expect(ALVOS.length).toBeGreaterThan(3)
        expect(ALVOS).toContain(path.join('src/page-parts/clientes', 'ficha-do-cliente.component.tsx'))
    })

    // MUTAÇÃO: `supabase.rpc('dar_baixa_com_valor_diferente', …)` na ficha.
    it('nenhum `.rpc(` em `src/pages/clientes` nem em `src/page-parts/clientes`', () => {
        const achados = ALVOS.filter((f) => /\.\s*rpc\s*\(/.test(semComentarios(fs.readFileSync(path.join(process.cwd(), f), 'utf-8'))))
        expect(achados).toEqual([])
    })

    // MUTAÇÃO: voltar a chamar `darBaixaNaParcela` com o cliente do browser.
    it('a ficha não escreve a baixa direto: não importa `darBaixaNaParcela`, e chama a rota', () => {
        const ficha = semComentarios(fs.readFileSync(path.join(process.cwd(), 'src/page-parts/clientes/ficha-do-cliente.component.tsx'), 'utf-8'))
        expect(ficha).not.toMatch(/\bdarBaixaNaParcela\b/)
        expect(ficha).toMatch(/chamarBaixaPelaRota\(/)
    })

    it('o cliente admin não é importado por nada que o browser carrega', () => {
        const browser = [...arquivos('src/page-parts'), ...arquivos('src/utils'), ...arquivos('src/hooks'), ...arquivos('src/components')]
            .filter((f) => !f.includes('__tests__'))
        const achados = browser.filter((f) => /supabase\/admin|permissao-do-modulo|get-caller-tenant/.test(semComentarios(fs.readFileSync(path.join(process.cwd(), f), 'utf-8'))))
        expect(achados).toEqual([])
    })
})
