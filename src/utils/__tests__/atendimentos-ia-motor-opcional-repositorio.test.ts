/**
 * @jest-environment node
 *
 * PORTÃO — o REPOSITÓRIO, real, sobre um cliente falso que FILTRA: a tabela de preço puro (sem motor) e o par vigente por categoria
 * (migrações 20261027000006, 20261027000007 e 20261027000009: o motor é opcional em toda categoria).
 *
 * POR QUÊ: (a) a tabela de Reforço ou de Acessórios não tem arquivo de motor, e o repositório tem de devolver NULO — nunca texto vazio,
 * que a rota leria como "tem motor" e tentaria baixar um arquivo que não existe; (b) o índice da vigente é por (fornecedor, família,
 * categoria): a recusa que nomeia "a vigente de hoje" tem de nomear a da MESMA categoria. Nomear a de outra mandaria o dono do produto
 * desmarcar a tabela errada.
 *
 * O que NÃO alcança: o banco é falso. O índice em si está provado no Postgres real (`scripts/harness/`).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipo */
let linhas: Record<string, any[]> = {}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<(l: any) => boolean> = []
            const q: any = {
                select: () => q,
                eq: (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q },
                in: () => q, order: () => q, range: () => q, limit: () => q,
                then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: (linhas[tabela] ?? []).filter((l) => filtros.every((f) => f(l))), error: null }).then(ok),
            }
            return q
        },
    },
}))
jest.mock('@/lib/atendimentos-ia/tabelas-da-conta', () => ({ contasQueVinculam: jest.fn(async () => new Map()), derivarTabelasDaConta: jest.fn(async () => ({ tabelas: [] as unknown[] })) }))

import { listarFornecedores, obterArquivosDaTabela, obterDadosDaTabela, obterTabela, tabelaVigenteDoPar } from '@/lib/atendimentos-ia/repositorio'

const tabela = (id: string, extra: Record<string, unknown> = {}) => ({
    id, fornecedor_id: 'f1', arquivo_path: `f1/arquivo/${id}.xlsx`, arquivo_nome: `${id}.xlsx`, motor_path: null as string | null, motor_nome: null as string | null,
    vigencia: null as string | null, familia: 'PVC', categoria_chave: null as string | null, vigente: false, ...extra,
})

beforeEach(() => {
    linhas = {
        orcamentista_fornecedor: [{ id: 'f1', nome: 'Wolff', nicho_id: 'n1' }],
        orcamentista_categoria_catalogo: [{ chave: 'REFORCO', rotulo: 'Reforço', ordem: 3 }, { chave: 'PERFIL', rotulo: 'Perfil', ordem: 1 }],
    }
})

describe('(a) a tabela de preço puro sai com motor NULO, nunca vazio', () => {
    it('obterTabela, obterArquivosDaTabela e obterDadosDaTabela', async () => {
        linhas.orcamentista_tabela = [tabela('t-ref', { categoria_chave: 'REFORCO' })]
        expect((await obterTabela('t-ref'))?.motor_path).toBeNull()
        const arq = await obterArquivosDaTabela('t-ref')
        expect([arq?.motor_path, arq?.motor_nome]).toEqual([null, null])
        expect((await obterDadosDaTabela('t-ref'))?.motor_nome).toBeNull()
    })

    it('o nome do motor ausente na linha (undefined) também sai nulo na tela da importação', async () => {
        const sem: Record<string, unknown> = tabela('t-ref', { categoria_chave: 'REFORCO' })
        delete sem.motor_nome
        linhas.orcamentista_tabela = [sem]
        expect((await obterDadosDaTabela('t-ref'))?.motor_nome).toBeNull()
    })

    it('o contraste: a tabela com motor devolve o caminho e o nome como estão', async () => {
        linhas.orcamentista_tabela = [tabela('t-perfil', { categoria_chave: 'PERFIL', motor_path: 'f1/motor/m.xlsx', motor_nome: 'm.xlsx' })]
        const arq = await obterArquivosDaTabela('t-perfil')
        expect([arq?.motor_path, arq?.motor_nome]).toEqual(['f1/motor/m.xlsx', 'm.xlsx'])
        expect((await obterDadosDaTabela('t-perfil'))?.motor_nome).toBe('m.xlsx')
    })
})

