/**
 * PORTÃO — a ABA CATEGORIAS do catálogo, logo depois de Famílias (dono do produto, 02/11/2026; migração 20261102000002).
 *
 * POR QUÊ: "Hoje as categorias (orcamentista_categoria_catalogo) não têm tela. Quero criar, renomear e remover categoria, como já faço com etapa."
 * As três decisões: (1) renomear é só o rótulo, a chave é imutável e a tela diz isso; (2) remover ARRASTA, nomeando cada empresa com a contagem antes de
 * confirmar; (3) PERFIL, VIDRO, FERRAGENS e INSTALACAO têm a remoção recusada, com motivo nomeado.
 *
 * O que este portão fica vermelho:
 *   (1) o leitor do corpo: o rótulo de 1 a 60 sem as pontas, a chave derivada do nome (maiúscula, sem acento, até 40), `chave` no corpo é a recusa da
 *       decisão 1; campo a mais é erro; as frases de uso; as rotas;
 *   (2) GET: na ordem, com `estrutural`; sem `usos=1` só o catálogo é lido; com ele, as tabelas, os motores, as famílias e as empresas por categoria;
 *   (3) POST: a chave e o nome repetidos (sem caixa) são 409 antes da função; a função recebe o autor da sessão, a chave e o rótulo; a recusa dela vai
 *       com a frase dela; só o super admin;
 *   (4) PATCH: 404 da chave fora da forma e da que não há; 409 do nome de OUTRA; 400 de nada mudou; `chave` no corpo é 400 com a frase; a função
 *       recebe a chave da URL e SÓ o rótulo; a estrutural renomeia;
 *   (5) a TELA: a lista com a chave, quem usa e a marca "estrutural" (Remover desligado); criar mostra a chave derivada e manda `{ rotulo }`; renomear
 *       mostra a chave travada e, ao tocá-la, a frase; remover abre o arrasto com a lista POR EMPRESA e só remove confirmado; 500 na leitura é ERRO;
 *   (6) a página do nicho tem a aba Categorias logo depois de Famílias;
 *   (7) a paridade com a migração: as estruturais, o limite do rótulo, a forma da chave, as funções e os parâmetros que o repositório manda.
 *
 * O que NÃO alcança: o banco é falso aqui. As funções, o arrasto por empresa, a recusa da estrutural, as corridas e as guardas estão provados num
 * Postgres real, em `scripts/harness/categorias-do-catalogo/`, com mutações.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import {
    ABAS_DO_NICHO, CATEGORIAS_ESTRUTURAIS, CATEGORIA_INEXISTENTE, CATEGORIA_QUE_NAO_MUDOU, CHAVE_DA_CATEGORIA_NAO_MUDA, LIMITE_DO_ROTULO_DA_CATEGORIA,
    ROTA_DAS_CATEGORIAS, ROTULO_DA_ABA_DO_NICHO, abaDoNicho, chaveDaCategoria, ehCategoriaEstrutural, fraseDaCategoriaComNomeRepetido,
    fraseDaCategoriaEstrutural, lerCategoriaNova, lerEdicaoDaCategoria, rotaDaCategoria, rotaDoNicho, usoDaCategoria, type CategoriaDoCatalogo,
} from '@/utils/atendimentos-ia-catalogo'
import { ROTA_DA_REMOCAO, fraseDaEmpresa, rotaDoArrasto, type Arrasto } from '@/utils/atendimentos-ia-remocao'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
jest.setTimeout(20000)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
        matches: false, media: q, onchange: null as ((e: unknown) => void) | null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
})

type Linha = Record<string, any>
const SUPER: Linha = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN: Linha = { id: 'u-admin', tenant_id: 't-a', role: 'admin', is_super_admin: false }
const T = '00000000-0000-4000-8000-0000000000d1'
const T2 = '00000000-0000-4000-8000-0000000000d2'

const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    leituras: [] as string[],
    rpcs: [] as Array<{ funcao: string; args: Linha }>,
    rpcResposta: (): { data: unknown; error: { code?: string; message: string } | null } => ({ data: { ok: true }, error: null }),
}
function montarBanco() {
    estado.usuario = SUPER
    estado.leituras = []
    estado.rpcs = []
    estado.rpcResposta = () => ({ data: { ok: true }, error: null })
    estado.db = {
        users: [SUPER, ADMIN],
        tenants: [{ id: T, name: 'Esquadrias De Paula Ltda' }, { id: T2, name: 'Alfa Esquadrias' }],
        orcamentista_categoria_catalogo: [
            { chave: 'PERSIANAS', rotulo: 'Persianas', ordem: 2 }, { chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }, { chave: 'REFORCO', rotulo: 'Reforço metálico', ordem: 3 },
            { chave: 'FERRAGENS', rotulo: 'Ferragens', ordem: 4 }, { chave: 'ACESSORIOS_VEDACAO', rotulo: 'Acessórios e vedação', ordem: 5 }, { chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 },
            { chave: 'INSTALACAO', rotulo: 'Instalação', ordem: 7 },
        ],
        orcamentista_tabela: [{ id: 't-1', categoria_chave: 'PERFIL' }, { id: 't-2', categoria_chave: 'PERFIL' }, { id: 't-3', categoria_chave: 'PERSIANAS' }, { id: 't-4', categoria_chave: null }],
        orcamentista_motor: [{ id: 'm-1', categoria_chave: 'PERFIL' }],
        orcamentista_familia_ramificacao: [{ familia: 'PVC', categoria_chave: 'PERFIL', ordem: 1 }, { familia: 'PVC', categoria_chave: 'PERSIANAS', ordem: 2 }, { familia: 'ALUMINIO', categoria_chave: 'PERFIL', ordem: 1 }],
        orcamentista_mp_categoria: [{ id: 'c-1', tenant_id: T, categoria_chave: 'PERFIL' }, { id: 'c-2', tenant_id: T, categoria_chave: 'PERSIANAS' }, { id: 'c-3', tenant_id: T2, categoria_chave: 'PERFIL' }],
    }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<any> => (estado.usuario ? { data: { user: { id: String(estado.usuario.id) } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: (tabela: string) => {
            const filtros: Array<(l: Linha) => boolean> = []
            const q: any = {}
            let pedidas: string[] | null = null
            q.select = (colunas?: string) => { pedidas = colunas && colunas !== '*' ? colunas.split(',').map((c) => c.trim()) : null; return q }
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.order = () => q
            const linhas = () => (estado.db[tabela] ?? []).filter((l) => filtros.every((f) => f(l))).map((l) => (pedidas ? Object.fromEntries(pedidas.map((c) => [c, l[c]])) : l))
            q.single = async (): Promise<any> => ({ data: linhas()[0] ?? null, error: null })
            q.then = (ok: (v: unknown) => unknown) => { estado.leituras.push(tabela); return Promise.resolve({ data: linhas(), error: null }).then(ok) }
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) q[escrita] = () => { throw new Error(`o catálogo de categorias não escreve direto: ${escrita} ${tabela}`) }
            return q
        },
        rpc: async (funcao: string, args: Linha) => { estado.rpcs.push({ funcao, args }); return estado.rpcResposta() },
    },
}))

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTAS: Record<string, () => Rota> = {
    lista: () => require('@/pages/api/super-admin/atendimentos-ia/categorias/index').default,
    item: () => require('@/pages/api/super-admin/atendimentos-ia/categorias/[chave]').default,
}
const fraseDaChaveRepetida = () => (require('@/pages/api/super-admin/atendimentos-ia/categorias/index') as { fraseDaChaveRepetida: (c: string, r: string) => string }).fraseDaChaveRepetida
/* eslint-enable @typescript-eslint/no-require-imports */
async function chamar(rota: keyof typeof ROTAS, method: string, query: object = {}, body?: unknown) {
    const saida = { status: 0, json: null as any }
    const res = { status(n: number) { saida.status = n; return res }, json(b: unknown) { saida.json = b; return res }, setHeader() { return res } }
    await ROTAS[rota]()({ cookies: { token: 't' }, method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return saida
}

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(montarBanco)

describe('(1) o leitor do corpo e as frases', () => {
    it('a categoria nova: o rótulo sem as pontas e a chave derivada (maiúscula, sem acento, "_" entre as palavras, até 40)', () => {
        expect(lerCategoriaNova({ rotulo: '  Telas mosquiteiras ' })).toEqual({ ok: true, corpo: { rotulo: 'Telas mosquiteiras', chave: 'TELAS_MOSQUITEIRAS' } })
        expect(chaveDaCategoria('Acessórios & vedação')).toBe('ACESSORIOS_VEDACAO')
        expect(chaveDaCategoria('x'.repeat(50))).toBe('X'.repeat(40))
        expect(chaveDaCategoria('123 telas')).toBeNull()
        expect(lerCategoriaNova({ rotulo: '123' })).toEqual({ ok: false, erro: 'O nome da categoria precisa começar por uma letra.' })
    })
    it('o rótulo: em branco e 61 recusam dizendo quantos; 60 passa; não-texto recusa', () => {
        expect(lerCategoriaNova({ rotulo: '   ' })).toEqual({ ok: false, erro: 'Escreva o nome da categoria.' })
        expect(lerCategoriaNova({ rotulo: 'ç'.repeat(61) })).toEqual({ ok: false, erro: 'O nome da categoria tem 61 caracteres; o limite é 60.' })
        expect(lerCategoriaNova({ rotulo: 'T' + 'x'.repeat(59) }).ok).toBe(true)
        expect(lerCategoriaNova({ rotulo: 5 })).toEqual({ ok: false, erro: 'Escreva o nome da categoria.' })
        expect(LIMITE_DO_ROTULO_DA_CATEGORIA).toBe(60)
    })
    it('DECISÃO 1: `chave` no corpo é a recusa que diz que a chave não se renomeia — na criação e na edição; campo a mais é erro', () => {
        expect(lerCategoriaNova({ rotulo: 'Telas', chave: 'TELAS' })).toEqual({ ok: false, erro: CHAVE_DA_CATEGORIA_NAO_MUDA })
        expect(lerEdicaoDaCategoria({ rotulo: 'Telas', chave: 'OUTRA' })).toEqual({ ok: false, erro: CHAVE_DA_CATEGORIA_NAO_MUDA })
        expect(lerEdicaoDaCategoria({ rotulo: 'Telas', ordem: 9 })).toEqual({ ok: false, erro: 'Campo desconhecido no corpo: ordem (só rotulo).' })
        expect(lerEdicaoDaCategoria({ rotulo: ' Telas ' })).toEqual({ ok: true, corpo: { rotulo: 'Telas' } })
        for (const b of [null, [], 'x'] as unknown[]) expect(lerEdicaoDaCategoria(b)).toEqual({ ok: false, erro: 'Escreva o nome da categoria.' })
    })
    it('DECISÃO 3: as quatro estruturais, e a frase que nomeia o motivo', () => {
        expect([...CATEGORIAS_ESTRUTURAIS]).toEqual(['PERFIL', 'VIDRO', 'FERRAGENS', 'INSTALACAO'])
        expect(ehCategoriaEstrutural('VIDRO')).toBe(true)
        expect(ehCategoriaEstrutural('PERSIANAS')).toBe(false)
        expect(fraseDaCategoriaEstrutural('VIDRO')).toBe('A categoria VIDRO é estrutural: o código e o banco dependem da chave dela (CHECKs e funções). A remoção dela fica para outra alteração. Nada foi removido.')
    })
    it('o resumo de quem usa, no singular e no plural; sem uso, vazio', () => {
        expect(usoDaCategoria({ tabelas: 2, motores: 1, familias: ['PVC'], empresas: ['A', 'B'] })).toBe('2 tabelas · 1 motor · família PVC · 2 empresas')
        expect(usoDaCategoria({ tabelas: 1, motores: 0, familias: ['ALUMINIO', 'PVC'], empresas: ['A'] })).toBe('1 tabela · famílias ALUMINIO, PVC · 1 empresa')
        expect(usoDaCategoria({ tabelas: 0, motores: 0, familias: [], empresas: [] })).toBe('')
    })
    it('as rotas', () => {
        expect(ROTA_DAS_CATEGORIAS).toBe('/api/super-admin/atendimentos-ia/categorias')
        expect(rotaDaCategoria('ACESSORIOS_VEDACAO')).toBe('/api/super-admin/atendimentos-ia/categorias/ACESSORIOS_VEDACAO')
    })
})

describe('(2) GET /categorias', () => {
    it('na ordem, cada uma com `estrutural`; sem `usos=1` só o catálogo é lido (a lista leve do modal de tabela)', async () => {
        const r = await chamar('lista', 'GET')
        expect(r.status).toBe(200)
        expect(r.json.map((c: Linha) => [c.ordem, c.chave, c.estrutural])).toEqual([[1, 'PERFIL', true], [2, 'PERSIANAS', false], [3, 'REFORCO', false], [4, 'FERRAGENS', true], [5, 'ACESSORIOS_VEDACAO', false], [6, 'VIDRO', true], [7, 'INSTALACAO', true]])
        expect(r.json[0].usos).toBeUndefined()
        expect(estado.leituras).toEqual(['orcamentista_categoria_catalogo'])
    })
    it('com `usos=1`: as tabelas e os motores do catálogo, as famílias que a declaram e as EMPRESAS com a categoria na base de conhecimento', async () => {
        const r = await chamar('lista', 'GET', { usos: '1' })
        expect(r.status).toBe(200)
        const de = (chave: string) => (r.json as CategoriaDoCatalogo[]).find((c) => c.chave === chave)!.usos
        expect(de('PERFIL')).toEqual({ tabelas: 2, motores: 1, familias: ['ALUMINIO', 'PVC'], empresas: ['Alfa Esquadrias', 'Esquadrias De Paula Ltda'] })
        expect(de('PERSIANAS')).toEqual({ tabelas: 1, motores: 0, familias: ['PVC'], empresas: ['Esquadrias De Paula Ltda'] })
        expect(de('VIDRO')).toEqual({ tabelas: 0, motores: 0, familias: [], empresas: [] })
    })
    it('só o super admin; outro método é 405', async () => {
        estado.usuario = ADMIN
        expect((await chamar('lista', 'GET')).status).toBe(403)
        estado.usuario = SUPER
        expect((await chamar('lista', 'DELETE')).status).toBe(405)
    })
})

describe('(3) POST /categorias', () => {
    it('cria: a função recebe o autor da SESSÃO, a chave derivada e o rótulo aparado; 201 com o que a função devolveu', async () => {
        estado.rpcResposta = () => ({ data: { orcamentista_categoria_catalogo: { chave: 'TELAS', rotulo: 'Telas', ordem: 8 } }, error: null })
        const r = await chamar('lista', 'POST', {}, { rotulo: ' Telas ' })
        expect(r.status).toBe(201)
        expect(r.json).toEqual({ orcamentista_categoria_catalogo: { chave: 'TELAS', rotulo: 'Telas', ordem: 8 } })
        expect(estado.rpcs).toEqual([{ funcao: 'superadmin_criar_categoria', args: { p_por: 'u-super', p_chave: 'TELAS', p_rotulo: 'Telas' } }])
    })
    it('a chave repetida (outro nome que dá a mesma chave) e o nome repetido sem olhar a caixa são 409 ANTES da função', async () => {
        expect(await chamar('lista', 'POST', {}, { rotulo: 'Perfil!' })).toEqual({ status: 409, json: { error: fraseDaChaveRepetida()('PERFIL', 'Perfil') } })
        // a chave derivada é outra (REFORCO_METALICO ≠ REFORCO), mas o nome, sem a caixa, é o de agora
        expect(await chamar('lista', 'POST', {}, { rotulo: '  REFORÇO METÁLICO ' })).toEqual({ status: 409, json: { error: fraseDaCategoriaComNomeRepetido('Reforço metálico') } })
        expect(estado.rpcs).toEqual([])
    })
    it('a forma do corpo é 400; `chave` no corpo é 400 com a frase da decisão 1', async () => {
        expect(await chamar('lista', 'POST', {}, { rotulo: '' })).toEqual({ status: 400, json: { error: 'Escreva o nome da categoria.' } })
        expect(await chamar('lista', 'POST', {}, { rotulo: 'Telas', chave: 'TELAS' })).toEqual({ status: 400, json: { error: CHAVE_DA_CATEGORIA_NAO_MUDA } })
        expect(estado.rpcs).toEqual([])
    })
    it('a recusa da função vai com a frase dela (22023 → 409); 42501 → 403; outro → 500 sem o texto do banco; só o super admin', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: '22023', message: 'ja existe a categoria "Telas": o nome nao se repete. Nada foi gravado.' } })
        expect(await chamar('lista', 'POST', {}, { rotulo: 'Telas' })).toEqual({ status: 409, json: { error: 'ja existe a categoria "Telas": o nome nao se repete. Nada foi gravado.' } })
        estado.rpcResposta = () => ({ data: null, error: { code: '42501', message: 'o autor da alteracao nao e super admin' } })
        expect((await chamar('lista', 'POST', {}, { rotulo: 'Telas' })).status).toBe(403)
        estado.rpcResposta = () => ({ data: null, error: { code: '23505', message: 'segredo do banco' } })
        const r = await chamar('lista', 'POST', {}, { rotulo: 'Telas' })
        expect(r.status).toBe(500)
        expect(JSON.stringify(r.json)).not.toContain('segredo do banco')
        estado.usuario = ADMIN
        expect((await chamar('lista', 'POST', {}, { rotulo: 'Telas' })).status).toBe(403)
    })
})

