/**
 * Tests — MRM Shadow-Mode (Story MRM-V2-S3.1)
 *
 * Cobre os 9 cenários da story:
 *   TC1: client e edge iguais → nenhuma row em mrm_engine_divergences
 *   TC2: diff > epsilon → row com diff_amount e fields_diverged
 *   TC3: diff < epsilon → nenhuma row
 *   TC4: timeout → row com error_reason='timeout'
 *   TC5: edge http_error → row com error_reason='http_error'
 *   TC6: network error → row com error_reason='network'
 *   TC7: flag OFF → zero invocações, zero rows
 *   TC8: RRO grande, epsilon dinâmico maior, diff abaixo NÃO conta
 *   TC9: RRO pequeno, epsilon mínimo R$0,01, diff acima conta
 *
 * Garantia crítica (regressão): `runShadowComparison` NUNCA modifica
 * `clientOutput` (passado por referência).
 */

import { runShadowComparison, compareMotorResults } from '../mrm-shadow'
import type { ReapurationInput, TaxBreakdown } from '@/types/mrm'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/supabase/client', () => {
  const insertMock = jest.fn(() => Promise.resolve({ error: null }))
  const fromMock = jest.fn(() => ({ insert: insertMock }))
  const invokeMock = jest.fn()
  return {
    supabase: {
      from: fromMock,
      functions: { invoke: invokeMock },
    },
    __mocks: { insertMock, fromMock, invokeMock },
  }
})

jest.mock('@/config/feature-flags', () => {
  const flags = { 'mrm.shadow_mode_enabled': true, 'mrm.legacy_modes_visible': false }
  return {
    FEATURE_FLAGS: flags,
    isFeatureEnabled: (k: keyof typeof flags) => flags[k],
    __setFlag: (k: keyof typeof flags, v: boolean) => {
      flags[k] = v
    },
  }
})

// Acessores tipados para os mocks
function getSupabaseMocks() {
  const mod = jest.requireMock('@/supabase/client') as {
    __mocks: {
      insertMock: jest.Mock
      fromMock: jest.Mock
      invokeMock: jest.Mock
    }
  }
  return mod.__mocks
}

