/**
 * @jest-environment node
 *
 * PORTÃO — a etapa da CONVERSA do Atendimentos I.A.: a IA responde no WhatsApp e preenche a
 * pré-definição. A regra que não se negocia: a LLM PROPÕE, a rota VALIDA e GRAVA.
 *
 * Exercitado PELA ROTA DE ENTRADA (`/api/atendimentos-ia/inbound`), que chama a conversa só no
 * desfecho 'gravada'. A Anthropic e o WUZAPI são FALSOS (um `fetch` que roteia pela URL e registra
 * cada chamada); o banco é falso, em memória, e registra cada escrita.
 *
 * Os campos e o comportamento são os da maquete aprovada: 6 de produto (tipologia, largura, altura,
 * quantidade, cor do perfil, vidro) e 3 de entrega (local, tipo de edificação e — SÓ com mais de um
 * pavimento — a distribuição por pavimento). Uma pergunta por vez, a do próximo campo vazio.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>

const SEGREDO = '0123456789abcdef0123456789abcdef'
const TOKEN = 'orc_TOKEN_DA_CONEXAO_9f8e7d'
const TENANT = 'tenant-da-conexao'
const OUTRO_TENANT = 'tenant-de-outra-conta'
const AUTORIZADO_ID = 'remetente-1'
const CONVERSA = 'conversa-1'
const TELEFONE_DO_WEBHOOK = '555199114290'
const TELEFONE_GRAVADO = '51999114290'
const TEXTO = 'São 4 janelas de correr, 1500 por 1200'
const CHAVE = 'sk-ant-CHAVE-DE-TESTE-nao-pode-ir-ao-log'
const ANTHROPIC = 'https://api.anthropic.com/v1/messages'

const VAZIA = {
    tipologia: null, largura_mm: null, altura_mm: null, quantidade: null, cor_perfil: null, vidro: null,
    local: null, tipo_edificacao: null, distribuicao_por_pavimento: null,
}
const SETE_DE_PRODUTO_E_LOCAL = {
    tipologia: 'Janela de correr', largura_mm: 1500, altura_mm: 1200, quantidade: 4, cor_perfil: 'Branco', vidro: 'Temperado 6mm',
    local: 'Porto Alegre',
}

const estado = {
    db: {} as Record<string, Linha[]>,
    escritas: [] as Array<{ tabela: string; op: string; carga: unknown; filtros?: Array<[string, unknown]> }>,
    /** O que a Anthropic falsa devolve — uma por chamada, na ordem; sem fila, `padrao`. */
    respostasDaLlm: [] as Array<{ status: number; corpo: unknown } | 'lanca'>,
    padraoDaLlm: { status: 200, corpo: {} } as { status: number; corpo: unknown },
    chamadasDaLlm: [] as Array<{ headers: Record<string, string>; corpo: Record<string, unknown> }>,
    envioStatus: 200,
    envios: [] as Array<{ url: string; headers: Record<string, string>; corpo: Record<string, unknown> }>,
}

function montar(preDefinicao: Linha | null = null) {
    estado.db = {
        whatsapp_conexao: [{ id: 'c1', tenant_id: TENANT, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN, webhook_segredo: SEGREDO, ativo: true }],
        // `modelo` aqui é o modelo de ATENDIMENTO da conta (FABRICACAO|REVENDA|SERVICO), NÃO o da LLM
        orcamentista_config: [{ tenant_id: TENANT, ativo: true, modelo: 'FABRICACAO' }],
        orcamentista_remetente_autorizado: [{ id: AUTORIZADO_ID, tenant_id: TENANT, telefone: TELEFONE_GRAVADO, ativo: true }],
        orcamentista_conversa: [{ id: CONVERSA, tenant_id: TENANT, remetente_id: AUTORIZADO_ID, telefone: TELEFONE_DO_WEBHOOK, criado_em: '2026-10-22T00:00:00Z' }],
        orcamentista_mensagem: [],
        orcamentista_tentativa_desconhecida: [],
        orcamentista_pre_definicao: preDefinicao
            ? [{ id: 'pd-1', tenant_id: TENANT, conversa_id: CONVERSA, estado: 'EM_COLETA', criado_em: '2026-10-22T00:00:00Z', atualizado_em: null, ...VAZIA, ...preDefinicao }]
            : [],
    }
    estado.escritas = []
    estado.respostasDaLlm = []
    estado.padraoDaLlm = { status: 200, corpo: respostaComFerramenta({}) as unknown }
    estado.chamadasDaLlm = []
    estado.envioStatus = 200
    estado.envios = []
}

