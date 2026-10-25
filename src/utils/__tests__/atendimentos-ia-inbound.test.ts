/**
 * @jest-environment node
 *
 * PORTÃO — a rota de ENTRADA do Atendimentos I.A. (`POST /api/atendimentos-ia/inbound`) e o
 * leitor do payload do WUZAPI (`src/lib/atendimentos-ia/payload-wuzapi.ts`).
 *
 * O banco é FALSO e em memória, e REGISTRA cada operação — até a CRIAÇÃO de uma consulta
 * (`from`): os portões afirmam pelo que foi LIDO e GRAVADO, não pelo que a rota respondeu. Ele
 * imita a UNIQUE parcial que importa aqui: `orcamentista_tentativa_desconhecida (tenant_id,
 * wuzapi_mensagem_id) WHERE wuzapi_mensagem_id IS NOT NULL`.
 *
 * A CONVERSA é FALSA (`conduzirMensagem`, de `conversa-da-ia.ts`): este portão afirma QUEM a rota
 * entrega a ela e COM O QUÊ. O que a conversa faz com a mensagem é de
 * `atendimentos-ia-levantamento-por-nome.test.ts`.
 *
 * DECISÃO 4 DO DONO DO PRODUTO (25/10/2026): a entrada para de gravar o texto. Nenhuma linha nova
 * em `orcamentista_conversa` nem em `orcamentista_mensagem` — o estado mora no levantamento. A
 * consequência, afirmada no bloco (7): sem a linha da mensagem não há como reconhecer o reenvio do
 * WUZAPI, e o mesmo `Info.ID` é conduzido de novo.
 *
 * O `c` da URL é `whatsapp_conexao.webhook_segredo` (hexadecimal, 32 a 64), NUNCA o
 * `wuzapi_token`: o token é a credencial do WUZAPI, e URL cai em log de acesso.
 *
 * O payload segue o formato MEDIDO em produção em 21/10/2026 (JSON com a chave `event`; o
 * remetente em `Info.Sender` é LID, o telefone vem em `Info.SenderAlt`).
 *
 * O que NÃO alcança: o Postgres real e o WUZAPI real.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>

const TOKEN = 'orc_TOKEN_DA_CONEXAO_9f8e7d'
const TOKEN_ENVIO = 'tok_DA_CONEXAO_DE_ENVIO_1a2b'
// O `c` da URL: whatsapp_conexao.webhook_segredo — CHECK '^[0-9a-f]{32,64}$'.
const SEGREDO = '0123456789abcdef0123456789abcdef'
const SEGREDO_ENVIO = 'fedcba9876543210fedcba9876543210fedcba98'
const TENANT = 'tenant-da-conexao'
const OUTRO_TENANT = 'tenant-de-outra-conta'
const AUTORIZADO_ID = 'remetente-1'
// O webhook entrega COM o DDI; a lista grava SEM ele (`telefoneDoAutorizado`).
const TELEFONE_DO_WEBHOOK = '5551999887766'
const TELEFONE_GRAVADO = '51999887766'
const TEXTO = 'Oi beleza, quero um orçamento'

const estado = {
    db: {} as Record<string, Linha[]>,
    escritas: [] as Array<{ tabela: string; op: string; carga: unknown }>,
    /** Toda consulta CRIADA no banco (`from(tabela)`), lida ou não. */
    consultas: [] as string[],
    falhaNoInsert: null as string | null,
    /** O código do erro que `falhaNoInsert` devolve — 23505 é a UNIQUE. */
    codigoDaFalha: '23505',
}

function montar() {
    estado.db = {
        whatsapp_conexao: [
            // ativo = false DE PROPÓSITO: a coluna é o retrato da última checagem da tela, não um
            // interruptor — a entrada não a confere (o interruptor é orcamentista_config.ativo).
            { id: 'c1', tenant_id: TENANT, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN, webhook_segredo: SEGREDO, ativo: false },
            { id: 'c2', tenant_id: TENANT, canal: 'ENVIO', wuzapi_token: TOKEN_ENVIO, webhook_segredo: SEGREDO_ENVIO, ativo: true },
        ],
        orcamentista_config: [{ tenant_id: TENANT, ativo: true }],
        orcamentista_remetente_autorizado: [
            { id: AUTORIZADO_ID, tenant_id: TENANT, telefone: TELEFONE_GRAVADO, ativo: true },
        ],
        orcamentista_conversa: [],
        orcamentista_mensagem: [],
        orcamentista_tentativa_desconhecida: [],
    }
    estado.escritas = []
    estado.consultas = []
    estado.falhaNoInsert = null
    estado.codigoDaFalha = '23505'
}

