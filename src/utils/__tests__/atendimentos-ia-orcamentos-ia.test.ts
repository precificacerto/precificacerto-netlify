/**
 * @jest-environment node
 *
 * PORTÃO — os ORÇAMENTOS I.A. (dono do produto, 09/11/2026; migração `20261109000001_orcamento_ia`): as rotas da lista, do "Criar orçamento" e
 * da alteração manual. O banco é FALSO e em memória, aplica os filtros `eq`/`in`, ordena, PROJETA o select (a coluna que não foi pedida não
 * volta) e REGISTRA cada operação — os portões afirmam pelo que foi EMITIDO, não só pelo que a rota respondeu.
 *
 *   (1) a seção desligada é 404 e a permissão do módulo `orcamentista` decide: ver para ler, editar para criar e alterar;
 *   (2) a lista traz TODOS os orçamentos da empresa (os do agente e os manuais), só os dela, do mais novo ao mais antigo, com quantos itens;
 *   (3) criar: origem `manual`, sem levantamento, com o autor, o número seguinte DA EMPRESA, e o `tenant_id` do corpo ignorado; a corrida no
 *       número tenta de novo;
 *   (4) alterar: o cabeçalho, os itens com `id`, os novos no fim da ordem — e a MARCA da edição manual; o item que não veio fica; nada é apagado;
 *   (5) a validação recusa antes de gravar qualquer coisa, nomeando o campo; texto vazio é NULO, nunca o default;
 *   (6) sem a migração, 503 com a frase; nenhum método além dos declarados — não há DELETE.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>
interface Operacao { tabela: string; op: string; carga?: unknown; filtros: [string, string, unknown][] }

const T = 'tenant-da-conta'
const OUTRO = 'tenant-de-outra-conta'
const USUARIO = 'usuario-logado'
const O1 = '30000000-0000-4000-8000-000000000001'
const O2 = '30000000-0000-4000-8000-000000000002'
const O_OUTRA = '30000000-0000-4000-8000-000000000009'

const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Operacao[],
    papel: 'admin',
    /** erro a devolver na próxima operação de uma tabela (a tabela ausente, a UNIQUE que bate) */
    erros: {} as Record<string, Array<{ code: string; message: string }>>,
    /** quantos INSERTs seguidos batem na UNIQUE do número (a corrida) */
    insertsQueBatem: 0,
}

let seq = 0
function executar(tabela: string, op: string, carga: unknown, filtros: [string, string, unknown][], colunas: string | null, ordem: [string, boolean] | null, limite: number | null) {
    estado.ops.push({ tabela, op, carga, filtros })
    if (op === 'insert' && estado.insertsQueBatem > 0) { estado.insertsQueBatem--; return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } } }
    const erro = estado.erros[tabela]?.shift()
    if (erro) return { data: null, error: erro }
    const linhas = (estado.db[tabela] ??= [])
    const casa = (l: Linha) => filtros.every(([tipo, c, v]) => (tipo === 'in' ? (v as unknown[]).includes(l[c]) : l[c] === v))
    const projetar = (l: Linha) => (colunas === null || colunas === '*' ? { ...l } : Object.fromEntries(colunas.split(',').map((c) => c.trim()).map((c) => [c, l[c]])))
    if (op === 'select') {
        let r = linhas.filter(casa)
        if (ordem) r = [...r].sort((a, b) => ((a[ordem[0]] as number) - (b[ordem[0]] as number)) * (ordem[1] ? 1 : -1))
        if (limite !== null) r = r.slice(0, limite)
        return { data: r.map(projetar), error: null }
    }
    if (op === 'delete') { estado.db[tabela] = linhas.filter((l) => !casa(l)); return { data: null, error: null } }
    if (op === 'update') { linhas.filter(casa).forEach((l) => Object.assign(l, carga as Linha)); return { data: null, error: null } }
    const novas = ((Array.isArray(carga) ? carga : [carga]) as Linha[]).map((l) => ({ id: `novo-${++seq}`, criado_em: '2026-11-09T12:00:00Z', atualizado_em: '2026-11-09T12:00:00Z', editado_manualmente_em: null, editado_manualmente_por: null, ...l }))
    linhas.push(...novas)
    return { data: novas.map(projetar), error: null }
}

