/**
 * PORTÃO — o custo do orçamento I.A. por item (o 1a, dono do produto, 09/11/2026): o rateio POR CÓDIGO no modo SEM, a cascata por material,
 * o crédito não apurado que não barateia, a fabricação pelo valor do minuto da tela, a falta de preço que fica fora e nomeada (12/11/2026), os três caminhos (perfil, insumo, vidro), e a
 * RECONCILIAÇÃO com a precificação final (decisão D2): soma(líquido do item + fabricação do item) == custo + mão de obra do motor.
 */
import {
    custoDoOrcamento, entradaDaPrecificacao, somaDosItens, valorDoMinuto, MODO_DO_FALLBACK, ORIGEM_DO_FALLBACK, MODO_DO_PEDIDO_TOTAL, ORIGEM_DO_PEDIDO_TOTAL, PAR_DO_IPI_DESCONHECIDO,
    type EntradaDoCusto, type MaterialDaTabela, type Percentuais, type CustoDoItem,
} from '@/lib/atendimentos-ia/custo-do-orcamento'
import { calculatePricing } from '@/utils/pricing-engine'

// a configuração medida na De Paula (dono do produto, 09/11/2026): 40.813,03 ÷ 52.800 min
const CUSTO_MENSAL = 40813.03
const MINUTOS_DA_EMPRESA = 52800
const MINUTO = valorDoMinuto(CUSTO_MENSAL, MINUTOS_DA_EMPRESA) as number

const COMPLETO: Percentuais = { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: null, cred_ibs_pct: 0, cred_cbs_pct: 0 }
const material = (codigo: string, valor: number | null, bloco: Percentuais = COMPLETO, medida: number | null = 6): MaterialDaTabela =>
    ({ caminho: 'perfil', codigo, codigo_na_tabela: codigo, resolucao: 'exato', custo: null, descricao: `PERFIL ${codigo}`, unidade: 'BR', vendido_por: 'barra', medida_barra_m: medida, valor_barra_interno: valor, bloco })

