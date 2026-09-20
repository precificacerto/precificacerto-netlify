/**
 * SIMPLES NACIONAL HÍBRIDO — IBS, CBS e IS POR FORA, DAS reduzido POR DENTRO.
 *
 * GABARITO: o comando do PO de 19/09/2026, casos A a D, nos três segmentos. Tolerância de
 * duas casas em R$, que é a régua que o PO fixou.
 *
 * A REGRA, e de onde ela vem (não interpretar diferente):
 *
 *   LC 214/2025 art. 41 §3º + LC 123 art. 13 §10 — o optante do Simples pode apurar SÓ IBS e
 *   CBS pelo regime regular; o resto segue no DAS. Daí o formato: DAS REDUZIDO por dentro,
 *   IBS/CBS por fora.
 *   LC 123 art. 13 §1º XIV-A — o IS fica FORA do DAS para qualquer optante.
 *   LC 214 art. 12 §2º V — não integra a base de IBS/CBS o montante de ICMS/ISS (e IPI no
 *   Anexo II) contido no DAS. É a `dedução da base` abaixo. IRPJ, CSLL e CPP do DAS FICAM.
 *   RCBS art. 348 §4º — o IS integra a base de IBS/CBS; o inverso não.
 *
 * O QUE ESTE ARQUIVO EXERCITA, e por que cada caso DISCRIMINA:
 *
 *   - o DAS híbrido NÃO é a alíquota efetiva do anexo: é ela menos as parcelas substituídas
 *     no ano. Anexo II faixa 1 em 2027 dá 3,87%, não 4,50%. Um caso montado com a efetiva
 *     passaria em silêncio se o motor esquecesse a substituição — por isso os dois números
 *     são afirmados lado a lado;
 *   - a base de IBS/CBS NÃO é o preço por dentro: é `P × (1 − dedução)`. Com dedução zero a
 *     diferença sumiria, então todo caso usa anexo com ICMS/ISS/IPI > 0;
 *   - o IS entra na base de IBS/CBS e não o contrário. O caso A tem IS de 10%, os outros
 *     têm zero POR SEGMENTO — e o contraste entre eles é o que prova a regra 5 do comando;
 *   - o desconto recalcula DAS, RT, IBS, CBS e IS, e NÃO recalcula custo e despesa. Um caso
 *     só com desconto zero não distinguiria congelado de recalculado.
 *
 * `teste-que-nao-exercita.md`: cada asserção aqui precisa FALHAR sem a sua correção. As que
 * afirmam PASSAGEM (a linha existe, a prop chega) estão marcadas como tais e vêm sempre
 * acompanhadas da asserção de EFEITO correspondente.
 */
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { applyDecompositionToResidual } from '@/utils/residual-from-decomposition'
import {
  dasHibridoPct, deducaoBaseIbsCbsPct, aliquotaEfetivaSimples, faixaDoRbt12, SIMPLES_ANEXOS,
} from '@/utils/simples-anexos'
import { construirPrecoHibrido, isPctDoSegmento } from '@/utils/simples-hibrido'
import type { BaldesDeDespesa } from '@/utils/despesas-do-segmento'
import { mapToMotorRegime } from '@/hooks/use-tenant-tax-context'
import { buildProductConstruction } from '@/utils/product-price-construction'

/** As alíquotas de referência que o comando fixa PARA OS TESTES. Produção lê `tax_rates_periods`. */
const CBS = 0.088
const IBS = 0.001
/** Faixa 1 em todos os anexos: RBT12 dentro do primeiro teto, dedução zero → efetiva = nominal. */
const RBT12 = 100_000
/** 2027 — primeiro ano do híbrido: saem PIS e COFINS, ICMS/ISS/IPI seguem no DAS. */
const ANO = 2027

const baldes = (over: Partial<BaldesDeDespesa>): BaldesDeDespesa =>
  ({ fixa: 0, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0, ...over })

const item = (
  key: string, c: ReturnType<typeof construirPrecoHibrido>,
  custoUnit: number, moUnit: number,
  f: { com: number; luc: number; rt: number; is: number },
  productType: string, isService = false,
): BudgetDecompositionItem => ({
  key, label: key, quantity: 1, unitPrice: c.totalACobrar,
  costUnit: custoUnit, productiveLaborUnit: moUnit,
  commissionPct: f.com * 100, profitPct: f.luc * 100, rtPct: f.rt * 100,
  productType, isService,
  rates: {
    icms_pct: 0, iss_pct: 0, pis_pct: 0, cofins_pct: 0, ipi_pct: 0,
    is_pct: f.is * 100, ibs_pct: IBS * 100, cbs_pct: CBS * 100,
    das_pct: c.dasHibridoPct * 100,
    deducao_base_pct: c.deducaoBasePct * 100,
  },
  acrescimos: 0,
} as BudgetDecompositionItem)

