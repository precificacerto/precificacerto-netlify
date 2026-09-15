/**
 * Fator de redução do IVA DUAL — faixa, conversão de unidade e o `c` resultante.
 *
 * ORÁCULOS DO `c`. Os seis valores abaixo foram obtidos por DOIS caminhos
 * independentes da implementação, em aritmética exata (`fractions.Fraction`):
 *
 *   1. forma fechada     c = a × (1 − ICMS) ÷ (1 + a),  a = IBS + CBS×(1 − fator)
 *   2. ponto fixo        arbitra c, recalcula base4 = (1 − c) − ICMS, repete
 *
 * Os dois convergem no mesmo racional. Dois deles — fator 0 e fator 60 — foram
 * conferidos de forma independente pelo dono do produto (7,408015% e 3,589361%),
 * o que valida o modelo com que os outros quatro foram calculados.
 *
 * Precisão PLENA, não arredondada a seis casas: com tolerância 1e-9 um oráculo
 * arredondado falharia por construção, e afrouxar a tolerância esconderia erro
 * real de fórmula na mesma ordem de grandeza.
 *
 * O FATOR 45 ENTRA DE PROPÓSITO. Ele não está na lista de atalhos e não estava na
 * constraint antiga do banco `(30,40,50,60,70,80,100)`. É o caso que prova que o
 * campo virou livre — se alguém restaurar o seletor fechado ou a constraint
 * antiga, este caso é o que denuncia.
 *
 * Verificado por mutação: conversor sem o `/100`, guarda voltando a `f > 0`, e
 * faixa aceitando negativo — as três deixam casos vermelhos. Se uma mutação
 * passar verde, o teste não afirma nada (`teste-que-nao-exercita.md`).
 */
import {
  IVA_DUAL_REDUCTION_SHORTCUTS,
  isValidReductionFactorPct,
  reductionFactorPctToFraction,
} from '../iva-dual-reduction-factor'
import { resolveIvaDualEffectiveRate } from '../item-tax-rates'
import { resolveExternalOpsCoefficient, type ExternalOpsInput } from '../external-ops-coefficient'

const TOL = 1e-9

/** ICMS 17%, sem ISS, sem PIS/COFINS, IBS 1% e CBS 8,80% na base 4. */
const BASE: Omit<ExternalOpsInput, 'cbs'> = {
  icmsPct: 0.17,
  issPct: 0,
  pisCofinsPct: 0,
  ibs: { rate: 0.01, baseCode: 4 },
}

/** [fator em %, c esperado em precisão plena] */
const ORACULOS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.07408014571948998],
  [30, 0.05545726017170586],
  [45, 0.04579743008314437],
  [50, 0.04252371916508539],
  [60, 0.03589360887868351],
  [100, 0.00821782178217822],
]

