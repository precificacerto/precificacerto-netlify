/**
 * PORTÃO — o custo do orçamento I.A. por item (o 1a, dono do produto, 09/11/2026): o rateio POR CÓDIGO no modo SEM, a cascata por material,
 * o crédito não apurado que não barateia, a fabricação pelo valor do minuto da tela, as recusas que não deixam nada evoluir, e a
 * RECONCILIAÇÃO com a precificação final (decisão D2): soma(líquido do item + fabricação do item) == custo + mão de obra do motor.
 */
import {
    custoDoOrcamento, entradaDaPrecificacao, somaDosItens, valorDoMinuto, MODO_DO_FALLBACK, ORIGEM_DO_FALLBACK,
    type EntradaDoCusto, type MaterialDaTabela, type Percentuais, type CustoDoItem,
} from '@/lib/atendimentos-ia/custo-do-orcamento'
import { calculatePricing } from '@/utils/pricing-engine'

// a configuração medida na De Paula (dono do produto, 09/11/2026): 40.813,03 ÷ 52.800 min
const CUSTO_MENSAL = 40813.03
const MINUTOS_DA_EMPRESA = 52800
const MINUTO = valorDoMinuto(CUSTO_MENSAL, MINUTOS_DA_EMPRESA) as number

const COMPLETO: Percentuais = { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: null, cred_ibs_pct: 0, cred_cbs_pct: 0 }
const material = (codigo: string, valor: number | null, bloco: Percentuais = COMPLETO, medida: number | null = 6): MaterialDaTabela =>
    ({ codigo, descricao: `PERFIL ${codigo}`, unidade: 'BR', medida_barra_m: medida, valor_barra_interno: valor, bloco })

// dois itens: o A é usado pelos dois (3.000 mm no 1, 1.000 mm no 2); o B só pelo 2
const base = (): EntradaDoCusto => ({
    itens: [
        { referencia: 'a esquadria 1 (DP-02)', minutos: 120, pecas: [{ codigo: 'A', comprimento_mm: 1500, quantidade: 2 }] },
        { referencia: 'a esquadria 2 (JM-01)', minutos: 60, pecas: [{ codigo: 'A', comprimento_mm: 500, quantidade: 2 }, { codigo: 'B', comprimento_mm: 800, quantidade: 1 }] },
    ],
    barras_por_codigo: { A: 1, B: 1 },
    materiais: { A: material('A', 600), B: material('B', 100) },
    valor_minuto: MINUTO,
})
const ok = (e: EntradaDoCusto) => {
    const r = custoDoOrcamento(e)
    if ('recusas' in r) throw new Error(`recusou: ${r.recusas.join(' | ')}`)
    return r
}
const linha = (i: CustoDoItem, codigo: string) => i.materiais.find((m) => m.codigo === codigo)!

describe('o valor do minuto é o da tela', () => {
    it('custo mensal ÷ minutos produtivos: 40.813,03 ÷ 52.800 = 0,772974', () => {
        expect(MINUTO).toBeCloseTo(0.772974, 6)
    })
    it.each([[0, 52800], [40813.03, 0], [NaN, 52800], [-1, 52800]])('sem custo ou sem minutos (%s, %s), não há valor', (c, m) => {
        expect(valorDoMinuto(c, m)).toBeNull()
    })
})

describe('o rateio é POR CÓDIGO, na proporção do consumo daquele código', () => {
    it('o A divide 75/25 entre os itens, e o B é inteiro do item 2', () => {
        const [i1, i2] = ok(base()).itens
        expect(linha(i1, 'A').custo_bruto_material).toBeCloseTo(450, 10)
        expect(linha(i2, 'A').custo_bruto_material).toBeCloseTo(150, 10)
        expect(linha(i2, 'B').custo_bruto_material).toBeCloseTo(100, 10)
        expect(i1.materiais.map((m) => m.codigo)).toEqual(['A'])
    })
    it('o rateio fecha: a soma dos itens é barras × valor, por código', () => {
        const e = { ...base(), barras_por_codigo: { A: 3, B: 2 } }
        const its = ok(e).itens
        const doCodigo = (c: string) => its.reduce((t, i) => t + (i.materiais.find((m) => m.codigo === c)?.custo_bruto_material ?? 0), 0)
        expect(doCodigo('A')).toBeCloseTo(3 * 600, 9)
        expect(doCodigo('B')).toBeCloseTo(2 * 100, 9)
    })
    it('não é por metro global: o item 2 não paga a média do A com o B', () => {
        // por metro global (4.800 mm no total), o item 2 (1.800 mm) pagaria 37,5% dos R$ 700 = R$ 262,50; por código, paga R$ 250
        const [, i2] = ok(base()).itens
        expect(i2.custo_bruto_materiais).toBeCloseTo(250, 10)
    })
    it('o consumo do item vai em metros, e a fração é o líquido ÷ a medida', () => {
        const [i1] = ok(base()).itens
        const a = linha(i1, 'A')
        expect(a.consumo_item).toBe(3)
        expect(a.custo_liquido_fracao).toBeCloseTo(a.custo_liquido_unidade / 6, 12)
        const semMedida = ok({ ...base(), materiais: { ...base().materiais, A: material('A', 600, COMPLETO, null) } }).itens[0]
        expect(linha(semMedida, 'A').custo_liquido_fracao).toBeNull()
    })
    it('o modo é o fallback: SEM aproveitamento, origem fallback_barra_inteira, com motivo', () => {
        const r = ok(base())
        expect(r.modo).toBe(MODO_DO_FALLBACK)
        expect(MODO_DO_FALLBACK).toBe('SEM')
        expect(r.origem).toBe(ORIGEM_DO_FALLBACK)
        expect(ORIGEM_DO_FALLBACK).toBe('fallback_barra_inteira')
        expect(r.motivo).toMatch(/^\S(.*\S)?$/)
    })
})

