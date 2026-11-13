/**
 * PORTÃO — o custo do orçamento I.A. por item (o 1a, dono do produto, 09/11/2026): o rateio POR CÓDIGO no modo SEM, a cascata por material,
 * o crédito não apurado que não barateia, a fabricação pelo valor do minuto da tela, a falta de preço que fica fora e nomeada (12/11/2026), os três caminhos (perfil, insumo, vidro), e a
 * RECONCILIAÇÃO com a precificação final (decisão D2): soma(líquido do item + fabricação do item) == custo + mão de obra do motor.
 */
import {
    custoDoOrcamento, entradaDaPrecificacao, somaDosItens, valorDoMinuto, MODO_DO_FALLBACK, ORIGEM_DO_FALLBACK, PAR_DO_IPI_DESCONHECIDO,
    type EntradaDoCusto, type MaterialDaTabela, type Percentuais, type CustoDoItem,
} from '@/lib/atendimentos-ia/custo-do-orcamento'
import { calculatePricing } from '@/utils/pricing-engine'

// a configuração medida na De Paula (dono do produto, 09/11/2026): 40.813,03 ÷ 52.800 min
const CUSTO_MENSAL = 40813.03
const MINUTOS_DA_EMPRESA = 52800
const MINUTO = valorDoMinuto(CUSTO_MENSAL, MINUTOS_DA_EMPRESA) as number

const COMPLETO: Percentuais = { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: null, cred_ibs_pct: 0, cred_cbs_pct: 0 }
const material = (codigo: string, valor: number | null, bloco: Percentuais = COMPLETO, medida: number | null = 6): MaterialDaTabela =>
    ({ caminho: 'perfil', codigo, codigo_na_tabela: codigo, resolucao: 'exato', custo: null, descricao: `PERFIL ${codigo}`, unidade: 'BR', medida_barra_m: medida, valor_barra_interno: valor, bloco })