describe('(4) PATCH /categorias/[chave]', () => {
    it('renomeia: a função recebe a chave da URL e SÓ o rótulo, com o autor da sessão', async () => {
        const r = await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: ' Persianas e cortinas ' })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ funcao: 'superadmin_editar_categoria', args: { p_por: 'u-super', p_chave: 'PERSIANAS', p_rotulo: 'Persianas e cortinas' } }])
    })
    it('a estrutural renomeia (só a remoção dela é recusada)', async () => {
        expect((await chamar('item', 'PATCH', { chave: 'VIDRO' }, { rotulo: 'Vidro temperado' })).status).toBe(200)
        expect(estado.rpcs[0].args).toEqual({ p_por: 'u-super', p_chave: 'VIDRO', p_rotulo: 'Vidro temperado' })
    })
    it('404 da chave fora da forma e da que não há; 409 do nome de OUTRA (o próprio em outra caixa é "nada mudou"? não: a caixa conta); 400 de nada mudou', async () => {
        expect(await chamar('item', 'PATCH', { chave: 'persianas' }, { rotulo: 'x' })).toEqual({ status: 404, json: { error: CATEGORIA_INEXISTENTE } })
        expect(await chamar('item', 'PATCH', { chave: 'TELAS' }, { rotulo: 'x' })).toEqual({ status: 404, json: { error: CATEGORIA_INEXISTENTE } })
        expect(await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: 'reforço METÁLICO' })).toEqual({ status: 409, json: { error: fraseDaCategoriaComNomeRepetido('Reforço metálico') } })
        expect(await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: ' Persianas ' })).toEqual({ status: 400, json: { error: CATEGORIA_QUE_NAO_MUDOU } })
        expect((await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: 'persianas' })).status).toBe(200)
        expect(estado.rpcs.length).toBe(1)
    })
    it('DECISÃO 1: `chave` no corpo é 400 com a frase, antes de ler o banco', async () => {
        expect(await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: 'x', chave: 'CORTINAS' })).toEqual({ status: 400, json: { error: CHAVE_DA_CATEGORIA_NAO_MUDA } })
        expect(estado.leituras).toEqual([])
    })
    it('P0002 → 404; 22023 → 409 com a frase; outro método é 405; só o super admin', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: 'P0002', message: 'categoria inexistente' } })
        expect(await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: 'x' })).toEqual({ status: 404, json: { error: CATEGORIA_INEXISTENTE } })
        estado.rpcResposta = () => ({ data: null, error: { code: '22023', message: 'nada mudou: o nome e o de agora. Nada foi gravado.' } })
        expect((await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: 'x' })).json).toEqual({ error: 'nada mudou: o nome e o de agora. Nada foi gravado.' })
        expect((await chamar('item', 'DELETE', { chave: 'PERSIANAS' })).status).toBe(405)
        estado.usuario = ADMIN
        expect((await chamar('item', 'PATCH', { chave: 'PERSIANAS' }, { rotulo: 'x' })).status).toBe(403)
    })
})

