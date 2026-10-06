/**
 * OS HORÁRIOS QUE O CLIENTE PODE ESCOLHER — e cada asserção afirma um EFEITO.
 *
 * Comando do PO de 06/10/2026, §1.
 *
 * `agora` é injetado em TODOS os casos. Um caso que dependesse do relógio não poderia afirmar
 * nada sobre antecedência, e ficaria verde ou vermelho conforme a hora em que o CI rodasse —
 * `teste-que-nao-exercita.md`: a asserção precisa FALHAR sem a correção, e só falha se a entrada
 * for fixa.
 *
 * Todas as horas abaixo são relógio de parede em America/Sao_Paulo (UTC−3, sem horário de verão
 * desde 2019). `09:00` local é `12:00Z`, e é assim que os instantes dos fixtures estão escritos.
 */

import { horariosDisponiveis, instanteDoRelogioLocal, weekdayDoDia } from '@/utils/horarios-disponiveis'

// 2026-11-05 é uma QUINTA. weekday 4 na convenção 0=domingo.
const DIA = '2026-11-05'
const QUINTA = 4

/** 09:00–12:00 na quinta. */
const MANHA = { weekday: QUINTA, start_time: '09:00:00', end_time: '12:00:00' }
/** 14:00–18:00 na quinta — o segundo turno. */
const TARDE = { weekday: QUINTA, start_time: '14:00:00', end_time: '18:00:00' }

/** Um instante bem antes do dia, para os casos que não testam antecedência. */
const ONTEM = new Date('2026-11-04T12:00:00Z')

function base(over: Partial<Parameters<typeof horariosDisponiveis>[0]> = {}) {
  return horariosDisponiveis({
    faixas: [MANHA], ausencias: [], ocupados: [], dia: DIA,
    duracaoMin: 30, passoMin: 30, antecedenciaMin: 0, horizonteDias: 30, agora: ONTEM,
    ...over,
  })
}

describe('a convenção do dia da semana', () => {
  it('2026-11-05 é quinta, e quinta é 4 (0 = domingo)', () => {
    // Sem isto, um fixture com o weekday errado faria TODOS os casos devolverem [] e as
    // asserções de ausência e horizonte passariam por motivo errado.
    expect(weekdayDoDia(DIA)).toBe(QUINTA)
  })

  it('o relógio local vira o instante certo — 09:00 em São Paulo é 12:00Z', () => {
    expect(instanteDoRelogioLocal(DIA, 9 * 60).toISOString()).toBe('2026-11-05T12:00:00.000Z')
  })
})

describe('§1.4 — o FIM do atendimento não passa do fim da faixa', () => {
  it('serviço de 60min em 09:00–12:00, passo 30 → o ÚLTIMO horário é 11:00', () => {
    const r = base({ duracaoMin: 60 })
    expect(r).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00'])
    expect(r[r.length - 1]).toBe('11:00')
    // O par negativo é o que mata a mutação M1: sem a regra 4, 11:30 entraria.
    expect(r).not.toContain('11:30')
  })

  it('serviço de 20min na MESMA faixa, passo 30 → o último é 11:30', () => {
    // O mesmo horário que o caso acima recusa, este aceita. É o par que prova que a regra olha a
    // DURAÇÃO e não um limite fixo: 11:30 + 20min = 11:50, que cabe em 12:00.
    const r = base({ duracaoMin: 20 })
    expect(r[r.length - 1]).toBe('11:30')
    expect(r).toContain('11:30')
  })

  it('serviço que não cabe em faixa nenhuma → vazio', () => {
    expect(base({ duracaoMin: 240 })).toEqual([])
  })
})

describe('§1.2 — ausência no dia zera o dia', () => {
  it('ausência cobrindo o dia inteiro → []', () => {
    const r = base({
      ausencias: [{ starts_at: '2026-11-05T03:00:00Z', ends_at: '2026-11-06T02:59:59Z' }],
    })
    expect(r).toEqual([])
  })

  it('ausência cobrindo SÓ A TARDE também zera o dia — férias é DIA INTEIRO', () => {
    // Decisão do PO na fase 1. Oferecer a manhã porque o registro começou ao meio-dia seria
    // oferecer o que o barbeiro não trabalha.
    const r = base({
      ausencias: [{ starts_at: '2026-11-05T15:00:00Z', ends_at: '2026-11-05T21:00:00Z' }],
    })
    expect(r).toEqual([])
  })

  it('ausência em OUTRO dia não interfere — o par que prova que a regra não zera tudo', () => {
    const r = base({
      ausencias: [{ starts_at: '2026-11-10T03:00:00Z', ends_at: '2026-11-11T02:59:59Z' }],
    })
    expect(r.length).toBeGreaterThan(0)
    expect(r).toContain('09:00')
  })
})