let sequencia = 0
function inserir(tabela: string, carga: Linha): { data: Linha | null; error: { code: string; message: string } | null } {
    estado.escritas.push({ tabela, op: 'insert', carga })
    if (estado.falhaNoInsert === tabela) return { data: null, error: { code: estado.codigoDaFalha, message: `falha simulada (${estado.codigoDaFalha})` } }
    const linhas = (estado.db[tabela] ??= [])
    if (tabela === 'orcamentista_tentativa_desconhecida' && carga.wuzapi_mensagem_id != null
        && linhas.some((l) => l.tenant_id === carga.tenant_id && l.wuzapi_mensagem_id === carga.wuzapi_mensagem_id)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "orcamentista_tentativa_desconhecida_unica"' } }
    }
    sequencia += 1
    const nova: Linha = { id: `${tabela}-${sequencia}`, criado_em: new Date(Date.UTC(2026, 9, 22, 0, 0, sequencia)).toISOString(), ...carga }
    linhas.push(nova)
    return { data: nova, error: null }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            estado.consultas.push(tabela)
            const filtros: Array<[string, unknown]> = []
            let ordem: { coluna: string; asc: boolean } | null = null
            let limite: number | null = null
            const ler = () => {
                let linhas = (estado.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v))
                if (ordem) {
                    const { coluna, asc } = ordem
                    linhas = [...linhas].sort((a, b) => (String(a[coluna]) < String(b[coluna]) ? -1 : 1) * (asc ? 1 : -1))
                }
                if (limite !== null) linhas = linhas.slice(0, limite)
                return linhas
            }
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem = { coluna: c, asc: o?.ascending !== false }; return q }
            q.limit = (n: number) => { limite = n; return q }
            q.maybeSingle = async (): Promise<{ data: Linha | null; error: null }> => ({ data: ler()[0] ?? null, error: null })
            // a consulta de LISTA, aguardada sem maybeSingle — devolve todas as linhas que casam
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: ler(), error: null }).then(ok, erro)
            q.insert = (carga: Linha) => {
                const r = inserir(tabela, carga)
                const resposta = {
                    select: () => ({ single: async () => r }),
                    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: null, error: r.error }).then(ok, erro),
                }
                return resposta
            }
            for (const proibido of ['update', 'upsert', 'delete']) {
                q[proibido] = () => { throw new Error(`a rota de entrada não pode ${proibido} em ${tabela}`) }
            }
            return q
        },
    },
}))

