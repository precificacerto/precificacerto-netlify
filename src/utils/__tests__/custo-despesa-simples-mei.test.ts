/**
 * FIX-CUSTO-SN / FIX-DESPESA-SN — custo e despesa na cascata, SOMENTE em SN/MEI.
 *
 * DEFEITO 1 (custo): `products.yield_quantity` tem DOIS significados — rendimento em
 * PRODUZIDO, ESTOQUE em REVENDA (o label da UI muda junto). A tela de precificação
 * respeita a distinção (`yieldDivisorSave` só fraciona quando PRODUZIDO), mas
 * `resolveProductCostTotal` divide SEMPRE. Caso real "Cerveja": revenda, 99 em estoque,
 * composição R$ 4,50 → a cascata mostrava R$ 0,05 (4,50 ÷ 99).
 *
 * DEFEITO 2 (despesa): o adapter montava os 4 baldes exclusivamente do tenant, sem
 * condição. Um produto de revenda recebia MO Administrativa 8,60% + Despesa Fixa 6,45%
 * que a precificação dele não tem — R$ 1,50 a mais por unidade.
 *
 * REGRA INVIOLÁVEL: Lucro Real é INTOCÁVEL. As duas correções ficam dentro do adapter,
 * travadas por `regime === 'SIMPLES_NACIONAL' || regime === 'MEI'`. Os cenários (d)
 * abaixo são o teste dessa regra: em LR o resultado é bit-exact ao de hoje.
 */

import { calculateMotorV17ForPage } from '../mrm-engine-v17/legacy-adapter'
import type { PageItem, PageTenantCtx } from '../mrm-engine-v17/legacy-adapter'
import type { TaxRatePeriod, TaxRegime, TaxType } from '@/types/mrm'

