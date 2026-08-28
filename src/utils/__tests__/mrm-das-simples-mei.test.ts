/**
 * EPIC-DAS (Simples Nacional / MEI) — o DAS na cascata do Motor RRO.
 *
 * DEFEITO CORRIGIDO: a alíquota consolidada gravada no cadastro
 * (`products.custom_tax_percent` / `services.taxable_regime_percent`) nunca chegava ao
 * motor. As Etapas 7 e 13 saíam zeradas no Simples e o RRO ficava INFLADO — o motor
 * descontava zero de tributo por dentro onde havia DAS a pagar.
 *
 * REGRA: o DAS SUBSTITUI o grupo ICMS+ISS+PIS/COFINS por dentro, nunca soma a ele.
 *   - SIMPLES_NACIONAL / MEI → uma linha DAS no lugar das três; incidência ÚNICA sobre a
 *     Âncora (sem cascata de bases, logo sem a linha "Resultado após ICMS e ISS").
 *   - LR / LP / RET / Híbrido → exatamente os nós de hoje. RET e Simples Híbrido reusam a
 *     coluna `custom_tax_percent` para outra finalidade, mas são mapeados para
 *     LUCRO_PRESUMIDO antes do motor e por isso NUNCA entram no ramo do DAS.
 *
 * A alíquota é POR ITEM e vem gravada do cadastro — o motor usa o valor gravado e NUNCA
 * recalcula pelo anexo.
 */

import { calculateMotorV17, checkAllInvariantsV17 } from '../mrm-engine-v17'
import { TAXES_INSIDE } from '@/types/mrm'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod, TaxRegime } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 'test', tax_type, origin_state: null, dest_state: null,
    rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

/** Item limpo: peso 1 ⇒ âncora = rv_total, isolando a matemática do DAS. */
const baseItem: EngineItemV17 = {
  item_id: 'p1', rb: 100000, cp: 40000, mod_pct: 0, dop_pct: 0.10,
  commission_pct: 0.05, profit_pct: 0.10, csll_pct: 0, irpj_pct: 0,
  peso_op_interna: 1,
}

/** DAS consolidado do item = Op Interna × alíquota gravada. */
function withDas(item: EngineItemV17, dasPct: number): EngineItemV17 {
  return {
    ...item,
    taxes_inside_amounts: { icms: 0, iss: 0, pis_cofins: 0, das: item.rb * dasPct },
  }
}

/** Item de LR com os três tributos clássicos (controle de não-regressão). */
function withClassic(item: EngineItemV17): EngineItemV17 {
  return {
    ...item,
    taxes_inside_amounts: { icms: item.rb * 0.17, iss: 0, pis_cofins: item.rb * 0.0925 },
  }
}

function makeInput(
  items: EngineItemV17[],
  regime: TaxRegime,
  discountPct = 0,
  rates: TaxRatePeriod[] = [],
): MotorV17Input {
  return {
    items,
    discount: { pct: discountPct },
    policy: 'RRO_PROPORTIONAL',
    regime,
    rates,
    effective_date: '2026-08-27',
    use_snapshot_rates: false,
  }
}

const step = (r: ReturnType<typeof calculateMotorV17>, n: number) =>
  r.motor.cascade_trace.find((s) => s.step === n)!

