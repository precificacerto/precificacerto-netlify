/**
 * UMA FAIXA, VÁRIOS DIAS — e o tudo-ou-nada.
 *
 * Comando do PO de 06/10/2026, §5.
 *
 * >>> O QUE CADA CASO TEM DE DISTINGUIR <<<
 *
 * `teste-que-nao-exercita.md`: afirmar que a função devolveu `ok: false` não é afirmar que ela
 * NÃO GRAVOU NADA. Um utilitário que devolvesse as quatro faixas boas junto com `ok: false`
 * passaria numa asserção sobre o `ok` e falharia a regra — é por isso que o caso do conflito
 * afirma o CONTEÚDO devolvido, não só o sinal.
 *
 * E o espelho é obrigatório: três dias SEM conflito têm de devolver três faixas. Sem ele,
 * "nunca devolve faixa" ficaria verde num utilitário que recusa tudo.
 */

import {
  ERRO_HORA_INVERTIDA,
  ERRO_SEM_DIA,
  adicionarFaixaEmDias,
  faixaEmDiasRecusada,
  type FaixaHorario,
} from '@/utils/adicionar-faixa-multiplos-dias'

const DOM = 0
const SEG = 1
const TER = 2
const QUA = 3
const QUI = 4
const SEX = 5
const SAB = 6

/** Quem está em conflito e quem não está, lido do retorno sem precisar de cast. */
function conflitos(r: ReturnType<typeof adicionarFaixaEmDias>): number[] {
  if (!faixaEmDiasRecusada(r)) throw new Error('esperava recusa e veio ok:true')
  return r.diasEmConflito
}

function faixas(r: ReturnType<typeof adicionarFaixaEmDias>): FaixaHorario[] {
  if (faixaEmDiasRecusada(r)) throw new Error('esperava ok:true e veio recusa')
  return r.novasFaixas
}

describe('3 dias marcados, nenhum conflito', () => {
  it('devolve 3 faixas, com os weekdays certos e as horas pedidas', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [],
    })
    expect(r.ok).toBe(true)
    expect(faixas(r)).toEqual([
      { weekday: 1, start_time: '09:00', end_time: '18:00' },
      { weekday: 3, start_time: '09:00', end_time: '18:00' },
      { weekday: 5, start_time: '09:00', end_time: '18:00' },
    ])
  })

  it('a grade de OUTROS dias não interfere — e é isto que a mutação M2 mata', () => {
    // Existe faixa na TERÇA e no SÁBADO; nenhum dos dois está entre os escolhidos. Se a
    // verificação ignorasse o `weekday`, estes dois bloqueariam os três pedidos.
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [
        { weekday: TER, start_time: '09:00', end_time: '18:00' },
        { weekday: SAB, start_time: '10:00', end_time: '14:00' },
      ],
    })
    expect(r.ok).toBe(true)
    expect(faixas(r)).toHaveLength(3)
  })
})

describe('3 dias marcados, conflito em 1 — TUDO OU NADA', () => {
  it('devolve ok:false, diasEmConflito só com aquele dia, e NENHUMA faixa', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '10:00',
      fim: '14:00',
      faixasExistentes: [{ weekday: QUA, start_time: '13:00', end_time: '17:00' }],
    })
    expect(r.ok).toBe(false)
    expect(conflitos(r)).toEqual([QUA])

    // >>> A PROVA DO TUDO-OU-NADA: o retorno NÃO traz as faixas de segunda e sexta <<<
    // Afirmar só `ok: false` não distinguiria "abortou" de "devolveu as duas boas e avisou".
    expect((r as any).novasFaixas).toBeUndefined()
  })

  it('conflito só na QUARTA: segunda e sexta estariam livres, e mesmo assim nada volta', () => {
    // O mesmo caso, dito pelo outro lado: a função é CAPAZ de montar as duas faixas livres —
    // o caso anterior desta suíte prova que com `faixasExistentes: []` ela devolve três. O
    // retorno vazio aqui é escolha da regra, não incapacidade.
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '10:00',
      fim: '14:00',
      faixasExistentes: [{ weekday: QUA, start_time: '13:00', end_time: '17:00' }],
    })
    expect(faixaEmDiasRecusada(r)).toBe(true)
    expect(conflitos(r)).toHaveLength(1)
    expect(conflitos(r)[0]).toBe(QUA)
  })

  it('conflito em DOIS dias: os dois aparecem, e os livres continuam de fora', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '10:00',
      fim: '14:00',
      faixasExistentes: [
        { weekday: QUA, start_time: '13:00', end_time: '17:00' },
        { weekday: SEX, start_time: '08:00', end_time: '11:00' },
      ],
    })
    expect(conflitos(r)).toEqual([QUA, SEX])
    expect((r as any).novasFaixas).toBeUndefined()
  })
})

