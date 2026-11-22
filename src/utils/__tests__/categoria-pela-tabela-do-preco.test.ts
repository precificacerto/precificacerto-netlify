/**
 * A CATEGORIA SAI DA TABELA QUE DEU O PREÇO, NÃO DO TEXTO DA LINHA (dono do produto, 22/11/2026).
 *
 * - os 14 itens da Wolff_Vedacao escritos "Acessórios" entram como VEDACAO, a categoria da tabela deles (o segmento da linha nem é lido);
 * - o código em duas tabelas (10241 Ferragem/Persianas; 8428 e 8431 Ferragem/Reforço) vai à categoria da tabela DE ONDE O CÁLCULO TIROU O
 *   PREÇO — os mesmos escopos do custo (`tabelasDeOndeOPrecoSai`), sem escolha na mão e sem "Ferragem" fixo;
 * - sem tabela de onde o preço saia: nomeado, com o motivo, nunca inventado;
 * - só leitura.
 */
export {}
type Linha = Record<string, unknown>
const db: Record<string, Linha[]> = {}
const escritas: string[] = []
const selects: Array<{ tabela: string; colunas: string }> = []

function consulta(tabela: string) {
    let linhas = [...(db[tabela] ?? [])]
    const q: Record<string, unknown> = {
        select: (colunas: string) => { selects.push({ tabela, colunas }); return q },
        eq: (c: string, v: unknown) => { linhas = linhas.filter((l) => l[c] === v); return q },
        in: (c: string, vs: unknown[]) => { linhas = linhas.filter((l) => vs.includes(l[c])); return q },
        is: (c: string, v: unknown) => { linhas = linhas.filter((l) => (l[c] ?? null) === v); return q },
        order: () => q,
        maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(ok),
    }
    for (const m of ['insert', 'update', 'delete', 'upsert']) q[m] = () => { escritas.push(`${m}:${tabela}`); return q }
    return q
}
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => consulta(t), rpc: (f: string) => { escritas.push(`rpc:${f}`); return Promise.resolve({ data: null, error: null }) } } }))

const familias = { atual: null as unknown }
jest.mock('@/lib/atendimentos-ia/levantamento-da-conversa', () => ({ lerFamiliasDaEmpresa: async () => familias.atual }))
const principais = {
    principais: new Map([['FERRAGENS', 'celsus'], ['PERSIANAS', 'wolf'], ['REFORCO', 'wolf'], ['VEDACAO', 'wolf'], ['ACESSORIOS_VEDACAO', 'wolf'], ['VIDRO', 'estrela']]),
    ambiguas: [] as string[],
    seguintes: new Map([['VEDACAO', [['outro']]]]),
}
jest.mock('@/lib/atendimentos-ia/tabelas-da-conta', () => ({ principaisDaConta: async () => principais }))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const S = () => require('@/lib/atendimentos-ia/categoria-do-relatorio-servidor') as typeof import('@/lib/atendimentos-ia/categoria-do-relatorio-servidor')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const P = () => require('@/lib/atendimentos-ia/categoria-do-relatorio') as typeof import('@/lib/atendimentos-ia/categoria-do-relatorio')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const C = () => require('@/lib/atendimentos-ia/custo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento-servidor')