describe('EPIC-DAS — Simples Nacional: DAS substitui o grupo por dentro', () => {
  const DAS_PCT = 0.06
  const run = () => calculateMotorV17(makeInput([withDas(baseItem, DAS_PCT)], 'SIMPLES_NACIONAL'))

  it('o DAS chega ao motor e os três tributos clássicos ficam zerados', () => {
    const r = run()
    expect(r.motor.das).toBeCloseTo(100000 * DAS_PCT, 4)
    expect(r.motor.icms).toBe(0)
    expect(r.motor.iss).toBe(0)
    expect(r.motor.pis_cofins).toBe(0)
    // Substituição, não soma: o total por dentro É o DAS.
    expect(r.motor.imp_dentro_total).toBeCloseTo(r.motor.das!, 6)
  })

  it('o DAS incide DIRETO sobre a âncora (sem cascata de bases)', () => {
    const r = run()
    expect(r.motor.das).toBeCloseTo(r.motor.ancora * DAS_PCT, 4)
  })

  it('RRO desconta o DAS — regressão do bug do RRO inflado', () => {
    const r = run()
    const esperado = r.motor.ancora - r.motor.imp_dentro_total - r.motor.cp_efetivo - r.motor.mod - r.motor.dop
    expect(r.motor.rro).toBeCloseTo(esperado, 4)
    // O bug: sem o DAS o RRO ficava maior exatamente o valor do imposto ignorado.
    const inflado = calculateMotorV17(makeInput([baseItem], 'SIMPLES_NACIONAL'))
    expect(inflado.motor.rro - r.motor.rro).toBeCloseTo(r.motor.das!, 4)
  })

  it('Etapa 7 traz UM filho — Tributos Internos · DAS — no lugar dos três', () => {
    const filhos = step(run(), 7).children ?? []
    expect(filhos).toHaveLength(1)
    expect(filhos[0].label).toContain('DAS')
    expect(filhos[0].amount).toBeCloseTo(100000 * DAS_PCT, 4)
    expect(filhos[0].effective_rate_pct).toBeCloseTo(DAS_PCT, 6)
    expect(filhos.some((c) => c.label.includes('ICMS'))).toBe(false)
    expect(filhos.some((c) => c.label.includes('PIS/COFINS'))).toBe(false)
  })

  it('Etapa 13 traz UMA linha 13A · DAS, sem "Resultado após ICMS e ISS"', () => {
    const s13 = step(run(), 13)
    const filhos = s13.children ?? []
    expect(filhos).toHaveLength(1)
    expect(filhos[0].label).toContain('DAS')
    expect(filhos[0].base).toBeCloseTo(s13.base!, 4)
    expect(filhos[0].amount).toBeCloseTo(-(run().motor.das!), 4)
    // Não há segunda incidência ⇒ a linha-âncora do 13B não faz sentido aqui.
    expect(filhos.some((c) => c.label.includes('Resultado após ICMS e ISS'))).toBe(false)
  })

  it('as etapas continuam íntegras e os invariantes passam', () => {
    const r = run()
    expect(r.motor.cascade_trace).toHaveLength(17)
    // V3 (I-3, soma da cascata) agora soma os QUATRO; V4 é a identidade do RRO.
    const inv = checkAllInvariantsV17({ view: r.consolidated, motor: r.motor, distribution: r.distribution })
    expect(inv.V3).toBe(true)
    expect(inv.V4).toBe(true)
    expect(inv.V5).toBe(true)
  })

  it('o DAS acompanha o desconto pelo mesmo fator da âncora', () => {
    const semDesc = run()
    const comDesc = calculateMotorV17(makeInput([withDas(baseItem, DAS_PCT)], 'SIMPLES_NACIONAL', 10))
    expect(comDesc.motor.das).toBeCloseTo(comDesc.motor.ancora * DAS_PCT, 4)
    expect(comDesc.motor.das!).toBeLessThan(semDesc.motor.das!)
  })
})

describe('EPIC-DAS — MEI: alíquota 0 com a linha PRESENTE', () => {
  const run = () => calculateMotorV17(makeInput([withDas(baseItem, 0)], 'MEI'))

  it('DAS = 0 e nenhum tributo por dentro', () => {
    const r = run()
    expect(r.motor.das).toBe(0)
    expect(r.motor.imp_dentro_total).toBe(0)
  })

  it('a linha zerada NÃO some da Etapa 7 (não é apagada por filtro)', () => {
    const filhos = step(run(), 7).children ?? []
    expect(filhos).toHaveLength(1)
    expect(filhos[0].label).toContain('DAS')
    expect(filhos[0].amount).toBe(0)
  })

  it('a linha zerada NÃO some da Etapa 13', () => {
    const filhos = step(run(), 13).children ?? []
    expect(filhos).toHaveLength(1)
    expect(filhos[0].label).toContain('DAS')
    expect(filhos[0].amount).toBe(-0)
  })

  it('guard Q5 preservado: IRPJ e CSLL seguem zerados no MEI', () => {
    const r = run()
    expect(r.distribution.new_csll).toBe(0)
    expect(r.distribution.new_irpj).toBe(0)
  })
})

