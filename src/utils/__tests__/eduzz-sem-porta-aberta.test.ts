/**
 * @jest-environment node
 *
 * PORTÃO DE SEGURANÇA — `POST /api/eduzz` não é porta aberta (dono do produto, 21/10/2026).
 *
 * MEDIDO pelo dono do produto: as variáveis de ambiente da Vercel NÃO incluem
 * `NEXT_PUBLIC_EDUZZ_API_KEY`. Com a comparação `api_key !== process.env.NEXT_PUBLIC_EDUZZ_API_KEY`,
 * uma requisição SEM `api_key` virava `undefined !== undefined` → falso → ACEITA, e a rota criava
 * conta e usuário com `is_super_admin: true`. Nada no banco indica que alguém tenha explorado.
 *
 *   (1) variável de servidor AUSENTE → 503, e NADA é processado: nem leitura, nem escrita, nem
 *       usuário no Auth. Falta de configuração nunca vira porta aberta;
 *   (2) o segredo é de SERVIDOR (`EDUZZ_API_KEY`). O `NEXT_PUBLIC_EDUZZ_API_KEY` — que o
 *       navegador lê por definição — NÃO é mais aceito, nem como reserva;
 *   (3) segredo errado ou ausente na requisição → 401, e nada é processado;
 *   (4) a comparação é em TEMPO CONSTANTE (`timingSafeEqual`);
 *   (5) a rota NUNCA cria usuário com `is_super_admin: true` — o caso legítimo cria conta comum.
 *
 * O módulo é recarregado a cada caso (`jest.isolateModules`): a versão antiga lia a variável no
 * carregamento, e um caso que a mudasse depois não exercitaria nada.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>
const estado = {
    ops: [] as { tabela: string; op: string; carga?: unknown }[],
    criadosNoAuth: [] as Linha[],
    usuariosExistentes: [] as Linha[],
}

function cliente() {
    return {
        from: (tabela: string) => {
            let op = 'select'
            let carga: unknown
            const q: Record<string, unknown> = {}
            const resposta = () => {
                estado.ops.push({ tabela, op, carga })
                if (op === 'select' && tabela === 'users') return { data: estado.usuariosExistentes[0] ?? null, error: null }
                if (op === 'insert') return { data: { id: `${tabela}-novo`, ...(carga as Linha) }, error: null }
                return { data: null, error: null }
            }
            q.select = () => q
            q.eq = () => q
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return q }
            q.maybeSingle = () => Promise.resolve(resposta())
            q.single = () => Promise.resolve(resposta())
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, erro)
            return q
        },
        auth: {
            admin: {
                createUser: async (dados: Linha) => {
                    estado.criadosNoAuth.push(dados)
                    return { data: { user: { id: 'auth-novo' } }, error: null }
                },
            },
        },
    }
}
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: cliente() }))

type Rota = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
function carregar(env: { EDUZZ_API_KEY?: string; NEXT_PUBLIC_EDUZZ_API_KEY?: string }): Rota {
    delete process.env.EDUZZ_API_KEY
    delete process.env.NEXT_PUBLIC_EDUZZ_API_KEY
    if (env.EDUZZ_API_KEY !== undefined) process.env.EDUZZ_API_KEY = env.EDUZZ_API_KEY
    if (env.NEXT_PUBLIC_EDUZZ_API_KEY !== undefined) process.env.NEXT_PUBLIC_EDUZZ_API_KEY = env.NEXT_PUBLIC_EDUZZ_API_KEY
    let rota: Rota | undefined
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        rota = require('@/pages/api/eduzz/index').default
    })
    return rota as Rota
}

async function chamar(rota: Rota, body: unknown, method = 'POST') {
    const saida = { status: 200, corpo: {} as Record<string, unknown> }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: Record<string, unknown>) { saida.corpo = b; return res },
        end() { return res },
    } as unknown as NextApiResponse
    await rota({ method, body, query: {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}

const PAGAMENTO = { event_name: 'invoice_paid', student_email: 'aluno@exemplo.com' }
const nadaProcessado = () => {
    expect(estado.ops).toEqual([])
    expect(estado.criadosNoAuth).toEqual([])
}
const usuariosInseridos = () => estado.ops.filter((o) => o.tabela === 'users' && o.op === 'insert').map((o) => o.carga as Linha)

beforeEach(() => {
    estado.ops = []
    estado.criadosNoAuth = []
    estado.usuariosExistentes = []
})
afterAll(() => {
    delete process.env.EDUZZ_API_KEY
    delete process.env.NEXT_PUBLIC_EDUZZ_API_KEY
})

describe('(1) variável AUSENTE: 503, e nada é processado', () => {
    it('requisição SEM credencial nenhuma, sem a variável definida: 503 — e nem lê o banco', async () => {
        const r = await chamar(carregar({}), PAGAMENTO)
        expect(r.status).toBe(503)
        nadaProcessado()
    })

    it('nem com uma api_key qualquer no corpo', async () => {
        const r = await chamar(carregar({}), { ...PAGAMENTO, api_key: 'qualquer' })
        expect(r.status).toBe(503)
        nadaProcessado()
    })

    it('variável definida VAZIA também é ausente', async () => {
        const r = await chamar(carregar({ EDUZZ_API_KEY: '' }), { ...PAGAMENTO, api_key: '' })
        expect(r.status).toBe(503)
        nadaProcessado()
    })
})

describe('(2) o segredo é de SERVIDOR — o NEXT_PUBLIC_ não vale mais', () => {
    it('só NEXT_PUBLIC_EDUZZ_API_KEY definida: 503, mesmo com a chave certa no corpo', async () => {
        const r = await chamar(carregar({ NEXT_PUBLIC_EDUZZ_API_KEY: 'publica' }), { ...PAGAMENTO, api_key: 'publica' })
        expect(r.status).toBe(503)
        nadaProcessado()
    })
})

describe('(3) segredo errado ou ausente na requisição: 401, e nada é processado', () => {
    it.each([
        ['sem api_key', undefined],
        ['api_key errada', 'errada'],
        ['api_key vazia', ''],
        ['api_key com prefixo do segredo', 'segredo-do-servidor-'],
        ['api_key que não é texto', 12345],
    ])('%s', async (_nome, api_key) => {
        const r = await chamar(carregar({ EDUZZ_API_KEY: 'segredo-do-servidor' }), { ...PAGAMENTO, api_key })
        expect(r.status).toBe(401)
        nadaProcessado()
    })
})

describe('(4) a comparação é em tempo constante', () => {
    it('usa timingSafeEqual — sobre resumos de mesmo tamanho, sem revelar o tamanho do segredo', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const crypto = require('crypto') as typeof import('crypto')
        const espiao = jest.spyOn(crypto, 'timingSafeEqual')
        try {
            await chamar(carregar({ EDUZZ_API_KEY: 'segredo-do-servidor' }), { ...PAGAMENTO, api_key: 'curta' })
            expect(espiao).toHaveBeenCalled()
            const [a, b] = espiao.mock.calls[0] as [Buffer, Buffer]
            expect(a.length).toBe(b.length)
        } finally {
            espiao.mockRestore()
        }
    })
})

describe('(5) NUNCA cria super admin', () => {
    it('sem a variável e sem credencial: nenhum usuário com is_super_admin true é inserido', async () => {
        await chamar(carregar({}), PAGAMENTO)
        expect(usuariosInseridos().filter((u) => u.is_super_admin === true)).toEqual([])
    })

    it('o caso legítimo (segredo certo, pagamento): cria a conta, com usuário COMUM — is_super_admin false', async () => {
        const r = await chamar(carregar({ EDUZZ_API_KEY: 'segredo-do-servidor' }), { ...PAGAMENTO, api_key: 'segredo-do-servidor' })
        expect(r.status).toBe(200)
        const usuarios = usuariosInseridos()
        expect(usuarios).toHaveLength(1)
        expect(usuarios[0]).toEqual(expect.objectContaining({ email: 'aluno@exemplo.com', is_super_admin: false }))
        expect(estado.criadosNoAuth).toHaveLength(1)
    })
})
