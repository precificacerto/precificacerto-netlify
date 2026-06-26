/**
 * BUG-CARDS-RRO-001 — Cards de Distribuição são displays da Etapa 16 (Regra Inviolável).
 *
 * Garante que, quando o motor RRO fornece os valores da Etapa 16 (snapshot `tax_breakdown`
 * ou runtime `motor_new_*`), Comissão e Lucro são LIDOS desses valores — NUNCA recalculados
 * por proporção simples (display-first), mesmo com desconto aplicado.
 *
 * O fallback display-first (proporção sobre o cadastro) só atua para itens SEM fonte do motor.
 */

import {
  computeResidualDistribution,
  validateResidualVsCascade,
  type ResidualItemInput,
} from '../residual-distribution'

const TENANT_RATES = { irpj: 0.018, csll: 0.0108 }

describe('BUG-CARDS-RRO-001 — motor (Etapa 16) tem prioridade sobre display-first', () => {
  it('com desconto + motor_new_* presente → usa Etapa 16, NÃO proporção simples', () => {
    // Display-first calcularia: comissão = 1000×5% = 50, menos redução proporcional.
    // O motor (Etapa 16) apurou valores comprimidos pelo RRO: 30 / 60. Estes devem prevalecer.
    const items: ResidualItemInput[] = [
      {
        unit_price: 1000,
        quantity: 1,
        commission_percent: 5,
        profit_percent: 10,
        tax_breakdown: null,
        motor_new_commission: 30,
        motor_new_profit: 60,
        motor_new_csll: 6,
        motor_new_irpj: 10,
      },
    ]
    const dist = computeResidualDistribution(
      items, 1000, 900, 'LUCRO_PRESUMIDO', TENANT_RATES, 10, 'PROPORTIONAL',
    )
    expect(dist.commission.amount).toBe(30)
    expect(dist.profit.amount).toBe(60)
    // IRPJ/CSLL também vêm da Etapa 16 (não tenantRate × totalNet)
    expect(dist.irpj.amount).toBe(10)
    expect(dist.csll.amount).toBe(6)
  })

  it('com desconto + snapshot tax_breakdown → usa Etapa 16 persistida', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 1000,
        quantity: 1,
        commission_percent: 5,
        profit_percent: 10,
        tax_breakdown: {
          // só os campos lidos por extractItemValues importam aqui
          new_commission: 28.5,
          new_profit: 57.2,
          new_csll: 5,
          new_irpj: 8,
        } as any,
      },
    ]
    const dist = computeResidualDistribution(
      items, 1000, 900, 'LUCRO_PRESUMIDO', TENANT_RATES, 10, 'PROPORTIONAL',
    )
    expect(dist.commission.amount).toBeCloseTo(28.5, 2)
    expect(dist.profit.amount).toBeCloseTo(57.2, 2)
  })

  it('effectivePct é derivado do valor da Etapa 16 sobre Vₗ', () => {
    const items: ResidualItemInput[] = [
      {
        unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10,
        tax_breakdown: null, motor_new_commission: 30, motor_new_profit: 60,
      },
    ]
    const dist = computeResidualDistribution(
      items, 1000, 900, 'LUCRO_PRESUMIDO', TENANT_RATES, 10, 'PROPORTIONAL',
    )
    expect(dist.commission.effectivePct).toBeCloseTo((30 / 900) * 100, 4)
    expect(dist.profit.effectivePct).toBeCloseTo((60 / 900) * 100, 4)
  })

  it('multi-produto COM motor: soma as Etapas 16 dos itens', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10, tax_breakdown: null, motor_new_commission: 30, motor_new_profit: 60, motor_new_csll: 6, motor_new_irpj: 10 },
      { unit_price: 2000, quantity: 1, commission_percent: 4, profit_percent: 8, tax_breakdown: null, motor_new_commission: 45, motor_new_profit: 90, motor_new_csll: 9, motor_new_irpj: 15 },
    ]
    const dist = computeResidualDistribution(items, 3000, 2700, 'LUCRO_PRESUMIDO', TENANT_RATES, 10, 'PROPORTIONAL')
    expect(dist.commission.amount).toBe(75)
    expect(dist.profit.amount).toBe(150)
    expect(dist.irpj.amount).toBe(25)
    expect(dist.csll.amount).toBe(15)
    expect(dist.requiresReview).toBe(false)
  })

  it('regime MEI/SN com motor presente: IRPJ/CSLL zerados por hidesProfitTaxes', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10, tax_breakdown: null, motor_new_commission: 30, motor_new_profit: 60, motor_new_csll: 6, motor_new_irpj: 10 },
    ]
    const dist = computeResidualDistribution(items, 1000, 900, 'SIMPLES_NACIONAL', TENANT_RATES, 10, 'PROPORTIONAL')
    expect(dist.hidesProfitTaxes).toBe(true)
    expect(dist.commission.amount).toBe(30)
    expect(dist.profit.amount).toBe(60)
    expect(dist.irpj.amount).toBe(0)
    expect(dist.csll.amount).toBe(0)
  })

  it('fonte MISTA (motor + sem motor) → requiresReview=true (Aria P1: denuncia perda de motor)', () => {
    const items: ResidualItemInput[] = [
      { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10, tax_breakdown: null, motor_new_commission: 30, motor_new_profit: 60 },
      { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10, tax_breakdown: null }, // sem motor → fallback
    ]
    const dist = computeResidualDistribution(items, 2000, 1800, 'LUCRO_PRESUMIDO', TENANT_RATES, 10, 'PROPORTIONAL')
    expect(dist.requiresReview).toBe(true)
  })

  it('fallback display-first permanece para itens SEM fonte do motor', () => {
    // Sem motor_new_* nem tax_breakdown → display-first (retrocompat ADR-010).
    const items: ResidualItemInput[] = [
      { unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 10, tax_breakdown: null },
    ]
    const dist = computeResidualDistribution(
      items, 1000, 900, 'LUCRO_PRESUMIDO', TENANT_RATES, 10, 'PROPORTIONAL',
    )
    // comissão original 50, margem 150, desconto abs 100 → redução comm = 100×(5/15)=33,33 → 16,67
    expect(dist.commission.amount).toBeCloseTo(16.67, 1)
    expect(dist.profit.amount).toBeCloseTo(33.33, 1)
    // IRPJ/CSLL no fallback puro = tenantRate × totalNet
    expect(dist.irpj.amount).toBeCloseTo(900 * 0.018, 2)
    expect(dist.csll.amount).toBeCloseTo(900 * 0.0108, 2)
  })
})

describe('validateResidualVsCascade (item 5.2 — não-bloqueante)', () => {
  const mkLine = (amount: number) => ({ amount, originalPct: 0, effectivePct: 0 })

  it('retorna null quando card === cascata (dentro da tolerância R$ 0,01)', () => {
    const r = validateResidualVsCascade(
      { commission: mkLine(4260.26), profit: mkLine(8799.22) },
      { commission: 4260.262, profit: 8799.218 },
    )
    expect(r).toBeNull()
  })

  it('detecta divergência inflada dos cards (cenário do documento)', () => {
    const r = validateResidualVsCascade(
      { commission: mkLine(4866.88), profit: mkLine(9815.03) },
      { commission: 4260.26, profit: 8799.22 },
    )
    expect(r).not.toBeNull()
    expect(r!).toHaveLength(2)
    expect(r!.find(i => i.field === 'comissao')!.diff).toBeCloseTo(606.62, 1)
    expect(r!.find(i => i.field === 'lucro')!.diff).toBeCloseTo(1015.81, 1)
  })
})
