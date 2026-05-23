/**
 * Tests — item-tax-rates helper (S11 do EPIC-RR-V2)
 */

import {
  mergeItemAndTenantRates,
  resolveItemCsllPct,
  resolveItemIrpjPct,
  type ItemTaxRates,
} from '../item-tax-rates'
import type { TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], pct: number): TaxRatePeriod {
  return {
    id: `tenant-${tax_type}-${pct}`,
    tenant_id: 'tnt-1',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct: pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: 'tenant default',
  }
}

describe('mergeItemAndTenantRates — precedência item > tenant', () => {
  it('Item sem alíquotas (null) → usa todas do tenant', () => {
    const tenantRates = [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)]
    const result = mergeItemAndTenantRates(null, tenantRates)
    expect(result).toHaveLength(3)
    expect(result.find(r => r.tax_type === 'ICMS')?.rate_pct).toBe(0.18)
  })

  it('Item com ICMS=0.04 override do tenant ICMS=0.18', () => {
    const itemRates: ItemTaxRates = { icms_pct: 0.04 }
    const tenantRates = [rate('ICMS', 0.18), rate('PIS', 0.0165)]
    const result = mergeItemAndTenantRates(itemRates, tenantRates)

    const icms = result.find(r => r.tax_type === 'ICMS')
    expect(icms?.rate_pct).toBe(0.04)
    expect(icms?.notes).toMatch(/override/)
    // PIS continua do tenant (não foi overridado)
    expect(result.find(r => r.tax_type === 'PIS')?.rate_pct).toBe(0.0165)
  })

  it('Item com ICMS=0 (isento explícito) também faz override e EXCLUI da apuração', () => {
    const itemRates: ItemTaxRates = { icms_pct: 0 }
    const tenantRates = [rate('ICMS', 0.18), rate('PIS', 0.0165)]
    const result = mergeItemAndTenantRates(itemRates, tenantRates)

    // ICMS isento → NÃO entra no array (motor ignora rate 0)
    expect(result.find(r => r.tax_type === 'ICMS')).toBeUndefined()
    // PIS permanece
    expect(result.find(r => r.tax_type === 'PIS')?.rate_pct).toBe(0.0165)
  })

  it('Item com TODAS alíquotas → 0 fallback do tenant (tenant ignorado)', () => {
    const itemRates: ItemTaxRates = {
      icms_pct: 0.04,
      pis_pct: 0.0165,
      cofins_pct: 0.076,
      iss_pct: 0,
    }
    const tenantRates = [
      rate('ICMS', 0.18),  // override
      rate('PIS', 0.0165), // override (mesmo valor, mas é override)
      rate('COFINS', 0.076),
      rate('ISS', 0.05),   // override por 0 (isento)
      rate('IPI', 0.10),   // NÃO no item → tenant fallback
    ]
    const result = mergeItemAndTenantRates(itemRates, tenantRates)

    expect(result.find(r => r.tax_type === 'ICMS')?.rate_pct).toBe(0.04)
    expect(result.find(r => r.tax_type === 'PIS')?.rate_pct).toBe(0.0165)
    expect(result.find(r => r.tax_type === 'ISS')).toBeUndefined() // override 0
    expect(result.find(r => r.tax_type === 'IPI')?.rate_pct).toBe(0.10) // fallback tenant
  })

  it('Cenário Produto A vs B — alíquotas diferentes coexistem em motores separados', () => {
    const produtoA: ItemTaxRates = { icms_pct: 0.04, pis_pct: 0.0165, cofins_pct: 0.076 }
    const produtoB: ItemTaxRates = { icms_pct: 0.12, pis_pct: 0.0065, cofins_pct: 0.03 }
    const tenantRates = [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)]

    const ratesA = mergeItemAndTenantRates(produtoA, tenantRates)
    const ratesB = mergeItemAndTenantRates(produtoB, tenantRates)

    expect(ratesA.find(r => r.tax_type === 'ICMS')?.rate_pct).toBe(0.04)
    expect(ratesB.find(r => r.tax_type === 'ICMS')?.rate_pct).toBe(0.12)
    expect(ratesA.find(r => r.tax_type === 'COFINS')?.rate_pct).toBe(0.076)
    expect(ratesB.find(r => r.tax_type === 'COFINS')?.rate_pct).toBe(0.03)
  })

  it('Bloco B — IPI/CBS/IBS/etc também respeitam override item', () => {
    const itemRates: ItemTaxRates = {
      ipi_pct: 0.05,
      ibs_pct: 0.085,
      cbs_pct: 0.025,
    }
    const tenantRates = [rate('IPI', 0.10), rate('IBS', 0), rate('CBS', 0)]
    const result = mergeItemAndTenantRates(itemRates, tenantRates)

    expect(result.find(r => r.tax_type === 'IPI')?.rate_pct).toBe(0.05)
    expect(result.find(r => r.tax_type === 'IBS')?.rate_pct).toBe(0.085)
    expect(result.find(r => r.tax_type === 'CBS')?.rate_pct).toBe(0.025)
  })
})

describe('resolveItemCsllPct / resolveItemIrpjPct', () => {
  it('CSLL item override (override decimal)', () => {
    expect(resolveItemCsllPct({ csll_pct: 0.0207 }, 0.0288)).toBe(0.0207)
  })

  it('CSLL fallback tenant quando item undefined/null', () => {
    expect(resolveItemCsllPct(null, 0.0288)).toBe(0.0288)
    expect(resolveItemCsllPct({}, 0.0288)).toBe(0.0288)
    expect(resolveItemCsllPct({ csll_pct: null }, 0.0288)).toBe(0.0288)
  })

  it('CSLL item=0 NÃO é override válido — fallback para tenant (FIX 2026-05-23)', () => {
    // Semântica corrigida: CSLL/IRPJ são impostos da EMPRESA sobre lucro residual,
    // não podem ser "isentos por produto". Zero no item é tratado como "sem override".
    // Bug original: produto novo com csll_pct=0 default zerava CSLL na distribuição.
    expect(resolveItemCsllPct({ csll_pct: 0 }, 0.0288)).toBe(0.0288)
  })

  it('IRPJ — mesmo comportamento (0 vira fallback tenant)', () => {
    expect(resolveItemIrpjPct({ irpj_pct: 0.0345 }, 0.048)).toBe(0.0345)
    expect(resolveItemIrpjPct(null, 0.048)).toBe(0.048)
    expect(resolveItemIrpjPct({ irpj_pct: 0 }, 0.048)).toBe(0.048)
  })
})