const decompor = (
  items: BudgetDecompositionItem[], tenant: string, despesas: BaldesDeDespesa,
  deducao: number, d = 0,
) => buildDecomposition(buildBudgetDecompositionInput({
  items, discountPct: d, despesas, tenantCalcType: tenant,
  regime: 'SIMPLES_HIBRIDO', deducaoBaseIbsCbsPct: deducao,
}).input)

const row = (r: ReturnType<typeof buildDecomposition>, k: string) => r.rows.find((x) => x.key === k)
const v = (r: ReturnType<typeof buildDecomposition>, k: string) => Math.abs(row(r, k)!.total)

// ═════════════════════════════════════════════════════════════════════════════════════════
// 1. A TABELA DE REPARTIÇÃO — a fonte única, e o que ela decide
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('1. A repartição dos anexos é a FONTE ÚNICA, e ela fecha em 100%', () => {
  it('>>> toda faixa de todo anexo soma exatamente 100% <<<', () => {
    for (const [anexo, faixas] of Object.entries(SIMPLES_ANEXOS)) {
      for (const f of faixas) {
        const r = f.repart
        const soma = r.irpj + r.csll + r.cpp + r.pis + r.cofins + r.icms + r.iss + r.ipi
        expect(`${anexo}/${f.faixa}: ${soma.toFixed(6)}`).toBe(`${anexo}/${f.faixa}: ${(1).toFixed(6)}`)
      }
    }
  })

  it('a faixa é LIDA do RBT12, não escolhida por default', () => {
    expect(faixaDoRbt12('I', 100_000).faixa).toBe(1)
    expect(faixaDoRbt12('I', 1_000_000).faixa).toBe(4)
    expect(faixaDoRbt12('I', 4_000_000).faixa).toBe(6)
  })

  it('efetiva = (RBT12 × nominal − dedução) ÷ RBT12; na faixa 1 a dedução é zero', () => {
    expect(aliquotaEfetivaSimples('II', RBT12)).toBeCloseTo(0.045, 10)
    // Faixa 2 do Anexo II: 7,80% nominal com R$ 5.940 de dedução sobre RBT12 de 300.000.
    expect(aliquotaEfetivaSimples('II', 300_000)).toBeCloseTo((300_000 * 0.078 - 5940) / 300_000, 10)
  })
})

describe('2. O DAS híbrido é a efetiva MENOS as parcelas substituídas no ano', () => {
  it('>>> 2027: sai PIS + COFINS. Anexo II f1 → 3,87%, e NÃO os 4,50% da efetiva <<<', () => {
    expect(dasHibridoPct('II', RBT12, 2027)).toBeCloseTo(0.0387, 10)
    expect(aliquotaEfetivaSimples('II', RBT12)).toBeCloseTo(0.0450, 10)
  })

  it('Anexo I f1 → 3,38% · Anexo III f1 → 5,064%', () => {
    expect(dasHibridoPct('I', RBT12, 2027)).toBeCloseTo(0.0338, 10)
    expect(dasHibridoPct('III', RBT12, 2027)).toBeCloseTo(0.05064, 10)
  })

  it('>>> a transição é por ANO: 2029 a 2032 tiram 10/20/30/40% do ICMS-ISS, 2033 tira tudo <<<', () => {
    const efet = 0.045, icms = 0.32, pisCofins = 0.14
    expect(dasHibridoPct('II', RBT12, 2028)).toBeCloseTo(efet * (1 - pisCofins), 10)
    expect(dasHibridoPct('II', RBT12, 2029)).toBeCloseTo(efet * (1 - pisCofins - 0.10 * icms), 10)
    expect(dasHibridoPct('II', RBT12, 2032)).toBeCloseTo(efet * (1 - pisCofins - 0.40 * icms), 10)
    expect(dasHibridoPct('II', RBT12, 2033)).toBeCloseTo(efet * (1 - pisCofins - icms), 10)
    // O IPI NUNCA sai do DAS no Simples (regra 6): em 2033 ele ainda está lá.
    expect(dasHibridoPct('II', RBT12, 2033)).toBeGreaterThan(efet * (1 - pisCofins - icms - 0.075))
  })
})

