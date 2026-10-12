/**
 * A TRAVA DO DESCONTO SAI, ENTRA AUTORIZAÇÃO — ESPEC Parte VII.
 *
 * Rodada XI-6, 12/10/2026. A regra inteira é da VII; aqui está o portão dela.
 *
 * ══ O QUE ERA, E O QUE A MEDIÇÃO DO §0 MOSTROU ══════════════════════════════════════════
 *
 * A VII.1 diz que o sistema bloqueia quando a âncora cai abaixo do `LimiteMinimo`. **Não era
 * isso que acontecia.** Medido:
 *
 * 1. `limite_minimo` era calculado em `motor-rro.ts` e **nenhum código de produção o lia**;
 * 2. a trava real era um **clamp no campo**, com outra fórmula — `maxDiscountPercent`
 *    (`orcamentos`), `maxDiscountPercentV` (`vendas`) e `calcMaxDiscountPctAgenda`
 *    (`agenda`) —, e o valor digitado era reduzido por `Math.min` sem recusa visível;
 * 3. **`pedidos` nunca teve clamp**;
 * 4. **ZERO casos** afirmavam que a trava bloqueia. Não havia o que reescrever: havia o que
 *    criar, e é este arquivo.
 *
 * ══ OS DOIS NÚMEROS, E POR QUE O NOVO É MAIOR ═══════════════════════════════════════════
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > O clamp trata custo e despesa como percentual e eles são valor fixo. No MEI eram 23
 *   > pontos de desconto proibidos que ainda deixavam margem.
 */

import { calculateMotorV17 } from '../mrm-engine-v17'
import type { EngineItemV17, MotorV17Input } from '@/types/mrm'
import type { TaxRegime } from '@/supabase/types'
import {
  ROTULO_DA_AUTORIZACAO,
  descontoMaximoFracao,
  estadoDoDesconto,
  limiteMinimoDaOperacao,
  mensagemDoLimite,
  payloadDoRastroDaAutorizacao,
  somaDoDenominador,
  tributosDoLimite,
} from '@/utils/limite-de-desconto'

/**
 * A entrada de referência desta rodada, e cada número dela é distinto dos outros: uma entrada
 * em que o custo fosse igual à despesa, ou a comissão igual ao lucro, não distinguiria qual
 * parcela o limite usou nem qual modo sacrificou quem.
 */
const ITEM: EngineItemV17 = {
  item_id: 'p1', rb: 100_000, cp: 40_000, mod_pct: 0, dop_pct: 0.10,
  commission_pct: 0.05, profit_pct: 0.10, csll_pct: 0, irpj_pct: 0, peso_op_interna: 1,
  taxes_inside_amounts: { icms: 100_000 * 0.17, iss: 0, pis_cofins: 100_000 * 0.0925 },
}

