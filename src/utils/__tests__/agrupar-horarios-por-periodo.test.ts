/**
 * O AGRUPAMENTO DOS HORÁRIOS POR PERÍODO.
 *
 * Comando do PO de 09/10/2026.
 *
 * >>> AS DUAS MUTAÇÕES QUE ESTE PORTÃO TEM DE SOBREVIVER <<<
 *
 *   M25 — 12:00 cair em MANHÃ        → o caso do limite TEM que ficar vermelho
 *   M26 — devolver período vazio     → o caso "só tarde" TEM que ficar vermelho
 *
 * Cada asserção mede EFEITO: o que sai da função. Nenhuma afirma que ela foi chamada.
 *
 * ── POR QUE OS QUATRO LIMITES TÊM CASO SEPARADO ───────────────────────────────────────────
 *
 * `teste-que-nao-exercita.md`, variante 2: um caso com `['10:00','15:00','20:00']` fica verde
 * com a fronteira em 11:00, 12:00 ou 13:00 — ele não DISTINGUE onde ela está. Só o par
 * `11:59`/`12:00` distingue, e é por isso que os quatro limites são quatro casos e não um.
 */

import {
  agruparHorariosPorPeriodo,
  type GrupoDePeriodo,
} from '@/utils/agrupar-horarios-por-periodo'

/** Atalho de leitura: só os nomes dos períodos que saíram, na ordem em que saíram. */
function periodos(gs: GrupoDePeriodo[]): string[] {
  return gs.map((g) => g.periodo)
}

describe('lista vazia', () => {
  it('devolve `[]` — nenhum grupo, nenhum título', () => {
    expect(agruparHorariosPorPeriodo([])).toEqual([])
  })

  it('e entrada nula ou indefinida também, sem lançar', () => {
    // A tela chama isto com o estado `horarios`, que nasce `[]` mas pode chegar de uma resposta
    // malformada. Um throw aqui deixaria a página branca para quem só queria marcar um horário.
    expect(agruparHorariosPorPeriodo(null as any)).toEqual([])
    expect(agruparHorariosPorPeriodo(undefined as any)).toEqual([])
  })
})

