/**
 * O RELATÓRIO DE MATERIAIS (dono do produto, 16/11/2026): o que o pedido inteiro precisa, por categoria, na ordem da base de conhecimento.
 */
import {
    materiaisDoCalculoVigente, montarRelatorioDeMateriais, quantidadeNoRelatorio, unidadeDoConsumo, type MaterialGravado,
} from '@/lib/atendimentos-ia/relatorio-de-materiais'

const m = (codigo: string, consumo: number, caminho = 'perfil', unidade: string | null = 'MT', descricao: string | null = `peça ${codigo}`): MaterialGravado =>
    ({ codigo_na_tabela: codigo, descricao, unidade_compra: unidade, consumo_item: consumo, caminho })
const ROTULOS = new Map([['PERFIL', 'Perfil'], ['PERSIANAS', 'Persianas'], ['REFORCO', 'Reforço'], ['FERRAGENS', 'Ferragens'], ['VIDRO', 'Vidro']])

describe('montarRelatorioDeMateriais', () => {
    it('soma o consumo do mesmo código entre as esquadrias (o total do pedido)', () => {
        const r = montarRelatorioDeMateriais([m('9681', 6.9), m('9681', 3.1), m('9641', 2)], new Map([['9681', ['PERFIL']], ['9641', ['PERFIL']]]), ['PERFIL'], ROTULOS)
        expect(r.categorias).toEqual([{ chave: 'PERFIL', rotulo: 'Perfil', materiais: [
            { codigo: '9641', descricao: 'peça 9641', unidade: 'm', quantidade: 2 },
            { codigo: '9681', descricao: 'peça 9681', unidade: 'm', quantidade: 10 },
        ] }])
    })
    it('as categorias saem na ORDEM DA BASE DE CONHECIMENTO, não na do catálogo nem na alfabética', () => {
        const cats = new Map([['a', ['REFORCO']], ['b', ['PERFIL']], ['c', ['PERSIANAS']]])
        const r = montarRelatorioDeMateriais([m('a', 1), m('b', 1), m('c', 1)], cats, ['PERFIL', 'PERSIANAS', 'REFORCO'], ROTULOS)
        expect(r.categorias.map((c) => c.chave)).toEqual(['PERFIL', 'PERSIANAS', 'REFORCO'])
        // a categoria fora da ordem da família vai depois, na ordem do catálogo
        const r2 = montarRelatorioDeMateriais([m('a', 1), m('b', 1), m('v', 1, 'vidro', null)], new Map([...cats, ['v', ['VIDRO']]]), ['REFORCO', 'PERFIL'], ROTULOS)
        expect(r2.categorias.map((c) => c.chave)).toEqual(['REFORCO', 'PERFIL', 'VIDRO'])
    })
    it('código sem categoria e código em DUAS categorias não são postos em categoria nenhuma', () => {
        const r = montarRelatorioDeMateriais([m('x', 1), m('y', 2)], new Map([['y', ['FERRAGENS', 'PERFIL']]]), ['PERFIL'], ROTULOS)
        expect(r.categorias).toEqual([])
        expect(r.semCategoria.map((x) => x.codigo)).toEqual(['x'])
        expect(r.ambiguos).toEqual([{ codigo: 'y', descricao: 'peça y', unidade: 'm', quantidade: 2, categorias: ['FERRAGENS', 'PERFIL'] }])
    })
    it('a mesma categoria repetida na lista do código é uma só (não é ambíguo)', () => {
        const r = montarRelatorioDeMateriais([m('z', 1)], new Map([['z', ['VIDRO', 'VIDRO']]]), [], ROTULOS)
        expect(r.categorias.map((c) => c.chave)).toEqual(['VIDRO'])
        expect(r.ambiguos).toEqual([])
    })
})

describe('a unidade e a quantidade', () => {
    it('perfil em metros, vidro em m², insumo por comprimento (MT) em metros, insumo por peça em unidades', () => {
        expect(unidadeDoConsumo({ caminho: 'perfil', unidade_compra: 'PC' })).toBe('m')
        expect(unidadeDoConsumo({ caminho: 'vidro', unidade_compra: null })).toBe('m²')
        expect(unidadeDoConsumo({ caminho: 'insumo', unidade_compra: 'mt' })).toBe('m')
        expect(unidadeDoConsumo({ caminho: 'insumo', unidade_compra: 'PC' })).toBe('un')
    })
    it('o mesmo código em unidades diferentes não se soma', () => {
        const r = montarRelatorioDeMateriais([m('k', 2, 'insumo', 'MT'), m('k', 3, 'insumo', 'PC')], new Map([['k', ['FERRAGENS']]]), [], ROTULOS)
        expect(r.categorias[0].materiais.map((x) => [x.unidade, x.quantidade])).toEqual([['m', 2], ['un', 3]])
    })
    it('a quantidade no formato brasileiro, com a unidade', () => {
        expect(quantidadeNoRelatorio(8.7444, 'm')).toBe('8,74 m')
        expect(quantidadeNoRelatorio(12, 'un')).toBe('12 un')
        expect(quantidadeNoRelatorio(2.5, 'un')).toBe('2,50 un')
        expect(quantidadeNoRelatorio(3.2, 'm²')).toBe('3,20 m²')
    })
})

describe('materiaisDoCalculoVigente', () => {
    it('só as linhas do cálculo que o item guarda; item sem cálculo e cálculo anterior não entram', () => {
        const itens = [{ id: 'i1', calculo_id: 'c2' }, { id: 'i2', calculo_id: null }]
        const linhas = [
            { orcamento_item_id: 'i1', calculo_id: 'c1', n: 'antiga' },
            { orcamento_item_id: 'i1', calculo_id: 'c2', n: 'vigente' },
            { orcamento_item_id: 'i2', calculo_id: 'c9', n: 'sem cálculo no item' },
            { orcamento_item_id: 'i3', calculo_id: 'c2', n: 'de outro item' },
        ]
        expect(materiaisDoCalculoVigente(itens, linhas).map((l) => l.n)).toEqual(['vigente'])
    })
})
