/**
 * MOTOR 2 (Simples Nacional / MEI) — a REGRA da cascata, travada por teste.
 *
 * O "Motor 2" é o Motor RRO rodando sob regime do Simples: mesma cascata de 17 etapas,
 * mas com UM tributo por dentro no lugar de três. A regra completa:
 *
 *   1. As 17 etapas existem SEMPRE — o Simples não suprime nem renumera nenhuma delas.
 *   2. O DAS SUBSTITUI o grupo ICMS + ISS + PIS/COFINS por dentro. Nunca soma a ele:
 *      no Simples os três são ZERO e o total por dentro É o DAS.
 *   3. A incidência é ÚNICA — o DAS incide direto sobre a Âncora, sem cascata de bases.
 *      Logo a linha "= Resultado após ICMS e ISS" (que só existe para basear a segunda
 *      incidência do PIS/COFINS) NÃO aparece.
 *   4. As Etapas 7 e 13 exibem UMA linha, a do DAS — inclusive no MEI, onde a alíquota é
 *      zero e a linha permanece presente com valor zero.
 *   5. A Etapa 16 redistribui o RRO com peso para COMISSÃO e LUCRO; IRPJ e CSLL ficam
 *      zerados (não existem em separado no Simples), mas as LINHAS continuam na cascata.
 *   6. Não há tributo POR FORA: `taxes_outside` vazio, Etapa 17 sem filhos, valor final
 *      igual à âncora.
 *   7. LUCRO REAL tem estrutura DIFERENTE e permanece intocado — é o controle de
 *      não-regressão de toda a regra acima.
 */

import { calculateMotorV17, checkAllInvariantsV17 } from '../mrm-engine-v17'
import type { EngineItemV17, MotorV17Input, MotorV17Result, TaxRegime } from '@/types/mrm'

const DAS_PCT = 0.06

/** Item limpo: peso_op_interna = 1 ⇒ âncora = rv_total, isolando a matemática do regime. */
const ITEM_BASE: EngineItemV17 = {
  item_id: 'p1',
  rb: 100000,
  cp: 40000,
  mod_pct: 0,
  dop_pct: 0.1,
  commission_pct: 0.05,
  profit_pct: 0.1,
  csll_pct: 0,
  irpj_pct: 0,
  peso_op_interna: 1,
}

/** Item do Simples/MEI: só DAS por dentro (alíquota consolidada gravada no cadastro). */
function comDas(dasPct: number): EngineItemV17 {
  return {
    ...ITEM_BASE,
    taxes_inside_amounts: { icms: 0, iss: 0, pis_cofins: 0, das: ITEM_BASE.rb * dasPct },
  }
}

/** Item de Lucro Real: os três tributos clássicos + IRPJ/CSLL estruturais. */
const ITEM_LR: EngineItemV17 = {
  ...ITEM_BASE,
  csll_pct: 0.009,
  irpj_pct: 0.015,
  taxes_inside_amounts: {
    icms: ITEM_BASE.rb * 0.17,
    iss: 0,
    pis_cofins: ITEM_BASE.rb * 0.0925,
  },
}

function input(items: EngineItemV17[], regime: TaxRegime, discountPct = 0): MotorV17Input {
  return {
    items,
    discount: { pct: discountPct },
    policy: 'RRO_PROPORTIONAL',
    regime,
    rates: [],
    effective_date: '2026-08-28',
    use_snapshot_rates: false,
  }
}

const simples = (discountPct = 0) =>
  calculateMotorV17(input([comDas(DAS_PCT)], 'SIMPLES_NACIONAL', discountPct))
const mei = () => calculateMotorV17(input([comDas(0)], 'MEI'))
const lucroReal = () => calculateMotorV17(input([ITEM_LR], 'LUCRO_REAL'))

const etapa = (r: MotorV17Result, n: number) => r.motor.cascade_trace.find((s) => s.step === n)!
const filhos = (r: MotorV17Result, n: number) => etapa(r, n).children ?? []
const rotulos = (r: MotorV17Result, n: number) => filhos(r, n).map((c) => c.label)