// dois itens: o A é usado pelos dois (3.000 mm no 1, 1.000 mm no 2); o B só pelo 2
const base = (): EntradaDoCusto => ({
    itens: [
        { referencia: 'item 1 (DP-02)', minutos: 120, pecas: [{ codigo: 'A', comprimento_mm: 1500, quantidade: 2 }] },
        { referencia: 'item 2 (JM-01)', minutos: 60, pecas: [{ codigo: 'A', comprimento_mm: 500, quantidade: 2 }, { codigo: 'B', comprimento_mm: 800, quantidade: 1 }] },
    ],
    barras_por_codigo: { A: 1, B: 1 },
    materiais: { 'perfil:A': material('A', 600), 'perfil:B': material('B', 100) },
    valor_minuto: MINUTO,
    aproveitamento: 'consumo',
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

/**
 * O ORÇAMENTO COBRA O CONSUMO (dono do produto, 16/11/2026, registrado como foi dito): "quando a gente faz a criação, a concepção do
 * orçamento, ele deve considerar SOMENTE O CONSUMO, porque ele não sabe ainda se ocorrerá o aproveitamento. [...] Posteriormente a isso, a
 * gente faz o relatório de barras de cada pedido [...] a barra de 6 metros pode ser dividida em 2 ou 3 tipologias."
 *
 * REVOGA a barra inteira rateada de 09/11/2026. A `base()`: o A custa R$ 600 a barra de 6 m (R$ 100/m); o item 1 consome 3.000 mm dele e o
 * item 2, 1.000 mm. O B custa R$ 100 a barra de 6 m (R$ 16,67/m) e só o item 2 o usa, 800 mm.
 */
describe('o custo é o CONSUMO do item, não a barra inteira rateada', () => {
    it('cada item paga os METROS que consome × o preço do metro', () => {
        const [i1, i2] = ok(base()).itens
        expect(linha(i1, 'A').custo_bruto_material).toBeCloseTo(3 * (600 / 6), 10)
        expect(linha(i2, 'A').custo_bruto_material).toBeCloseTo(1 * (600 / 6), 10)
        expect(linha(i2, 'B').custo_bruto_material).toBeCloseTo(0.8 * (100 / 6), 10)
        expect(i1.materiais.map((m) => m.codigo)).toEqual(['A'])
    })
    it('O ITEM FECHA EM SI MESMO: o custo dele não muda com o que os OUTROS itens consomem', () => {
        const so1 = ok({ ...base(), itens: [base().itens[0]] }).itens[0]
        const comOOutro = ok(base()).itens[0]
        expect(so1.custo_bruto_materiais).toBeCloseTo(comOOutro.custo_bruto_materiais, 12)
        // e nem com o número de barras que o levantamento comprou: a barra inteira não entra mais no preço
        const comMaisBarras = ok({ ...base(), barras_por_codigo: { A: 9, B: 7 } }).itens[0]
        expect(comMaisBarras.custo_bruto_materiais).toBeCloseTo(comOOutro.custo_bruto_materiais, 12)
    })
    it('CONTRASTE com a regra revogada: a barra inteira rateada daria R$ 450 no item 1, e o consumo dá R$ 300', () => {
        const i1 = ok(base()).itens[0]
        // 3 barras × R$ 600 × 75% (a parte do item no consumo do código) = R$ 1.350 × ... = R$ 450 — o que se cobrava até 15/11/2026
        expect(linha(i1, 'A').custo_bruto_material).not.toBeCloseTo(450, 2)
        expect(linha(i1, 'A').custo_bruto_material).toBeCloseTo(300, 10)
    })
    it('o consumo do item vai em metros, e a fração é o líquido ÷ a medida', () => {
        const [i1] = ok(base()).itens
        const a = linha(i1, 'A')
        expect(a.consumo_item).toBe(3)
        expect(a.custo_liquido_fracao).toBeCloseTo(a.custo_liquido_unidade / 6, 12)
        expect(a.custo_liquido_material).toBeCloseTo(3 * (a.custo_liquido_unidade / 6), 12)
    })
    it('o perfil SEM a medida da barra não vira chute: fica pela unidade de compra, e a fração é nula', () => {
        const semMedida = ok({ ...base(), materiais: { ...base().materiais, 'perfil:A': material('A', 600, COMPLETO, null) } }).itens[0]
        const a = linha(semMedida, 'A')
        expect([a.custo_liquido_fracao, a.medida_unidade]).toEqual([null, null])
        expect(a.custo_bruto_material).toBeCloseTo(3 * 600, 10)
    })
    it('o modo é SEM aproveitamento, a origem é consumo_do_item, com motivo', () => {
        const r = ok(base())
        expect(r.modo).toBe(MODO_DO_FALLBACK)
        expect(MODO_DO_FALLBACK).toBe('SEM')
        expect(r.origem).toBe(ORIGEM_DO_FALLBACK)
        expect(ORIGEM_DO_FALLBACK).toBe('consumo_do_item')
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
        expect(a.custo_liquido_material).toBeCloseTo(3 * (479.16 / 6), 10)
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
        expect(r.itens[1].custo_bruto_materiais).toBeCloseTo(1 * (600 / 6), 10)
    })
    it.each([
        ['o código sem as barras', (e: EntradaDoCusto) => { e.barras_por_codigo = { A: 1 } }, 'as barras do código B no cálculo do levantamento'],
        ['a tipologia sem tempo', (e: EntradaDoCusto) => { e.itens = [e.itens[0], { ...e.itens[1], minutos: null }] }, 'o tempo de fabricação do item 2 (JM-01)'],
        ['sem o valor do minuto', (e: EntradaDoCusto) => { e.valor_minuto = null }, '[COMERCIAL] o valor do minuto da mão de obra: a configuração de mão de obra da empresa não fecha'],
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

describe('OS TRÊS CAMINHOS: perfil pelo consumo (16/11/2026), insumo pela unidade ou pelo rolo, vidro pelo m²', () => {
    const insumo = (codigo: string, custo: number | null, bloco: Percentuais = COMPLETO): MaterialDaTabela =>
        ({ caminho: 'insumo', codigo, codigo_na_tabela: codigo, resolucao: 'exato', descricao: `INSUMO ${codigo}`, unidade: 'PC', vendido_por: 'unidade', medida_barra_m: null, valor_barra_interno: null, custo, bloco })
    /** O insumo comprado em ROLO: o `custo` é o do rolo inteiro de `medida` metros, e o motor o pede em milímetros. */
    const insumoEmRolo = (codigo: string, custoDoRolo: number, medida: number, bloco: Percentuais = COMPLETO): MaterialDaTabela =>
        ({ caminho: 'insumo', codigo, codigo_na_tabela: codigo, resolucao: 'exato', descricao: `ROLO ${codigo}`, unidade: 'MT', vendido_por: 'barra', medida_barra_m: medida, valor_barra_interno: null, custo: custoDoRolo, bloco })
    const vidro = (codigo: string, custo: number | null): MaterialDaTabela =>
        ({ caminho: 'vidro', codigo, codigo_na_tabela: codigo, resolucao: 'vidro_traduzido', descricao: `VIDRO ${codigo}`, unidade: 'PC', vendido_por: 'unidade', medida_barra_m: null, valor_barra_interno: null, custo, bloco: COMPLETO })
    const tres = (): EntradaDoCusto => ({
        ...base(),
        itens: [{ ...base().itens[0], insumos: [{ codigo: '10457', quantidade: 4 }], vidros: [{ codigo: 'VIN04', m2: 1.5 }] }, base().itens[1]],
        materiais: { ...base().materiais, 'insumo:10457': insumo('10457', 2.5), 'vidro:VIN04': vidro('VIN04', 74.96) },
    })
    it('o VIDRO SEM PREÇO (o LJ-VLSIL5+5 da Lajeadense, 23/11/2026): achado, mas o custo vazio vira falta NOMEADA — nunca zero nem estimado', () => {
        const t = tres()
        const r = custoDoOrcamento({ ...t, itens: [{ ...t.itens[0], vidros: [{ codigo: 'LJ-VLSIL5+5', m2: 1.2 }] }, t.itens[1]],
            materiais: { ...t.materiais, 'vidro:LJ-VLSIL5+5': vidro('LJ-VLSIL5+5', null) } })
        const textos = JSON.stringify(r)
        expect(textos).toContain('o preço por m² do vidro LJ-VLSIL5+5, na tabela de vidro: fica fora do custo')
    })
    it('o INSUMO: quantidade × custo da unidade × a cascata; consumo em unidades, sem medida', () => {
        const l = ok(tres()).itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect(l).toMatchObject({ codigo: '10457', consumo_item: 4, custo_bruto_unidade: 2.5, medida_unidade: null, custo_liquido_fracao: null, unidade_compra: 'PC' })
        expect(l.custo_bruto_material).toBeCloseTo(10, 12)
        // a cascata: 2,5 − 12% − 9,25% do saldo
        expect(l.custo_liquido_material).toBeCloseTo(4 * (2.5 * 0.88 * (1 - 0.0925)), 12)
    })
    /**
     * O INSUMO COMPRADO EM ROLO (dono do produto, 16/11/2026) — o caso REAL do ORC-6, medido em produção: a escova `946/WOLFF` é um rolo de
     * 300 m a R$ 613,872, e o motor a pede por fórmula de perímetro, em MILÍMETROS. Antes, `milímetros × preço do rolo` dava R$ 15,9 milhões
     * numa linha; o certo é (mm ÷ 1000) × (preço do rolo ÷ 300).
     */
    const comRolo = (mm: number) => {
        const t = tres()
        return { ...t, itens: [{ ...t.itens[0], insumos: [{ codigo: '946/WOLFF', quantidade: mm }] }, t.itens[1]],
            materiais: { ...t.materiais, 'insumo:946/WOLFF': insumoEmRolo('946/WOLFF', 613.872, 300) } }
    }
    it('o INSUMO EM ROLO: os milímetros viram metros e o preço do rolo vira preço do metro', () => {
        const l = ok(comRolo(25976)).itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect(l).toMatchObject({ codigo: '946/WOLFF', consumo_item: 25.976, medida_unidade: 300, unidade_compra: 'MT' })
        // o metro: R$ 613,872 ÷ 300 = R$ 2,04624; 25,976 m dão R$ 53,15 — não os R$ 15.945.939 de antes
        expect(l.custo_bruto_material).toBeCloseTo(25.976 * (613.872 / 300), 10)
        expect(l.custo_bruto_material).toBeLessThan(60)
        expect(l.custo_liquido_fracao).toBeCloseTo((613.872 * 0.88 * (1 - 0.0925)) / 300, 12)
        expect(l.custo_liquido_material).toBeCloseTo(25.976 * ((613.872 * 0.88 * (1 - 0.0925)) / 300), 10)
    })
    it('o rolo entra com o custo da UNIDADE DE COMPRA na linha: a cascata roda no rolo, a divisão vem depois', () => {
        const l = ok(comRolo(25976)).itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect(l.custo_bruto_unidade).toBe(613.872)
        expect(l.custo_liquido_unidade).toBeCloseTo(613.872 * 0.88 * (1 - 0.0925), 10)
    })
    it('o insumo por PEÇA não é tocado pela regra do rolo, mesmo com medida_barra_m preenchida', () => {
        const t = tres()
        const porPeca: MaterialDaTabela = { ...insumo('3571/WOLFF', 0.4872), medida_barra_m: 1 }
        const e: EntradaDoCusto = { ...t, itens: [{ ...t.itens[0], insumos: [{ codigo: '3571/WOLFF', quantidade: 115 }] }, t.itens[1]],
            materiais: { ...t.materiais, 'insumo:3571/WOLFF': porPeca } }
        const l = ok(e).itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect(l).toMatchObject({ consumo_item: 115, medida_unidade: null, custo_liquido_fracao: null })
        expect(l.custo_bruto_material).toBeCloseTo(115 * 0.4872, 10)
    })
    it('o rolo sem medida gravada não divide por nada: fica pela unidade, e a falta aparece no número, nunca num chute', () => {
        const t = tres()
        const semMedida: MaterialDaTabela = { ...insumoEmRolo('946/WOLFF', 613.872, 300), medida_barra_m: null }
        const e: EntradaDoCusto = { ...t, itens: [{ ...t.itens[0], insumos: [{ codigo: '946/WOLFF', quantidade: 3 }] }, t.itens[1]],
            materiais: { ...t.materiais, 'insumo:946/WOLFF': semMedida } }
        const l = ok(e).itens[0].materiais.find((m) => m.caminho === 'insumo')!
        expect(l).toMatchObject({ consumo_item: 3, medida_unidade: null, custo_liquido_fracao: null })
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
        expect(linha(i1, 'A').custo_bruto_material).toBeCloseTo(300, 10)
        expect(i1.custo_bruto_materiais).toBeCloseTo(300 + 10 + 1.5 * 74.96, 10)
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

describe('pedido 0034-B: o modo PEDIDO TOTAL — as barras inteiras do pedido, rateadas na proporção do consumo', () => {
    const linha = (c: CustoDoItem, codigo: string) => c.materiais.find((m) => m.codigo === codigo)
    it('(a) CONSUMO, o padrão: cada item paga os metros dele; a soma do A NÃO é a barra inteira (3 m + 1 m de uma barra de 6 m)', () => {
        const r = ok(base())
        const a1 = linha(r.itens[0], 'A')!, a2 = linha(r.itens[1], 'A')!
        expect([r.modo, r.origem]).toEqual([MODO_DO_FALLBACK, ORIGEM_DO_FALLBACK])
        expect(a1.custo_liquido_material).toBeCloseTo(3 * (a1.custo_liquido_fracao as number), 10)
        expect(a2.custo_liquido_material).toBeCloseTo(1 * (a2.custo_liquido_fracao as number), 10)
        expect(a1.custo_liquido_material + a2.custo_liquido_material).toBeCloseTo(4 * (a1.custo_liquido_fracao as number), 10)
    })
    it('(b) PEDIDO TOTAL: a soma dos itens é a barra inteira × o preço dela, dividida 3/4 e 1/4; cada parte ao centavo, o resíduo no que mais consome', () => {
        const consumo = ok(base())
        const metro = linha(consumo.itens[0], 'A')!.custo_liquido_fracao as number
        const barraA = 6 * metro // 1 barra de 6 m: o líquido da barra inteira
        const r = ok({ ...base(), aproveitamento: 'pedido_total' })
        expect([r.modo, r.origem]).toEqual([MODO_DO_PEDIDO_TOTAL, ORIGEM_DO_PEDIDO_TOTAL])
        const a1 = linha(r.itens[0], 'A')!, a2 = linha(r.itens[1], 'A')!
        expect(a2.custo_liquido_material).toBe(Math.round((barraA / 4) * 100) / 100)
        expect(a1.custo_liquido_material + a2.custo_liquido_material).toBeCloseTo(barraA, 10)
        expect(a1.custo_liquido_material).toBeCloseTo(barraA - a2.custo_liquido_material, 10)
        // o bruto também: 1 barra × R$ 600, rateada
        expect(linha(r.itens[1], 'A')!.custo_bruto_material).toBe(150)
        expect(a1.custo_bruto_material + linha(r.itens[1], 'A')!.custo_bruto_material).toBeCloseTo(600, 10)
        // o consumo do item continua dito em metros (3 e 1): o que muda é o custo
        expect([a1.consumo_item, a2.consumo_item]).toEqual([3, 1])
        // o B, só no item 2: ele paga a barra inteira do B
        expect(linha(r.itens[1], 'B')!.custo_bruto_material).toBe(100)
    })
    it('(b) com DUAS barras do A no pedido, o total dobra: é a contagem de barras do pedido que manda', () => {
        const r = ok({ ...base(), barras_por_codigo: { A: 2, B: 1 }, aproveitamento: 'pedido_total' })
        expect(linha(r.itens[0], 'A')!.custo_bruto_material + linha(r.itens[1], 'A')!.custo_bruto_material).toBeCloseTo(1200, 10)
        expect(linha(r.itens[1], 'A')!.custo_bruto_material).toBe(300)
    })
    it('o resíduo do arredondamento vai ao item que MAIS consome, e a soma fecha ao centavo (três itens de 1 m, barra de R$ 100)', () => {
        const e: EntradaDoCusto = {
            itens: [1, 2, 3].map((n) => ({ referencia: `item ${n}`, minutos: 10, pecas: [{ codigo: 'A', comprimento_mm: n === 2 ? 1001 : 1000, quantidade: 1 }] })),
            barras_por_codigo: { A: 1 }, materiais: { 'perfil:A': material('A', 100) }, valor_minuto: MINUTO, aproveitamento: 'pedido_total',
        }
        const r = ok(e)
        const brutos = r.itens.map((c) => linha(c, 'A')!.custo_bruto_material)
        // 1000/3001 de R$ 100 = 33,32 (ao centavo) nos itens 1 e 3; o item 2 (1001 mm, o maior) fica com o resto
        expect([brutos[0], brutos[2]]).toEqual([33.32, 33.32])
        expect(brutos[1]).toBeCloseTo(100 - 2 * 33.32, 10)
        expect(brutos.reduce((t, b) => t + b, 0)).toBeCloseTo(100, 10)
    })
    it('o INSUMO e o VIDRO não mudam com o modo: seguem pela unidade e pelo m²', () => {
        const insumo: MaterialDaTabela = { ...material('Q', null), caminho: 'insumo', custo: 2, valor_barra_interno: null, vendido_por: 'unidade', medida_barra_m: null }
        const e: EntradaDoCusto = { ...base(), itens: base().itens.map((it) => ({ ...it, insumos: [{ codigo: 'Q', quantidade: 3 }] })), materiais: { ...base().materiais, 'insumo:Q': insumo } }
        const c = ok({ ...e, aproveitamento: 'consumo' }), t = ok({ ...e, aproveitamento: 'pedido_total' })
        expect(t.itens.map((x) => linha(x, 'Q')!.custo_bruto_material)).toEqual(c.itens.map((x) => linha(x, 'Q')!.custo_bruto_material))
    })
})