const motor = (descontoFracao: number, policy: MotorV17Input['policy']) =>
  calculateMotorV17({
    items: [ITEM],
    discount: { pct: descontoFracao },
    policy,
    regime: 'LUCRO_REAL',
    rates: [],
    effective_date: '2026-10-12',
    use_snapshot_rates: false,
  })

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(a) O LIMITE É LIDO DA MATRIZ — VII.3, sem nomear regime', () => {
  it('>>> entra no denominador quem é POR_DENTRO e tem base ≠ LUCRO <<<', () => {
    // O par decisivo: Real e Presumido têm IRPJ e CSLL POR_DENTRO nos DOIS, e só o Presumido
    // os traz — porque no Real a base é LUCRO, isto é, resíduo. Sem este caso, "lido da
    // matriz" não distinguiria a regra certa de um `if` por nome de regime.
    const real = [...tributosDoLimite('LUCRO_REAL', 'INDUSTRIALIZACAO')].sort()
    const presumido = [...tributosDoLimite('LUCRO_PRESUMIDO', 'INDUSTRIALIZACAO')].sort()
    expect(real).toEqual(['ICMS', 'PIS_COFINS'])
    expect(presumido).toEqual(['ADICIONAL_IRPJ', 'CSLL', 'ICMS', 'IRPJ', 'PIS_COFINS'])
    expect(real).not.toContain('IRPJ')
    expect(presumido).toContain('IRPJ')
  })

  it('>>> e a tabela VII.3 sai inteira, nos SEIS regimes <<<', () => {
    const esperado: ReadonlyArray<readonly [TaxRegime, readonly string[]]> = [
      ['MEI', []],                                   // "não há imposto por dentro"
      ['SIMPLES_NACIONAL', ['DAS']],
      ['SIMPLES_HIBRIDO', ['DAS_REDUZIDO']],
      ['LUCRO_PRESUMIDO', ['ADICIONAL_IRPJ', 'CSLL', 'ICMS', 'IRPJ', 'PIS_COFINS']],
      ['LUCRO_REAL', ['ICMS', 'PIS_COFINS']],
      // >>> DIVERGÊNCIA MEDIDA CONTRA A TABELA VII.3, e vale a medição <<<
      //
      // A VII.3 escreve o RET como `1 − 4% − RT%`, só o RET. A matriz traz **RET + ISS**,
      // porque o ISS do RET é uma célula EM DISPUTA (`col: ['?','?','?']`,
      // `pendencia: 'PENDENCIA_RET_ISS'`) cujo `vigenteHoje` é `POR_DENTRO`: hoje
      // `calc-tax-preview.ts:176-178` SOMA o ISS ao `retRate` por default
      // (`ret_iss_separate !== false`). O lado é HERDADO, não decidido — portão C9.
      //
      // O limite tem de refletir a operação COMO ELA É APURADA. Deixar o ISS fora deixaria o
      // limite mais FROUXO que a cascata e liberaria desconto que a operação não absorve.
      // Incluí-lo é o lado conservador, e é o que o `vigenteHoje` existe para dizer.
      ['LUCRO_PRESUMIDO_RET', ['ISS', 'RET']],
    ]
    for (const [regime, lista] of esperado) {
      expect(`${regime}: ${[...tributosDoLimite(regime, 'INDUSTRIALIZACAO')].sort().join('+') || '(nenhum)'}`)
        .toBe(`${regime}: ${[...lista].sort().join('+') || '(nenhum)'}`)
    }
  })

  it('alíquota AUSENTE sai em `semAliquota` e não vira zero silencioso', () => {
    // O RET é o caso real: a matriz o manda somar e a alíquota não chega como `TaxRatePeriod`.
    const r = somaDoDenominador({
      regime: 'LUCRO_PRESUMIDO_RET', segmento: 'INDUSTRIALIZACAO', aliquotas: {},
    })
    expect(r.soma).toBe(0)
    expect([...r.semAliquota].sort()).toEqual(['ISS', 'RET'])
    // e com a alíquota presente ela entra e a lista fica vazia — o par que prova que a lista
    // reporta ausência, e não é sempre preenchida
    const r2 = somaDoDenominador({
      regime: 'LUCRO_PRESUMIDO_RET',
      segmento: 'INDUSTRIALIZACAO',
      aliquotas: { RET: 0.04, ISS: 0.05 },
    })
    expect(r2.soma).toBeCloseTo(0.09, 10)
    expect(r2.semAliquota).toEqual([])
  })

  it('>>> o LimiteMinimo com RT%, e o d_máximo da VII.3 <<<', () => {
    // RT entrava de fora: `motor-rro.ts` calculava o denominador SEM ele até 12/10/2026.
    const semRt = limiteMinimoDaOperacao({ cp: 40_000, mod: 0, dop: 10_000, somaInternos: 0.2625, rtPct: 0 })
    const comRt = limiteMinimoDaOperacao({ cp: 40_000, mod: 0, dop: 10_000, somaInternos: 0.2625, rtPct: 0.01 })
    expect(semRt).toBeCloseTo(67_796.6101694915, 6)
    expect(comRt!).toBeGreaterThan(semRt!)   // RT no denominador APERTA o limite
    expect(descontoMaximoFracao({ limiteMinimo: semRt, opDentro: 100_000 })).toBeCloseTo(0.322033898, 8)
  })

  it('denominador ≤ 0 devolve `null`, não um número — e `d_máximo` nunca é negativo', () => {
    expect(limiteMinimoDaOperacao({ cp: 1, mod: 0, dop: 0, somaInternos: 1, rtPct: 0 })).toBeNull()
    expect(descontoMaximoFracao({ limiteMinimo: null, opDentro: 100 })).toBeNull()
    // custo maior que a operação: o máximo é ZERO, nunca abaixo de zero
    expect(descontoMaximoFracao({ limiteMinimo: 200, opDentro: 100 })).toBe(0)
  })

  it('>>> o limite da VII.3 é EXATAMENTE onde o RRO zera — medido no motor <<<', () => {
    // A validação mais forte da fórmula: ela não é uma aproximação, é o ponto de inflexão.
    const dmax = descontoMaximoFracao({
      limiteMinimo: limiteMinimoDaOperacao({ cp: 40_000, mod: 0, dop: 10_000, somaInternos: 0.2625, rtPct: 0 }),
      opDentro: 100_000,
    })!
    expect(motor(dmax, 'RRO_PROPORTIONAL').motor.rro).toBeCloseTo(0, 2)
    // e o par: um ponto percentual acima, o RRO é negativo
    expect(motor(dmax + 0.01, 'RRO_PROPORTIONAL').motor.rro).toBeLessThan(-100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(b) OS TRÊS ESTADOS — VII.2, e só três', () => {
  const max = 0.322033898

  it('>>> verde, amarelo e vermelho autorizado <<<', () => {
    expect(estadoDoDesconto({ descontoFracao: 0.10, descontoMaximoFracao: max, autorizado: false })).toBe('VERDE')
    expect(estadoDoDesconto({ descontoFracao: 0.40, descontoMaximoFracao: max, autorizado: false })).toBe('AMARELO')
    expect(estadoDoDesconto({ descontoFracao: 0.40, descontoMaximoFracao: max, autorizado: true })).toBe('VERMELHO_AUTORIZADO')
  })

  it('>>> o CHECKBOX é o que separa o amarelo do vermelho — mesma entrada, dois estados <<<', () => {
    // Sem este par, "amarelo" e "vermelho" seriam dois rótulos sem mecanismo: é a autorização
    // que muda o estado, e nada mais na entrada muda.
    const comum = { descontoFracao: 0.55, descontoMaximoFracao: max }
    expect(estadoDoDesconto({ ...comum, autorizado: false })).toBe('AMARELO')
    expect(estadoDoDesconto({ ...comum, autorizado: true })).toBe('VERMELHO_AUTORIZADO')
  })

  it('desconto IGUAL ao limite é VERDE — a borda não cai no amarelo por ponto flutuante', () => {
    expect(estadoDoDesconto({ descontoFracao: max, descontoMaximoFracao: max, autorizado: false })).toBe('VERDE')
  })

  it('sem limite calculável é VERDE, nunca amarelo', () => {
    // Travar a venda com base num número que não existe seria pior que não travar.
    expect(estadoDoDesconto({ descontoFracao: 0.99, descontoMaximoFracao: null, autorizado: false })).toBe('VERDE')
  })

  it('a mensagem diz o FATO, com os dois percentuais, e o rótulo é o da VII.2', () => {
    const m = mensagemDoLimite({ descontoFracao: 0.40, limiteFracao: max })
    expect(m).toContain('40,00%')
    expect(m).toContain('32,20%')
    expect(m).toContain('lucro zero')
    expect(m).toContain('entra dinheiro no caixa, não entra resultado')
    expect(ROTULO_DA_AUTORIZACAO).toContain('ciente de que esta venda não tem lucro')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(c) ETAPA 16 — piso zero de EXIBIÇÃO, pelo modo de proteção (VII.4 e VII.5)', () => {
  /** 40% de desconto: âncora 60.000, RRO −5.750,00. Medido. */
  const D = 0.40

  it('>>> as etapas 12 a 15 ficam INALTERADAS: o RRO sai NEGATIVO, como a conta manda <<<', () => {
    // A VII.4 é explícita — zero é piso de exibição, nunca piso da apuração. Se o RRO fosse
    // clampado, o descoberto sairia zero e o buraco desapareceria da conta.
    for (const policy of ['RRO_PROPORTIONAL', 'COMMISSION_PROTECTED', 'PROFIT_PROTECTED'] as const) {
      const r = motor(D, policy)
      expect(r.motor.ancora).toBeCloseTo(60_000, 2)
      expect(r.motor.rro).toBeCloseTo(-5_750, 2)
    }
  })

  it('>>> comissão e lucro NÃO SÃO NEGATIVOS em nenhum dos três modos <<<', () => {
    // ERA O DEFEITO. Medido antes da correção: Proporcional dava −1.916,67 e −3.833,33;
    // Congela Comissão degradava para proporcional (os mesmos negativos); Congela Lucro
    // tinha piso só na comissão e punha os −5.750,00 inteiros no lucro.
    for (const policy of ['RRO_PROPORTIONAL', 'COMMISSION_PROTECTED', 'PROFIT_PROTECTED'] as const) {
      const d = motor(D, policy).distribution
      expect(d.new_commission).toBeGreaterThanOrEqual(0)
      expect(d.new_profit).toBeGreaterThanOrEqual(0)
      expect(d.new_csll).toBeGreaterThanOrEqual(0)
      expect(d.new_irpj).toBeGreaterThanOrEqual(0)
    }
  })

  it('>>> MODO 1 · Proporcional: os dois a ZERO, descoberto = |RRO| <<<', () => {
    const d = motor(D, 'RRO_PROPORTIONAL').distribution
    expect(d.new_commission).toBe(0)
    expect(d.new_profit).toBe(0)
    expect(d.descoberto_autorizado).toBeCloseTo(5_750, 2)
  })

  it('>>> MODO 2 · Congela Comissão: comissão INTEGRAL, lucro zero, descoberto = |RRO| + comissão <<<', () => {
    const d = motor(D, 'COMMISSION_PROTECTED').distribution
    // comissão = com% × âncora = 5% × 60.000 = 3.000
    expect(d.new_commission).toBeCloseTo(3_000, 2)
    expect(d.new_profit).toBe(0)
    expect(d.descoberto_autorizado).toBeCloseTo(5_750 + 3_000, 2)
  })

  it('>>> MODO 3 · Congela Lucro: lucro INTEGRAL, comissão zero, descoberto = |RRO| + lucro <<<', () => {
    const d = motor(D, 'PROFIT_PROTECTED').distribution
    // lucro = luc% × âncora = 10% × 60.000 = 6.000
    expect(d.new_profit).toBeCloseTo(6_000, 2)
    expect(d.new_commission).toBe(0)
    expect(d.descoberto_autorizado).toBeCloseTo(5_750 + 6_000, 2)
  })

  it('>>> CONGELAR AUMENTA O DESCOBERTO, e o modo 1 é SEMPRE o menor dos três <<<', () => {
    // A consequência aritmética que a VII.5 manda aparecer na tela: nos modos 2 e 3 a empresa
    // não só deixa de ganhar — ela PAGA o que congelou com dinheiro que a venda não trouxe.
    const prop = motor(D, 'RRO_PROPORTIONAL').distribution.descoberto_autorizado
    const com = motor(D, 'COMMISSION_PROTECTED').distribution.descoberto_autorizado
    const luc = motor(D, 'PROFIT_PROTECTED').distribution.descoberto_autorizado
    expect(prop).toBeLessThan(com)
    expect(prop).toBeLessThan(luc)
    expect(com).toBeLessThan(luc)   // nesta entrada o lucro (10%) é maior que a comissão (5%)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(d) ETAPA 17 — fecha COM a linha de descoberto, e só com ela', () => {
  it('>>> a identidade de fechamento vale nos três modos <<<', () => {
    // `rro = comissão + lucro + IRPJ + CSLL − descoberto`. É o que a VII.4 chama de "fecha
    // com a linha de descoberto": sem ela, com piso zero, a diferença seria |RRO|.
    for (const policy of ['RRO_PROPORTIONAL', 'COMMISSION_PROTECTED', 'PROFIT_PROTECTED'] as const) {
      const r = motor(0.40, policy)
      const d = r.distribution
      const soma = d.new_commission + d.new_profit + d.new_csll + d.new_irpj - d.descoberto_autorizado
      expect(soma).toBeCloseTo(r.motor.rro, 2)
      // >>> O INVARIANTE QUE VALE É O V6, E ISTO FOI MEDIDO <<<
      //
      // `calculateMotorV17` SUBSTITUI as `validations` que `absorption.ts` monta pelo
      // resultado de `checkAllInvariantsV17`, então o `V4` de lá nunca é lido. Descobri isso
      // editando aquele `V4` e vendo a mutação NÃO ficar vermelha — `portao-que-nao-alcanca.md`
      // dentro da própria correção.
      //
      // O invariante da DISTRIBUIÇÃO é o `V6` (`checkI6DistribuicaoSoma`), e com piso zero
      // SEM o descoberto ele dava `false` nos três modos. Medido.
      expect(d.validations.V6).toBe(true)
      expect(d.validations.V4).toBe(true)
      expect(d.validations.V7).toBe(true)
    }
  })

  it('>>> e SEM a linha a diferença seria |RRO| — o par que prova que ela carrega o buraco <<<', () => {
    // A asserção que impede o caso acima de ser tautológico: ele fecha PORQUE o descoberto
    // está lá, e a diferença sem ele é exatamente o buraco.
    const r = motor(0.40, 'RRO_PROPORTIONAL')
    const d = r.distribution
    const semDescoberto = d.new_commission + d.new_profit + d.new_csll + d.new_irpj
    expect(Math.abs(semDescoberto - r.motor.rro)).toBeCloseTo(5_750, 2)
    expect(d.descoberto_autorizado).toBeCloseTo(5_750, 2)
  })

  it('>>> a LINHA aparece na etapa 16 do trace, com o valor <<<', () => {
    const r = motor(0.40, 'RRO_PROPORTIONAL')
    const etapa16 = r.motor.cascade_trace.find((s) => s.step === 16)!
    const linha = etapa16.children?.find((c) => c.label === 'Descoberto autorizado')
    expect(linha).toBeDefined()
    expect(linha!.amount).toBeCloseTo(5_750, 2)
    // e ela NÃO tem peso: não é parcela da repartição, é o que não cabe nela
    expect(linha!.peso).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(e) DESCONTO ≤ LIMITE: NADA MUDA — caracterização', () => {
  it('>>> com RRO positivo o descoberto é ZERO e a linha NÃO é emitida <<<', () => {
    // Exibir "Descoberto R$ 0,00" num documento dentro do limite afirmaria que houve
    // descoberto e deu nada — `ausente-vs-falso.md`, a mesma razão de `INEXISTENTE` ≠ 0%.
    for (const policy of ['RRO_PROPORTIONAL', 'COMMISSION_PROTECTED', 'PROFIT_PROTECTED'] as const) {
      const r = motor(0.20, policy)
      expect(r.motor.rro).toBeGreaterThan(0)
      expect(r.distribution.descoberto_autorizado).toBe(0)
      const etapa16 = r.motor.cascade_trace.find((s) => s.step === 16)!
      expect(etapa16.children?.some((c) => c.label === 'Descoberto autorizado')).toBe(false)
    }
  })

  it('>>> e os números dos três modos a 20% são ESTES, inalterados pela rodada <<<', () => {
    // Caracterização: medidos antes da correção e repetidos depois. Se qualquer um mover, um
    // documento dentro do limite mudou de valor — que é o que esta rodada promete não fazer.
    const casos: ReadonlyArray<readonly [MotorV17Input['policy'], number, number]> = [
      ['RRO_PROPORTIONAL', 3_000, 6_000],
      ['COMMISSION_PROTECTED', 4_000, 5_000],
      ['PROFIT_PROTECTED', 1_000, 8_000],
    ]
    for (const [policy, com, luc] of casos) {
      const d = motor(0.20, policy).distribution
      expect(`${policy} com=${d.new_commission.toFixed(2)} luc=${d.new_profit.toFixed(2)}`)
        .toBe(`${policy} com=${com.toFixed(2)} luc=${luc.toFixed(2)}`)
    }
  })

  it('e a 0% de desconto, idem — o RRO é 23.750,00 e a repartição é a de sempre', () => {
    const r = motor(0, 'RRO_PROPORTIONAL')
    expect(r.motor.rro).toBeCloseTo(23_750, 2)
    expect(r.distribution.new_commission).toBeCloseTo(7_916.67, 2)
    expect(r.distribution.new_profit).toBeCloseTo(15_833.33, 2)
    expect(r.distribution.descoberto_autorizado).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (f) O RASTRO — ele só existe quando houve autorização, e carrega os cinco campos
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// A asserção que importa é a do VAZIO: um documento verde ou amarelo NÃO pode produzir chave
// nenhuma, porque a chave é gravada por spread dentro do `update` e `consolidated_breakdown:
// null` apagaria o rastro de uma autorização anterior sem que ninguém pedisse. Um caso que só
// afirmasse o preenchimento passaria igual com o produtor devolvendo o objeto sempre.
describe('(f) O RASTRO da autorização', () => {
  const args = {
    autorizadoPor: 'u-1',
    descontoPct: 40,
    limitePct: 32.2033898,
    descoberto: 5_750,
    limiteIncompleto: [] as readonly string[],
  }

  it('>>> VERDE e AMARELO não gravam NADA — nem a chave, nem `null` <<<', () => {
    expect(payloadDoRastroDaAutorizacao({ ...args, estado: 'VERDE' })).toEqual({})
    expect(payloadDoRastroDaAutorizacao({ ...args, estado: 'AMARELO' })).toEqual({})
  })

  it('>>> VERMELHO_AUTORIZADO grava os CINCO campos debaixo de `consolidated_breakdown` <<<', () => {
    const p = payloadDoRastroDaAutorizacao({ ...args, estado: 'VERMELHO_AUTORIZADO' }) as any
    const r = p.consolidated_breakdown?.autorizacao_do_desconto
    expect(r).toBeDefined()
    expect(r.autorizado_por).toBe('u-1')
    expect(r.desconto_pct).toBe(40)
    expect(r.limite_pct).toBeCloseTo(32.2033898, 6)
    expect(r.descoberto).toBe(5_750)
    expect(r.limite_incompleto).toEqual([])
    // `autorizado_em` é ISO 8601 — o rastro sem quando não é rastro.
    expect(Number.isFinite(Date.parse(r.autorizado_em))).toBe(true)
  })

  it('o limite INCOMPLETO viaja junto — sem ele o rastro afirma um limite apurado', () => {
    const p = payloadDoRastroDaAutorizacao({
      ...args,
      estado: 'VERMELHO_AUTORIZADO',
      limiteIncompleto: ['ICMS', 'IBS'],
    }) as any
    expect(p.consolidated_breakdown.autorizacao_do_desconto.limite_incompleto).toEqual(['ICMS', 'IBS'])
  })
})
