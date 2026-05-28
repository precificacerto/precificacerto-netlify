/**
 * Tests Breakeven Calculator (2026-05-28) — Onda 1 EPIC-MRM-V17.
 *
 * Cobre `breakeven-calculator.ts` (180 linhas, ZERO testes antes).
 *
 * Cenários:
 *   1. Cenário canônico PDF (`Relatorio_Ponto_Equilibrio_Precifica_Certo_Atualizado.pdf`)
 *      → PE esperado = R$ 308.968,15
 *   2. Guards: ROB ≤ 0, IMC ≤ 0, averageRevenue=0, fixed=0
 *   3. Simples Nacional → IPF=0 mesmo quando configurado
 *   4. Lucro Real/Presumido → IPF deduz da RB
 *   5. buildBreakevenInputFromConfig helper
 *   6. Invariantes matemáticas (PE = CFm / IMC)
 */

import { calculateBreakeven, buildBreakevenInputFromConfig, type BreakevenInput } from '../breakeven-calculator'

/**
 * Cenário PDF canônico (Relatório Ponto Equilíbrio Precifica Certo Atualizado):
 *
 *   CF = MOD + MOI + DF = 137.668,43 + 123.816,03 + 125.343,64 = 386.828,10
 *   CFm = CF/4 = 96.707,03 (4 meses contabilizados)
 *
 *   CV = CB + DV + DFIN + IMP + COM
 *     CB = CL + IR = 562.453,73 + 116.812,17 = 679.265,90
 *     CBm  = 169.816,48
 *     DVm  = 18.030,06
 *     COMm = 7.601,36
 *     IMPm = 3.363,91
 *     DFINm= 1.280,76
 *   CVm = 200.092,57
 *
 *   RLm = 1.165.030,51 / 4 = 291.257,63
 *   MC  = RLm − CVm = 91.165,06
 *   IMC = MC / RLm = 31,30%
 *   PE  = CFm / IMC = 308.968,15
 *
 * Convertendo absolutos → percentuais sobre averageRevenue (RLm = 291.257,63):
 *   productCostPct       (CB%)  = 169.816,48 / 291.257,63 ≈ 58,3050%
 *   variableExpensePct   (DV%)  =  18.030,06 / 291.257,63 ≈  6,1903%
 *   commissionPct        (COM%) =   7.601,36 / 291.257,63 ≈  2,6098%
 *   taxesInsidePct       (IPD%) =   3.363,91 / 291.257,63 ≈  1,1550%
 *   financialExpensePct  (DFIN%)=   1.280,76 / 291.257,63 ≈  0,4397%
 *   productionLaborPct   (MOD%) =  34.417,11 / 291.257,63 ≈ 11,8166%
 *   adminLaborPct        (MOI%) =  30.954,01 / 291.257,63 ≈ 10,6275%
 *   fixedExpensePct      (DF%)  =  31.335,91 / 291.257,63 ≈ 10,7587%
 */
const pdfCanonicalInput: BreakevenInput = {
  // Variáveis
  productCostPct: 58.3050,
  variableExpensePct: 6.1903,
  commissionPct: 2.6098,
  taxesInsidePct: 1.1550,
  financialExpensePct: 0.4397,
  outsourcedActivitiesPct: 0,
  // Deduções receita
  externalTaxesPct: 0,
  deducaoReceitaPct: 0,
  // Fixos
  productionLaborPct: 11.8166,
  adminLaborPct: 10.6275,
  fixedExpensePct: 10.7587,
  // RB mensal (= RLm no PDF, pois IPF=DED=0)
  averageRevenue: 291257.63,
  taxRegime: 'LUCRO_REAL',
}

