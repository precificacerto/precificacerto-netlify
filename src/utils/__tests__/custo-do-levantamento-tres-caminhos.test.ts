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
const padroes = { codigos: [] as string[] }
jest.mock('@/lib/atendimentos-ia/vidro-padrao', () => ({
    lerVidrosPadraoDaConta: async (): Promise<unknown> => ({
        ok: true, descricaoDo: new Map(),
        porFamilia: new Map([['PVC', padroes.codigos.map((c) => ({ materia_prima_id: 'mp', abertura: null as string | null, tipo: 'correr', tipologia: null as string | null, item_codigo: c }))]]),
    }),
}))
jest.mock('@/lib/atendimentos-ia/tabelas-da-conta', () => ({
    principaisDaConta: async (): Promise<unknown> => ({ principais: new Map([['FERRAGENS', 'detoni'], ['VIDRO', 'estrela']]), ambiguas: [], seguintes: new Map() }),
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
                total: { barras_por_codigo: {} }, faltas: [], resolucoes: {}, por_codigo: [], serra_mm: 5,
            },
            maos: [{ ok: true, custoMensal: 1000, minutosDaEmpresa: 1000, minutosPorUnidade: 10, quantidade: 3 }],
            daFamilia: { todos: ITENS, noEscopoDoMotor: [], fornecedorDoMotor: 'wolf' },
            cores: [],
        }],
    }
}
beforeEach(() => { montar(); padroes.codigos = [] })
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

    // O VIDRO NOMEADO SEM ESPESSURA (dono do produto, 15/11/2026): o texto bate com dois itens; o padrão da empresa desempata, e a
    // resolução gravada diz que foi por ele. Sem padrão, continua falta nomeada — nada se escolhe por ser o mais barato.
    const comDoisIncolores = () => {
        const c = calculo.valor as { lev: { itens: Array<Record<string, unknown>> }; calculos: Array<{ daFamilia: { todos: unknown[] } }> }
        c.calculos[0].daFamilia.todos = [...ITENS, { ...ITENS[1], codigo: 'VIN06', descricao: 'VIDRO COMUM INCOLOR 06MM', custo: 90 }]
        c.lev.itens[0].vidro = 'incolor'
    }
    /**
     * O `vendido_por` TEM DE CHEGAR do item da tabela até o material (16/11/2026): é ele que diz que o insumo é comprado em ROLO e que o
     * consumo do motor está em milímetros. Perdido no caminho, a escova voltaria a ser cobrada a preço de rolo por milímetro.
     */
    it('O CORTE (16/11/2026): as peças de cada item saem com o corte, a posição, a barra do código no agrupador e a serra do cálculo', async () => {
        const c = calculo.valor as { calculos: Array<{ r: Record<string, unknown> & { esquadrias: Array<Record<string, unknown>> } }> }
        c.calculos[0].r.esquadrias[0].pecas = [
            { perfil: 'SF66/WOLFF', codigo: '9681', descricao: 'SF66', comprimento_mm: 1215.5, quantidade_por_esquadria: 2, quantidade: 6, corte: '45S/45S', posicao: 'Largura' },
            { perfil: 'IL36/WOLFF', codigo: '9711', descricao: 'IL36', comprimento_mm: 1100, quantidade_por_esquadria: 1, quantidade: 3, corte: '90/90', posicao: 'Altura' },
        ]
        c.calculos[0].r.por_codigo = [{ codigo: '9681', comprimento_barra_mm: 6000 }]
        c.calculos[0].r.serra_mm = 4
        const r = await ok()
        expect(r.pecasPorItem).toHaveLength(1)
        expect(r.pecasPorItem[0].map((p) => [p.codigo, p.corte, p.posicao, p.quantidade, p.comprimento_barra_mm, p.serra_mm])).toEqual([
            ['9681', '45S/45S', 'Largura', 6, 6000, 4],
            // o código que não passou pelo agrupador (sem preço) fica sem barra: nulo, nunca uma barra suposta
            ['9711', '90/90', 'Altura', 3, null, 4],
        ])
    })
    it('o insumo em ROLO lido da TABELA: o vendido_por chega ao material e o custo sai por metro', async () => {
        const c = calculo.valor as { lev: { itens: Array<Record<string, unknown>> }; calculos: Array<{ daFamilia: { todos: unknown[] }; r: { esquadrias: Array<Record<string, unknown>> } }> }
        c.calculos[0].daFamilia.todos = [...ITENS, {
            codigo: '946/WOLFF', descricao: 'ESCOVA DE VEDAÇÃO COM BARREIRA 6X7MM', custo: 613.872, unidade: 'MT', vendido_por: 'barra',
            medida_barra_m: 300, valor_barra_interno: 613.872, valor_metro_interno: 2.04624, tabela_id: 't3', fornecedor_id: 'detoni', categoria: 'FERRAGENS', ...BLOCO,
        }]
        c.calculos[0].r.esquadrias[0].insumos = [{ codigo: '946/WOLFF', descricao: 'ESCOVA', quantidade: 25976 }]
        const r = await ok()
        const l = r.itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect([l.codigo, l.medida_unidade, l.unidade_compra]).toEqual(['946/WOLFF', 300, 'MT'])
        // a esquadria tem 3 unidades: 3 × 25.976 mm = 77,928 m
        expect(l.consumo_item).toBeCloseTo(77.928, 9)
        expect(l.custo_bruto_material).toBeCloseTo(77.928 * (613.872 / 300), 9)
        expect(l.custo_bruto_material).toBeLessThan(170)
    })
    it('o PADRÃO da empresa desempata o vidro que bate com dois itens, e a resolução é vidro_padrao', async () => {
        comDoisIncolores()
        padroes.codigos = ['VIN06']
        const r = await ok()
        const l = r.itens[0].materiais.find((m) => m.caminho === 'vidro')!
        expect([l.codigo, l.resolucao]).toEqual(['VIN06', 'vidro_padrao'])
        expect(r.faltas.some((f) => f.caminho === 'vidro')).toBe(false)
    })
    it('sem padrão cadastrado, o mesmo vidro continua falta nomeada (AMBÍGUO), e o custo não escolhe nenhum', async () => {
        comDoisIncolores()
        const r = await ok()
        expect(r.faltas.filter((f) => f.caminho === 'vidro').map((f) => f.motivo)).toEqual(['VIDRO_AMBIGUO'])
        expect(r.itens[0].materiais.some((m) => m.caminho === 'vidro')).toBe(false)
    })
})

export {}