let sequencia = 0
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            let ordem: { coluna: string; asc: boolean } | null = null
            let limite: number | null = null
            let atualizacao: Linha | null = null
            const casa = (l: Linha) => filtros.every(([c, v]) => l[c] === v)
            const ler = () => {
                let linhas = (estado.db[tabela] ?? []).filter(casa)
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
            q.update = (carga: Linha) => { atualizacao = carga; return q }
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => {
                if (atualizacao) {
                    estado.escritas.push({ tabela, op: 'update', carga: atualizacao, filtros: [...filtros] })
                    for (const l of (estado.db[tabela] ?? []).filter(casa)) Object.assign(l, atualizacao)
                    return Promise.resolve({ data: null, error: null }).then(ok, erro)
                }
                return Promise.resolve({ data: ler(), error: null }).then(ok, erro)
            }
            q.insert = (carga: Linha) => {
                estado.escritas.push({ tabela, op: 'insert', carga })
                const linhas = (estado.db[tabela] ??= [])
                let r: { data: Linha | null; error: { code: string; message: string } | null }
                if (tabela === 'orcamentista_mensagem' && carga.direcao === 'entrada' && carga.wuzapi_mensagem_id != null
                    && linhas.some((l) => l.direcao === 'entrada' && l.tenant_id === carga.tenant_id && l.wuzapi_mensagem_id === carga.wuzapi_mensagem_id)) {
                    r = { data: null, error: { code: '23505', message: 'duplicate key' } }
                } else {
                    sequencia += 1
                    const nova: Linha = { id: `${tabela}-${sequencia}`, criado_em: new Date(Date.UTC(2026, 9, 22, 1, 0, sequencia)).toISOString(), ...carga }
                    linhas.push(nova)
                    r = { data: nova, error: null }
                }
                return {
                    select: () => ({ single: async () => r }),
                    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: null, error: r.error }).then(ok, erro),
                }
            }
            for (const proibido of ['upsert', 'delete']) {
                q[proibido] = () => { throw new Error(`a conversa não pode ${proibido} em ${tabela}`) }
            }
            return q
        },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/atendimentos-ia/inbound').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preDef = require('@/lib/atendimentos-ia/pre-definicao') as {
    TIPOS_DE_EDIFICACAO: readonly string[]
    TIPOS_COM_MAIS_DE_UM_PAVIMENTO: readonly string[]
    PERGUNTA_DO_CAMPO: Record<string, string>
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MODELO_PADRAO_DA_IA, VERSAO_DA_API_ANTHROPIC } = require('@/lib/atendimentos-ia/modelo-da-ia') as { MODELO_PADRAO_DA_IA: string; VERSAO_DA_API_ANTHROPIC: string }

type Proposta = { campos?: Linha; correcoes?: Linha; pergunta?: { campo: string | null; texto: string | null } } & Linha
function respostaComFerramenta(p: Proposta) {
    return {
        id: 'msg_teste', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'tool_use',
        content: [{
            type: 'tool_use', id: 'toolu_teste', name: 'registrar_pre_definicao',
            input: { campos: { ...VAZIA, ...p.campos }, correcoes: { ...VAZIA, ...p.correcoes }, pergunta: p.pergunta ?? { campo: null, texto: null }, ...Object.fromEntries(Object.entries(p).filter(([k]) => !['campos', 'correcoes', 'pergunta'].includes(k))) },
        }],
        usage: { input_tokens: 100, output_tokens: 50 },
    }
}
const llmResponde = (p: Proposta) => { estado.respostasDaLlm.push({ status: 200, corpo: respostaComFerramenta(p) }) }

