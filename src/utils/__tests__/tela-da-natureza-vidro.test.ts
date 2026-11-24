/**
 * @jest-environment node
 *
 * PORTÃO — O PADRÃO DO VIDRO NA TELA DA NATUREZA É UMA REFERÊNCIA DA TABELA DO PRINCIPAL (dono do produto, 24/11/2026: "a referência única do
 * vidro é a coluna codigo_wvetro"). A tela OFERECE as referências (`vidros`), CONFERE o padrão gravado contra elas (a frase na linha) e a
 * gravação RECUSA a referência que a tabela de vidro do fornecedor principal não tem. Os nove padrões são os de produção em 24/11/2026.
 */
import type { LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'

const REFERENCIAS = [{ referencia: 'VBO04', descricao: 'VIDRO MINI BOREAL 04MM' }, { referencia: 'VFIN05', descricao: 'VIDRO FLOAT (COMUM) INCOLOR 05MM' }, { referencia: 'VTIN06', descricao: 'VIDRO TEMPERADO INCOLOR 06MM' }]
let referencias = REFERENCIAS
const pedidos: string[] = []
jest.mock('@/lib/atendimentos-ia/vidro-padrao', () => ({
    ...jest.requireActual('@/lib/atendimentos-ia/vidro-padrao'),
    referenciasDeVidroDoPrincipal: jest.fn(async (tenantId: string) => { pedidos.push(tenantId); return referencias }),
}))
let gravadas: LinhaDaNatureza[] = []
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: { from: (tabela: string) => {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: tabela === 'orcamentista_natureza_da_variavel' ? gravadas : [], error: null }).then(ok)
        return q
    } },
}))
jest.mock('@/lib/atendimentos-ia/motor-da-familia', () => ({ lerMotoresDaConta: jest.fn(async () => ({ ok: true, familias: [{ familia: 'PVC', rotulo: 'PVC Wolf', levantamento: { id: 'm1', nome: 'Motor' } }] })) }))
jest.mock('@/lib/atendimentos-ia/levantamento-da-conversa', () => ({ lerVariaveisDasTipologias: jest.fn(async () => ({})) }))
jest.mock('@/lib/atendimentos-ia/textos-do-caminho-servidor', () => ({ lerTextosDoCaminho: jest.fn(async (): Promise<null> => null) }))
jest.mock('@/lib/atendimentos-ia/textos-do-caminho', () => ({ textosDaFamiliaNaTela: (): null => null }))

import { lerTelaDaNatureza, recusaDoVidroDaLinha } from '@/lib/atendimentos-ia/tela-da-natureza-servidor'

const vidro = (formato: string, opcao: string | null, natureza: LinhaDaNatureza['natureza'] = 'POLITICA'): LinhaDaNatureza =>
    ({ familia: 'PVC', linha: null, formato, variavel: 'VIDRO', natureza, opcao_padrao: opcao })
beforeEach(() => { referencias = REFERENCIAS; pedidos.length = 0; gravadas = [] })

