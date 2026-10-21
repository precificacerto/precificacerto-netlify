/**
 * @jest-environment node
 *
 * PORTÃO DE SEGURANÇA — `/api/eduzz` está DESCONTINUADA: responde 410 Gone SEMPRE, e não emite
 * operação nenhuma (dono do produto, 21/10/2026).
 *
 * A HISTÓRIA, porque o portão mudou de forma no mesmo PR (#113):
 *   - a rota comparava `api_key !== process.env.NEXT_PUBLIC_EDUZZ_API_KEY`, e a variável NÃO existe
 *     na Vercel (medido). Sem ela, uma requisição SEM `api_key` virava `undefined !== undefined` →
 *     ACEITA, e a rota criava conta e usuário com `is_super_admin: true` — o CRÍT-2 de
 *     `SECURITY_AUDIT.md`. Os dois vermelhos desse defeito estão no commit `6f03ad9`;
 *   - a primeira correção (`8e6fdd2`) fechou a porta e manteve a integração: 503 sem a variável,
 *     segredo de servidor em tempo constante, nunca super admin;
 *   - MEDIDO EM SEGUIDA, pelo dono do produto: a integração não está em uso — nenhuma tela, rota ou
 *     plano depende dela, e os logs de produção dos últimos 3 dias têm ZERO requisições a
 *     `/api/eduzz`. Decisão: a rota responde 410 sempre.
 *
 *   (1) 410 em todo caminho: sem credencial, com credencial, com a variável definida, sem ela, com a
 *       antiga `NEXT_PUBLIC_`, e em qualquer método;
 *   (2) NENHUMA operação de banco nem de Auth é emitida, em nenhum dos casos — o cliente falso
 *       registra até a CRIAÇÃO de uma consulta (`from`), não só a execução;
 *   (3) o corpo diz, curto, que a integração foi descontinuada.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

const estado = {
    /** Toda chamada ao cliente do banco: `from(tabela)` e `auth.admin.*`. */
    chamadas: [] as string[],
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: new Proxy({}, {
        get: (_alvo, prop: string) => {
            if (prop === 'from') {
                return (tabela: string) => {
                    estado.chamadas.push(`from(${tabela})`)
                    const q: Record<string, unknown> = {}
                    for (const m of ['select', 'eq', 'insert', 'update', 'delete', 'upsert', 'maybeSingle', 'single']) {
                        q[m] = () => q
                    }
                    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
                    return q
                }
            }
            if (prop === 'auth') {
                return {
                    admin: new Proxy({}, {
                        get: (_a, metodo: string) => async (): Promise<{ data: { user: { id: string } }; error: null }> => {
                            estado.chamadas.push(`auth.admin.${metodo}`)
                            return { data: { user: { id: 'x' } }, error: null }
                        },
                    }),
                }
            }
            if (prop === 'rpc') {
                return (nome: string) => { estado.chamadas.push(`rpc(${nome})`); return Promise.resolve({ data: null, error: null }) }
            }
            return undefined
        },
    }),
}))

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
    const saida = { status: 0, corpo: undefined as Record<string, unknown> | undefined }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: Record<string, unknown>) { saida.corpo = b; return res },
        end() { return res },
        setHeader() { return res },
    } as unknown as NextApiResponse
    await rota({ method, body, query: {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}

const PAGAMENTO = { event_name: 'invoice_paid', student_email: 'aluno@exemplo.com' }
const SEGREDO = 'segredo-do-servidor'

beforeEach(() => { estado.chamadas = [] })
afterAll(() => {
    delete process.env.EDUZZ_API_KEY
    delete process.env.NEXT_PUBLIC_EDUZZ_API_KEY
})

type Caso = [string, { EDUZZ_API_KEY?: string; NEXT_PUBLIC_EDUZZ_API_KEY?: string }, unknown, string]
const CASOS: Caso[] = [
    ['sem a variável, SEM credencial — o ataque do CRÍT-2', {}, PAGAMENTO, 'POST'],
    ['sem a variável, com uma credencial qualquer', {}, { ...PAGAMENTO, api_key: 'qualquer' }, 'POST'],
    ['com a variável definida, SEM credencial', { EDUZZ_API_KEY: SEGREDO }, PAGAMENTO, 'POST'],
    ['com a variável definida e a credencial CERTA — o pagamento legítimo', { EDUZZ_API_KEY: SEGREDO }, { ...PAGAMENTO, api_key: SEGREDO }, 'POST'],
    ['só a antiga NEXT_PUBLIC_, com a credencial dela', { NEXT_PUBLIC_EDUZZ_API_KEY: 'publica' }, { ...PAGAMENTO, api_key: 'publica' }, 'POST'],
    ['outro evento, com a credencial certa', { EDUZZ_API_KEY: SEGREDO }, { event_name: 'invoice_refunded', api_key: SEGREDO }, 'POST'],
    ['corpo vazio', {}, undefined, 'POST'],
    ['GET', {}, undefined, 'GET'],
    ['PUT, com a credencial certa', { EDUZZ_API_KEY: SEGREDO }, { ...PAGAMENTO, api_key: SEGREDO }, 'PUT'],
]

describe('(1)(2) 410 em todo caminho — e NENHUMA operação de banco ou de Auth', () => {
    it.each(CASOS)('%s', async (_nome, env, body, metodo) => {
        const r = await chamar(carregar(env), body, metodo)
        expect(r.status).toBe(410)
        expect(estado.chamadas).toEqual([])
    })

    it('o cliente falso ENXERGA uma operação — sem isto, a lista vazia acima não provaria nada', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { supabaseAdmin } = require('@/supabase/admin')
        supabaseAdmin.from('users').select('id')
        await supabaseAdmin.auth.admin.createUser({ email: 'x' })
        expect(estado.chamadas).toEqual(['from(users)', 'auth.admin.createUser'])
    })
})

describe('(3) o corpo diz que a integração foi descontinuada', () => {
    it('curto, e o mesmo em todo caminho', async () => {
        const corpos = []
        for (const [, env, body, metodo] of CASOS) corpos.push((await chamar(carregar(env), body, metodo)).corpo)
        expect(String(corpos[0]?.error)).toMatch(/descontinuada/)
        expect(String(corpos[0]?.error).length).toBeLessThan(120)
        for (const c of corpos) expect(c).toEqual(corpos[0])
    })
})
