/**
 * Tests V16.1 (Founder 2026-05-27) — Fix defensivo para "Redução de custos" perdendo MO produtiva.
 *
 * Cenário reportado: Produto "Aluminio" cadastrado com:
 *   - Custo líquido material: R$ 798,60 (1000un × R$ 0,80)
 *   - MO produtiva:          R$ 1.629,60 (3000 min)
 *   - Custo Produto exibido: R$ 2.428,20 (no cadastro)
 *
 * BUG: cascade memória step 9 "Redução de custos" mostrava -R$ 798,60 (só material).
 * ESPERADO: -R$ 2.428,20 (material + MO produtiva).
 *
 * Causa raiz:
 *   1. `pricing_calculations.cmv` armazenava apenas material quando produto foi
 *      precificado como REVENDA (Edge Function pricing-engine.ts:210-213)
 *   2. `resolveLaborFromAllSources` retornava 0 quando 5 fontes vazias
 *   3. `buildMotorInput` usava ternário `snapshot > 0 ? snapshot : fallback`
 *      — pegava snapshot incompleto sem checar se MO estava incluída.
 *
 * Fix V16.1 (defensivo, duas camadas):
 *   - `resolveProductExpenseBreakdown`: adiciona `products.cost_total + productive_labor_total`
 *     como 3ª opção no `Math.max(cmvFromColumn, cmvFromSum, cmvFromDirect)`
 *   - `buildMotorInput`: troca ternário por `Math.max(snapshotCmvUnit, fallbackCmvUnit)`
 *     onde fallbackCmvUnit = cost_total + productive_labor_unit
 */

import { buildMotorInput } from '../mrm-orchestrator'
import { resolveProductExpenseBreakdown, resolveProductCostAndLabor } from '../item-tax-rates'
import { calculateMarginReapuration } from '../margin-reapuration'
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

const tenantCtxAluminio = {
  regime: 'LUCRO_REAL' as const,
  rates: [
    rate('ICMS', 0.17),
    rate('PIS', 0.0165),
    rate('COFINS', 0.076),
  ],
  dop_pct: 0.30,
  csll_pct: 0.0,
  irpj_pct: 0.0,
  useSnapshotRates: false,
  expense_breakdown: {
    administrative_pct: 0.10,
    fixed_pct: 0.10,
    variable_pct: 0.06,
    financial_pct: 0.005,
  },
}