const T = 'tenant-1'
const TABELAS = ['t-celsus', 't-persianas', 't-reforco', 't-vedacao', 't-acess', 't-outro', 't-estrela']
beforeEach(() => {
    escritas.length = 0; selects.length = 0
    familias.atual = { ok: true, familias: [
        { familia: 'PVC', calculo: { id: 'motor-wolf', nome: 'Motor' }, tabelasDePreco: TABELAS },
        // outra família da conta: a tabela dela é lida junto, mas não é de onde sai o preço de um item PVC
        { familia: 'ALU', calculo: null, tabelasDePreco: ['t-alu'] },
    ], candidatos: [] }
    db.orcamentista_tabela = [
        { id: 't-celsus', fornecedor_id: 'celsus', familia: 'PVC', categoria_chave: 'FERRAGENS' },
        { id: 't-persianas', fornecedor_id: 'wolf', familia: 'PVC', categoria_chave: 'PERSIANAS' },
        { id: 't-reforco', fornecedor_id: 'wolf', familia: 'PVC', categoria_chave: 'REFORCO' },
        { id: 't-vedacao', fornecedor_id: 'wolf', familia: 'PVC', categoria_chave: 'VEDACAO' },
        { id: 't-acess', fornecedor_id: 'wolf', familia: 'PVC', categoria_chave: 'ACESSORIOS_VEDACAO' },
        { id: 't-outro', fornecedor_id: 'outro', familia: null, categoria_chave: 'VEDACAO' },
        { id: 't-estrela', fornecedor_id: 'estrela', familia: null, categoria_chave: 'VIDRO' },
        { id: 't-fora', fornecedor_id: 'wolf', familia: 'PVC', categoria_chave: 'INSTALACAO' },
        { id: 't-alu', fornecedor_id: 'wolf', familia: null, categoria_chave: 'INSTALACAO' },
    ]
    // o `segmento` da linha MENTE de propósito: ele não pode decidir nada
    db.orcamentista_tabela_item = [
        { tabela_id: 't-celsus', codigo: '10241', segmento: 'Ferragem' }, { tabela_id: 't-persianas', codigo: '10241', segmento: 'Persianas' },
        { tabela_id: 't-celsus', codigo: '8428', segmento: 'Ferragem' }, { tabela_id: 't-reforco', codigo: '8428', segmento: 'Reforço' },
        { tabela_id: 't-vedacao', codigo: '1927/WOLFF', segmento: 'Acessórios' },
        { tabela_id: 't-acess', codigo: 'PAR1025', segmento: 'Acessório' },
        { tabela_id: 't-celsus', codigo: '15444', segmento: 'Ferragem' },
        { tabela_id: 't-outro', codigo: 'SIL-DOWCOR', segmento: 'Vedação' },
        { tabela_id: 't-estrela', codigo: 'VTIN08', segmento: 'Vidro' }, { tabela_id: 't-outro', codigo: 'VTIN08', segmento: 'Vedação' },
        { tabela_id: 't-alu', codigo: '10241', segmento: 'Acabamento' },
        { tabela_id: 't-fora', codigo: 'SO-FORA', segmento: 'Acabamento' },
    ]
    db.orcamentista_motor = [{ id: 'motor-wolf', fornecedor_id: 'wolf' }]
    db.orcamentista_motor_familia = [{ motor_id: 'motor-wolf', familia: 'PVC' }]
    db.orcamentista_familia_ramificacao = []
    db.orcamentista_categoria_catalogo = []
})

const classificar = (linhas: Array<{ codigo: string; caminho: string; familia?: string | null }>) =>
    S().classificacaoDoRelatorio(T, linhas.map((l) => ({ familia: 'PVC', ...l })), ['PVC'])

