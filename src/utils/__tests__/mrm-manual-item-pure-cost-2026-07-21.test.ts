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

    // MUDANÇA DE REGRA (Doc 31/07/2026 — oráculo "Aluminio"): o desconto do produto manual
    // (repasse imune) passa a ser ABSORVIDO pela base distribuível do produto. Antes deste fix
    // a cascata do produto era bit-exact idêntica com/sem o manual (o desconto só incidia sobre
    // a operação por dentro). Agora, com desconto 10% e manual R$ 1.000:
    //   desc_value_produto = 10% × (rb + manual) → +100 em desc (Δdesc = d × manual = 100),
    //   rv e RRO do produto caem exatamente 100. CP (imune) permanece igual.
    // Ver src/utils/mrm-engine-v17/consolidate.ts (discount_immune_base) e o oráculo Aluminio.
    it('o produto ABSORVE o desconto do manual (nova regra): rv/RRO caem d × manual; CP intacto', () => {
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)
      const d = 0.1
      const manual = 1000
      const absorbido = d * manual // 100

      // CP é imune a desconto → idêntico.
      expect(produtoNoMisto!.cp).toBeCloseTo(soProduto!.cp, 6)
      // Base distribuível bruta (rv) e o desconto do produto mudam EXATAMENTE pelo desconto
      // absorvido do manual (d × manual = 100): +100 em desc, −100 em rv. Prova direta da absorção.
      expect(produtoNoMisto!.desc_value).toBeCloseTo(soProduto!.desc_value + absorbido, 6)
      expect(produtoNoMisto!.rv).toBeCloseTo(soProduto!.rv - absorbido, 6)
      // RRO cai (âncora menor por peso × absorbido); a queda é positiva e ≤ absorbido bruto
      // (peso_op_interna ≤ 1). Antes do fix era IDÊNTICO (queda 0).
      const quedaRro = soProduto!.rro - produtoNoMisto!.rro
      expect(quedaRro).toBeGreaterThan(0)
      expect(quedaRro).toBeLessThanOrEqual(absorbido + 1e-6)
      // Comissão/lucro do produto encolhem (RRO menor redistribuído) — não mais idênticos.
      expect(produtoNoMisto!.new_commission).toBeLessThan(soProduto!.new_commission)
      expect(produtoNoMisto!.new_profit).toBeLessThan(soProduto!.new_profit)
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

    it('Correção 1.1 (Ago/26): a linha-título da Etapa 11 exibe a base TOTAL (incl. manual) e o % REAL', () => {
      // Correção Item 1.1 (Ago/2026) — REVOGA a regra do Rel. 31/07 quanto ao DISPLAY da
      // linha-título. O produto manual é repasse puro (imune ao desconto) e continua FORA da
      // base distribuível do RRO — o cálculo (rv/RRO/oráculos) não muda. Porém a LINHA-TÍTULO
      // da Etapa 11 deve exibir a base TOTAL do orçamento (produto do sistema + manual) e o
      // percentual REAL digitado (10%), nunca uma taxa fictícia derivada de uma base parcial.
      const step11Of = (r: MotorResult) => r.cascade_trace.find((s) => Number(s.step) === 11)
      const [soProduto] = calculateMotorV17ForPage(argsSoProduto)
      const [produtoNoMisto] = calculateMotorV17ForPage(argsMisto)

      const step11Prod = step11Of(soProduto!)!
      const step11Mix = step11Of(produtoNoMisto!)!

      // A base-título do misto = base do só-produto + valor do manual (R$ 1.000).
      expect(step11Mix.base).toBeCloseTo((Number(step11Prod.base) || 0) + 1000, 2)
      // O percentual exibido é o REAL digitado (10%), não a taxa fictícia sobre base parcial.
      expect(step11Mix.rate).toBeCloseTo(0.1, 4)
      // O AMOUNT do desconto (real) é imutável: base-título × % real.
      expect(Math.abs(Number(step11Mix.amount))).toBeCloseTo(
        (Number(step11Mix.base) || 0) * 0.1,
        2,
      )
      expect(hasManualChild(step11Mix)).toBe(true)
    })
  })
})