describe('Regra 1 — a cascata tem SEMPRE 17 etapas', () => {
  it.each<[string, () => MotorV17Result]>([
    ['SIMPLES_NACIONAL', () => simples()],
    ['MEI', mei],
  ])('%s: 17 etapas, nem uma a menos', (_regime, run) => {
    expect(run().motor.cascade_trace).toHaveLength(17)
  })

  it('o desconto comercial não suprime nenhuma etapa', () => {
    expect(simples(15).motor.cascade_trace).toHaveLength(17)
  })

  it('a numeração vai de 1 a 17, sem buraco e sem renumeração', () => {
    const steps = simples().motor.cascade_trace.map((s) => s.step)
    expect(steps).toEqual(Array.from({ length: 17 }, (_, i) => i + 1))
  })

  it('os invariantes do motor passam no Simples', () => {
    const r = simples()
    const inv = checkAllInvariantsV17({
      view: r.consolidated,
      motor: r.motor,
      distribution: r.distribution,
    })
    expect(inv.V3).toBe(true)
    expect(inv.V4).toBe(true)
    expect(inv.V5).toBe(true)
  })
})

describe('Regra 2 — o DAS SUBSTITUI ICMS + ISS + PIS/COFINS (nunca soma)', () => {
  it('o DAS chega ao motor com o valor consolidado do cadastro', () => {
    expect(simples().motor.das).toBeCloseTo(100000 * DAS_PCT, 4)
  })

  it('os três tributos clássicos ficam zerados', () => {
    const m = simples().motor
    expect(m.icms).toBe(0)
    expect(m.iss).toBe(0)
    expect(m.pis_cofins).toBe(0)
  })

  it('o total por dentro É o DAS — substituição, não quarto balde aditivo', () => {
    const m = simples().motor
    expect(m.imp_dentro_total).toBeCloseTo(m.das!, 6)
  })

  it('a incidência é ÚNICA: DAS = âncora × alíquota, sem cascata de bases', () => {
    const m = simples().motor
    expect(m.das).toBeCloseTo(m.ancora * DAS_PCT, 4)
  })

  it('o RRO desconta o DAS (regressão do RRO inflado)', () => {
    const m = simples().motor
    const esperado = m.ancora - m.imp_dentro_total - m.cp_efetivo - m.mod - m.dop
    expect(m.rro).toBeCloseTo(esperado, 4)
  })

  it('o DAS acompanha o desconto pelo mesmo fator da âncora', () => {
    const comDesconto = simples(15).motor
    expect(comDesconto.das).toBeCloseTo(comDesconto.ancora * DAS_PCT, 4)
    expect(comDesconto.das!).toBeLessThan(simples().motor.das!)
  })

  it('MEI: alíquota zero ⇒ DAS zero e nenhum tributo por dentro', () => {
    const m = mei().motor
    expect(m.das).toBe(0)
    expect(m.imp_dentro_total).toBe(0)
  })
})

describe('Regra 4a — Etapa 7 exibe UMA linha, a do DAS', () => {
  it('um único filho na Etapa 7', () => {
    expect(filhos(simples(), 7)).toHaveLength(1)
  })

  it('o filho é o DAS, com o valor consolidado por dentro', () => {
    const [linha] = filhos(simples(), 7)
    expect(linha.label).toContain('DAS')
    expect(linha.amount).toBeCloseTo(100000 * DAS_PCT, 4)
  })

  it('não existe filho de ICMS, ISS nem PIS/COFINS na Etapa 7', () => {
    const labels = rotulos(simples(), 7).join(' | ')
    expect(labels).not.toContain('ICMS')
    expect(labels).not.toContain('ISS')
    expect(labels).not.toContain('PIS/COFINS')
  })

  it('MEI: a linha zerada NÃO é apagada por filtro', () => {
    const linhas = filhos(mei(), 7)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].label).toContain('DAS')
    expect(linhas[0].amount).toBe(0)
  })
})

describe('Regra 3 + 4b — Etapa 13: incidência única, sem "Resultado após ICMS e ISS"', () => {
  it('uma única linha 13A · DAS', () => {
    const linhas = filhos(simples(), 13)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].label).toContain('DAS')
  })

  it('a linha "= Resultado após ICMS e ISS" NÃO aparece — não há segunda incidência', () => {
    expect(rotulos(simples(), 13).join(' | ')).not.toContain('Resultado após ICMS e ISS')
  })

  it('a base do 13A é a própria âncora (nada foi subtraído antes)', () => {
    const r = simples()
    const [linha] = filhos(r, 13)
    expect(linha.base).toBeCloseTo(r.motor.ancora, 6)
    expect(linha.base).toBeCloseTo(etapa(r, 13).base!, 6)
  })

  it('a Etapa 13 desconta exatamente o DAS', () => {
    const r = simples()
    expect(etapa(r, 13).amount).toBeCloseTo(-r.motor.das!, 4)
  })

  it('MEI: a linha 13A · DAS permanece, com valor zero', () => {
    const linhas = filhos(mei(), 13)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].label).toContain('DAS')
    expect(Math.abs(linhas[0].amount)).toBe(0)
  })
})

