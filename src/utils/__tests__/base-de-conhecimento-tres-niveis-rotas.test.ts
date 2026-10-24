/**
 * @jest-environment node
 *
 * PORTÃO — as ROTAS da base de conhecimento em TRÊS NÍVEIS (super admin). O tenant chega pelo PEDIDO.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O banco é FALSO: leituras em memória, e o `rpc` só REGISTRA a chamada e devolve o que o caso
 * mandar. O que as SETE FUNÇÕES fazem — ordem pela posição, merge do config, um principal, nicho do
 * fornecedor, usa NULL × false no banco, a árvore no log do remover — está provado num Postgres
 * real, em `scripts/harness/tres-niveis/` (47 casos, 23 mutações).
 * O que ESTE portão prova é o que as ROTAS decidem: quem passa (404 para o resto, sem rpc), o
 * tenant e os ids que existem, que o `por` é o da SESSÃO e nunca do corpo, que o corpo chega à
 * função SEM ser reescrito (null, false e ausente intactos), que o erro da função vira status com a
 * mensagem dela nos quatro códigos combinados — e só neles —, e que o GET devolve a árvore sem
 * trocar null por false nem por vazio.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, any>

const T_A = '00000000-0000-4000-8000-0000000000a1'
const T_B = '00000000-0000-4000-8000-0000000000b2'
const T_SEM_NICHO = '00000000-0000-4000-8000-0000000000c3'
const T_INEXISTENTE = '00000000-0000-4000-8000-0000000000ff'
const N_ESQ = '00000000-0000-4000-8000-0000000000e1'
const N_MARC = '00000000-0000-4000-8000-0000000000e2'
const F_WOLFF = '00000000-0000-4000-8000-0000000000f1'
const F_ALCOA = '00000000-0000-4000-8000-0000000000f2'
const F_MADEIRA = '00000000-0000-4000-8000-0000000000f3'
const MP_PVC = '00000000-0000-4000-8000-00000000d001'
const MP_ALU = '00000000-0000-4000-8000-00000000d002'
const MP_DE_B = '00000000-0000-4000-8000-00000000d003'
const TAB_DE_A = '00000000-0000-4000-8000-00000000ab01'
const TAB_DE_B = '00000000-0000-4000-8000-00000000ab02'
const TAB_SEM_USO = '00000000-0000-4000-8000-00000000ab03'
/**
 * O PostgREST CORTA a resposta (max_rows, 1000 em produção). Aqui o corte é 3, nas tabelas do motor:
 * `orcamentista_motor_regra` tem 12.116 linhas na tabela em uso, medido em 23/10/2026, e ler tudo
 * para tirar os distintos no JS perderia linha em silêncio.
 */
const CORTE_DO_POSTGREST = 3
const CORTADAS = new Set(['orcamentista_motor_formula_familia', 'orcamentista_motor_regra'])
const CATEGORIAS = ['PERFIL', 'REFORCO', 'FERRAGENS', 'ACESSORIOS_VEDACAO', 'VIDRO', 'INSTALACAO']
// id da categoria: os 32 primeiros caracteres da matéria-prima + 'c' + os 2 últimos dela + a posição — um uuid válido
const cat = (mp: string, chave: string) => `${mp.slice(0, 32)}c${mp.slice(-2)}${CATEGORIAS.indexOf(chave) + 1}`
const C_PVC_PERFIL = cat(MP_PVC, 'PERFIL')
const C_PVC_VIDRO = cat(MP_PVC, 'VIDRO')
const C_PVC_INSTALACAO = cat(MP_PVC, 'INSTALACAO')

