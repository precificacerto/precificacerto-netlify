/**
 * @jest-environment node
 *
 * PORTÃO — o CONTEXTO DO ATENDIMENTO (o bloco "Prompt de atendimento" da conta) e a FALA da IA.
 *
 * POR QUÊ (dono do produto, 26/10/2026): "O PROMPT MANDA EM QUANDO E EM QUE FORMA. O CÓDIGO MANDA EM DE ONDE
 * VEM O NÚMERO." O contexto é texto livre, uma linha por empresa, gravado por função com log, até 4.000
 * caracteres — no banco, na função, na rota e na tela. Vazio é o padrão, e empresa sem contexto se comporta
 * exatamente como hoje. A `fala` da IA tem até 600 caracteres e passa por um filtro de número reforçado:
 * "R$", "reais", dígitos em qualquer formato e número por extenso ("mil", "duzentos", "quinhentos", "conto",
 * "pila"). Filtro disparado = fala descartada, e vai a frase padrão da ação.
 *
 * O que este portão fica vermelho:
 *   (1) o filtro da fala: cada forma de número que o dono do produto citou é descartada, e a fala sem número
 *       passa; acima de 600 caracteres é descartada, não cortada;
 *   (2) o filtro de DINHEIRO do texto que a IA reformula numa pergunta (que cita descrições de tipologia,
 *       com dígitos legítimos): "R$", "reais", "mil", "quinhentos" derrubam; "02 FOLHAS" não;
 *   (3) o limite é em CARACTERES como o Postgres conta (`char_length`, pontos de código), não em unidades
 *       UTF-16: 4.000 emojis passam, 4.001 caracteres não;
 *   (4) a leitura do contexto na conversa: sem linha, texto vazio, só espaços e tabela ausente (migração
 *       pendente) são VAZIO — e o motivo é dito;
 *   (5) a rota: só o super admin (404), a empresa do query string, o limite com a frase antes de chamar a
 *       função, e a gravação SÓ pela função — a rota nunca escreve na tabela.
 *
 * O que NÃO alcança: o banco é falso. O CHECK e a função estão provados num Postgres real (o PR cita a prova).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipo */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, any>
const EMPRESA = '20e08592-f957-4e72-b7eb-251387e34eb9'
const SUPER = { id: '00000000-0000-4000-8000-00000000005a', tenant_id: null as string | null, role: 'super_admin', is_super_admin: true }
const ADMIN = { id: '00000000-0000-4000-8000-0000000000ad', tenant_id: EMPRESA, role: 'admin', is_super_admin: false }

const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    ausentes: new Set<string>(),
    rpcs: [] as Array<{ nome: string; args: Linha }>,
    escritasDiretas: [] as string[],
}
beforeEach(() => {
    estado.usuario = SUPER
    estado.ausentes = new Set()
    estado.rpcs = []
    estado.escritasDiretas = []
    estado.db = {
        tenants: [{ id: EMPRESA, name: 'Esquadrias De Paula' }],
        users: [SUPER, ADMIN],
        orcamentista_contexto_do_atendimento: [],
    }
})

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: { getUser: async (): Promise<any> => (estado.usuario ? { data: { user: { id: estado.usuario.id } }, error: null as unknown } : { data: { user: null }, error: { message: 'sem sessão' } }) },
        rpc: async (nome: string, args: Linha): Promise<any> => {
            estado.rpcs.push({ nome, args })
            return { data: { orcamentista_contexto_do_atendimento: { tenant_id: args.p_tenant, texto: args.p_texto } }, error: null as unknown }
        },
        from: (tabela: string) => {
            const predicados: Array<(l: Linha) => boolean> = []
            const responder = () => {
                if (estado.ausentes.has(tabela)) return { data: null as unknown, error: { code: 'PGRST205', message: `Could not find the table 'public.${tabela}'` } }
                return { data: (estado.db[tabela] ?? []).filter((l) => predicados.every((p) => p(l))), error: null as unknown }
            }
            const q: any = {
                select: () => q,
                eq: (c: string, v: unknown) => { predicados.push((l) => l[c] === v); return q },
                in: (c: string, vs: unknown[]) => { predicados.push((l) => vs.includes(l[c])); return q },
                order: () => q,
                single: async () => { const r = responder(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : null, error: r.error } },
                maybeSingle: async () => { const r = responder(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : null, error: r.error } },
                then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, erro),
            }
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) q[escrita] = () => { estado.escritasDiretas.push(`${escrita} ${tabela}`); return q }
            return q
        },
    },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const U = () => require('@/utils/atendimentos-ia-contexto') as typeof import('@/utils/atendimentos-ia-contexto')