describe('EPIC-DAS — fallback por alíquota (snapshot reidratado)', () => {
  it('sem consolidado por item, usa ancora × das_rate vindo dos rates', () => {
    const r = calculateMotorV17(
      makeInput([baseItem], 'SIMPLES_NACIONAL', 0, [rate('DAS', 0.06)]),
    )
    expect(r.motor.das).toBeCloseTo(r.motor.ancora * 0.06, 4)
    expect(r.motor.imp_dentro_total).toBeCloseTo(r.motor.das!, 6)
  })

  it("round-trip de snapshot: 'DAS' é um TaxType válido e pertence ao grupo por dentro", () => {
    // Reabrir orçamento do Simples faz `line.type as TaxType` sobre a linha DAS salva.
    const salvo = { type: 'DAS' as const, rate_pct: 0.06, base: 100000, amount: 6000 }
    const reidratado = rate(salvo.type, salvo.rate_pct)
    expect(reidratado.tax_type).toBe('DAS')
    expect(TAXES_INSIDE).toContain('DAS')

    // E a alíquota reidratada reproduz o mesmo DAS pelo caminho de fallback.
    const r = calculateMotorV17(makeInput([baseItem], 'SIMPLES_NACIONAL', 0, [reidratado]))
    expect(r.motor.das).toBeCloseTo(r.motor.ancora * 0.06, 4)
  })
})

describe('EPIC-DAS — segregação de regime (não vaza para fora do escopo)', () => {
  it.each<TaxRegime>(['LUCRO_REAL', 'LUCRO_PRESUMIDO'])(
    '%s: DAS = 0 e os três tributos clássicos permanecem',
    (regime) => {
      const r = calculateMotorV17(makeInput([withClassic(baseItem)], regime))
      expect(Number(r.motor.das) || 0).toBe(0)
      expect(r.motor.icms).toBeGreaterThan(0)
      expect(r.motor.imp_dentro_total).toBeCloseTo(r.motor.icms + r.motor.iss + r.motor.pis_cofins, 6)
    },
  )

  it('RET e Simples Híbrido chegam como LUCRO_PRESUMIDO ⇒ ramo clássico, nunca DAS', () => {
    // `mapToMotorRegime` converte ambos para LUCRO_PRESUMIDO. Mesmo que a coluna
    // `custom_tax_percent` traga valor (ela é reusada por esses regimes), o item entra no
    // ramo clássico e o DAS não é aplicado.
    const itemComColunaPreenchida: EngineItemV17 = {
      ...withClassic(baseItem),
      taxes_inside_amounts: { icms: baseItem.rb * 0.17, iss: 0, pis_cofins: baseItem.rb * 0.0925, das: baseItem.rb * 0.09 },
    }
    const r = calculateMotorV17(makeInput([itemComColunaPreenchida], 'LUCRO_PRESUMIDO'))
    expect(Number(r.motor.das) || 0).toBe(0)
    expect(r.motor.imp_dentro_total).toBeCloseTo(r.motor.icms + r.motor.pis_cofins, 4)
  })

  it('LUCRO_REAL é BIT-EXACT ao resultado sem o campo DAS', () => {
    const semCampo = calculateMotorV17(makeInput([withClassic(baseItem)], 'LUCRO_REAL'))
    const comCampoZero = calculateMotorV17(
      makeInput(
        [{ ...baseItem, taxes_inside_amounts: { icms: baseItem.rb * 0.17, iss: 0, pis_cofins: baseItem.rb * 0.0925, das: 0 } }],
        'LUCRO_REAL',
      ),
    )
    expect(comCampoZero.motor.rro).toBe(semCampo.motor.rro)
    expect(comCampoZero.motor.imp_dentro_total).toBe(semCampo.motor.imp_dentro_total)
    expect(comCampoZero.motor.cascade_trace[12].children).toHaveLength(4)
  })
})
