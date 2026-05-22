/**
 * Contract tests para mrm-rates-loader — Story MRM-V5-002 AC4-AC7.
 *
 * Valida invariante PIS/COFINS dupla perspectiva (construção 7,6775% × apuração 9,25%)
 * conforme ADR-008.
 */

import {
  validatePisCofinsIdentity,
  validatePisCofinsInvariant,
} from '../mrm-rates-loader'
import { MrmInvariantError, type TaxRatePeriod, type TaxRegime } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], pct: number): TaxRatePeriod {
  return {
    id: `${tax_type}-${pct}`,
    tenant_id: 'tnt-1',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct: pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: null,
  }
}

describe('mrm-rates-loader — validatePisCofinsInvariant (Story MRM-V5-002 AC4)', () => {
  describe('Caso 1: Construção válida 7,6775% (LR não-cumulativo)', () => {
    it('Aceita PIS+COFINS construção = 7,6775% para regime LR', () => {
      const rates = [rate('PIS', 0.0165), rate('COFINS', 0.0610775)] // soma = 0.0775775
      // Wait: precisamos da construção, ajusto valores
      const ratesConstrucao = [rate('PIS', 0.0135), rate('COFINS', 0.054275)] // 1,35% + 5,4275% = 6,7775%? Não, queremos 7,6775%
      // Construção LR (PIS_construcao + COFINS_construcao) deve somar 7,6775%
      // Cenário canônico Excel: 7,6775% total agregado (sem decomposição PIS/COFINS no excel)
      // Para teste, usamos PIS=1,49% + COFINS=6,1875% (apenas ilustrativo, soma = 7,6775%)
      const ratesValid = [rate('PIS', 0.0149), rate('COFINS', 0.061875)] // soma exata 0,076775

      expect(() =>
        validatePisCofinsInvariant(ratesValid, 'CONSTRUCAO', 'LUCRO_REAL'),
      ).not.toThrow()
    })
  })

  describe('Caso 2: Apuração válida 9,25% (LR não-cumulativo)', () => {
    it('Aceita PIS+COFINS apuração = 9,25% para regime LR (1,65% + 7,6%)', () => {
      const rates = [rate('PIS', 0.0165), rate('COFINS', 0.076)] // = 9,25%
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_REAL'),
      ).not.toThrow()
    })

    it('Aceita PIS+COFINS apuração ≈ 9,25% dentro tolerância (1e-4)', () => {
      const rates = [rate('PIS', 0.0165), rate('COFINS', 0.07605)] // 9,255%
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_REAL'),
      ).not.toThrow()
    })
  })

  describe('Caso 3: Equivalência matemática ICMS=17% (9,25% × 0,83 = 7,6775%)', () => {
    it('Identidade STF se mantém para regime LR com ICMS=17%', () => {
      const pisCofinsApuracao = 0.0925
      const icmsRate = 0.17
      const pisCofinsConstrucao = 0.076775 // = 0.0925 × 0.83
      expect(() =>
        validatePisCofinsIdentity(pisCofinsApuracao, pisCofinsConstrucao, icmsRate),
      ).not.toThrow()
    })

    it('Identidade NÃO se mantém para ICMS=18% (não-equivalência intencional)', () => {
      const pisCofinsApuracao = 0.0925
      const icmsRate = 0.18
      const pisCofinsConstrucaoErrado = 0.076775 // construção SP para ICMS=17%, MAS ICMS=18%
      // Expected = 0.0925 × 0.82 = 0.07585; actual = 0.076775; diff = 0.000925 (acima tolerância 1e-4)
      expect(() =>
        validatePisCofinsIdentity(
          pisCofinsApuracao,
          pisCofinsConstrucaoErrado,
          icmsRate,
        ),
      ).toThrow(MrmInvariantError)
    })
  })

  describe('Caso 4: Apuração inválida 5% (fora da faixa LR)', () => {
    it('Rejeita PIS+COFINS = 5% para regime LR com MrmInvariantError', () => {
      const rates = [rate('PIS', 0.01), rate('COFINS', 0.04)] // = 5%
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_REAL'),
      ).toThrow(MrmInvariantError)
    })

    it('Erro contém código PIS_COFINS_OUT_OF_RANGE', () => {
      const rates = [rate('PIS', 0.01), rate('COFINS', 0.04)]
      try {
        validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_REAL')
        fail('Expected MrmInvariantError')
      } catch (err) {
        expect(err).toBeInstanceOf(MrmInvariantError)
        const error = err as MrmInvariantError
        expect(error.code).toBe('PIS_COFINS_OUT_OF_RANGE')
        expect(error.perspective).toBe('APURACAO')
        expect(error.actual).toBeCloseTo(0.05, 4)
      }
    })
  })

  describe('Caso 5: Apuração inválida 12% (fora da faixa LR)', () => {
    it('Rejeita PIS+COFINS = 12% para regime LR (muito acima)', () => {
      const rates = [rate('PIS', 0.02), rate('COFINS', 0.10)] // = 12%
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_REAL'),
      ).toThrow(MrmInvariantError)
    })
  })

  describe('Caso 6: ICMS variando (17%, 18%, 12%, 0%)', () => {
    it('ICMS=17%: identidade exata 9,25% × 0,83 = 7,6775%', () => {
      expect(() =>
        validatePisCofinsIdentity(0.0925, 0.076775, 0.17),
      ).not.toThrow()
    })

    it('ICMS=18%: identidade exata 9,25% × 0,82 = 7,585%', () => {
      expect(() =>
        validatePisCofinsIdentity(0.0925, 0.07585, 0.18),
      ).not.toThrow()
    })

    it('ICMS=12%: identidade exata 9,25% × 0,88 = 8,14%', () => {
      expect(() =>
        validatePisCofinsIdentity(0.0925, 0.0814, 0.12),
      ).not.toThrow()
    })

    it('ICMS=0% (ZFM): construção = apuração (sem redução)', () => {
      expect(() =>
        validatePisCofinsIdentity(0.0925, 0.0925, 0),
      ).not.toThrow()
    })
  })

  describe('Edge cases', () => {
    it('Regime SN: sem invariante (DAS absorve PIS/COFINS)', () => {
      const rates = [rate('PIS', 0.0165), rate('COFINS', 0.076)]
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'SIMPLES_NACIONAL'),
      ).not.toThrow()
    })

    it('Regime MEI: sem invariante (DAS absorve PIS/COFINS)', () => {
      const rates = [rate('PIS', 999), rate('COFINS', 999)] // valores absurdos
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'MEI'),
      ).not.toThrow()
    })

    it('PIS=0 e COFINS=0: sem invariante a validar (não-tributado)', () => {
      const rates: TaxRatePeriod[] = []
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_REAL'),
      ).not.toThrow()
    })

    it('LP cumulativo: aceita apuração 3,65% (PIS 0,65% + COFINS 3%)', () => {
      const rates = [rate('PIS', 0.0065), rate('COFINS', 0.03)] // = 3,65%
      expect(() =>
        validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_PRESUMIDO'),
      ).not.toThrow()
    })
  })
})

