import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'
import { calculatePricing } from '@/utils/pricing-engine'

/**
 * Trava de regressão da remoção do fallback silencioso de 176h/mês.
 *
 * A mudança deve alterar EXCLUSIVAMENTE o caminho `monthly_workload = 0`. Com carga
 * horária configurada — que é o caso de todo tenant que hoje precifica — o preço tem
 * de ser bit-exact ao produzido pelo código anterior.
 */

/** Réplica exata do cálculo que existia (duplicado) nos quatro call sites. */
function legacyWorkload(raw: number, unit: string, employees: number) {
  const totalEmployees = (employees ?? 0) || 1
  const hoursPerMonth = unit === 'HOURS' ? raw : unit === 'DAYS' ? raw * 8 : raw / 60
  const hoursPerMonthSafe = hoursPerMonth > 0 ? hoursPerMonth : 176
  return { totalEmployees, monthlyWorkloadMinutes: totalEmployees * hoursPerMonthSafe * 60 }
}

const ENGINE_INPUT = {
  calcType: 'INDUSTRIALIZACAO' as const,
  totalItemsCost: 250,
  yieldQuantity: 1,
  laborCostMonthly: 18000,
  productWorkloadMinutes: 45,
  structurePct: 0.12,
  taxPct: 0.06,
  commissionPct: 0.05,
  profitPct: 0.20,
}

describe('remoção do fallback de 176h — paridade com o comportamento anterior', () => {
  const casosConfigurados = [
    { nome: 'tenant em MINUTES (13.200 min/mês, 4 funcionários)', raw: 13200, unit: 'MINUTES', emp: 4 },
    { nome: 'tenant em HOURS (220 h/mês, 3 funcionários)', raw: 220, unit: 'HOURS', emp: 3 },
    { nome: 'tenant em MINUTES (10.560 min/mês, 1 funcionário)', raw: 10560, unit: 'MINUTES', emp: 1 },
    { nome: 'tenant em DAYS (22 dias/mês, 2 funcionários)', raw: 22, unit: 'DAYS', emp: 2 },
  ]

  for (const c of casosConfigurados) {
    it(`${c.nome}: preço BIT-EXACT ao anterior`, () => {
      const legacy = legacyWorkload(c.raw, c.unit, c.emp)
      const novo = resolveMonthlyWorkload(c.raw, c.unit, c.emp)

      expect(novo.totalEmployees).toBe(legacy.totalEmployees)
      expect(novo.monthlyWorkloadMinutes).toBe(legacy.monthlyWorkloadMinutes)
      expect(novo.isUnset).toBe(false)

      const antes = calculatePricing({
        ...ENGINE_INPUT,
        numProductiveEmployees: legacy.totalEmployees,
        monthlyWorkloadMinutes: legacy.monthlyWorkloadMinutes,
      })
      const depois = calculatePricing({
        ...ENGINE_INPUT,
        numProductiveEmployees: novo.totalEmployees,
        monthlyWorkloadMinutes: novo.monthlyWorkloadMinutes,
      })

      // Resultado completo do motor idêntico — não só o preço.
      expect(depois).toEqual(antes)
    })
  }

  it('workload = 0 é o ÚNICO caminho que muda: MO produtiva vai a 0 em vez de assumir 176h', () => {
    const legacy = legacyWorkload(0, 'MINUTES', 2)
    const novo = resolveMonthlyWorkload(0, 'MINUTES', 2)

    // Antes: 176h × 2 func. × 60 = 21.120 min inventados. Agora: 0, estado explícito.
    expect(legacy.monthlyWorkloadMinutes).toBe(21120)
    expect(novo.monthlyWorkloadMinutes).toBe(0)
    expect(novo.isUnset).toBe(true)
  })

  it('workload = 0 não produz NaN nem Infinity no motor (divisor zero tratado)', () => {
    const novo = resolveMonthlyWorkload(0, 'MINUTES', 2)
    const result = calculatePricing({
      ...ENGINE_INPUT,
      numProductiveEmployees: novo.totalEmployees,
      monthlyWorkloadMinutes: novo.monthlyWorkloadMinutes,
    })

    for (const [chave, valor] of Object.entries(result)) {
      if (typeof valor === 'number') {
        expect({ chave, finito: Number.isFinite(valor) }).toEqual({ chave, finito: true })
      }
    }
    expect(result.productiveLaborCost).toBe(0)
  })
})