async function chamar(opcoes: { texto?: string; id?: string; senderAlt?: string } = {}) {
    const saida = { status: 0 }
    const res = { status(n: number) { saida.status = n; return res }, json() { return res }, end() { return res }, setHeader() { return res } } as unknown as NextApiResponse
    const req = {
        method: 'POST',
        query: { c: SEGREDO },
        headers: { 'content-type': 'application/json' },
        body: {
            type: 'Message',
            event: {
                Info: { ID: opcoes.id ?? 'MSG_1', Sender: '1234:33@lid', SenderAlt: `${opcoes.senderAlt ?? TELEFONE_DO_WEBHOOK}:33@s.whatsapp.net`, IsFromMe: false, IsGroup: false, Type: 'text' },
                Message: { conversation: opcoes.texto ?? TEXTO },
            },
        },
    } as unknown as NextApiRequest
    await rota(req, res)
    return saida
}

const preDefinicao = () => (estado.db.orcamentista_pre_definicao ?? [])[0] ?? null
const saidas = () => (estado.db.orcamentista_mensagem ?? []).filter((m) => m.direcao === 'saida')
const entradas = () => (estado.db.orcamentista_mensagem ?? []).filter((m) => m.direcao === 'entrada')
const linhaIa = () => erros.filter((l) => l.startsWith('[IA]'))

let erros: string[] = []
let espioes: jest.SpyInstance[] = []
beforeEach(() => {
    montar()
    process.env.ANTHROPIC_API_KEY = CHAVE
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
        const corpo = init?.body ? JSON.parse(init.body) : {}
        const headers = init?.headers ?? {}
        if (url === ANTHROPIC) {
            estado.chamadasDaLlm.push({ headers, corpo })
            const proxima = estado.respostasDaLlm.shift() ?? estado.padraoDaLlm
            if (proxima === 'lanca') throw new Error('fetch failed')
            return { ok: proxima.status >= 200 && proxima.status < 300, status: proxima.status, json: async () => proxima.corpo, text: async () => JSON.stringify(proxima.corpo) }
        }
        if (url.endsWith('/chat/send/text')) {
            estado.envios.push({ url, headers, corpo })
            const ok = estado.envioStatus >= 200 && estado.envioStatus < 300
            const resposta = ok ? { code: 200, success: true, data: { Details: 'Sent', Id: 'WAMID_SAIDA_1' } } : { code: estado.envioStatus, error: 'falhou', success: false }
            return { ok, status: estado.envioStatus, json: async () => resposta, text: async () => JSON.stringify(resposta) }
        }
        throw new Error(`fetch inesperado: ${url}`)
    })
    erros = []
    espioes = [
        jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erros.push(a.map(String).join(' ')) }),
        ...(['log', 'info', 'warn', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined)),
    ]
})
afterEach(() => {
    espioes.forEach((e) => e.mockRestore())
    delete process.env.ANTHROPIC_API_KEY
})

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) o domínio: CASA é UM pavimento; SOBRADO, PREDIO e MULTIFAMILIAR disparam a distribuição', () => {
    it('o conjunto fechado é exatamente CASA, SOBRADO, PREDIO, MULTIFAMILIAR', () => {
        expect([...preDef.TIPOS_DE_EDIFICACAO].sort()).toEqual(['CASA', 'MULTIFAMILIAR', 'PREDIO', 'SOBRADO'])
    })

    it('CASA NÃO está entre os de mais de um pavimento; os outros três estão', () => {
        expect([...preDef.TIPOS_COM_MAIS_DE_UM_PAVIMENTO].sort()).toEqual(['MULTIFAMILIAR', 'PREDIO', 'SOBRADO'])
        expect(preDef.TIPOS_COM_MAIS_DE_UM_PAVIMENTO).not.toContain('CASA')
    })

    it('as perguntas fixas são ABERTAS: uma pergunta, sem lista de opções', () => {
        for (const [campo, texto] of Object.entries(preDef.PERGUNTA_DO_CAMPO)) {
            expect(`${campo}: ${texto}`).toMatch(/\?$/)
            expect(texto).not.toMatch(/\n|\(|:|\bou\b|1\)|a\)|•|-\s/)
        }
    })
})

