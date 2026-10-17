/**
 * PORTÃO 5c.1 / 5c.2 — as rotas `/api/cash-entries/baixa` e `/api/cash-entries/baixa-em-lote`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * O `supabaseAdmin` é FALSO. Nada aqui fala com o Postgres: as funções não são executadas, o
 * `GRANT` não é exercido e nenhuma conta sobre dinheiro roda. As funções estão provadas pelo
 * harness (`scripts/harness/baixa-com-valor-diferente/`: 14 casos da …000001, 20 da …000003,
 * `deltas.sh` e `somas.sh`, num Postgres real) e pelo catálogo de produção. O que ESTE portão
 * prova é o que as ROTAS decidem: quem pode chamar, com que autor e tenant, que argumentos
 * chegam à função, e para onde vai cada código de erro.
 *
 * O `PC015` DO FALSO É A REGRA DA FUNÇÃO, IMITADA: `dar_baixa_em_lote` recusa quando
 * `cardinality(p_formas) <> cardinality(p_parcela_ids)`, e o falso faz o mesmo. É o que deixa a
 * mutação "uma forma a menos" aparecer aqui como recusa, e não como verde.
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
    /** As tabelas que a rota abriu com `.from()`. Só a de permissão é legítima. */
    froms: string[]
} = {
    caller: null, podeEditar: true, rpc: [], updates: [],
    respostaRpc: { data: null, error: null }, froms: [],
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
            if (nome === 'dar_baixa_em_lote') {
                const ids = args.p_parcela_ids as unknown[]
                const formas = args.p_formas as unknown[]
                if (!Array.isArray(formas) || formas.length !== ids.length) {
                    return Promise.resolve({ data: null, error: { code: 'PC015', message: 'O lote tem parcelas e formas de tamanhos diferentes.' } })
                }
            }
            return Promise.resolve(estado.respostaRpc)
        },
        from: (tabela: string) => {
            estado.froms.push(tabela)
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
                        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'l0' }], error: null }).then(ok),
                    }
                    return q
                },
            }
        },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const handler = require('@/pages/api/cash-entries/baixa').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
// eslint-disable-next-line @typescript-eslint/no-var-requires
const handlerDoLote = require('@/pages/api/cash-entries/baixa-em-lote').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
import {
    DESTINO_DO_CODIGO, LIMITE_DO_LOTE, MOTIVOS, ROTA_DA_BAIXA, ROTA_DO_LOTE, TEXTO_BAIXA_REGISTRADA,
    avisoDaBaixa, avisoDoLote, chamarBaixaPelaRota, chamarLotePelaRota, destinoDaFormaInexistente, destinoDoErroDaRpc,
    formasDoLote, lerCorpoDaBaixa, lerCorpoDoLote, type BuscarRota, type ResultadoDaBaixaSimples, type ResultadoDoLote,
} from '@/utils/baixa-pela-rota'
import { somarSelecionadas, type LinhaDeVencimento } from '@/utils/vencimentos-da-ficha'
import { formatBRL } from '@/utils/formatters'
import { hojeNoFusoDoNegocio } from '@/utils/dia-de-hoje'

const SESSAO = { user_id: 'usuario-da-sessao', tenant_id: 'tenant-da-sessao', role: 'user', is_super_admin: false }
const P1 = '00000000-0000-0000-0000-0000000000c1'
const P2 = '00000000-0000-0000-0000-0000000000c2'
const P3 = '00000000-0000-0000-0000-0000000000c3'
const CORPO = { parcela_id: P1, forma: 'PIX', valor_pago: 80 }
const { valor_pago: _vp, ...CORPO_SIMPLES } = CORPO
const LOTE = { parcela_ids: [P1, P2, P3], forma: 'PIX' }

/** O retorno de `dar_baixa_simples`, tipado como a …000003 o devolve. */
const RESULTADO_SIMPLES: ResultadoDaBaixaSimples = {
    success: true, parcela_id: P1, valor: 123.45, pago_em: '2026-10-16',
    operacao_id: '00000000-0000-0000-0000-0000000000f1', criado_por: 'usuario-da-sessao',
}
const RESULTADO_LOTE: ResultadoDoLote = {
    success: true, operacao_id: '00000000-0000-0000-0000-0000000000f2', gravadas: 3,
    ids: [P1, P2, P3], soma: 300.3, criado_por: 'usuario-da-sessao',
}

