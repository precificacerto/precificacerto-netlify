/**
 * Item 7 — BUG-CASCATA-001 + BUG-CASCATA-002 (Relatório de Correções 24/07/2026)
 * "Produto manual = categoria INDEPENDENTE na Memória Cascata"
 *
 * REVOGA a regra do Relatório 21/07 (commit 0d4c37c), que classificava o item manual
 * como "custo puro" dentro da Etapa 4 ("Consolidação dos custos"). Regra nova do PO
 * (Cristiano):
 *   - BUG-CASCATA-002: o produto manual NÃO aparece mais na Etapa 4. A Etapa 4 exibe
 *     apenas o custo puro dos produtos cadastrados.
 *   - BUG-CASCATA-001: o produto manual é uma CATEGORIA INDEPENDENTE — repasse puro,
 *     somado ao TOTAL do orçamento (passo final da cascata), imune a desconto, sem
 *     custo/tributo/comissão/lucro/RT. Não distorce pesos/percentuais.
 *
 * Invariantes preservados (o manual é excluído do motor, então pesos/tributos/RRO da
 * cascata de produtos permanecem bit-exact):
 *   Cenário A — só produto manual (R$ 1.000): repasse 1.000 · DOP/tributo/comissão/
 *               lucro/RT = 0 · RRO = 0 · com desconto 10% permanece 1.000 (imune).
 *   Cenário B — produto + manual: a cascata do produto é IDÊNTICA ao caso só-produto;
 *               a Etapa 4 NÃO muda (manual fora dela); o valor do manual soma no PASSO
 *               FINAL do display, como categoria independente (resíduo 0).
 *
 * NOTA: a coreografia visual exata do relatório ("somar no autossoma pré-desconto e
 * reabater pós-desconto") depende da planilha-oráculo `Cascata_com_produto_manual.xlsx`.
 * O resultado numérico (total, pesos, RRO) é independente dessa escolha e está travado
 * aqui: manual imune a desconto e somado integralmente ao total.
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

// Tenant com DOP > 0 e tributos: prova que o produto manual é IMUNE a todos eles.
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
const step1Of = (r: MotorResult) => r.cascade_trace.find((s) => Number(s.step) === 1)
const step9Of = (r: MotorResult) => r.cascade_trace.find((s) => Number(s.step) === 9)
const finalStepOf = (r: MotorResult) => {
  const max = Math.max(...r.cascade_trace.map((s) => Number(s.step)))
  return r.cascade_trace.find((s) => Number(s.step) === max)
}
const hasManualChild = (s: { children?: { label: string }[] } | undefined) =>
  (s?.children ?? []).some((c) => c.label.includes('Produto manual'))

describe('Item 7 — produto manual = categoria independente (Relatório 24/07/2026)', () => {
  describe('Cenário A — só produto manual', () => {
    const argsSemDesconto: PageBuildArgs = {
      items: [{ unit_price: 1000, quantity: 1, is_manual_cost: true }],
      tenantCtx,
      globalDiscountPercent: 0,
    }

    it('repasse puro sem DOP/tributo/resíduo (RRO 0)', () => {
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

    it('BUG-CASCATA-002: NÃO aparece na Etapa 4; aparece como categoria independente', () => {
      const [m] = calculateMotorV17ForPage(argsSemDesconto)
      // Não há Etapa 4 de custos no orçamento só-manual (não é custo).
      expect(step4Of(m!)).toBeUndefined()
      // Existe uma etapa rotulada como repasse do produto manual.
      const passthrough = m!.cascade_trace.find((s) => s.label.includes('Produto manual'))
      expect(passthrough).toBeDefined()
      expect(passthrough!.amount).toBeCloseTo(1000, 2)
    })

    it('é IMUNE a desconto: com 10% o repasse e a receita permanecem 1.000, RRO 0', () => {
      const [m] = calculateMotorV17ForPage({ ...argsSemDesconto, globalDiscountPercent: 10 })
      expect(m!.cp).toBeCloseTo(1000, 2)
      expect(m!.rv).toBeCloseTo(1000, 2)
      expect(m!.desc_value).toBe(0)
      expect(m!.rro).toBe(0)
    })
  })

  describe('Cenário B — produto + produto manual', () => {
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

    it('a cascata do PRODUTO é bit-exact idêntica com e sem o produto manual', () => {
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)
      expect(produtoNoMisto!.new_commission).toBeCloseTo(soProduto!.new_commission, 6)
      expect(produtoNoMisto!.new_profit).toBeCloseTo(soProduto!.new_profit, 6)
      expect(produtoNoMisto!.new_csll).toBeCloseTo(soProduto!.new_csll, 6)
      expect(produtoNoMisto!.new_irpj).toBeCloseTo(soProduto!.new_irpj, 6)
      expect(produtoNoMisto!.rro).toBeCloseTo(soProduto!.rro, 6)
      expect(produtoNoMisto!.cp).toBeCloseTo(soProduto!.cp, 6)
    })

    it('o produto manual é repasse puro com resíduo 0', () => {
      const result = calculateMotorV17ForPage(argsMisto)
      const manual = result[1]
      expect(manual!.cp).toBeCloseTo(1000, 2)
      expect(manual!.new_commission).toBe(0)
      expect(manual!.new_profit).toBe(0)
      expect(manual!.rro).toBe(0)
    })

    it('BUG-CASCATA-002: a Etapa 4 NÃO muda (manual fora dela)', () => {
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)
      const step4Prod = step4Of(soProduto!)!
      const step4Mix = step4Of(produtoNoMisto!)!
      expect(step4Mix.amount).toBeCloseTo(step4Prod.amount, 2)
      expect(hasManualChild(step4Mix)).toBe(false)
    })

    it('Doc 29/07 (3.2): manual conta na Etapa 1, soma na Etapa 9 e fica FORA da Etapa 17', () => {
      // Coreografia canônica da planilha `Cascata com produto manual.xlsx`:
      // o manual é contado na Fragmentação, somado à Venda consolidada (junto de Desp.
      // Acessórias) e NÃO aparece na Consolidação final (só tributos por fora).
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)

      // Etapa 9 — Venda consolidada: soma o manual e o expõe como child independente.
      const step9Prod = step9Of(soProduto!)!
      const step9Mix = step9Of(produtoNoMisto!)!
      expect(step9Mix.amount).toBeCloseTo((Number(step9Prod.amount) || 0) + 1000, 2)
      expect(hasManualChild(step9Mix)).toBe(true)

      // Etapa 1 — Fragmentação: contabiliza o manual (contagem +1).
      const step1Prod = step1Of(soProduto!)!
      const step1Mix = step1Of(produtoNoMisto!)!
      expect(Number(step1Mix.amount)).toBeCloseTo((Number(step1Prod.amount) || 0) + 1, 2)

      // Etapa 17 — Consolidação final: NÃO contém o manual (é só IBS/CBS/IS/IPI).
      const finalMix = finalStepOf(produtoNoMisto!)!
      expect(Number(finalMix.step)).toBe(17)
      expect(hasManualChild(finalMix)).toBe(false)

      expect(produtoNoMisto!.cascade_trace).toHaveLength(17)
    })

    it('Rel. 31/07: a Base da Etapa 11 NÃO é inflada pelo produto manual (repasse fora do RRO)', () => {
      // Spec Felipe 31/07: o produto manual é repasse puro e não entra na base do desconto
      // nem na base distribuível do RRO. A Base da Etapa 11 do cenário misto deve ser
      // idêntica à do cenário só-produto (o manual não infla essa base); ele aparece apenas
      // como linha própria de dedução no display, sem alterar o cálculo.
      const step11Of = (r: MotorResult) => r.cascade_trace.find((s) => Number(s.step) === 11)
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)

      const step11Prod = step11Of(soProduto!)!
      const step11Mix = step11Of(produtoNoMisto!)!
      expect(step11Mix.base).toBeCloseTo(Number(step11Prod.base) || 0, 2)
      expect(hasManualChild(step11Mix)).toBe(true)
    })
  })
})