function rate(tax_type: TaxType, rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 'test', tax_type, origin_state: null, dest_state: null,
    rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

/** Tenant com MO Admin 8,60% + Fixa 6,45% — despesas que o produto de revenda NÃO tem. */
const TENANT_EB = {
  administrative_pct: 0.0860,
  fixed_pct: 0.0645,
  variable_pct: 0.0129,
  financial_pct: 0.0037,
}

function ctx(regime: TaxRegime, rates: TaxRatePeriod[] = []): PageTenantCtx {
  return { regime, rates, expense_breakdown: TENANT_EB, absorption_policy: 'RRO_PROPORTIONAL' }
}

function run(items: PageItem[], regime: TaxRegime, rates: TaxRatePeriod[] = [], desc = 0) {
  return calculateMotorV17ForPage({
    items, tenantCtx: ctx(regime, rates), globalDiscountPercent: desc, effectiveDate: '2026-08-27',
  })[0]
}

/** Custo já dividido por yield, como `resolveProductCostTotal` entrega ao adapter. */
const CUSTO_COMPOSICAO = 4.50
const ESTOQUE = 99
const custoDividido = CUSTO_COMPOSICAO / ESTOQUE   // 0,0454545…

const itemRevenda: PageItem = {
  unit_price: 10, quantity: 1,
  cost_total: custoDividido,
  product_type: 'REVENDA', yield_quantity: ESTOQUE,
  commission_percent: 10, profit_percent: 37.32,
}

describe('(a) Simples + REVENDA com yield_quantity 99 — custo entra CHEIO', () => {
  it('cp reflete a composição de R$ 4,50, não R$ 0,05', () => {
    const r = run([itemRevenda], 'SIMPLES_NACIONAL')
    expect(r?.cp).toBeCloseTo(CUSTO_COMPOSICAO, 2)
  })

  it('sem os campos de tipo/yield o custo permanece dividido (mede o defeito)', () => {
    const semTipo = run([{ ...itemRevenda, product_type: null, yield_quantity: null }], 'SIMPLES_NACIONAL')
    expect(semTipo?.cp).toBeCloseTo(custoDividido, 4)
    // A correção multiplica de volta: 99× a diferença entre os dois caminhos.
    const comCorrecao = run([itemRevenda], 'SIMPLES_NACIONAL')
    expect((comCorrecao?.cp ?? 0) / (semTipo?.cp ?? 1)).toBeCloseTo(ESTOQUE, 4)
  })

  it('MEI segue o mesmo ramo', () => {
    const r = run([itemRevenda], 'MEI')
    expect(r?.cp).toBeCloseTo(CUSTO_COMPOSICAO, 2)
  })

  it('yield_quantity ≤ 1 não altera nada (fator neutro)', () => {
    const r = run([{ ...itemRevenda, cost_total: CUSTO_COMPOSICAO, yield_quantity: 1 }], 'SIMPLES_NACIONAL')
    expect(r?.cp).toBeCloseTo(CUSTO_COMPOSICAO, 2)
  })
})

describe('(b) Simples + PRODUZIDO com yield > 1 — custo CONTINUA fracionado', () => {
  it('rendimento real preserva a divisão', () => {
    const r = run([{ ...itemRevenda, product_type: 'PRODUZIDO', yield_quantity: 10, cost_total: 0.45 }], 'SIMPLES_NACIONAL')
    // PRODUZIDO ⇒ fator 1 ⇒ o custo já dividido permanece dividido.
    expect(r?.cp).toBeCloseTo(0.45, 4)
  })
})

describe('(c) Simples com expense_breakdown_unit — DOP usa os rates do PRODUTO', () => {
  const itemComDespProduto: PageItem = {
    ...itemRevenda,
    expense_breakdown_unit: {
      mo_admin: { rate: 0, amount_unit: 0 },
      fixa: { rate: 0, amount_unit: 0 },
      variavel: { rate: 0.0129, amount_unit: 0.129 },
      financeira: { rate: 0.0037, amount_unit: 0.037 },
    },
  }

  it('DOP = 1,66% do produto, não 21,71% do tenant', () => {
    const r = run([itemComDespProduto], 'SIMPLES_NACIONAL')
    // rb = 10; produto: (1,29% + 0,37%) × 10 = 0,166
    expect(r?.dop).toBeCloseTo(0.166, 4)
    // tenant somaria 8,60 + 6,45 + 1,29 + 0,37 = 16,71% ⇒ 1,671
    expect(r?.dop).not.toBeCloseTo(1.671, 2)
  })

  it('produto SEM rates > 0 cai no tenant, como hoje', () => {
    const semRates: PageItem = {
      ...itemRevenda,
      expense_breakdown_unit: {
        mo_admin: { rate: 0, amount_unit: 0 }, fixa: { rate: 0, amount_unit: 0 },
        variavel: { rate: 0, amount_unit: 0 }, financeira: { rate: 0, amount_unit: 0 },
      },
    }
    const r = run([semRates], 'SIMPLES_NACIONAL')
    expect(r?.dop).toBeCloseTo(10 * 0.1671, 4)
  })
})

describe('(d) REGRA INVIOLÁVEL — LUCRO_REAL bit-exact ao comportamento de hoje', () => {
  it('revenda com yield 99: LR NÃO desfaz a divisão', () => {
    const comCampos = run([itemRevenda], 'LUCRO_REAL')
    const semCampos = run([{ ...itemRevenda, product_type: null, yield_quantity: null }], 'LUCRO_REAL')
    expect(comCampos?.cp).toBe(semCampos?.cp)
    expect(comCampos?.cp).toBeCloseTo(custoDividido, 6)
  })

  it('despesa por produto: LR NÃO usa os rates do produto', () => {
    const ebU = {
      mo_admin: { rate: 0, amount_unit: 0 }, fixa: { rate: 0, amount_unit: 0 },
      variavel: { rate: 0.0129, amount_unit: 0.129 }, financeira: { rate: 0.0037, amount_unit: 0.037 },
    }
    const comEbU = run([{ ...itemRevenda, expense_breakdown_unit: ebU }], 'LUCRO_REAL')
    const semEbU = run([itemRevenda], 'LUCRO_REAL')
    // Em LR o DOP continua vindo do tenant nos dois casos.
    expect(comEbU?.dop).toBeCloseTo(semEbU?.dop ?? -1, 6)
    expect(comEbU?.dop).toBeCloseTo(10 * 0.1671, 4)
  })

  it('LUCRO_PRESUMIDO também fica fora do escopo', () => {
    const r = run([itemRevenda], 'LUCRO_PRESUMIDO')
    expect(r?.cp).toBeCloseTo(custoDividido, 6)
    expect(r?.dop).toBeCloseTo(10 * 0.1671, 4)
  })

  it('rro de LR é idêntico com e sem os campos novos', () => {
    const a = run([itemRevenda], 'LUCRO_REAL', [rate('ICMS', 0.17)])
    const b = run([{ ...itemRevenda, product_type: null, yield_quantity: null }], 'LUCRO_REAL', [rate('ICMS', 0.17)])
    expect(a?.rro).toBe(b?.rro)
    expect(a?.imp_total).toBe(b?.imp_total)
  })
})

describe('(e) Caso Cerveja fim-a-fim — cascata fechando em zero', () => {
  // Preço 10,00 | custo 4,50 (composição, estoque 99) | desp. variável 1,29% + financeira 0,37%
  // DAS 5% | RT 1% | comissão 10% | lucro 37,32%
  const cerveja: PageItem = {
    unit_price: 10, quantity: 1,
    cost_total: custoDividido,               // como chega do resolveProductCostTotal
    product_type: 'REVENDA', yield_quantity: ESTOQUE,
    commission_percent: 10, profit_percent: 37.32,
    rt_reserve_percent: 1,
    item_tax_rates: { das_pct: 5 },
    expense_breakdown_unit: {
      mo_admin: { rate: 0, amount_unit: 0 },
      fixa: { rate: 0, amount_unit: 0 },
      variavel: { rate: 0.0129, amount_unit: 0.129 },
      financeira: { rate: 0.0037, amount_unit: 0.037 },
    },
  }

  const r = () => run([cerveja], 'SIMPLES_NACIONAL')

  it('custo R$ 4,50 e despesa R$ 0,166 (sem MO Admin nem Fixa do tenant)', () => {
    expect(r()?.cp).toBeCloseTo(4.50, 2)
    expect(r()?.dop).toBeCloseTo(0.166, 3)
  })

  it('DAS 5% = R$ 0,50 como único tributo por dentro', () => {
    expect(r()?.imp_total).toBeCloseTo(0.50, 2)
  })

  it('RRO = R$ 4,73', () => {
    expect(r()?.rro).toBeCloseTo(4.73, 2)
  })

  it('comissão R$ 1,00 e lucro R$ 3,73', () => {
    expect(r()?.new_commission).toBeCloseTo(1.00, 2)
    expect(r()?.new_profit).toBeCloseTo(3.73, 2)
  })

  it('a cascata FECHA EM ZERO: âncora − DAS − custo − despesa − RT − margens = 0', () => {
    const x = r()!
    const rt = 10 * 0.01
    const sobra = 10 - (x.imp_total ?? 0) - (x.cp ?? 0) - (x.dop ?? 0) - rt
      - (x.new_commission ?? 0) - (x.new_profit ?? 0) - (x.new_csll ?? 0) - (x.new_irpj ?? 0)
    expect(sobra).toBeCloseTo(0, 2)
  })
})
