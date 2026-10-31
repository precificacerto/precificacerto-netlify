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
    /** A tabela cuja leitura falha: o banco falso devolve erro nela. */
    falhaEm: null as string | null,
}

function categoriasDe(tenant: string, mp: string): Linha[] {
    return CATEGORIAS.map((chave) => ({ id: cat(mp, chave), tenant_id: tenant, materia_prima_id: mp, categoria_chave: chave, config: null as Linha | null, atualizado_por: null as string | null, atualizado_em: '2026-10-23T12:00:00Z' }))
}

function montar() {
    estado.usuario = SUPER
    estado.rpcs = []
    estado.escritasDiretas = []
    estado.respostaDoRpc = null
    estado.falhaEm = null
    estado.db = {
        // as famílias e as ramificações que cada uma declara (migração 20261027000002): a PVC declara as seis, numa ordem que NÃO é a do catálogo
        orcamentista_familia_catalogo: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }],
        orcamentista_familia_ramificacao: [
            { familia: 'PVC', categoria_chave: 'VIDRO', ordem: 2 }, { familia: 'PVC', categoria_chave: 'PERFIL', ordem: 1 },
            { familia: 'ALUMINIO', categoria_chave: 'PERFIL', ordem: 1 },
        ],
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
            { id: MP_PVC, tenant_id: T_A, nome: 'PVC', ordem: 1, atualizado_por: null, atualizado_em: null, familia: 'PVC' },
            { id: MP_DE_B, tenant_id: T_B, nome: 'MDF', ordem: 1, atualizado_por: null, atualizado_em: null },
        ],
        orcamentista_mp_categoria: [...categoriasDe(T_A, MP_PVC), ...categoriasDe(T_A, MP_ALU), ...categoriasDe(T_B, MP_DE_B)],
        orcamentista_mp_categoria_fornecedor: [],
        orcamentista_mp_vidro: [],
        orcamentista_mp_ferragem: [],
        orcamentista_mp_instalacao: [],
        // a linha PARADA (26/10/2026): ninguém a lê — as tabelas da conta vêm do vínculo da base de conhecimento (`vincularAsTabelas`)
        orcamentista_conta_tabela: [{ tenant_id: T_A, tabela_id: TAB_DE_B }],
        // a categoria é da TABELA: a Wolff tem a de PERFIL, a Madeireira a de VIDRO, e a da Alcoa não declara categoria (as de antes)
        orcamentista_tabela: [{ id: TAB_DE_A, fornecedor_id: F_WOLFF, categoria_chave: 'PERFIL' }, { id: TAB_DE_B, fornecedor_id: F_MADEIRA, categoria_chave: 'VIDRO' }, { id: TAB_SEM_USO, fornecedor_id: F_ALCOA, categoria_chave: null }],
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
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve<RespostaDoBanco>(
                estado.falhaEm === tabela ? { data: null, error: { code: '57014', message: `falha lendo ${tabela}` } } : { data: linhas(), error: null }).then(ok, erro)
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
    familiaDaMateriaPrima: rota('familia-da-materia-prima'),
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
    ['categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC, categoria: 'PERFIL' }, { config: { serra_mm: 5 } }, 'superadmin_gravar_mp_categoria',
        { p_tenant: T_A, p_materia_prima: MP_PVC, p_categoria: 'PERFIL', p_corpo: { serra_mm: 5 } }],
    ['fornecedores', 'PUT', { tenant: T_A, mp_categoria: C_PVC_PERFIL }, { fornecedores: [{ fornecedor_id: F_WOLFF, principal: true }] }, 'superadmin_gravar_mp_fornecedores',
        { p_tenant: T_A, p_mp_categoria: C_PVC_PERFIL, p_lista: [{ fornecedor_id: F_WOLFF, principal: true }] }],
    ['vidros', 'PUT', { tenant: T_A, mp_categoria: C_PVC_VIDRO }, { vidros: [{ descricao: 'Incolor 4 mm' }] }, 'superadmin_gravar_mp_vidros',
        { p_tenant: T_A, p_mp_categoria: C_PVC_VIDRO, p_lista: [{ descricao: 'Incolor 4 mm' }] }],
    ['ferragens', 'PUT', { tenant: T_A, mp_categoria: cat(MP_PVC, 'FERRAGENS') }, { ferragens: [{ tipologia: 'JVC', referencia: 'F-1' }] }, 'superadmin_gravar_mp_ferragens',
        { p_tenant: T_A, p_mp_categoria: cat(MP_PVC, 'FERRAGENS'), p_lista: [{ tipologia: 'JVC', referencia: 'F-1' }] }],
    ['instalacao', 'PUT', { tenant: T_A, mp_categoria: C_PVC_INSTALACAO }, { instalacao: [{ produto: 'CONTRAMARCO' }] }, 'superadmin_gravar_mp_instalacao',
        { p_tenant: T_A, p_mp_categoria: C_PVC_INSTALACAO, p_lista: [{ produto: 'CONTRAMARCO' }] }],
    ['materiaPrima', 'DELETE', { tenant: T_A, materia_prima: MP_PVC }, undefined, 'superadmin_remover_materia_prima', { p_tenant: T_A, p_materia_prima: MP_PVC }],
    ['familiaDaMateriaPrima', 'PUT', { tenant: T_A }, { materia_prima: MP_PVC, familia: 'PVC' }, 'superadmin_definir_familia_da_materia_prima', { p_tenant: T_A, p_materia_prima: MP_PVC, p_familia: 'PVC' }],
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
        const r = await chamar('categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC }, { config: { serra_mm: 5 } })
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

    it('AS RAMIFICAÇÕES (27/10/2026): o catálogo traz as famílias e o que cada uma declara, na ordem da família — não a do catálogo', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.json.catalogo.familias).toEqual([{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }])
        expect(r.json.catalogo.ramificacoes).toEqual([
            { familia: 'ALUMINIO', categoria_chave: 'PERFIL', ordem: 1 },
            { familia: 'PVC', categoria_chave: 'PERFIL', ordem: 1 },
            { familia: 'PVC', categoria_chave: 'VIDRO', ordem: 2 },
        ])
    })

    it('a matéria-prima chega com a família que tem — e sem família, a chave fica ausente ou null, nunca um padrão', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.json.materias_primas.find((m: Linha) => m.id === MP_PVC).familia).toBe('PVC')
        expect(r.json.materias_primas.find((m: Linha) => m.id === MP_ALU).familia ?? null).toBeNull()
    })

    it.each([['orcamentista_familia_ramificacao'], ['orcamentista_familia_catalogo']])('falha ao ler %s: ERRO 500 — nunca a árvore com a lista inteira do catálogo no lugar da declarada', async (tabela) => {
        estado.falhaEm = tabela
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.status).toBe(500)
        expect(r.json).toEqual({ error: 'Falha ao ler a base de conhecimento.' })
        expect(r.json.catalogo).toBeUndefined()
    })

    it('os fornecedores disponíveis são os do NICHO da empresa — o de outro nicho fica fora', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.json.nicho).toEqual({ id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' })
        expect(r.json.fornecedores_do_nicho).toEqual([
            { id: F_ALCOA, nome: 'Alcoa', categorias_das_tabelas: [], tabelas_sem_categoria: 1 },
            { id: F_WOLFF, nome: 'Wolff', categorias_das_tabelas: ['PERFIL'], tabelas_sem_categoria: 0 },
        ])
    })

    it('o contraste: a outra empresa vê os do nicho DELA', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_B })
        expect(r.json.fornecedores_do_nicho).toEqual([{ id: F_MADEIRA, nome: 'Madeireira', categorias_das_tabelas: ['VIDRO'], tabelas_sem_categoria: 0 }])
    })

    it('a CATEGORIA DA TABELA decide em que ramificação o fornecedor aparece (28/10/2026): duas tabelas de categorias diferentes e uma sem categoria — cada uma no seu lugar, e a nula NUNCA vira categoria', async () => {
        estado.db.orcamentista_tabela.push(
            { id: '00000000-0000-4000-8000-00000000ab11', fornecedor_id: F_WOLFF, categoria_chave: 'REFORCO' },
            { id: '00000000-0000-4000-8000-00000000ab12', fornecedor_id: F_WOLFF, categoria_chave: 'PERFIL' },
            { id: '00000000-0000-4000-8000-00000000ab13', fornecedor_id: F_WOLFF, categoria_chave: null },
            { id: '00000000-0000-4000-8000-00000000ab14', fornecedor_id: F_WOLFF, categoria_chave: '  ' },
        )
        const wolff = (await chamar('arvore', 'GET', { tenant: T_A })).json.fornecedores_do_nicho.find((f: Linha) => f.id === F_WOLFF)
        // distintas e em ordem; a nula e a só-espaço vão para a contagem, e a PERFIL repetida conta UMA vez
        expect(wolff.categorias_das_tabelas).toEqual(['PERFIL', 'REFORCO'])
        expect(wolff.tabelas_sem_categoria).toBe(2)
    })

    it('a leitura das tabelas dos fornecedores que falha é ERRO (500), nunca a lista sem categorias', async () => {
        estado.falhaEm = 'orcamentista_tabela'
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.status).toBe(500)
        expect(r.json.fornecedores_do_nicho).toBeUndefined()
    })

    it('empresa sem nicho: nicho null e nenhum fornecedor disponível — não a lista da plataforma', async () => {
        const r = await chamar('arvore', 'GET', { tenant: T_SEM_NICHO })
        expect(r.json.nicho).toBeNull()
        expect(r.json.fornecedores_do_nicho).toEqual([])
        expect(r.json.materias_primas).toEqual([])
    })

    /**
     * As tabelas da conta são DERIVADAS (26/10/2026): a base de conhecimento de A já vincula a Wolff e a Alcoa no
     * PERFIL (o `beforeEach`); a de B passa a vincular a Madeireira. A linha parada de `orcamentista_conta_tabela`
     * (A → a tabela da Madeireira) não muda nada.
     */
    const vincularAsTabelas = () => estado.db.orcamentista_mp_categoria_fornecedor.push(
        { id: '00000000-0000-4000-8000-0000000a0002', tenant_id: T_B, mp_categoria_id: cat(MP_DE_B, 'PERFIL'), fornecedor_id: F_MADEIRA, principal: true, ordem: 1 },
    )

    it('as LINHAS de cada fornecedor com tabela em uso NESTA conta, POR FONTE — fórmula e regra separadas, distintas, em ordem — e o corte do PostgREST não esconde nenhuma', async () => {
        vincularAsTabelas()
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        // EUROPA 60 só na fórmula; SUPREMA só na regra (é o caso DESIGN de produção: regra sem fórmula de família)
        expect(r.json.linhas_por_fornecedor).toEqual({
            [F_WOLFF]: { formula: ['EUROPA 42', 'EUROPA 60'], regra: ['EUROPA 42', 'SUPREMA'] },
            [F_ALCOA]: { formula: ['ALCOA X'], regra: ['ALCOA Z'] },
        })
    })

    // Com DUAS tabelas da Wolff na mesma família, só a VIGENTE vale (26/10/2026): as linhas são as dela, e as da
    // antiga não entram. Sem nenhuma marcada, nenhuma vale — e a Wolff fica sem chave, como "sem tabela em uso".
    const comSegundaDaWolff = (vigente: boolean) => {
        const SEGUNDA = '00000000-0000-4000-8000-00000000ab09'
        estado.db.orcamentista_tabela.push({ id: SEGUNDA, fornecedor_id: F_WOLFF, categoria_chave: 'PERFIL', vigente })
        estado.db.orcamentista_motor_formula_familia.push({ tabela_id: SEGUNDA, linha: 'LINHA NOVA' })
        estado.db.orcamentista_motor_regra.push({ tabela_id: SEGUNDA, linha: 'LINHA NOVA' })
    }

    it('duas tabelas da Wolff, a nova VIGENTE: as linhas são só as dela', async () => {
        comSegundaDaWolff(true)
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(r.json.linhas_por_fornecedor[F_WOLFF]).toEqual({ formula: ['LINHA NOVA'], regra: ['LINHA NOVA'] })
    })

    it('duas tabelas da Wolff, nenhuma vigente: nenhuma vale, e a Wolff fica sem chave', async () => {
        comSegundaDaWolff(false)
        const r = await chamar('arvore', 'GET', { tenant: T_A })
        expect(F_WOLFF in r.json.linhas_por_fornecedor).toBe(false)
    })

    it('o contraste: a outra empresa vê as linhas da tabela DELA; a do fornecedor que ela não vincula não entra', async () => {
        vincularAsTabelas()
        const r = await chamar('arvore', 'GET', { tenant: T_B })
        expect(r.json.linhas_por_fornecedor).toEqual({ [F_MADEIRA]: { formula: ['MDF Y'], regra: [] } })
        expect(F_ALCOA in r.json.linhas_por_fornecedor).toBe(false)
    })

    it('empresa sem tabela em uso: nenhum fornecedor — o objeto vazio, não a lista de outra empresa', async () => {
        vincularAsTabelas()
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
                    { categoria_chave: 'PERFIL', config: { cores: ['BRANCO'], serra_mm: null as number | null, reforco: false }, fornecedores: [] as Linha[] },
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
        expect(perfil.config).toHaveProperty('serra_mm', null)
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

describe('(6c) os campos que SAÍRAM da tela e da gravação (30/10/2026): recusa nomeada antes da função, nas duas rotas que gravam o config', () => {
    const FORA = ['linha', 'cor_predominante', 'barra_mm', 'solda', 'criterio_custo_barra'] as const

    it.each(FORA)('PUT /categoria com PERFIL.%s: 400 que nomeia o campo e diz que o motor traz — a função NÃO é chamada', async (chave) => {
        const r = await chamar('categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC, categoria: 'PERFIL' }, { config: { serra_mm: 5, [chave]: null } })
        expect(r.status).toBe(400)
        expect(r.json.erros).toEqual([{ campo: `config.${chave}`, mensagem: `o campo "${chave}" saiu da base de conhecimento: o motor da família já traz essa informação. O valor gravado fica, sem tela.` }])
        nenhumaEscrita()
    })

    it('PUT /arvore: o caminho de cada campo recusado (matéria-prima, categoria, chave), e a função NÃO é chamada', async () => {
        const arvore = { materias_primas: [
            { nome: 'PVC', categorias: [{ categoria_chave: 'VIDRO', config: {} }, { categoria_chave: 'PERFIL', config: { cores: ['BRANCO'], linha: 'EUROPA 42' } }] },
            { nome: 'Aço', categorias: [{ categoria_chave: 'PERFIL', config: { criterio_custo_barra: 'CONSUMO_REAL' } }] },
        ] }
        const r = await chamar('arvore', 'PUT', { tenant: T_A }, { arvore })
        expect(r.status).toBe(400)
        expect(r.json.erros.map((e: Linha) => e.campo)).toEqual([
            'arvore.materias_primas[0].categorias[1].config.linha', 'arvore.materias_primas[1].categorias[0].config.criterio_custo_barra',
        ])
        nenhumaEscrita()
    })

    it('FICAM: cores e serra_mm (o cálculo da conversa as lê), e a mesma chave em OUTRA categoria não é recusada', async () => {
        const r = await chamar('categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC, categoria: 'PERFIL' }, { config: { cores: ['BRANCO'], serra_mm: 5 } })
        expect(r.status).toBe(200)
        const r2 = await chamar('categoria', 'PUT', { tenant: T_A, materia_prima: MP_PVC, categoria: 'REFORCO' }, { config: { linha: 'x' } })
        expect(r2.status).toBe(200)
        expect(estado.rpcs.map((x) => x.nome)).toEqual(['superadmin_gravar_mp_categoria', 'superadmin_gravar_mp_categoria'])
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

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(7) PUT /familia-da-materia-prima — a família escolhe as ramificações (27/10/2026)', () => {
    const put = (corpo: unknown) => chamar('familiaDaMateriaPrima', 'PUT', { tenant: T_A }, corpo)

    it('chama SÓ superadmin_definir_familia_da_materia_prima, com a empresa da URL e o autor da sessão', async () => {
        const r = await put({ materia_prima: MP_ALU, familia: 'ALUMINIO' })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ nome: 'superadmin_definir_familia_da_materia_prima', args: { p_tenant: T_A, p_por: SUPER.id, p_materia_prima: MP_ALU, p_familia: 'ALUMINIO' } }])
        expect(estado.escritasDiretas).toEqual([])
    })

    it('null LIMPA a família: vai à função como null, não como texto vazio', async () => {
        await put({ materia_prima: MP_PVC, familia: null })
        expect(estado.rpcs[0].args.p_familia).toBeNull()
    })

    it.each([
        ['família em branco', { materia_prima: MP_PVC, familia: '   ' }],
        ['família que não é texto', { materia_prima: MP_PVC, familia: 3 }],
        ['família ausente (ausente não é null: não limpa por omissão)', { materia_prima: MP_PVC }],
        ['matéria-prima que não é uuid', { materia_prima: 'x', familia: 'PVC' }],
        ['sem matéria-prima', { familia: 'PVC' }],
        ['campo que não existe', { materia_prima: MP_PVC, familia: 'PVC', nome: 'PVC' }],
        ['o autor no corpo (é o da sessão)', { materia_prima: MP_PVC, familia: 'PVC', por: SUPER.id }],
        ['corpo que não é objeto', 'PVC'],
        ['corpo lista', [MP_PVC]],
    ])('%s: 400 nomeado, e a função NÃO é chamada', async (_nome, corpo) => {
        const r = await put(corpo)
        expect(r.status).toBe(400)
        expect(typeof r.json.error).toBe('string')
        nenhumaEscrita()
    })

    it('família ausente: o erro é nomeado — "obrigatório", que não é o de "texto da lista" — e null LIMPA sem erro', async () => {
        const r = await put({ materia_prima: MP_PVC })
        expect(r.json.erros).toEqual([{ campo: 'familia', mensagem: 'obrigatório: a família da lista, ou null para limpar' }])
        const ruim = await put({ materia_prima: MP_PVC, familia: 3 })
        expect(ruim.json.erros).toEqual([{ campo: 'familia', mensagem: 'a família é um texto da lista, ou null para limpar' }])
        expect((await put({ materia_prima: MP_PVC, familia: null })).status).toBe(200)
    })

    it.each([
        ['22023', 400, 'a empresa ja tem outra materia-prima nesta familia: e uma por familia'],
        ['P0002', 404, 'materia-prima inexistente nesta empresa'],
        ['42501', 403, 'o autor da alteracao nao e super admin'],
    ])('o código %s vira %i com a mensagem da função', async (code, status, message) => {
        estado.respostaDoRpc = { data: null, error: { code, message } }
        const r = await put({ materia_prima: MP_PVC, familia: 'PVC' })
        expect(r.status).toBe(status)
        expect(r.json).toEqual({ error: message })
    })

    it('só PUT: GET, POST e DELETE são 405', async () => {
        for (const m of ['GET', 'POST', 'DELETE']) expect((await chamar('familiaDaMateriaPrima', m, { tenant: T_A }, {})).status).toBe(405)
        nenhumaEscrita()
    })
})
