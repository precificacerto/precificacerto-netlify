/**
 * Contract Test — Motor V2 (calculateMarginReapuration) ≡ Snapshot Helper (buildItemSnapshot)
 *
 * Story: MRM-V2-S1.4
 * Propósito: garantir que o pipeline de snapshot NÃO diverge do motor.
 *            Para qualquer input válido, executar o motor diretamente deve produzir
 *            o mesmo resultado que executar via `buildItemSnapshot`, dentro da
 *            tolerância R$0,01.
 *
 * Por que isso importa (ADR-003 — Snapshot Fiscal Invariante):
 *   - Quando S1.2 expandir `buildItemSnapshot` com hidratação real (lookup de
 *     alíquotas, persistência em `*_items.tax_breakdown`), este teste continua
 *     vivo como salvaguarda automatizada. Qualquer drift entre snapshot e
 *     recálculo do motor quebra o build antes de chegar em produção.
 *   - Hoje (S1.4) o stub delega 100% ao motor — paridade é trivial. Amanhã
 *     (S1.2+) qualquer regressão no pipeline de snapshot será detectada aqui.
 *
 * Tolerância: R$0,01 absoluto por campo monetário. Mais estrita que o golden
 * test (R$0,02) porque comparamos o MESMO motor consigo mesmo via dois caminhos,
 * não contra valor calculado manualmente.
 *
 * Cenários cobertos (5 — AC da story):
 *   1. LUCRO_REAL, desconto 5%, CSLL/IRPJ > 0
 *   2. SIMPLES_NACIONAL, desconto 10%, CSLL/IRPJ forçados = 0 (guard Q5)
 *   3. MEI sem desconto (guard Q5)
 *   4. LUCRO_PRESUMIDO, desconto 30% (estresse)
 *   5. RRO no limiar (próximo de zero — caso de borda)
 */

import { calculateMarginReapuration } from '../margin-reapuration'
import { buildItemSnapshot } from '@/lib/items-snapshot'
import type { ReapurationInput, TaxBreakdown, TaxRatePeriod, TaxType } from '@/types/mrm'

const MONETARY_EPSILON = 0.01

function rate(tax_type: TaxType, pct: number): TaxRatePeriod {
  return {
    id: `${tax_type}-${pct}`,
    tenant_id: 'tnt-contract',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct: pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: null,
  }
}

/**
 * Compara dois TaxBreakdown campo a campo monetário com tolerância R$0,01
 * e exige igualdade exata para `status`. Erros incluem nome do campo, ambos
 * valores e delta absoluto — facilita debug quando o teste falha.
 */
function assertBreakdownParity(scenario: string, motor: TaxBreakdown, snapshot: TaxBreakdown): void {
  const monetaryFields: Array<keyof TaxBreakdown> = [
    'new_commission',
    'new_profit',
    'new_csll',
    'new_irpj',
    'rro',
    'imp_total',
    'rv',
    'desc_value',
  ]

  for (const field of monetaryFields) {
    const a = Number(motor[field])
    const b = Number(snapshot[field])
    const delta = Math.abs(a - b)
    if (delta > MONETARY_EPSILON) {
      throw new Error(
        `[contract:${scenario}] Campo '${String(field)}' divergente:\n` +
          `  motor    = ${a}\n` +
          `  snapshot = ${b}\n` +
          `  delta    = ${delta} (tolerância: ${MONETARY_EPSILON})`
      )
    }
  }

  if (motor.status !== snapshot.status) {
    throw new Error(
      `[contract:${scenario}] Status divergente: motor='${motor.status}' snapshot='${snapshot.status}'`
    )
  }

  if (motor.valid !== snapshot.valid) {
    throw new Error(
      `[contract:${scenario}] valid divergente: motor=${motor.valid} snapshot=${snapshot.valid}`
    )
  }
}

const DEFAULT_RATES = [rate('ICMS', 0.18), rate('PIS', 0.0165), rate('COFINS', 0.076)]