type Perfil = { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
type RespostaDoBanco = { data: unknown; error: { code?: string; message: string } | null }
const SUPER: Perfil = { id: '00000000-0000-4000-8000-00000000005a', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN_DE_TENANT: Perfil = { id: '00000000-0000-4000-8000-0000000000ad', tenant_id: T_A, role: 'admin', is_super_admin: false }
const COMUM: Perfil = { id: '00000000-0000-4000-8000-0000000000c0', tenant_id: T_A, role: 'user', is_super_admin: false }

const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    rpcs: [] as Array<{ nome: string; args: Linha }>,
    escritasDiretas: [] as string[],
    respostaDoRpc: null as null | RespostaDoBanco,
}

function categoriasDe(tenant: string, mp: string): Linha[] {
    return CATEGORIAS.map((chave) => ({ id: cat(mp, chave), tenant_id: tenant, materia_prima_id: mp, categoria_chave: chave, config: null as Linha | null, atualizado_por: null as string | null, atualizado_em: '2026-10-23T12:00:00Z' }))
}

function montar() {
    estado.usuario = SUPER
    estado.rpcs = []
    estado.escritasDiretas = []
    estado.respostaDoRpc = null
    estado.db = {
        users: [SUPER, ADMIN_DE_TENANT, COMUM],
        tenants: [{ id: T_A }, { id: T_B }, { id: T_SEM_NICHO }],
        orcamentista_nicho: [
            { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
            { id: N_MARC, modelo: 'FABRICACAO', nome: 'Marcenaria' },
        ],
        orcamentista_config: [
            { tenant_id: T_A, nicho_id: N_ESQ },
            { tenant_id: T_B, nicho_id: N_MARC },
        ],
        orcamentista_fornecedor: [
            { id: F_WOLFF, nicho_id: N_ESQ, nome: 'Wolff', criado_em: null, criado_por: null },
            { id: F_ALCOA, nicho_id: N_ESQ, nome: 'Alcoa', criado_em: null, criado_por: null },
            { id: F_MADEIRA, nicho_id: N_MARC, nome: 'Madeireira', criado_em: null, criado_por: null },
        ],
        orcamentista_categoria_catalogo: [
            { chave: 'VIDRO', ordem: 5, rotulo: 'Vidro' },
            { chave: 'PERFIL', ordem: 1, rotulo: 'Perfil' },
            { chave: 'REFORCO', ordem: 2, rotulo: 'Reforço de aço' },
            { chave: 'INSTALACAO', ordem: 6, rotulo: 'Instalação' },
            { chave: 'FERRAGENS', ordem: 3, rotulo: 'Ferragens' },
            { chave: 'ACESSORIOS_VEDACAO', ordem: 4, rotulo: 'Acessórios e vedação' },
        ],
        orcamentista_categoria_campo: [
            { categoria_chave: 'PERFIL', chave: 'linha', tipo: 'texto', rotulo: 'Linha', ordem: 1 },
            { categoria_chave: 'REFORCO', chave: 'usa', tipo: 'booleano', rotulo: 'Usa reforço', ordem: 1 },
        ],
        orcamentista_materia_prima: [
            { id: MP_ALU, tenant_id: T_A, nome: 'Alumínio', ordem: 2, atualizado_por: null, atualizado_em: null },
            { id: MP_PVC, tenant_id: T_A, nome: 'PVC', ordem: 1, atualizado_por: null, atualizado_em: null },
            { id: MP_DE_B, tenant_id: T_B, nome: 'MDF', ordem: 1, atualizado_por: null, atualizado_em: null },
        ],
        orcamentista_mp_categoria: [...categoriasDe(T_A, MP_PVC), ...categoriasDe(T_A, MP_ALU), ...categoriasDe(T_B, MP_DE_B)],
        orcamentista_mp_categoria_fornecedor: [],
        orcamentista_mp_vidro: [],
        orcamentista_mp_ferragem: [],
        orcamentista_mp_instalacao: [],
        orcamentista_conta_tabela: [{ tenant_id: T_A, tabela_id: TAB_DE_A }, { tenant_id: T_B, tabela_id: TAB_DE_B }],
        orcamentista_tabela: [{ id: TAB_DE_A, fornecedor_id: F_WOLFF }, { id: TAB_DE_B, fornecedor_id: F_MADEIRA }, { id: TAB_SEM_USO, fornecedor_id: F_ALCOA }],
        // EUROPA 60 só na fórmula; SUPREMA só na regra, e DEPOIS do corte — quem lê tudo e tira os distintos no JS não a vê
        orcamentista_motor_formula_familia: [
            { tabela_id: TAB_DE_A, linha: 'EUROPA 60' }, { tabela_id: TAB_DE_A, linha: 'EUROPA 42' }, { tabela_id: TAB_DE_A, linha: 'EUROPA 42' },
            { tabela_id: TAB_DE_A, linha: null }, { tabela_id: TAB_DE_B, linha: 'MDF Y' }, { tabela_id: TAB_SEM_USO, linha: 'ALCOA X' },
        ],
        orcamentista_motor_regra: [
            ...Array.from({ length: 5 }, () => ({ tabela_id: TAB_DE_A, linha: 'EUROPA 42' })),
            { tabela_id: TAB_DE_A, linha: null }, { tabela_id: TAB_DE_A, linha: 'SUPREMA' }, { tabela_id: TAB_SEM_USO, linha: 'ALCOA Z' },
        ],
    }
}

/** A lista do `in` do PostgREST — `("a","b \"c\"")` — de volta para os valores. */
const valoresDoIn = (lista: string) => Array.from(lista.matchAll(/"((?:[^"\\]|\\.)*)"/g)).map((m) => m[1].replace(/\\(.)/g, '$1'))

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> => (estado.usuario
                ? { data: { user: { id: String(estado.usuario.id) } }, error: null }
                : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        rpc: async (nome: string, args: Linha): Promise<RespostaDoBanco> => {
            estado.rpcs.push({ nome, args: JSON.parse(JSON.stringify(args)) })
            return estado.respostaDoRpc ?? { data: { depois: 'da função' }, error: null }
        },
        from: (tabela: string) => {
            const filtros: Array<(l: Linha) => boolean> = []
            let ordem: string | null = null
            let limite = Infinity
            const linhas = () => {
                const l = (estado.db[tabela] ?? []).filter((x) => filtros.every((f) => f(x)))
                if (ordem) { const c = ordem; l.sort((a, b) => String(a[c] ?? '').localeCompare(String(b[c] ?? ''))) }
                return l.slice(0, Math.min(limite, CORTADAS.has(tabela) ? CORTE_DO_POSTGREST : Infinity))
            }
            const q: any = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.not = (c: string, op: string, v: unknown) => {
                if (op === 'is' && v === null) filtros.push((l) => l[c] !== null && l[c] !== undefined)
                else if (op === 'in') { const fora = valoresDoIn(String(v)); filtros.push((l) => !fora.includes(String(l[c]))) }
                else throw new Error(`not(${op}) sem suporte no banco falso`)
                return q
            }
            q.order = (c: string) => { ordem = c; return q }
            q.limit = (n: number) => { limite = n; return q }
            q.maybeSingle = async (): Promise<RespostaDoBanco> => ({ data: linhas()[0] ?? null, error: null })
            q.single = async (): Promise<RespostaDoBanco> => {
                const l = linhas()
                return l.length === 1 ? { data: l[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'linhas' } }
            }
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve<RespostaDoBanco>({ data: linhas(), error: null }).then(ok, erro)
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) {
                q[escrita] = () => { estado.escritasDiretas.push(`${escrita} ${tabela}`); return q }
            }
            return q
        },
    },
}))

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
// lidas na CHAMADA: no commit do portão as rotas ainda não existem, e um `require` no topo derrubaria o arquivo inteiro
const rota = (arquivo: string): Rota => (q, s) => require(`@/pages/api/super-admin/base-de-conhecimento/${arquivo}`).default(q, s)
/* eslint-enable @typescript-eslint/no-require-imports */
const ROTAS = {
    arvore: rota('arvore'),
    materiaPrima: rota('materia-prima'),
    categoria: rota('categoria'),
    fornecedores: rota('fornecedores'),
    vidros: rota('vidros'),
    ferragens: rota('ferragens'),
    instalacao: rota('instalacao'),
}