describe('(b) a vigente que bloqueia é a da MESMA categoria', () => {
    it('com a vigente de Perfil e a de Reforço no mesmo fornecedor e família, pedir a de Reforço nomeia a de Reforço', async () => {
        linhas.orcamentista_tabela = [
            tabela('perfil-vigente', { categoria_chave: 'PERFIL', vigente: true }),
            tabela('ref-vigente', { categoria_chave: 'REFORCO', vigente: true }),
            tabela('ref-nova', { categoria_chave: 'REFORCO' }),
        ]
        const r = await tabelaVigenteDoPar('ref-nova')
        expect(r && [r.id, r.categoria_chave]).toEqual(['ref-vigente', 'REFORCO'])
    })

    it('só a vigente de OUTRA categoria existe: nada bloqueia, devolve null', async () => {
        linhas.orcamentista_tabela = [tabela('perfil-vigente', { categoria_chave: 'PERFIL', vigente: true }), tabela('ref-nova', { categoria_chave: 'REFORCO' })]
        expect(await tabelaVigenteDoPar('ref-nova')).toBeNull()
    })

    it('as de antes (sem categoria) formam o próprio grupo: a vigente sem categoria bloqueia a sem categoria, e não a de Perfil', async () => {
        linhas.orcamentista_tabela = [tabela('antiga-vigente', { vigente: true }), tabela('antiga-nova'), tabela('perfil-nova', { categoria_chave: 'PERFIL' })]
        const r = await tabelaVigenteDoPar('antiga-nova')
        expect(r && [r.id, r.categoria_chave]).toEqual(['antiga-vigente', null])
        expect(await tabelaVigenteDoPar('perfil-nova')).toBeNull()
    })

    it('a família diferente não bloqueia, e a própria tabela não se bloqueia', async () => {
        linhas.orcamentista_tabela = [tabela('alu-vigente', { familia: 'ALUMINIO', categoria_chave: 'PERFIL', vigente: true }), tabela('pvc-vigente', { categoria_chave: 'PERFIL', vigente: true })]
        expect(await tabelaVigenteDoPar('pvc-vigente')).toBeNull()
    })
})

describe('(c) as categorias das tabelas de cada fornecedor — de onde o cadastro de motor tira "os fornecedores daquela categoria" (28/10/2026)', () => {
    it('sem repetição, em ordem, só as do PRÓPRIO fornecedor; tabela sem categoria não entra; fornecedor sem tabela tem a lista vazia', async () => {
        linhas.orcamentista_fornecedor = [{ id: 'f1', nome: 'Wolff', nicho_id: 'n1' }, { id: 'f2', nome: 'Roller', nicho_id: 'n1' }, { id: 'f3', nome: 'Sem tabela', nicho_id: 'n1' }]
        linhas.orcamentista_nicho = [{ id: 'n1', modelo: 'FABRICACAO', nome: 'Esquadrias' }]
        linhas.orcamentista_tabela = [
            tabela('a', { categoria_chave: 'REFORCO' }), tabela('b', { categoria_chave: 'PERFIL' }), tabela('c', { categoria_chave: 'PERFIL' }),
            tabela('d', { categoria_chave: null }), tabela('e', { categoria_chave: '  ' }),
            tabela('r', { fornecedor_id: 'f2', categoria_chave: 'PERSIANAS' }),
        ]
        const porId = Object.fromEntries((await listarFornecedores()).map((f) => [f.id, f.categorias_das_tabelas]))
        expect(porId).toEqual({ f1: ['PERFIL', 'REFORCO'], f2: ['PERSIANAS'], f3: [] })
    })
})