// ── (5) a TELA ────────────────────────────────────────────────────────────────────────────────
const categorias = (): CategoriaDoCatalogo[] => [
    { chave: 'PERFIL', rotulo: 'Perfil', ordem: 1, estrutural: true, usos: { tabelas: 2, motores: 1, familias: ['PVC'], empresas: ['Esquadrias De Paula Ltda'] } },
    { chave: 'PERSIANAS', rotulo: 'Persianas', ordem: 2, estrutural: false, usos: { tabelas: 1, motores: 0, familias: ['PVC'], empresas: ['Esquadrias De Paula Ltda'] } },
    { chave: 'REFORCO', rotulo: 'Reforço metálico', ordem: 3, estrutural: false, usos: { tabelas: 0, motores: 0, familias: [], empresas: [] } },
]
const arrastoDePersianas = (): Arrasto => ({
    tipo: 'categoria', chave: 'PERSIANAS', nome: 'Persianas', sai: 9, perde_o_vinculo: 0, assinatura: 'd'.repeat(32), ficam: [], avisos: [], impedimentos: [],
    empresas: [{ empresa: 'Esquadrias De Paula Ltda', categorias: 1, fornecedores: 0, vidros: 0, ferragens: 0, instalacao: 0 }],
    passos: [
        { passo: 31, tabela: 'orcamentista_tabela_item', acao: 'sai', rotulo: 'item de preco', quantidade: 5, nomes: ['PS-1', 'PS-2', 'PS-3', 'PS-4', 'PS-5'], mais: 0 },
        { passo: 35, tabela: 'orcamentista_tabela', acao: 'sai', rotulo: 'tabela de fornecedor', quantidade: 1, nomes: ['Wolf Perfis / Persianas_-_Wolff.xlsx (7a000000)'], mais: 0 },
        { passo: 40, tabela: 'orcamentista_mp_categoria', acao: 'sai', rotulo: 'categoria da familia de conta, com os dados', quantidade: 1, nomes: ['Esquadrias De Paula Ltda / Esquadrias de PVC WOLF'], mais: 0 },
        { passo: 42, tabela: 'orcamentista_familia_ramificacao', acao: 'sai', rotulo: 'ramificacao da familia', quantidade: 1, nomes: ['PVC'], mais: 0 },
        { passo: 43, tabela: 'orcamentista_categoria_catalogo', acao: 'sai', rotulo: 'categoria', quantidade: 1, nomes: ['Persianas'], mais: 0 },
    ],
})
const ROTA_DA_ABA = `${ROTA_DAS_CATEGORIAS}?usos=1`
let respostas: Record<string, { status: number; body: unknown }> = {}
let pedidos: Array<{ chave: string; corpo?: unknown }> = []
function montarFetch() {
    pedidos = []
    respostas = {
        [`GET ${ROTA_DA_ABA}`]: { status: 200, body: categorias() },
        [`POST ${ROTA_DAS_CATEGORIAS}`]: { status: 201, body: { ok: true } },
        [`PATCH ${rotaDaCategoria('PERSIANAS')}`]: { status: 200, body: { ok: true } },
        [`GET ${rotaDoArrasto('categoria', 'PERSIANAS')}`]: { status: 200, body: arrastoDePersianas() },
        [`POST ${ROTA_DA_REMOCAO}`]: { status: 200, body: { ...arrastoDePersianas(), removido: true } },
    }
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const chave = `${init?.method ?? 'GET'} ${url}`
        pedidos.push({ chave, corpo: init?.body ? JSON.parse(init.body) : undefined })
        const r = respostas[chave] ?? { status: 404, body: { error: `sem resposta no teste: ${chave}` } }
        return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
    })
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Componente = () => require('@/page-parts/atendimentos-ia/categorias-do-catalogo.component') as typeof import('@/page-parts/atendimentos-ia/categorias-do-catalogo.component')
const montadas: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => { while (montadas.length) { const m = montadas.pop()!; act(() => { m.root.unmount() }); m.host.remove() } document.body.innerHTML = '' })
const assentar = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)) })
async function montar(): Promise<HTMLElement> {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    montadas.push({ root, host })
    // eslint-disable-next-line testing-library/no-unnecessary-act -- é createRoot do React, não util da Testing Library
    await act(async () => { root.render(React.createElement(Componente().CategoriasDoCatalogo)) })
    await assentar()
    return host
}
async function clicar(el: Element | null | undefined) {
    expect(el).toBeTruthy()
    await act(async () => { (el as HTMLElement).click() })
    await assentar()
}
async function digitar(el: Element | null, valor: string) {
    expect(el).toBeTruthy()
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valor)
        el!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await assentar()
}
const botao = (raiz: ParentNode, texto: string) =>
    Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s/g, '') === texto.replace(/\s/g, '') || b.getAttribute('aria-label') === texto) as HTMLButtonElement | undefined