describe('a cascata por material, na unidade de compra', () => {
    it('ICMS 12 sobre o bruto, PIS/COFINS 9,25 sobre o saldo: o efetivo é 20,14%, não 21,25%', () => {
        const a = linha(ok(base()).itens[0], 'A')
        // 600 − 72 − (528 × 9,25%) = 600 − 72 − 48,84 = 479,16
        expect(a.custo_liquido_unidade).toBeCloseTo(479.16, 10)
        expect(1 - a.custo_liquido_unidade / a.custo_bruto_unidade).toBeCloseTo(0.2014, 10)
        expect(a.credito_nao_apurado).toBeNull()
        expect(a.custo_liquido_material).toBeCloseTo(479.16 * 0.75, 10)
    })
    it('o IPI sem crédito compõe o custo: o líquido passa do bruto', () => {
        const comIpi: Percentuais = { ...COMPLETO, cred_ipi_pct: null, nc_ipi_pct: 5 }
        const a = linha(ok({ ...base(), materiais: { ...base().materiais, A: material('A', 600, comIpi) } }).itens[0], 'A')
        expect(a.custo_liquido_unidade).toBeCloseTo(479.16 + 30, 10)
    })
    it('os percentuais do item são os efetivos, e reconstroem o líquido', () => {
        const [i1, i2] = ok(base()).itens
        expect(i1.cred_icms_pct).toBeCloseTo(12, 10)
        expect(i1.cred_pis_cofins_pct).toBeCloseTo(9.25 * 0.88, 10)
        for (const i of [i1, i2]) {
            const credito = (i.cred_icms_pct! + i.cred_pis_cofins_pct! + i.cred_ipi_pct!) / 100
            expect(i.custo_bruto_materiais * (1 - credito + i.nc_ipi_pct! / 100)).toBeCloseTo(i.custo_liquido_materiais, 9)
        }
    })
})

describe('o crédito NÃO APURADO não barateia', () => {
    it('o IBS nulo (como em 1.096 de 1.096 referências hoje): nenhum crédito, o líquido é o bruto, e a falta é dita', () => {
        const semIbs: Percentuais = { ...COMPLETO, cred_ibs_pct: null }
        const r = ok({ ...base(), materiais: { ...base().materiais, A: material('A', 600, semIbs) } })
        const a = linha(r.itens[0], 'A')
        expect(a.custo_liquido_unidade).toBe(600)
        expect(a.custo_liquido_material).toBeCloseTo(a.custo_bruto_material, 12)
        expect(a.credito_nao_apurado).toContain('cred_ibs_pct')
        // o percentual que veio da tabela fica gravado como veio; o do item é nulo, porque um material do item não teve crédito
        expect(a.cred_icms_pct).toBe(12)
        expect(r.itens[0].cred_icms_pct).toBeNull()
        // o B, com o bloco completo, tem o crédito dele; o item 2 tem os dois, então também é nulo
        expect(linha(r.itens[1], 'B').credito_nao_apurado).toBeNull()
        expect(r.itens[1].cred_icms_pct).toBeNull()
    })
    it('o Perfil sem ICMS (460 de 460 hoje): o mesmo — sem crédito, nunca o PIS sozinho', () => {
        const semIcms: Percentuais = { ...COMPLETO, cred_icms_pct: null }
        const a = linha(ok({ ...base(), materiais: { ...base().materiais, A: material('A', 600, semIcms) } }).itens[0], 'A')
        expect(a.custo_liquido_unidade).toBe(600)
        expect(a.credito_nao_apurado).toContain('cred_icms_pct')
    })
})

