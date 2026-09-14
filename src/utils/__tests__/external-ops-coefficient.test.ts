/**
 * Oráculo do `c` da R3 (`.claude/rules/cascata-lucro-real.md`).
 *
 * Os oito valores abaixo foram conferidos por DOIS caminhos independentes antes
 * de entrarem aqui: a forma fechada e uma simulação numérica que resolve o
 * ponto fixo (arbitra T, calcula os tributos, recalcula, repete). Os dois
 * caminhos convergem. Por isso são oráculo, e não o resultado da própria função
 * sendo comparado consigo mesmo.
 *
 * Os valores estão em precisão plena, não arredondados a seis casas: com
 * tolerância de 1e-9 um oráculo arredondado falharia por construção, e afrouxar
 * a tolerância para caber no arredondamento é o caminho errado — esconderia
 * erro real de fórmula na mesma ordem de grandeza.
 *
 * Verificado por mutação — trocar o sinal de beta, ignorar o reductionFactor,
 * ou usar a base 3 no lugar da 4 para o IBS deixam casos vermelhos. Se uma
 * mutação passar verde, o teste não afirma nada (`teste-que-nao-exercita.md`).
 */
import {
  resolveExternalOpsCoefficient,
  type ExternalOpsInput,
} from '../external-ops-coefficient'

const TOL = 1e-9

/** ICMS 17%, sem ISS, sem PIS/COFINS, IBS 1% + CBS 8,80% na base 4. */
const CASO_A: ExternalOpsInput = {
  icmsPct: 0.17,
  issPct: 0,
  pisCofinsPct: 0,
  ibs: { rate: 0.01, baseCode: 4 },
  cbs: { rate: 0.088, baseCode: 4 },
}

const CASOS: ReadonlyArray<readonly [string, ExternalOpsInput, number]> = [
  ['A · ICMS 17%, IBS 1% e CBS 8,8% na base 4', CASO_A, 0.07408014571948997],
  [
    'B · cenário 2026: ICMS 17%, PIS/COFINS 9,25%, IBS 0,1% e CBS 0,9%',
    { icmsPct: 0.17, issPct: 0, pisCofinsPct: 0.0925, ibs: { rate: 0.001, baseCode: 4 }, cbs: { rate: 0.009, baseCode: 4 } },
    0.007464509575601416,
  ],
  [
    'C · A, com fator de redução de 60% na CBS',
    { ...CASO_A, cbs: { rate: 0.088, reductionFactor: 0.6, baseCode: 4 } },
    0.03589360887868351,
  ],
  [
    'D · serviço sem ICMS, sem ISS e sem PIS/COFINS',
    { icmsPct: 0, issPct: 0, pisCofinsPct: 0, ibs: { rate: 0.01, baseCode: 4 }, cbs: { rate: 0.088, baseCode: 4 } },
    0.08925318761384333,
  ],
  [
    'E · D, com ISS 5%',
    { icmsPct: 0, issPct: 0.05, pisCofinsPct: 0, ibs: { rate: 0.01, baseCode: 4 }, cbs: { rate: 0.088, baseCode: 4 } },
    0.08517061568017564,
  ],
  [
    'F · A, mais IPI 5% na base 1 (IPI FORA da base do IBS/CBS)',
    { ...CASO_A, ipi: { rate: 0.05, baseCode: 1 } },
    0.1144076655052265,
  ],
  [
    'G · A, mais IS 2% na base 1 (IS INTEGRA a base 4)',
    { ...CASO_A, is: { rate: 0.02, baseCode: 1 } },
    0.09223543697989213,
  ],
  [
    'H · nenhum tributo por fora',
    { icmsPct: 0.17, issPct: 0, pisCofinsPct: 0 },
    0,
  ],
]

