/**
 * @jest-environment node
 *
 * PORTÃO — O ESCOPO DO INSUMO E DO VIDRO (dono do produto, 12/11/2026, o comando único, 1.2): o insumo resolve nas tabelas do FORNECEDOR PRINCIPAL
 * DA CATEGORIA de cada tabela (fora PERFIL e VIDRO); o vidro, nas tabelas da categoria VIDRO do principal dela. A categoria com dois principais
 * não escolhe nenhum. Medido na De Paula (12/11/2026): FERRAGENS tem a De Toni como principal — a Celsus não está vinculada —, e o VIDRO, a Estrela.
 */
const banco = { db: {} as Record<string, Array<Record<string, unknown>>> }
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: (banco.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v)), error: null }).then(ok)
            return q
        },
    },
}))
/* eslint-disable @typescript-eslint/no-require-imports */
const S = () => require('@/lib/atendimentos-ia/custo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento-servidor')
const TC = () => require('@/lib/atendimentos-ia/tabelas-da-conta') as typeof import('@/lib/atendimentos-ia/tabelas-da-conta')
/* eslint-enable @typescript-eslint/no-require-imports */

const T = 'tenant-de-paula'
const N = null as number | null
const item = (codigo: string, fornecedor_id: string, categoria: string | null) => ({ codigo, descricao: codigo, medida_barra_m: N, valor_barra_interno: N, valor_metro_interno: N, tabela_id: `t-${fornecedor_id}-${categoria}`, fornecedor_id, categoria })
const TODOS = [
    item('9691', 'wolf', 'PERFIL'), item('10457', 'detoni', 'FERRAGENS'), item('17569', 'celsus', 'FERRAGENS'), item('1326/WOLFF', 'wolf', 'ACESSORIOS_VEDACAO'),
    item('VIN04', 'estrela', 'VIDRO'), item('VX', 'outro', 'VIDRO'), item('SEMCAT', 'wolf', null),
]

beforeEach(() => {
    banco.db = {
        orcamentista_mp_categoria: [
            { id: 'c-fer', tenant_id: T, categoria_chave: 'FERRAGENS' }, { id: 'c-vid', tenant_id: T, categoria_chave: 'VIDRO' },
            { id: 'c-ace', tenant_id: T, categoria_chave: 'ACESSORIOS_VEDACAO' }, { id: 'c-per', tenant_id: T, categoria_chave: 'PERFIL' },
            { id: 'c-out', tenant_id: 'outra', categoria_chave: 'FERRAGENS' },
        ],
        orcamentista_mp_categoria_fornecedor: [
            { tenant_id: T, mp_categoria_id: 'c-fer', fornecedor_id: 'detoni', principal: true },
            { tenant_id: T, mp_categoria_id: 'c-vid', fornecedor_id: 'estrela', principal: true },
            { tenant_id: T, mp_categoria_id: 'c-ace', fornecedor_id: 'wolf', principal: true },
            { tenant_id: T, mp_categoria_id: 'c-per', fornecedor_id: 'wolf', principal: true },
            // a outra conta faz da Celsus a principal das ferragens: não vale aqui
            { tenant_id: 'outra', mp_categoria_id: 'c-out', fornecedor_id: 'celsus', principal: true },
        ],
    }
})

describe('os principais da conta', () => {
    it('categoria → fornecedor principal, só desta conta', async () => {
        const p = await TC().principaisDaConta(T)
        expect(Object.fromEntries(p.principais)).toEqual({ FERRAGENS: 'detoni', VIDRO: 'estrela', ACESSORIOS_VEDACAO: 'wolf', PERFIL: 'wolf' })
        expect(p.ambiguas).toEqual([])
    })
    it('DOIS principais na mesma categoria (duas matérias-primas que discordam): nenhum — a categoria vai para ambiguas', async () => {
        banco.db.orcamentista_mp_categoria.push({ id: 'c-fer2', tenant_id: T, categoria_chave: 'FERRAGENS' })
        banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: T, mp_categoria_id: 'c-fer2', fornecedor_id: 'celsus', principal: true })
        const p = await TC().principaisDaConta(T)
        expect(p.principais.has('FERRAGENS')).toBe(false)
        expect(p.ambiguas).toEqual(['FERRAGENS'])
    })
})

describe('os escopos', () => {
    it('o INSUMO: as categorias fora PERFIL e VIDRO, do principal de cada uma — a Celsus (não principal) e a tabela sem categoria ficam fora', async () => {
        const p = await TC().principaisDaConta(T)
        expect(S().escopoDoInsumo(TODOS, p).map((i) => i.codigo)).toEqual(['10457', '1326/WOLFF'])
    })
    it('o VIDRO: só a categoria VIDRO do principal dela; sem principal de VIDRO, nada', async () => {
        const p = await TC().principaisDaConta(T)
        expect(S().escopoDoVidro(TODOS, p).map((i) => i.codigo)).toEqual(['VIN04'])
        p.principais.delete('VIDRO')
        expect(S().escopoDoVidro(TODOS, p)).toEqual([])
    })
})