/**
 * O RELÓGIO DO SERVIDOR É FIXADO num instante em que o dia UTC e o dia do negócio DIFEREM:
 * 02:00Z de 17/10 é 23:00 de 16/10 em São Paulo. Um `toISOString()` na rota daria 17; o
 * certo é 16. E o corpo manda uma TERCEIRA data, 2020-01-01 — as três são distintas, então o
 * caso diz de onde a data veio.
 */
const INSTANTE_DO_SERVIDOR = new Date('2026-10-17T02:00:00Z')
const DIA_DO_SERVIDOR = hojeNoFusoDoNegocio(INSTANTE_DO_SERVIDOR)
const DATA_FORJADA = '2020-01-01'

async function chamarCom(h: typeof handler, body: unknown, metodo = 'POST'): Promise<{ status: number; json: Record<string, unknown> }> {
    let status = 0
    let json: Record<string, unknown> = {}
    const res = {
        status(n: number) { status = n; return res },
        json(b: Record<string, unknown>) { json = b; return res },
    }
    await h({ method: metodo, body, cookies: { token: 't' } } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}
const chamar = (body: unknown, metodo = 'POST') => chamarCom(handler, body, metodo)
const chamarLote = (body: unknown, metodo = 'POST') => chamarCom(handlerDoLote, body, metodo)

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
    estado.froms = []
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

    it('a baixa SIMPLES leva autor e tenant da sessão, não os do corpo', async () => {
        await chamar({ ...CORPO_SIMPLES, tenant_id: 'tenant-alheio', p_usuario_id: 'forjado' })
        expect(estado.rpc).toHaveLength(1)
        expect(estado.rpc[0].args.p_tenant_id).toBe(SESSAO.tenant_id)
        expect(estado.rpc[0].args.p_usuario_id).toBe(SESSAO.user_id)
    })

    it('o LOTE leva autor e tenant da sessão, não os do corpo', async () => {
        await chamarLote({ ...LOTE, tenant_id: 'tenant-alheio', p_usuario_id: 'forjado', usuario_id: 'forjado' })
        expect(estado.rpc).toHaveLength(1)
        expect(estado.rpc[0].args.p_tenant_id).toBe(SESSAO.tenant_id)
        expect(estado.rpc[0].args.p_usuario_id).toBe(SESSAO.user_id)
        expect(Object.values(estado.rpc[0].args)).not.toContain('forjado')
    })
})