function cliente() {
    return {
        from: (tabela: string) => {
            const filtros: [string, string, unknown][] = []
            let op = 'select'
            let carga: unknown
            let colunas: string | null = null
            let ordem: [string, boolean] | null = null
            let limite: number | null = null
            const q: Record<string, unknown> = {}
            const rodar = () => Promise.resolve(executar(tabela, op, carga, filtros, colunas, ordem, limite))
            q.select = (c?: string) => { colunas = c ?? '*'; return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q }
            q.limit = (n: number) => { limite = n; return q }
            q.eq = (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q }
            q.in = (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            q.delete = () => { op = 'delete'; return q }
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return q }
            q.maybeSingle = () => rodar().then((r) => ({ data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }))
            q.single = q.maybeSingle
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro)
            return q
        },
    }
}

jest.mock('@/supabase/admin', () => ({ supabaseAdmin: cliente() }))
jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async () => ({ user_id: USUARIO, tenant_id: T, role: estado.papel, is_super_admin: false }),
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const rotaDaLista = require('@/pages/api/atendimentos-ia/orcamentos/index').default
const rotaDoOrcamento = require('@/pages/api/atendimentos-ia/orcamentos/[id]').default
const L = () => require('@/lib/atendimentos-ia/orcamentos-ia') as typeof import('@/lib/atendimentos-ia/orcamentos-ia')
const TELA = () => require('@/pages/atendimentos-ia/orcamentos-ia/index') as typeof import('@/pages/atendimentos-ia/orcamentos-ia/index')
const EDICAO = () => require('@/pages/atendimentos-ia/orcamentos-ia/[id]') as typeof import('@/pages/atendimentos-ia/orcamentos-ia/[id]')
/* eslint-enable @typescript-eslint/no-require-imports */

