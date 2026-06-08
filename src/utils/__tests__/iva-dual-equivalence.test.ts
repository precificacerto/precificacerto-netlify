/**
 * Tests — Equivalência do núcleo único IVA Dual (EPIC-POR-FORA-V2 P0-1 / ADR-017).
 *
 * Garante que `computeIvaDualFromBase` (núcleo) e `computeIvaDualOutside` (wrapper por alíquotas)
 * produzem exatamente os mesmos tributos por fora — travando a divergência helper × motor que
 * existia quando a matemática era reimplementada inline em absorption.ts.
 */

import { computeIvaDualOutside, computeIvaDualFromBase } from '../iva-dual-outside'

const round = (v: number) => Math.round(v * 100) / 100

describe('Equivalência núcleo × wrapper IVA Dual', () => {
  const cases = [
    { opInterna: 143669.8021, icmsPct: 17, isPct: 5, ibsPct: 0.1, cbsPct: 0.9, ipiPct: 0, despAcessorias: 1000 },
    { opInterna: 98403.56, icmsPct: 17, isPct: 0, ibsPct: 1, cbsPct: 8.8, ipiPct: 5, despAcessorias: 1200, icmsComplApplies: true },
    { opInterna: 2000, icmsPct: 0, issPct: 5, pisCofinsPct: 9.25, isPct: 3, ibsPct: 1, cbsPct: 8.8, ipiPct: 2, despAcessorias: 500 },
    { opInterna: 50000, icmsPct: 12, isPct: 0, ibsPct: 0.1, cbsPct: 0.9, ipiPct: 0 },
  ]

  cases.forEach((c, i) => {
    it(`caso ${i + 1}: wrapper == núcleo (mesmas bases já apuradas)`, () => {
      const w = computeIvaDualOutside(c)
      // Reproduz a entrada por valores que o motor usaria: baseIVA e ipiBase já apurados.
      const op = c.opInterna
      const baseIVA = Math.max(0, op - op * ((c.icmsPct || 0) / 100) - op * ((c.issPct || 0) / 100) - op * ((c.pisCofinsPct || 0) / 100))
      const core = computeIvaDualFromBase({
        baseIVA,
        ipiBase: op + (c.despAcessorias || 0),
        despAcessorias: c.despAcessorias,
        isPct: c.isPct,
        ibsPct: c.ibsPct,
        cbsPct: c.cbsPct,
        ipiPct: c.ipiPct,
        icmsPct: c.icmsPct,
        icmsComplApplies: c.icmsComplApplies,
      })
      expect(round(core.isValue)).toBe(round(w.isValue))
      expect(round(core.ibsValue)).toBe(round(w.ibsValue))
      expect(round(core.cbsValue)).toBe(round(w.cbsValue))
      expect(round(core.ipiValue)).toBe(round(w.ipiValue))
      expect(round(core.icmsComplValue)).toBe(round(w.icmsComplValue))
      expect(round(core.totalOutside)).toBe(round(w.totalOutside))
      expect(round(core.baseIS)).toBe(round(w.baseIS))
      expect(round(core.baseIbsCbs)).toBe(round(w.baseIbsCbs))
    })
  })
})