describe('Breakeven Calculator', () => {
  describe('Cenário canônico PDF — PE = R$ 308.968,15', () => {
    it('reproduz PE oficial dentro de tolerância R$ 50 (arredondamento pcts 4 casas)', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      expect(result.isValid).toBe(true)
      expect(result.breakeven).not.toBeNull()
      // PDF esperado: 308.968,15 — tolerância R$ 50 por arredondamento dos pcts a 4 casas
      expect(result.breakeven!).toBeCloseTo(308968.15, -2)
      // Sanity: tem que estar na faixa R$ 308k
      expect(result.breakeven!).toBeGreaterThan(308000)
      expect(result.breakeven!).toBeLessThan(310000)
    })

    it('IMC ≈ 31,30% (margem de contribuição PDF)', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      // PDF: IMC = 91.165,06 / 291.257,63 = 31,30%
      expect(result.marginOfContribution).toBeCloseTo(0.313, 3)
    })

    it('CFm ≈ R$ 96.707,03 (estrutura fixa mensal, tolerância R$ 5)', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      // PDF: CFm = 96.707,03 — tolerância R$ 5 por arredondamento
      expect(result.fixedCostMonthly).toBeCloseTo(96707.03, -1)
    })

    it('CVm total ≈ 68,69% (soma variáveis sobre RB)', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      // 58,3050 + 6,1903 + 2,6098 + 1,1550 + 0,4397 = 68,6998
      expect(result.totalVariablePct).toBeCloseTo(68.6998, 3)
    })

    it('ROB = RB quando IPF=0 e DED=0', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      expect(result.rob).toBeCloseTo(291257.63, 2)
    })

    it('Invariante: PE = CFm / IMC', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      expect(result.breakeven!).toBeCloseTo(
        result.fixedCostMonthly / result.marginOfContribution, 1,
      )
    })
  })

  describe('Guards — entradas inválidas', () => {
    it('averageRevenue = 0 → isValid=false', () => {
      const result = calculateBreakeven({ ...pdfCanonicalInput, averageRevenue: 0 })
      expect(result.isValid).toBe(false)
      expect(result.breakeven).toBeNull()
      expect(result.reason).toContain('Faturamento médio')
    })

    it('ROB ≤ 0 (IPF + DED ≥ 100%) → isValid=false', () => {
      const result = calculateBreakeven({
        ...pdfCanonicalInput,
        externalTaxesPct: 60,
        deducaoReceitaPct: 50, // 60 + 50 = 110% > 100%
      })
      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Receita operacional inválida')
    })

    it('IMC ≤ 0 (variáveis ≥ ROB) → isValid=false', () => {
      const result = calculateBreakeven({
        ...pdfCanonicalInput,
        productCostPct: 80,
        variableExpensePct: 30, // 80 + 30 = 110% variável → MC negativa
      })
      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('margem de contribuição')
    })

    it('Fixos totais = 0 → isValid=false (sem PE operacional)', () => {
      const result = calculateBreakeven({
        ...pdfCanonicalInput,
        productionLaborPct: 0,
        adminLaborPct: 0,
        fixedExpensePct: 0,
      })
      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Custos fixos zerados')
    })
  })

  describe('Regime Simples Nacional — IPF=0 forçado', () => {
    it('externalTaxesPct é ignorado quando taxRegime=SIMPLES_NACIONAL', () => {
      const result = calculateBreakeven({
        ...pdfCanonicalInput,
        externalTaxesPct: 15, // configurado mas deve ser ignorado
        taxRegime: 'SIMPLES_NACIONAL',
      })
      // ROB deve ser igual a averageRevenue (IPF zerado)
      expect(result.rob).toBeCloseTo(pdfCanonicalInput.averageRevenue, 2)
    })

    it('Lucro Real → externalTaxesPct deduz da RB', () => {
      const input = {
        ...pdfCanonicalInput,
        externalTaxesPct: 15,
        taxRegime: 'LUCRO_REAL',
      }
      const result = calculateBreakeven(input)
      // ROB = RB × (1 − 0,15) = 0,85 × averageRevenue
      expect(result.rob).toBeCloseTo(input.averageRevenue * 0.85, 1)
    })

    it('Dedução receita também subtrai (devoluções/estornos)', () => {
      const input = {
        ...pdfCanonicalInput,
        deducaoReceitaPct: 5,
        taxRegime: 'LUCRO_PRESUMIDO',
      }
      const result = calculateBreakeven(input)
      // ROB = RB × (1 − 0,05) = 0,95 × averageRevenue
      expect(result.rob).toBeCloseTo(input.averageRevenue * 0.95, 1)
    })
  })

  describe('Helper buildBreakevenInputFromConfig', () => {
    it('mapeia tenant_expense_config → BreakevenInput', () => {
      const cfg = {
        product_cost_percent: 50,
        variable_expense_percent: 10,
        commission_percent_hub: 5,
        tax_on_revenue_percent: 8,
        financial_expense_percent: 2,
        outsourced_activities_percent: 3,
        external_taxes_percent: 4,
        deducao_receita_percent: 1,
        production_labor_percent: 12,
        indirect_labor_percent: 8,
        fixed_expense_percent: 6,
        hub_average_revenue: 500000,
      }
      const input = buildBreakevenInputFromConfig(cfg, 'LUCRO_REAL')
      expect(input.productCostPct).toBe(50)
      expect(input.commissionPct).toBe(5)
      expect(input.taxesInsidePct).toBe(8)
      expect(input.outsourcedActivitiesPct).toBe(3)
      expect(input.externalTaxesPct).toBe(4)
      expect(input.adminLaborPct).toBe(8)
      expect(input.averageRevenue).toBe(500000)
      expect(input.taxRegime).toBe('LUCRO_REAL')
    })

    it('aceita cfg null/undefined sem quebrar', () => {
      const input = buildBreakevenInputFromConfig(null)
      expect(input.productCostPct).toBe(0)
      expect(input.averageRevenue).toBe(0)
      expect(input.taxRegime).toBeNull()
    })

    it('converte strings numéricas via Number()', () => {
      const cfg = { product_cost_percent: '45.5', hub_average_revenue: '100000' }
      const input = buildBreakevenInputFromConfig(cfg)
      expect(input.productCostPct).toBe(45.5)
      expect(input.averageRevenue).toBe(100000)
    })
  })

  describe('Invariantes matemáticas', () => {
    it('Se variáveis sobem (e nada mais muda), PE sobe', () => {
      const base = calculateBreakeven(pdfCanonicalInput)
      const higher = calculateBreakeven({
        ...pdfCanonicalInput,
        productCostPct: pdfCanonicalInput.productCostPct + 5,
      })
      expect(higher.breakeven!).toBeGreaterThan(base.breakeven!)
    })

    it('Se fixos sobem, PE sobe proporcional', () => {
      const base = calculateBreakeven(pdfCanonicalInput)
      const higher = calculateBreakeven({
        ...pdfCanonicalInput,
        fixedExpensePct: pdfCanonicalInput.fixedExpensePct + 5,
      })
      expect(higher.breakeven!).toBeGreaterThan(base.breakeven!)
    })

    it('Se RB dobra (e pcts mantidos), PE dobra', () => {
      const base = calculateBreakeven(pdfCanonicalInput)
      const doubled = calculateBreakeven({
        ...pdfCanonicalInput,
        averageRevenue: pdfCanonicalInput.averageRevenue * 2,
      })
      expect(doubled.breakeven!).toBeCloseTo(base.breakeven! * 2, 0)
    })

    it('Output values são finitos quando isValid=true', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      expect(Number.isFinite(result.breakeven!)).toBe(true)
      expect(Number.isFinite(result.marginOfContribution)).toBe(true)
      expect(Number.isFinite(result.fixedCostMonthly)).toBe(true)
      expect(Number.isFinite(result.rob)).toBe(true)
    })

    it('breakeven é arredondado para 2 casas decimais', () => {
      const result = calculateBreakeven(pdfCanonicalInput)
      const cents = Math.round(result.breakeven! * 100)
      expect(result.breakeven!).toBe(cents / 100)
    })
  })

  describe('Cenários de produção realistas', () => {
    it('Empresa pequena (RB R$ 50k/mês) — PE proporcional', () => {
      const input: BreakevenInput = {
        productCostPct: 40,
        variableExpensePct: 5,
        commissionPct: 3,
        taxesInsidePct: 6,
        financialExpensePct: 1,
        outsourcedActivitiesPct: 0,
        externalTaxesPct: 0,
        deducaoReceitaPct: 0,
        productionLaborPct: 8,
        adminLaborPct: 10,
        fixedExpensePct: 12,
        averageRevenue: 50000,
        taxRegime: 'SIMPLES_NACIONAL',
      }
      const result = calculateBreakeven(input)
      expect(result.isValid).toBe(true)
      // PE manual: CFm = 30% × 50k = 15.000; MC% = 1 - 55% = 45%; PE = 15.000/0,45 = 33.333,33
      expect(result.breakeven!).toBeCloseTo(33333.33, 0)
    })

    it('Empresa multi-produto com margens variadas', () => {
      const input: BreakevenInput = {
        productCostPct: 55,
        variableExpensePct: 8,
        commissionPct: 4,
        taxesInsidePct: 3,
        financialExpensePct: 1,
        outsourcedActivitiesPct: 2,
        externalTaxesPct: 5,
        deducaoReceitaPct: 1,
        productionLaborPct: 9,
        adminLaborPct: 7,
        fixedExpensePct: 8,
        averageRevenue: 250000,
        taxRegime: 'LUCRO_PRESUMIDO',
      }
      const result = calculateBreakeven(input)
      expect(result.isValid).toBe(true)
      expect(result.breakeven).not.toBeNull()
      // Sanity check: PE deve ser > averageRevenue * fixed%
      const minPE = (24 / 100) * 250000 // fixed% × RB
      expect(result.breakeven!).toBeGreaterThan(minPE)
    })
  })
})