describe('a categoria vem da TABELA de onde o preço saiu', () => {
    it('os códigos em duas tabelas seguem o dinheiro: 10241 → PERSIANAS e 8428 → REFORCO (a tabela do fornecedor do motor), nunca FERRAGENS', async () => {
        const c = await classificar([{ codigo: '10241', caminho: 'perfil' }, { codigo: '8428', caminho: 'perfil' }])
        expect(c.categoriasDoCodigo.get('10241')).toEqual(['PERSIANAS'])
        expect(c.categoriasDoCodigo.get('8428')).toEqual(['REFORCO'])
        expect(c.motivos.size).toBe(0)
    })
    it('o item escrito "Acessórios" numa tabela de VEDAÇÃO entra como VEDACAO: o segmento da linha nem é lido', async () => {
        const c = await classificar([{ codigo: '1927/WOLFF', caminho: 'insumo' }, { codigo: 'PAR1025', caminho: 'insumo' }])
        expect(c.categoriasDoCodigo.get('1927/WOLFF')).toEqual(['VEDACAO'])
        expect(c.categoriasDoCodigo.get('PAR1025')).toEqual(['ACESSORIOS_VEDACAO'])
        for (const s of selects.filter((x) => x.tabela === 'orcamentista_tabela_item')) expect(s.colunas).toBe('tabela_id, codigo')
    })
    it('o insumo desce aos fornecedores seguintes, como o custo; o vidro sai da categoria VIDRO do principal', async () => {
        const c = await classificar([{ codigo: 'SIL-DOWCOR', caminho: 'insumo' }, { codigo: 'VTIN08', caminho: 'vidro' }, { codigo: '15444', caminho: 'insumo' }])
        expect(c.categoriasDoCodigo.get('SIL-DOWCOR')).toEqual(['VEDACAO'])
        expect(c.categoriasDoCodigo.get('VTIN08')).toEqual(['VIDRO'])
        expect(c.categoriasDoCodigo.get('15444')).toEqual(['FERRAGENS'])
    })
    it('sem tabela de onde o preço saia, o código fica SEM categoria, com o motivo — nunca a categoria do texto nem a "mais provável"', async () => {
        const P_ = P()
        const c = await classificar([
            { codigo: 'NAO-EXISTE', caminho: 'insumo' },
            { codigo: 'SO-FORA', caminho: 'insumo' }, // a tabela dele não é da família: não é de onde o preço sai
            { codigo: '15444', caminho: 'perfil' }, // na Celsus, fora do fornecedor do motor
            { codigo: '1927/WOLFF', caminho: 'insumo', familia: 'ALUMINIO' },
        ])
        expect(c.categoriasDoCodigo.get('NAO-EXISTE')).toEqual([])
        expect(c.motivos.get('NAO-EXISTE')).toBe(P_.MOTIVO_EM_NENHUMA_TABELA)
        expect(c.motivos.get('SO-FORA')).toBe(P_.MOTIVO_EM_NENHUMA_TABELA)
        expect(c.motivos.get('15444')).toBe(P_.motivoForaDoEscopo('perfil'))
        expect(c.motivos.get('1927/WOLFF')).toBe(S().MOTIVO_ITEM_SEM_FAMILIA)
    })
    it('o mesmo código em itens de famílias diferentes é classificado item a item (a falta de um não some sob o outro)', async () => {
        const c = await classificar([{ codigo: '1927/WOLFF', caminho: 'insumo', familia: 'NAO-EXISTE' }, { codigo: '1927/WOLFF', caminho: 'insumo' }])
        expect(c.categoriasDoCodigo.get('1927/WOLFF')).toEqual([])
        expect(c.motivos.get('1927/WOLFF')).toBe(S().MOTIVO_ITEM_SEM_FAMILIA)
    })
    it('a configuração que não deixa ler as famílias vira o motivo de todas as linhas (com a frase dela)', async () => {
        familias.atual = { ok: false, motivo: 'SEM_FAMILIA', frase: 'Falta de configuração — a família', detalhe: '' }
        const c = await classificar([{ codigo: '10241', caminho: 'perfil' }])
        expect(c.categoriasDoCodigo.get('10241')).toEqual([])
        expect(c.motivos.get('10241')).toBe(S().motivoDaConfiguracao('Falta de configuração — a família'))
    })
    it('só LÊ: nenhuma escrita, nenhuma função do banco', async () => {
        await classificar([{ codigo: '10241', caminho: 'perfil' }, { codigo: '1927/WOLFF', caminho: 'insumo' }])
        expect(escritas).toEqual([])
    })
})

