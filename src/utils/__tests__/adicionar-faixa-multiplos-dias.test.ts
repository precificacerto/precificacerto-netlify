/**
 * UMA FAIXA, VÁRIOS DIAS — e a SOBRESCRITA DO DIA INTEIRO.
 *
 * Comando do PO de 06/10/2026 §5 (as sete caixas) e de 08/10/2026 (a Mudança 2).
 *
 * >>> A REGRA MUDOU, E ESTA SUÍTE É O REGISTRO DA MUDANÇA <<<
 *
 * Até 06/10 havia recusa por conflito: um dia com faixa abortava tudo e nenhuma faixa voltava.
 * Os casos que afirmavam aquilo SAÍRAM — não porque falhavam, mas porque afirmavam o contrário
 * do que o produto agora pede. O caso do ENCOSTAR ficou, com a asserção INVERTIDA, e é ele que
 * fixa que a troca foi deliberada: 09:00–12:00 e 12:00–18:00 não se sobrepõem em minuto nenhum,
 * e a antiga SAI mesmo assim, porque o critério passou a ser o dia, não a interseção.
 *
 * >>> O QUE CADA CASO TEM DE DISTINGUIR <<<
 *
 * `teste-que-nao-exercita.md`: afirmar que `ok: true` não é afirmar que o dia certo foi limpo.
 * Por isso nenhum caso aqui se contenta com o sinal — cada um afirma o CONTEÚDO de
 * `idsParaRemover` e de `diasSubstituidos`, que é onde mora o efeito. E os ids das fixtures são
 * DISTINTOS entre dias, para que trocar o filtro de dia mude a lista afirmada.
 */

import {
  ERRO_HORA_INVERTIDA,
  ERRO_SEM_DIA,
  adicionarFaixaEmDias,
  avisoDeSubstituicao,
  faixaEmDiasRecusada,
  mensagemDoResultado,
  type FaixaHorario,
  type ResultadoFaixa,
} from '@/utils/adicionar-faixa-multiplos-dias'

const DOM = 0
const SEG = 1
const TER = 2
const QUA = 3
const QUI = 4
const SEX = 5
const SAB = 6

const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const nomeDoDia = (weekday: number) => NOMES[weekday] ?? String(weekday)

/** Lê o lado `ok: true` sem cast — e explode em vez de passar verde se vier recusa. */
function aceita(r: ResultadoFaixa) {
  if (faixaEmDiasRecusada(r)) throw new Error(`esperava ok:true e veio recusa: ${r.erro}`)
  return r
}

function recusa(r: ResultadoFaixa) {
  if (!faixaEmDiasRecusada(r)) throw new Error('esperava recusa e veio ok:true')
  return r
}

function faixas(r: ResultadoFaixa): FaixaHorario[] {
  return aceita(r).novasFaixas
}

describe('3 dias marcados, nenhum deles tinha faixa', () => {
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

  it('idsParaRemover e diasSubstituidos saem VAZIOS — não há o que substituir', () => {
    // O espelho obrigatório: sem ele, "nunca remove nada" ficaria verde num utilitário que
    // devolvesse lista vazia sempre, e o caso da substituição não distinguiria coisa alguma.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [],
    }))
    expect(r.idsParaRemover).toEqual([])
    expect(r.diasSubstituidos).toEqual([])
  })

  it('dia marcado SEM faixa não entra em diasSubstituidos, mesmo tendo vizinhos com faixa', () => {
    // Três dias marcados, só a quarta tinha algo. Um `diasSubstituidos = dias` passaria no caso
    // anterior (lista vazia de existentes) e quebraria aqui.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [{ id: 'q1', weekday: QUA, start_time: '13:00', end_time: '17:00' }],
    }))
    expect(r.diasSubstituidos).toEqual([QUA])
    expect(r.idsParaRemover).toEqual(['q1'])
  })
})

