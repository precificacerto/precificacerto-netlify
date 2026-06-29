/**
 * Tests — item-tax-rates helper (S11 do EPIC-RR-V2)
 */

import {
  mergeItemAndTenantRates,
  resolveItemCsllPct,
  resolveItemIrpjPct,
  buildItemTaxRatesFromProduct,
  resolveIvaDualEffectiveRate,
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
    // IBS/CBS são gravados SEMPRE em percentual (FIX 2026-06-10): 8.5 = 8,5% → 0.085.
    // IPI mantém a convenção dual (0.05 já é decimal = 5%).
    const itemRates: ItemTaxRates = {
      ipi_pct: 0.05,
      ibs_pct: 8.5,
      cbs_pct: 2.5,
    }
    const tenantRates = [rate('IPI', 0.10), rate('IBS', 0), rate('CBS', 0)]
    const result = mergeItemAndTenantRates(itemRates, tenantRates)

    expect(result.find(r => r.tax_type === 'IPI')?.rate_pct).toBe(0.05)
    expect(result.find(r => r.tax_type === 'IBS')?.rate_pct).toBe(0.085)
    expect(result.find(r => r.tax_type === 'CBS')?.rate_pct).toBe(0.025)
  })

  it('IBS/CBS sub-1% (transição 2026) NÃO são inflados ×100 (FIX 2026-06-10)', () => {
    // Regressão da "cascata desencontrada": produto AAATeste0506 grava ibs_pct=0.1
    // (0,1%) e cbs_pct=0.9 (0,9%). A heurística antiga `raw<1?raw:raw/100` mantinha
    // 0.9 como 0.9 → motor ×100 → CBS = base × 90%. Agora IBS/CBS são SEMPRE /100.
    const itemRates: ItemTaxRates = { ibs_pct: 0.1, cbs_pct: 0.9 }
    const result = mergeItemAndTenantRates(itemRates, [])

    // 0,1% → 0.001 e 0,9% → 0.009 (não 0.1 / 0.9 = 10% / 90%).
    expect(result.find(r => r.tax_type === 'IBS')?.rate_pct).toBeCloseTo(0.001, 10)
    expect(result.find(r => r.tax_type === 'CBS')?.rate_pct).toBeCloseTo(0.009, 10)
  })

  it('IBS/CBS percentuais ≥ 1% continuam corretos (1% → 0.01, 8,8% → 0.088)', () => {
    // Cenário AAAtesteCBS3 — não deve haver regressão para alíquotas ≥ 1%.
    const itemRates: ItemTaxRates = { ibs_pct: 1, cbs_pct: 8.8 }
    const result = mergeItemAndTenantRates(itemRates, [])

    expect(result.find(r => r.tax_type === 'IBS')?.rate_pct).toBeCloseTo(0.01, 10)
    expect(result.find(r => r.tax_type === 'CBS')?.rate_pct).toBeCloseTo(0.088, 10)
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

describe('buildItemTaxRatesFromProduct — neutralização condicional ST/DIFAL/FCP (EPIC-POR-FORA-V3 / S2)', () => {
  it('Produto com icms_st_active=true → icms_st_pct é NEUTRALIZADO (null) p/ evitar dupla contagem', () => {
    const rates = buildItemTaxRatesFromProduct({ icms_st_active: true, icms_st_pct: 0.18 })
    // O cálculo lateral (consolidateStDifalFromItems) assume o ICMS-ST; o % plano deve sumir do merge.
    expect(rates.icms_st_pct).toBeNull()
  })

  it('Produto com difal_active=true → difal_pct e fcp_pct são NEUTRALIZADOS (null)', () => {
    const rates = buildItemTaxRatesFromProduct({ difal_active: true, difal_pct: 0.05, fcp_pct: 0.02 })
    expect(rates.difal_pct).toBeNull()
    expect(rates.fcp_pct).toBeNull()
  })

  it('Produto LEGADO (sem acionadores) → preserva icms_st_pct/difal_pct/fcp_pct (% plano puro)', () => {
    const rates = buildItemTaxRatesFromProduct({
      icms_st_active: false,
      difal_active: false,
      icms_st_pct: 0.18,
      difal_pct: 0.05,
      fcp_pct: 0.02,
    })
    expect(rates.icms_st_pct).toBe(0.18)
    expect(rates.difal_pct).toBe(0.05)
    expect(rates.fcp_pct).toBe(0.02)
  })

  it('icms_st_active NÃO afeta difal_pct/fcp_pct (acionadores independentes)', () => {
    const rates = buildItemTaxRatesFromProduct({ icms_st_active: true, icms_st_pct: 0.18, difal_pct: 0.05, fcp_pct: 0.02 })
    expect(rates.icms_st_pct).toBeNull()
    expect(rates.difal_pct).toBe(0.05)
    expect(rates.fcp_pct).toBe(0.02)
  })
})

// ============================================================================
// Fator de Redução IVA Dual (PC-BUG-FATOR-REDUCAO-002, regra do PO):
// ibs_pct/cbs_pct = BRUTA digitada; efetiva = bruta × (1 − fator/100). Só IBS/CBS.
// ============================================================================
describe('resolveIvaDualEffectiveRate — efetiva = bruta digitada × (1 − fator)', () => {
  it('Cenário do PO: IBS 1,0% fator 50% → 0,5%; CBS 8,8% → 4,4%', () => {
    expect(resolveIvaDualEffectiveRate(1.0, 50)).toBeCloseTo(0.5, 6)
    expect(resolveIvaDualEffectiveRate(8.8, 50)).toBeCloseTo(4.4, 6)
  })

  it('Outras faixas: IBS 0,1% fator 50% → 0,05%; 0,9% → 0,45%', () => {
    expect(resolveIvaDualEffectiveRate(0.1, 50)).toBeCloseTo(0.05, 6)
    expect(resolveIvaDualEffectiveRate(0.9, 50)).toBeCloseTo(0.45, 6)
  })

  it('Idempotência on-read: a bruta nunca é regravada — derivar não acumula', () => {
    // O fluxo real SEMPRE passa a bruta (1,0); a função só deriva, nunca persiste o efetivo.
    expect(resolveIvaDualEffectiveRate(1.0, 50)).toBeCloseTo(0.5, 6)
    expect(resolveIvaDualEffectiveRate(1.0, 50)).not.toBeCloseTo(0.25, 6)
  })

  it('Fator 100% → alíquota efetiva 0 (isenção)', () => {
    expect(resolveIvaDualEffectiveRate(1.0, 100)).toBe(0)
    expect(resolveIvaDualEffectiveRate(8.8, 100)).toBe(0)
  })

  it('Fator 0 / null / sem fator → efetiva = bruta digitada', () => {
    expect(resolveIvaDualEffectiveRate(1.0, 0)).toBeCloseTo(1.0, 6)
    expect(resolveIvaDualEffectiveRate(1.0, null)).toBeCloseTo(1.0, 6)
    expect(resolveIvaDualEffectiveRate(1.0, undefined)).toBeCloseTo(1.0, 6)
  })

  it('Bruta ausente → null/0 (sem alíquota cadastrada)', () => {
    expect(resolveIvaDualEffectiveRate(null, 50)).toBeNull()
    expect(resolveIvaDualEffectiveRate(0, 50)).toBe(0)
  })
})

describe('buildItemTaxRatesFromProduct — fator IVA Dual (PC-BUG-FATOR-REDUCAO-002)', () => {
  it('Deriva IBS/CBS efetivo da BRUTA digitada × fator; IPI/IS/ICMS inalterados (escopo)', () => {
    const r = buildItemTaxRatesFromProduct({
      ibs_pct: 1.0, cbs_pct: 8.8, iva_dual_reduction_factor: 50, // ibs_pct = BRUTA digitada
      is_pct: 0.3, ipi_pct: 5, icms_pct: 0.17,
    })
    expect(r.ibs_pct).toBeCloseTo(0.5, 6)  // 1,0 × (1 − 0,5)
    expect(r.cbs_pct).toBeCloseTo(4.4, 6)  // 8,8 × (1 − 0,5)
    // Fator NÃO toca os demais tributos:
    expect(r.is_pct).toBe(0.3)
    expect(r.ipi_pct).toBe(5)
    expect(r.icms_pct).toBe(0.17)
  })

  it('Fator 100% → IBS/CBS = 0, IPI/IS intactos', () => {
    const r = buildItemTaxRatesFromProduct({
      ibs_pct: 1.0, cbs_pct: 8.8, iva_dual_reduction_factor: 100, ipi_pct: 5, is_pct: 0.3,
    })
    expect(r.ibs_pct).toBe(0)
    expect(r.cbs_pct).toBe(0)
    expect(r.ipi_pct).toBe(5)
    expect(r.is_pct).toBe(0.3)
  })

  it('Sem fator → ibs_pct/cbs_pct = bruta digitada (passa intacto)', () => {
    const r = buildItemTaxRatesFromProduct({ ibs_pct: 1.0, cbs_pct: 8.8 })
    expect(r.ibs_pct).toBeCloseTo(1.0, 6)
    expect(r.cbs_pct).toBeCloseTo(8.8, 6)
  })

  it('Escala preservada no merge (alwaysPercent): efetiva 0,5% vira decimal 0,005', () => {
    const r = buildItemTaxRatesFromProduct({ ibs_pct: 1.0, cbs_pct: 8.8, iva_dual_reduction_factor: 50 })
    const merged = mergeItemAndTenantRates(r, [])
    expect(merged.find(x => x.tax_type === 'IBS')?.rate_pct).toBeCloseTo(0.005, 8)  // 0,5% → 0,005
    expect(merged.find(x => x.tax_type === 'CBS')?.rate_pct).toBeCloseTo(0.044, 8)  // 4,4% → 0,044
  })
})