const modal = () => document.body.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal') as HTMLElement
const ok = () => Array.from(modal().querySelectorAll('.ant-modal-footer button')).pop() as HTMLButtonElement

describe('(5) a tela da aba Categorias', () => {
    beforeEach(montarFetch)

    it('a lista: o nome, a chave, QUEM USA e a marca "estrutural" com o Remover DESLIGADO; a leitura pede os usos; o aviso de que é da plataforma', async () => {
        const host = await montar()
        expect(pedidos.map((p) => p.chave)).toEqual([`GET ${ROTA_DA_ABA}`])
        const perfil = host.querySelector('[data-categoria-do-catalogo="PERFIL"]')!
        expect(perfil.querySelector('[data-chave-da-categoria]')?.textContent).toBe('PERFIL')
        expect(perfil.querySelector('[data-usos-da-categoria]')?.textContent).toBe('2 tabelas · 1 motor · família PVC · 1 empresa')
        expect(perfil.querySelector('[data-categoria-estrutural]')).not.toBeNull()
        expect(botao(perfil, 'Remover Perfil')!.disabled).toBe(true)
        expect(botao(perfil, 'Renomear Perfil')!.disabled).toBe(false)
        const persianas = host.querySelector('[data-categoria-do-catalogo="PERSIANAS"]')!
        expect(persianas.querySelector('[data-categoria-estrutural]')).toBeNull()
        expect(botao(persianas, 'Remover Persianas')!.disabled).toBe(false)
        expect(host.querySelector('[data-categoria-do-catalogo="REFORCO"] [data-sem-uso]')?.textContent).toBe('ninguém')
        expect(host.querySelector('[data-categoria-global]')?.textContent).toContain('A chave é derivada do nome na criação e não muda')
    })

    it('500 na leitura: ERRO com a frase da rota, nunca "nenhuma categoria"', async () => {
        respostas[`GET ${ROTA_DA_ABA}`] = { status: 500, body: { error: 'Não foi possível ler as categorias.' } }
        const host = await montar()
        expect(host.querySelector('[data-erro-do-catalogo-de-categorias]')?.textContent).toContain('Não foi possível ler as categorias.')
        expect(host.textContent).not.toContain(Componente().SEM_CATEGORIA_NO_CATALOGO)
    })

    it('criar: a chave derivada aparece enquanto se digita; salvar só liga com nome que dá chave; o corpo leva SÓ o rótulo aparado; a lista é relida', async () => {
        const host = await montar()
        await clicar(host.querySelector('[data-nova-categoria]'))
        expect(ok().disabled).toBe(true)
        await digitar(modal().querySelector('[aria-label="Nome da categoria"]'), '123')
        expect(modal().querySelector('[data-chave-derivada]')?.textContent).toBe(Componente().CHAVE_SEM_LETRA)
        expect(ok().disabled).toBe(true)
        await digitar(modal().querySelector('[aria-label="Nome da categoria"]'), '  Telas mosquiteiras ')
        expect(modal().querySelector('[data-chave-derivada]')?.getAttribute('data-chave-derivada')).toBe('TELAS_MOSQUITEIRAS')
        expect(ok().disabled).toBe(false)
        await clicar(ok())
        expect(pedidos.filter((p) => p.chave.startsWith('POST '))).toEqual([{ chave: `POST ${ROTA_DAS_CATEGORIAS}`, corpo: { rotulo: 'Telas mosquiteiras' } }])
        expect(pedidos.filter((p) => p.chave === `GET ${ROTA_DA_ABA}`).length).toBe(2)
    })

    it('a recusa aparece DENTRO do modal, e o modal não fecha', async () => {
        respostas[`POST ${ROTA_DAS_CATEGORIAS}`] = { status: 409, body: { error: fraseDaCategoriaComNomeRepetido('Perfil') } }
        const host = await montar()
        await clicar(host.querySelector('[data-nova-categoria]'))
        await digitar(modal().querySelector('[aria-label="Nome da categoria"]'), 'perfil')
        await clicar(ok())
        expect(modal().querySelector('[data-erro-da-categoria]')?.textContent).toContain(fraseDaCategoriaComNomeRepetido('Perfil'))
        expect((modal().querySelector('[aria-label="Nome da categoria"]') as HTMLInputElement).value).toBe('perfil')
    })

    it('DECISÃO 1 — renomear: a chave aparece TRAVADA e, ao tocá-la, a tela diz que ela não se renomeia; o uso é avisado; o PATCH leva só o rótulo', async () => {
        const host = await montar()
        await clicar(botao(host, 'Renomear Persianas'))
        const chave = modal().querySelector('[aria-label="Chave da categoria"]') as HTMLInputElement
        expect(chave.value).toBe('PERSIANAS')
        expect(chave.disabled).toBe(true)
        expect(modal().querySelector('[data-chave-nao-muda]')).toBeNull()
        await clicar(modal().querySelector('[data-chave-travada]'))
        expect(modal().querySelector('[data-chave-nao-muda]')?.textContent).toBe(CHAVE_DA_CATEGORIA_NAO_MUDA)
        expect(modal().querySelector('[data-edicao-com-uso]')?.textContent).toBe(Componente().AVISO_DA_EDICAO_COM_USO('1 tabela · família PVC · 1 empresa'))
        expect(ok().disabled).toBe(true)
        await digitar(modal().querySelector('[aria-label="Nome da categoria"]'), ' Persianas e cortinas ')
        expect(ok().disabled).toBe(false)
        expect(modal().querySelector('[data-chave-derivada]')).toBeNull() // a chave derivada é só da criação
        await clicar(ok())
        expect(pedidos.filter((p) => p.chave.startsWith('PATCH '))).toEqual([{ chave: `PATCH ${rotaDaCategoria('PERSIANAS')}`, corpo: { rotulo: 'Persianas e cortinas' } }])
    })

    it('DECISÃO 2 — remover abre o arrasto: o que sai, a lista POR EMPRESA com a contagem, e só remove confirmado; a lista é relida', async () => {
        const host = await montar()
        await clicar(botao(host, 'Remover Persianas'))
        expect(pedidos.map((p) => p.chave).pop()).toBe(`GET ${rotaDoArrasto('categoria', 'PERSIANAS')}`)
        const remocao = document.body.querySelector('[data-remocao-do-catalogo]') as HTMLElement
        expect(remocao.querySelector('[data-o-que-sai]')!.textContent).toContain('Wolf Perfis / Persianas_-_Wolff.xlsx (7a000000)')
        expect(remocao.querySelector('[data-o-que-sai]')!.textContent).toContain('categoria da família de conta, com os dados')
        expect(Array.from(remocao.querySelectorAll('[data-por-empresa] li')).map((l) => l.textContent)).toEqual(['Esquadrias De Paula Ltda: 1 categoria da família de conta'])
        expect(ok().disabled).toBe(true)
        await clicar(remocao.querySelector('[data-confirmo-o-arrasto] input'))
        const n = pedidos.length
        await clicar(ok())
        expect(pedidos.slice(n).map((p) => p.chave)).toEqual([`POST ${ROTA_DA_REMOCAO}`, `GET ${ROTA_DA_ABA}`])
        expect(pedidos[n].corpo).toEqual({ tipo: 'categoria', chave: 'PERSIANAS', assinatura: 'd'.repeat(32), confirmo: true })
    })

    it('DECISÃO 3 — a estrutural medida volta com o impedimento: a frase nomeia o motivo e o Remover fica desligado', async () => {
        respostas[`GET ${ROTA_DA_ABA}`] = { status: 200, body: categorias().map((c) => ({ ...c, estrutural: false })) } // a tela não confia só na marca: a função decide
        respostas[`GET ${rotaDoArrasto('categoria', 'PERFIL')}`] = { status: 200, body: { ...arrastoDePersianas(), chave: 'PERFIL', nome: 'Perfil', impedimentos: [{ tipo: 'categoria_estrutural', categoria: 'PERFIL' }] } }
        const host = await montar()
        await clicar(botao(host, 'Remover Perfil'))
        const remocao = document.body.querySelector('[data-remocao-do-catalogo]') as HTMLElement
        expect(remocao.querySelector('[data-impedimento]')!.textContent).toContain(fraseDaCategoriaEstrutural('PERFIL'))
        expect((remocao.querySelector('[data-confirmo-o-arrasto] input') as HTMLInputElement).disabled).toBe(true)
        expect(ok().disabled).toBe(true)
    })

    it('a linha por empresa: só o que não é zero, no singular e no plural', () => {
        expect(fraseDaEmpresa({ empresa: 'A', categorias: 1, fornecedores: 2, vidros: 4, ferragens: 1, instalacao: 3 })).toBe('A: 1 categoria da família de conta, 2 fornecedores escolhidos, 4 vidros, 1 ferragem, 3 instalações')
        expect(fraseDaEmpresa({ empresa: 'B', categorias: 0, fornecedores: 0, vidros: 0, ferragens: 0, instalacao: 0 })).toBe('B: nada')
    })
})

