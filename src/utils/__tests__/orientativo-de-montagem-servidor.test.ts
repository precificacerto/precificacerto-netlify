/**
 * A LEITURA do orientativo de montagem: SÓ LEITURA (nenhuma escrita, nenhuma função do banco; o modo de aproveitamento não é tocado), o
 * recálculo pelo caminho do orçamento que NÃO grava (`custoDeAgora`), a conferência contra as peças gravadas, e o desenho pela escolha única.
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
jest.mock('@/lib/atendimentos-ia/tabelas-da-conta', () => ({ derivarTabelasDaConta: async () => ({ tabelas: [{ tabelaId: 'tab-perfil', vale: true, familiaChave: 'PVC' }] }) }))

const recalculo = { atual: null as unknown }
jest.mock('@/lib/atendimentos-ia/orcamento-calculado', () => {
    class ErroDoCalculo extends Error { constructor(readonly recusas: string[]) { super(recusas.join(' | ')) } }
    return { ErroDoCalculo, custoDeAgora: async () => { const r = recalculo.atual; if (r instanceof Error) throw r; return r } }
})
jest.mock('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor', () => ({
    itensDoArquivo: async (): Promise<unknown> => ({
        itens: [{ ordem: 1, descricao: 'JANELA DE CORRER' }, { ordem: 2, descricao: 'PORTA DE GIRO' }],
        linhas: [],
        paraODesenho: [{ tipologia: 'DP-02', descricao: 'JANELA', familia: 'PVC', valores: {} }, { tipologia: 'DP-72', descricao: 'PORTA', familia: 'PVC', valores: {} }],
    }),
}))
const IMG = { dados: 'data:image/png;base64,AAAA', formato: 'PNG' }
jest.mock('@/lib/atendimentos-ia/desenho-do-catalogo-servidor', () => ({
    lerCatalogoDeDesenhos: async (): Promise<unknown> => ({ ok: true, linhas: [] }),
    desenhosDosItens: async (itens: Array<{ tipologia: string }>) => itens.map((i) => (i.tipologia === 'DP-02' ? { imagem: IMG, degrau: 'por_variavel' } : { frase: 'o desenho da tipologia DP-72 não está no catálogo de desenhos: o item sai sem figura' })),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const S = () => require('@/lib/atendimentos-ia/orientativo-de-montagem-servidor') as typeof import('@/lib/atendimentos-ia/orientativo-de-montagem-servidor')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const E = () => require('@/lib/atendimentos-ia/orcamento-calculado') as { ErroDoCalculo: new (r: string[]) => Error }

const T = 'tenant-1'
const peca = { perfil: '1023/WOLFF', codigo: '1023', descricao: 'CLICK GUIA', comprimento_mm: 1500, quantidade_por_esquadria: 2, quantidade: 2, corte: '90/90', posicao: 'Largura' }
beforeEach(() => {
    escritas.length = 0; selects.length = 0
    db.orcamentista_orcamento = [{ id: 'o-12', tenant_id: T, deleted_at: null, aproveitamento_modo: 'SEM' }]
    db.orcamentista_orcamento_item = [
        { id: 'i-1', tenant_id: T, orcamento_id: 'o-12', ordem: 1, calculo_id: 'c-1', familia: 'PVC', removido_em: null, tipologia: 'DP-02', largura_mm: 1500, altura_mm: 1200, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'vidro 8mm' },
        { id: 'i-2', tenant_id: T, orcamento_id: 'o-12', ordem: 2, calculo_id: 'c-2', familia: 'PVC', removido_em: null, tipologia: 'DP-72', largura_mm: 900, altura_mm: 2100, quantidade: 1, cor_perfil: 'BRANCO', vidro: null },
        { id: 'i-3', tenant_id: T, orcamento_id: 'o-12', ordem: 3, calculo_id: null, familia: 'PVC', removido_em: null, tipologia: 'DP-07', largura_mm: 1, altura_mm: 1, quantidade: 1, cor_perfil: null, vidro: null },
    ]
    db.orcamentista_orcamento_item_peca = [
        { tenant_id: T, orcamento_item_id: 'i-1', calculo_id: 'c-1', ordem: 1, ...peca, comprimento_mm: '1500', quantidade_por_esquadria: '2' },
        { tenant_id: T, orcamento_item_id: 'i-1', calculo_id: 'c-velho', ordem: 1, ...peca, comprimento_mm: '9', quantidade_por_esquadria: '9' },
        { tenant_id: T, orcamento_item_id: 'i-2', calculo_id: 'c-2', ordem: 1, ...peca, comprimento_mm: '2000', quantidade_por_esquadria: '1' },
    ]
    // o material do cálculo VIGENTE entra; o de um cálculo anterior do mesmo item, não
    db.orcamentista_orcamento_item_material = [
        { tenant_id: T, orcamento_item_id: 'i-1', calculo_id: 'c-1', caminho: 'insumo', codigo_na_tabela: 'NYL-0630', descricao: 'BUCHA', unidade_compra: 'PC', consumo_item: '4' },
        { tenant_id: T, orcamento_item_id: 'i-1', calculo_id: 'c-velho', caminho: 'insumo', codigo_na_tabela: 'VELHO', descricao: 'DO CÁLCULO DE ANTES', unidade_compra: 'PC', consumo_item: '9' },
    ]
    db.orcamentista_tabela_item = [{ tabela_id: 'tab-perfil', codigo: '1023', peso: 0.5, medida_barra_m: 6 }]
    const itemRecalculado = (comprimento: number, quantidade: number): Record<string, unknown> => ({
        pecas: [{ ...peca, comprimento_mm: comprimento, quantidade_por_esquadria: quantidade, linha: 7, obs: 'MARCO - LARGURA' }], insumos: [], vidros: [], vidro: null,
    })
    recalculo.atual = {
        orc: { itens: [{ id: 'i-1' }, { id: 'i-2' }] },
        // o item 1 confere; o item 2 NÃO (o motor mudou: 2001 contra os 2000 gravados)
        custo: { ok: true, montagemPorItem: [itemRecalculado(1500, 2), itemRecalculado(2001, 1)] },
    }
})

it('só LÊ: nenhuma escrita, nenhuma função do banco — e o orçamento só é lido pelo id (o aproveitamento não é tocado)', async () => {
    await S().lerOrientativoDeMontagem(T, 'o-12')
    expect(escritas).toEqual([])
    expect(selects.find((s) => s.tabela === 'orcamentista_orcamento')?.colunas).toBe('id')
})

it('por esquadria do cálculo VIGENTE: a que confere traz a Obs. do motor; a que diverge sai GRAVADA, sem Obs., com o aviso', async () => {
    const r = await S().lerOrientativoDeMontagem(T, 'o-12')
    if ('semMigracao' in r) throw new Error('sem migração')
    expect(r.itensSemCalculo).toEqual([3])
    expect(r.esquadrias.map((e) => [e.ordem, e.tipologia, e.descricao, e.fonte])).toEqual([[1, 'DP-02', 'JANELA DE CORRER', 'recalculado'], [2, 'DP-72', 'PORTA DE GIRO', 'gravado']])
    expect(r.esquadrias[0].perfis.linhas).toEqual([expect.objectContaining({ comprimento_mm: 1500, quantidade: 2, obs: 'MARCO - LARGURA', peso_kg: 1.5 })])
    expect(r.esquadrias[1].perfis.linhas).toEqual([expect.objectContaining({ comprimento_mm: 2000, obs: null })])
    expect(r.esquadrias[1].aviso).toContain('o motor mudou desde o cálculo')
})

it('o desenho de cada esquadria pela escolha única; sem desenho, o espaço vazio com a razão', async () => {
    const r = await S().lerOrientativoDeMontagem(T, 'o-12')
    if ('semMigracao' in r) throw new Error('sem migração')
    expect(r.esquadrias[0]).toMatchObject({ desenho: IMG, semDesenho: null })
    expect(r.esquadrias[1]).toMatchObject({ desenho: null, semDesenho: 'Sem desenho: o desenho da tipologia DP-72 não está no catálogo de desenhos: o item sai sem figura.' })
})

it('o recálculo que recusa NÃO derruba o relatório: as gravadas saem, com a razão', async () => {
    recalculo.atual = new (E().ErroDoCalculo)(['a cor do perfil'])
    const r = await S().lerOrientativoDeMontagem(T, 'o-12')
    if ('semMigracao' in r) throw new Error('sem migração')
    expect(r.esquadrias.map((e) => e.fonte)).toEqual(['gravado', 'gravado'])
    expect(r.esquadrias[0].aviso).toContain('(a cor do perfil)')
    // sem o recálculo, os acessórios saem do material GRAVADO do cálculo vigente (por item), sem Obs.
    expect(r.esquadrias[0].acessorios).toEqual([{ codigo: 'NYL-0630', descricao: 'BUCHA', unidade: 'PC', quantidade: 4, obs: null, figura: null }])
    recalculo.atual = { orc: { itens: [] }, custo: { ok: false, recusas: ['a família PVC'] } }
    const r2 = await S().lerOrientativoDeMontagem(T, 'o-12')
    if ('semMigracao' in r2) throw new Error('sem migração')
    expect(r2.esquadrias[0].aviso).toContain('(a família PVC)')
})
