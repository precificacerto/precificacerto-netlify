/**
 * @jest-environment node
 *
 * PORTÃO — o TESTE DE ENVIO DE ANEXO pela conexão do orçamentista
 * (`POST /api/super-admin/atendimentos-ia/contas/[tenantId]/teste-de-anexo`).
 *
 * POR QUÊ (dono do produto, 26/10/2026): o passo 2 do roteiro da primeira empresa é um ARQUIVO enviado no WhatsApp.
 * "MEÇA ISSO PRIMEIRO, com um envio de teste, antes de construir o resto. Se o anexo não sair por essa conexão, todo o
 * passo 2 muda de forma." Medido antes de escrever esta rota: o envio de documento que existe (`sendWuzapiDocument`) usa o
 * token do USUÁRIO, nunca o da conexão do orçamentista, e `whatsapp_dispatches` está vazia — nunca houve um envio de
 * documento registrado. O token da conexão é segredo: quem envia é o servidor, e ele não sai na resposta nem no log.
 *
 * A rota manda um PDF de uma página, gerado no servidor com jsPDF, ao remetente autorizado ATIVO da conta, e devolve só o
 * resultado: enviado ou não, o tempo e o tamanho. Sem o telefone e sem o token — nem na resposta, nem no log.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, any>
const CONTA = '00000000-0000-4000-8000-0000000000a1'
const OUTRA = '00000000-0000-4000-8000-0000000000b2'
const TOKEN = 'orc_TOKEN_DA_CONEXAO_9f8e7d'
const TELEFONE = '51999114290'
const SUPER = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN = { id: 'u-admin', tenant_id: CONTA, role: 'admin', is_super_admin: false }

const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    envios: [] as Array<{ url: string; headers: Record<string, string>; corpo: Linha }>,
    resposta: { status: 200, texto: '{"code":200,"success":true}' },
}

function montar() {
    estado.usuario = SUPER
    estado.envios = []
    estado.resposta = { status: 200, texto: '{"code":200,"success":true}' }
    estado.db = {
        users: [SUPER, ADMIN],
        tenants: [{ id: CONTA }, { id: OUTRA }],
        whatsapp_conexao: [
            { id: 'c1', tenant_id: CONTA, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN, ativo: true },
            { id: 'c2', tenant_id: OUTRA, canal: 'ORCAMENTISTA', wuzapi_token: 'outro-token', ativo: true },
        ],
        orcamentista_remetente_autorizado: [
            { id: 'r1', tenant_id: CONTA, telefone: TELEFONE, ativo: true, nome: 'Cristiano Fernandes' },
            { id: 'r-velho', tenant_id: CONTA, telefone: '51988887777', ativo: false, nome: 'Fulano' },
            { id: 'r-outra', tenant_id: OUTRA, telefone: '51977776666', ativo: true, nome: 'Beltrana' },
        ],
    }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async () => (estado.usuario
                ? { data: { user: { id: String(estado.usuario.id) } }, error: null }
                : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            const linhas = () => (estado.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v))
            const q: any = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.order = () => q
            q.maybeSingle = async () => ({ data: linhas()[0] ?? null, error: null })
            q.single = async () => { const l = linhas(); return l.length === 1 ? { data: l[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'linhas' } } }
            q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas(), error: null }).then(ok)
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) q[escrita] = () => { throw new Error(`o teste de anexo não escreve: ${escrita} ${tabela}`) }
            return q
        },
    },
}))

const erros: string[] = []
beforeAll(() => {
    global.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
        estado.envios.push({ url: String(url), headers: init.headers, corpo: JSON.parse(init.body) })
        return { ok: estado.resposta.status < 300, status: estado.resposta.status, text: async () => estado.resposta.texto } as unknown as Response
    }) as unknown as typeof fetch
    jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erros.push(a.map(String).join(' ')) })
    jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { erros.push(a.map(String).join(' ')) })
})
beforeEach(() => { montar(); erros.length = 0 })

// lida na CHAMADA: no commit do teste vermelho a rota ainda não existe
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = () => require('@/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/teste-de-anexo').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>

async function chamar(tenantId: string, metodo = 'POST') {
    const saida = { status: 0, corpo: null as Linha | null }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(c: Linha) { saida.corpo = c; return res },
        setHeader() { return res },
        end() { return res },
    } as unknown as NextApiResponse
    await rota()({ method: metodo, query: { tenantId }, cookies: { token: 'sessao' }, body: {}, headers: {} } as unknown as NextApiRequest, res)
    return saida
}

describe('o teste de envio de anexo pela conexão do orçamentista', () => {
    it('o super admin envia: um PDF, pela conexão da CONTA, ao remetente ATIVO dela — e a resposta diz que foi', async () => {
        const r = await chamar(CONTA)
        expect(r.status).toBe(200)
        expect(r.corpo).toEqual(expect.objectContaining({ enviado: true }))
        expect(estado.envios).toHaveLength(1)
        const envio = estado.envios[0]
        expect(envio.url).toMatch(/\/chat\/send\/document$/)
        expect(envio.headers.token).toBe(TOKEN)
        expect(String(envio.corpo.Phone)).toContain(TELEFONE)
        expect(String(envio.corpo.FileName)).toMatch(/\.pdf$/)
        // o arquivo é um PDF de verdade: o base64 decodifica para um arquivo que começa com %PDF
        const base64 = String(envio.corpo.Document).replace(/^data:[^;]+;base64,/, '')
        expect(Buffer.from(base64, 'base64').subarray(0, 4).toString('latin1')).toBe('%PDF')
        expect(r.corpo?.bytes).toBe(Buffer.from(base64, 'base64').length)
        expect(typeof r.corpo?.ms).toBe('number')
    })

    it('a resposta e o log trazem o resultado, o tempo e o tamanho — NUNCA o token nem o telefone', async () => {
        await chamar(CONTA)
        const tudo = `${JSON.stringify((await chamar(CONTA)).corpo)}\n${erros.join('\n')}`
        expect(tudo.includes(TOKEN)).toBe(false)
        expect(tudo.includes(TELEFONE)).toBe(false)
        expect(erros.some((l) => /teste-de-anexo enviado=sim status=200 bytes=\d+ ms=\d+/.test(l))).toBe(true)
    })

    it('o WUZAPI recusa: a resposta diz que NÃO foi, com o status — e o texto dele sem dígitos de telefone', async () => {
        estado.resposta = { status: 500, texto: `{"code":500,"error":"failed to send document to ${TELEFONE}@s.whatsapp.net"}` }
        const r = await chamar(CONTA)
        expect(r.status).toBe(502)
        expect(r.corpo).toEqual(expect.objectContaining({ enviado: false, status: 500 }))
        expect(JSON.stringify(r.corpo).includes(TELEFONE)).toBe(false)
        expect(erros.some((l) => /teste-de-anexo enviado=nao status=500/.test(l))).toBe(true)
    })

    it('quem não é super admin: 404, e nenhum envio', async () => {
        estado.usuario = ADMIN
        const r = await chamar(CONTA)
        expect(r.status).toBe(404)
        expect(estado.envios).toEqual([])
    })

    it('a conta sem a conexão do orçamentista ativa: 409 dizendo isso, e nenhum envio', async () => {
        estado.db.whatsapp_conexao[0].ativo = false
        const r = await chamar(CONTA)
        expect(r.status).toBe(409)
        expect(String(r.corpo?.error)).toContain('conexão do orçamentista')
        expect(estado.envios).toEqual([])
    })

    it('sem remetente ativo, ou com mais de um: 409 dizendo quantos — nunca "o primeiro" — e nenhum envio', async () => {
        estado.db.orcamentista_remetente_autorizado[0].ativo = false
        const nenhum = await chamar(CONTA)
        expect(nenhum.status).toBe(409)
        expect(String(nenhum.corpo?.error)).toContain('nenhum remetente autorizado ativo')
        estado.db.orcamentista_remetente_autorizado[0].ativo = true
        estado.db.orcamentista_remetente_autorizado[1].ativo = true
        const dois = await chamar(CONTA)
        expect(dois.status).toBe(409)
        expect(String(dois.corpo?.error)).toContain('2 remetentes autorizados ativos')
        expect(estado.envios).toEqual([])
    })

    it('conta que não existe, ou id que não é uuid: 404; método errado: 405', async () => {
        expect((await chamar('00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
        expect((await chamar('nao-e-uuid')).status).toBe(404)
        expect((await chamar(CONTA, 'GET')).status).toBe(405)
        expect(estado.envios).toEqual([])
    })
})
