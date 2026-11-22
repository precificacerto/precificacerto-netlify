/**
 * A LEITURA das barras do pedido: SÓ LEITURA (nenhum valor do orçamento é tocado), as peças do cálculo VIGENTE, a origem (item e tipologia),
 * a cor do item e o peso das tabelas que VALEM.
 */
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
jest.mock('@/lib/atendimentos-ia/tabelas-da-conta', () => ({
    derivarTabelasDaConta: async () => ({ tabelas: [{ tabelaId: 'tab-perfil', vale: true }, { tabelaId: 'tab-velha', vale: false }] }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const S = () => require('@/lib/atendimentos-ia/barras-do-pedido-servidor') as typeof import('@/lib/atendimentos-ia/barras-do-pedido-servidor')

const T = 'tenant-1'
beforeEach(() => {
    escritas.length = 0; selects.length = 0
    db.orcamentista_orcamento = [{ id: 'o-12', tenant_id: T, deleted_at: null, aproveitamento_modo: 'SEM' }]
    db.orcamentista_orcamento_item = [
        { id: 'i-1', tenant_id: T, orcamento_id: 'o-12', ordem: 1, calculo_id: 'c-1', familia: 'PVC', removido_em: null, tipologia: 'DP-72', cor_perfil: 'Branco' },
        { id: 'i-2', tenant_id: T, orcamento_id: 'o-12', ordem: 2, calculo_id: 'c-2', familia: 'PVC', removido_em: null, tipologia: 'DP-07', cor_perfil: 'Pintura Madeira' },
        { id: 'i-3', tenant_id: T, orcamento_id: 'o-12', ordem: 3, calculo_id: null, familia: 'PVC', removido_em: null, tipologia: 'DP-02', cor_perfil: 'Branco' },
    ]
    const pc = (o: Linha) => ({ tenant_id: T, perfil: '1023/WOLFF', codigo: '1023', descricao: 'CLICK GUIA', corte: '90/90', posicao: 'Largura', comprimento_barra_mm: '6000', serra_mm: '5', ordem: 1, ...o })
    db.orcamentista_orcamento_item_peca = [
        pc({ orcamento_item_id: 'i-1', calculo_id: 'c-1', comprimento_mm: '4646', quantidade: '2' }),
        pc({ orcamento_item_id: 'i-1', calculo_id: 'c-velho', comprimento_mm: '100', quantidade: '9' }),
        pc({ orcamento_item_id: 'i-2', calculo_id: 'c-2', comprimento_mm: '1495', quantidade: '1' }),
    ]
    db.orcamentista_tabela_item = [
        { tabela_id: 'tab-perfil', codigo: '1023', peso: 0.101, medida_barra_m: 6 },
        { tabela_id: 'tab-velha', codigo: '1023', peso: 9.9, medida_barra_m: 6 },
    ]
})

it('só LÊ: nenhuma escrita, e o orçamento só é lido para conferir a conta — nenhum valor dele entra no plano', async () => {
    await S().lerBarrasDoPedido(T, 'o-12')
    expect(escritas).toEqual([])
    expect(selects.find((s) => s.tabela === 'orcamentista_orcamento')?.colunas).toBe('id')
})

it('as peças do cálculo VIGENTE, por código + cor, com o item e a tipologia de origem; a cor PINTURA MADEIRA leva refilo', async () => {
    const r = await S().lerBarrasDoPedido(T, 'o-12')
    if ('semMigracao' in r) throw new Error('sem migração')
    expect(r.perfis.map((p) => [p.cor, p.refilo_mm, p.n_fracoes])).toEqual([['Branco', 0, 2], ['Pintura Madeira', 45, 1]])
    expect(r.perfis[0].barras[0].fracoes[0]).toEqual({ comprimento_mm: 4646, corte: '90/90', posicao: 'Largura', item: 1, tipologia: 'DP-72' })
    expect(r.perfis[1].barras[0].fracoes[0]).toMatchObject({ item: 2, tipologia: 'DP-07' })
    expect(r.itensSemCalculo).toEqual([3])
})

it('o peso vem só da tabela que VALE (0,101 kg/m, não os 9,9 da que não vale)', async () => {
    const r = await S().lerBarrasDoPedido(T, 'o-12')
    if ('semMigracao' in r) throw new Error('sem migração')
    expect(r.perfis[0].peso_kg_m).toBe(0.101)
    expect(r.codigosSemPeso).toEqual([])
})