describe('a fabricação e o total do item', () => {
    it('fabricação = minutos × valor do minuto; total = líquido + fabricação', () => {
        const [i1, i2] = ok(base()).itens
        expect(i1.tempo_fabricacao_min).toBe(120)
        expect(i1.valor_minuto).toBe(MINUTO)
        expect(i1.custo_fabricacao).toBeCloseTo(120 * 0.7729740530303, 8)
        expect(i1.custo_liquido_total).toBeCloseTo(i1.custo_liquido_materiais + i1.custo_fabricacao, 12)
        expect(i2.custo_fabricacao).toBeCloseTo(60 * MINUTO, 12)
    })
})

describe('falta de preço ou de tempo: NADA EVOLUI, e a recusa nomeia a referência e a falta', () => {
    it.each([
        ['o código sem valor da barra', (e: EntradaDoCusto) => { e.materiais = { ...e.materiais, B: material('B', null) } }, 'o valor da barra do código B, na tabela de preço'],
        ['o código fora da tabela', (e: EntradaDoCusto) => { e.materiais = { A: e.materiais.A } }, 'o valor da barra do código B, na tabela de preço'],
        ['o código sem as barras', (e: EntradaDoCusto) => { e.barras_por_codigo = { A: 1 } }, 'as barras do código B no cálculo do levantamento'],
        ['a tipologia sem tempo', (e: EntradaDoCusto) => { e.itens = [e.itens[0], { ...e.itens[1], minutos: null }] }, 'o tempo de fabricação de a esquadria 2 (JM-01)'],
        ['sem o valor do minuto', (e: EntradaDoCusto) => { e.valor_minuto = null }, 'o valor do minuto da mão de obra: a configuração de mão de obra da empresa não fecha'],
    ])('%s', (_, estragar, frase) => {
        const e = base()
        estragar(e)
        const r = custoDoOrcamento(e)
        expect(r.ok).toBe(false)
        expect('recusas' in r && r.recusas).toEqual([frase])
    })
    it('as faltas saem todas de uma vez', () => {
        const e = base()
        e.materiais = { A: material('A', null), B: material('B', null) }
        e.valor_minuto = null
        const r = custoDoOrcamento(e)
        expect('recusas' in r && r.recusas).toHaveLength(3)
    })
})

describe('RECONCILIAÇÃO com a precificação final (decisão D2): soma(líquido + fabricação) == custo + mão de obra', () => {
    const doMotor = (totalItemsCost: number, productWorkloadMinutes: number) => calculatePricing({
        calcType: 'INDUSTRIALIZACAO', totalItemsCost, yieldQuantity: 1,
        laborCostMonthly: CUSTO_MENSAL, numProductiveEmployees: 1, monthlyWorkloadMinutes: MINUTOS_DA_EMPRESA, productWorkloadMinutes,
        structurePct: 0.2, taxPct: 0.1, commissionPct: 0.05, profitPct: 0.1,
    })
    const casos: Array<[string, EntradaDoCusto]> = [
        ['os dois itens', base()],
        ['barras a mais e tempos quebrados', { ...base(), barras_por_codigo: { A: 4, B: 3 }, itens: base().itens.map((i, k) => ({ ...i, minutos: [137.5, 61.25][k] })) }],
        ['o crédito não apurado num código', { ...base(), materiais: { ...base().materiais, A: material('A', 600, { ...COMPLETO, cred_ibs_pct: null }) } }],
    ]
    it.each(casos)('%s: o custo + a mão de obra do motor é a soma das linhas, ao centavo', (_, e) => {
        const its = ok(e).itens
        const entrada = entradaDaPrecificacao(its)
        const motor = doMotor(entrada.totalItemsCost, entrada.productWorkloadMinutes)
        expect(motor.isValid).toBe(true)
        // o motor arredonda o custo e a mão de obra ao centavo (pricing-engine.ts:547-556); as linhas, não: a diferença cabe num centavo
        expect(Math.abs(motor.cmvUnit - somaDosItens(its))).toBeLessThanOrEqual(0.01)
        expect(Math.abs(motor.productiveLaborCost - its.reduce((t, i) => t + i.custo_fabricacao, 0))).toBeLessThanOrEqual(0.005)
    })
    it('a entrada leva o LÍQUIDO DOS MATERIAIS e os MINUTOS — nunca a fabricação no custo', () => {
        const its = ok(base()).itens
        const entrada = entradaDaPrecificacao(its)
        expect(entrada.totalItemsCost).toBeCloseTo(its.reduce((t, i) => t + i.custo_liquido_materiais, 0), 12)
        expect(entrada.productWorkloadMinutes).toBe(180)
    })
    it('CONTRASTE: com a fabricação somada no custo, a igualdade quebra pela fabricação inteira', () => {
        const its = ok(base()).itens
        const contadaDuasVezes = doMotor(its.reduce((t, i) => t + i.custo_liquido_total, 0), 180)
        const fabricacao = its.reduce((t, i) => t + i.custo_fabricacao, 0)
        expect(contadaDuasVezes.cmvUnit - somaDosItens(its)).toBeCloseTo(fabricacao, 1)
        expect(fabricacao).toBeGreaterThan(100)
    })
})