async function chamar(nome: keyof typeof ROTAS, method: string, query: Linha = {}, body?: unknown) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
    await ROTAS[nome]({ cookies: { token: 't' }, method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

const nenhumaEscrita = () => { expect(estado.rpcs).toEqual([]); expect(estado.escritasDiretas).toEqual([]) }

let silencio: jest.SpyInstance
beforeEach(() => { montar(); silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined) })
afterEach(() => silencio.mockRestore())

// Cada rota que grava, com corpo VÁLIDO: a recusa tem de vir do portão, não de um corpo ruim.
type Caso = [keyof typeof ROTAS, string, Linha, unknown, string, Linha]
const CADA_ESCRITA: Caso[] = [
    ['materiaPrima', 'PUT', { tenant: T_A }, { materias_primas: [{ nome: 'PVC' }] }, 'superadmin_gravar_materia_prima', { p_tenant: T_A, p_lista: [{ nome: 'PVC' }] }],
    ['categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC, categoria: 'PERFIL' }, { config: { linha: 'Suprema' } }, 'superadmin_gravar_mp_categoria',
        { p_tenant: T_A, p_materia_prima: MP_PVC, p_categoria: 'PERFIL', p_corpo: { linha: 'Suprema' } }],
    ['fornecedores', 'PUT', { tenant: T_A, mp_categoria: C_PVC_PERFIL }, { fornecedores: [{ fornecedor_id: F_WOLFF, principal: true }] }, 'superadmin_gravar_mp_fornecedores',
        { p_tenant: T_A, p_mp_categoria: C_PVC_PERFIL, p_lista: [{ fornecedor_id: F_WOLFF, principal: true }] }],
    ['vidros', 'PUT', { tenant: T_A, mp_categoria: C_PVC_VIDRO }, { vidros: [{ descricao: 'Incolor 4 mm' }] }, 'superadmin_gravar_mp_vidros',
        { p_tenant: T_A, p_mp_categoria: C_PVC_VIDRO, p_lista: [{ descricao: 'Incolor 4 mm' }] }],
    ['ferragens', 'PUT', { tenant: T_A, mp_categoria: cat(MP_PVC, 'FERRAGENS') }, { ferragens: [{ tipologia: 'JVC', referencia: 'F-1' }] }, 'superadmin_gravar_mp_ferragens',
        { p_tenant: T_A, p_mp_categoria: cat(MP_PVC, 'FERRAGENS'), p_lista: [{ tipologia: 'JVC', referencia: 'F-1' }] }],
    ['instalacao', 'PUT', { tenant: T_A, mp_categoria: C_PVC_INSTALACAO }, { instalacao: [{ produto: 'CONTRAMARCO' }] }, 'superadmin_gravar_mp_instalacao',
        { p_tenant: T_A, p_mp_categoria: C_PVC_INSTALACAO, p_lista: [{ produto: 'CONTRAMARCO' }] }],
    ['materiaPrima', 'DELETE', { tenant: T_A, materia_prima: MP_PVC }, undefined, 'superadmin_remover_materia_prima', { p_tenant: T_A, p_materia_prima: MP_PVC }],
    ['arvore', 'PUT', { tenant: T_A }, { arvore: { materias_primas: [{ nome: 'PVC' }] } }, 'superadmin_gravar_arvore', { p_tenant: T_A, p_arvore: { materias_primas: [{ nome: 'PVC' }] } }],
]
const CADA_ROTA: Array<[keyof typeof ROTAS, string, Linha, unknown]> = [
    ['arvore', 'GET', { tenant: T_A }, undefined],
    ...CADA_ESCRITA.map(([r, m, q, b]): [keyof typeof ROTAS, string, Linha, unknown] => [r, m, q, b]),
]

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) o portão: quem não é super admin recebe 404 — e nenhuma chamada à função', () => {
    it.each(CADA_ROTA)('%s %s com usuário comum → 404', async (r, metodo, query, body) => {
        estado.usuario = COMUM
        expect((await chamar(r, metodo, query, body)).status).toBe(404)
        nenhumaEscrita()
    })

    it.each(CADA_ROTA)('%s %s com admin de tenant → 404', async (r, metodo, query, body) => {
        estado.usuario = ADMIN_DE_TENANT
        expect((await chamar(r, metodo, query, body)).status).toBe(404)
        nenhumaEscrita()
    })

    it.each(CADA_ROTA)('%s %s sem sessão → 404, não 401', async (r, metodo, query, body) => {
        estado.usuario = null
        expect((await chamar(r, metodo, query, body)).status).toBe(404)
        nenhumaEscrita()
    })
})

