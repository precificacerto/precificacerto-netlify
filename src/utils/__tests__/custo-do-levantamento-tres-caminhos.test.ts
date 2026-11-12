/**
 * @jest-environment node
 *
 * PORTÃO — O CUSTO PELOS TRÊS CAMINHOS no servidor (dono do produto, 12/11/2026, o comando único): `custoDoLevantamento` leva ao custo o insumo com
 * a quantidade da ESQUADRIA (a da aba × as unidades), o vidro com a área do pano × os panos × as unidades, e as faltas do avaliador, nomeadas. O
 * cálculo do levantamento é substituído por um resultado fixo (o caminho dele tem portão próprio); os principais da conta também.
 */
const calculo = { valor: null as unknown }
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
jest.mock('@/lib/atendimentos-ia/levantamento-da-conversa', () => ({
    calcularOLevantamento: async (): Promise<unknown> => calculo.valor,
    mensagemDoCalculo: () => ({ texto: '', desfecho: 'levantou' }),
}))
jest.mock('@/lib/atendimentos-ia/tabelas-da-conta', () => ({
    principaisDaConta: async (): Promise<unknown> => ({ principais: new Map([['FERRAGENS', 'detoni'], ['VIDRO', 'estrela']]), ambiguas: [] }),
}))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const S = () => require('@/lib/atendimentos-ia/custo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento-servidor')

const N = null as number | null
const BLOCO = { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: N, cred_ibs_pct: N, cred_cbs_pct: N }
const ITENS = [
    { codigo: '10457', descricao: 'ROLDANA DUPLA', custo: 2.5, unidade: 'PC', medida_barra_m: N, valor_barra_interno: N, valor_metro_interno: N, tabela_id: 't1', fornecedor_id: 'detoni', categoria: 'FERRAGENS', ...BLOCO },
    { codigo: 'VIN04', descricao: 'VIDRO COMUM INCOLOR 04MM', custo: 74.96, unidade: 'PC', medida_barra_m: N, valor_barra_interno: N, valor_metro_interno: N, tabela_id: 't2', fornecedor_id: 'estrela', categoria: 'VIDRO', ...BLOCO },
]
function montar() {
    calculo.valor = {
        lev: { nome: 'Teste', itens: [{ vidro: 'incolor 4 mm', vidro_codigo: N }] },
        grupos: [{ familia: { rotulo: 'PVC' }, indices: [0] }],
        calculos: [{
            d: { cor: 'BRANCO', esquadrias: [{ numero: 1, tipologia: 'DP-02' }] },
            r: {
                esquadrias: [{
                    tipologia: 'DP-02', quantidade: 3, pecas: [],
                    insumos: [{ codigo: '10457', descricao: 'ROLDANA', quantidade: 2 }],
                    vidros: [{ vidro: 'VIDRO', largura_mm: 1000, altura_mm: 500, quantidade: 2, fixacao: N }],
                    faltasDoAvaliador: [{ aba: 'Insumos', linha: 3, codigo: 'Q9', mensagem: 'Linha 3 da aba Insumos (Q9): a fórmula não fecha.' }],
                }],
                total: { barras_por_codigo: {} }, faltas: [], resolucoes: {},
            },
            maos: [{ ok: true, custoMensal: 1000, minutosDaEmpresa: 1000, minutosPorUnidade: 10, quantidade: 3 }],
            daFamilia: { todos: ITENS, noEscopoDoMotor: [], fornecedorDoMotor: 'wolf' },
            cores: [],
        }],
    }
}
beforeEach(montar)
const ok = async () => {
    // o levantamento que chega ao servidor é o mesmo que o cálculo leu: o vidro e o vidro escolhido vêm dele
    const r = await S().custoDoLevantamento('t', { ok: true } as never, (calculo.valor as { lev: never }).lev)
    if ('recusas' in r) throw new Error(r.recusas.join(' | '))
    return r
}

describe('o custo pelos três caminhos, no servidor', () => {
    it('o INSUMO: a quantidade da aba × as unidades da esquadria (2 × 3 = 6), pelo principal da categoria', async () => {
        const r = await ok()
        const l = r.itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect([l.codigo, l.consumo_item]).toEqual(['10457', 6])
        expect(l.custo_bruto_material).toBeCloseTo(15, 10)
    })
    it('o VIDRO: a área do pano × os panos × as unidades (0,5 m² × 2 × 3 = 3 m²), traduzido do texto', async () => {
        const r = await ok()
        const l = r.itens[0].materiais.find((m) => m.caminho === 'vidro')!
        expect([l.codigo, l.consumo_item, l.resolucao]).toEqual(['VIN04', 3, 'vidro_traduzido'])
    })
    it('a linha do avaliador que não fechou é FALTA nomeada, com o caminho da aba', async () => {
        const r = await ok()
        expect(r.faltas.map((f) => [f.caminho, f.codigo_do_motor, f.motivo, f.esquadria])).toEqual([['insumo', 'Q9', 'LINHA_NAO_AVALIADA', 1]])
    })
    it('o vidro ESCOLHIDO vence o texto', async () => {
        ;(calculo.valor as { lev: { itens: Array<Record<string, unknown>> } }).lev.itens[0].vidro_codigo = 'VIN04'
        ;(calculo.valor as { lev: { itens: Array<Record<string, unknown>> } }).lev.itens[0].vidro = 'qualquer coisa'
        const r = await ok()
        expect(r.itens[0].materiais.find((m) => m.caminho === 'vidro')!.resolucao).toBe('vidro_escolhido')
    })
})

export {}