/** Cada entrega da rota à conversa, com os argumentos como chegaram. */
const mockConducoes: Array<Record<string, unknown>> = []
jest.mock('@/lib/atendimentos-ia/conversa-da-ia', () => ({
    conduzirMensagem: async (a: Record<string, unknown>) => { mockConducoes.push(a) },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/atendimentos-ia/inbound').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { telefoneDoRemetente, textoDaMensagem } = require('@/lib/atendimentos-ia/payload-wuzapi') as {
    telefoneDoRemetente: (info: unknown) => string | null
    textoDaMensagem: (event: unknown) => string | null
}

type Evento = { Info: Record<string, unknown>; Message: Record<string, unknown> }
function evento(sobre: { info?: Record<string, unknown>; message?: Record<string, unknown> } = {}): Evento {
    return {
        Info: {
            ID: '3EB0FC924E6F69C6AA4CBB',
            Chat: '123456789012345@lid',
            Sender: '123456789012345:33@lid',
            SenderAlt: `${TELEFONE_DO_WEBHOOK}:33@s.whatsapp.net`,
            PushName: 'Felipe Klein',
            Timestamp: '2026-10-21T22:48:32-03:00',
            Type: 'text',
            IsFromMe: false,
            IsGroup: false,
            ...sobre.info,
        },
        Message: sobre.message ?? { conversation: TEXTO },
    }
}

async function chamar(opcoes: { c?: string; corpo?: unknown; metodo?: string } = {}) {
    const saida = { status: 0 }
    const res = {
        status(n: number) { saida.status = n; return res },
        json() { return res },
        end() { return res },
        setHeader() { return res },
    } as unknown as NextApiResponse
    const req = {
        method: opcoes.metodo ?? 'POST',
        query: opcoes.c === undefined ? {} : { c: opcoes.c },
        headers: { 'content-type': 'application/json' },
        body: opcoes.corpo === undefined ? { type: 'Message', event: evento() } : opcoes.corpo,
    } as unknown as NextApiRequest
    await rota(req, res)
    return saida
}

const linhasDe = (t: string) => estado.db[t] ?? []
let fetchEspiao: jest.Mock
let erros: string[] = []
let espioes: jest.SpyInstance[] = []
let deLog: string[] = []

beforeEach(() => {
    montar()
    mockConducoes.length = 0
    fetchEspiao = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    ;(globalThis as { fetch: unknown }).fetch = fetchEspiao
    erros = []
    deLog = []
    espioes = [
        jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erros.push(a.map(String).join(' ')) }),
        ...(['log', 'info', 'warn', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation((...a: unknown[]) => { deLog.push(a.map(String).join(' ')) })),
    ]
})
afterEach(() => espioes.forEach((e) => e.mockRestore()))

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) telefoneDoRemetente — o telefone vem do SenderAlt; LID nunca é telefone', () => {
    it('SenderAlt vazio e Sender "@lid" → null', () => {
        expect(telefoneDoRemetente({ SenderAlt: '', Sender: '123456789012345:33@lid' })).toBeNull()
    })

    it('SenderAlt "5551999999999:33@s.whatsapp.net" → "5551999999999"', () => {
        expect(telefoneDoRemetente({ SenderAlt: '5551999999999:33@s.whatsapp.net', Sender: '123:33@lid' })).toBe('5551999999999')
    })

    it('SenderAlt ausente: usa o Sender SÓ se terminar em "@s.whatsapp.net"', () => {
        expect(telefoneDoRemetente({ Sender: '5551999999999:12@s.whatsapp.net' })).toBe('5551999999999')
        expect(telefoneDoRemetente({ Sender: '5551999999999@s.whatsapp.net' })).toBe('5551999999999')
    })

    it.each([
        ['SenderAlt terminado em @lid', { SenderAlt: '5551999999999:33@lid' }],
        ['Sender @lid de dígitos que PARECEM telefone', { Sender: '5551999999999@lid' }],
        ['Sender de grupo', { Sender: '120363025@g.us' }],
        ['curto demais (9 dígitos)', { SenderAlt: '519998877:3@s.whatsapp.net' }],
        ['longo demais (16 dígitos)', { SenderAlt: '5551999887766123:3@s.whatsapp.net' }],
        ['letras na parte do número', { SenderAlt: '55519998x7766@s.whatsapp.net' }],
        ['info nulo', null],
        ['info sem nada', {}],
    ])('%s → null', (_nome, info) => {
        expect(telefoneDoRemetente(info)).toBeNull()
    })

    it('SenderAlt só de espaços é AUSENTE: o Sender válido serve', () => {
        expect(telefoneDoRemetente({ SenderAlt: '   ', Sender: '5551999999999@s.whatsapp.net' })).toBe('5551999999999')
    })

    it('SenderAlt PRESENTE e inválido (@lid) NÃO cai para o Sender: devolve null', () => {
        expect(telefoneDoRemetente({ SenderAlt: '123456789012345:33@lid', Sender: '5551999999999@s.whatsapp.net' })).toBeNull()
    })
})