describe('(2) o tenant e os ids vêm do QUERY STRING: uuid e existente, senão 404 — sem chamada', () => {
    it.each(CADA_ROTA)('%s %s com tenant inexistente → 404', async (r, metodo, query, body) => {
        expect((await chamar(r, metodo, { ...query, tenant: T_INEXISTENTE }, body)).status).toBe(404)
        nenhumaEscrita()
    })

    it.each(CADA_ESCRITA.filter(([, , q]) => 'materia_prima' in q || 'mp_categoria' in q))('%s %s com o id da linha que não é uuid → 404', async (r, metodo, query, body) => {
        const q = { ...query }
        if ('materia_prima' in q) q.materia_prima = 'abc'
        if ('mp_categoria' in q) q.mp_categoria = 'abc'
        expect((await chamar(r, metodo, q, body)).status).toBe(404)
        nenhumaEscrita()
    })

    it('categoria sem a chave da categoria no query → 400 nomeado, sem chamada', async () => {
        const r = await chamar('categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC }, { config: { linha: 'x' } })
        expect(r.status).toBe(400)
        expect(r.json.erros).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'categoria' })]))
        nenhumaEscrita()
    })
})

describe('(3) o `por` é o da SESSÃO — no corpo, é erro', () => {
    it.each(CADA_ESCRITA)('%s %s: a função recebe p_por = o usuário da sessão', async (r, metodo, query, body) => {
        await chamar(r, metodo, query, body)
        expect(estado.rpcs).toHaveLength(1)
        expect(estado.rpcs[0].args.p_por).toBe(SUPER.id)
    })

    it.each(CADA_ESCRITA)('%s %s: `por` no corpo → 400 nomeado, e nenhuma chamada', async (r, metodo, query, body) => {
        const r2 = await chamar(r, metodo, query, { ...((body as Linha) ?? {}), por: ADMIN_DE_TENANT.id })
        expect(r2.status).toBe(400)
        expect(r2.json.erros).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'por' })]))
        nenhumaEscrita()
    })

    it.each(CADA_ESCRITA.filter(([, m]) => m === 'PUT'))('%s %s: tenant no corpo → 400, não é usado', async (r, metodo, query, body) => {
        const r2 = await chamar(r, metodo, query, { ...(body as Linha), tenant_id: T_B })
        expect(r2.status).toBe(400)
        nenhumaEscrita()
    })

    it.each(CADA_ESCRITA.filter(([, m]) => m === 'PUT'))('%s %s: corpo sem a chave da rota → 400', async (r, metodo, query) => {
        const r2 = await chamar(r, metodo, query, {})
        expect(r2.status).toBe(400)
        nenhumaEscrita()
    })
})

