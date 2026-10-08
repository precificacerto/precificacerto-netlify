/**
 * A ORDEM DAS AUSÊNCIAS — e a distinção entre PASSADA e EM CURSO.
 *
 * Comando do PO de 08/10/2026, quarta rodada.
 *
 * >>> `agora` É INJETADO EM TODO CASO, E NENHUM CHAMA `new Date()` <<<
 *
 * Com o relógio real, a mesma fixture mudaria de resultado na virada do dia e o caso passaria
 * hoje e falharia amanhã. É a mesma forma de `horarios-disponiveis.test.ts`, e ela já tem
 * portão lá: todas as datas abaixo são relativas a `AGORA`, fixo.
 *
 * >>> O CASO "EM CURSO" É O ÚNICO QUE DISTINGUE `ends_at` DE `starts_at` <<<
 *
 * Numa ausência inteiramente futura, ou inteiramente passada, os dois critérios dão o mesmo
 * resultado. Só a que começou antes e termina depois os separa — e é por isso que ela é o caso
 * da mutação M14.
 */

import { ordenarAusencias, type AusenciaParaOrdenar } from '@/utils/ordenar-ausencias'

/** Um instante fixo: 08/10/2026, meio-dia. Nenhum caso lê o relógio real. */
const AGORA = new Date(2026, 9, 8, 12, 0, 0, 0)

/** `emDias(-1)` é ontem ao meio-dia; `emDias(2)` é depois de amanhã. */
function emDias(n: number): string {
  return new Date(2026, 9, 8 + n, 12, 0, 0, 0).toISOString()
}

function ausencia(id: string, deDias: number, ateDias: number): AusenciaParaOrdenar {
  return { id, starts_at: emDias(deDias), ends_at: emDias(ateDias) }
}

function ids(lista: { id: string }[]): string[] {
  return lista.map((a) => a.id)
}

describe('`passada` é decidida pelo FIM, nunca pelo começo', () => {
  it('terminou ONTEM → passada: true', () => {
    const r = ordenarAusencias({ ausencias: [ausencia('velha', -5, -1)], agora: AGORA })
    expect(r[0].passada).toBe(true)
  })

  it('EM CURSO — começou ontem, termina amanhã → passada: FALSE', () => {
    // >>> É O CASO QUE A MUTAÇÃO M14 MATA <<<
    // `passada = starts_at < agora` daria `true` aqui, e a ausência que está ACONTECENDO
    // apareceria esmaecida no fim da lista — escondendo o estado mais importante da tela.
    const r = ordenarAusencias({ ausencias: [ausencia('hoje', -1, 1)], agora: AGORA })
    expect(r[0].passada).toBe(false)
  })

  it('começa AMANHÃ → passada: false', () => {
    const r = ordenarAusencias({ ausencias: [ausencia('futura', 1, 5)], agora: AGORA })
    expect(r[0].passada).toBe(false)
  })

  it('a que termina HOJE mais tarde ainda não passou', () => {
    // O limite fino: `agora` é meio-dia, o fim é hoje às 23:59. Está em curso.
    const r = ordenarAusencias({
      ausencias: [{
        id: 'ate-hoje',
        starts_at: emDias(-2),
        ends_at: new Date(2026, 9, 8, 23, 59, 59, 999).toISOString(),
      }],
      agora: AGORA,
    })
    expect(r[0].passada).toBe(false)
  })

  it('a que terminou HOJE mais cedo já passou', () => {
    // O outro lado do mesmo limite, e o par é o que prova que a comparação é por instante e
    // não por dia aqui — diferente de `validar-ausencia.ts`, onde a comparação é por DIA.
    const r = ordenarAusencias({
      ausencias: [{
        id: 'acabou',
        starts_at: emDias(-2),
        ends_at: new Date(2026, 9, 8, 9, 0, 0, 0).toISOString(),
      }],
      agora: AGORA,
    })
    expect(r[0].passada).toBe(true)
  })
})