describe('ENCOSTAR não é conflito — o barbeiro de dois turnos', () => {
  it('09:00–12:00 já existe e 12:00–18:00 entra', () => {
    // É a mutação M1: trocar `<` por `<=` recusaria esta faixa, e a tabela ficaria inútil
    // justamente no caso que ela existe para representar.
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '12:00',
      fim: '18:00',
      faixasExistentes: [{ weekday: SEG, start_time: '09:00', end_time: '12:00' }],
    })
    expect(r.ok).toBe(true)
    expect(faixas(r)).toEqual([{ weekday: 1, start_time: '12:00', end_time: '18:00' }])
  })

  it('encostar pelo OUTRO lado também passa: 06:00–09:00 antes de 09:00–12:00', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '06:00',
      fim: '09:00',
      faixasExistentes: [{ weekday: SEG, start_time: '09:00', end_time: '12:00' }],
    })
    expect(r.ok).toBe(true)
  })

  it('e UM MINUTO de invasão é conflito — o par que prova que o critério não é frouxo', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '11:59',
      fim: '18:00',
      faixasExistentes: [{ weekday: SEG, start_time: '09:00', end_time: '12:00' }],
    })
    expect(r.ok).toBe(false)
    expect(conflitos(r)).toEqual([SEG])
  })
})

describe('nenhum dia marcado', () => {
  it('ok:false com a mensagem do dia, e sem conflito nenhum', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [],
    })
    expect(r.ok).toBe(false)
    if (!faixaEmDiasRecusada(r)) throw new Error('inalcançável')
    expect(r.erro).toBe(ERRO_SEM_DIA)
    expect(r.diasEmConflito).toEqual([])
  })

  it('a ORDEM das regras importa: sem dia e com hora invertida, a queixa é do DIA', () => {
    // A regra 1 vem antes da 2 no comando. Trocar a ordem faria a tela pedir para corrigir a
    // hora quando o que falta é marcar o dia.
    const r = adicionarFaixaEmDias({
      diasSelecionados: [],
      inicio: '18:00',
      fim: '09:00',
      faixasExistentes: [],
    })
    if (!faixaEmDiasRecusada(r)) throw new Error('inalcançável')
    expect(r.erro).toBe(ERRO_SEM_DIA)
  })
})

describe('fim <= inicio', () => {
  it('fim ANTES do início é recusado', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG], inicio: '18:00', fim: '09:00', faixasExistentes: [],
    })
    expect(r.ok).toBe(false)
    if (!faixaEmDiasRecusada(r)) throw new Error('inalcançável')
    expect(r.erro).toBe(ERRO_HORA_INVERTIDA)
  })

  it('fim IGUAL ao início é recusado — faixa de duração zero', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG], inicio: '10:00', fim: '10:00', faixasExistentes: [],
    })
    expect(r.ok).toBe(false)
  })

  it('hora impossível também cai aqui: 25:00 e 09:70', () => {
    // A comparação é por MINUTOS, não por string. `'25:00' < '26:00'` seria `true` em texto, e
    // a faixa entraria com uma hora que não existe.
    for (const [i, f] of [['25:00', '26:00'], ['09:70', '10:00']]) {
      const r = adicionarFaixaEmDias({
        diasSelecionados: [SEG], inicio: i, fim: f, faixasExistentes: [],
      })
      expect(r.ok).toBe(false)
    }
  })

  it('sem zero à esquerda NÃO inverte a comparação: 9:30 contra 10:00 é válido', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG], inicio: '9:30', fim: '10:00', faixasExistentes: [],
    })
    expect(r.ok).toBe(true)
  })
})

describe('os SETE dias, e o domingo = 0', () => {
  it('marcar os sete devolve sete faixas, de 0 a 6', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [DOM, SEG, TER, QUA, QUI, SEX, SAB],
      inicio: '08:00', fim: '18:00', faixasExistentes: [],
    })
    expect(faixas(r).map((f) => f.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('o DOMINGO é 0 e não é confundido com "não informado"', () => {
    // `[0]` é uma lista com um elemento, não uma lista vazia. Um `if (!dia)` em algum ponto
    // trataria domingo como ausência de dia.
    const r = adicionarFaixaEmDias({
      diasSelecionados: [DOM], inicio: '08:00', fim: '12:00', faixasExistentes: [],
    })
    expect(r.ok).toBe(true)
    expect(faixas(r)).toEqual([{ weekday: 0, start_time: '08:00', end_time: '12:00' }])
  })
})
