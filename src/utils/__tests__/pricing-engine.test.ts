import { calculatePricing, computeLaborPctCompany, normalizeToMinutes, PricingInput } from '../pricing-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base input — no labor, simple percentages. */
function makeInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    calcType: 'INDUSTRIALIZACAO',
    totalItemsCost: 100,
    yieldQuantity: 1,
    laborCostMonthly: 0,
    numProductiveEmployees: 1,
    monthlyWorkloadMinutes: 100,
    productWorkloadMinutes: 0,
    structurePct: 0.22,
    taxPct: 0.10,
    commissionPct: 0.05,
    profitPct: 0.10,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// computeLaborPctCompany (unchanged — kept for compat)
// ---------------------------------------------------------------------------

describe('computeLaborPctCompany', () => {
  it('returns decimal for 150000, 12 employees, 22 days, 176 hours (≈3.22%)', () => {
    const pct = computeLaborPctCompany(150000, 12, 176, 22)
    expect(pct).toBeCloseTo(0.0323, 3)
    expect(pct * 100).toBeCloseTo(3.23, 1)
  })

  it('returns 0 when labor or employees or hours are 0', () => {
    expect(computeLaborPctCompany(0, 12, 176, 22)).toBe(0)
    expect(computeLaborPctCompany(150000, 0, 176, 22)).toBe(0)
    expect(computeLaborPctCompany(150000, 12, 0, 22)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 1. Caso canônico 1 — INDUSTRIALIZACAO (Simples Nacional 8%)
//    Valores validados pelo contador.
//    Nota: structurePct=0.1877 (MO indireta 2,22% + fixa 10,49% + var 6% + fin 0,06%)
// ---------------------------------------------------------------------------

describe('calculatePricing — canonical case 1: INDUSTRIALIZACAO', () => {
  it('includes productive labor in CMV and applies coefficient formula correctly', () => {
    // laborCostMonthly=250000, monthlyWorkloadMinutes=1, productWorkloadMinutes=1
    // → costPerMinute = 250000/1 = 250000
    // → productiveLaborCost = 1 × 250000 = 250000
    // → cmvUnit = 1370000 + 250000 = 1620000
    // → coefficient = 1 − (0.1877 + 0.08 + 0.06 + 0.12) = 0.5523
    // → priceUnit = 1620000 / 0.5523 ≈ 2933188
    const input: PricingInput = {
      calcType: 'INDUSTRIALIZACAO',
      totalItemsCost: 1370000,
      yieldQuantity: 1,
      laborCostMonthly: 250000,
      numProductiveEmployees: 1,
      monthlyWorkloadMinutes: 1,
      productWorkloadMinutes: 1,
      structurePct: 0.1877,
      taxPct: 0.08,
      commissionPct: 0.06,
      profitPct: 0.12,
    }
    const r = calculatePricing(input)

    expect(r.isValid).toBe(true)
    expect(r.productiveLaborCost).toBe(250000)
    expect(r.cmvUnit).toBe(1620000)
    expect(r.coefficient).toBeCloseTo(0.5523, 4)
    // tolerance ±1 (R$0,01 em centavos se unidade for centavos)
    expect(Math.abs(r.priceUnit - 2933188)).toBeLessThan(1)
  })

  it('laborValue equals productiveLaborCost for INDUSTRIALIZACAO', () => {
    const r = calculatePricing({
      calcType: 'INDUSTRIALIZACAO',
      totalItemsCost: 1370000,
      yieldQuantity: 1,
      laborCostMonthly: 250000,
      numProductiveEmployees: 1,
      monthlyWorkloadMinutes: 1,
      productWorkloadMinutes: 1,
      structurePct: 0.1877,
      taxPct: 0.08,
      commissionPct: 0.06,
      profitPct: 0.12,
    })
    expect(r.laborValue).toBe(r.productiveLaborCost)
    expect(r.laborValue).toBe(250000)
  })
})

// ---------------------------------------------------------------------------
// 2. Caso canônico 2 — REVENDA (Simples Nacional 8%)
//    Sem MO produtiva no CMV; labor é zero.
// ---------------------------------------------------------------------------

describe('calculatePricing — canonical case 2: REVENDA', () => {
  it('excludes productive labor from CMV; laborValue is 0; coefficient formula applies', () => {
    // cmvUnit = 1370000 (sem labor)
    // coefficient = 1 − (0.1877 + 0.08 + 0.06 + 0.12) = 0.5523
    // priceUnit = 1370000 / 0.5523
    const input: PricingInput = {
      calcType: 'REVENDA',
      totalItemsCost: 1370000,
      yieldQuantity: 1,
      laborCostMonthly: 0,
      numProductiveEmployees: 1,
      monthlyWorkloadMinutes: 1,
      productWorkloadMinutes: 0,
      structurePct: 0.1877,
      taxPct: 0.08,
      commissionPct: 0.06,
      profitPct: 0.12,
    }
    const r = calculatePricing(input)

    expect(r.isValid).toBe(true)
    expect(r.cmvUnit).toBe(1370000)
    expect(r.laborValue).toBe(0)
    expect(r.coefficient).toBeCloseTo(0.5523, 4)
    expect(r.priceUnit).toBeGreaterThan(r.cmvUnit)
    // priceUnit = 1370000 / 0.5523 ≈ 2480536
    expect(r.priceUnit).toBeCloseTo(1370000 / 0.5523, 0)
  })
})

// ---------------------------------------------------------------------------
// 3. Caso canônico 3 — Coeficiente inválido
// ---------------------------------------------------------------------------

describe('calculatePricing — invalid coefficient', () => {
  it('returns isValid=false when sum of percentages >= 100% (coefficient <= 0)', () => {
    const input = makeInput({
      taxPct: 0.50,
      commissionPct: 0.30,
      profitPct: 0.30,
      structurePct: 0.10,
      // sum = 1.20 → coefficient = -0.20
    })
    const r = calculatePricing(input)

    expect(r.isValid).toBe(false)
    expect(r.validationErrors.some(e => e.includes('Coeficiente <= 0'))).toBe(true)
  })

  it('returns isValid=false when sum exactly equals 100% (coefficient = 0)', () => {
    const input = makeInput({
      structurePct: 0.25,
      taxPct: 0.25,
      commissionPct: 0.25,
      profitPct: 0.25,
      // sum = 1.00 → coefficient = 0.00
    })
    const r = calculatePricing(input)
    expect(r.isValid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Fórmula — priceUnit = cmvUnit / coefficient (verificação limpa)
// ---------------------------------------------------------------------------

describe('calculatePricing — coefficient formula correctness', () => {
  it('priceUnit = cmvUnit / coefficient with round numbers', () => {
    // coefficient = 1 − (0.20 + 0.08 + 0.06 + 0.12) = 0.54
    // priceUnit = 540 / 0.54 = 1000 (exato)
    const r = calculatePricing(makeInput({
      totalItemsCost: 540,
      structurePct: 0.20,
      taxPct: 0.08,
      commissionPct: 0.06,
      profitPct: 0.12,
    }))

    expect(r.isValid).toBe(true)
    expect(r.coefficient).toBeCloseTo(0.54, 4)
    expect(r.priceUnit).toBeCloseTo(1000, 0)
  })

  it('breakdown values sum to priceUnit (DRE integrity)', () => {
    // cmvUnit + structureValue + taxValue + commissionValue + profitValue = priceUnit
    const r = calculatePricing(makeInput({
      totalItemsCost: 540,
      structurePct: 0.20,
      taxPct: 0.08,
      commissionPct: 0.06,
      profitPct: 0.12,
    }))

    const total = r.cmvUnit + r.structureValue + r.taxValue + r.commissionValue + r.profitValue
    expect(Math.abs(total - r.priceUnit)).toBeLessThan(0.1)
  })

  it('coefficient increases when tax is lower (lower tax → higher coefficient → lower price)', () => {
    const highTax = calculatePricing(makeInput({ taxPct: 0.20 }))
    const lowTax  = calculatePricing(makeInput({ taxPct: 0.05 }))
    expect(lowTax.coefficient).toBeGreaterThan(highTax.coefficient)
    expect(lowTax.priceUnit).toBeLessThan(highTax.priceUnit)
  })
})

// ---------------------------------------------------------------------------
// 5. Yield division
// ---------------------------------------------------------------------------

describe('calculatePricing — yield division', () => {
  it('divides totalItemsCost by yieldQuantity for cmvUnit; priceTotal = priceUnit × yield', () => {
    const r = calculatePricing(makeInput({ totalItemsCost: 100, yieldQuantity: 10 }))

    expect(r.isValid).toBe(true)
    expect(r.cmvUnit).toBe(10)
    expect(r.cmvTotal).toBe(100)
    expect(Math.abs(r.priceTotal - r.priceUnit * 10)).toBeLessThan(0.1)
  })

  it('returns isValid=false when yieldQuantity < 1', () => {
    const r = calculatePricing(makeInput({ yieldQuantity: 0 }))
    expect(r.isValid).toBe(false)
    expect(r.validationErrors[0]).toContain('yieldQuantity')
  })
})

// ---------------------------------------------------------------------------
// 6. REVENDA — MO produtiva fora do CMV
// ---------------------------------------------------------------------------

describe('calculatePricing — REVENDA labor handling', () => {
  it('cmvUnit does not include productive labor; laborValue is always 0', () => {
    // productiveLaborCost = 10 × (10000/100) = 1000 — mas NÃO entra no CMV
    const r = calculatePricing(makeInput({
      calcType: 'REVENDA',
      totalItemsCost: 200,
      laborCostMonthly: 10000,
      monthlyWorkloadMinutes: 100,
      productWorkloadMinutes: 10,
      structurePct: 0.30,
    }))

    expect(r.isValid).toBe(true)
    expect(r.cmvUnit).toBe(200)
    expect(r.laborValue).toBe(0)
    expect(r.productiveLaborCost).toBe(1000) // calculado mas não entra no CMV
    expect(r.priceUnit).toBeGreaterThan(200)
  })
})

// ---------------------------------------------------------------------------
// 7. SERVICO — MO produtiva entra no CMV
// ---------------------------------------------------------------------------

describe('calculatePricing — SERVICO labor in CMV', () => {
  it('includes productive labor in cmvUnit; laborValue equals productiveLaborCost', () => {
    // costPerMinute = 6000 / 3000 = 2
    // productiveLaborCost = 30 × 2 = 60
    // cmvUnit = 0 + 60 = 60
    // coefficient = 1 − (0.20 + 0.08 + 0.05 + 0.10) = 0.57
    // priceUnit = round2(60 / 0.57) ≈ 105.26
    const r = calculatePricing(makeInput({
      calcType: 'SERVICO',
      totalItemsCost: 0,
      laborCostMonthly: 6000,
      monthlyWorkloadMinutes: 3000,
      productWorkloadMinutes: 30,
      structurePct: 0.20,
      taxPct: 0.08,
      commissionPct: 0.05,
      profitPct: 0.10,
    }))

    expect(r.isValid).toBe(true)
    expect(r.productiveLaborCost).toBe(60)
    expect(r.cmvUnit).toBe(60)
    expect(r.laborValue).toBe(60)
    expect(r.coefficient).toBeCloseTo(0.57, 4)
    expect(r.priceUnit).toBeCloseTo(105.26, 1)
  })

  it('zero labor and zero items → priceUnit is 0', () => {
    const r = calculatePricing(makeInput({
      calcType: 'SERVICO',
      totalItemsCost: 0,
      laborCostMonthly: 0,
      monthlyWorkloadMinutes: 100,
      productWorkloadMinutes: 0,
    }))

    expect(r.isValid).toBe(true)
    expect(r.cmvUnit).toBe(0)
    expect(r.priceUnit).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

describe('calculatePricing — edge cases', () => {
  it('returns isValid=false when totalItemsCost is negative', () => {
    const r = calculatePricing(makeInput({ totalItemsCost: -1 }))
    expect(r.isValid).toBe(false)
    expect(r.validationErrors[0]).toContain('totalItemsCost')
  })

  it('laborPctShown is 0 when priceUnit is 0', () => {
    const r = calculatePricing(makeInput({
      totalItemsCost: 0,
      laborCostMonthly: 0,
      productWorkloadMinutes: 0,
    }))
    expect(r.laborPctShown).toBe(0)
  })

  it('laborPctShown reflects labor as fraction of priceUnit', () => {
    // priceUnit ≈ 105.26, productiveLaborCost = 60 → laborPctShown ≈ 0.5700
    const r = calculatePricing(makeInput({
      calcType: 'SERVICO',
      totalItemsCost: 0,
      laborCostMonthly: 6000,
      monthlyWorkloadMinutes: 3000,
      productWorkloadMinutes: 30,
      structurePct: 0.20,
      taxPct: 0.08,
      commissionPct: 0.05,
      profitPct: 0.10,
    }))
    expect(r.laborPctShown).toBeCloseTo(60 / r.priceUnit, 4)
  })
})

// ---------------------------------------------------------------------------
// normalizeToMinutes (unchanged)
// ---------------------------------------------------------------------------

describe('normalizeToMinutes', () => {
  it('converts hours to minutes for non-service', () => {
    expect(normalizeToMinutes(8, 'HOURS', false)).toBe(480)
  })

  it('converts days to minutes for non-service (8h × 60)', () => {
    expect(normalizeToMinutes(22, 'DAYS', false)).toBe(22 * 480)
  })

  it('keeps raw value for service regardless of unit', () => {
    expect(normalizeToMinutes(8, 'HOURS', true)).toBe(8)
    expect(normalizeToMinutes(22, 'DAYS', true)).toBe(22)
  })

  it('passes minutes through unchanged', () => {
    expect(normalizeToMinutes(120, 'MINUTES', false)).toBe(120)
  })
})