describe('a ORDEM: não-passadas primeiro, crescente; passadas no fim, decrescente', () => {
  it('as DUAS futuras vêm antes da passada', () => {
    // >>> É O CASO QUE A MUTAÇÃO M15 MATA <<<
    // Entrada deliberadamente fora de ordem, com a passada PRIMEIRO: se a função devolvesse a
    // lista como chegou, ou pusesse as passadas na frente, este caso fica vermelho.
    const r = ordenarAusencias({
      ausencias: [
        ausencia('velha', -10, -5),
        ausencia('depois', 10, 12),
        ausencia('logo', 2, 3),
      ],
      agora: AGORA,
    })
    expect(ids(r)).toEqual(['logo', 'depois', 'velha'])
  })

  it('DUAS passadas: a mais RECENTE primeiro entre as velhas', () => {
    // Histórico se lê do mais novo para o mais antigo. É o único lugar em que a ordem é
    // decrescente, e por isso tem caso próprio.
    const r = ordenarAusencias({
      ausencias: [ausencia('antiga', -30, -25), ausencia('recente', -10, -5)],
      agora: AGORA,
    })
    expect(ids(r)).toEqual(['recente', 'antiga'])
  })

  it('a EM CURSO entra entre as não-passadas, por `starts_at` — antes da futura', () => {
    // Ela começou antes de tudo, então vem primeiro. Afirmar só `passada: false` não diria
    // onde ela cai na lista.
    const r = ordenarAusencias({
      ausencias: [ausencia('futura', 5, 6), ausencia('em-curso', -1, 1), ausencia('velha', -9, -8)],
      agora: AGORA,
    })
    expect(ids(r)).toEqual(['em-curso', 'futura', 'velha'])
  })

  it('as PASSADAS NÃO somem — a lista devolve todas', () => {
    // Instrução do PO: *"Nao suma com as passadas."* Um filtro em vez de uma ordenação passaria
    // nos casos de ordem acima e apagaria o histórico.
    const entrada = [ausencia('a', -20, -15), ausencia('b', -5, -2), ausencia('c', 3, 4)]
    const r = ordenarAusencias({ ausencias: entrada, agora: AGORA })
    expect(r).toHaveLength(3)
    expect(ids(r).sort()).toEqual(['a', 'b', 'c'])
  })

  it('cinco ausências, mistura completa: a ordem inteira', () => {
    const r = ordenarAusencias({
      ausencias: [
        ausencia('p-antiga', -40, -35),
        ausencia('f-longe', 20, 25),
        ausencia('p-recente', -4, -2),
        ausencia('em-curso', -1, 2),
        ausencia('f-perto', 5, 7),
      ],
      agora: AGORA,
    })
    expect(ids(r)).toEqual(['em-curso', 'f-perto', 'f-longe', 'p-recente', 'p-antiga'])
  })
})

describe('as bordas, e o que a função NÃO faz', () => {
  it('lista vazia devolve lista vazia', () => {
    expect(ordenarAusencias({ ausencias: [], agora: AGORA })).toEqual([])
  })

  it('`reason` é preservado — a função ordena, não reescreve', () => {
    const r = ordenarAusencias({
      ausencias: [{ ...ausencia('a', 1, 2), reason: 'Férias' }],
      agora: AGORA,
    })
    expect(r[0].reason).toBe('Férias')
    expect(r[0].id).toBe('a')
    expect(r[0].starts_at).toBe(emDias(1))
  })

  it('`reason` ausente continua ausente, não vira string vazia', () => {
    // `ausente-vs-falso.md`: `''` na tela seria uma linha de motivo em branco, afirmando que o
    // usuário deixou o campo vazio quando ele nunca o preencheu.
    const r = ordenarAusencias({ ausencias: [ausencia('a', 1, 2)], agora: AGORA })
    expect(r[0].reason).toBeUndefined()
  })

  it('NÃO há `new Date()` dentro: o MESMO dado com outro `agora` muda o resultado', () => {
    // >>> O CASO QUE PROVA A INJEÇÃO <<<
    // A mesma ausência, dois relógios: passada num, futura no outro. Com `new Date()` dentro,
    // os dois resultados seriam iguais e este caso ficaria vermelho.
    const a = [ausencia('x', 1, 2)]
    expect(ordenarAusencias({ ausencias: a, agora: AGORA })[0].passada).toBe(false)
    const depois = new Date(2026, 9, 20, 12, 0, 0, 0)
    expect(ordenarAusencias({ ausencias: a, agora: depois })[0].passada).toBe(true)
  })

  it('o módulo não contém `new Date()` sem argumento — medido no PROGRAMA, não na prosa', () => {
    // A asserção estrutural que acompanha a de comportamento. Mede o programa sem comentários,
    // porque o cabeçalho do arquivo CITA `new Date()` ao explicar por que não o usa — e medir a
    // prosa já ficou vermelho antes nesta campanha.
    const fonte = require('fs').readFileSync(
      require('path').resolve(__dirname, '../ordenar-ausencias.ts'), 'utf8',
    ) as string
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).not.toMatch(/new Date\(\s*\)/)
  })

  it('não muta a lista que recebe', () => {
    // `sort` muta no lugar. Se a função ordenasse `params.ausencias` direto, a ordem do estado
    // do React mudaria sem `setState` — e a próxima renderização leria outra coisa.
    const entrada = [ausencia('b', 5, 6), ausencia('a', 1, 2)]
    ordenarAusencias({ ausencias: entrada, agora: AGORA })
    expect(ids(entrada)).toEqual(['b', 'a'])
  })
})