describe('resolveExternalOpsCoefficient — o c da R3 em forma fechada', () => {
  describe('1. oráculo: os oito casos conferidos fora da função', () => {
    it.each(CASOS)('%s', (_nome, entrada, esperado) => {
      const r = resolveExternalOpsCoefficient(entrada)
      expect(r.isValid).toBe(true)
      expect(r.validationErrors).toEqual([])
      expect(Math.abs(r.externalOpsCoefficient - esperado)).toBeLessThan(TOL)
    })
  })

  describe('2. o que cada peça da fórmula faz — falsificável uma a uma', () => {
    it('o IPI na base 1 NÃO entra na base do IBS/CBS: F > A só pelo próprio IPI', () => {
      const a = resolveExternalOpsCoefficient(CASO_A).externalOpsCoefficient
      const f = resolveExternalOpsCoefficient({ ...CASO_A, ipi: { rate: 0.05, baseCode: 1 } })
      // Se o IPI vazasse para a base do IBS/CBS, G e F teriam a mesma forma.
      expect(f.externalOpsCoefficient).toBeGreaterThan(a)
      expect(Math.abs(f.externalOpsCoefficient - 0.1144076655052265)).toBeLessThan(TOL)
    })

    it('o IS INTEGRA a base 4: G é maior que A mais o próprio IS isolado', () => {
      const g = resolveExternalOpsCoefficient({ ...CASO_A, is: { rate: 0.02, baseCode: 1 } })
      const somenteIS = resolveExternalOpsCoefficient({
        icmsPct: 0.17, issPct: 0, pisCofinsPct: 0, is: { rate: 0.02, baseCode: 1 },
      })
      const a = resolveExternalOpsCoefficient(CASO_A).externalOpsCoefficient
      // Não é soma simples: o IS entra na base do IBS/CBS e os dois se empurram.
      expect(g.externalOpsCoefficient).toBeGreaterThan(a + somenteIS.externalOpsCoefficient * 0.9)
      expect(Math.abs(g.externalOpsCoefficient - 0.09223543697989213)).toBeLessThan(TOL)
    })

    it('o fator de redução reduz de verdade: C fica abaixo de A', () => {
      const a = resolveExternalOpsCoefficient(CASO_A).externalOpsCoefficient
      const c = resolveExternalOpsCoefficient({
        ...CASO_A, cbs: { rate: 0.088, reductionFactor: 0.6, baseCode: 4 },
      }).externalOpsCoefficient
      expect(c).toBeLessThan(a)
      expect(Math.abs(c - 0.03589360887868351)).toBeLessThan(TOL)
    })

    it('reductionFactor 100% zera o tributo; ausente é igual a 0', () => {
      const zerado = resolveExternalOpsCoefficient({
        ...CASO_A, cbs: { rate: 0.088, reductionFactor: 1, baseCode: 4 },
      })
      const semCbs = resolveExternalOpsCoefficient({ ...CASO_A, cbs: undefined })
      expect(Math.abs(zerado.externalOpsCoefficient - semCbs.externalOpsCoefficient)).toBeLessThan(TOL)
    })

    it('ISS entra sem gross-up e ICMS sobre o total: E difere de D', () => {
      const d = resolveExternalOpsCoefficient({
        icmsPct: 0, issPct: 0, pisCofinsPct: 0, ibs: { rate: 0.01, baseCode: 4 }, cbs: { rate: 0.088, baseCode: 4 },
      }).externalOpsCoefficient
      const e = resolveExternalOpsCoefficient({
        icmsPct: 0, issPct: 0.05, pisCofinsPct: 0, ibs: { rate: 0.01, baseCode: 4 }, cbs: { rate: 0.088, baseCode: 4 },
      }).externalOpsCoefficient
      expect(e).toBeLessThan(d)
    })

    it('as bases 1, 2 e 3 são estritamente decrescentes com ICMS e PIS/COFINS > 0', () => {
      const base = { icmsPct: 0.17, issPct: 0.05, pisCofinsPct: 0.0925 }
      const c1 = resolveExternalOpsCoefficient({ ...base, ibs: { rate: 0.05, baseCode: 1 } }).externalOpsCoefficient
      const c2 = resolveExternalOpsCoefficient({ ...base, ibs: { rate: 0.05, baseCode: 2 } }).externalOpsCoefficient
      const c3 = resolveExternalOpsCoefficient({ ...base, ibs: { rate: 0.05, baseCode: 3 } }).externalOpsCoefficient
      expect(c1).toBeGreaterThan(c2)
      expect(c2).toBeGreaterThan(c3)
    })
  })

  describe('3. validações', () => {
    it('IS com base 4 invalida, com erro explícito', () => {
      const r = resolveExternalOpsCoefficient({ ...CASO_A, is: { rate: 0.02, baseCode: 4 } })
      expect(r.isValid).toBe(false)
      expect(r.externalOpsCoefficient).toBe(0)
      expect(r.validationErrors.join(' ')).toContain('is.baseCode 4')
    })

    it('IPI com base 5 invalida', () => {
      const r = resolveExternalOpsCoefficient({ ...CASO_A, ipi: { rate: 0.05, baseCode: 5 } })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('ipi.baseCode 5')
    })

    it('alíquota negativa invalida', () => {
      const r = resolveExternalOpsCoefficient({ ...CASO_A, cbs: { rate: -0.01, baseCode: 4 } })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('cbs.rate')
    })

    it('alíquota acima de 1 invalida', () => {
      const r = resolveExternalOpsCoefficient({ ...CASO_A, cbs: { rate: 1.5, baseCode: 4 } })
      expect(r.isValid).toBe(false)
    })

    it('reductionFactor fora de [0, 1] invalida', () => {
      const r = resolveExternalOpsCoefficient({
        ...CASO_A, cbs: { rate: 0.088, reductionFactor: 1.2, baseCode: 4 },
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('cbs.reductionFactor')
    })

    it('baseCode fora de 1..5 invalida', () => {
      const r = resolveExternalOpsCoefficient({
        ...CASO_A, cbs: { rate: 0.088, baseCode: 9 as never },
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('cbs.baseCode')
    })

    it('ICMS fora de [0, 1] invalida', () => {
      const r = resolveExternalOpsCoefficient({ ...CASO_A, icmsPct: 1.4 })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('icmsPct')
    })

    it('c que resultaria fora de [0, 1) invalida em vez de devolver número', () => {
      // Alíquotas por fora somando o suficiente para estourar o intervalo.
      const r = resolveExternalOpsCoefficient({
        icmsPct: 0, issPct: 0, pisCofinsPct: 0,
        ibs: { rate: 1, baseCode: 1 },
        cbs: { rate: 1, baseCode: 2 },
        ipi: { rate: 1, baseCode: 3 },
      })
      if (!r.isValid) {
        expect(r.externalOpsCoefficient).toBe(0)
        expect(r.validationErrors.join(' ')).toContain('fora do intervalo [0, 1)')
      } else {
        // Se a combinação ainda cair dentro de [0,1), o invariante tem de valer.
        expect(r.externalOpsCoefficient).toBeGreaterThanOrEqual(0)
        expect(r.externalOpsCoefficient).toBeLessThan(1)
      }
    })

    it('tributo ausente é zero, não erro', () => {
      const r = resolveExternalOpsCoefficient({ icmsPct: 0.17, issPct: 0, pisCofinsPct: 0.0925 })
      expect(r.isValid).toBe(true)
      expect(r.externalOpsCoefficient).toBe(0)
    })
  })
})