// dois itens: o A é usado pelos dois (3.000 mm no 1, 1.000 mm no 2); o B só pelo 2
const base = (): EntradaDoCusto => ({
    itens: [
        { referencia: 'item 1 (DP-02)', minutos: 120, pecas: [{ codigo: 'A', comprimento_mm: 1500, quantidade: 2 }] },
        { referencia: 'item 2 (JM-01)', minutos: 60, pecas: [{ codigo: 'A', comprimento_mm: 500, quantidade: 2 }, { codigo: 'B', comprimento_mm: 800, quantidade: 1 }] },
    ],
    barras_por_codigo: { A: 1, B: 1 },
    materiais: { 'perfil:A': material('A', 600), 'perfil:B': material('B', 100) },
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
        const semMedida = ok({ ...base(), materiais: { ...base().materiais, 'perfil:A': material('A', 600, COMPLETO, null) } }).itens[0]
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
        const a = linha(ok({ ...base(), materiais: { ...base().materiais, 'perfil:A': material('A', 600, comIpi) } }).itens[0], 'A')
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

describe('a decisão (b): IBS/CBS nulos não travam; ICMS e PIS/COFINS em cascata parcial; a falta nomeia QUAL crédito', () => {
    const comBlocoNoA = (bloco: Percentuais) => ({ ...base(), materiais: { ...base().materiais, 'perfil:A': material('A', 600, bloco) } })
    it('IBS e CBS nulos (como em 1.096 de 1.096 referências hoje): não há o que apurar — a cascata do ICMS e do PIS/COFINS vale inteira', () => {
        const r = ok(comBlocoNoA({ ...COMPLETO, cred_ibs_pct: null, cred_cbs_pct: null }))
        const a = linha(r.itens[0], 'A')
        expect(a.custo_liquido_unidade).toBeCloseTo(479.16, 10)
        expect(a.credito_nao_apurado).toBeNull()
        // no item, o que nenhum material informou é nulo, não 0; o ICMS, que todos têm, é o efetivo
        expect(r.itens[0].cred_ibs_pct).toBeNull()
        expect(r.itens[0].cred_cbs_pct).toBeNull()
        expect(r.itens[0].cred_icms_pct).toBeCloseTo(12, 10)
    })
    it('O PERFIL (460 de 460 sem ICMS, sem PIS/COFINS e sem o par do IPI hoje): o líquido é o bruto, e a falta nomeia os TRÊS', () => {
        const a = linha(ok(comBlocoNoA({ cred_icms_pct: null, cred_pis_cofins_pct: null, cred_ipi_pct: null, nc_ipi_pct: null, cred_ibs_pct: null, cred_cbs_pct: null })).itens[0], 'A')
        expect(a.custo_liquido_unidade).toBe(600)
        expect(a.custo_liquido_material).toBeCloseTo(a.custo_bruto_material, 12)
        expect(a.credito_nao_apurado).toBe('faltou no bloco tributario: cred_icms_pct, cred_pis_cofins_pct, o par do IPI (cred_ipi_pct ou nc_ipi_pct)')
        expect(PAR_DO_IPI_DESCONHECIDO).toBe('o par do IPI (cred_ipi_pct ou nc_ipi_pct)')
    })
    it('com ICMS e SEM PIS/COFINS: a cascata PARA depois do ICMS — o líquido fica entre o bruto e a cascata cheia, e a falta é o PIS/COFINS', () => {
        const r = ok(comBlocoNoA({ ...COMPLETO, cred_pis_cofins_pct: null }))
        const a = linha(r.itens[0], 'A')
        expect(a.custo_liquido_unidade).toBeCloseTo(528, 10)
        expect(a.custo_liquido_unidade).toBeLessThan(600)
        expect(a.custo_liquido_unidade).toBeGreaterThan(479.16)
        expect(a.credito_nao_apurado).toBe('faltou no bloco tributario: cred_pis_cofins_pct')
        // um material do item com a cascata parcial: os percentuais do item não se afirmam
        expect(r.itens[0].cred_icms_pct).toBeNull()
    })
    it('SEM ICMS e com PIS/COFINS: a cascata não começa — o líquido é o bruto, e a falta é o ICMS', () => {
        const a = linha(ok(comBlocoNoA({ ...COMPLETO, cred_icms_pct: null })).itens[0], 'A')
        expect(a.custo_liquido_unidade).toBe(600)
        expect(a.credito_nao_apurado).toBe('faltou no bloco tributario: cred_icms_pct')
    })
    it('IBS ou CBS ACIMA DE ZERO: o código não é recalculável, e o orçamento recusa nomeando-o', () => {
        const r = custoDoOrcamento(comBlocoNoA({ ...COMPLETO, cred_ibs_pct: 0.1, cred_cbs_pct: 0.9 }))
        expect('recusas' in r && r.recusas).toEqual(['o cred_ibs_pct e o cred_cbs_pct do código A: a regra ainda não diz onde o IBS e a CBS entram, e o código não é recalculável'])
        expect(r.ok).toBe(false)
    })
    it('IBS e CBS em ZERO, informados: a cascata vale, e o item afirma 0', () => {
        const r = ok(base())
        expect(r.itens[0].cred_ibs_pct).toBe(0)
    })
    it('o PAR DO IPI nulo é DESCONHECIDO: nem ignorado nem recusado — a conta segue sem IPI, e a falta o nomeia', () => {
        const r = ok(comBlocoNoA({ ...COMPLETO, cred_ipi_pct: null, nc_ipi_pct: null }))
        const a = linha(r.itens[0], 'A')
        expect(a.custo_liquido_unidade).toBeCloseTo(479.16, 10)
        expect(a.credito_nao_apurado).toBe('faltou no bloco tributario: o par do IPI (cred_ipi_pct ou nc_ipi_pct)')
        expect(r.itens[0].cred_icms_pct).toBeNull()
    })
    it('o par resolvido por um dos dois: crédito de IPI em 0, ou IPI sem crédito a 6,5% — sem falta', () => {
        expect(linha(ok(comBlocoNoA({ ...COMPLETO, cred_ipi_pct: 0, nc_ipi_pct: null })).itens[0], 'A').credito_nao_apurado).toBeNull()
        const nc = linha(ok(comBlocoNoA({ ...COMPLETO, cred_ipi_pct: null, nc_ipi_pct: 6.5 })).itens[0], 'A')
        expect(nc.credito_nao_apurado).toBeNull()
        expect(nc.custo_liquido_unidade).toBeCloseTo(479.16 + 39, 10)
    })
    it('a falta é nula EXATAMENTE quando o ICMS, o PIS/COFINS e o par do IPI estão resolvidos (o espelho da CHECK falta_nomeada)', () => {
        const blocos: Percentuais[] = [COMPLETO, { ...COMPLETO, cred_pis_cofins_pct: null }, { ...COMPLETO, cred_icms_pct: null },
            { ...COMPLETO, cred_icms_pct: null, cred_pis_cofins_pct: null }, { ...COMPLETO, cred_ibs_pct: null },
            { ...COMPLETO, cred_ipi_pct: null, nc_ipi_pct: null }, { ...COMPLETO, cred_ipi_pct: null, nc_ipi_pct: 6.5 }]
        for (const b of blocos) {
            const a = linha(ok(comBlocoNoA(b)).itens[0], 'A')
            expect(a.credito_nao_apurado === null).toBe(b.cred_icms_pct !== null && b.cred_pis_cofins_pct !== null && (b.cred_ipi_pct !== null || b.nc_ipi_pct !== null))
            // e o espelho da sem_credito_nao_barateia
            if (b.cred_icms_pct === null && b.cred_pis_cofins_pct === null) expect(a.custo_liquido_unidade).toBe(a.custo_bruto_unidade)
        }
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

describe('FALTA DE PREÇO NÃO IMPEDE A EVOLUÇÃO (12/11/2026): o código sem preço fica fora e é nomeado; o tempo e o minuto continuam recusa', () => {
    it.each([
        ['o código sem valor da barra', (e: EntradaDoCusto) => { e.materiais = { ...e.materiais, 'perfil:B': material('B', null) } }, 'SEM_VALOR'],
        ['o código fora da tabela', (e: EntradaDoCusto) => { e.materiais = { 'perfil:A': e.materiais['perfil:A'] } }, 'SEM_MATERIAL'],
    ])('%s: o item 2 sai sem o B, e a falta o nomeia', (_, estragar, motivo) => {
        const e = base()
        estragar(e)
        const r = ok(e)
        expect(r.faltas.map((f) => [f.item, f.caminho, f.codigo, f.motivo])).toEqual([[1, 'perfil', 'B', motivo]])
        expect(r.faltas[0].frase).toContain('fica fora do custo')
        expect(r.itens[1].materiais.map((m) => m.codigo)).toEqual(['A'])
        expect(r.itens[1].custo_bruto_materiais).toBeCloseTo(150, 10)
    })
    it.each([
        ['o código sem as barras', (e: EntradaDoCusto) => { e.barras_por_codigo = { A: 1 } }, 'as barras do código B no cálculo do levantamento'],
        ['a tipologia sem tempo', (e: EntradaDoCusto) => { e.itens = [e.itens[0], { ...e.itens[1], minutos: null }] }, 'o tempo de fabricação do item 2 (JM-01)'],
        ['sem o valor do minuto', (e: EntradaDoCusto) => { e.valor_minuto = null }, 'o valor do minuto da mão de obra: a configuração de mão de obra da empresa não fecha'],
    ])('%s: RECUSA nomeada', (_, estragar, frase) => {
        const e = base()
        estragar(e)
        const r = custoDoOrcamento(e)
        expect(r.ok).toBe(false)
        expect('recusas' in r && r.recusas).toEqual([frase])
    })
    it('sem preço nenhum o custo sai ZERO e todas as faltas nomeadas, uma por (item, código); a falta do minuto ainda recusa', () => {
        const e = base()
        e.materiais = { 'perfil:A': material('A', null), 'perfil:B': material('B', null) }
        const r = ok(e)
        expect(r.faltas.map((f) => [f.item, f.codigo])).toEqual([[0, 'A'], [1, 'A'], [1, 'B']])
        expect(r.itens.every((i) => i.custo_bruto_materiais === 0)).toBe(true)
        e.valor_minuto = null
        expect('recusas' in custoDoOrcamento(e)).toBe(true)
    })
})

describe('OS TRÊS CAMINHOS (12/11/2026): perfil pela barra rateada, insumo pela unidade, vidro pelo m²', () => {
    const insumo = (codigo: string, custo: number | null, bloco: Percentuais = COMPLETO): MaterialDaTabela =>
        ({ caminho: 'insumo', codigo, codigo_na_tabela: codigo, resolucao: 'exato', descricao: `INSUMO ${codigo}`, unidade: 'PC', medida_barra_m: null, valor_barra_interno: null, custo, bloco })
    const vidro = (codigo: string, custo: number | null): MaterialDaTabela =>
        ({ caminho: 'vidro', codigo, codigo_na_tabela: codigo, resolucao: 'vidro_traduzido', descricao: `VIDRO ${codigo}`, unidade: 'PC', medida_barra_m: null, valor_barra_interno: null, custo, bloco: COMPLETO })
    const tres = (): EntradaDoCusto => ({
        ...base(),
        itens: [{ ...base().itens[0], insumos: [{ codigo: '10457', quantidade: 4 }], vidros: [{ codigo: 'VIN04', m2: 1.5 }] }, base().itens[1]],
        materiais: { ...base().materiais, 'insumo:10457': insumo('10457', 2.5), 'vidro:VIN04': vidro('VIN04', 74.96) },
    })
    it('o INSUMO: quantidade × custo da unidade × a cascata; consumo em unidades, sem medida', () => {
        const l = ok(tres()).itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect(l).toMatchObject({ codigo: '10457', consumo_item: 4, custo_bruto_unidade: 2.5, medida_unidade: null, custo_liquido_fracao: null, unidade_compra: 'PC' })
        expect(l.custo_bruto_material).toBeCloseTo(10, 12)
        // a cascata: 2,5 − 12% − 9,25% do saldo
        expect(l.custo_liquido_material).toBeCloseTo(4 * (2.5 * 0.88 * (1 - 0.0925)), 12)
    })
    it('o VIDRO: m² × preço por m² × a cascata; a unidade da linha é M2', () => {
        const l = ok(tres()).itens[0].materiais.find((m) => m.caminho === 'vidro')!
        expect(l).toMatchObject({ codigo: 'VIN04', consumo_item: 1.5, unidade_compra: 'M2', resolucao: 'vidro_traduzido' })
        expect(l.custo_bruto_material).toBeCloseTo(1.5 * 74.96, 10)
        expect(l.custo_liquido_material).toBeCloseTo(1.5 * 74.96 * 0.88 * (1 - 0.0925), 10)
    })
    it('o PERFIL continua igual com os outros dois caminhos ao lado, e as linhas saem perfil, insumo, vidro', () => {
        const [i1] = ok(tres()).itens
        expect(i1.materiais.map((m) => [m.ordem, m.caminho, m.codigo])).toEqual([[1, 'perfil', 'A'], [2, 'insumo', '10457'], [3, 'vidro', 'VIN04']])
        expect(linha(i1, 'A').custo_bruto_material).toBeCloseTo(450, 10)
        expect(i1.custo_bruto_materiais).toBeCloseTo(450 + 10 + 1.5 * 74.96, 10)
    })
    it('o mesmo código por dois caminhos são dois materiais: a chave inclui o caminho', () => {
        const t = tres()
        const e: EntradaDoCusto = { ...t, itens: [{ ...t.itens[0], insumos: [{ codigo: 'A', quantidade: 1 }] }, t.itens[1]], materiais: { ...t.materiais, 'insumo:A': insumo('A', 3) } }
        const ls = ok(e).itens[0].materiais.filter((m) => m.codigo === 'A')
        expect(ls.map((m) => [m.caminho, m.custo_bruto_unidade])).toEqual([['perfil', 600], ['insumo', 3]])
    })
    it('o insumo e o vidro sem preço: fora do custo, nomeados pelo caminho', () => {
        const e = tres()
        e.materiais = { ...e.materiais, 'insumo:10457': insumo('10457', null) }
        delete (e.materiais as Record<string, MaterialDaTabela>)['vidro:VIN04']
        const r = ok(e)
        expect(r.faltas.map((f) => [f.caminho, f.codigo, f.motivo])).toEqual([['insumo', '10457', 'SEM_VALOR'], ['vidro', 'VIN04', 'SEM_MATERIAL']])
        expect(r.faltas[1].frase).toContain('vidro')
        expect(r.itens[0].materiais.map((m) => m.caminho)).toEqual(['perfil'])
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
        ['o perfil sem crédito num código', { ...base(), materiais: { ...base().materiais, 'perfil:A': material('A', 600, { ...COMPLETO, cred_icms_pct: null, cred_pis_cofins_pct: null }) } }],
        ['a cascata parcial num código', { ...base(), materiais: { ...base().materiais, 'perfil:A': material('A', 600, { ...COMPLETO, cred_pis_cofins_pct: null }) } }],
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