describe('3 dias marcados, 1 deles com DUAS faixas', () => {
  const entrada = {
    diasSelecionados: [SEG, QUA, SEX],
    inicio: '10:00',
    fim: '14:00',
    faixasExistentes: [
      { id: 'q-manha', weekday: QUA, start_time: '08:00', end_time: '12:00' },
      { id: 'q-tarde', weekday: QUA, start_time: '13:00', end_time: '17:00' },
    ],
  }

  it('idsParaRemover tem os DOIS ids do dia — não só o que se sobrepõe', () => {
    // `q-tarde` (13:00–17:00) NÃO se sobrepõe a 10:00–14:00? Sobrepõe. `q-manha` (08:00–12:00)
    // também. Então este caso sozinho não distinguiria "o dia inteiro" de "os sobrepostos" —
    // quem faz isso é o caso do ENCOSTAR, mais abaixo, e é por isso que ele existe.
    const r = aceita(adicionarFaixaEmDias(entrada))
    expect(r.idsParaRemover.sort()).toEqual(['q-manha', 'q-tarde'])
  })

  it('diasSubstituidos traz SÓ a quarta, uma vez, apesar das duas faixas', () => {
    // Duas faixas no mesmo dia são UMA substituição. Um `diasSubstituidos` derivado das faixas
    // em vez dos dias traria `[QUA, QUA]`, e o aviso diria "Quarta e Quarta".
    const r = aceita(adicionarFaixaEmDias(entrada))
    expect(r.diasSubstituidos).toEqual([QUA])
  })

  it('as três faixas novas entram: substituir um dia não cancela os outros dois', () => {
    const r = aceita(adicionarFaixaEmDias(entrada))
    expect(r.novasFaixas).toEqual([
      { weekday: 1, start_time: '10:00', end_time: '14:00' },
      { weekday: 3, start_time: '10:00', end_time: '14:00' },
      { weekday: 5, start_time: '10:00', end_time: '14:00' },
    ])
  })
})

describe('DIA NÃO MARCADO NUNCA É TOCADO — a única proteção que sobrou', () => {
  it('o id do dia não marcado NÃO entra em idsParaRemover', () => {
    // É a mutação M5: tirar o filtro `marcados.has(f.weekday)` faz `t1` e `s1` entrarem na lista,
    // e marcar a segunda passaria a apagar a semana inteira.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [
        { id: 's1', weekday: SEG, start_time: '07:00', end_time: '09:00' },
        { id: 't1', weekday: TER, start_time: '09:00', end_time: '18:00' },
        { id: 'b1', weekday: SAB, start_time: '10:00', end_time: '14:00' },
      ],
    }))
    expect(r.idsParaRemover).toEqual(['s1'])
    expect(r.idsParaRemover).not.toContain('t1')
    expect(r.idsParaRemover).not.toContain('b1')
    expect(r.diasSubstituidos).toEqual([SEG])
  })

  it('nenhum dia marcado tinha faixa, e os NÃO marcados tinham: as duas listas ficam vazias', () => {
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [
        { id: 't1', weekday: TER, start_time: '09:00', end_time: '18:00' },
        { id: 'b1', weekday: SAB, start_time: '10:00', end_time: '14:00' },
      ],
    }))
    expect(r.idsParaRemover).toEqual([])
    expect(r.diasSubstituidos).toEqual([])
    expect(r.novasFaixas).toHaveLength(2)
  })

  it('faixa gravada SEM id não vira string vazia no delete', () => {
    // `.in('id', [''])` é uma consulta válida que não casa nada — mas um `undefined` na lista
    // viraria `null` no filtro e o delete sairia diferente do pretendido. O dia continua
    // substituído: ele TINHA faixa, só não tem id para remover.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [{ weekday: SEG, start_time: '07:00', end_time: '09:00' }],
    }))
    expect(r.idsParaRemover).toEqual([])
    expect(r.diasSubstituidos).toEqual([SEG])
  })
})