function setShadowEnabled(value: boolean) {
  const mod = jest.requireMock('@/config/feature-flags') as {
    __setFlag: (k: 'mrm.shadow_mode_enabled', v: boolean) => void
  }
  mod.__setFlag('mrm.shadow_mode_enabled', value)
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeMotorInput(): ReapurationInput {
  return {
    rb: 10000,
    desc_value: 1000,
    regime: 'LUCRO_PRESUMIDO',
    rates: [],
    cp: 4500,
    mod: 0,
    dop: 1200,
    commission_pct: 0.05,
    profit_pct: 0.1,
    effective_date: '2026-05-19',
    use_snapshot_rates: true,
  }
}

function makeClientBreakdown(overrides: Partial<TaxBreakdown> = {}): TaxBreakdown {
  return {
    engine_version: '2.1.0',
    effective_date: '2026-05-19',
    regime: 'LUCRO_PRESUMIDO',
    use_snapshot_rates: true,
    taxes_inside: [],
    taxes_outside: [],
    rb: 10000,
    desc_value: 1000,
    rv: 9000,
    cp: 4500,
    mod: 0,
    dop: 1200,
    imp_total: 1800,
    rro: 1500,
    new_commission: 500,
    new_profit: 1000,
    new_csll: 0,
    new_irpj: 0,
    validations: { V1: true, V2: true, V3: true, V4: true, V5: true, V6: true },
    valid: true,
    status: 'VALID',
    error_code: null,
    messages: [],
    ...overrides,
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  const { insertMock, fromMock, invokeMock } = getSupabaseMocks()
  insertMock.mockClear()
  fromMock.mockClear()
  invokeMock.mockClear()
  insertMock.mockImplementation(() => Promise.resolve({ error: null }))
  setShadowEnabled(true)
})

// ─── compareMotorResults (pure, sem mock necessário) ────────────────────────

describe('compareMotorResults — epsilon dinâmico', () => {
  it('TC8: RRO=1.000.000, diff R$0,50 abaixo do epsilon NÃO conta', () => {
    const client = makeClientBreakdown({
      rro: 1_000_000,
      new_commission: 333_333,
      new_profit: 666_667,
      imp_total: 50_000,
      rv: 1_050_000,
    })
    const edge: Partial<TaxBreakdown> = {
      rro: 1_000_000.5, // diff 0.50
      new_commission: 333_333,
      new_profit: 666_667,
      new_csll: 0,
      new_irpj: 0,
      imp_total: 50_000,
      rv: 1_050_000,
    }
    const result = compareMotorResults(client, edge)
    // epsilon = max(0.01, 1_000_000 * 1e-6) = 1.0 → 0.50 < 1.0 → SEM divergência
    expect(result.epsilon_used).toBeCloseTo(1.0, 5)
    expect(result.has_divergence).toBe(false)
  })

  it('TC9: RRO=10, diff R$0,02 acima do epsilon mínimo R$0,01 CONTA', () => {
    const client = makeClientBreakdown({
      rro: 10,
      new_commission: 3.33,
      new_profit: 6.67,
      imp_total: 2,
      rv: 12,
    })
    const edge: Partial<TaxBreakdown> = {
      rro: 10,
      new_commission: 3.33,
      new_profit: 6.69, // diff 0.02
      new_csll: 0,
      new_irpj: 0,
      imp_total: 2,
      rv: 12,
    }
    const result = compareMotorResults(client, edge)
    // epsilon = max(0.01, 10 * 1e-6) = 0.01 → 0.02 > 0.01 → divergência
    expect(result.epsilon_used).toBeCloseTo(0.01, 5)
    expect(result.has_divergence).toBe(true)
    expect(result.fields_diverged).toContain('new_profit')
  })

  it('detecta divergência em RRO quando diff > epsilon', () => {
    const client = makeClientBreakdown({ rro: 1500 })
    const edge: Partial<TaxBreakdown> = { rro: 1505 } // diff 5 > epsilon 0.01
    const result = compareMotorResults(client, edge)
    expect(result.has_divergence).toBe(true)
    expect(result.fields_diverged).toContain('rro')
    expect(result.diff_amount).toBeGreaterThan(0)
  })

  it('sem divergência quando todos os campos batem', () => {
    const client = makeClientBreakdown()
    const edge: Partial<TaxBreakdown> = {
      rro: client.rro,
      new_commission: client.new_commission,
      new_profit: client.new_profit,
      new_csll: client.new_csll,
      new_irpj: client.new_irpj,
      imp_total: client.imp_total,
      rv: client.rv,
    }
    const result = compareMotorResults(client, edge)
    expect(result.has_divergence).toBe(false)
    expect(result.fields_diverged).toEqual([])
  })
})

// ─── runShadowComparison ────────────────────────────────────────────────────

describe('runShadowComparison — TC7: flag OFF', () => {
  it('quando mrm.shadow_mode_enabled=false, função é no-op (zero invoke, zero insert)', async () => {
    setShadowEnabled(false)
    const { invokeMock, insertMock } = getSupabaseMocks()

    const input = makeMotorInput()
    const client = makeClientBreakdown()

    await runShadowComparison(input, client)

    expect(invokeMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe('runShadowComparison — TC1: sem divergência', () => {
  it('quando edge bate com cliente dentro do epsilon, NÃO insere row', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()
    const client = makeClientBreakdown()

    invokeMock.mockResolvedValueOnce({
      data: {
        rro: client.rro,
        new_commission: client.new_commission,
        new_profit: client.new_profit,
        new_csll: client.new_csll,
        new_irpj: client.new_irpj,
        imp_total: client.imp_total,
        rv: client.rv,
      },
      error: null,
    })

    await runShadowComparison(makeMotorInput(), client)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe('runShadowComparison — TC2: divergência > epsilon', () => {
  it('insere row com fields_diverged populado e divergence_type=numeric_divergence', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()
    const client = makeClientBreakdown({ rro: 18580.3 })

    invokeMock.mockResolvedValueOnce({
      data: {
        rro: 18581.0, // diff 0.70 > epsilon max(0.01, 18580.3 * 1e-6) ≈ 0.0186
        new_commission: client.new_commission,
        new_profit: client.new_profit,
        new_csll: 0,
        new_irpj: 0,
        imp_total: client.imp_total,
        rv: client.rv,
      },
      error: null,
    })

    await runShadowComparison(makeMotorInput(), client, {
      tenant_id: 'tnt-1',
      document_id: 'doc-1',
      document_type: 'budget',
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.divergence_type).toBe('numeric_divergence')
    expect(row.fields_diverged).toContain('rro')
    expect(row.diff_amount).toBeCloseTo(0.7, 2)
    expect(row.tenant_id).toBe('tnt-1')
    expect(row.document_id).toBe('doc-1')
    expect(row.document_type).toBe('budget')
    expect(row.motor_version_client).toBe('2.4.0')
  })
})

describe('runShadowComparison — TC3: divergência < epsilon', () => {
  it('quando diff (R$0,005) está abaixo do epsilon mínimo R$0,01, NÃO insere row', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()
    const client = makeClientBreakdown({ rro: 1500 })

    invokeMock.mockResolvedValueOnce({
      data: {
        rro: 1500.005, // diff 0.005 < epsilon max(0.01, 1500e-6)=0.01
        new_commission: client.new_commission,
        new_profit: client.new_profit + 0.003, // diff 0.003 < 0.01
        new_csll: 0,
        new_irpj: 0,
        imp_total: client.imp_total,
        rv: client.rv,
      },
      error: null,
    })

    await runShadowComparison(makeMotorInput(), client)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe('runShadowComparison — TC4: timeout', () => {
  it('loga edge_unavailable com error_reason=timeout quando edge passa do timeoutMs', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()
    const client = makeClientBreakdown()

    // Edge demora 200ms; timeout configurado para 50ms
    invokeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: { rro: 0 }, error: null }), 200)
        }),
    )

    await runShadowComparison(makeMotorInput(), client, { timeoutMs: 50 })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.divergence_type).toBe('edge_unavailable')
    expect(row.error_reason).toBe('timeout')
    expect(row.edge_output).toBeNull()
    expect(row.shadow_duration_ms).toBeGreaterThanOrEqual(50)
  })
})

describe('runShadowComparison — TC5: edge http_error', () => {
  it('loga edge_unavailable com error_reason=http_error quando edge retorna error', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()
    const client = makeClientBreakdown()

    invokeMock.mockResolvedValueOnce({ data: null, error: { message: '500 internal' } })

    await runShadowComparison(makeMotorInput(), client)

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.divergence_type).toBe('edge_unavailable')
    expect(row.error_reason).toBe('http_error')
    expect(row.edge_error).toBe('500 internal')
  })
})

describe('runShadowComparison — TC6: network error', () => {
  it('loga edge_unavailable com error_reason=network quando invoke rejeita', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()
    const client = makeClientBreakdown()

    invokeMock.mockImplementationOnce(() => Promise.reject(new Error('fetch failed')))

    await runShadowComparison(makeMotorInput(), client)

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.divergence_type).toBe('edge_unavailable')
    expect(row.error_reason).toBe('network')
    expect(row.edge_error).toContain('fetch failed')
  })
})