describe('(2) textoDaMensagem', () => {
    it('conversation', () => expect(textoDaMensagem({ Message: { conversation: 'Oi beleza' } })).toBe('Oi beleza'))
    it('extendedTextMessage.text', () => expect(textoDaMensagem({ Message: { extendedTextMessage: { text: 'Com link' } } })).toBe('Com link'))
    it.each([
        ['mídia sem texto', { Message: { imageMessage: { url: 'x' } } }],
        ['Message ausente', {}],
        ['event nulo', null],
        ['conversation que não é texto', { Message: { conversation: 42 } }],
    ])('%s → null', (_n, ev) => expect(textoDaMensagem(ev)).toBeNull())
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(3) o portão de três fatores — a conexão decide o tenant, nunca o corpo', () => {
    it('c inexistente → 404 e ZERO escrita', async () => {
        const r = await chamar({ c: 'orc_que_nao_existe' })
        expect(r.status).toBe(404)
        expect(estado.escritas).toEqual([])
    })

    it('sem c → 404 e zero escrita', async () => {
        const r = await chamar({})
        expect(r.status).toBe(404)
        expect(estado.escritas).toEqual([])
    })

    it('conexão de canal ENVIO → 404 e zero escrita', async () => {
        const r = await chamar({ c: SEGREDO_ENVIO })
        expect(r.status).toBe(404)
        expect(estado.escritas).toEqual([])
    })

    it('orcamentista_config inativo → 404 e zero escrita', async () => {
        estado.db.orcamentista_config = [{ tenant_id: TENANT, ativo: false }]
        const r = await chamar({ c: SEGREDO })
        expect(r.status).toBe(404)
        expect(estado.escritas).toEqual([])
    })

    it('orcamentista_config ausente → 404 e zero escrita', async () => {
        estado.db.orcamentista_config = []
        const r = await chamar({ c: SEGREDO })
        expect(r.status).toBe(404)
        expect(estado.escritas).toEqual([])
    })

    it('o tenant do CORPO é ignorado: a conversa recebe o tenant da conexão', async () => {
        const r = await chamar({ c: SEGREDO, corpo: { type: 'Message', tenant_id: OUTRO_TENANT, event: { ...evento(), tenant_id: OUTRO_TENANT } } })
        expect(r.status).toBe(200)
        expect(mockConducoes).toEqual([expect.objectContaining({ tenantId: TENANT })])
    })

    it('o tenant do CORPO é ignorado também na tentativa: ela leva o tenant da conexão', async () => {
        await chamar({ c: SEGREDO, corpo: { type: 'Message', tenant_id: OUTRO_TENANT, event: { ...evento({ info: { SenderAlt: '5554988776655:2@s.whatsapp.net' } }), tenant_id: OUTRO_TENANT } } })
        expect(estado.escritas.length).toBe(1)
        for (const e of estado.escritas) expect((e.carga as Linha).tenant_id).toBe(TENANT)
    })

    it('método diferente de POST → 405 e zero escrita', async () => {
        const r = await chamar({ c: SEGREDO, metodo: 'GET' })
        expect(r.status).toBe(405)
        expect(estado.escritas).toEqual([])
    })
})

describe('(4) o que se ignora: 200 e nada gravado', () => {
    it.each([
        ['IsFromMe', evento({ info: { IsFromMe: true } })],
        ['IsGroup', evento({ info: { IsGroup: true } })],
        ['sem texto (mídia)', evento({ message: { imageMessage: { url: 'x' } } })],
        ['telefone ilegível (só LID)', evento({ info: { SenderAlt: '', Sender: '123456789012345:33@lid' } })],
    ])('%s', async (_n, ev) => {
        const r = await chamar({ c: SEGREDO, corpo: { type: 'Message', event: ev } })
        expect(r.status).toBe(200)
        expect(estado.escritas).toEqual([])
        expect(mockConducoes).toEqual([])
    })
})

describe('(5) remetente NÃO autorizado: grava a tentativa, sem texto, e não responde ao WhatsApp', () => {
    it('telefone fora da lista → UMA tentativa_desconhecida, NENHUMA mensagem, nenhuma conversa', async () => {
        const r = await chamar({ c: SEGREDO, corpo: { type: 'Message', event: evento({ info: { SenderAlt: '5554988776655:2@s.whatsapp.net' } }) } })
        expect(r.status).toBe(200)
        expect(linhasDe('orcamentista_tentativa_desconhecida')).toEqual([
            expect.objectContaining({ tenant_id: TENANT, telefone: '5554988776655' }),
        ])
        expect(linhasDe('orcamentista_mensagem')).toEqual([])
        expect(linhasDe('orcamentista_conversa')).toEqual([])
        expect(mockConducoes).toEqual([])
        expect(fetchEspiao).not.toHaveBeenCalled()
    })

    it('a tentativa NÃO leva o texto — nenhum campo da linha contém a mensagem', async () => {
        await chamar({ c: SEGREDO, corpo: { type: 'Message', event: evento({ info: { SenderAlt: '5554988776655:2@s.whatsapp.net' } }) } })
        const [linha] = linhasDe('orcamentista_tentativa_desconhecida')
        expect(Object.keys(linha).sort()).toEqual(['criado_em', 'id', 'telefone', 'tenant_id', 'wuzapi_mensagem_id'].sort())
        expect(JSON.stringify(linha)).not.toContain(TEXTO)
    })

    it('autorizado com ativo = false conta como NÃO autorizado', async () => {
        estado.db.orcamentista_remetente_autorizado[0].ativo = false
        await chamar({ c: SEGREDO })
        expect(linhasDe('orcamentista_tentativa_desconhecida')).toHaveLength(1)
        expect(linhasDe('orcamentista_mensagem')).toEqual([])
    })

    it('autorizado em OUTRO tenant não autoriza aqui', async () => {
        estado.db.orcamentista_remetente_autorizado = [{ id: 'r-x', tenant_id: OUTRO_TENANT, telefone: TELEFONE_GRAVADO, ativo: true }]
        await chamar({ c: SEGREDO })
        expect(linhasDe('orcamentista_tentativa_desconhecida')).toHaveLength(1)
        expect(linhasDe('orcamentista_mensagem')).toEqual([])
    })
})

