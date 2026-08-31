import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'

/**
 * Fonte única da conversão de `tenant_settings.monthly_workload`.
 * Antes, os quatro call sites substituíam em SILÊNCIO carga horária ausente por
 * 176h/mês — precificando sobre um número inventado. Aqui a ausência é um estado
 * explícito (`isUnset`) e `monthlyWorkloadMinutes` é 0, nunca um default.
 */
describe('resolveMonthlyWorkload', () => {
  describe('conversão por unidade', () => {
    it('HOURS: valor já está em horas', () => {
      const r = resolveMonthlyWorkload(176, 'HOURS', 1)
      expect(r.hoursPerMonth).toBe(176)
      expect(r.monthlyWorkloadMinutes).toBe(10560)
      expect(r.isUnset).toBe(false)
    })

    it('MINUTES: valor em minutos vira horas (÷ 60)', () => {
      const r = resolveMonthlyWorkload(10560, 'MINUTES', 1)
      expect(r.hoursPerMonth).toBe(176)
      expect(r.monthlyWorkloadMinutes).toBe(10560)
      expect(r.isUnset).toBe(false)
    })

    it('DAYS: valor em dias vira horas (× 8)', () => {
      const r = resolveMonthlyWorkload(22, 'DAYS', 1)
      expect(r.hoursPerMonth).toBe(176)
      expect(r.monthlyWorkloadMinutes).toBe(10560)
      expect(r.isUnset).toBe(false)
    })

    it('aceita unidade em minúsculas (normaliza para maiúsculas)', () => {
      expect(resolveMonthlyWorkload(176, 'hours', 1).hoursPerMonth).toBe(176)
      expect(resolveMonthlyWorkload(22, 'days', 1).hoursPerMonth).toBe(176)
    })

    it('unidade nula cai no caminho MINUTES (÷ 60), igual aos 3 call sites originais', () => {
      const r = resolveMonthlyWorkload(10560, null, 1)
      expect(r.hoursPerMonth).toBe(176)
      expect(r.monthlyWorkloadMinutes).toBe(10560)
      expect(r.isUnset).toBe(false)
    })

    it('unidade desconhecida (ACTIVITIES) cai no caminho MINUTES (÷ 60)', () => {
      const r = resolveMonthlyWorkload(10560, 'ACTIVITIES', 1)
      expect(r.hoursPerMonth).toBe(176)
      expect(r.monthlyWorkloadMinutes).toBe(10560)
      expect(r.isUnset).toBe(false)
    })

    it('unidade undefined cai no caminho MINUTES (÷ 60)', () => {
      expect(resolveMonthlyWorkload(600, undefined, 1).hoursPerMonth).toBe(10)
    })
  })

  describe('carga horária não configurada — SEM fallback de 176h', () => {
    it('workload 0 marca isUnset e NÃO inventa 176h', () => {
      const r = resolveMonthlyWorkload(0, 'HOURS', 5)
      expect(r.isUnset).toBe(true)
      expect(r.hoursPerMonth).toBe(0)
      expect(r.monthlyWorkloadMinutes).toBe(0)
      expect(r.totalEmployees).toBe(5)
    })

    it('workload 0 marca isUnset em todas as unidades', () => {
      for (const unit of ['HOURS', 'MINUTES', 'DAYS', 'ACTIVITIES', null, undefined]) {
        const r = resolveMonthlyWorkload(0, unit, 1)
        expect(r.isUnset).toBe(true)
        expect(r.monthlyWorkloadMinutes).toBe(0)
      }
    })

    it('workload null/undefined marca isUnset', () => {
      expect(resolveMonthlyWorkload(null, 'HOURS', 1).isUnset).toBe(true)
      expect(resolveMonthlyWorkload(undefined, 'HOURS', 1).isUnset).toBe(true)
      expect(resolveMonthlyWorkload(null, 'HOURS', 1).monthlyWorkloadMinutes).toBe(0)
    })

    it('workload negativo marca isUnset e zera os minutos (nunca minutos negativos)', () => {
      const r = resolveMonthlyWorkload(-176, 'HOURS', 3)
      expect(r.isUnset).toBe(true)
      expect(r.monthlyWorkloadMinutes).toBe(0)
      expect(r.hoursPerMonth).toBe(-176)
    })

    it('workload NaN marca isUnset', () => {
      const r = resolveMonthlyWorkload(Number.NaN, 'HOURS', 1)
      expect(r.isUnset).toBe(true)
      expect(r.monthlyWorkloadMinutes).toBe(0)
    })

    it('workload em string não numérica marca isUnset', () => {
      const r = resolveMonthlyWorkload('abc' as unknown as number, 'HOURS', 1)
      expect(r.isUnset).toBe(true)
      expect(r.monthlyWorkloadMinutes).toBe(0)
    })
  })

  describe('nº de funcionários produtivos', () => {
    it('0 funcionários vira 1 (mínimo), preservando o comportamento anterior', () => {
      const r = resolveMonthlyWorkload(176, 'HOURS', 0)
      expect(r.totalEmployees).toBe(1)
      expect(r.monthlyWorkloadMinutes).toBe(10560)
    })

    it('funcionários null/undefined vira 1', () => {
      expect(resolveMonthlyWorkload(176, 'HOURS', null).totalEmployees).toBe(1)
      expect(resolveMonthlyWorkload(176, 'HOURS', undefined).totalEmployees).toBe(1)
    })

    it('funcionários negativo vira 1 (mínimo), nunca minutos negativos', () => {
      const r = resolveMonthlyWorkload(176, 'HOURS', -4)
      expect(r.totalEmployees).toBe(1)
      expect(r.monthlyWorkloadMinutes).toBe(10560)
    })

    it('multiplica os minutos da empresa pelo nº de funcionários', () => {
      const r = resolveMonthlyWorkload(176, 'HOURS', 5)
      expect(r.totalEmployees).toBe(5)
      expect(r.monthlyWorkloadMinutes).toBe(52800)
    })
  })

  describe('sanidade numérica — nada de NaN/Infinity chegando à tela', () => {
    it('todos os campos numéricos são finitos em qualquer combinação de entrada', () => {
      const workloads = [0, -1, 176, 10560, null, undefined, Number.NaN]
      const units = ['HOURS', 'MINUTES', 'DAYS', 'ACTIVITIES', '', null, undefined]
      const employees = [0, -3, 1, 12, null, undefined]

      for (const w of workloads) {
        for (const u of units) {
          for (const e of employees) {
            const r = resolveMonthlyWorkload(w, u, e)
            expect(Number.isFinite(r.hoursPerMonth)).toBe(true)
            expect(Number.isFinite(r.monthlyWorkloadMinutes)).toBe(true)
            expect(Number.isFinite(r.totalEmployees)).toBe(true)
            expect(r.monthlyWorkloadMinutes).toBeGreaterThanOrEqual(0)
            expect(r.totalEmployees).toBeGreaterThanOrEqual(1)
            // isUnset é a única fonte de verdade: se true, minutos são exatamente 0
            expect(r.isUnset).toBe(r.monthlyWorkloadMinutes === 0)
          }
        }
      }
    })
  })

  describe('paridade com o comportamento anterior quando configurado', () => {
    it('tenant em MINUTES com carga configurada produz os MESMOS minutos de antes', () => {
      // Comportamento legado: hoursPerMonth = raw / 60; hoursPerMonthSafe = hoursPerMonth (> 0)
      // monthlyWorkloadMinutes = totalEmployees * hoursPerMonthSafe * 60
      const raw = 13200, employees = 4
      const legacyHours = raw / 60
      const legacyMinutes = employees * legacyHours * 60
      const r = resolveMonthlyWorkload(raw, 'MINUTES', employees)
      expect(r.hoursPerMonth).toBe(legacyHours)
      expect(r.monthlyWorkloadMinutes).toBe(legacyMinutes)
    })

    it('tenant em HOURS com carga configurada produz os MESMOS minutos de antes', () => {
      const raw = 220, employees = 3
      expect(resolveMonthlyWorkload(raw, 'HOURS', employees).monthlyWorkloadMinutes).toBe(employees * raw * 60)
    })
  })
})