describe('(6) a página do nicho tem a aba Categorias logo depois de Famílias', () => {
    it('FAMÍLIAS → CATEGORIAS → FORNECEDORES → MOTORES → ETAPAS, com o nome "Categorias", e a URL a abre', () => {
        expect(ABAS_DO_NICHO).toEqual(['familias', 'categorias', 'fornecedores', 'motores', 'etapas'])
        expect(ROTULO_DA_ABA_DO_NICHO.categorias).toBe('Categorias')
        expect(abaDoNicho('categorias')).toBe('categorias')
        expect(rotaDoNicho('n-1', 'categorias')).toBe('/super-admin/atendimentos-ia/catalogo/n-1?aba=categorias')
    })
})

describe('(7) o que liga o código à migração 20261102000002', () => {
    const MIG = fs.readFileSync(path.join(__dirname, '../../../supabase/migrations/20261102000002_categorias_do_catalogo.sql'), 'utf8')
    const REPO = fs.readFileSync(path.join(__dirname, '../../lib/atendimentos-ia/repositorio.ts'), 'utf8')
    it('as duas funções, com os parâmetros que o repositório manda', () => {
        expect(MIG).toContain('CREATE OR REPLACE FUNCTION public.superadmin_criar_categoria(p_por uuid, p_chave text, p_rotulo text) RETURNS jsonb')
        expect(MIG).toContain('CREATE OR REPLACE FUNCTION public.superadmin_editar_categoria(p_por uuid, p_chave text, p_rotulo text) RETURNS jsonb')
        expect(REPO).toContain("rpc('superadmin_criar_categoria', { p_por: a.por, p_chave: a.chave, p_rotulo: a.rotulo })")
        expect(REPO).toContain("rpc('superadmin_editar_categoria', { p_por: a.por, p_chave: a.chave, p_rotulo: a.rotulo })")
    })
    it('as estruturais da tela são as da função do banco, na mesma ordem', () => {
        const m = /SELECT ARRAY\[([^\]]*)\]/.exec(MIG)
        expect(m).not.toBeNull()
        expect([...m![1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])).toEqual([...CATEGORIAS_ESTRUTURAIS])
    })
    it('a forma da chave e o limite do rótulo são os das CHECKs', () => {
        expect(MIG).toContain("CHECK (chave ~ '^[A-Z][A-Z0-9_]{0,39}$')")
        expect(MIG).toContain(`length(rotulo) BETWEEN 1 AND ${LIMITE_DO_ROTULO_DA_CATEGORIA}`)
        expect(chaveDaCategoria('a'.repeat(41))).toHaveLength(40)
    })
    it('a estrutural é recusada pela função com 23514, e a rota trata 23514 como impedimento (medido de novo)', () => {
        expect(MIG).toContain("USING ERRCODE = 'check_violation'")
        expect(fs.readFileSync(path.join(__dirname, '../../pages/api/super-admin/atendimentos-ia/catalogo/remover.ts'), 'utf8')).toContain("codigo === '23505' || codigo === '23514'")
    })
})