describe('(6) remetente autorizado: a conversa é conduzida — e a entrada não grava nada', () => {
    it('o telefone do webhook (COM DDI) casa com o gravado na lista (SEM DDI): a conversa é conduzida UMA vez', async () => {
        const r = await chamar({ c: SEGREDO })
        expect(r.status).toBe(200)
        expect(linhasDe('orcamentista_tentativa_desconhecida')).toEqual([])
        expect(mockConducoes).toHaveLength(1)
    })

    it('a conversa recebe o tenant da conexão, o remetente autorizado, o telefone como chegou, o texto e o token da conexão', async () => {
        await chamar({ c: SEGREDO })
        expect(mockConducoes).toEqual([{ tenantId: TENANT, remetenteId: AUTORIZADO_ID, telefone: TELEFONE_DO_WEBHOOK, texto: TEXTO, wuzapiToken: TOKEN }])
    })

    it('decisão 4: NENHUMA escrita — nem orcamentista_conversa, nem orcamentista_mensagem', async () => {
        await chamar({ c: SEGREDO })
        expect(estado.escritas).toEqual([])
        expect(linhasDe('orcamentista_conversa')).toEqual([])
        expect(linhasDe('orcamentista_mensagem')).toEqual([])
    })

    it('decisão 4: a rota nem CONSULTA a conversa ou a mensagem — a identidade é o remetente', async () => {
        await chamar({ c: SEGREDO })
        expect(estado.consultas).not.toContain('orcamentista_conversa')
        expect(estado.consultas).not.toContain('orcamentista_mensagem')
    })

    it('decisão 4: o histórico antigo (conversa e mensagens de antes) fica como estava, e não impede a resposta', async () => {
        estado.db.orcamentista_conversa = [{ id: 'antiga', tenant_id: TENANT, remetente_id: AUTORIZADO_ID, telefone: TELEFONE_DO_WEBHOOK, criado_em: '2026-10-01T00:00:00Z' }]
        estado.db.orcamentista_mensagem = [{ id: 'm0', tenant_id: TENANT, conversa_id: 'antiga', direcao: 'entrada', texto: 'antes', wuzapi_mensagem_id: 'X' }]
        await chamar({ c: SEGREDO })
        expect(mockConducoes).toHaveLength(1)
        expect(linhasDe('orcamentista_conversa')).toHaveLength(1)
        expect(linhasDe('orcamentista_mensagem')).toHaveLength(1)
    })

    it('extendedTextMessage também é entregue à conversa', async () => {
        await chamar({ c: SEGREDO, corpo: { type: 'Message', event: evento({ message: { extendedTextMessage: { text: 'Com link' } } }) } })
        expect(mockConducoes).toEqual([expect.objectContaining({ texto: 'Com link' })])
    })

    it('a rota de entrada DECLARA o limite da função (a LLM roda dentro da requisição)', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        expect((require('@/pages/api/atendimentos-ia/inbound') as { config: { maxDuration: number } }).config.maxDuration).toBe(60)
    })
})

describe('(7) a consequência da decisão 4: o reenvio do WUZAPI não é mais reconhecido', () => {
    it('o mesmo Info.ID duas vezes: as duas respostas 200, e a conversa é conduzida DUAS vezes', async () => {
        const a = await chamar({ c: SEGREDO })
        const b = await chamar({ c: SEGREDO })
        expect([a.status, b.status]).toEqual([200, 200])
        expect(mockConducoes).toHaveLength(2)
    })
})