describe('(4) 1:1 — cada rota chama UMA função, com o corpo como veio', () => {
    it.each(CADA_ESCRITA)('%s %s → %s, com os argumentos esperados', async (r, metodo, query, body, funcao, args) => {
        const resp = await chamar(r, metodo, query, body)
        expect(resp.status).toBe(200)
        expect(estado.rpcs).toEqual([{ nome: funcao, args: { ...args, p_por: SUPER.id } }])
        expect(estado.escritasDiretas).toEqual([])
    })

    it.each(CADA_ESCRITA)('%s %s: a resposta é o depois que a função devolveu', async (r, metodo, query, body) => {
        estado.respostaDoRpc = { data: { orcamentista_x: [{ a: null, b: false }] }, error: null }
        const resp = await chamar(r, metodo, query, body)
        expect(resp.json).toEqual({ depois: { orcamentista_x: [{ a: null, b: false }] } })
    })

    it('instalação: usa null, usa false e usa ausente chegam à função como vieram — nenhum colapsa', async () => {
        const lista = [{ produto: 'CONTRAMARCO', usa: null }, { produto: 'ARREMATE_INTERNO', usa: false }, { produto: 'ARREMATE_EXTERNO', referencia: 'AE-1' }]
        await chamar('instalacao', 'PUT', { tenant: T_A, mp_categoria: C_PVC_INSTALACAO }, { instalacao: lista })
        const enviada = estado.rpcs[0].args.p_lista
        expect(enviada).toEqual(lista)
        expect(enviada[0]).toHaveProperty('usa', null)
        expect(enviada[1]).toHaveProperty('usa', false)
        expect('usa' in enviada[2]).toBe(false)
    })

    it('categoria: chave com null vai null (limpar), chave ausente não vai, false vai false', async () => {
        await chamar('categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC, categoria: 'REFORCO' }, { config: { usa: false, material: null } })
        expect(estado.rpcs[0].args.p_corpo).toEqual({ usa: false, material: null })
        expect(Object.keys(estado.rpcs[0].args.p_corpo)).toEqual(['usa', 'material'])
    })

    it('vidros: onde_predomina vazio vai vazio, ausente fica ausente', async () => {
        const lista = [{ descricao: 'Fumê', onde_predomina: [] as string[] }, { descricao: 'Bronze' }]
        await chamar('vidros', 'PUT', { tenant: T_A, mp_categoria: C_PVC_VIDRO }, { vidros: lista })
        expect(estado.rpcs[0].args.p_lista).toEqual(lista)
        expect('onde_predomina' in estado.rpcs[0].args.p_lista[1]).toBe(false)
    })

    it('a rota não acrescenta ordem: a ordem é a posição, e quem decide é a função', async () => {
        await chamar('materiaPrima', 'PUT', { tenant: T_A }, { materias_primas: [{ nome: 'Alumínio' }, { nome: 'PVC' }] })
        expect(estado.rpcs[0].args.p_lista).toEqual([{ nome: 'Alumínio' }, { nome: 'PVC' }])
    })
})

describe('(5) o erro da FUNÇÃO vira status com a mensagem dela — só nos quatro códigos', () => {
    it.each([
        ['insufficient_privilege', '42501', 403, 'o autor da alteracao nao e super admin'],
        ['no_data_found', 'P0002', 404, 'categoria inexistente nesta empresa'],
        ['invalid_parameter_value', '22023', 400, 'ordem vem da posicao na lista, nao do corpo'],
        ['foreign_key_violation', '23503', 400, 'fornecedor(es) que nao sao do nicho da empresa: 00000000-0000-4000-8000-0000000000f3'],
    ])('%s (%s) → %i, com a mensagem da função', async (_n, code, status, message) => {
        estado.respostaDoRpc = { data: null, error: { code, message } }
        const r = await chamar('fornecedores', 'PUT', { tenant: T_A, mp_categoria: C_PVC_PERFIL }, { fornecedores: [{ fornecedor_id: F_MADEIRA, principal: true }] })
        expect(r.status).toBe(status)
        expect(r.json).toEqual({ error: message })
    })

    it.each([
        ['CHECK (23514)', '23514', 400],
        ['índice único (23505) — 500, como no mapa de hoje', '23505', 500],
        ['formato (22P02)', '22P02', 400],
        ['qualquer outro (XX000)', 'XX000', 500],
    ])('%s, código %s → %i, com frase fixa — o texto do banco NÃO vai', async (_n, code, status) => {
        const texto = 'new row for relation "orcamentista_mp_instalacao" violates check constraint "x_y_z"'
        estado.respostaDoRpc = { data: null, error: { code, message: texto } }
        const r = await chamar('instalacao', 'PUT', { tenant: T_A, mp_categoria: C_PVC_INSTALACAO }, { instalacao: [{ produto: 'ARREMATE_EXTERNO', usa: true }] })
        expect(r.status).toBe(status)
        // contra o VALOR, não contra o JSON serializado: as aspas do texto viram \" no stringify, e um
        // `not.toContain(texto)` sobre ele seria verde por construção (medido: a mutação passava)
        expect(r.json.error).toEqual(expect.any(String))
        expect(r.json.error).not.toBe(texto)
        expect(Object.values(r.json)).not.toContain(texto)
    })

    it('o log da Vercel leva a função e o código — e não a mensagem nem o corpo', async () => {
        estado.respostaDoRpc = { data: null, error: { code: '22023', message: 'campo(s) desconhecido(s) nos vidros: segredo' } }
        await chamar('vidros', 'PUT', { tenant: T_A, mp_categoria: C_PVC_VIDRO }, { vidros: [{ descricao: 'Incolor', segredo: 'xyz-123' }] })
        const log = silencio.mock.calls.map((c) => c.join(' ')).join('\n')
        expect(log).toMatch(/\[BASE-DE-CONHECIMENTO\].*superadmin_gravar_mp_vidros.*22023/)
        expect(log).not.toContain('xyz-123')
        expect(log).not.toContain('campo(s) desconhecido(s)')
    })
})

describe('(6) GET — a árvore inteira da empresa, numa resposta só', () => {
    beforeEach(() => {
        estado.db.orcamentista_mp_categoria = estado.db.orcamentista_mp_categoria.map((c) =>
            (c.id === C_PVC_PERFIL ? { ...c, config: { linha: 'Suprema', solda: null } } : c))
        estado.db.orcamentista_mp_categoria_fornecedor.push(
            { id: 'r2', tenant_id: T_A, mp_categoria_id: C_PVC_PERFIL, fornecedor_id: F_ALCOA, principal: false, ordem: 2 },
            { id: 'r1', tenant_id: T_A, mp_categoria_id: C_PVC_PERFIL, fornecedor_id: F_WOLFF, principal: true, ordem: 1 })
        estado.db.orcamentista_mp_vidro.push(
            { id: 'v1', tenant_id: T_A, mp_categoria_id: C_PVC_VIDRO, categoria_chave: 'VIDRO', descricao: 'Fumê', referencia: null, onde_predomina: [], ordem: 1 },
            { id: 'v2', tenant_id: T_A, mp_categoria_id: C_PVC_VIDRO, categoria_chave: 'VIDRO', descricao: 'Bronze', referencia: null, onde_predomina: null, ordem: 2 })
        estado.db.orcamentista_mp_instalacao.push(
            { id: 'i1', tenant_id: T_A, mp_categoria_id: C_PVC_INSTALACAO, categoria_chave: 'INSTALACAO', produto: 'CONTRAMARCO', usa: null, referencia: null, descricao: null, medida: null, folga_x: null, folga_y: null },
            { id: 'i2', tenant_id: T_A, mp_categoria_id: C_PVC_INSTALACAO, categoria_chave: 'INSTALACAO', produto: 'ARREMATE_INTERNO', usa: false, referencia: null, descricao: null, medida: null, folga_x: null, folga_y: null })
    })
    const mp = (j: any, nome: string) => j.materias_primas.find((m: Linha) => m.nome === nome)
    const categoria = (j: any, nome: string, chave: string) => mp(j, nome).categorias.find((c: Linha) => c.categoria_chave === chave)

    it('as matérias-primas da empresa, na ordem — e nenhuma de outra empresa', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.status).toBe(200)
        expect(r.json.materias_primas.map((m: Linha) => m.nome)).toEqual(['PVC', 'Alumínio'])
        expect(JSON.stringify(r.json)).not.toContain(MP_DE_B)
    })

    it('uma matéria-prima recém-criada traz todas as categorias do catálogo, na ordem dele, com config null — a chave presente e o valor null', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        const cats = mp(r.json, 'Alumínio').categorias
        expect(cats.map((c: Linha) => c.categoria_chave)).toEqual(CATEGORIAS)
        for (const c of cats) {
            expect('config' in c).toBe(true)
            expect(c.config).toBeNull()
        }
    })

    it('config gravado chega como está: chave com null continua null e presente', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(categoria(r.json, 'PVC', 'PERFIL').config).toEqual({ linha: 'Suprema', solda: null })
    })

    it('usa NULL e usa false chegam DISTINTOS no JSON', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        const inst = categoria(r.json, 'PVC', 'INSTALACAO').instalacao
        expect(inst.find((i: Linha) => i.produto === 'CONTRAMARCO').usa).toBeNull()
        expect(inst.find((i: Linha) => i.produto === 'ARREMATE_INTERNO').usa).toBe(false)
    })

    it('onde_predomina vazio e NULL chegam distintos', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        const vidros = categoria(r.json, 'PVC', 'VIDRO').vidros
        expect(vidros.map((v: Linha) => [v.descricao, v.onde_predomina])).toEqual([['Fumê', []], ['Bronze', null]])
    })

    it('os fornecedores da categoria, na ordem, com o principal e o nome', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(categoria(r.json, 'PVC', 'PERFIL').fornecedores.map((f: Linha) => [f.fornecedor_id, f.principal, f.nome_do_fornecedor]))
            .toEqual([[F_WOLFF, true, 'Wolff'], [F_ALCOA, false, 'Alcoa']])
    })

    it('a lista só existe na categoria a que pertence: vidros só em VIDRO, ferragens só em FERRAGENS, instalação só em INSTALACAO', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        for (const c of mp(r.json, 'PVC').categorias) {
            expect('fornecedores' in c).toBe(true)
            expect('vidros' in c).toBe(c.categoria_chave === 'VIDRO')
            expect('ferragens' in c).toBe(c.categoria_chave === 'FERRAGENS')
            expect('instalacao' in c).toBe(c.categoria_chave === 'INSTALACAO')
        }
    })

    it('o catálogo: as categorias na ordem, e os campos', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.json.catalogo.categorias.map((c: Linha) => c.chave)).toEqual(CATEGORIAS)
        expect(r.json.catalogo.campos).toEqual(expect.arrayContaining([expect.objectContaining({ categoria_chave: 'REFORCO', chave: 'usa', tipo: 'booleano' })]))
    })

    it('os fornecedores disponíveis são os do NICHO da empresa — o de outro nicho fica fora', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.json.nicho).toEqual({ id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' })
        expect(r.json.fornecedores_do_nicho).toEqual([{ id: F_ALCOA, nome: 'Alcoa' }, { id: F_WOLFF, nome: 'Wolff' }])
    })

    it('o contraste: a outra empresa vê os do nicho DELA', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_B })
        expect(r.json.fornecedores_do_nicho).toEqual([{ id: F_MADEIRA, nome: 'Madeireira' }])
    })

    it('empresa sem nicho: nicho null e nenhum fornecedor disponível — não a lista da plataforma', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_SEM_NICHO })
        expect(r.json.nicho).toBeNull()
        expect(r.json.fornecedores_do_nicho).toEqual([])
        expect(r.json.materias_primas).toEqual([])
    })

    it('as LINHAS de cada fornecedor com tabela em uso NESTA conta, POR FONTE — fórmula e regra separadas, distintas, em ordem — e o corte do PostgREST não esconde nenhuma', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        // EUROPA 60 só na fórmula; SUPREMA só na regra (é o caso DESIGN de produção: regra sem fórmula de família)
        expect(r.json.linhas_por_fornecedor).toEqual({ [F_WOLFF]: { formula: ['EUROPA 42', 'EUROPA 60'], regra: ['EUROPA 42', 'SUPREMA'] } })
    })

    it('o contraste: a outra empresa vê as linhas da tabela DELA; a tabela que ninguém usa não entra', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_B })
        expect(r.json.linhas_por_fornecedor).toEqual({ [F_MADEIRA]: { formula: ['MDF Y'], regra: [] } })
        expect(F_ALCOA in r.json.linhas_por_fornecedor).toBe(false)
    })

    it('empresa sem tabela em uso: nenhum fornecedor — o objeto vazio, não a lista de outra empresa', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_SEM_NICHO })
        expect(r.json.linhas_por_fornecedor).toEqual({})
    })

    it('o GET não escreve nada', async () => {
        await chamar('arvore', 'GET', { tenant: T_A })
        nenhumaEscrita()
    })
})

