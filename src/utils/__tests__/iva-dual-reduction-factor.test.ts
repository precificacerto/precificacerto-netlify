/**
 * Fator de redução do IVA DUAL — a lista da tela, a faixa do banco, a conversão
 * de unidade e o `c` resultante.
 *
 * A DIVISÃO QUE ESTE ARQUIVO AFIRMA. A tela oferece OITO faixas e só essas
 * (LC 214/2025). A CHECK do banco aceita `[0, 100]`, mais larga de propósito:
 * lista muda com lei nova, constraint não deveria mudar junto. Logo:
 *
 *   - `isOptionPct`   → pergunta da TELA. 45 é FALSO.
 *   - `isValidReductionFactorPct` e `reductionFactorPctToFraction`
 *                     → perguntas do DADO. 45 é VÁLIDO, porque pode chegar por
 *                       importação, por API, ou de linha gravada antes de uma
 *                       mudança de lista.
 *
 * O caso do 45 é o que mantém as duas perguntas separadas. Se alguém fizer o
 * conversor recusar o que não está na lista, é ele que fica vermelho.
 *
 * ORÁCULOS DO `c`. Os oito valores foram obtidos por DOIS caminhos independentes
 * da implementação:
 *
 *   1. forma fechada em aritmética EXATA (`fractions.Fraction`)
 *        c = a × (1 − ICMS) ÷ (1 + a),  a = IBS + CBS×(1 − fator)
 *   2. iteração de ponto fixo em float, 10.000 passos
 *        c ← a × ((1 − c) − ICMS)
 *
 * Os dois concordam dentro de 1e-17. Dois deles — fator 0 e fator 60 — foram
 * conferidos de forma independente pelo dono do produto (7,408015% e 3,589361%),
 * o que valida o modelo com que os outros seis foram calculados.
 *
 * Precisão PLENA, não arredondada a seis casas: com tolerância 1e-9 um oráculo
 * arredondado falharia por construção, e afrouxar a tolerância esconderia erro
 * real de fórmula na mesma ordem de grandeza.
 */
import {
  IVA_DUAL_REDUCTION_OPTIONS,
  isOptionPct,
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

/** [fator em %, c esperado em precisão plena] — as OITO faixas da lista. */
const ORACULOS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.07408014571948998],
  [30, 0.05545726017170586],
  [40, 0.0490440346255175],
  [50, 0.04252371916508539],
  [60, 0.03589360887868351],
  [70, 0.0291509069857198],
  [80, 0.02229272090307513],
  [100, 0.00821782178217822],
]

const cComFator = (pct: number | null) =>
  resolveExternalOpsCoefficient({
    ...BASE,
    cbs: {
      rate: 0.088,
      reductionFactor: reductionFactorPctToFraction(pct).fraction,
      baseCode: 4,
    },
  })

describe('a lista fechada da tela — as oito faixas da LC 214/2025', () => {
  it('são exatamente oito, nesta ordem', () => {
    expect(IVA_DUAL_REDUCTION_OPTIONS.map((o) => o.pct)).toEqual([0, 30, 40, 50, 60, 70, 80, 100])
  })

  it('o 0 existe e é o primeiro — integral, regime regular', () => {
    expect(IVA_DUAL_REDUCTION_OPTIONS[0].pct).toBe(0)
    expect(IVA_DUAL_REDUCTION_OPTIONS[0].enquadramento).toContain('Integral')
    expect(IVA_DUAL_REDUCTION_OPTIONS[0].artigo).toBe('art. 16')
  })

  it('as sete faixas do Select original continuam lá', () => {
    const pcts = IVA_DUAL_REDUCTION_OPTIONS.map((o) => o.pct)
    for (const original of [30, 40, 50, 60, 70, 80, 100]) {
      expect(pcts).toContain(original)
    }
  })

  it('o 40 NÃO inventa enquadramento: artigo nulo e ressalva explícita', () => {
    const quarenta = IVA_DUAL_REDUCTION_OPTIONS.find((o) => o.pct === 40)!
    expect(quarenta.artigo).toBeNull()
    expect(quarenta.nota).toContain('NÃO foi confirmado')
  })

  it('50, 70 e 80 carregam a divergência entre fontes de 2025 e 2026, sem escolher lado', () => {
    for (const pct of [50, 70, 80]) {
      const o = IVA_DUAL_REDUCTION_OPTIONS.find((x) => x.pct === pct)!
      expect(o.nota).toContain('divergem')
    }
  })

  it('toda faixa com artigo confirmado tem enquadramento nomeado', () => {
    for (const o of IVA_DUAL_REDUCTION_OPTIONS) {
      if (o.artigo !== null) expect(o.enquadramento.length).toBeGreaterThan(0)
    }
  })

  it('toda faixa da lista cabe na faixa que o banco aceita', () => {
    for (const o of IVA_DUAL_REDUCTION_OPTIONS) {
      expect(isValidReductionFactorPct(o.pct)).toBe(true)
    }
  })
})