describe('ENCOSTAR também sai — e é ESTE caso que fixa que a regra mudou', () => {
  it('09:00–12:00 já existe, entra 12:00–18:00 no MESMO dia marcado, e a antiga SAI', () => {
    // >>> O CASO QUE DISTINGUE "DIA INTEIRO" DE "SÓ OS SOBREPOSTOS" <<<
    //
    // Não há um minuto de interseção entre 09:00–12:00 e 12:00–18:00 — este par era, até 06/10,
    // o exemplo canônico do que NÃO era conflito, e a faixa antiga ficava. Agora ela sai, porque
    // o critério deixou de ser a interseção e passou a ser o dia marcado.
    //
    // É a mutação M6: fazer `idsParaRemover` levar só as faixas sobrepostas devolve `[]` aqui, e
    // este caso fica vermelho. Nenhum outro caso da suíte pega M6 — nos demais o conjunto do dia
    // e o conjunto dos sobrepostos coincidem.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '12:00',
      fim: '18:00',
      faixasExistentes: [{ id: 's-manha', weekday: SEG, start_time: '09:00', end_time: '12:00' }],
    }))
    expect(r.idsParaRemover).toEqual(['s-manha'])
    expect(r.diasSubstituidos).toEqual([SEG])
    expect(r.novasFaixas).toEqual([{ weekday: 1, start_time: '12:00', end_time: '18:00' }])
  })

  it('encostar pelo outro lado: 06:00–09:00 antes de 09:00–12:00, e a antiga sai igual', () => {
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '06:00',
      fim: '09:00',
      faixasExistentes: [{ id: 's-manha', weekday: SEG, start_time: '09:00', end_time: '12:00' }],
    }))
    expect(r.idsParaRemover).toEqual(['s-manha'])
  })

  it('e a invasão de um minuto NÃO é mais recusa — vira substituição', () => {
    // O par espelhado do caso acima. Antes de 08/10 este era `ok: false`; hoje é `ok: true` com
    // o dia limpo. Os dois juntos dizem que o resultado passou a ser o MESMO nos dois lados do
    // critério antigo, que é exatamente o que "sobrescreve o dia" significa.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '11:59',
      fim: '18:00',
      faixasExistentes: [{ id: 's-manha', weekday: SEG, start_time: '09:00', end_time: '12:00' }],
    }))
    expect(r.idsParaRemover).toEqual(['s-manha'])
    expect(r.diasSubstituidos).toEqual([SEG])
  })
})

describe('nenhum dia marcado', () => {
  it('ok:false com a mensagem do dia', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [],
    })
    expect(r.ok).toBe(false)
    expect(recusa(r).erro).toBe(ERRO_SEM_DIA)
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
    expect(recusa(r).erro).toBe(ERRO_SEM_DIA)
  })

  it('nenhuma recusa carrega faixa nem id: o lado ok:false não tem as chaves', () => {
    // `teste-que-nao-exercita.md`: afirmar `ok: false` não afirma que nada vai ser gravado nem
    // apagado. Quem grava lê `novasFaixas` e `idsParaRemover` — se eles viessem preenchidos numa
    // recusa, a tela recusaria na mensagem e apagaria no banco.
    const r = adicionarFaixaEmDias({
      diasSelecionados: [],
      inicio: '09:00',
      fim: '18:00',
      faixasExistentes: [{ id: 's1', weekday: SEG, start_time: '07:00', end_time: '09:00' }],
    })
    expect((r as any).novasFaixas).toBeUndefined()
    expect((r as any).idsParaRemover).toBeUndefined()
    expect((r as any).diasSubstituidos).toBeUndefined()
  })
})

describe('fim <= inicio', () => {
  it('fim ANTES do início é recusado, e nada é marcado para remoção', () => {
    const r = adicionarFaixaEmDias({
      diasSelecionados: [SEG],
      inicio: '18:00',
      fim: '09:00',
      faixasExistentes: [{ id: 's1', weekday: SEG, start_time: '07:00', end_time: '09:00' }],
    })
    expect(r.ok).toBe(false)
    expect(recusa(r).erro).toBe(ERRO_HORA_INVERTIDA)
    expect((r as any).idsParaRemover).toBeUndefined()
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
  it('marcar os sete devolve sete faixas, de 0 a 6, e limpa os sete', () => {
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [DOM, SEG, TER, QUA, QUI, SEX, SAB],
      inicio: '08:00',
      fim: '18:00',
      faixasExistentes: [
        { id: 'd1', weekday: DOM, start_time: '09:00', end_time: '12:00' },
        { id: 'b1', weekday: SAB, start_time: '10:00', end_time: '14:00' },
      ],
    }))
    expect(r.novasFaixas.map((f) => f.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(r.idsParaRemover.sort()).toEqual(['b1', 'd1'])
    expect(r.diasSubstituidos).toEqual([DOM, SAB])
  })

  it('o DOMINGO é 0 e não é confundido com "não informado"', () => {
    // `[0]` é uma lista com um elemento, não uma lista vazia. Um `if (!dia)` em algum ponto
    // trataria domingo como ausência de dia — e um `if (!f.weekday)` no filtro deixaria a faixa
    // de domingo fora de `idsParaRemover`, que é o mesmo erro do outro lado.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [DOM],
      inicio: '08:00',
      fim: '12:00',
      faixasExistentes: [{ id: 'd1', weekday: DOM, start_time: '09:00', end_time: '12:00' }],
    }))
    expect(r.novasFaixas).toEqual([{ weekday: 0, start_time: '08:00', end_time: '12:00' }])
    expect(r.idsParaRemover).toEqual(['d1'])
    expect(r.diasSubstituidos).toEqual([DOM])
  })
})

