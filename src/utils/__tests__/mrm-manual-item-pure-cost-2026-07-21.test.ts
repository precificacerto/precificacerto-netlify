/**
 * Relatório de Correções 21/07/2026 — Item 2
 * "Classificação obrigatória de itens manuais como custo puro na cascata"
 *
 * Regra do PO (Cristiano): o valor integral (qtd × unit_price) de um item adicionado via
 * "Adicionar item manual" deve ser classificado na "Consolidação dos custos" (Etapa 4) como
 * CUSTO PURO — NÃO distribuído em Comissão/Lucro/RT, sem DOP nem tributo, resíduo 0 e IMUNE a
 * desconto comercial (mesma regra de frete/despesas acessórias fixas).
 *
 * Oráculo travado com o PO (sessão 21/07/2026):
 *   Cenário A — só item manual (R$ 1.000): custo 1.000 · DOP/tributo/comissão/lucro/RT = 0 ·
 *               RRO = 0 · com desconto 10% permanece 1.000 (imune).
 *   Cenário B — produto + item manual: a cascata do produto é IDÊNTICA ao caso só-produto
 *               (o manual não interfere em pesos/tributos/RRO); o manual soma seu valor no
 *               custo (Etapa 4) com resíduo 0.
 */

import {
  calculateMotorV17ForPage,
  type PageBuildArgs,
  type PageTenantCtx,
} from '../mrm-engine-v17/legacy-adapter'
import type { TaxRatePeriod } from '@/types/mrm'

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

// Tenant com DOP > 0 e tributos: prova que o item manual é IMUNE a todos eles.
const tenantCtx: PageTenantCtx = {
  regime: 'LUCRO_REAL',
  rates: [rate('ICMS', 0.17), rate('PIS', 0.0165), rate('COFINS', 0.076)],
  csll_pct: 0.008,
  irpj_pct: 0.016,
  dop_pct: 0.1,
  absorption_policy: 'RRO_PROPORTIONAL',
}

type MotorResult = NonNullable<ReturnType<typeof calculateMotorV17ForPage>[number]>
const step4Of = (r: MotorResult) => r.cascade_trace.find((s) => s.step === 4)

describe('Item 2 — item manual = custo puro (Relatório 21/07/2026)', () => {
  describe('Cenário A — só item manual', () => {
    const argsSemDesconto: PageBuildArgs = {
      items: [{ unit_price: 1000, quantity: 1, is_manual_cost: true }],
      tenantCtx,
      globalDiscountPercent: 0,
    }

    it('valor integral vira CUSTO PURO (cp = 1.000), sem DOP/tributo/resíduo', () => {
      const [m] = calculateMotorV17ForPage(argsSemDesconto)
      expect(m).not.toBeNull()
      expect(m!.cp).toBeCloseTo(1000, 2)
      expect(m!.dop).toBe(0)
      expect(m!.mod).toBe(0)
      expect(m!.imp_total).toBe(0)
      expect(m!.new_commission).toBe(0)
      expect(m!.new_profit).toBe(0)
      expect(m!.new_csll).toBe(0)
      expect(m!.new_irpj).toBe(0)
      expect(m!.rro).toBe(0)
    })

    it('aparece na Etapa 4 "Consolidação dos custos" com child dedicado', () => {
      const [m] = calculateMotorV17ForPage(argsSemDesconto)
      const step4 = step4Of(m!)
      expect(step4).toBeDefined()
      expect(step4!.amount).toBeCloseTo(1000, 2)
      expect(step4!.children?.some((c) => c.label.includes('Itens manuais'))).toBe(true)
    })

    it('é IMUNE a desconto: com 10% o custo e a receita permanecem 1.000, RRO 0', () => {
      const [m] = calculateMotorV17ForPage({ ...argsSemDesconto, globalDiscountPercent: 10 })
      expect(m!.cp).toBeCloseTo(1000, 2)
      expect(m!.rv).toBeCloseTo(1000, 2)
      expect(m!.desc_value).toBe(0)
      expect(m!.rro).toBe(0)
    })
  })

  describe('Cenário B — produto + item manual', () => {
    const produto = {
      unit_price: 10000,
      quantity: 1,
      cost_total: 4000,
      productive_labor_unit: 0,
      commission_percent: 5,
      profit_percent: 15,
    }
    const argsSoProduto: PageBuildArgs = {
      items: [produto],
      tenantCtx,
      globalDiscountPercent: 10,
    }
    const argsMisto: PageBuildArgs = {
      items: [produto, { unit_price: 1000, quantity: 1, is_manual_cost: true }],
      tenantCtx,
      globalDiscountPercent: 10,
    }

    it('a cascata do PRODUTO é bit-exact idêntica com e sem o item manual', () => {
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)
      expect(produtoNoMisto!.new_commission).toBeCloseTo(soProduto!.new_commission, 6)
      expect(produtoNoMisto!.new_profit).toBeCloseTo(soProduto!.new_profit, 6)
      expect(produtoNoMisto!.new_csll).toBeCloseTo(soProduto!.new_csll, 6)
      expect(produtoNoMisto!.new_irpj).toBeCloseTo(soProduto!.new_irpj, 6)
      expect(produtoNoMisto!.rro).toBeCloseTo(soProduto!.rro, 6)
      expect(produtoNoMisto!.cp).toBeCloseTo(soProduto!.cp, 6)
    })

    it('o item manual é custo puro com resíduo 0', () => {
      const result = calculateMotorV17ForPage(argsMisto)
      const manual = result[1]
      expect(manual!.cp).toBeCloseTo(1000, 2)
      expect(manual!.new_commission).toBe(0)
      expect(manual!.new_profit).toBe(0)
      expect(manual!.rro).toBe(0)
    })

    it('a Etapa 4 soma o custo do produto + 1.000 (manual) e mantém 17 etapas', () => {
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)
      const step4Prod = step4Of(soProduto!)!
      const step4Mix = step4Of(produtoNoMisto!)!
      expect(step4Mix.amount).toBeCloseTo(step4Prod.amount + 1000, 2)
      expect(produtoNoMisto!.cascade_trace).toHaveLength(17)
    })
  })
})