describe('(2) o contrato da chamada à Anthropic', () => {
    it('POST com a chave no header, anthropic-version, o modelo da CONSTANTE — não o config.modelo, que é o modelo de atendimento', async () => {
        await chamar()
        expect(estado.chamadasDaLlm).toHaveLength(1)
        const [c] = estado.chamadasDaLlm
        expect(c.headers['x-api-key']).toBe(CHAVE)
        expect(c.headers['anthropic-version']).toBe(VERSAO_DA_API_ANTHROPIC)
        expect(VERSAO_DA_API_ANTHROPIC).toBe('2026-10-21')
        expect(c.corpo.model).toBe(MODELO_PADRAO_DA_IA)
        expect(MODELO_PADRAO_DA_IA).toBe('claude-sonnet-5-5')
        expect(c.corpo.model).not.toBe('FABRICACAO')
    })

    it('saída estruturada: UMA ferramenta strict, tool_choice auto (o forçado é 400 neste modelo), e nada de temperature/top_p/top_k', async () => {
        await chamar()
        const corpo = estado.chamadasDaLlm[0].corpo
        const tools = corpo.tools as Array<Record<string, unknown>>
        expect(tools).toHaveLength(1)
        expect(tools[0].name).toBe('registrar_pre_definicao')
        expect(tools[0].strict).toBe(true)
        expect(corpo.tool_choice).toEqual({ type: 'auto' })
        for (const k of ['temperature', 'top_p', 'top_k']) expect(corpo).not.toHaveProperty(k)
    })

    it('manda o histórico da conversa (entrada como user, saída como assistant) e o estado atual da pré-definição', async () => {
        montar({ tipologia: 'Janela de correr' })
        estado.db.orcamentista_mensagem.push(
            { id: 'm0', tenant_id: TENANT, conversa_id: CONVERSA, direcao: 'entrada', texto: 'Oi', wuzapi_mensagem_id: 'MSG_0', criado_em: '2026-10-22T00:00:01Z' },
            { id: 'm1', tenant_id: TENANT, conversa_id: CONVERSA, direcao: 'saida', texto: 'Qual a tipologia?', wuzapi_mensagem_id: null, criado_em: '2026-10-22T00:00:02Z' },
        )
        await chamar()
        const corpo = estado.chamadasDaLlm[0].corpo
        const mensagens = corpo.messages as Array<{ role: string; content: unknown }>
        expect(mensagens.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
        expect(JSON.stringify(mensagens)).toContain('Qual a tipologia?')
        expect(JSON.stringify(mensagens[2].content)).toContain(TEXTO)
        expect(String(corpo.system)).toContain('Janela de correr')
    })

    it('a chave NUNCA vai para o log', async () => {
        await chamar()
        expect(erros.join('\n')).not.toContain(CHAVE)
    })
})

describe('(3) a rota VALIDA antes de gravar: o que não valida é DESCARTADO', () => {
    it('largura_mm = "mil e quinhentos" → descartado, NADA nesse campo; o campo válido da mesma resposta é gravado', async () => {
        montar(VAZIA)
        llmResponde({ campos: { tipologia: 'Janela de correr', largura_mm: 'mil e quinhentos' } })
        await chamar()
        expect(preDefinicao()?.largura_mm).toBeNull()
        expect(preDefinicao()?.tipologia).toBe('Janela de correr')
        expect(linhaIa()[0]).toEqual(expect.stringMatching(/propostos=2 .*descartados=1/))
    })

    it.each([
        ['zero', { largura_mm: 0 }],
        ['negativo', { altura_mm: -10 }],
        ['fracionário', { largura_mm: 1500.5 }],
        ['fora da faixa sã', { largura_mm: 900000 }],
        ['quantidade zero', { quantidade: 0 }],
        ['quantidade absurda', { quantidade: 1000000 }],
        ['tipo de edificação fora do conjunto', { tipo_edificacao: 'CHALE' }],
        ['tipo de edificação em minúsculas', { tipo_edificacao: 'casa' }],
        ['texto vazio', { vidro: '   ' }],
        ['texto que não é texto', { cor_perfil: 123 }],
    ])('%s → descartado', async (_n, campos) => {
        montar(VAZIA)
        llmResponde({ campos })
        await chamar()
        const [campo] = Object.keys(campos)
        expect(preDefinicao()?.[campo]).toBeNull()
        expect(linhaIa()[0]).toEqual(expect.stringContaining('descartados=1'))
    })

    it('tenant_id e conversa_id propostos pela LLM — no topo e dentro dos campos — são IGNORADOS', async () => {
        montar(VAZIA)
        llmResponde({ tenant_id: OUTRO_TENANT, conversa_id: 'conversa-de-outro', campos: { tipologia: 'Porta', tenant_id: OUTRO_TENANT, conversa_id: 'x' } as Linha })
        await chamar()
        const escritas = estado.escritas.filter((e) => e.tabela === 'orcamentista_pre_definicao')
        expect(escritas.length).toBeGreaterThan(0)
        for (const e of escritas) {
            expect(JSON.stringify(e.carga)).not.toContain(OUTRO_TENANT)
            expect(JSON.stringify(e.carga)).not.toContain('conversa-de-outro')
            if (e.op === 'update') expect(e.filtros).toEqual(expect.arrayContaining([['tenant_id', TENANT]]))
        }
        expect(preDefinicao()).toEqual(expect.objectContaining({ tenant_id: TENANT, conversa_id: CONVERSA, tipologia: 'Porta' }))
        expect(estado.db.orcamentista_pre_definicao).toHaveLength(1)
    })
})

describe('(4) a LLM NÃO apaga nem sobrescreve: só preenche o que está nulo, salvo correção explícita', () => {
    it('campo preenchido proposto em `campos` (sem correção) → NÃO sobrescreve', async () => {
        montar({ tipologia: 'Janela de correr' })
        llmResponde({ campos: { tipologia: 'Porta de giro' } })
        await chamar()
        expect(preDefinicao()?.tipologia).toBe('Janela de correr')
    })

    it('o contraste: a MESMA mudança em `correcoes` → sobrescreve', async () => {
        montar({ tipologia: 'Janela de correr' })
        llmResponde({ correcoes: { tipologia: 'Porta de giro' } })
        await chamar()
        expect(preDefinicao()?.tipologia).toBe('Porta de giro')
    })

    it('correção que não valida → descartada, o valor antigo fica', async () => {
        montar({ largura_mm: 1500 })
        llmResponde({ correcoes: { largura_mm: 'mais ou menos 2 metros' } })
        await chamar()
        expect(preDefinicao()?.largura_mm).toBe(1500)
    })

    it('null nunca apaga — nem em campos, nem em correcoes', async () => {
        montar({ tipologia: 'Janela de correr', vidro: 'Temperado 6mm' })
        llmResponde({ campos: { tipologia: null }, correcoes: { vidro: null } })
        await chamar()
        expect(preDefinicao()).toEqual(expect.objectContaining({ tipologia: 'Janela de correr', vidro: 'Temperado 6mm' }))
    })
})

describe('(5) uma pergunta por vez, a do PRÓXIMO campo vazio — decidido pela rota, não pela LLM', () => {
    it('a pergunta da LLM sobre o próximo campo é a que vai ao vendedor, e fica gravada como saída', async () => {
        montar({ tipologia: 'Janela de correr' })
        llmResponde({ pergunta: { campo: 'largura_mm', texto: 'E a largura de cada uma?' } })
        const r = await chamar()
        expect(r.status).toBe(200)
        expect(estado.envios).toHaveLength(1)
        expect(estado.envios[0].corpo).toEqual({ Phone: TELEFONE_DO_WEBHOOK, Body: 'E a largura de cada uma?' })
        expect(estado.envios[0].headers.token).toBe(TOKEN)
        expect(saidas()).toEqual([expect.objectContaining({ tenant_id: TENANT, conversa_id: CONVERSA, direcao: 'saida', texto: 'E a largura de cada uma?' })])
    })

    it('a LLM pergunta FORA de ordem → a rota manda a pergunta fixa do próximo campo', async () => {
        montar({ tipologia: 'Janela de correr' })
        llmResponde({ pergunta: { campo: 'vidro', texto: 'Qual o vidro?' } })
        await chamar()
        expect(estado.envios[0].corpo.Body).toBe(preDef.PERGUNTA_DO_CAMPO.largura_mm)
    })

    it('com os campos desta mensagem gravados, a pergunta é a do campo SEGUINTE a eles', async () => {
        montar(VAZIA)
        llmResponde({ campos: { tipologia: 'Janela de correr', largura_mm: 1500, altura_mm: 1200, quantidade: 4 }, pergunta: { campo: 'cor_perfil', texto: 'E a cor do perfil?' } })
        await chamar()
        expect(estado.envios[0].corpo.Body).toBe('E a cor do perfil?')
    })
})

describe('(6) a distribuição por pavimento: SÓ com mais de um pavimento', () => {
    it('CASA: a distribuição NUNCA é perguntada — nem quando a LLM tenta — e o próximo é o campo vazio de antes', async () => {
        montar({ ...SETE_DE_PRODUTO_E_LOCAL, local: null, tipo_edificacao: 'CASA' })
        llmResponde({ pergunta: { campo: 'distribuicao_por_pavimento', texto: 'Como fica a distribuição por pavimento?' } })
        await chamar()
        expect(estado.envios[0].corpo.Body).toBe(preDef.PERGUNTA_DO_CAMPO.local)
        expect(JSON.stringify(estado.envios)).not.toMatch(/pavimento/i)
    })

    it('CASA: a distribuição proposta pela LLM é descartada e fica NULA; com os outros 8 preenchidos, fecha', async () => {
        montar({ ...SETE_DE_PRODUTO_E_LOCAL })
        llmResponde({ campos: { tipo_edificacao: 'CASA', distribuicao_por_pavimento: 'térreo: 4' } })
        await chamar()
        expect(preDefinicao()).toEqual(expect.objectContaining({ tipo_edificacao: 'CASA', distribuicao_por_pavimento: null, estado: 'COMPLETA' }))
        expect(estado.envios).toEqual([])
    })

    it('PREDIO: a distribuição É perguntada, e a pré-definição segue em coleta', async () => {
        montar({ ...SETE_DE_PRODUTO_E_LOCAL, tipo_edificacao: 'PREDIO' })
        llmResponde({ pergunta: { campo: 'distribuicao_por_pavimento', texto: 'Como ficam as janelas em cada pavimento?' } })
        await chamar()
        expect(estado.envios[0].corpo.Body).toBe('Como ficam as janelas em cada pavimento?')
        expect(preDefinicao()?.estado).toBe('EM_COLETA')
    })

    it.each([['SOBRADO'], ['MULTIFAMILIAR']])('%s também pergunta a distribuição', async (tipo) => {
        montar({ ...SETE_DE_PRODUTO_E_LOCAL, tipo_edificacao: tipo })
        llmResponde({})
        await chamar()
        expect(estado.envios[0].corpo.Body).toBe(preDef.PERGUNTA_DO_CAMPO.distribuicao_por_pavimento)
    })

    it('a distribuição é gravada como {"texto": ...}, sem interpretar', async () => {
        montar({ ...SETE_DE_PRODUTO_E_LOCAL, tipo_edificacao: 'PREDIO' })
        llmResponde({ campos: { distribuicao_por_pavimento: 'térreo 4, primeiro andar 6' } })
        await chamar()
        expect(preDefinicao()?.distribuicao_por_pavimento).toEqual({ texto: 'térreo 4, primeiro andar 6' })
    })
})

describe('(7) os 9 campos preenchidos: a IA não pergunta mais nada, e a pré-definição FECHA', () => {
    it('PREDIO com a distribuição desta mensagem → COMPLETA, nenhuma pergunta enviada', async () => {
        montar({ ...SETE_DE_PRODUTO_E_LOCAL, tipo_edificacao: 'PREDIO' })
        llmResponde({ campos: { distribuicao_por_pavimento: 'térreo 4, primeiro andar 6' }, pergunta: { campo: null, texto: 'Mais alguma coisa?' } })
        await chamar()
        expect(preDefinicao()?.estado).toBe('COMPLETA')
        expect(estado.envios).toEqual([])
        expect(saidas()).toEqual([])
        expect(linhaIa()[0]).toEqual(expect.stringContaining('desfecho=completa'))
    })

    it('enquanto falta campo, o estado é EM_COLETA; a pré-definição nasce na primeira mensagem, UMA por conversa', async () => {
        llmResponde({ campos: { tipologia: 'Janela de correr' } })
        await chamar({ id: 'MSG_A' })
        llmResponde({ campos: { largura_mm: 1500 } })
        await chamar({ id: 'MSG_B' })
        expect(estado.db.orcamentista_pre_definicao).toHaveLength(1)
        expect(preDefinicao()).toEqual(expect.objectContaining({ estado: 'EM_COLETA', tipologia: 'Janela de correr', largura_mm: 1500 }))
    })
})

describe('(8) erro da LLM ou do envio: 200 ao WUZAPI, sempre — e nenhuma mensagem técnica ao vendedor', () => {
    it.each([
        ['402 billing_error', { status: 402, corpo: { type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low to access the Anthropic API.' } } }],
        ['400 com "credit balance is too low"', { status: 400, corpo: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } } }],
    ])('SEM SALDO (%s) → 200, log de saldo, ZERO mensagem enviada, e a entrada continua gravada', async (_n, resposta) => {
        estado.respostasDaLlm.push(resposta)
        const r = await chamar()
        expect(r.status).toBe(200)
        expect(estado.envios).toEqual([])
        expect(saidas()).toEqual([])
        expect(entradas()).toHaveLength(1)
        expect(linhaIa()[0]).toEqual(expect.stringContaining('desfecho=sem-saldo'))
        expect(erros.join('\n')).toMatch(/saldo/i)
    })

    it('o contraste: OUTRO erro 400 não é saldo', async () => {
        estado.respostasDaLlm.push({ status: 400, corpo: { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: invalid' } } })
        const r = await chamar()
        expect(r.status).toBe(200)
        expect(estado.envios).toEqual([])
        expect(linhaIa()[0]).toEqual(expect.stringContaining('desfecho=erro-da-llm'))
        expect(linhaIa()[0]).not.toContain('sem-saldo')
    })

    it.each([
        ['500', () => { estado.respostasDaLlm.push({ status: 500, corpo: { type: 'error', error: { type: 'api_error', message: 'x' } } }) }],
        ['exceção de rede', () => { estado.respostasDaLlm.push('lanca') }],
        ['recusa (stop_reason refusal)', () => { estado.respostasDaLlm.push({ status: 200, corpo: { type: 'message', stop_reason: 'refusal', content: [] } }) }],
        ['resposta sem chamar a ferramenta', () => { estado.respostasDaLlm.push({ status: 200, corpo: { type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Olá!' }] } }) }],
    ])('LLM: %s → 200, nada enviado', async (_n, preparar) => {
        preparar()
        const r = await chamar()
        expect(r.status).toBe(200)
        expect(estado.envios).toEqual([])
        expect(saidas()).toEqual([])
        expect(entradas()).toHaveLength(1)
    })

    it('FALHA NO ENVIO do WUZAPI → 200, a entrada continua gravada, nenhuma saída gravada, e o campo validado fica', async () => {
        montar(VAZIA)
        estado.envioStatus = 500
        llmResponde({ campos: { tipologia: 'Janela de correr' } })
        const r = await chamar()
        expect(r.status).toBe(200)
        expect(estado.envios).toHaveLength(1)
        expect(entradas()).toHaveLength(1)
        expect(saidas()).toEqual([])
        expect(preDefinicao()?.tipologia).toBe('Janela de correr')
        expect(linhaIa()[0]).toEqual(expect.stringMatching(/enviou=nao.*desfecho=envio-falhou/))
    })

    it('sem ANTHROPIC_API_KEY → a LLM não é chamada, 200, e o log diz por quê', async () => {
        delete process.env.ANTHROPIC_API_KEY
        const r = await chamar()
        expect(r.status).toBe(200)
        expect(estado.chamadasDaLlm).toEqual([])
        expect(linhaIa()[0]).toEqual(expect.stringContaining('desfecho=sem-chave'))
    })
})

describe('(9) a conversa só roda no desfecho "gravada"', () => {
    it('remetente desconhecido (tentativa-desconhecida) → a LLM NÃO é chamada', async () => {
        await chamar({ senderAlt: '5554988776655' })
        expect(estado.db.orcamentista_tentativa_desconhecida).toHaveLength(1)
        expect(estado.chamadasDaLlm).toEqual([])
        expect(estado.envios).toEqual([])
    })

    it('mensagem repetida (o reenvio do WUZAPI) → a LLM NÃO é chamada de novo: UMA chamada, UMA resposta', async () => {
        llmResponde({ pergunta: { campo: 'tipologia', texto: 'Qual a tipologia?' } })
        await chamar({ id: 'MSG_IGUAL' })
        await chamar({ id: 'MSG_IGUAL' })
        expect(estado.chamadasDaLlm).toHaveLength(1)
        expect(estado.envios).toHaveLength(1)
    })
})

describe('(10) o log [IA]: em console.error, com a contagem — nunca a chave, o telefone ou o texto', () => {
    it('conversa, vazios antes, propostos, descartados, se enviou e o desfecho', async () => {
        montar({ tipologia: 'Janela de correr' })
        llmResponde({ campos: { largura_mm: 1500, altura_mm: 'alto' }, pergunta: { campo: 'altura_mm', texto: 'E a altura?' } })
        await chamar()
        const linha = linhaIa()[0]
        expect(linha).toEqual(expect.stringContaining(`conversa=${CONVERSA}`))
        expect(linha).toEqual(expect.stringContaining('vazios_antes=8'))
        expect(linha).toEqual(expect.stringContaining('propostos=2'))
        expect(linha).toEqual(expect.stringContaining('descartados=1'))
        expect(linha).toEqual(expect.stringContaining('enviou=sim'))
        expect(linha).toEqual(expect.stringContaining('desfecho=perguntou'))
    })

    it('nem a chave, nem o telefone, nem o texto da conversa, nem a pergunta enviada', async () => {
        llmResponde({ pergunta: { campo: 'tipologia', texto: 'Qual a tipologia das esquadrias?' } })
        await chamar()
        const tudo = erros.join('\n')
        for (const s of [CHAVE, TELEFONE_DO_WEBHOOK, TELEFONE_GRAVADO, TEXTO, 'Qual a tipologia das esquadrias?', TOKEN]) expect(tudo).not.toContain(s)
    })
})