describe('isOptionPct — a pergunta da TELA, e só dela', () => {
  it.each([0, 30, 40, 50, 60, 70, 80, 100])('%i está na lista', (pct) => {
    expect(isOptionPct(pct)).toBe(true)
  })

  it.each([1, 27, 45, 55, 99])('%i NÃO está na lista', (pct) => {
    expect(isOptionPct(pct)).toBe(false)
  })

  it('a lista é mais estreita que a faixa — as duas perguntas são diferentes', () => {
    expect(isOptionPct(45)).toBe(false)
    expect(isValidReductionFactorPct(45)).toBe(true)
  })
})

describe('reductionFactorPctToFraction — trabalha sobre a FAIXA, não sobre a lista', () => {
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

  it('45 CONVERTE, mesmo fora da lista da tela — pode vir de importação ou API', () => {
    const r = reductionFactorPctToFraction(45)
    expect(r.error).toBeUndefined()
    expect(r.fraction).toBeCloseTo(0.45, 12)
    expect(isOptionPct(45)).toBe(false)
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
    for (const [pct] of ORACULOS) {
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

describe('o `c` com cada uma das oito faixas na CBS', () => {
  it.each(ORACULOS)('fator %i%% → c esperado', (pct, esperado) => {
    const conv = reductionFactorPctToFraction(pct)
    expect(conv.error).toBeUndefined()

    const r = cComFator(pct)
    expect(r.isValid).toBe(true)
    expect(Math.abs(r.externalOpsCoefficient - esperado)).toBeLessThan(TOL)
  })

  it('fator maior reduz o `c` — a relação é monotônica nas oito faixas', () => {
    const cs = ORACULOS.map(([, esperado]) => esperado)
    for (let k = 1; k < cs.length; k++) {
      expect(cs[k]).toBeLessThan(cs[k - 1])
    }
  })

  it('fator 100 zera a CBS: o `c` passa a ser o do IBS sozinho', () => {
    const soIbs = resolveExternalOpsCoefficient({ ...BASE, cbs: undefined })
    const cbsZerada = cComFator(100)
    expect(Math.abs(cbsZerada.externalOpsCoefficient - soIbs.externalOpsCoefficient)).toBeLessThan(
      TOL,
    )
  })

  it('NULO é tratado como não classificado e NÃO quebra a aritmética: mesmo c do fator 0', () => {
    const r = cComFator(null)
    expect(r.isValid).toBe(true)
    expect(Math.abs(r.externalOpsCoefficient - ORACULOS[0][1])).toBeLessThan(TOL)
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

describe('valor fora da lista: recusado pela TELA, respeitado pelo MOTOR', () => {
  it('o motor calcula o `c` do fator 45 e o valor cai entre o do 40 e o do 50', () => {
    const r = cComFator(45)
    expect(r.isValid).toBe(true)
    expect(r.externalOpsCoefficient).toBeLessThan(0.0490440346255175) // fator 40
    expect(r.externalOpsCoefficient).toBeGreaterThan(0.04252371916508539) // fator 50
  })

  it('a alíquota efetiva do 45 é calculada normalmente', () => {
    expect(resolveIvaDualEffectiveRate(8.8, 45)).toBeCloseTo(4.84, 12)
  })

  it('só a tela recusa o 45 — o dado e o cálculo o aceitam', () => {
    expect(isOptionPct(45)).toBe(false)
    expect(isValidReductionFactorPct(45)).toBe(true)
    expect(reductionFactorPctToFraction(45).error).toBeUndefined()
    expect(cComFator(45).isValid).toBe(true)
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