describe('Contract: motor V2 ≡ buildItemSnapshot (paridade dentro de R$0,01)', () => {
  it('Cenário 1 — LUCRO_REAL, desconto 5%, CSLL/IRPJ > 0', () => {
    const input: ReapurationInput = {
      rb: 141656.68,
      desc_value: 141656.68 * 0.05,
      regime: 'LUCRO_REAL',
      rates: DEFAULT_RATES,
      cp: 60000,
      mod: 5000,
      dop: 12000,
      commission_pct: 0.115,
      profit_pct: 0.23,
      csll_pct: 0.0207,
      irpj_pct: 0.0345,
      effective_date: '2026-05-19',
      use_snapshot_rates: true,
    }

    const motor = calculateMarginReapuration(input)
    const snapshot = buildItemSnapshot(input)

    assertBreakdownParity('LUCRO_REAL', motor, snapshot)
    // Sanidade: CSLL/IRPJ rateados devem ser > 0 em LUCRO_REAL com RRO positivo.
    if (motor.status === 'VALID') {
      expect(motor.new_csll).toBeGreaterThan(0)
      expect(motor.new_irpj).toBeGreaterThan(0)
    }
  })

  it('Cenário 2 — SIMPLES_NACIONAL, desconto 10%, CSLL/IRPJ forçados a 0 (guard Q5)', () => {
    // Caller tenta passar csll/irpj > 0 — motor deve forçar a 0 e snapshot idem.
    const input: ReapurationInput = {
      rb: 50000,
      desc_value: 5000,
      regime: 'SIMPLES_NACIONAL',
      rates: DEFAULT_RATES,
      cp: 20000,
      mod: 0,
      dop: 4000,
      commission_pct: 0.08,
      profit_pct: 0.15,
      csll_pct: 0.0207, // ignorado pelo guard Q5
      irpj_pct: 0.0345, // ignorado pelo guard Q5
      effective_date: '2026-05-19',
      use_snapshot_rates: true,
    }

    // console.warn esperado por causa do guard Q5 — silencia para não poluir output.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const motor = calculateMarginReapuration(input)
      const snapshot = buildItemSnapshot(input)

      assertBreakdownParity('SIMPLES_NACIONAL', motor, snapshot)
      expect(motor.new_csll).toBe(0)
      expect(motor.new_irpj).toBe(0)
      expect(snapshot.new_csll).toBe(0)
      expect(snapshot.new_irpj).toBe(0)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('Cenário 3 — MEI sem desconto (guard Q5)', () => {
    const input: ReapurationInput = {
      rb: 8000,
      desc_value: 0,
      regime: 'MEI',
      rates: [rate('ICMS', 0.07)], // MEI tipicamente DAS único, mas motor é genérico
      cp: 3000,
      mod: 0,
      dop: 800,
      commission_pct: 0.05,
      profit_pct: 0.20,
      // csll_pct/irpj_pct ausentes — default 0, e ainda assim guard Q5 cobre.
      effective_date: '2026-05-19',
      use_snapshot_rates: true,
    }

    const motor = calculateMarginReapuration(input)
    const snapshot = buildItemSnapshot(input)

    assertBreakdownParity('MEI', motor, snapshot)
    expect(motor.new_csll).toBe(0)
    expect(motor.new_irpj).toBe(0)
    // V5 com desconto = 0 ainda passa (rv === rb).
    expect(motor.rv).toBe(motor.rb)
  })

  it('Cenário 4 — LUCRO_PRESUMIDO, desconto 30% (estresse)', () => {
    const input: ReapurationInput = {
      rb: 200000,
      desc_value: 60000, // 30%
      regime: 'LUCRO_PRESUMIDO',
      rates: DEFAULT_RATES,
      cp: 70000,
      mod: 8000,
      dop: 15000,
      commission_pct: 0.10,
      profit_pct: 0.18,
      csll_pct: 0.0288, // LP típico
      irpj_pct: 0.048, // LP típico
      effective_date: '2026-05-19',
      use_snapshot_rates: true,
    }

    const motor = calculateMarginReapuration(input)
    const snapshot = buildItemSnapshot(input)

    assertBreakdownParity('LUCRO_PRESUMIDO_STRESS', motor, snapshot)
  })

  it('Cenário 5 — RRO no limiar (próximo de zero, caso de borda)', () => {
    // Calibrado para forçar RRO ≈ 0 ou negativo, exercitando status RRO_ZERO/NEGATIVE.
    // RV = 10000 - 1000 = 9000
    // IMP (ICMS 18% + PIS 1.65% sequencial + COFINS 7.6% sequencial) ~ R$2.301
    // Sobrou: 9000 - 2301 - 4500 - 0 - 2200 = ~ -1 (perto do limiar)
    const input: ReapurationInput = {
      rb: 10000,
      desc_value: 1000,
      regime: 'LUCRO_PRESUMIDO',
      rates: DEFAULT_RATES,
      cp: 4500,
      mod: 0,
      dop: 2200,
      commission_pct: 0.05,
      profit_pct: 0.10,
      csll_pct: 0.0288,
      irpj_pct: 0.048,
      effective_date: '2026-05-19',
      use_snapshot_rates: true,
    }

    const motor = calculateMarginReapuration(input)
    const snapshot = buildItemSnapshot(input)

    assertBreakdownParity('RRO_LIMIAR', motor, snapshot)
    // Independente do status (VALID ou RRO_NEGATIVE), motor e snapshot devem
    // ESTAR DE ACORDO sobre qual status emitiram.
    expect(snapshot.status).toBe(motor.status)
  })
})
