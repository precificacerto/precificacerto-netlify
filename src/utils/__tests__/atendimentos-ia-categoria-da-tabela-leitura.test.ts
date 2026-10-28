/**
 * @jest-environment node
 *
 * PORTÃO — o repositório PEDE a coluna da categoria da tabela (migração 20261027000005).
 *
 * POR QUÊ: os outros testes da categoria trocam o repositório inteiro por um falso, e com ele falso a
 * leitura da tabela que ESQUECE de pedir `categoria_chave` passa despercebida — e o efeito é o pior: a
 * importação leria `undefined` e trataria a tabela como "de antes", sem categoria, pulando a recusa do
 * arquivo com mais de uma categoria. Aqui o repositório é o REAL, sobre um cliente falso que registra o que
 * foi pedido ao banco: cada leitura que a tela ou a rota usa tem de pedir a coluna.
 *
 * O que NÃO alcança: o banco é falso. Que a coluna exista e volte preenchida só se prova com a migração
 * aplicada (a consulta de depois, no PR).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipo */
const pedidos: Array<{ tabela: string; colunas: string }> = []
let linhasPorTabela: Record<string, any[]> = {}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const q: any = {
                select: (colunas: string) => { pedidos.push({ tabela, colunas }); return q },
                eq: () => q, in: () => q, order: () => q, range: () => q, limit: () => q,
                then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: linhasPorTabela[tabela] ?? [], error: null }).then(ok),
            }
            return q
        },
    },
}))
jest.mock('@/lib/atendimentos-ia/tabelas-da-conta', () => ({ contasQueVinculam: jest.fn(async () => new Map()), derivarTabelasDaConta: jest.fn(async () => ({ tabelas: [] as unknown[] })) }))

import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR } from '@/utils/atendimentos-ia-importacao-celula'
import { categoriasDoFornecedorDosItensGravados, listarCategorias, obterArquivosDaTabela, obterDadosDaTabela, obterFornecedor, obterTabela } from '@/lib/atendimentos-ia/repositorio'

const colunasDe = (tabela: string) => pedidos.filter((p) => p.tabela === tabela).map((p) => p.colunas.split(',').map((c) => c.trim()))

beforeEach(() => {
    pedidos.length = 0
    linhasPorTabela = {
        orcamentista_tabela: [{ id: 't1', fornecedor_id: 'f1', arquivo_path: 'a', arquivo_nome: 'a.xlsx', motor_path: 'm', motor_nome: 'm.xlsx', vigencia: null, categoria_chave: 'VIDRO' }],
        orcamentista_fornecedor: [{ id: 'f1', nome: 'Estrela', nicho_id: 'n1' }],
        orcamentista_nicho: [{ id: 'n1', modelo: 'FABRICACAO', nome: 'Vidraçaria' }],
        orcamentista_categoria_catalogo: [{ chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 }],
    }
})

describe('cada leitura da tabela pede `categoria_chave`', () => {
    it('obterTabela (o PATCH decide a troca por ela)', async () => {
        const t = await obterTabela('t1')
        expect(colunasDe('orcamentista_tabela')[0]).toContain('categoria_chave')
        expect(t?.categoria_chave).toBe('VIDRO')
    })

    it('obterTabela pede também a `familia`: o PATCH decide por ela se a tabela de Perfil ficaria sem família (20261028000002)', async () => {
        linhasPorTabela.orcamentista_tabela = [{ ...linhasPorTabela.orcamentista_tabela[0], categoria_chave: 'PERFIL', familia: 'PVC' }]
        const t = await obterTabela('t1')
        expect(colunasDe('orcamentista_tabela')[0]).toContain('familia')
        expect(t?.familia).toBe('PVC')
    })

    it('obterArquivosDaTabela (a importação decide a recusa por ela)', async () => {
        const t = await obterArquivosDaTabela('t1')
        expect(colunasDe('orcamentista_tabela')[0]).toContain('categoria_chave')
        expect(t?.categoria_chave).toBe('VIDRO')
    })

    it('obterDadosDaTabela (a tela da importação mostra a categoria) — com o RÓTULO do catálogo', async () => {
        const t = await obterDadosDaTabela('t1')
        expect(colunasDe('orcamentista_tabela')[0]).toContain('categoria_chave')
        expect(t).toEqual(expect.objectContaining({ categoria_chave: 'VIDRO', categoria_rotulo: 'Vidro' }))
    })

    it('obterDadosDaTabela de tabela SEM categoria: chave e rótulo nulos, e o catálogo nem é consultado', async () => {
        linhasPorTabela.orcamentista_tabela = [{ ...linhasPorTabela.orcamentista_tabela[0], categoria_chave: null }]
        const t = await obterDadosDaTabela('t1')
        expect(t).toEqual(expect.objectContaining({ categoria_chave: null, categoria_rotulo: null }))
        expect(pedidos.some((p) => p.tabela === 'orcamentista_categoria_catalogo')).toBe(false)
    })

    it('a lista de tabelas do fornecedor (a coluna "Categoria" da tela)', async () => {
        const f = await obterFornecedor('f1')
        expect(colunasDe('orcamentista_tabela').some((cs) => cs.includes('categoria_chave'))).toBe(true)
        expect(f?.tabelas_da_lista[0].categoria_chave).toBe('VIDRO')
    })

    it('listarCategorias lê o catálogo da plataforma, com chave, rótulo e ordem', async () => {
        expect(await listarCategorias()).toEqual([{ chave: 'VIDRO', rotulo: 'Vidro', ordem: 6 }])
        expect(colunasDe('orcamentista_categoria_catalogo')[0]).toEqual(['chave', 'rotulo', 'ordem'])
    })

    it('as categorias do fornecedor dos itens gravados: pede a coluna do arquivo, e devolve null onde o arquivo não a trazia', async () => {
        linhasPorTabela.orcamentista_tabela_item = [{ [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Vidro' }, { [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: null }, {}]
        expect(await categoriasDoFornecedorDosItensGravados('t1')).toEqual(['Vidro', null, null])
        expect(colunasDe('orcamentista_tabela_item')[0]).toEqual([COLUNA_DA_CATEGORIA_DO_FORNECEDOR])
    })
})