describe('3. A dedução da base de IBS/CBS é o ICMS/ISS/IPI que AINDA está no DAS', () => {
  it('>>> 2027: Anexo II → 1,7775% (ICMS 32% + IPI 7,5%), Anexo I → 1,36%, Anexo III → 2,01% <<<', () => {
    expect(deducaoBaseIbsCbsPct('II', RBT12, 2027)).toBeCloseTo(0.017775, 10)
    expect(deducaoBaseIbsCbsPct('I', RBT12, 2027)).toBeCloseTo(0.0136, 10)
    expect(deducaoBaseIbsCbsPct('III', RBT12, 2027)).toBeCloseTo(0.0201, 10)
  })

  it('>>> ela ENCOLHE com a transição, porque o que saiu do DAS não se deduz duas vezes <<<', () => {
    const d27 = deducaoBaseIbsCbsPct('II', RBT12, 2027)
    const d30 = deducaoBaseIbsCbsPct('II', RBT12, 2030)
    const d33 = deducaoBaseIbsCbsPct('II', RBT12, 2033)
    expect(d30).toBeLessThan(d27)
    expect(d33).toBeLessThan(d30)
    // Em 2033 sobra só o IPI: 4,50% × 7,50%.
    expect(d33).toBeCloseTo(0.045 * 0.075, 10)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// 4. O IS POR SEGMENTO — regra 5 do comando
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('4. O IS existe em INDUSTRIALIZAÇÃO e é forçado a zero fora dela, COM aviso', () => {
  it('industrialização preserva o is_pct do item', () => {
    expect(isPctDoSegmento('INDUSTRIALIZACAO', 0.10)).toEqual({ isPct: 0.10 })
  })

  it('>>> revenda e serviço zeram, e o aviso DIZ que zerou <<<', () => {
    const rev = isPctDoSegmento('REVENDA', 0.10)
    const svc = isPctDoSegmento('SERVICO', 0.10)
    expect(rev.isPct).toBe(0)
    expect(svc.isPct).toBe(0)
    expect(rev.aviso).toMatch(/revenda/i)
    expect(svc.aviso).toMatch(/servi/i)
  })

  it('sem IS cadastrado não há aviso — silêncio é para quando não houve o que zerar', () => {
    expect(isPctDoSegmento('REVENDA', 0).aviso).toBeUndefined()
    expect(isPctDoSegmento('SERVICO', 0).aviso).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO A — INDUSTRIALIZAÇÃO, Anexo II faixa 1, com IS de 10%
// ═════════════════════════════════════════════════════════════════════════════════════════
const A_BALDES = baldes({ fixa: 0.10, variavel: 0.05, financeira: 0.02, indireta: 0.03 })
const A_DED = deducaoBaseIbsCbsPct('II', RBT12, ANO)
const A_FICHA = { com: 0.05, luc: 0.15, rt: 0.01, is: 0.10 }
const cA = construirPrecoHibrido({
  custoTotal: 100, despesasPct: 0.20, rtPct: 0.01, comissaoPct: 0.05, lucroPct: 0.15,
  dasHibridoPct: dasHibridoPct('II', RBT12, ANO), deducaoBasePct: A_DED,
  isPct: 0.10, ibsPct: IBS, cbsPct: CBS, segmento: 'INDUSTRIALIZACAO',
})

describe('CASO A — Industrialização: a CONSTRUÇÃO bate com o gabarito', () => {
  it('P = 181,39 · X = 178,17 · IS = 17,82 · base IBS/CBS = 195,98', () => {
    expect(cA.precoPorDentro).toBeCloseTo(181.39, 2)
    expect(cA.baseIVA).toBeCloseTo(178.17, 2)
    expect(cA.isValue).toBeCloseTo(17.82, 2)
    expect(cA.baseIbsCbs).toBeCloseTo(195.98, 2)
  })

  it('CBS = 17,25 · IBS = 0,20 · total a cobrar = 216,65', () => {
    expect(cA.cbsValue).toBeCloseTo(17.25, 2)
    expect(cA.ibsValue).toBeCloseTo(0.20, 2)
    expect(cA.totalACobrar).toBeCloseTo(216.65, 2)
  })

  it('>>> a base de IBS/CBS É MENOR que P: a dedução do art. 12 §2º V existe e mordeu <<<', () => {
    expect(cA.baseIVA).toBeLessThan(cA.precoPorDentro)
    expect(cA.precoPorDentro - cA.baseIVA).toBeCloseTo(cA.precoPorDentro * A_DED, 6)
  })

  it('decomposição da construção: despesas 36,28 · DAS 7,02 · RT 1,81 · com 9,07 · lucro 27,21', () => {
    expect(cA.despesas).toBeCloseTo(36.28, 2)
    expect(cA.das).toBeCloseTo(7.02, 2)
    expect(cA.rt).toBeCloseTo(1.81, 2)
    expect(cA.comissao).toBeCloseTo(9.07, 2)
    expect(cA.lucro).toBeCloseTo(27.21, 2)
  })
})

describe.each([
  [0.00, { total: 216.65, is: 17.82, cbs: 17.25, ibs: 0.20, p: 181.39, das: 7.02, rt: 1.81, rro: 36.28, com: 9.07, luc: 27.21 }],
  [0.05, { total: 205.82, is: 16.93, cbs: 16.38, ibs: 0.19, p: 172.32, das: 6.67, rt: 1.72, rro: 27.65, com: 6.91, luc: 20.74 }],
  [0.10, { total: 194.98, is: 16.03, cbs: 15.52, ibs: 0.18, p: 163.25, das: 6.32, rt: 1.63, rro: 19.02, com: 4.76, luc: 14.27 }],
])('CASO A — Industrialização, desconto %p', (d, e) => {
  const r = decompor([item('A', cA, 100, 0, A_FICHA, 'PRODUZIDO')], 'INDUSTRIALIZACAO', A_BALDES, A_DED, d)

  it('sem erros, e o RRO não acusa sobra', () => {
    expect(r.errors).toEqual([])
    expect(r.rro!.foraDeZero).toBe(false)
  })

  it(`total ${e.total} · IS ${e.is} · CBS ${e.cbs} · IBS ${e.ibs}`, () => {
    expect(r.receitaAposDesconto).toBeCloseTo(e.total, 2)
    expect(v(r, 'por_fora_is')).toBeCloseTo(e.is, 2)
    expect(v(r, 'por_fora_cbs')).toBeCloseTo(e.cbs, 2)
    expect(v(r, 'por_fora_ibs')).toBeCloseTo(e.ibs, 2)
  })

  it(`P' ${e.p} · DAS ${e.das} · RT ${e.rt}`, () => {
    expect(v(r, 'operacao_por_dentro')).toBeCloseTo(e.p, 2)
    expect(v(r, 'das')).toBeCloseTo(e.das, 2)
    expect(v(r, 'rt')).toBeCloseTo(e.rt, 2)
  })

  it('>>> custo e despesa CONGELADOS — não encolhem com o desconto <<<', () => {
    expect(v(r, 'custos')).toBeCloseTo(100.00, 2)
    expect(v(r, 'despesas')).toBeCloseTo(36.28, 2)
  })

  it(`RRO ${e.rro} = comissão ${e.com} + lucro ${e.luc}, e o residual é zero`, () => {
    expect(v(r, 'rro')).toBeCloseTo(e.rro, 2)
    expect(v(r, 'comissao')).toBeCloseTo(e.com, 2)
    expect(v(r, 'lucro')).toBeCloseTo(e.luc, 2)
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
    r.residual.perItem.forEach((x) => expect(Math.abs(x)).toBeLessThan(0.005))
  })

  it('>>> a base de IBS/CBS exibida é a do art. 12 APÓS o desconto — não o total, não P <<<', () => {
    const base = row(r, 'por_fora_cbs')!.basePerItem![0]
    expect(base).toBeCloseTo(v(r, 'operacao_por_dentro') * (1 - A_DED) * (1 + A_FICHA.is), 2)
    expect(base).toBeLessThan(e.total)
    expect(v(r, 'por_fora_cbs')).toBeCloseTo(base * CBS, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO B — REVENDA, Anexo I faixa 1, IS zero POR SEGMENTO
// ═════════════════════════════════════════════════════════════════════════════════════════
const B_BALDES = baldes({ fixa: 0.0108, variavel: 0.005, financeira: 0.003, indireta: 0.002, moProdutiva: 0.15 })
const B_DED = deducaoBaseIbsCbsPct('I', RBT12, ANO)
const B_FICHA = { com: 0.50, luc: 0.15, rt: 0.01, is: 0 }
const cB = construirPrecoHibrido({
  custoTotal: 50, despesasPct: 0.0208, rtPct: 0.01, comissaoPct: 0.50, lucroPct: 0.15,
  dasHibridoPct: dasHibridoPct('I', RBT12, ANO), deducaoBasePct: B_DED,
  isPct: 0, ibsPct: IBS, cbsPct: CBS, segmento: 'REVENDA',
})

describe('CASO B — Revenda: construção e a MO produtiva que NÃO entra', () => {
  it('P = 175,19 · X = 172,81 · CBS = 15,21 · IBS = 0,17 · total = 190,57', () => {
    expect(cB.precoPorDentro).toBeCloseTo(175.19, 2)
    expect(cB.baseIVA).toBeCloseTo(172.81, 2)
    expect(cB.cbsValue).toBeCloseTo(15.21, 2)
    expect(cB.ibsValue).toBeCloseTo(0.17, 2)
    expect(cB.totalACobrar).toBeCloseTo(190.57, 2)
  })

  it('>>> revenda SECUNDÁRIA em tenant de indústria: a despesa é 2,08%, com MO produtiva de 15% no tenant <<<', () => {
    expect(B_BALDES.moProdutiva).toBe(0.15)
    expect(cB.despesas).toBeCloseTo(3.64, 2)
    expect(cB.despesas / cB.precoPorDentro).toBeCloseTo(0.0208, 6)
  })

  it('>>> sem IS: a base de IBS/CBS é X, sem a parcela do IS <<<', () => {
    expect(cB.isValue).toBe(0)
    expect(cB.baseIbsCbs).toBeCloseTo(cB.baseIVA, 10)
  })
})

describe.each([
  [0.00, { total: 190.57, cbs: 15.21, ibs: 0.17, p: 175.19, das: 5.92, rt: 1.75, rro: 113.88, com: 87.60, luc: 26.28 }],
  [0.10, { total: 171.52, cbs: 13.69, ibs: 0.16, p: 157.67, das: 5.33, rt: 1.58, rro: 97.12, com: 74.71, luc: 22.41 }],
  [0.30, { total: 133.40, cbs: 10.65, ibs: 0.12, p: 122.63, das: 4.15, rt: 1.23, rro: 63.62, com: 48.94, luc: 14.68 }],
])('CASO B — Revenda, desconto %p', (d, e) => {
  const r = decompor([item('B', cB, 50, 0, B_FICHA, 'REVENDA')], 'INDUSTRIALIZACAO', B_BALDES, B_DED, d)

  it(`total ${e.total} · CBS ${e.cbs} · IBS ${e.ibs} · P' ${e.p} · DAS ${e.das} · RT ${e.rt}`, () => {
    expect(r.receitaAposDesconto).toBeCloseTo(e.total, 2)
    expect(v(r, 'por_fora_cbs')).toBeCloseTo(e.cbs, 2)
    expect(v(r, 'por_fora_ibs')).toBeCloseTo(e.ibs, 2)
    expect(v(r, 'operacao_por_dentro')).toBeCloseTo(e.p, 2)
    expect(v(r, 'das')).toBeCloseTo(e.das, 2)
    expect(v(r, 'rt')).toBeCloseTo(e.rt, 2)
  })

  it(`custo 50,00 e despesa 3,64 congelados · RRO ${e.rro} = ${e.com} + ${e.luc}`, () => {
    expect(v(r, 'custos')).toBeCloseTo(50.00, 2)
    expect(v(r, 'despesas')).toBeCloseTo(3.64, 2)
    expect(v(r, 'rro')).toBeCloseTo(e.rro, 2)
    expect(v(r, 'comissao')).toBeCloseTo(e.com, 2)
    expect(v(r, 'lucro')).toBeCloseTo(e.luc, 2)
  })

  it('>>> o IS não tem valor na revenda, e o residual continua zero <<<', () => {
    expect(v(r, 'por_fora_is')).toBeCloseTo(0, 6)
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
    expect(r.rro!.foraDeZero).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO C — PRESTAÇÃO DE SERVIÇO, Anexo III faixa 1
// ═════════════════════════════════════════════════════════════════════════════════════════
const C_BALDES = baldes({ fixa: 0.10, variavel: 0.0158, financeira: 0.005, indireta: 0.08 })
const C_DED = deducaoBaseIbsCbsPct('III', RBT12, ANO)
const C_FICHA = { com: 0.50, luc: 0.15, rt: 0, is: 0 }
const cC = construirPrecoHibrido({
  custoTotal: 27.58, despesasPct: 0.0208, rtPct: 0, comissaoPct: 0.50, lucroPct: 0.15,
  dasHibridoPct: dasHibridoPct('III', RBT12, ANO), deducaoBasePct: C_DED,
  isPct: 0, ibsPct: IBS, cbsPct: CBS, segmento: 'SERVICO',
})

describe('CASO C — Serviço: construção, com a MO produtiva DENTRO do custo', () => {
  it('P = 99,01 · X = 97,02 · CBS = 8,54 · IBS = 0,10 · total = 107,64', () => {
    expect(cC.precoPorDentro).toBeCloseTo(99.01, 2)
    expect(cC.baseIVA).toBeCloseTo(97.02, 2)
    expect(cC.cbsValue).toBeCloseTo(8.54, 2)
    expect(cC.ibsValue).toBeCloseTo(0.10, 2)
    expect(cC.totalACobrar).toBeCloseTo(107.64, 2)
  })

  it('>>> no serviço a despesa é variável + financeira: fixa 10% e MOI 8% estão no custo, não na MC <<<', () => {
    expect(C_BALDES.fixa).toBe(0.10)
    expect(C_BALDES.indireta).toBe(0.08)
    expect(cC.despesas).toBeCloseTo(2.06, 2)
    expect(cC.das).toBeCloseTo(5.01, 2)
  })
})

describe.each([
  [0.00, { total: 107.64, cbs: 8.54, ibs: 0.10, p: 99.01, das: 5.01, rro: 64.36, com: 49.50, luc: 14.85 }],
  [0.10, { total: 96.88, cbs: 7.68, ibs: 0.09, p: 89.11, das: 4.51, rro: 54.96, com: 42.27, luc: 12.68 }],
  [0.30, { total: 75.35, cbs: 5.98, ibs: 0.07, p: 69.31, das: 3.51, rro: 36.16, com: 27.81, luc: 8.34 }],
])('CASO C — Serviço, desconto %p', (d, e) => {
  const r = decompor([item('C', cC, 8, 19.58, C_FICHA, 'SERVICO', true)], 'SERVICO', C_BALDES, C_DED, d)

  it(`total ${e.total} · CBS ${e.cbs} · IBS ${e.ibs} · P' ${e.p} · DAS ${e.das}`, () => {
    expect(r.receitaAposDesconto).toBeCloseTo(e.total, 2)
    expect(v(r, 'por_fora_cbs')).toBeCloseTo(e.cbs, 2)
    expect(v(r, 'por_fora_ibs')).toBeCloseTo(e.ibs, 2)
    expect(v(r, 'operacao_por_dentro')).toBeCloseTo(e.p, 2)
    expect(v(r, 'das')).toBeCloseTo(e.das, 2)
  })

  it(`custo 27,58 congelado · RT zero · RRO ${e.rro} = ${e.com} + ${e.luc}`, () => {
    expect(v(r, 'custos')).toBeCloseTo(27.58, 2)
    expect(v(r, 'rt')).toBeCloseTo(0, 2)
    expect(v(r, 'rro')).toBeCloseTo(e.rro, 2)
    expect(v(r, 'comissao')).toBeCloseTo(e.com, 2)
    expect(v(r, 'lucro')).toBeCloseTo(e.luc, 2)
    expect(Math.abs(r.residual.total)).toBeLessThan(0.005)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// CASO D — ORÇAMENTO MISTO B + C, com 10% de desconto
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('CASO D — orçamento misto revenda + serviço, desconto 10%', () => {
  // Os dois itens vivem no MESMO documento e têm ANEXOS diferentes — logo, DAS diferentes.
  // A dedução do documento é a do tenant; o que diverge entre eles é o DAS por item, que é
  // exatamente o que `das_pct` carrega.
  //
  // A despesa vem CONGELADA em cada item, que é o que um documento gravado carrega: os dois
  // foram construídos com 2,08%, cada um pela regra do SEU segmento. Deixar a decomposição
  // recalculá-la pelo tenant daria ao serviço a despesa da indústria — e o RRO sairia
  // R$ 1,27 maior, fechando consigo mesmo.
  const congelada = { despesasOperacionaisPctCongelado: 0.0208 } as Partial<BudgetDecompositionItem>
  const itens = [
    { ...item('B-revenda', cB, 50, 0, B_FICHA, 'REVENDA'), ...congelada },
    { ...item('C-servico', cC, 8, 19.58, C_FICHA, 'SERVICO', true), ...congelada },
  ]
  const r = decompor(itens, 'INDUSTRIALIZACAO', B_BALDES, B_DED, 0.10)

  it('>>> o gabarito do misto: total 268,40 · IBS+CBS 21,61 · DAS 9,84 · RT 1,58 <<<', () => {
    expect(r.receitaAposDesconto).toBeCloseTo(268.40, 2)
    expect(v(r, 'por_fora_ibs') + v(r, 'por_fora_cbs')).toBeCloseTo(21.61, 2)
    expect(v(r, 'das')).toBeCloseTo(9.84, 2)
    expect(v(r, 'rt')).toBeCloseTo(1.58, 2)
  })

  it('RRO 152,08 = comissão 116,98 + lucro 35,10, com residual zero por item e no total', () => {
    expect(v(r, 'rro')).toBeCloseTo(152.08, 2)
    expect(v(r, 'comissao')).toBeCloseTo(116.98, 2)
    expect(v(r, 'lucro')).toBeCloseTo(35.10, 2)
    expect(Math.abs(r.residual.total)).toBeLessThan(0.01)
    r.residual.perItem.forEach((x) => expect(Math.abs(x)).toBeLessThan(0.01))
  })

  it('>>> DAS HETEROGÊNEO: cada item paga a alíquota DO SEU anexo, não uma média <<<', () => {
    const das = row(r, 'das')!
    const p = row(r, 'operacao_por_dentro')!.perItem!
    expect(Math.abs(das.perItem![0]) / p[0]).toBeCloseTo(dasHibridoPct('I', RBT12, ANO), 6)
    expect(Math.abs(das.perItem![1]) / p[1]).toBeCloseTo(dasHibridoPct('III', RBT12, ANO), 6)
    // E a linha é rotulada como DERIVADA, porque o percentual do total é média ponderada.
    expect(das.isDerivedAverage).toBe(true)
  })

  it('toda linha com coluna: a soma das colunas é o total (R16)', () => {
    for (const l of r.rows) {
      if (l.perItem?.length) {
        expect(l.perItem.reduce((a, b) => a + b, 0)).toBeCloseTo(l.total - (l.foraDasColunas ?? 0), 2)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// AS LINHAS QUE EXISTEM — e as que somem, que é o que o regime decide
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('As linhas do híbrido: DAS + IBS/CBS/IS; sem ICMS, ISS, PIS/COFINS, IRPJ, CSLL e IPI', () => {
  const r = decompor([item('A', cA, 100, 0, A_FICHA, 'PRODUZIDO')], 'INDUSTRIALIZACAO', A_BALDES, A_DED, 0)
  const chaves = r.rows.map((x) => x.key)

  it('>>> presentes: das, por_fora_ibs, por_fora_cbs, por_fora_is <<<', () => {
    for (const k of ['das', 'por_fora_ibs', 'por_fora_cbs', 'por_fora_is']) expect(chaves).toContain(k)
  })

  it('>>> ausentes: icms, iss, pis_cofins, irpj, csll, por_fora_ipi — e ausente NÃO é zerado <<<', () => {
    for (const k of ['icms', 'iss', 'pis_cofins', 'irpj', 'csll', 'por_fora_ipi']) expect(chaves).not.toContain(k)
  })

  it('o resultado se declara guia única — é o que os cards leem', () => {
    expect(r.guiaUnica).toBe(true)
  })
})

describe('Os CARDS leem a decomposição, e a ausência de IRPJ/CSLL é zero LEGÍTIMO', () => {
  const r = decompor([item('A', cA, 100, 0, A_FICHA, 'PRODUZIDO')], 'INDUSTRIALIZACAO', A_BALDES, A_DED, 0.05)
  const dist = applyDecompositionToResidual(
    { commission: null, profit: null, irpj: null, csll: null } as never, r,
  )

  it('>>> comissão e lucro dos cards são os MESMOS da decomposição, não a Etapa 16 <<<', () => {
    expect(dist.commission?.amount).toBeCloseTo(6.91, 2)
    expect(dist.profit?.amount).toBeCloseTo(20.74, 2)
  })

  it('IRPJ e CSLL chegam zerados, com a linha presente no card', () => {
    expect(dist.irpj?.amount).toBe(0)
    expect(dist.csll?.amount).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O REGIME QUE CHEGA ÀS TELAS — sem isto, tudo acima é inalcançável em produção
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('O híbrido chega às telas como SIMPLES_HIBRIDO, e não como Lucro Presumido', () => {
  it('>>> mapToMotorRegime NÃO mapeia mais o híbrido para LUCRO_PRESUMIDO <<<', () => {
    expect(mapToMotorRegime('SIMPLES_HIBRIDO')).toBe('SIMPLES_HIBRIDO')
    expect(mapToMotorRegime('SIMPLES_HIBRIDO')).not.toBe('LUCRO_PRESUMIDO')
  })

  it('e o EFEITO: com o mapeamento antigo a decomposição sairia no formato do Lucro Real', () => {
    const comoAntes = buildDecomposition(buildBudgetDecompositionInput({
      items: [item('A', cA, 100, 0, A_FICHA, 'PRODUZIDO')], discountPct: 0,
      despesas: A_BALDES, tenantCalcType: 'INDUSTRIALIZACAO',
      regime: mapToMotorRegime('SIMPLES_HIBRIDO') === 'SIMPLES_HIBRIDO' ? 'LUCRO_PRESUMIDO' : 'x',
      deducaoBaseIbsCbsPct: A_DED,
    }).input)
    const chaves = comoAntes.rows.map((x) => x.key)
    expect(chaves).toContain('irpj')
    expect(chaves).not.toContain('das')
  })

  it('LUCRO_PRESUMIDO_RET continua mapeado — ali muda a alíquota, não o formato', () => {
    expect(mapToMotorRegime('LUCRO_PRESUMIDO_RET')).toBe('LUCRO_PRESUMIDO')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A CONSTRUÇÃO PELA PORTA DE PRODUÇÃO — `buildProductConstruction`, que é o que a tela chama
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('A tela do produto forma o preço do híbrido pela matriz, não por soma por cima', () => {
  const construirPelaTela = (over: Partial<Parameters<typeof buildProductConstruction>[0]> = {}) =>
    buildProductConstruction({
      taxableRegime: 'SIMPLES_HIBRIDO',
      segment: 'INDUSTRIALIZACAO',
      buyerType: 'CONSUMIDOR_FINAL',
      saleScope: 'INTRAESTADUAL',
      costTotal: 100,
      structurePct: 0.20,
      rtReservePct: 0.01,
      commissionPct: 0.05,
      profitPct: 0.15,
      profitTaxPct: 0,
      rates: {
        icmsPct: null, issPct: null, pisCofinsEffectivePct: 0, ipiPct: null,
        isPct: 0.10, ibsPct: IBS, cbsPct: CBS, ivaReductionIbs: null, ivaReductionCbs: null,
      },
      baseCodes: { ibs: null, cbs: null, is: null, ipi: null },
      despAcessorias: 0,
      dasHibridoPct: dasHibridoPct('II', RBT12, ANO),
      deducaoBaseIbsCbsPct: A_DED,
      ...over,
    } as never)

  it('>>> o CASO A sai igual pela tela: P 181,39 e total 216,65 <<<', () => {
    const m = construirPelaTela()
    expect(m.applied).toBe(true)
    expect(m.opInterna).toBeCloseTo(181.39, 2)
    expect(m.totalGeral).toBeCloseTo(216.65, 2)
  })

  it('>>> e NÃO é soma por cima: o total excede P em IS + CBS + IBS, sobre a base deduzida <<<', () => {
    const m = construirPelaTela()
    const ext = m.resolved!.externalTaxes
    expect(ext.is!.baseValue).toBeCloseTo(178.17, 2)
    expect(ext.ibs!.baseValue).toBeCloseTo(195.98, 2)
    expect(ext.cbs!.baseValue).toBeCloseTo(195.98, 2)
    expect(m.totalGeral - m.opInterna)
      .toBeCloseTo(ext.is!.value + ext.ibs!.value + ext.cbs!.value, 6)
  })

  it('ICMS, ISS e PIS/COFINS saem ZERADOS da construção: estão dentro do DAS', () => {
    const r = construirPelaTela().resolved!
    expect(r.icmsValue).toBe(0)
    expect(r.issValue).toBe(0)
    expect(r.pisCofinsValue).toBe(0)
    expect(r.icmsPctEffective).toBe(0)
  })

  it('>>> SEM ANEXO configurado a matriz NÃO se aplica — e não forma preço com DAS zero <<<', () => {
    const m = construirPelaTela({ dasHibridoPct: null, deducaoBaseIbsCbsPct: null } as never)
    expect(m.applied).toBe(false)
    expect(m.reason).toMatch(/anexo/i)
  })

  it('>>> revenda com IS cadastrado: zera e AVISA, e o total cai porque o IS saiu <<<', () => {
    const comIs = construirPelaTela({ segment: 'REVENDA' } as never)
    expect(comIs.resolved!.externalTaxes.is).toBeUndefined()
    expect(comIs.errors.join(' ')).toMatch(/Imposto Seletivo/i)
    expect(comIs.totalGeral).toBeLessThan(construirPelaTela().totalGeral)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// REGRESSÃO — o que NÃO pode mudar
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('REGRESSÃO: fora do híbrido nada muda', () => {
  const semRegime = (regime: string | null) => buildDecomposition(buildBudgetDecompositionInput({
    items: [item('A', cA, 100, 0, A_FICHA, 'PRODUZIDO')], discountPct: 0,
    despesas: A_BALDES, tenantCalcType: 'INDUSTRIALIZACAO', regime,
  }).input)

  it('>>> SIMPLES_NACIONAL continua SEM por fora: o híbrido não vazou para a guia única <<<', () => {
    const chaves = semRegime('SIMPLES_NACIONAL').rows.map((x) => x.key)
    expect(chaves).toContain('das')
    for (const k of ['por_fora_ibs', 'por_fora_cbs', 'por_fora_is']) expect(chaves).not.toContain(k)
  })

  it('>>> MEI idem — e MEI nunca é híbrido <<<', () => {
    const chaves = semRegime('MEI').rows.map((x) => x.key)
    expect(chaves).toContain('das')
    for (const k of ['por_fora_ibs', 'por_fora_cbs']) expect(chaves).not.toContain(k)
  })

  it('>>> LUCRO_PRESUMIDO continua SEM matriz na construção — a regra dele segue sem ser escrita <<<', () => {
    const m = buildProductConstruction({
      taxableRegime: 'LUCRO_PRESUMIDO', segment: 'INDUSTRIALIZACAO',
      buyerType: 'CONSUMIDOR_FINAL', saleScope: 'INTRAESTADUAL',
      costTotal: 100, structurePct: 0.20, rtReservePct: 0.01, commissionPct: 0.05,
      profitPct: 0.15, profitTaxPct: 0,
      rates: { icmsPct: 0.17, issPct: null, pisCofinsEffectivePct: 0.03, ipiPct: null,
        isPct: null, ibsPct: IBS, cbsPct: CBS, ivaReductionIbs: null, ivaReductionCbs: null },
      baseCodes: { ibs: null, cbs: null, is: null, ipi: null }, despAcessorias: 0,
    } as never)
    expect(m.applied).toBe(false)
    expect(m.reason).toMatch(/regime sem matriz/i)
  })

  it('>>> LUCRO_REAL continua com ICMS, PIS/COFINS, IRPJ e CSLL, e SEM linha de DAS <<<', () => {
    const chaves = semRegime('LUCRO_REAL').rows.map((x) => x.key)
    for (const k of ['icms', 'pis_cofins', 'irpj', 'csll']) expect(chaves).toContain(k)
    expect(chaves).not.toContain('das')
  })
})