describe('o AVISO antes do clique, e a MENSAGEM depois', () => {
  it('sem dia substituído o aviso é null — a linha não aparece', () => {
    // `ausente-vs-falso.md`: uma linha dizendo "0 dias serão substituídos" afirmaria algo onde o
    // certo é não dizer nada. `null` é a ausência da linha, não um texto vazio.
    expect(avisoDeSubstituicao([], nomeDoDia)).toBeNull()
  })

  it('UM dia: singular em "tem" e em "será substituída"', () => {
    expect(avisoDeSubstituicao([QUA], nomeDoDia)).toBe(
      'Quarta já tem faixas — será substituída.',
    )
  })

  it('DOIS dias: plural, e o "e" antes do último em vez de vírgula', () => {
    expect(avisoDeSubstituicao([SEG, QUA], nomeDoDia)).toBe(
      'Segunda e Quarta já têm faixas — serão substituídas.',
    )
  })

  it('TRÊS dias: vírgula entre os primeiros e "e" só antes do último', () => {
    expect(avisoDeSubstituicao([SEG, QUA, SEX], nomeDoDia)).toBe(
      'Segunda, Quarta e Sexta já têm faixas — serão substituídas.',
    )
  })

  it('a mensagem final sem substituição NÃO menciona substituição nenhuma', () => {
    expect(mensagemDoResultado(3, [], nomeDoDia)).toBe('Faixa aplicada em 3 dias.')
  })

  it('a mensagem final com substituição nomeia os dias', () => {
    expect(mensagemDoResultado(3, [SEG, QUA], nomeDoDia)).toBe(
      'Faixa aplicada em 3 dias. Segunda e Quarta foram substituídas.',
    )
  })

  it('UM dia aplicado: "1 dia", não "1 dias"', () => {
    expect(mensagemDoResultado(1, [SEG], nomeDoDia)).toBe(
      'Faixa aplicada em 1 dia. Segunda foi substituída.',
    )
  })

  it('o aviso e a mensagem leem o MESMO diasSubstituidos que a função devolve', () => {
    // Liga as duas metades: sem este caso, `avisoDeSubstituicao` poderia estar certo sobre uma
    // lista que `adicionarFaixaEmDias` nunca produz. É a forma de `copia-divergente.md` — o
    // produtor e o consumidor afirmados juntos, não cada um consigo mesmo.
    const r = aceita(adicionarFaixaEmDias({
      diasSelecionados: [SEG, QUA, SEX],
      inicio: '10:00',
      fim: '14:00',
      faixasExistentes: [
        { id: 's1', weekday: SEG, start_time: '08:00', end_time: '09:00' },
        { id: 'x1', weekday: SEX, start_time: '08:00', end_time: '09:00' },
      ],
    }))
    expect(avisoDeSubstituicao(r.diasSubstituidos, nomeDoDia)).toBe(
      'Segunda e Sexta já têm faixas — serão substituídas.',
    )
    expect(mensagemDoResultado(r.novasFaixas.length, r.diasSubstituidos, nomeDoDia)).toBe(
      'Faixa aplicada em 3 dias. Segunda e Sexta foram substituídas.',
    )
  })
})