describe('mrm-rates-loader — MrmInvariantError contém metadados estruturados', () => {
  it('Erro PIS_COFINS_OUT_OF_RANGE inclui actual + expected + perspective', () => {
    const rates = [rate('PIS', 0.05), rate('COFINS', 0.05)] // = 10%
    try {
      validatePisCofinsInvariant(rates, 'APURACAO', 'LUCRO_REAL')
      fail('Expected MrmInvariantError')
    } catch (err) {
      const error = err as MrmInvariantError
      expect(error.code).toBe('PIS_COFINS_OUT_OF_RANGE')
      expect(error.actual).toBeCloseTo(0.10, 4)
      expect(error.expected).toContain('apuracao')
      expect(error.expected).toContain('LUCRO_REAL')
      expect(error.perspective).toBe('APURACAO')
      expect(error.name).toBe('MrmInvariantError')
    }
  })

  it('Erro PIS_COFINS_IDENTITY_VIOLATION inclui referência matemática', () => {
    try {
      validatePisCofinsIdentity(0.0925, 0.05, 0.17) // construção errada
      fail('Expected MrmInvariantError')
    } catch (err) {
      const error = err as MrmInvariantError
      expect(error.code).toBe('PIS_COFINS_IDENTITY_VIOLATION')
      expect(error.expected).toContain('17.00%')
      expect(error.perspective).toBeNull()
    }
  })
})