describe('reductionFactorPctToFraction — a única travessia entre as duas unidades', () => {
  it('50 vira 0,5', () => {
    expect(reductionFactorPctToFraction(50)).toEqual({ ausente: false, fraction: 0.5 })
  })

  it('0 vira 0 e NÃO é ausente — classificado, regime regular', () => {
    const r = reductionFactorPctToFraction(0)
    expect(r.ausente).toBe(false)
    expect(r.fraction).toBe(0)
    expect(r.error).toBeUndefined()
  })

  it('nulo vira ausente, sem fração', () => {
    expect(reductionFactorPctToFraction(null)).toEqual({ ausente: true })
    expect(reductionFactorPctToFraction(undefined)).toEqual({ ausente: true })
  })

  it('nulo e zero produzem resultados DISTINGUÍVEIS', () => {
    const nulo = reductionFactorPctToFraction(null)
    const zero = reductionFactorPctToFraction(0)
    expect(nulo.ausente).not.toBe(zero.ausente)
    expect(nulo.fraction).toBeUndefined()
    expect(zero.fraction).toBe(0)
  })

  it('45 vira 0,45 — valor fora da lista de atalhos é conversível', () => {
    expect(reductionFactorPctToFraction(45).fraction).toBeCloseTo(0.45, 12)
  })

  it('100 vira 1', () => {
    expect(reductionFactorPctToFraction(100)).toEqual({ ausente: false, fraction: 1 })
  })

  it.each([-1, -0.01, 101, 150])('%p é recusado com mensagem', (pct) => {
    const r = reductionFactorPctToFraction(pct)
    expect(r.ausente).toBe(false)
    expect(r.fraction).toBeUndefined()
    expect(r.error).toContain('fora da faixa')
  })

  it('não numérico é recusado', () => {
    const r = reductionFactorPctToFraction(Number.NaN)
    expect(r.fraction).toBeUndefined()
    expect(r.error).toContain('não numérico')
  })

  it('a fração cabe no que o motor aceita — [0, 1]', () => {
    for (const pct of [0, 30, 45, 50, 60, 100]) {
      const f = reductionFactorPctToFraction(pct).fraction as number
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })
})

describe('isValidReductionFactorPct — a faixa é [0, 100] fechada nas duas pontas', () => {
  it.each([0, 1, 45, 99, 100])('%p é válido', (v) => {
    expect(isValidReductionFactorPct(v)).toBe(true)
  })

  it.each([-1, -0.0001, 100.0001, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    '%p é inválido',
    (v) => {
      expect(isValidReductionFactorPct(v)).toBe(false)
    },
  )
})

describe('o `c` com cada fator de redução na CBS', () => {
  it.each(ORACULOS)('fator %i%% → c esperado', (pct, esperado) => {
    const conv = reductionFactorPctToFraction(pct)
    expect(conv.error).toBeUndefined()

    const r = resolveExternalOpsCoefficient({
      ...BASE,
      cbs: { rate: 0.088, reductionFactor: conv.fraction, baseCode: 4 },
    })

    expect(r.isValid).toBe(true)
    expect(Math.abs(r.externalOpsCoefficient - esperado)).toBeLessThan(TOL)
  })

  it('o fator 45 é aceito e cai ENTRE o 30 e o 50 — não é valor de lista', () => {
    const c = (pct: number) =>
      resolveExternalOpsCoefficient({
        ...BASE,
        cbs: {
          rate: 0.088,
          reductionFactor: reductionFactorPctToFraction(pct).fraction,
          baseCode: 4,
        },
      }).externalOpsCoefficient

    expect(c(45)).toBeLessThan(c(30))
    expect(c(45)).toBeGreaterThan(c(50))
  })

  it('fator maior reduz o `c` — a relação é monotônica', () => {
    const cs = ORACULOS.map(([, esperado]) => esperado)
    for (let k = 1; k < cs.length; k++) {
      expect(cs[k]).toBeLessThan(cs[k - 1])
    }
  })

  it('fator 100 zera a CBS: o `c` passa a ser o do IBS sozinho', () => {
    const soIbs = resolveExternalOpsCoefficient({ ...BASE, cbs: undefined })
    const cbsZerada = resolveExternalOpsCoefficient({
      ...BASE,
      cbs: { rate: 0.088, reductionFactor: 1, baseCode: 4 },
    })
    expect(Math.abs(cbsZerada.externalOpsCoefficient - soIbs.externalOpsCoefficient)).toBeLessThan(
      TOL,
    )
  })

  it('NULO é tratado como não classificado e NÃO quebra a aritmética: mesmo c do fator 0', () => {
    const conv = reductionFactorPctToFraction(null)
    expect(conv.ausente).toBe(true)

    const naoClassificado = resolveExternalOpsCoefficient({
      ...BASE,
      cbs: { rate: 0.088, reductionFactor: conv.fraction, baseCode: 4 },
    })
    expect(naoClassificado.isValid).toBe(true)
    expect(Math.abs(naoClassificado.externalOpsCoefficient - ORACULOS[0][1])).toBeLessThan(TOL)
  })

  it('a fração fora de [0, 1] é recusada pelo motor, não silenciada', () => {
    const r = resolveExternalOpsCoefficient({
      ...BASE,
      cbs: { rate: 0.088, reductionFactor: 1.2, baseCode: 4 },
    })
    expect(r.isValid).toBe(false)
    expect(r.validationErrors.join(' ')).toContain('cbs.reductionFactor')
  })
})

describe('resolveIvaDualEffectiveRate — nulo, zero e fora da faixa', () => {
  it('fator 50 sobre alíquota 10% dá 5% — o exemplo do dono do produto', () => {
    expect(resolveIvaDualEffectiveRate(10, 50)).toBeCloseTo(5, 12)
  })

  it('fator 0 devolve a bruta — e é caminho de fator VÁLIDO, não de ausência', () => {
    expect(resolveIvaDualEffectiveRate(8.8, 0)).toBeCloseTo(8.8, 12)
  })

  it('nulo devolve a bruta — não classificado', () => {
    expect(resolveIvaDualEffectiveRate(8.8, null)).toBeCloseTo(8.8, 12)
    expect(resolveIvaDualEffectiveRate(8.8, undefined)).toBeCloseTo(8.8, 12)
  })

  it('fator 45 reduz de verdade — valor fora da lista de atalhos', () => {
    expect(resolveIvaDualEffectiveRate(8.8, 45)).toBeCloseTo(4.84, 12)
  })

  it('fator 100 zera a alíquota', () => {
    expect(resolveIvaDualEffectiveRate(8.8, 100)).toBe(0)
  })

  it('fator ACIMA de 100 é recusado e NÃO produz alíquota negativa', () => {
    const r = resolveIvaDualEffectiveRate(8.8, 150) as number
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeCloseTo(8.8, 12)
  })

  it('fator NEGATIVO é recusado e NÃO aumenta a alíquota', () => {
    const r = resolveIvaDualEffectiveRate(8.8, -20) as number
    expect(r).toBeLessThanOrEqual(8.8)
    expect(r).toBeCloseTo(8.8, 12)
  })
})

describe('atalhos da tela — sugestão, não restrição', () => {
  it('o 0 existe, e é o primeiro', () => {
    expect(IVA_DUAL_REDUCTION_SHORTCUTS[0].pct).toBe(0)
    expect(IVA_DUAL_REDUCTION_SHORTCUTS[0].enquadramento).toContain('Integral')
  })

  it('as sete opções anteriores continuam lá', () => {
    const pcts = IVA_DUAL_REDUCTION_SHORTCUTS.map((s) => s.pct)
    for (const antigo of [30, 40, 50, 60, 70, 80, 100]) {
      expect(pcts).toContain(antigo)
    }
  })

  it('exatamente 0, 30, 60 e 100 são marcados como LC 214, com enquadramento nomeado', () => {
    const lc = IVA_DUAL_REDUCTION_SHORTCUTS.filter((s) => s.lc214)
    expect(lc.map((s) => s.pct)).toEqual([0, 30, 60, 100])
    for (const s of lc) expect(s.enquadramento).toBeTruthy()
  })

  it('40, 70 e 80 ficam SEM enquadramento nomeado, porque não têm um', () => {
    for (const pct of [40, 70, 80]) {
      const s = IVA_DUAL_REDUCTION_SHORTCUTS.find((x) => x.pct === pct)!
      expect(s.lc214).toBe(false)
      expect(s.enquadramento).toBeNull()
    }
  })

  it('todo atalho cai dentro da faixa aceita pelo banco', () => {
    for (const s of IVA_DUAL_REDUCTION_SHORTCUTS) {
      expect(isValidReductionFactorPct(s.pct)).toBe(true)
    }
  })
})