describe('categoriaDoPreco e a junção por código (puros)', () => {
    it('uma categoria de onde o preço sai → ela; duas → nenhuma, com as duas; tabela sem categoria → sem, com motivo', () => {
        const { categoriaDoPreco, MOTIVO_TABELAS_DE_CATEGORIAS_DIFERENTES, MOTIVO_TABELA_SEM_CATEGORIA } = P()
        const x = { categoria: 'X' }, y = { categoria: 'Y' }, nula = { categoria: null as string | null }
        expect(categoriaDoPreco('perfil', [x, y], [x])).toEqual({ categoria: 'X' })
        expect(categoriaDoPreco('insumo', [x, y], [y, x])).toEqual({ categoria: null, categorias: ['X', 'Y'], motivo: MOTIVO_TABELAS_DE_CATEGORIAS_DIFERENTES })
        expect(categoriaDoPreco('insumo', [nula], [nula])).toEqual({ categoria: null, categorias: [], motivo: MOTIVO_TABELA_SEM_CATEGORIA })
        // [null, X] não é X: com uma só nomeada, a lista vai vazia (senão o agrupamento a poria em X)
        expect(categoriaDoPreco('insumo', [nula, x], [nula, x])).toEqual({ categoria: null, categorias: [], motivo: MOTIVO_TABELAS_DE_CATEGORIAS_DIFERENTES })
        expect(categoriaDoPreco('vidro', [x], [])).toEqual({ categoria: null, categorias: [], motivo: 'está em tabelas da família, mas em nenhuma de onde o cálculo tira o preço do vidro' })
    })
    it('o mesmo código em itens com categorias diferentes é ambíguo, nomeado; uma falta em qualquer item tira o código da categoria', () => {
        const { juntarCategoriasDoCodigo, MOTIVO_ITENS_EM_CATEGORIAS_DIFERENTES, MOTIVO_EM_NENHUMA_TABELA } = P()
        const j = juntarCategoriasDoCodigo([
            { codigo: 'a', r: { categoria: 'X' } }, { codigo: 'a', r: { categoria: 'X' } },
            { codigo: 'b', r: { categoria: 'X' } }, { codigo: 'b', r: { categoria: 'Y' } },
            { codigo: 'c', r: { categoria: 'X' } }, { codigo: 'c', r: { categoria: null, categorias: [], motivo: MOTIVO_EM_NENHUMA_TABELA } },
        ])
        expect(j.categoriasDoCodigo.get('a')).toEqual(['X'])
        expect(j.motivos.has('a')).toBe(false)
        expect(j.categoriasDoCodigo.get('b')).toEqual(['X', 'Y'])
        expect(j.motivos.get('b')).toBe(MOTIVO_ITENS_EM_CATEGORIAS_DIFERENTES)
        expect(j.categoriasDoCodigo.get('c')).toEqual([])
        expect(j.motivos.get('c')).toBe(MOTIVO_EM_NENHUMA_TABELA)
    })
    it('tabelasDeOndeOPrecoSai: perfil pelo motor; perfil sem motor e caminho desconhecido não têm de onde sair', () => {
        const { tabelasDeOndeOPrecoSai } = C()
        const wolf = { fornecedor_id: 'wolf', familia: 'PVC', categoria: 'PERSIANAS' }, celsus = { fornecedor_id: 'celsus', familia: 'PVC', categoria: 'FERRAGENS' }
        expect(tabelasDeOndeOPrecoSai('perfil', [celsus, wolf], { fornecedor_id: 'wolf', familias: ['PVC'] }, principais)).toEqual([wolf])
        expect(tabelasDeOndeOPrecoSai('perfil', [celsus, wolf], null, principais)).toEqual([])
        expect(tabelasDeOndeOPrecoSai('outro', [celsus, wolf], { fornecedor_id: 'wolf', familias: ['PVC'] }, principais)).toEqual([])
        // o insumo: o primeiro degrau que tem o código (os dois principais aqui → os dois; quem decide é categoriaDoPreco)
        expect(tabelasDeOndeOPrecoSai('insumo', [celsus, wolf], null, principais)).toEqual([celsus, wolf])
    })
})