type Rota = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
async function chamar(rota: Rota, method: string, extra: { body?: unknown; query?: Record<string, string> } = {}) {
    const saida = { status: 0, corpo: {} as Record<string, unknown> }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(b: Record<string, unknown>) { saida.corpo = b; return res },
        end() { return res },
        setHeader() { return res },
    } as unknown as NextApiResponse
    await rota({ method, body: extra.body, query: extra.query ?? {}, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}
const escritas = () => estado.ops.filter((o) => o.op !== 'select')
const orcamento = (o: Linha): Linha => ({
    tenant_id: T, levantamento_id: null, obs: null, editado_manualmente_em: null, editado_manualmente_por: null, criado_por: null,
    criado_em: '2026-11-08T10:00:00Z', atualizado_em: '2026-11-08T10:00:00Z', ...o,
})

function montar(extra: Partial<Record<string, Linha[]>> = {}) {
    estado.db = {
        orcamentista_config: [{ tenant_id: T, ativo: true }, { tenant_id: OUTRO, ativo: true }],
        user_module_permissions: [],
        orcamentista_orcamento: [
            orcamento({ id: O1, numero: 1, origem: 'agente', levantamento_id: 'lev-1', nome: 'Antonio Rock' }),
            orcamento({ id: O2, numero: 2, origem: 'manual', nome: 'Cliente na loja', criado_por: 'outro-usuario' }),
            orcamento({ id: O_OUTRA, tenant_id: OUTRO, numero: 7, origem: 'manual', nome: 'Da outra empresa', criado_por: 'x' }),
        ],
        orcamentista_orcamento_item: [
            { id: 'i1', tenant_id: T, orcamento_id: O1, ordem: 1, levantamento_item_id: 'li-1', tipologia: 'DP-02', largura_mm: 1600, altura_mm: 1200, quantidade: 2, cor_perfil: 'BRANCO', vidro: 'incolor 4', obs: null },
            { id: 'i2', tenant_id: T, orcamento_id: O1, ordem: 2, levantamento_item_id: 'li-2', tipologia: 'DP-01', largura_mm: 600, altura_mm: 600, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'mini boreal', obs: null },
            { id: 'i9', tenant_id: OUTRO, orcamento_id: O_OUTRA, ordem: 1, levantamento_item_id: null, tipologia: 'X', largura_mm: null, altura_mm: null, quantidade: 1, cor_perfil: null, vidro: null, obs: null },
        ],
        ...extra,
    } as Record<string, Linha[]>
    estado.ops = []
    estado.erros = {}
    estado.insertsQueBatem = 0
    estado.papel = 'admin'
}
beforeEach(() => montar())

describe('(1) a seção e a permissão do módulo orcamentista', () => {
    it('seção desligada: 404 nas duas rotas, e nenhum orçamento é lido', async () => {
        montar({ orcamentista_config: [{ tenant_id: T, ativo: false }] })
        expect((await chamar(rotaDaLista, 'GET')).status).toBe(404)
        expect((await chamar(rotaDoOrcamento, 'GET', { query: { id: O1 } })).status).toBe(404)
        expect(estado.ops.some((o) => o.tabela.startsWith('orcamentista_orcamento'))).toBe(false)
    })

    it('quem não vê o módulo: 403, e nada é lido; quem só vê: lê, mas não cria nem altera', async () => {
        estado.papel = 'seller'
        expect((await chamar(rotaDaLista, 'GET')).status).toBe(403)
        expect(estado.ops.some((o) => o.tabela.startsWith('orcamentista_orcamento'))).toBe(false)
        montar({ user_module_permissions: [{ user_id: USUARIO, tenant_id: T, module: 'orcamentista', can_view: true, can_edit: false }] })
        estado.papel = 'seller'
        expect((await chamar(rotaDaLista, 'GET')).status).toBe(200)
        expect((await chamar(rotaDaLista, 'POST', { body: { nome: 'Novo' } })).status).toBe(403)
        expect((await chamar(rotaDoOrcamento, 'PATCH', { query: { id: O2 }, body: { nome: 'x' } })).status).toBe(403)
        expect(escritas()).toEqual([])
    })

    it('quem edita o módulo cria', async () => {
        montar({ user_module_permissions: [{ user_id: USUARIO, tenant_id: T, module: 'orcamentista', can_view: true, can_edit: true }] })
        estado.papel = 'seller'
        expect((await chamar(rotaDaLista, 'POST', { body: { nome: 'Novo' } })).status).toBe(201)
    })
})

describe('(2) a lista: TODOS os da empresa, só os dela, do mais novo ao mais antigo, com os itens contados', () => {
    it('os do agente e os manuais, com a origem do banco', async () => {
        const r = await chamar(rotaDaLista, 'GET')
        expect(r.status).toBe(200)
        const lista = r.corpo.orcamentos as Array<Record<string, unknown>>
        expect(lista.map((o) => [o.numero, o.origem, o.nome, o.itens])).toEqual([[2, 'manual', 'Cliente na loja', 0], [1, 'agente', 'Antonio Rock', 2]])
        expect(lista.some((o) => o.id === O_OUTRA)).toBe(false)
        // as duas leituras levam o tenant
        for (const op of estado.ops.filter((o) => o.tabela.startsWith('orcamentista_orcamento'))) expect(op.filtros).toContainEqual(['eq', 'tenant_id', T])
    })

    it('o tenant_id da query é ignorado', async () => {
        const r = await chamar(rotaDaLista, 'GET', { query: { tenant_id: OUTRO } })
        expect((r.corpo.orcamentos as Array<{ id: string }>).map((o) => o.id)).toEqual([O2, O1])
    })

    it('empresa sem orçamento: lista vazia, sem ler itens', async () => {
        montar({ orcamentista_orcamento: [], orcamentista_orcamento_item: [] })
        expect((await chamar(rotaDaLista, 'GET')).corpo).toEqual({ orcamentos: [] })
        expect(estado.ops.some((o) => o.tabela === 'orcamentista_orcamento_item')).toBe(false)
    })
})

describe('(3) criar: manual, sem levantamento, com o autor e o próximo número da empresa', () => {
    it('grava UMA linha com origem manual — e o tenant e a origem do corpo não valem', async () => {
        const r = await chamar(rotaDaLista, 'POST', { body: { nome: '  Maria da Silva  ', obs: '', tenant_id: OUTRO, origem: 'agente', levantamento_id: 'lev-1' } })
        expect(r.status).toBe(201)
        const ins = escritas()
        expect(ins).toHaveLength(1)
        expect(ins[0]).toMatchObject({ tabela: 'orcamentista_orcamento', op: 'insert' })
        expect(ins[0].carga).toEqual({ tenant_id: T, numero: 3, origem: 'manual', levantamento_id: null, nome: 'Maria da Silva', obs: null, criado_por: USUARIO })
        expect(r.corpo.orcamento).toMatchObject({ numero: 3, origem: 'manual', nome: 'Maria da Silva', criado_por: USUARIO })
    })

    it('o número é o da empresa: o 7 da outra conta não conta', async () => {
        montar({ orcamentista_orcamento: [] })
        await chamar(rotaDaLista, 'POST', { body: { nome: 'Primeiro' } })
        expect((escritas()[0].carga as Linha).numero).toBe(1)
    })

    it('a corrida no número (23505) tenta de novo, e grava na segunda; três batidas seguidas não gravam', async () => {
        estado.insertsQueBatem = 1
        const r = await chamar(rotaDaLista, 'POST', { body: { nome: 'Corrida' } })
        expect(r.status).toBe(201)
        expect(estado.ops.filter((o) => o.tabela === 'orcamentista_orcamento' && o.op === 'insert')).toHaveLength(2)
        expect(estado.db.orcamentista_orcamento.filter((o) => o.nome === 'Corrida')).toHaveLength(1)
        montar()
        estado.insertsQueBatem = 3
        expect((await chamar(rotaDaLista, 'POST', { body: { nome: 'Corrida' } })).status).toBe(500)
        expect(estado.ops.filter((o) => o.op === 'insert')).toHaveLength(3)
        expect(estado.db.orcamentista_orcamento.some((o) => o.nome === 'Corrida')).toBe(false)
    })

    it('sem nome: 400 nomeando o campo, e nada é gravado', async () => {
        const r = await chamar(rotaDaLista, 'POST', { body: { nome: '   ' } })
        expect(r.status).toBe(400)
        expect(r.corpo.erros).toEqual(['Nome do cliente: é obrigatório.'])
        expect(escritas()).toEqual([])
    })

    it('nome acima de 120: 400 dizendo o tamanho', async () => {
        const r = await chamar(rotaDaLista, 'POST', { body: { nome: 'a'.repeat(121) } })
        expect(r.status).toBe(400)
        expect(r.corpo.erros).toEqual(['Nome do cliente: no máximo 120 caracteres (veio 121).'])
    })
})

describe('(4) alterar: o cabeçalho, os itens e a MARCA da edição manual — sem apagar nada', () => {
    const corpo = () => ({
        nome: 'Antonio Rock Filho',
        obs: 'obra no centro',
        itens: [
            { id: 'i1', tipologia: 'DP-02', largura_mm: 1600, altura_mm: 1200, quantidade: 3, cor_perfil: 'BRANCO', vidro: 'incolor 4', obs: '' },
            { tipologia: '  DP-39 ', largura_mm: '2500', altura_mm: 2200, quantidade: 1, cor_perfil: '', vidro: 'comum 6 mm incolor' },
        ],
    })

    it('grava o cabeçalho com a marca, atualiza o item com id, acrescenta o novo no fim, e o i2 que não veio fica', async () => {
        const r = await chamar(rotaDoOrcamento, 'PATCH', { query: { id: O1 }, body: corpo() })
        expect(r.status).toBe(200)
        const cab = estado.db.orcamentista_orcamento.find((o) => o.id === O1)!
        expect(cab).toMatchObject({ nome: 'Antonio Rock Filho', obs: 'obra no centro', editado_manualmente_por: USUARIO, origem: 'agente', levantamento_id: 'lev-1' })
        expect(typeof cab.editado_manualmente_em).toBe('string')
        const itens = estado.db.orcamentista_orcamento_item.filter((i) => i.orcamento_id === O1).sort((a, b) => (a.ordem as number) - (b.ordem as number))
        expect(itens.map((i) => [i.id === 'i1' || i.id === 'i2' ? i.id : 'novo', i.ordem, i.quantidade, i.tipologia])).toEqual([['i1', 1, 3, 'DP-02'], ['i2', 2, 1, 'DP-01'], ['novo', 3, 1, 'DP-39']])
        // o item do levantamento continua ligado; o novo nasce sem laço; o texto vazio é NULO
        expect(itens[0]).toMatchObject({ levantamento_item_id: 'li-1', obs: null })
        expect(itens[2]).toMatchObject({ levantamento_item_id: null, cor_perfil: null, largura_mm: 2500, tenant_id: T })
        expect(estado.ops.some((o) => o.op === 'delete')).toBe(false)
        expect((r.corpo.orcamento as { itens: unknown[] }).itens).toHaveLength(3)
    })

    it('as escritas levam o tenant e o orçamento — o update do item não alcança o de outro orçamento', async () => {
        await chamar(rotaDoOrcamento, 'PATCH', { query: { id: O1 }, body: corpo() })
        for (const op of escritas().filter((o) => o.op === 'update')) expect(op.filtros).toContainEqual(['eq', 'tenant_id', T])
        const doItem = escritas().find((o) => o.tabela === 'orcamentista_orcamento_item' && o.op === 'update')!
        expect(doItem.filtros).toEqual([['eq', 'tenant_id', T], ['eq', 'orcamento_id', O1], ['eq', 'id', 'i1']])
    })

    it('o item de OUTRO orçamento no corpo: 400, e nada é gravado', async () => {
        const c = corpo()
        c.itens[0] = { ...c.itens[0], id: 'i9' }
        const r = await chamar(rotaDoOrcamento, 'PATCH', { query: { id: O1 }, body: c })
        expect(r.status).toBe(400)
        expect(r.corpo.erros).toEqual(['Um item enviado não é deste orçamento.'])
        expect(escritas()).toEqual([])
    })

    it('o orçamento de outra empresa: 404, e nada é gravado', async () => {
        const r = await chamar(rotaDoOrcamento, 'PATCH', { query: { id: O_OUTRA }, body: corpo() })
        expect(r.status).toBe(404)
        expect(escritas()).toEqual([])
        expect((await chamar(rotaDoOrcamento, 'GET', { query: { id: O_OUTRA } })).status).toBe(404)
    })

    it('id que não é uuid: 404 sem ler o banco', async () => {
        const r = await chamar(rotaDoOrcamento, 'GET', { query: { id: '1 or 1=1' } })
        expect(r.status).toBe(404)
        expect(estado.ops.some((o) => o.tabela.startsWith('orcamentista_orcamento'))).toBe(false)
    })
})

describe('(5) a validação recusa ANTES de gravar, nomeando o campo', () => {
    it.each([
        [{ quantidade: 0 }, 'Item 1, quantidade: tem de ser um número inteiro maior que zero.'],
        [{ quantidade: null }, 'Item 1, quantidade: é obrigatória.'],
        [{ quantidade: 1, largura_mm: 12.5 }, 'Item 1, largura (mm): tem de ser um número inteiro maior que zero.'],
        [{ quantidade: 1, altura_mm: 'alta' }, 'Item 1, altura (mm): tem de ser um número inteiro maior que zero.'],
        [{ quantidade: 1, vidro: 'v'.repeat(121) }, 'Item 1, vidro: no máximo 120 caracteres (veio 121).'],
        [{ quantidade: 1, tipologia: 7 }, 'Item 1, tipologia: tem de ser texto.'],
    ])('%j', async (item, erro) => {
        const r = await chamar(rotaDoOrcamento, 'PATCH', { query: { id: O1 }, body: { nome: 'x', itens: [item] } })
        expect(r.status).toBe(400)
        expect(r.corpo.erros).toEqual([erro])
        expect(escritas()).toEqual([])
    })

    it('itens que não são lista: 400', async () => {
        const r = await chamar(rotaDoOrcamento, 'PATCH', { query: { id: O1 }, body: { nome: 'x', itens: 'tudo' } })
        expect(r.status).toBe(400)
        expect(escritas()).toEqual([])
    })

    it('a medida não dita fica NULA (nunca zero); a quantidade "2" em texto é 2', () => {
        expect(L().validarItem({ quantidade: '2' }, 1)).toEqual({ id: null, tipologia: null, largura_mm: null, altura_mm: null, quantidade: 2, cor_perfil: null, vidro: null, obs: null })
    })
})

describe('(6) sem a migração, e os métodos', () => {
    it.each([['PGRST205'], ['42P01']])('a tabela ausente (%s): 503 com a frase da migração', async (code) => {
        estado.erros.orcamentista_orcamento = [{ code, message: 'relation does not exist' }]
        const r = await chamar(rotaDaLista, 'GET')
        expect(r.status).toBe(503)
        expect(r.corpo).toEqual({ error: L().FRASE_SEM_MIGRACAO, sem_migracao: true })
    })

    it('outro erro do banco: 500 sem o detalhe', async () => {
        estado.erros.orcamentista_orcamento = [{ code: 'XX000', message: 'segredo interno' }]
        const r = await chamar(rotaDaLista, 'GET')
        expect(r.status).toBe(500)
        expect(JSON.stringify(r.corpo)).not.toContain('segredo interno')
    })

    it.each([['DELETE'], ['PUT']])('%s: 405 nas duas rotas, sem ler nada', async (m) => {
        expect((await chamar(rotaDaLista, m)).status).toBe(405)
        expect((await chamar(rotaDoOrcamento, m, { query: { id: O1 } })).status).toBe(405)
        expect(estado.ops).toEqual([])
    })
})

describe('(7) a tela: a busca e o corpo da alteração', () => {
    const lista = [
        { id: 'a', numero: 1, origem: 'agente' as const, nome: 'Antônio Rock', itens: 2, editado_manualmente_em: null, criado_em: '' },
        { id: 'b', numero: 12, origem: 'manual' as const, nome: 'Maria', itens: 0, editado_manualmente_em: null, criado_em: '' },
    ]
    it('busca pelo nome sem caixa nem acento, e pelo número inteiro', () => {
        expect(TELA().filtrarOrcamentos(lista, 'antonio').map((o) => o.id)).toEqual(['a'])
        expect(TELA().filtrarOrcamentos(lista, '12').map((o) => o.id)).toEqual(['b'])
        expect(TELA().filtrarOrcamentos(lista, '#1').map((o) => o.id)).toEqual(['a'])
        expect(TELA().filtrarOrcamentos(lista, '  ').map((o) => o.id)).toEqual(['a', 'b'])
        expect(TELA().filtrarOrcamentos(lista, 'zz')).toEqual([])
    })

    it('o corpo leva TODOS os itens da tela: os gravados com id, os novos sem', () => {
        const itens = [
            { chave: 'i1', id: 'i1', ordem: 1, tipologia: 'DP-02', largura_mm: 1, altura_mm: 1, quantidade: 1, cor_perfil: null, vidro: null, obs: null },
            { chave: 'novo-1', id: null, ordem: null, tipologia: null, largura_mm: null, altura_mm: null, quantidade: 2, cor_perfil: null, vidro: null, obs: null },
        ]
        const c = EDICAO().corpoDaAlteracao('Cliente', null, itens)
        expect(c.itens).toHaveLength(2)
        expect(c.itens[0]).toMatchObject({ id: 'i1', quantidade: 1 })
        expect('id' in c.itens[1]).toBe(false)
        expect('chave' in c.itens[0]).toBe(false)
    })

    it('os rótulos da origem são os do banco, sem dedução', () => {
        expect(TELA().ROTULO_DA_ORIGEM).toEqual({ agente: 'Agente I.A.', manual: 'Manual' })
    })
})