describe('a tela oferece as referências e confere o padrão gravado', () => {
    it('a família leva as referências da tabela de vidro do principal, lidas da CONTA do pedido', async () => {
        const t = await lerTelaDaNatureza('conta-1')
        if (t.ok === false) throw new Error(t.frase)
        expect(t.familias.map((f) => f.vidros)).toEqual([REFERENCIAS])
        expect(pedidos).toEqual(['conta-1'])
    })
    it('o padrão que É uma referência da tabela não tem conferência; o que NÃO é (o código da Estrela) sai com a frase que o nomeia', async () => {
        gravadas = [vidro('fixo', 'VTIN06'), vidro('janela correr', 'VIN05'), vidro('maxim-ar', 'VBO3,4'), vidro('porta correr', null, 'ITEM')]
        const t = await lerTelaDaNatureza('conta-1')
        if (t.ok === false) throw new Error(t.frase)
        expect(t.familias[0].linhas.map((l) => [l.formato, l.conferencia])).toEqual([
            ['fixo', null],
            ['janela correr', 'O vidro VIN05 não existe na tabela de vidro do fornecedor principal: a referência é a coluna codigo_wvetro dela, e nenhuma das 3 é essa. Escolha uma das referências da tabela.'],
            ['maxim-ar', 'O vidro VBO3,4 não existe na tabela de vidro do fornecedor principal: a referência é a coluna codigo_wvetro dela, e nenhuma das 3 é essa. Escolha uma das referências da tabela.'],
            // a linha de natureza ITEM não tem padrão: nada a conferir
            ['porta correr', null],
        ])
    })
    it('a tabela do principal SEM referência nenhuma (antes de reimportar): todo padrão de vidro sai com a frase que manda importar a tabela', async () => {
        referencias = []
        gravadas = [vidro('fixo', 'VTIN06')]
        const t = await lerTelaDaNatureza('conta-1')
        if (t.ok === false) throw new Error(t.frase)
        expect(t.familias[0].linhas[0].conferencia).toBe('A tabela de vidro do fornecedor principal não traz nenhuma referência (a coluna codigo_wvetro): o vidro VTIN06 não tem como ser achado. Importe a tabela de vidro com a coluna preenchida.')
    })
    it('a comparação é IGUAL: a caixa e o espaço fazem outra referência', async () => {
        gravadas = [vidro('fixo', 'vtin06'), vidro('janela abrir', 'VTIN06 ')]
        const t = await lerTelaDaNatureza('conta-1')
        if (t.ok === false) throw new Error(t.frase)
        expect(t.familias[0].linhas.map((l) => l.conferencia === null)).toEqual([false, false])
    })
})

describe('a gravação recusa a referência que a tabela do principal não tem', () => {
    const linha = (x: Partial<{ variavel: string; natureza: 'POLITICA' | 'ITEM' | 'CALCULO'; opcao_padrao: string | null }>) =>
        ({ familia: 'PVC', formato: 'janela correr', variavel: 'VIDRO', natureza: 'POLITICA' as const, opcao_padrao: 'VFIN05' as string | null, ...x })
    it('a referência que existe passa; a que não existe (o código da Estrela, a outra caixa) é recusada com a frase', async () => {
        expect(await recusaDoVidroDaLinha('conta-1', linha({}))).toBeNull()
        expect(await recusaDoVidroDaLinha('conta-1', linha({ opcao_padrao: 'VIN05' }))).toBe(
            'O vidro VIN05 não existe na tabela de vidro do fornecedor principal: a referência é a coluna codigo_wvetro dela, e nenhuma das 3 é essa. Escolha uma das referências da tabela.')
        expect(await recusaDoVidroDaLinha('conta-1', linha({ opcao_padrao: 'vfin05' }))).not.toBeNull()
        expect(pedidos).toEqual(['conta-1', 'conta-1', 'conta-1'])
    })
    it('sem referência nenhuma na tabela do principal: recusa dizendo que é a tabela que não as traz', async () => {
        referencias = []
        expect(await recusaDoVidroDaLinha('conta-1', linha({}))).toBe(
            'A tabela de vidro do fornecedor principal não traz nenhuma referência (a coluna codigo_wvetro): o vidro VFIN05 não tem como ser achado. Importe a tabela de vidro com a coluna preenchida.')
    })
    it('só a POLÍTICA do VIDRO é conferida: a variável do motor e a linha de natureza ITEM passam sem nem ler a tabela', async () => {
        referencias = []
        expect(await recusaDoVidroDaLinha('conta-1', { ...linha({ variavel: 'ARI', opcao_padrao: 'BZ1770' }), formato: null })).toBeNull()
        expect(await recusaDoVidroDaLinha('conta-1', linha({ natureza: 'ITEM', opcao_padrao: null }))).toBeNull()
        expect(pedidos).toEqual([])
    })
})
