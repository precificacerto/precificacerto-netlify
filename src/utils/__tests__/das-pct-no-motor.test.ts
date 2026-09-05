/**
 * das-pct-no-motor.test.ts — a alíquota do DAS do ITEM precisa chegar ao motor do RRO.
 *
 * O DEFEITO: `resolveDasPct` já resolvia a alíquota em `item-tax-rates.ts:630`, a partir de
 * `products.custom_tax_percent` ou `services.taxable_regime_percent`, e a guardava em
 * `ItemTaxRates.das_pct`. O comentário do campo dizia que *"o motor o consome direto do item"*.
 * **O motor não tinha o campo.** `ReapurationInput` não declarava `das_pct`, então o valor era
 * calculado e descartado, e `imp_total` saía ZERO mesmo com o item tendo percentual.
 *
 * São DOIS motores no repositório, e a diferença importa: o V17 (`legacy-adapter.ts:856`)
 * consome `das_pct`; o `margin-reapuration`, por onde o snapshot passa, não tinha por onde.
 *
 * ORÁCULO: TAMARA DRESCH, `custom_tax_percent` 8,02% em 14 produtos. Medição pareada anterior:
 * QUATRO `budget_items` com alíquota de catálogo > 0 e `tax_breakdown` gravado, e nos quatro o
 * `imp_total` era ZERO — n = 4, DEMONSTRADO em 4 de 4, NÃO PROVADO.
 *
 * POR QUE O CASO NÃO PODE SER A SALÃO ELIANE: ela é MEI com alíquota zero de verdade, no tenant
 * e nos serviços. Ali o `imp_total: 0` está CORRETO, e o teste passaria verde sem exercitar
 * nada — a mesma armadilha do PR anterior, agora no campo do imposto.
 *
 * O DAS SUBSTITUI o grupo ICMS + ISS + PIS/COFINS por dentro; não soma a ele. É o que
 * `TAXES_INSIDE` já documentava — *"'DAS' integra o grupo por dentro porque OCUPA O LUGAR dos
 * outros três"*.
 */

import { calculateMarginReapuration } from '@/utils/margin-reapuration'
import { buildMotorInput } from '@/utils/mrm-orchestrator'
import type { ItemTaxRates } from '@/utils/item-tax-rates'
import type { ReapurationInput, TaxRatePeriod } from '@/types/mrm'

const DAS_TAMARA = 0.0802

const base = (o: Partial<ReapurationInput> & { rb: number }): ReapurationInput => ({
    desc_value: 0,
    regime: 'SIMPLES_NACIONAL',
    rates: [],
    cp: 0,
    mod: 0,
    dop: 0,
    commission_pct: 0.05,
    profit_pct: 0.1,
    csll_pct: 0,
    irpj_pct: 0,
    effective_date: '2026-09-05',
    use_snapshot_rates: true,
    ...o,
})

describe('O oráculo — TAMARA DRESCH a 8,02%', () => {
    // Blazer Alfaiataria, 348,03. 348,03 × 8,02% = 27,9120.
    it('PRODUTO: com `das_pct` o imposto aparece; SEM ele o snapshot sai zerado', () => {
        const com = calculateMarginReapuration(base({ rb: 348.03, das_pct: DAS_TAMARA }))
        const sem = calculateMarginReapuration(base({ rb: 348.03 }))

        expect(com.imp_total).toBeCloseTo(27.912, 3)
        expect(sem.imp_total).toBe(0)
        expect(com.imp_total).not.toBeCloseTo(Number(sem.imp_total), 2)
    })

    it('SERVIÇO: mesma regra pelo `taxable_regime_percent` — 7,095%, o maior do catálogo', () => {
        const com = calculateMarginReapuration(base({ rb: 363.24, das_pct: 0.07095 }))
        const sem = calculateMarginReapuration(base({ rb: 363.24 }))

        expect(com.imp_total).toBeCloseTo(363.24 * 0.07095, 3)
        expect(sem.imp_total).toBe(0)
    })

    it('o RRO cai pelo valor do imposto — a hierarquia abate antes do resíduo', () => {
        const com = calculateMarginReapuration(base({ rb: 348.03, das_pct: DAS_TAMARA }))
        const sem = calculateMarginReapuration(base({ rb: 348.03 }))
        expect(Number(sem.rro) - Number(com.rro)).toBeCloseTo(27.912, 3)
    })

    it('a linha DAS aparece no detalhamento, nomeada', () => {
        const tb = calculateMarginReapuration(base({ rb: 348.03, das_pct: DAS_TAMARA }))
        const linhas = (tb.taxes_inside ?? []) as { type: string; rate_pct: number }[]
        expect(linhas.map((l) => l.type)).toContain('DAS')
        expect(linhas.find((l) => l.type === 'DAS')?.rate_pct).toBeCloseTo(DAS_TAMARA, 5)
    })
})