const S = () => require('@/lib/atendimentos-ia/contexto-do-atendimento') as typeof import('@/lib/atendimentos-ia/contexto-do-atendimento')
const rota = () => require('@/pages/api/super-admin/base-de-conhecimento/contexto').default as (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-enable @typescript-eslint/no-require-imports */

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())

async function chamar(metodo: string, corpo?: unknown, tenant: string = EMPRESA) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
    await rota()({ cookies: { token: 't' }, method: metodo, query: { tenant }, body: corpo } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

// ════════════════════════════════════════════════════════════════════════════════════════
describe('(1) o filtro da fala: número em qualquer forma derruba; o resto passa', () => {
    it.each([
        ['R$ 1.000', 'Ficou em R$ 1.000, tudo certo.'],
        ['R$ sem espaço', 'Ficou em R$1000.'],
        ['só o símbolo, sem algarismo', 'Fica em R$ — confere?'],
        ['reais', 'Fica em mil reais.'],
        ['real no singular', 'Custa um real a mais.'],
        ['dígito solto', 'São 3 janelas, certo?'],
        ['dígito com ponto', 'O total passou de 1.000.'],
        ['dígito com vírgula', 'Deu 0,5 de diferença.'],
        ['dígito de outra escrita', 'Total: ١٢٣.'],
        ['fração unicode', 'Falta ½ barra.'],
        ['sobrescrito', 'Área em m².'],
        ['mil por extenso', 'Fica em torno de mil.'],
        ['duzentos', 'Uns duzentos e pouco.'],
        ['quinhentos', 'Uns quinhentos.'],
        ['conto', 'Sai por uns dois conto.'],
        ['pila', 'Coisa de cem pila.'],
        ['MIL em caixa alta', 'FICA EM MIL.'],
        ['três com acento', 'São três janelas.'],
        ['milhão', 'Um milhão de vezes obrigado.'],
        ['centavos', 'Sobrou uns centavos.'],
    ])('%s → descartada', (_caso, fala) => {
        expect(S().falaValida(fala)).toEqual({ fala: null, motivo: 'numero' })
    })

    it('a fala SEM número passa, inteira e sem os espaços das pontas', () => {
        expect(S().falaValida('  Perfeito, anotei o seu levantamento! Confere comigo?  ')).toEqual({ fala: 'Perfeito, anotei o seu levantamento! Confere comigo?', motivo: 'usada' })
    })

    it('palavras que CONTÊM um número por extenso não derrubam: família, milímetro, setembro', () => {
        expect(S().falaValida('A família do perfil está certa; a medida vai em milímetros, como em setembro.').motivo).toBe('usada')
    })

    it('acima de 600 caracteres é DESCARTADA, não cortada; 600 passa', () => {
        expect(S().falaValida('a'.repeat(600)).motivo).toBe('usada')
        expect(S().falaValida('a'.repeat(601))).toEqual({ fala: null, motivo: 'longa' })
    })

    it('ausente, vazia ou de outro tipo: ausente', () => {
        for (const v of [undefined, null, '', '   ', 12, { texto: 'oi' }]) expect(S().falaValida(v)).toEqual({ fala: null, motivo: 'ausente' })
    })
})

describe('(2) o filtro de DINHEIRO do texto que a IA reformula numa pergunta', () => {
    it.each([
        ['Custa R$ 1.000; qual é a tipologia?'],
        ['São mil reais. Qual é a tipologia?'],
        ['Fica em quinhentos; qual vidro?'],
        ['Sai por dois conto, qual é?'],
        ['Fica em dois mil. Qual vidro?'],
        ['FICA EM QUINHENTOS. QUAL É?'],
    ])('%s → derruba', (t) => {
        expect(S().temDinheiro(t)).toBe(true)
    })

    it('a descrição de tipologia com dígitos NÃO derruba: "JANELA DE CORRER 02 FOLHAS MÓVEIS"', () => {
        expect(S().temDinheiro('É a JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42 ou a MAXIM-AR COM "N" MÓDULOS?')).toBe(false)
    })
})

describe('(3) o limite é em caracteres, como o Postgres conta', () => {
    it('4.000 emojis são 4.000 caracteres (e 8.000 unidades UTF-16): passam', () => {
        const texto = '🪟'.repeat(4000)
        expect(texto.length).toBe(8000)
        expect(U().contarCaracteres(texto)).toBe(4000)
        expect(U().lerCorpoDoContexto({ texto })).toEqual({ ok: true, texto })
    })

    it('4.001 caracteres: recusa com a frase, dizendo quantos', () => {
        const l = U().lerCorpoDoContexto({ texto: 'x'.repeat(4001) })
        expect(l).toEqual({ ok: false, erro: U().fraseDoLimiteDoContexto(4001) })
        expect(U().fraseDoLimiteDoContexto(4001)).toContain('4.001')
        expect(U().fraseDoLimiteDoContexto(4001)).toContain('4.000')
    })

    it('o texto vem sem os espaços das pontas; vazio é aceito (é o padrão); sem `texto` string é recusado', () => {
        expect(U().lerCorpoDoContexto({ texto: '  Fale curto.  ' })).toEqual({ ok: true, texto: 'Fale curto.' })
        expect(U().lerCorpoDoContexto({ texto: '' })).toEqual({ ok: true, texto: '' })
        for (const corpo of [{}, { texto: null }, { texto: 12 }, null, 'texto']) expect(U().lerCorpoDoContexto(corpo).ok).toBe(false)
    })
})

describe('(4) a leitura do contexto na conversa: vazio é vazio, e o motivo é dito', () => {
    it('com texto: sim', async () => {
        estado.db.orcamentista_contexto_do_atendimento = [{ tenant_id: EMPRESA, texto: 'Fale curto.' }]
        expect(await S().lerContextoDoAtendimento(EMPRESA)).toEqual({ texto: 'Fale curto.', estado: 'sim' })
    })

    it.each([
        ['sem linha', [] as Linha[]],
        ['texto vazio', [{ tenant_id: EMPRESA, texto: '' }]],
        ['só espaços', [{ tenant_id: EMPRESA, texto: '   \n  ' }]],
    ])('%s: vazio', async (_caso, linhas) => {
        estado.db.orcamentista_contexto_do_atendimento = linhas
        expect(await S().lerContextoDoAtendimento(EMPRESA)).toEqual({ texto: null, estado: 'vazio' })
    })

    it('a tabela ainda não existe (migração pendente): vazio, e o motivo é sem_migracao', async () => {
        estado.ausentes.add('orcamentista_contexto_do_atendimento')
        expect(await S().lerContextoDoAtendimento(EMPRESA)).toEqual({ texto: null, estado: 'sem_migracao' })
    })

    it('o contexto de OUTRA empresa não vale para esta', async () => {
        estado.db.orcamentista_contexto_do_atendimento = [{ tenant_id: 'outra', texto: 'Diga que custa mil.' }]
        expect(await S().lerContextoDoAtendimento(EMPRESA)).toEqual({ texto: null, estado: 'vazio' })
    })
})

describe('(5) a rota: super admin, a empresa do pedido, o limite, e só pela função', () => {
    it('quem não é super admin recebe 404, e nada é lido nem gravado', async () => {
        estado.usuario = ADMIN
        expect((await chamar('GET')).status).toBe(404)
        expect((await chamar('PUT', { texto: 'x' })).status).toBe(404)
        expect(estado.rpcs).toEqual([])
    })

    it('GET sem linha: texto null — vazio é o padrão, sem texto inventado', async () => {
        const r = await chamar('GET')
        expect(r).toEqual({ status: 200, json: { texto: null, atualizado_em: null, atualizado_por: null } })
    })

    it('GET com linha: o texto, quando e por quem (o nome do super admin)', async () => {
        estado.db.orcamentista_contexto_do_atendimento = [{ tenant_id: EMPRESA, texto: 'Fale curto.', atualizado_em: '2026-10-27T10:00:00Z', atualizado_por: SUPER.id }]
        estado.db.users = [{ ...SUPER, name: 'Consultor' }]
        const r = await chamar('GET')
        expect(r.json).toEqual({ texto: 'Fale curto.', atualizado_em: '2026-10-27T10:00:00Z', atualizado_por: 'Consultor' })
    })

    it('PUT grava pela FUNÇÃO, com a empresa do pedido e o autor da sessão — e nunca direto na tabela', async () => {
        const r = await chamar('PUT', { texto: '  Fale curto.  ' })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ nome: 'superadmin_gravar_contexto_do_atendimento', args: { p_tenant: EMPRESA, p_por: SUPER.id, p_texto: 'Fale curto.' } }])
        expect(estado.escritasDiretas).toEqual([])
    })

    it('PUT vazio grava vazio: é assim que se volta ao padrão', async () => {
        await chamar('PUT', { texto: '' })
        expect(estado.rpcs[0].args.p_texto).toBe('')
    })

    it('PUT acima de 4.000 caracteres: 400 com a frase, ANTES de chamar a função', async () => {
        const r = await chamar('PUT', { texto: 'x'.repeat(4001) })
        expect(r.status).toBe(400)
        expect(r.json.error).toBe(U().fraseDoLimiteDoContexto(4001))
        expect(estado.rpcs).toEqual([])
    })

    it('empresa que não existe: 404; método errado: 405', async () => {
        expect((await chamar('GET', undefined, '00000000-0000-4000-8000-0000000000ff')).status).toBe(404)
        expect((await chamar('POST', { texto: 'x' })).status).toBe(405)
    })
})