describe('V16.1 — Fix defensivo "Redução de custos" (cenário Aluminio)', () => {
  describe('RR-REG-001: buildMotorInput com snapshot incompleto', () => {
    it('Snapshot cmv_unit = 798,60 (só material) + productive_labor_unit = 1629,60 → cp = 2428,20', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 5272.96,
          quantity: 1,
          cost_total: 798.60, // só material — semântica clássica V9-D2
          productive_labor_unit: 1629.60,
          expense_breakdown_unit: {
            cmv_unit: 798.60,  // INCOMPLETO — só material, sem MO
            mo_admin: { rate: 0.10, amount_unit: 554.19 },
            fixa: { rate: 0.10, amount_unit: 561.04 },
            variavel: { rate: 0.06, amount_unit: 322.71 },
            financeira: { rate: 0.005, amount_unit: 22.67 },
          },
        },
        tenantCtx: tenantCtxAluminio,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })

      // V16.2: cost_total(798.60) < laborUnit(1629.60) → semântica clássica → 798.60+1629.60=2428.20
      // Math.max(798.60, 2428.20) = 2428.20
      expect(input.cp).toBeCloseTo(2428.20, 2)
    })

    it('Cenário Agulha real (após resolveProductCostAndLabor): cost_total=798.60 + labor=1629.60 → cp=2428.20', () => {
      // V16.2 (Founder 2026-05-27): `resolveProductCostAndLabor` normaliza semântica:
      //   - costTotal = só material (ADR-011 consolidated - labor)
      //   - productiveLaborUnit = MO separada (via V8.6 runtime do tenantCtx fix V16.2 no hook)
      // Motor soma: 798.60 + 1629.60 = 2428.20.
      const input = buildMotorInput({
        item: {
          unit_price: 5272.96,
          quantity: 1,
          cost_total: 798.60, // só material (saída de resolveProductCostAndLabor)
          productive_labor_unit: 1629.60, // MO produtiva separada
          // expense_breakdown_unit ausente (snapshot V14 não populado no banco)
        },
        tenantCtx: tenantCtxAluminio,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })

      // Motor V9-I5: cp = cost_total + productive_labor_unit = 798.60 + 1629.60 = 2428.20
      expect(input.cp).toBeCloseTo(2428.20, 2)
    })

    it('Snapshot ausente + cost_total + productive_labor_unit → cp = 2428,20 (fallback puro V9-D2)', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 5272.96,
          quantity: 1,
          cost_total: 798.60,
          productive_labor_unit: 1629.60,
          // expense_breakdown_unit ausente
        },
        tenantCtx: tenantCtxAluminio,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })
      expect(input.cp).toBeCloseTo(2428.20, 2)
    })

    it('Cascade step 9 "Redução de custos" exibe -R$ 2.428,20 (não -R$ 798,60)', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 5272.96,
          quantity: 1,
          cost_total: 798.60,
          productive_labor_unit: 1629.60,
          expense_breakdown_unit: {
            cmv_unit: 798.60,
            mo_admin: { rate: 0.10, amount_unit: 554.19 },
            fixa: { rate: 0.10, amount_unit: 561.04 },
            variavel: { rate: 0.06, amount_unit: 322.71 },
            financeira: { rate: 0.005, amount_unit: 22.67 },
          },
        },
        tenantCtx: tenantCtxAluminio,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })

      const result = calculateMarginReapuration(input)
      const trace = result.cascade_trace ?? []
      const step9 = trace.find(t => /custo/i.test(t.label))
      expect(step9).toBeDefined()
      expect(step9?.amount).toBeCloseTo(-2428.20, 2)
    })
  })

  describe('RR-REG-002: snapshot COMPLETO permanece preservado (regressão V15)', () => {
    it('Quando cmv_unit > cost_total + productive_labor_unit, usa snapshot (cenário V14 ideal)', () => {
      const input = buildMotorInput({
        item: {
          unit_price: 5272.96,
          quantity: 1,
          cost_total: 798.60,
          productive_labor_unit: 1629.60,
          expense_breakdown_unit: {
            cmv_unit: 2428.20,  // CONSOLIDADO (V8.8 — material + MO somados)
            mo_admin: { rate: 0.10, amount_unit: 554.19 },
            fixa: { rate: 0.10, amount_unit: 561.04 },
            variavel: { rate: 0.06, amount_unit: 322.71 },
            financeira: { rate: 0.005, amount_unit: 22.67 },
          },
        },
        tenantCtx: tenantCtxAluminio,
        globalDiscountPercent: 0,
        discountMode: 'PROPORTIONAL',
      })

      // Math.max(2428.20, 798.60+1629.60) = 2428.20 — snapshot vence (mesmo valor)
      expect(input.cp).toBeCloseTo(2428.20, 2)
    })
  })

  describe('RR-REG-003: helper resolveProductExpenseBreakdown — fonte direct', () => {
    it('Sem pricing_calculations.cmv mas com products.cost_total + productive_labor_total → cmv_unit = 2428,20', () => {
      const prod = {
        yield_quantity: 1,
        cost_total: 798.60,
        productive_labor_total: 1629.60,
        pricing_calculations: [{
          // cmv ausente (REVENDA antiga ou produto novo sem precificação completa)
          val_indirect_labor: 554.19,
          pct_indirect_labor: 10.51,
          val_fixed_expense: 561.04,
          pct_fixed_expense: 10.64,
          val_variable_expense: 322.71,
          pct_variable_expense: 6.12,
          val_financial_expense: 22.67,
          pct_financial_expense: 0.43,
        }],
      }
      const result = resolveProductExpenseBreakdown(prod)
      expect(result).not.toBeNull()
      expect(result?.cmv_unit).toBeCloseTo(2428.20, 2)
    })

    it('cmv_unit reflete o MAIOR entre cmvFromColumn, cmvFromSum e cmvFromDirect', () => {
      // Cenário híbrido: pricing.cmv stale (798,60) mas products tem dados consolidados
      const prod = {
        yield_quantity: 1,
        cost_total: 798.60,
        productive_labor_total: 1629.60,
        pricing_calculations: [{
          cmv: 798.60,  // stale (só material, sem MO)
          total_material_cost_net: 798.60,
          // total_labor_net ausente → resolveLaborFromAllSources tenta 5 fontes
          val_indirect_labor: 554.19,
          pct_indirect_labor: 10.51,
        }],
      }
      const result = resolveProductExpenseBreakdown(prod)
      // cmvFromColumn=798,60 | cmvFromSum=798,60+? | cmvFromDirect=798,60+1629,60=2428,20
      expect(result?.cmv_unit).toBeCloseTo(2428.20, 2)
    })

    it('RR-REG-004: resolveProductCostAndLabor normaliza semântica V9-I5 (cost_total = só material)', () => {
      // Cenário Agulha: product_items (R$ 798,60 material) + tenantCtx V8.6 fallback runtime
      // (productionLaborCost=34417.11, monthlyWorkloadMinutes=63360) → resolveProductLaborTotal
      // retorna 1629.60. resolveProductCostTotal Nível 2 retorna consolidado 2428.20.
      // Helper resolveProductCostAndLabor normaliza: { costTotal: 798.60, productiveLaborUnit: 1629.60 }.
      const prod = {
        yield_quantity: 1,
        product_items: [{ item_cost_net: 798.60 }],
        pricing_calculations: [{ product_workload: 3000 }],
      }
      const tenantCtx = {
        production_labor_cost: 34417.11,
        monthly_workload_minutes: 63360,
        productive_value_per_minute: 0,
      }
      const result = resolveProductCostAndLabor(prod, tenantCtx)
      expect(result.costTotal).toBeCloseTo(798.60, 2)
      expect(result.productiveLaborUnit).toBeCloseTo(1629.60, 2)
    })

    it('Quando cost_total = 0 e productive_labor_total = 0, fonte direct não interfere', () => {
      // Regressão: fonte direct não deve introduzir noise em produtos sem cadastro
      const prod = {
        yield_quantity: 1,
        cost_total: 0,
        productive_labor_total: 0,
        pricing_calculations: [{
          cmv: 5000.00,
          total_material_cost_net: 4000.00,
          total_labor_net: 1000.00,
        }],
      }
      const result = resolveProductExpenseBreakdown(prod)
      // Math.max(5000, 4000+1000, 0+0) = 5000 (cmv da coluna)
      expect(result?.cmv_unit).toBeCloseTo(5000.00, 2)
    })
  })
})
