/**
 * Tests — ADENDO OFICIAL 25-A (Junho 2026): IPI e ICMS Complementar em Orçamentos Multi-Produto.
 *
 * Regra inviolável do adendo (Seção 4):
 *   IPI_consolidado = Σ(IPI_produto_i)   — SOMA dos valores apurados individualmente por produto.
 *   É VEDADO recalcular o IPI aplicando a alíquota de UM produto sobre a base consolidada total
 *   (que tributaria produtos sem aquele tributo — ex.: P2/P3 com IPI 0%).
 *
 * Consequência (Seção 4.2): a base do ICMS Complementar = IPI_consolidado + Desp. Acessórias.
 * Como o IPI deixa de ser inflado, o ICMS Complementar cobrado do cliente também deixa de inflar.
 *
 * Estratégia de teste (independente da aritmética interna do motor): comparar dois cenários
 * IDÊNTICOS exceto pelas alíquotas de IPI dos produtos:
 *   - HOMOGÊNEO: todos os produtos com IPI 5%   → IPI consolidado = 5% × base total.
 *   - HETEROGÊNEO: só o P1 com IPI 5% (P2 0%)    → IPI consolidado = 5% × base do P1 (≈ metade).
 * No fluxo BUGADO (alíquota-do-P1 × base-total) os dois cenários dariam o MESMO IPI. Na correção,
 * o heterogêneo é ~metade do homogêneo (produtos com âncora igual) e a alíquota EXIBIDA vira a
 * efetiva ponderada (blended) — Seção 7 / Tabela 13.
 */