describe('os dois caminhos', () => {
    it('sem `valor_pago`: `dar_baixa_simples` com os CINCO argumentos da assinatura aplicada', async () => {
        estado.respostaRpc = { data: RESULTADO_SIMPLES, error: null }
        const r = await chamar(CORPO_SIMPLES)
        expect(r.status).toBe(200)
        expect(r.json).toEqual({ ok: true, modo: 'SIMPLES', resultado: RESULTADO_SIMPLES })
        expect(estado.rpc).toEqual([{
            nome: 'dar_baixa_simples',
            args: { p_parcela_id: P1, p_tenant_id: SESSAO.tenant_id, p_usuario_id: SESSAO.user_id, p_pago_em: DIA_DO_SERVIDOR, p_forma: 'PIX' },
        }])
        expect(estado.updates).toEqual([])
    })

    it('baixa simples em parcela já paga: PC010 → JA_PAGA, o MESMO motivo do PC004', async () => {
        estado.respostaRpc = { data: null, error: { code: 'PC010', message: 'x' } }
        const r = await chamar(CORPO_SIMPLES)
        expect(r.status).toBe(409)
        expect(r.json.motivo).toBe(DESTINO_DO_CODIGO.PC004.motivo)
        expect(r.json.codigo).toBe('PC010')
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

    // MUTAÇÃO: a rota passar uma forma padrão (`?? 'DINHEIRO'`) no lugar de `?? null`.
    it('baixa simples SEM forma: `p_forma` chega NULL — que o `coalesce` da função preserva', async () => {
        await chamar(semForma)
        expect(estado.rpc[0].nome).toBe('dar_baixa_simples')
        expect(estado.rpc[0].args.p_forma).toBeNull()
    })

    it('forma `null` explícita é o MESMO pedido: não mexer', async () => {
        await chamar({ ...semForma, forma: null })
        expect(estado.rpc[0].args.p_forma).toBeNull()
    })

    it('o par: COM forma, ela vai — o caso acima discrimina', async () => {
        await chamar({ ...semForma, forma: 'BOLETO' })
        expect(estado.rpc[0].args.p_forma).toBe('BOLETO')
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
    it('baixa simples: outra data no corpo, e a função recebe a do servidor', async () => {
        await chamar({ ...CORPO_SIMPLES, pago_em: DATA_FORJADA })
        expect(estado.rpc[0].args.p_pago_em).toBe(DIA_DO_SERVIDOR)
    })

    it('lote: outra data no corpo, e a função recebe a do servidor', async () => {
        await chamarLote({ ...LOTE, pago_em: DATA_FORJADA })
        expect(estado.rpc[0].args.p_pago_em).toBe(DIA_DO_SERVIDOR)
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
        estado.respostaRpc = { data: null, error: ERRO_DO_ENUM }
        const r = await chamar({ ...CORPO_SIMPLES, forma: 'CARTAO_FIADO' })
        expect(r.status).toBe(400)
        expect(r.json.motivo).toBe('FORMA_INEXISTENTE')
    })

    it('lote: o mesmo destino, nomeando a forma do corpo', async () => {
        estado.respostaRpc = { data: null, error: ERRO_DO_ENUM }
        const r = await chamarLote({ ...LOTE, forma: 'CARTAO_FIADO' })
        expect(r.status).toBe(400)
        expect(r.json.error).toBe(destinoDaFormaInexistente('CARTAO_FIADO').mensagem)
    })

    it('lote: o 22P02 só identifica a forma porque CADA id é conferido como uuid antes', () => {
        expect(lerCorpoDoLote({ parcela_ids: [P1, 'nao-e-uuid'] })).toBeNull()
        expect(lerCorpoDoLote({ parcela_ids: [P1, P2] })).not.toBeNull()
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

describe('PORTÃO 3 (5c.2) — PC001..PC016: dezesseis códigos, PELO CÓDIGO, nunca pelo texto', () => {
    /**
     * A MENSAGEM DE CADA ERRO É A DE OUTRO CÓDIGO, de propósito. Uma rota que decidisse pelo
     * texto (`/ja esta paga/`) mandaria o PC012 para JA_PAGA. Só a decisão pelo `code` passa.
     */
    const MENSAGEM_ENGANOSA = 'A parcela ja esta paga. O lote esta vazio. O lote nao fechou. ultima parcela em aberto.'
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
    /** Os sete da …000003 — sete casos, sete destinos. */
    const ESPERADO_DA_000003: Record<string, { motivo: string; status: number }> = {
        PC010: { motivo: 'JA_PAGA', status: 409 },
        PC011: { motivo: 'PARCELA_NAO_ENCONTRADA', status: 404 },
        PC012: { motivo: 'LOTE_VAZIO', status: 400 },
        PC013: { motivo: 'LOTE_COM_REPETIDA', status: 400 },
        PC014: { motivo: 'LOTE_ACIMA_DO_LIMITE', status: 400 },
        PC015: { motivo: 'LOTE_FORMAS_DESALINHADAS', status: 400 },
        PC016: { motivo: 'LOTE_NAO_FECHOU', status: 500 },
    }

    for (const [codigo, esperado] of Object.entries(ESPERADO)) {
        // MUTAÇÃO: decidir pela mensagem, ou trocar o destino de um código.
        it(`${codigo} → ${esperado.motivo} (${esperado.status}), com mensagem enganosa`, async () => {
            estado.respostaRpc = { data: null, error: { code: codigo, message: MENSAGEM_ENGANOSA } }
            const r = await chamar(CORPO)
            expect(r.status).toBe(esperado.status)
            expect(r.json.motivo).toBe(esperado.motivo)
            expect(r.json.codigo).toBe(codigo)
            expect(r.json.error).toBe(DESTINO_DO_CODIGO[codigo].mensagem)
            expect(r.json.error).not.toBe(MENSAGEM_ENGANOSA)
        })
    }

    // Os sete pela ROTA DO LOTE, que é por onde a maioria deles sai. O PC010 e o PC011 saem
    // também da simples — o caso abaixo os passa pelas duas.
    for (const [codigo, esperado] of Object.entries(ESPERADO_DA_000003)) {
        it(`lote: ${codigo} → ${esperado.motivo} (${esperado.status}), com mensagem enganosa`, async () => {
            estado.respostaRpc = { data: null, error: { code: codigo, message: MENSAGEM_ENGANOSA } }
            const r = await chamarLote(LOTE)
            expect(r.status).toBe(esperado.status)
            expect(r.json.motivo).toBe(esperado.motivo)
            expect(r.json.codigo).toBe(codigo)
            expect(r.json.error).toBe(DESTINO_DO_CODIGO[codigo].mensagem)
            expect(r.json.error).not.toBe(MENSAGEM_ENGANOSA)
        })
    }

    it('simples: PC010 e PC011 têm o mesmo destino que no lote', async () => {
        for (const codigo of ['PC010', 'PC011']) {
            estado.respostaRpc = { data: null, error: { code: codigo, message: MENSAGEM_ENGANOSA } }
            const r = await chamar(CORPO_SIMPLES)
            expect(r.json.motivo).toBe(ESPERADO_DA_000003[codigo].motivo)
            expect(r.status).toBe(ESPERADO_DA_000003[codigo].status)
        }
    })

    it('os sete motivos da …000003 são DISTINTOS entre si — sete destinos, não seis', () => {
        const motivos = Object.keys(ESPERADO_DA_000003).map((c) => DESTINO_DO_CODIGO[c].motivo)
        expect(new Set(motivos).size).toBe(7)
    })

    it('os nove da …000001 são DISTINTOS entre si', () => {
        const motivos = Object.keys(ESPERADO).map((c) => DESTINO_DO_CODIGO[c].motivo)
        expect(new Set(motivos).size).toBe(9)
    })

    it('o mapa tem EXATAMENTE os dezesseis — nem um a mais, nem um a menos', () => {
        expect(Object.keys(DESTINO_DO_CODIGO).sort()).toEqual([...Object.keys(ESPERADO), ...Object.keys(ESPERADO_DA_000003)].sort())
    })

    // A frase do PC016 é a de um INVARIANTE: diz que nada foi gravado e manda ao suporte.
    it('PC016 tem destino próprio e diz que NADA foi gravado', () => {
        const d = DESTINO_DO_CODIGO.PC016
        expect(d.status).toBe(500)
        expect(d.mensagem).toMatch(/NADA foi gravado/)
        expect(d.mensagem).toMatch(/suporte/)
    })

    it('código fora dos dezesseis cai no desconhecido — e não em "gravou"', async () => {
        estado.respostaRpc = { data: null, error: { code: '42501', message: 'A parcela ja esta paga.' } }
        const r = await chamar(CORPO)
        expect(r.status).toBe(500)
        expect(r.json.motivo).toBe('ERRO_DESCONHECIDO')
        expect(r.json.ok).toBe(false)
        const l = await chamarLote(LOTE)
        expect(l.json.motivo).toBe('ERRO_DESCONHECIDO')
    })

    it('`destinoDoErroDaRpc` sem código não lê a mensagem', () => {
        expect(destinoDoErroDaRpc({ message: 'A parcela ja esta paga.' } as { code?: unknown }).motivo).toBe('ERRO_DESCONHECIDO')
        expect(MOTIVOS).toContain(destinoDoErroDaRpc(null).motivo)
    })

    // O texto do código não é lido nem para decidir que é o PC014 — o limite vem da constante.
    it('o PC014 diz o limite pelo número da constante, não por um literal', () => {
        expect(DESTINO_DO_CODIGO.PC014.mensagem).toContain(String(LIMITE_DO_LOTE))
    })
})

describe('PORTÃO 1 (5c.2) — as rotas NÃO têm UPDATE em `cash_entries`', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    const ROTAS = ['src/pages/api/cash-entries/baixa.ts', 'src/pages/api/cash-entries/baixa-em-lote.ts']
    const ESCRITA = /\.\s*(update|upsert|insert|delete)\s*\(|from\s*\(\s*['"`]cash_entries['"`]|darBaixaNaParcela|montarPayloadDaBaixa/

    // O instrumento é testado antes de ser usado (`instrumento-que-nao-enxerga.md`).
    it('o detector enxerga as formas conhecidas de escrita direta', () => {
        for (const amostra of [
            "supabaseAdmin.from('cash_entries').update(p)",
            "(supabaseAdmin as any)\n  .from(\"cash_entries\")",
            'await darBaixaNaParcela({ cliente })',
            'x . update (p)',
        ]) expect(ESCRITA.test(semComentarios(amostra))).toBe(true)
        // e não acusa o que é só comentário
        expect(ESCRITA.test(semComentarios("// supabaseAdmin.from('cash_entries').update(p)"))).toBe(false)
    })

    // MUTAÇÃO: reintroduzir `darBaixaNaParcela` (ou um `.from('cash_entries').update`) na rota.
    for (const rota of ROTAS) {
        it(`ESTÁTICO: ${rota} não escreve em tabela nenhuma — só chama função`, () => {
            const texto = semComentarios(fs.readFileSync(path.join(process.cwd(), rota), 'utf-8'))
            expect(texto).toMatch(/\.rpc\(/)
            expect(texto.match(ESCRITA)).toBeNull()
        })
    }

    it('DINÂMICO: em todos os caminhos, a única tabela aberta é a de permissão — e nenhum update', async () => {
        estado.caller = { ...SESSAO, role: 'user' }
        await chamar(CORPO_SIMPLES)
        await chamar(CORPO)
        await chamar({ ...CORPO_SIMPLES, forma: null })
        await chamarLote(LOTE)
        await chamarLote({ parcela_ids: [P1] })
        expect(estado.rpc.map((c) => c.nome)).toEqual([
            'dar_baixa_simples', 'dar_baixa_com_valor_diferente', 'dar_baixa_simples', 'dar_baixa_em_lote', 'dar_baixa_em_lote',
        ])
        expect(estado.updates).toEqual([])
        expect(new Set(estado.froms)).toEqual(new Set(['user_module_permissions']))
    })

    it('`darBaixaNaParcela` não existe mais em `src` — a segunda via saiu, não ficou dormente', () => {
        const mod = require('@/utils/baixa-de-parcela') as Record<string, unknown>
        expect(mod.darBaixaNaParcela).toBeUndefined()
        expect(typeof mod.montarPayloadDaBaixa).toBe('function') // o fluxo de caixa segue com o dele
    })
})

describe('A ROTA DO LOTE', () => {
    it('os cinco argumentos da assinatura aplicada, na ordem dos ids do corpo', async () => {
        estado.respostaRpc = { data: RESULTADO_LOTE, error: null }
        const r = await chamarLote(LOTE)
        expect(r.status).toBe(200)
        expect(r.json).toEqual({ ok: true, modo: 'LOTE', resultado: RESULTADO_LOTE })
        expect(estado.rpc).toEqual([{
            nome: 'dar_baixa_em_lote',
            args: {
                p_parcela_ids: [P1, P2, P3], p_tenant_id: SESSAO.tenant_id, p_usuario_id: SESSAO.user_id,
                p_pago_em: DIA_DO_SERVIDOR, p_formas: ['PIX', 'PIX', 'PIX'],
            },
        }])
    })

    it('sem `cash_flow.can_edit`: 403 e a função não é chamada', async () => {
        estado.podeEditar = false
        const r = await chamarLote(LOTE)
        expect(r.status).toBe(403)
        expect(estado.rpc).toEqual([])
    })

    it('GET não chama nada', async () => {
        const r = await chamarLote(LOTE, 'GET')
        expect(r.status).toBe(405)
        expect(estado.rpc).toEqual([])
    })

    it('corpo malformado não chega à função: 400 ENTRADA_INVALIDA', async () => {
        for (const ruim of [null, {}, { parcela_ids: P1 }, { parcela_ids: [P1, 7] }, { parcela_ids: ['p1'] }, { ...LOTE, forma: 7 }]) {
            estado.rpc = []
            const r = await chamarLote(ruim)
            expect(r.status).toBe(400)
            expect(r.json.motivo).toBe('ENTRADA_INVALIDA')
            expect(estado.rpc).toEqual([])
        }
    })

    // Vazio, repetida e acima de 50 são REGRA DA FUNÇÃO: a rota as deixa passar, e a função recusa.
    it('vazio, repetida e 51 CHEGAM à função — a regra é dela, não uma segunda cópia na rota', async () => {
        const muitos = Array.from({ length: LIMITE_DO_LOTE + 1 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`)
        for (const ids of [[], [P1, P1], muitos]) {
            estado.rpc = []
            await chamarLote({ parcela_ids: ids })
            expect(estado.rpc).toHaveLength(1)
            expect(estado.rpc[0].args.p_parcela_ids).toEqual(ids)
        }
    })

    it('a parcela que travou o lote vem do DETAIL — e só quando é um uuid', async () => {
        estado.respostaRpc = { data: null, error: { code: 'PC010', message: 'x', details: P2 } }
        expect((await chamarLote(LOTE)).json.parcela_id).toBe(P2)

        estado.respostaRpc = { data: null, error: { code: 'PC010', message: 'x', details: 'Failing row contains (...)' } }
        expect('parcela_id' in (await chamarLote(LOTE)).json).toBe(false)
    })
})

describe('PORTÃO 4 (5c.2) — `p_formas` SEMPRE com a cardinalidade dos ids', () => {
    const IDS = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`)

    for (const n of [1, 3, LIMITE_DO_LOTE]) {
        for (const forma of [undefined, null, 'PIX'] as const) {
            it(`${n} ids, forma ${forma === undefined ? 'ausente' : JSON.stringify(forma)}: ${n} formas`, async () => {
                const corpo: Record<string, unknown> = { parcela_ids: IDS(n) }
                if (forma !== undefined) corpo.forma = forma
                const r = await chamarLote(corpo)
                const formas = estado.rpc[0].args.p_formas as unknown[]
                expect(formas).toHaveLength(n)
                expect(new Set(formas)).toEqual(new Set([typeof forma === 'string' ? forma : null]))
                // O falso imita o PC015 da função: se a cardinalidade divergisse, seria recusa.
                expect(r.json.codigo).toBeUndefined()
                expect(r.status).toBe(200)
            })
        }
    }

    // O instrumento: o falso de fato recusa quando a cardinalidade diverge — senão os casos
    // acima seriam verdes por construção.
    it('o falso recusa com PC015 quando as formas têm um elemento a menos', async () => {
        const { supabaseAdmin } = require('@/supabase/admin') as { supabaseAdmin: { rpc(n: string, a: object): Promise<{ error: { code: string } | null }> } }
        const r = await supabaseAdmin.rpc('dar_baixa_em_lote', { p_parcela_ids: [P1, P2], p_formas: ['PIX'] })
        expect(r.error?.code).toBe('PC015')
    })

    it('o corpo não tem como mandar as formas: uma chave `formas` é ignorada', async () => {
        await chamarLote({ ...LOTE, formas: ['PIX'], p_formas: ['PIX'] })
        expect(estado.rpc[0].args.p_formas).toEqual(['PIX', 'PIX', 'PIX'])
    })

    it('`formasDoLote`, a função pura: o mesmo comprimento em todo caso', () => {
        expect(formasDoLote([], 'PIX')).toEqual([])
        expect(formasDoLote([P1, P2], null)).toEqual([null, null])
        expect(formasDoLote([P1, P2], undefined)).toEqual([null, null])
        expect(formasDoLote([P1, P2], 'BOLETO')).toEqual(['BOLETO', 'BOLETO'])
    })
})

describe('PORTÃO 2 (5c.2) — a soma da TELA é a `soma` que a função devolve, sobre as MESMAS parcelas', () => {
    /**
     * `somas.json` é lido pelos DOIS lados. O do banco é `somas.sh`, que roda `dar_baixa_em_lote`
     * sobre cada lote num Postgres real e confere a `soma` devolvida contra a coluna `soma`. Este
     * caso confere a autossoma da 5a contra a MESMA coluna. As duas iguais à tabela ⇒ iguais
     * entre si, para estes lotes.
     */
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const tabela = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/harness/baixa-com-valor-diferente/somas.json'), 'utf-8')) as {
        lotes: { nome: string; valores: string[]; soma: string }[]
    }
    const linha = (i: number, valor: number): LinhaDeVencimento => ({
        id: `p${i}`, saleId: `s${i % 3}`, codigoDaVenda: `VD-${i % 3}`, numero: 1, de: 1, vencimento: '2026-10-10',
        valor, estado: 'A_VENCER', diasDeAtraso: null, pagaEm: null, selecionavel: true,
    })

    it('a tabela tem lotes, e um deles no teto — senão o caso seria verde por construção', () => {
        expect(tabela.lotes.length).toBeGreaterThan(4)
        expect(tabela.lotes.some((l) => l.valores.length === LIMITE_DO_LOTE)).toBe(true)
    })

    for (const lote of tabela.lotes) {
        it(`${lote.nome}: tela ${lote.soma}`, () => {
            const linhas = lote.valores.map((v, i) => linha(i, Number(v)))
            const soma = somarSelecionadas(linhas, linhas.map((l) => l.id))
            expect(soma).toBe(Number(lote.soma))
            // O que a pessoa LÊ é o formatado: o rodapé e a confirmação usam o mesmo `formatBRL`.
            expect(formatBRL(soma)).toBe(formatBRL(Number(lote.soma)))
        })
    }

    // O instrumento: a soma ingênua em float erra em ao menos um lote da tabela. Sem isso, a
    // tabela não discriminaria `somarSelecionadas` de um `reduce` qualquer.
    it('a tabela DISCRIMINA: uma soma ingênua em float erra em ao menos um lote', () => {
        const erram = tabela.lotes.filter((l) => l.valores.reduce((a, v) => a + Number(v), 0) !== Number(l.soma))
        expect(erram.length).toBeGreaterThan(0)
    })
})

describe('o teto do lote é o MESMO número da função', () => {
    // MUTAÇÃO: `LIMITE_DO_LOTE = 51` — a tela deixaria passar o que a função recusa.
    it('`LIMITE_DO_LOTE` é o `IF v_n > N` de `dar_baixa_em_lote`, lido do arquivo da migração', () => {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261017000003_baixa_simples_e_em_lote.sql'), 'utf-8')
        const tetos = [...sql.matchAll(/IF\s+v_n\s*>\s*(\d+)\s+THEN/gi)].map((m) => Number(m[1]))
        expect(tetos).toEqual([LIMITE_DO_LOTE])
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
        const { buscar, chamadas } = buscarFalso(200, { ok: true, modo: 'SIMPLES', resultado: RESULTADO_SIMPLES })
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

        const aceita = await chamarBaixaPelaRota(buscarFalso(200, { ok: true, modo: 'SIMPLES', resultado: RESULTADO_SIMPLES }).buscar,
            { parcela_id: P1 })
        expect(avisoDaBaixa(aceita)).toEqual({ tipo: 'success', texto: TEXTO_BAIXA_REGISTRADA })
    })

    it('200 SIMPLES sem `resultado` NÃO vira "gravou" — a função sempre devolve o jsonb', async () => {
        const sem = await chamarBaixaPelaRota(buscarFalso(200, { ok: true, modo: 'SIMPLES' }).buscar, { parcela_id: P1 })
        expect(sem.ok).toBe(false)
    })

    it('lote: a tela manda só `parcela_ids` e `forma`, para a rota do lote', async () => {
        const { buscar, chamadas } = buscarFalso(200, { ok: true, modo: 'LOTE', resultado: RESULTADO_LOTE })
        await chamarLotePelaRota(buscar, { parcela_ids: [P1, P2], forma: null })
        expect(chamadas[0].url).toBe(ROTA_DO_LOTE)
        expect(Object.keys(chamadas[0].corpo as object).sort()).toEqual(['forma', 'parcela_ids'])
    })

    it('lote aceito: o aviso usa `gravadas` e `soma` DA FUNÇÃO, não a conta da tela', async () => {
        const r = await chamarLotePelaRota(buscarFalso(200, { ok: true, modo: 'LOTE', resultado: RESULTADO_LOTE }).buscar, { parcela_ids: [P1] })
        expect(avisoDoLote(r, (id) => id)).toEqual({
            tipo: 'success',
            texto: `Baixa registrada em ${RESULTADO_LOTE.gravadas} parcelas, somando ${formatBRL(RESULTADO_LOTE.soma)}.`,
        })
    })

    it('lote recusado: a frase do destino, a parcela que travou ROTULADA, e o código', async () => {
        const r = await chamarLotePelaRota(buscarFalso(409, {
            ok: false, motivo: 'JA_PAGA', error: DESTINO_DO_CODIGO.PC010.mensagem, codigo: 'PC010', parcela_id: P2,
        }).buscar, { parcela_ids: [P1, P2] })
        const rotular = (id: string) => (id === P2 ? '2 de 5 · VD-9' : '?')
        expect(avisoDoLote(r, rotular)).toEqual({
            tipo: 'error',
            texto: `${DESTINO_DO_CODIGO.PC010.mensagem} Parcela que travou o lote: 2 de 5 · VD-9. [PC010]`,
        })
    })

    it('lote: resposta que não é JSON, ou 200 sem `resultado`, NÃO vira "gravou"', async () => {
        const quebrado: BuscarRota = async () => ({ ok: true, status: 200, json: async () => { throw new Error('html') } })
        expect((await chamarLotePelaRota(quebrado, { parcela_ids: [P1] })).ok).toBe(false)
        expect((await chamarLotePelaRota(buscarFalso(200, { ok: true, modo: 'LOTE' }).buscar, { parcela_ids: [P1] })).ok).toBe(false)
        expect((await chamarLotePelaRota(buscarFalso(200, { ok: true, modo: 'SIMPLES', resultado: RESULTADO_SIMPLES }).buscar, { parcela_ids: [P1] })).ok).toBe(false)
    })

    it('resposta que não é JSON, ou 200 sem `ok`, NÃO vira "gravou"', async () => {
        const quebrado: BuscarRota = async () => ({ ok: true, status: 200, json: async () => { throw new Error('html') } })
        expect((await chamarBaixaPelaRota(quebrado, { parcela_id: P1 })).ok).toBe(false)
        const semOk = await chamarBaixaPelaRota(buscarFalso(200, { success: true }).buscar, { parcela_id: P1 })
        expect(semOk.ok).toBe(false)
        expect(avisoDaBaixa(semOk).tipo).toBe('error')
    })
})

describe('PORTÃO 3 (5c.1) — nenhum `.rpc(` nem escrita direta na ficha', () => {
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
    it('a ficha não escreve a baixa direto: não importa `darBaixaNaParcela`, e chama as rotas', () => {
        const ficha = semComentarios(fs.readFileSync(path.join(process.cwd(), 'src/page-parts/clientes/ficha-do-cliente.component.tsx'), 'utf-8'))
        expect(ficha).not.toMatch(/\bdarBaixaNaParcela\b/)
        expect(ficha).toMatch(/chamarBaixaPelaRota\(/)
        expect(ficha).toMatch(/chamarLotePelaRota\(/)
    })

    it('o cliente admin não é importado por nada que o browser carrega', () => {
        const browser = [...arquivos('src/page-parts'), ...arquivos('src/utils'), ...arquivos('src/hooks'), ...arquivos('src/components')]
            .filter((f) => !f.includes('__tests__'))
        const achados = browser.filter((f) => /supabase\/admin|permissao-do-modulo|get-caller-tenant/.test(semComentarios(fs.readFileSync(path.join(process.cwd(), f), 'utf-8'))))
        expect(achados).toEqual([])
    })
})