describe('O DAS SUBSTITUI o grupo por dentro — não soma', () => {
    const ICMS_12: TaxRatePeriod[] = [
        { tax_type: 'ICMS', rate_pct: 0.12, valid_from: '2020-01-01', valid_to: null },
    ] as unknown as TaxRatePeriod[]

    it('com DAS, o ICMS do tenant NÃO entra junto', () => {
        const tb = calculateMarginReapuration(
            base({ rb: 1000, rates: ICMS_12, das_pct: DAS_TAMARA }),
        )
        // 80,20 do DAS sozinho. Se somasse o ICMS, daria 200,20.
        expect(tb.imp_total).toBeCloseTo(80.2, 2)
        const tipos = ((tb.taxes_inside ?? []) as { type: string }[]).map((l) => l.type)
        expect(tipos).toEqual(['DAS'])
    })

    it('sem DAS, o grupo por dentro continua como era — o fallback não sumiu', () => {
        const tb = calculateMarginReapuration(base({ rb: 1000, rates: ICMS_12 }))
        expect(tb.imp_total).toBeCloseTo(120, 2)
        expect(((tb.taxes_inside ?? []) as { type: string }[]).map((l) => l.type)).toContain('ICMS')
    })
})

describe('O guard de regime — o DAS só vale em Simples e MEI', () => {
    it('MEI com alíquota positiva aplica', () => {
        const tb = calculateMarginReapuration(base({ rb: 1000, regime: 'MEI', das_pct: 0.06 }))
        expect(tb.imp_total).toBeCloseTo(60, 2)
    })

    it('LUCRO_PRESUMIDO IGNORA o campo — RET e Híbrido reusam a mesma coluna', () => {
        // É por isso que o guard existe: `custom_tax_percent` tem outra finalidade nesses
        // regimes, e aplicá-la como DAS cobraria um imposto que não existe.
        const comCampo = calculateMarginReapuration(
            base({ rb: 1000, regime: 'LUCRO_PRESUMIDO', das_pct: DAS_TAMARA }),
        )
        const semCampo = calculateMarginReapuration(base({ rb: 1000, regime: 'LUCRO_PRESUMIDO' }))
        expect(comCampo.imp_total).toBeCloseTo(Number(semCampo.imp_total), 5)
    })

    it('alíquota zero é indistinguível de ausente — e deve ser', () => {
        const zero = calculateMarginReapuration(base({ rb: 1000, das_pct: 0 }))
        const ausente = calculateMarginReapuration(base({ rb: 1000 }))
        expect(zero.imp_total).toBe(Number(ausente.imp_total))
    })
})

describe('O construtor único leva o campo — a rota não volta a divergir', () => {
    const TENANT = {
        regime: 'SIMPLES_NACIONAL' as const,
        rates: [] as TaxRatePeriod[],
        useSnapshotRates: true,
    }
    const item = { unit_price: 348.03, quantity: 1, commission_percent: 5, profit_percent: 10 }

    it('`buildMotorInput` transporta o `das_pct` do item', () => {
        const taxas: ItemTaxRates = { das_pct: DAS_TAMARA }
        const input = buildMotorInput({
            item: { ...item, item_tax_rates: taxas },
            tenantCtx: TENANT,
            globalDiscountPercent: 0,
            discountMode: 'PROPORTIONAL',
        })
        expect(input.das_pct).toBeCloseTo(DAS_TAMARA, 5)
        expect(calculateMarginReapuration(input).imp_total).toBeCloseTo(27.912, 3)
    })

    it('item sem alíquota própria continua com imposto zero — e aqui o zero é correto', () => {
        const input = buildMotorInput({
            item: { ...item, item_tax_rates: null },
            tenantCtx: TENANT,
            globalDiscountPercent: 0,
            discountMode: 'PROPORTIONAL',
        })
        expect(input.das_pct).toBe(0)
        expect(calculateMarginReapuration(input).imp_total).toBe(0)
    })

    it('o DAS NÃO vaza para `rates` — vai como escalar, como o campo determina', () => {
        const input = buildMotorInput({
            item: { ...item, item_tax_rates: { das_pct: DAS_TAMARA } },
            tenantCtx: TENANT,
            globalDiscountPercent: 0,
            discountMode: 'PROPORTIONAL',
        })
        const tiposEmRates = (input.rates ?? []).map((r) => (r as { tax_type?: string }).tax_type)
        expect(tiposEmRates).not.toContain('DAS')
    })
})