describe('runShadowComparison — regressão crítica (ADR-001)', () => {
  it('NUNCA modifica clientOutput, mesmo quando edge diverge brutalmente', async () => {
    const { invokeMock } = getSupabaseMocks()
    const client = makeClientBreakdown({ rro: 1500, new_profit: 1000 })
    const snapshotBefore = JSON.parse(JSON.stringify(client))

    invokeMock.mockResolvedValueOnce({
      data: { rro: 99999, new_profit: 99999, new_commission: 99999 },
      error: null,
    })

    await runShadowComparison(makeMotorInput(), client)

    expect(client).toEqual(snapshotBefore)
    expect(client.rro).toBe(1500)
    expect(client.new_profit).toBe(1000)
  })

  it('NUNCA lança exceção visível (insert que joga é engolido)', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()
    insertMock.mockImplementationOnce(() => {
      throw new Error('table does not exist')
    })
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'whatever' } })

    await expect(runShadowComparison(makeMotorInput(), makeClientBreakdown())).resolves.toBeUndefined()
  })

  it('output incompatível (sem campos MRM) é tratado como edge_unavailable', async () => {
    const { invokeMock, insertMock } = getSupabaseMocks()

    invokeMock.mockResolvedValueOnce({
      // Resposta da edge calc-tax-engine legada — sem `rro`
      data: { success: true, pricing: { priceUnit: 100, coefficient: 2.0 } },
      error: null,
    })

    await runShadowComparison(makeMotorInput(), makeClientBreakdown())

    expect(insertMock).toHaveBeenCalledTimes(1)
    const row = insertMock.mock.calls[0][0]
    expect(row.divergence_type).toBe('edge_unavailable')
    expect(row.edge_error).toBe('edge_output_shape_incompatible')
  })
})