describe('Regra 5 — Etapa 16: peso para comissão e lucro; IRPJ/CSLL zerados e PRESENTES', () => {
  const s16 = () => filhos(simples(), 16)

  it('as quatro linhas continuam na cascata, nesta ordem', () => {
    expect(s16().map((c) => c.label)).toEqual(['Comissão', 'Lucro', 'IRPJ', 'CSLL'])
  })

  it('comissão e lucro têm peso > 0', () => {
    const [comissao, lucro] = s16()
    expect(comissao.peso!).toBeGreaterThan(0)
    expect(lucro.peso!).toBeGreaterThan(0)
  })

  it('os pesos saem da precificação — comissão 5% e lucro 10% ⇒ razão 1:2', () => {
    const [comissao, lucro] = s16()
    expect(comissao.peso!).toBeCloseTo(1 / 3, 10)
    expect(lucro.peso!).toBeCloseTo(2 / 3, 10)
  })

  it('IRPJ e CSLL têm peso ZERO — não existem em separado no Simples', () => {
    const [, , irpj, csll] = s16()
    expect(irpj.peso).toBe(0)
    expect(csll.peso).toBe(0)
  })

  it('IRPJ e CSLL saem com valor zero, mas as LINHAS não somem', () => {
    const [, , irpj, csll] = s16()
    expect(irpj.amount).toBe(0)
    expect(csll.amount).toBe(0)
    const d = simples().distribution
    expect(d.new_irpj).toBe(0)
    expect(d.new_csll).toBe(0)
  })

  it('a redistribuição fecha com o RRO: comissão + lucro = RRO', () => {
    const r = simples()
    expect(r.distribution.new_commission + r.distribution.new_profit).toBeCloseTo(r.motor.rro, 4)
  })
})

describe('Regra 6 — nada POR FORA no Simples', () => {
  it('nenhuma linha de tributo por fora', () => {
    expect(simples().distribution.taxes_outside).toHaveLength(0)
  })

  it('total por fora = 0', () => {
    expect(simples().distribution.taxes_outside_total).toBe(0)
  })

  it('a Etapa 17 (consolidação final) não tem filhos a redistribuir', () => {
    expect(filhos(simples(), 17)).toHaveLength(0)
  })

  it('o valor final é a própria âncora — nada é acrescido por fora', () => {
    const r = simples()
    expect(r.distribution.valor_final).toBeCloseTo(r.motor.ancora, 4)
  })
})

describe('Regra 7 — LUCRO REAL tem estrutura DIFERENTE e permanece intocado', () => {
  it('Etapa 7: os três tributos clássicos, não uma linha de DAS', () => {
    const labels = rotulos(lucroReal(), 7)
    expect(labels).toHaveLength(3)
    expect(labels.join(' | ')).toContain('ICMS')
    expect(labels.join(' | ')).not.toContain('DAS')
  })

  it('Etapa 13: quatro nós, com a linha "= Resultado após ICMS e ISS" presente', () => {
    const labels = rotulos(lucroReal(), 13)
    expect(labels).toHaveLength(4)
    expect(labels.join(' | ')).toContain('Resultado após ICMS e ISS')
    expect(labels.join(' | ')).toContain('PIS/COFINS')
  })

  it('DAS ausente e o total por dentro volta a ser a soma dos três', () => {
    const m = lucroReal().motor
    expect(Number(m.das) || 0).toBe(0)
    expect(m.imp_dentro_total).toBeCloseTo(m.icms + m.iss + m.pis_cofins, 6)
  })

  it('Etapa 16: IRPJ e CSLL com peso e valor > 0 — o oposto do Simples', () => {
    const [, , irpj, csll] = filhos(lucroReal(), 16)
    expect(irpj.peso!).toBeGreaterThan(0)
    expect(csll.peso!).toBeGreaterThan(0)
    expect(irpj.amount).toBeGreaterThan(0)
    expect(csll.amount).toBeGreaterThan(0)
  })

  it('BIT-EXACT: o campo `das` zerado não move nada no Lucro Real', () => {
    const semCampo = lucroReal()
    const comCampoZero = calculateMotorV17(
      input(
        [{ ...ITEM_LR, taxes_inside_amounts: { ...ITEM_LR.taxes_inside_amounts!, das: 0 } }],
        'LUCRO_REAL',
      ),
    )
    expect(comCampoZero.motor.rro).toBe(semCampo.motor.rro)
    expect(comCampoZero.motor.imp_dentro_total).toBe(semCampo.motor.imp_dentro_total)
    expect(comCampoZero.distribution.new_irpj).toBe(semCampo.distribution.new_irpj)
  })
})