describe('>>> PERÍODO SEM HORÁRIO NÃO APARECE — É A MUTAÇÃO M26 <<<', () => {
  it('só horários de TARDE devolvem UM grupo só, e ele é `TARDE`', () => {
    // >>> O CASO QUE A M26 MATA <<<
    // Devolver `{ periodo: 'MANHÃ', horarios: [] }` junto faria o `toHaveLength(1)` cair.
    const g = agruparHorariosPorPeriodo(['14:00', '14:30', '15:00'])
    expect(g).toHaveLength(1)
    expect(g[0].periodo).toBe('TARDE')
    expect(g[0].horarios).toEqual(['14:00', '14:30', '15:00'])
    // e a afirmação pelo outro lado: MANHÃ e NOITE não estão lá de forma nenhuma
    expect(periodos(g)).toEqual(['TARDE'])
    expect(JSON.stringify(g)).not.toContain('MANHÃ')
    expect(JSON.stringify(g)).not.toContain('NOITE')
  })

  it('só de MANHÃ: um grupo, `MANHÃ`', () => {
    expect(agruparHorariosPorPeriodo(['09:00', '11:30'])).toEqual([
      { periodo: 'MANHÃ', horarios: ['09:00', '11:30'] },
    ])
  })

  it('só de NOITE: um grupo, `NOITE`', () => {
    expect(agruparHorariosPorPeriodo(['19:00', '19:30'])).toEqual([
      { periodo: 'NOITE', horarios: ['19:00', '19:30'] },
    ])
  })

  it('MANHÃ e NOITE sem TARDE: dois grupos, e a TARDE não entra no meio vazia', () => {
    // O buraco no meio é o caso que um "sempre devolve os três" erraria de forma mais visível.
    const g = agruparHorariosPorPeriodo(['09:00', '20:00'])
    expect(periodos(g)).toEqual(['MANHÃ', 'NOITE'])
  })

  it('NENHUM grupo devolvido tem lista vazia — a invariante, dita de uma vez', () => {
    // A asserção estrutural que vale mesmo quando os casos acima mudarem de forma.
    for (const entrada of [[], ['09:00'], ['14:00'], ['19:00'], ['09:00', '14:00', '19:00']]) {
      for (const g of agruparHorariosPorPeriodo(entrada)) {
        expect(g.horarios.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('>>> OS QUATRO LIMITES — É A MUTAÇÃO M25 <<<', () => {
  it('11:59 é MANHÃ', () => {
    // >>> ESTE E O DE BAIXO SÃO O PAR QUE A M25 MATA <<<
    // Com a fronteira errada, um dos dois vai para o período errado — e é só o PAR que
    // distingue: `11:59` sozinho fica verde com a fronteira em 12:00 OU em 13:00.
    expect(agruparHorariosPorPeriodo(['11:59'])).toEqual([
      { periodo: 'MANHÃ', horarios: ['11:59'] },
    ])
  })

  it('12:00 é TARDE', () => {
    expect(agruparHorariosPorPeriodo(['12:00'])).toEqual([
      { periodo: 'TARDE', horarios: ['12:00'] },
    ])
  })

  it('17:59 é TARDE', () => {
    expect(agruparHorariosPorPeriodo(['17:59'])).toEqual([
      { periodo: 'TARDE', horarios: ['17:59'] },
    ])
  })

  it('18:00 é NOITE', () => {
    expect(agruparHorariosPorPeriodo(['18:00'])).toEqual([
      { periodo: 'NOITE', horarios: ['18:00'] },
    ])
  })

  it('e os quatro JUNTOS caem em dois grupos, 2 e 2 — o par que fixa as duas fronteiras', () => {
    // O caso que falha se QUALQUER uma das duas fronteiras andar um minuto.
    const g = agruparHorariosPorPeriodo(['11:59', '12:00', '17:59', '18:00'])
    expect(g).toEqual([
      { periodo: 'MANHÃ', horarios: ['11:59'] },
      { periodo: 'TARDE', horarios: ['12:00', '17:59'] },
      { periodo: 'NOITE', horarios: ['18:00'] },
    ])
  })

  it('00:00 é MANHÃ e 23:59 é NOITE — os extremos do dia', () => {
    expect(agruparHorariosPorPeriodo(['00:00'])[0].periodo).toBe('MANHÃ')
    expect(agruparHorariosPorPeriodo(['23:59'])[0].periodo).toBe('NOITE')
  })
})

describe('a ORDEM — dos grupos e dentro deles', () => {
  it('os três períodos saem na ordem MANHÃ, TARDE, NOITE', () => {
    expect(periodos(agruparHorariosPorPeriodo(['09:00', '14:00', '19:00'])))
      .toEqual(['MANHÃ', 'TARDE', 'NOITE'])
  })

  it('>>> E A ORDEM NÃO VEM DA ENTRADA: NOITE primeiro na entrada sai por último <<<', () => {
    // Sem este caso, "sai na ordem certa" ficaria verde numa função que só preservasse a ordem
    // de chegada — o que é indistinguível quando a entrada já vem ordenada.
    expect(periodos(agruparHorariosPorPeriodo(['19:00', '14:00', '09:00'])))
      .toEqual(['MANHÃ', 'TARDE', 'NOITE'])
  })

  it('dentro do período, crescente, mesmo com a entrada fora de ordem', () => {
    const g = agruparHorariosPorPeriodo(['10:30', '09:00', '11:00', '09:30'])
    expect(g[0].horarios).toEqual(['09:00', '09:30', '10:30', '11:00'])
  })

  it('a ordenação é por MINUTO, não por texto — `9:00` vem antes de `10:00`', () => {
    // `horaParaMinutos` aceita `H:MM`, então a entrada pode não ser zero-preenchida. Ordenar
    // texto poria `'9:00'` depois de `'10:00'`.
    const g = agruparHorariosPorPeriodo(['10:00', '9:00', '11:00'])
    expect(g[0].horarios).toEqual(['9:00', '10:00', '11:00'])
  })

  it('a entrada NÃO é mutada — a tela guarda a lista original no estado', () => {
    const entrada = ['11:00', '09:00']
    agruparHorariosPorPeriodo(entrada)
    expect(entrada).toEqual(['11:00', '09:00'])
  })
})

describe('entrada que não é hora', () => {
  it('é DESCARTADA, e não vira grupo nem quebra os válidos', () => {
    // A rota devolve `string[]` bem formado; isto é a borda. Descartar é o certo: um grupo
    // com `'abc'` poria um chip clicável que o POST recusaria.
    const g = agruparHorariosPorPeriodo(['', 'abc', '25:00', '09:61', '09:00'])
    expect(g).toEqual([{ periodo: 'MANHÃ', horarios: ['09:00'] }])
  })

  it('e uma lista SÓ de lixo devolve `[]`, não um grupo vazio', () => {
    expect(agruparHorariosPorPeriodo(['abc', '99:99'])).toEqual([])
  })
})

describe('o caso REAL da tela, com os três períodos cheios', () => {
  it('reproduz o desenho do comando, bloco a bloco', () => {
    const g = agruparHorariosPorPeriodo([
      '09:00', '09:30', '10:00', '10:30', '11:00',
      '14:00', '14:30', '15:00', '15:30',
      '19:00', '19:30',
    ])
    expect(g).toEqual([
      { periodo: 'MANHÃ', horarios: ['09:00', '09:30', '10:00', '10:30', '11:00'] },
      { periodo: 'TARDE', horarios: ['14:00', '14:30', '15:00', '15:30'] },
      { periodo: 'NOITE', horarios: ['19:00', '19:30'] },
    ])
    // e a soma fecha: nenhum horário foi perdido nem duplicado no agrupamento
    expect(g.flatMap((x) => x.horarios)).toHaveLength(11)
  })
})