describe('§1.6 — sobreposição com o que já está agendado, e encostar NÃO é conflito', () => {
  it('agendado 10:00–10:30: 10:00 NÃO aparece e 10:30 aparece', () => {
    const r = base({
      ocupados: [{ starts_at: '2026-11-05T13:00:00Z', ends_at: '2026-11-05T13:30:00Z' }],
    })
    expect(r).not.toContain('10:00')
    // >>> O PAR É A PROVA, e é ele que mata a mutação M4 <<<
    // 10:30 ENCOSTA no fim do agendado. Com `<=` no lugar de `<` ele seria recusado, e uma agenda
    // cheia perderia metade dos horários.
    expect(r).toContain('10:30')
    expect(r).toContain('09:00')
  })

  it('09:30 FICA: ele termina exatamente às 10:00, e encostar não é conflito', () => {
    // >>> ESTA ASSERÇÃO ESTAVA ERRADA NA PRIMEIRA VERSÃO, E O CÓDIGO ESTAVA CERTO <<<
    // Eu escrevi "09:30 cai porque invade o 10:00". Não invade: 09:30 + 30min termina EM 10:00,
    // que é onde o ocupado começa. É encostar pelo lado de baixo, e a regra 6 o permite — a
    // mesma razão que faz 10:30 ficar. Corrigido o caso, não o código.
    const r = base({
      ocupados: [{ starts_at: '2026-11-05T13:00:00Z', ends_at: '2026-11-05T13:30:00Z' }],
    })
    expect(r).toEqual(['09:00', '09:30', '10:30', '11:00', '11:30'])
  })

  it('com duração 60, o 09:30 CAI — aí sim ele invade o 10:00', () => {
    // O par do caso acima: a mesma grade e o mesmo ocupado, só a duração muda. 09:30 + 60min
    // termina 10:30 e atravessa o agendado inteiro. É o que distingue encostar de invadir.
    const r = base({
      duracaoMin: 60,
      ocupados: [{ starts_at: '2026-11-05T13:00:00Z', ends_at: '2026-11-05T13:30:00Z' }],
    })
    expect(r).not.toContain('09:30')
    expect(r).not.toContain('10:00')
    // >>> 09:00 FICA, e eu também errei isto na primeira tentativa <<<
    // Com 60min, 09:00 termina EM 10:00 — encosta no início do ocupado, não o invade. Duas vezes
    // seguidas a minha conta à mão recusou um horário que encostava, e nas duas o código estava
    // certo. Os números esperados ficam registrados como o código os produz.
    expect(r).toEqual(['09:00', '10:30', '11:00'])
  })
})

describe('§1.5 — antecedência mínima', () => {
  it('antecedência 60 com agora = 09:10 local: 09:30 NÃO aparece, 10:30 aparece', () => {
    // 09:10 local = 12:10Z. Mínimo = 10:10 local. 09:30 e 10:00 caem; 10:30 fica.
    const r = base({ agora: new Date('2026-11-05T12:10:00Z'), antecedenciaMin: 60 })
    expect(r).not.toContain('09:30')
    expect(r).not.toContain('10:00')
    expect(r).toContain('10:30')
    expect(r).toEqual(['10:30', '11:00', '11:30'])
  })

  it('antecedência ZERO no mesmo instante deixa 09:30 entrar — o par da regra', () => {
    // Sem este caso, "09:30 não aparece" passaria num código que recusasse 09:30 por qualquer
    // outro motivo. Aqui só a antecedência mudou.
    const r = base({ agora: new Date('2026-11-05T12:10:00Z'), antecedenciaMin: 0 })
    expect(r).toContain('09:30')
  })
})

describe('§1.1 — horizonte', () => {
  it('dia além de agora + horizonteDias → []', () => {
    expect(base({ agora: new Date('2026-11-01T12:00:00Z'), horizonteDias: 1 })).toEqual([])
  })

  it('o ÚLTIMO dia do horizonte ainda vale — o limite é inclusivo por DIA, não por instante', () => {
    // `agora` é 01/11 ao meio-dia e o horizonte é 4 dias: o dia 05 entra inteiro, inclusive a
    // manhã. Comparar instantes cortaria a manhã do último dia.
    const r = base({ agora: new Date('2026-11-01T12:00:00Z'), horizonteDias: 4 })
    expect(r).toContain('09:00')
  })

  it('dia no PASSADO → []', () => {
    expect(base({ agora: new Date('2026-11-10T12:00:00Z') })).toEqual([])
  })
})

describe('§1.7 — duas faixas, sem duplicata', () => {
  it('manhã e tarde aparecem as duas, em ordem', () => {
    const r = base({ faixas: [MANHA, TARDE], duracaoMin: 60 })
    expect(r).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00',
                       '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'])
  })

  it('faixas que ENCOSTAM não duplicam o horário da junção', () => {
    // 09:00–12:00 e 12:00–15:00: o passo da primeira chega a 12:00 e o início da segunda é 12:00.
    // Sem o Set, 12:00 apareceria duas vezes na tela.
    const COLADA = { weekday: QUINTA, start_time: '12:00:00', end_time: '15:00:00' }
    const r = base({ faixas: [MANHA, COLADA], duracaoMin: 30 })
    expect(r.filter((h) => h === '12:00')).toHaveLength(1)
    expect(new Set(r).size).toBe(r.length)
  })

  it('faixa de OUTRO weekday é ignorada', () => {
    const SEGUNDA = { weekday: 1, start_time: '09:00:00', end_time: '18:00:00' }
    expect(base({ faixas: [SEGUNDA] })).toEqual([])
  })
})

describe('entradas degeneradas não produzem horário inventado', () => {
  it('sem faixa nenhuma → []', () => { expect(base({ faixas: [] })).toEqual([]) })
  it('duração zero ou negativa → []', () => {
    expect(base({ duracaoMin: 0 })).toEqual([])
    expect(base({ duracaoMin: -30 })).toEqual([])
  })
  it('passo zero → [] (e não laço infinito)', () => { expect(base({ passoMin: 0 })).toEqual([]) })
  it('faixa com fim antes do início é ignorada', () => {
    expect(base({ faixas: [{ weekday: QUINTA, start_time: '18:00', end_time: '09:00' }] })).toEqual([])
  })
})