import {
  calculateMotorV17ForPage,
  type PageBuildArgs,
  type PageItem,
} from '../mrm-engine-v17/legacy-adapter'
import type { IcmsComplMotorInput, TaxRatePeriod, TaxType } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`,
    tenant_id: 'test',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: null,
  }
}

/** Produto com Op Interna confiável (sale_price_base = unit_price, sem terceirizadas). */
function produto(ipiPct: number): PageItem {
  return {
    unit_price: 100_000,
    quantity: 1,
    sale_price_base_unit: 100_000,
    terceirizadas_unit: 0,
    cost_total: 40_000,
    productive_labor_unit: 0,
    commission_percent: 5,
    profit_percent: 15,
    item_tax_rates: {
      icms_pct: 0.17,
      pis_pct: 0.0165,
      cofins_pct: 0.076,
      ipi_pct: ipiPct,   // 5 → 5% ; 0 → não tributado
      ibs_pct: 0.1,      // alwaysPercent → 0,1%
      cbs_pct: 0.9,      // alwaysPercent → 0,9%
    },
  }
}

const baseTenant: PageBuildArgs['tenantCtx'] = {
  regime: 'LUCRO_REAL',
  rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
  csll_pct: 0.008,
  irpj_pct: 0.016,
  dop_pct: 0.10,
  absorption_policy: 'RRO_PROPORTIONAL',
}

/**
 * Consolida uma linha de tributo por fora a partir do `per_item` (caminho de produção real,
 * que carrega `outside_items`). O amount consolidado é a SOMA dos rateios por item; a rate_pct
 * é preservada idêntica no rateio (basta ler do primeiro item que possui a linha).
 */
function outsideLine(args: PageBuildArgs, type: TaxType): { rate_pct: number; base: number; amount: number } | undefined {
  const perItem = calculateMotorV17ForPage(args)
  let amount = 0
  let base = 0
  let rate_pct: number | undefined
  for (const r of perItem) {
    const line = r?.taxes_outside?.find((t) => t.type === type)
    if (line) {
      amount += line.amount
      base += line.base
      if (rate_pct === undefined) rate_pct = line.rate_pct
    }
  }
  return rate_pct === undefined ? undefined : { rate_pct, base, amount }
}

function ipiLine(args: PageBuildArgs) {
  return outsideLine(args, 'IPI')
}

function icmsComplValue(args: PageBuildArgs) {
  return outsideLine(args, 'ICMS_COMPL')?.amount ?? 0
}

describe('Adendo 25-A — IPI consolidado = SOMA dos individuais (multi-produto heterogêneo)', () => {
  it('IPI heterogêneo (só P1 5%) ≈ metade do homogêneo (P1+P2 5%) — NÃO recalcula sobre base total', () => {
    const homogeneo: PageBuildArgs = {
      items: [produto(5), produto(5)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
    }
    const heterogeneo: PageBuildArgs = {
      items: [produto(5), produto(0)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
    }

    const ipiHomo = ipiLine(homogeneo)
    const ipiHetero = ipiLine(heterogeneo)

    expect(ipiHomo).toBeDefined()
    expect(ipiHetero).toBeDefined()

    // No fluxo BUGADO os dois seriam iguais (5% × base total). Na correção, o heterogêneo
    // é a SOMA: só o P1 (peso ~0,5) contribui → ~metade do homogêneo.
    expect(ipiHetero!.amount).toBeCloseTo(ipiHomo!.amount / 2, 0)
    expect(ipiHetero!.amount).toBeLessThan(ipiHomo!.amount * 0.6)
  })

  it('Alíquota IPI EXIBIDA: nominal (5%) no homogêneo, efetiva ponderada (~2,5%) no heterogêneo', () => {
    const homogeneo: PageBuildArgs = {
      items: [produto(5), produto(5)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
    }
    const heterogeneo: PageBuildArgs = {
      items: [produto(5), produto(0)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
    }

    // Homogêneo: alíquota efetiva ≡ nominal (5%).
    expect(ipiLine(homogeneo)!.rate_pct).toBeCloseTo(0.05, 3)
    // Heterogêneo: blended ≈ 2,5% (Seção 7 / Tabela 13 — display ponderado, não a alíquota do P1).
    expect(ipiLine(heterogeneo)!.rate_pct).toBeCloseTo(0.025, 2)
  })

  it('ICMS Complementar segue o IPI somado: heterogêneo ≈ metade do homogêneo', () => {
    const icmsCompl: IcmsComplMotorInput = {
      is_contributor: false, // consumidor final não contribuinte → ICMS Compl. devido
      freight_mode: 'CIF',
      st_active: false,
      difal_active: false,
      freight: 0,
      accessory: 0,
      override: null,
    }
    const homogeneo: PageBuildArgs = {
      items: [produto(5), produto(5)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
      icmsCompl,
    }
    const heterogeneo: PageBuildArgs = {
      items: [produto(5), produto(0)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
      icmsCompl,
    }

    const complHomo = icmsComplValue(homogeneo)
    const complHetero = icmsComplValue(heterogeneo)

    expect(complHomo).toBeGreaterThan(0)
    expect(complHetero).toBeGreaterThan(0)
    // Base do ICMS Compl. = IPI somado + desp (desp=0) → segue a proporção do IPI.
    expect(complHetero).toBeCloseTo(complHomo / 2, 0)
  })
})

describe('Adendo 25-A — Cobertura adicional (QA Quinn 23/06/2026)', () => {
  it('3 produtos (só P1 5%, P2/P3 0%): IPI consolidado ≈ 1/3 do homogêneo', () => {
    const homogeneo: PageBuildArgs = {
      items: [produto(5), produto(5), produto(5)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
    }
    const heterogeneo: PageBuildArgs = {
      items: [produto(5), produto(0), produto(0)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
    }
    const ipiHomo = ipiLine(homogeneo)!
    const ipiHetero = ipiLine(heterogeneo)!
    // Só o P1 (peso ~1/3) contribui → ~1/3 do homogêneo. No bug seria igual (5% × base total).
    expect(ipiHetero.amount).toBeCloseTo(ipiHomo.amount / 3, 0)
    expect(ipiHetero.rate_pct).toBeCloseTo(0.05 / 3, 2) // blended ≈ 1,67%
  })

  it('Multi-produto COM desconto: heterogêneo continua ≈ metade do homogêneo (sem duplo desconto novo)', () => {
    const homogeneo: PageBuildArgs = {
      items: [produto(5), produto(5)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 20,
    }
    const heterogeneo: PageBuildArgs = {
      items: [produto(5), produto(0)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 20,
    }
    const ipiHomo = ipiLine(homogeneo)!
    const ipiHetero = ipiLine(heterogeneo)!
    // A proporção SOMA (1/2) é preservada sob desconto — o desconto atua igualmente nos dois
    // (deriva da âncora pós-desconto); a correção 25-A não introduz duplo desconto.
    expect(ipiHetero.amount).toBeCloseTo(ipiHomo.amount / 2, 0)
    // Alíquota efetiva no homogêneo permanece 5% (desconto afeta base e valor proporcionalmente).
    expect(ipiHomo.rate_pct).toBeCloseTo(0.05, 3)
  })

  it('ICMS Comp bloqueado por ST ativo: não cobra mesmo com IPI somado > 0', () => {
    const icmsComplComST: IcmsComplMotorInput = {
      is_contributor: false, // não contribuinte
      freight_mode: 'CIF',
      st_active: true,       // ST ativo → ramo NAO_CONTRIB_ST_DIFAL bloqueia
      difal_active: false,
      freight: 0,
      accessory: 0,
      override: null,
    }
    const args: PageBuildArgs = {
      items: [produto(5), produto(0)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
      icmsCompl: icmsComplComST,
    }
    expect(icmsComplValue(args)).toBe(0)
  })
})

describe('Adendo 25-A — Regressão: produto único permanece com alíquota nominal', () => {
  it('Single-product: IPI = 5% nominal sobre a base (sem blending, caminho legado)', () => {
    const single: PageBuildArgs = {
      items: [produto(5)],
      tenantCtx: baseTenant,
      globalDiscountPercent: 0,
    }
    const ipi = ipiLine(single)
    expect(ipi).toBeDefined()
    // Um só produto → peso 1 → efetiva ≡ nominal = 5%.
    expect(ipi!.rate_pct).toBeCloseTo(0.05, 4)
    // amount = 5% × base.
    expect(ipi!.amount).toBeCloseTo(ipi!.base * 0.05, 2)
  })
})