describe('(8) o log: uma linha [INBOUND] em console.error, sem token e sem texto', () => {
    const doInbound = (l: string[]) => l.filter((x) => x.startsWith('[INBOUND]'))

    it('autorizado: chaves de topo, canal, achou conexão, autorizado e o Info.ID', async () => {
        await chamar({ c: SEGREDO })
        const [linha] = doInbound(erros)
        expect(linha).toEqual(expect.stringContaining('chaves=event,type'))
        expect(linha).toEqual(expect.stringContaining('canal=ORCAMENTISTA'))
        expect(linha).toEqual(expect.stringContaining('conexao=sim'))
        expect(linha).toEqual(expect.stringContaining('autorizado=sim'))
        expect(linha).toEqual(expect.stringContaining('id=3EB0FC924E6F69C6AA4CBB'))
        expect(doInbound(deLog)).toEqual([])
    })

    it('conexão não achada: conexao=nao, e o c recebido NÃO aparece', async () => {
        const naoExiste = 'abcdefabcdefabcdefabcdefabcdefab'
        await chamar({ c: naoExiste })
        expect(doInbound(erros)).toEqual([expect.stringContaining('conexao=nao')])
        expect(erros.join('\n')).not.toContain(naoExiste)
    })

    it('não autorizado: autorizado=nao', async () => {
        await chamar({ c: SEGREDO, corpo: { type: 'Message', event: evento({ info: { SenderAlt: '5554988776655:2@s.whatsapp.net' } }) } })
        expect(doInbound(erros)).toEqual([expect.stringContaining('autorizado=nao')])
    })

    it('em NENHUM caminho o token da conexão, o texto ou o telefone vão para o log', async () => {
        await chamar({ c: SEGREDO })
        await chamar({ c: SEGREDO, corpo: { type: 'Message', event: evento({ info: { SenderAlt: '5554988776655:2@s.whatsapp.net' } }) } })
        await chamar({ c: SEGREDO_ENVIO })
        const tudo = [...erros, ...deLog].join('\n')
        expect(doInbound(erros).length).toBe(3)
        for (const segredo of [TOKEN, TOKEN_ENVIO, SEGREDO, SEGREDO_ENVIO, TEXTO, TELEFONE_DO_WEBHOOK, TELEFONE_GRAVADO, '5554988776655']) expect(tudo).not.toContain(segredo)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(9) o c é o webhook_segredo — o wuzapi_token NUNCA abre a porta', () => {
    it('c igual ao wuzapi_token da conexão → 404 e zero escrita', async () => {
        const r = await chamar({ c: TOKEN })
        expect(r.status).toBe(404)
        expect(estado.escritas).toEqual([])
    })

    it('c igual ao wuzapi_token, MESMO com o token em formato hexadecimal → 404 e zero escrita', async () => {
        // sem isto, o caso acima passaria só pela recusa de formato, e não provaria a COLUNA da busca
        const tokenHex = '9999999999aaaaaaaaaa9999999999aa'
        estado.db.whatsapp_conexao[0].wuzapi_token = tokenHex
        const r = await chamar({ c: tokenHex })
        expect(r.status).toBe(404)
        expect(estado.escritas).toEqual([])
    })

    it('o segredo certo abre: a conversa é conduzida com o tenant da conexão', async () => {
        const r = await chamar({ c: SEGREDO })
        expect(r.status).toBe(200)
        expect(mockConducoes).toEqual([expect.objectContaining({ tenantId: TENANT })])
    })

    it.each([
        ['maiúsculas', '0123456789ABCDEF0123456789ABCDEF'],
        ['31 caracteres', '0123456789abcdef0123456789abcde'],
        ['65 caracteres', `${'a'.repeat(65)}`],
        ['letra fora do hexadecimal', '0123456789abcdeg0123456789abcdef'],
        ['o wuzapi_token, com o prefixo', TOKEN],
        ['espaço em volta', ` ${SEGREDO} `],
        ['vazio', ''],
    ])('c fora do formato (%s) → 404 SEM nenhuma consulta ao banco', async (_n, c) => {
        const r = await chamar({ c })
        expect(r.status).toBe(404)
        expect(estado.consultas).toEqual([])
    })

    it('c repetido na URL (?c=a&c=b, chega como lista) → 404 sem consulta', async () => {
        const saida = { status: 0 }
        const res = { status(n: number) { saida.status = n; return res }, json() { return res }, end() { return res } } as unknown as NextApiResponse
        await rota({ method: 'POST', query: { c: [SEGREDO, SEGREDO] }, headers: {}, body: { event: evento() } } as unknown as NextApiRequest, res)
        expect(saida.status).toBe(404)
        expect(estado.consultas).toEqual([])
    })

    it('o banco falso ENXERGA consulta — sem isto, a lista vazia acima não provaria nada', async () => {
        await chamar({ c: 'abcdefabcdefabcdefabcdefabcdefab' })
        expect(estado.consultas).toEqual(['whatsapp_conexao'])
    })

    it('o contraste: whatsapp_conexao.ativo = false NÃO fecha a porta — o interruptor é o orcamentista_config', async () => {
        expect(estado.db.whatsapp_conexao[0].ativo).toBe(false)
        const r = await chamar({ c: SEGREDO })
        expect(r.status).toBe(200)
        expect(mockConducoes).toHaveLength(1)
    })
})

describe('(10) a tentativa desconhecida leva o Info.ID, e o reenvio não vira 500', () => {
    const DESCONHECIDO = { type: 'Message', event: evento({ info: { SenderAlt: '5554988776655:2@s.whatsapp.net' } }) }

    it('a tentativa gravada leva o wuzapi_mensagem_id', async () => {
        await chamar({ c: SEGREDO, corpo: DESCONHECIDO })
        expect(linhasDe('orcamentista_tentativa_desconhecida')).toEqual([
            expect.objectContaining({ tenant_id: TENANT, telefone: '5554988776655', wuzapi_mensagem_id: '3EB0FC924E6F69C6AA4CBB' }),
        ])
    })

    it('sem Info.ID, a tentativa leva wuzapi_mensagem_id NULL', async () => {
        await chamar({ c: SEGREDO, corpo: { type: 'Message', event: evento({ info: { ID: undefined, SenderAlt: '5554988776655:2@s.whatsapp.net' } }) } })
        expect(linhasDe('orcamentista_tentativa_desconhecida')).toEqual([expect.objectContaining({ wuzapi_mensagem_id: null })])
    })

    it('desconhecido reenviado: o insert devolve 23505 → 200, sem 500', async () => {
        estado.falhaNoInsert = 'orcamentista_tentativa_desconhecida'
        const r = await chamar({ c: SEGREDO, corpo: DESCONHECIDO })
        expect(r.status).toBe(200)
    })

    it('o mesmo Info.ID de um desconhecido duas vezes → UMA linha em tentativa_desconhecida, e as duas respostas 200', async () => {
        const a = await chamar({ c: SEGREDO, corpo: DESCONHECIDO })
        const b = await chamar({ c: SEGREDO, corpo: DESCONHECIDO })
        expect([a.status, b.status]).toEqual([200, 200])
        expect(linhasDe('orcamentista_tentativa_desconhecida')).toHaveLength(1)
    })

    it('o contraste: erro do banco que NÃO é 23505 na tentativa continua 500', async () => {
        estado.falhaNoInsert = 'orcamentista_tentativa_desconhecida'
        estado.codigoDaFalha = '23503'
        const r = await chamar({ c: SEGREDO, corpo: DESCONHECIDO })
        expect(r.status).toBe(500)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(11) o celular sem o nono dígito: a comparação é pela forma NORMALIZADA, dos dois lados', () => {
    // MEDIDO EM PRODUÇÃO (22/10/2026), nas duas pontas da mesma mensagem: o cadastro tem 11 dígitos
    // (DDD + 9 + 8); o webhook entregou 12 (55 + DDD + 8). O WhatsApp entrega o celular brasileiro
    // SEM o nono dígito — e a mensagem de um funcionário cadastrado caía em tentativa_desconhecida.
    const comCadastro = (...telefones: string[]) => {
        estado.db.orcamentista_remetente_autorizado = telefones.map((telefone, i) => ({ id: `aut-${i}`, tenant_id: TENANT, telefone, ativo: true }))
    }
    const doWebhook = (numero: string) => ({ type: 'Message', event: evento({ info: { SenderAlt: `${numero}:33@s.whatsapp.net` } }) })
    const autorizou = () => mockConducoes.length === 1 && linhasDe('orcamentista_tentativa_desconhecida').length === 0
    const recusou = () => mockConducoes.length === 0 && linhasDe('orcamentista_tentativa_desconhecida').length === 1

    describe('AUTORIZADO, com os valores medidos', () => {
        it('cadastro "51999114290" (11) e webhook "555199114290" (12, SEM o nono)', async () => {
            comCadastro('51999114290')
            const r = await chamar({ c: SEGREDO, corpo: doWebhook('555199114290') })
            expect(r.status).toBe(200)
            expect(autorizou()).toBe(true)
        })

        it('cadastro "5551999114290" (13, alguém cadastrou com DDI) e o mesmo webhook', async () => {
            comCadastro('5551999114290')
            await chamar({ c: SEGREDO, corpo: doWebhook('555199114290') })
            expect(autorizou()).toBe(true)
        })

        it('cadastro "51999114290" e webhook "5551999114290" (13, com o nono)', async () => {
            comCadastro('51999114290')
            await chamar({ c: SEGREDO, corpo: doWebhook('5551999114290') })
            expect(autorizou()).toBe(true)
        })

        it('fixo: cadastro "5133334444" e webhook "555133334444"', async () => {
            comCadastro('5133334444')
            await chamar({ c: SEGREDO, corpo: doWebhook('555133334444') })
            expect(autorizou()).toBe(true)
        })

        it('fixo: o 9 NÃO foi inserido — um cadastro "51933334444" (com o 9 inventado) NÃO casa com o webhook "555133334444"', async () => {
            comCadastro('51933334444')
            await chamar({ c: SEGREDO, corpo: doWebhook('555133334444') })
            expect(recusou()).toBe(true)
        })
    })

    describe('NÃO autorizado: a tentativa é gravada', () => {
        it('número estrangeiro: não é comparado — nem com um cadastro de dígitos IGUAIS', async () => {
            comCadastro('5491155554444')
            const r = await chamar({ c: SEGREDO, corpo: doWebhook('5491155554444') })
            expect(r.status).toBe(200)
            expect(recusou()).toBe(true)
            expect(linhasDe('orcamentista_tentativa_desconhecida')[0]).toEqual(expect.objectContaining({ telefone: '5491155554444' }))
        })

        it('DOIS autorizados ativos que normalizam igual: NÃO escolhe um — recusa, grava a tentativa e loga a ambiguidade sem o telefone', async () => {
            comCadastro('51999114290', '5199114290')
            const r = await chamar({ c: SEGREDO, corpo: doWebhook('555199114290') })
            expect(r.status).toBe(200)
            expect(recusou()).toBe(true)
            const linha = erros.find((l) => l.startsWith('[INBOUND]') && /ambiguidade/.test(l))
            expect(linha).toEqual(expect.stringContaining('autorizado=nao'))
            for (const t of ['555199114290', '51999114290', '5199114290']) expect(erros.join('\n')).not.toContain(t)
        })

        it('o contraste da ambiguidade: a segunda linha INATIVA não conta — um só ativo, autorizado', async () => {
            comCadastro('51999114290', '5199114290')
            estado.db.orcamentista_remetente_autorizado[1].ativo = false
            await chamar({ c: SEGREDO, corpo: doWebhook('555199114290') })
            expect(autorizou()).toBe(true)
            expect(mockConducoes).toEqual([expect.objectContaining({ remetenteId: 'aut-0' })])
        })
    })

    describe('o número é guardado COMO CHEGOU, não o normalizado', () => {
        it('a conversa recebe "555199114290", não "51999114290" — é para ele que a resposta volta', async () => {
            comCadastro('51999114290')
            await chamar({ c: SEGREDO, corpo: doWebhook('555199114290') })
            expect(mockConducoes).toEqual([expect.objectContaining({ telefone: '555199114290' })])
        })

        it('a tentativa guarda "555199114290", não "51999114290"', async () => {
            comCadastro('51900000000')
            await chamar({ c: SEGREDO, corpo: doWebhook('555199114290') })
            expect(linhasDe('orcamentista_tentativa_desconhecida')).toEqual([expect.objectContaining({ telefone: '555199114290' })])
        })
    })
})