describe('(6b) PUT /arvore — 1:1 com superadmin_gravar_arvore (migração 20261023000004)', () => {
    const ARVORE = {
        remover: [MP_ALU],
        materias_primas: [
            {
                nome: 'PVC',
                categorias: [
                    { categoria_chave: 'PERFIL', config: { linha: 'Suprema', solda: null as string | null, reforco: false }, fornecedores: [] as Linha[] },
                    { categoria_chave: 'VIDRO', vidros: [{ descricao: 'Fumê', onde_predomina: [] as string[] }, { descricao: 'Bronze' }] },
                    { categoria_chave: 'INSTALACAO', instalacao: [{ produto: 'CONTRAMARCO', usa: null }, { produto: 'ARREMATE_INTERNO', usa: false }] },
                ],
            },
            { nome: 'Aço' },
        ],
    }

    it('a árvore chega à função COMO VEIO: null, false, [] e ausente intactos, e remover junto', async () => {
        const r = await chamar('arvore', 'PUT', { tenant: T_A }, { arvore: ARVORE })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ nome: 'superadmin_gravar_arvore', args: { p_tenant: T_A, p_por: SUPER.id, p_arvore: ARVORE } }])
        const enviada = estado.rpcs[0].args.p_arvore
        const [perfil, vidro, instalacao] = enviada.materias_primas[0].categorias
        expect(perfil.config).toHaveProperty('solda', null)
        expect(perfil.config).toHaveProperty('reforco', false)
        expect(perfil.fornecedores).toEqual([])
        expect(vidro.vidros[0].onde_predomina).toEqual([])
        expect('onde_predomina' in vidro.vidros[1]).toBe(false)
        expect(instalacao.instalacao.map((i: Linha) => i.usa)).toEqual([null, false])
        expect('categorias' in enviada.materias_primas[1]).toBe(false)
    })

    it.each([
        ['42501', 403, 'o autor da alteracao nao e super admin'],
        ['P0002', 404, 'remover 00000000-0000-4000-8000-00000000d002: materia-prima inexistente nesta empresa'],
        ['22023', 400, 'materia-prima PVC, categoria PERFIL, vidros: a categoria PERFIL nao e VIDRO: vidro so pendura na categoria VIDRO'],
        ['23503', 400, 'materia-prima Aço, categoria PERFIL, fornecedores: fornecedor(es) que nao sao do nicho da empresa: 00000000-0000-4000-8000-0000000000f3'],
    ])('erro %s → %i, com a mensagem da função — o CAMINHO incluído', async (code, status, message) => {
        estado.respostaDoRpc = { data: null, error: { code, message } }
        const r = await chamar('arvore', 'PUT', { tenant: T_A }, { arvore: ARVORE })
        expect(r.status).toBe(status)
        expect(r.json).toEqual({ error: message })
    })

    it('erro fora dos quatro (40P01, deadlock) → 500 com frase fixa: o texto do banco NÃO vai', async () => {
        const texto = 'remover 00000000-0000-4000-8000-00000000d002: deadlock detected'
        estado.respostaDoRpc = { data: null, error: { code: '40P01', message: texto } }
        const r = await chamar('arvore', 'PUT', { tenant: T_A }, { arvore: ARVORE })
        expect(r.status).toBe(500)
        expect(r.json.error).not.toBe(texto)
        expect(Object.values(r.json)).not.toContain(texto)
    })

    it('o corpo É a árvore embrulhada: a árvore solta (sem a chave `arvore`) → 400 nomeado, sem chamada', async () => {
        const r = await chamar('arvore', 'PUT', { tenant: T_A }, ARVORE)
        expect(r.status).toBe(400)
        expect(r.json.erros).toEqual(expect.arrayContaining([
            expect.objectContaining({ campo: 'materias_primas' }), expect.objectContaining({ campo: 'arvore', mensagem: 'obrigatório' })]))
        nenhumaEscrita()
    })

    it('o GET continua lendo — o PUT não mudou a leitura', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.status).toBe(200)
        expect(r.json.materias_primas.map((m: Linha) => m.nome)).toEqual(['PVC', 'Alumínio'])
        nenhumaEscrita()
    })
})

describe('(7) métodos', () => {
    it.each([
        ['arvore', 'DELETE', { tenant: T_A }],
        ['materiaPrima', 'GET', { tenant: T_A }],
        ['categoria', 'DELETE', { tenant: T_A, materia_prima: MP_PVC, categoria: 'PERFIL' }],
        ['fornecedores', 'POST', { tenant: T_A, mp_categoria: C_PVC_PERFIL }],
        ['vidros', 'GET', { tenant: T_A, mp_categoria: C_PVC_VIDRO }],
        ['ferragens', 'DELETE', { tenant: T_A, mp_categoria: C_PVC_VIDRO }],
        ['instalacao', 'POST', { tenant: T_A, mp_categoria: C_PVC_INSTALACAO }],
    ] as const)('%s %s → 405, depois do portão', async (r, metodo, query) => {
        expect((await chamar(r, metodo, query)).status).toBe(405)
        nenhumaEscrita()
    })

    it('método errado de quem NÃO é super admin → 404 (o portão vem antes do 405)', async () => {
        estado.usuario = COMUM
        expect((await chamar('vidros', 'GET', { tenant: T_A, mp_categoria: C_PVC_VIDRO })).status).toBe(404)
    })
})
