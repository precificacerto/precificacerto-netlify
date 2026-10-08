/**
 * O COMPOSITOR ÚNICO — N profissionais × N dias × 1 ou 2 faixas, em dois modos.
 *
 * Comando do PO de 08/10/2026, segunda rodada.
 *
 * >>> O QUE CADA CASO TEM DE DISTINGUIR <<<
 *
 * `teste-que-nao-exercita.md`: afirmar que `montarGrade` devolveu `ok: true` não é afirmar que
 * ela montou o produto certo nem que respeitou o modo. Por isso nenhum caso aqui para no sinal
 * — cada um afirma o CONTEÚDO de `novas`, `idsParaRemover` ou `puladas`, que é onde o efeito
 * mora.
 *
 * E as fixtures são escolhidas para DISCRIMINAR, nunca por conveniência:
 *
 *   · ids distintos por (profissional, dia), para que trocar um filtro mude a lista afirmada;
 *   · profissional não marcado E dia não marcado com faixa, nos dois casos — um filtro que
 *     esquecesse um dos dois passaria no caso do outro;
 *   · horas das duas faixas informadas DIFERENTES entre si, para que trocar a ordem apareça.
 */

import {
  ERRO_FAIXAS_SOBREPOSTAS,
  ERRO_HORA_INVERTIDA,
  ERRO_SEM_DIA,
  ERRO_SEM_FAIXA,
  ERRO_SEM_PROFISSIONAL,
  montagemRecusada,
  montarGrade,
  type FaixaExistente,
  type ResultadoDaMontagem,
} from '@/utils/montar-grade'

const DOM = 0
const SEG = 1
const TER = 2
const QUA = 3
const QUI = 4
const SEX = 5
const SAB = 6

const MANHA = { inicio: '09:00', fim: '12:00' }
const TARDE = { inicio: '14:00', fim: '18:00' }

/** Lê o lado `ok: true` sem cast — e explode em vez de passar verde se vier recusa. */
function aceita(r: ResultadoDaMontagem) {
  if (montagemRecusada(r)) throw new Error(`esperava ok:true e veio recusa: ${r.erro}`)
  return r
}

function recusa(r: ResultadoDaMontagem) {
  if (!montagemRecusada(r)) throw new Error('esperava recusa e veio ok:true')
  return r
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SUBSTITUIR — a ação de MONTAGEM
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('substituir — o produto profissionais × dias × faixas', () => {
  it('2 profissionais × 5 dias × 2 faixas = 20 itens em `novas`', () => {
    // >>> É O CASO QUE A MUTAÇÃO M8 MATA <<<
    // Limitar o produto ao primeiro profissional devolve 10, não 20. O número 20 só sai se as
    // três dimensões forem percorridas, e é por isso que a asserção é sobre ele e não sobre
    // `ok: true`.
    const r = aceita(montarGrade({
      profissionais: ['e1', 'e2'],
      dias: [SEG, TER, QUA, QUI, SEX],
      faixas: [MANHA, TARDE],
      modo: 'substituir',
      existentes: [],
    }))
    expect(r.novas).toHaveLength(20)

    // E as 20 são DISTINTAS: 20 cópias da mesma linha também têm comprimento 20.
    const chaves = new Set(r.novas.map((n) => `${n.employee_id}|${n.weekday}|${n.start_time}`))
    expect(chaves.size).toBe(20)

    // Os dois profissionais aparecem, com 10 cada.
    expect(r.novas.filter((n) => n.employee_id === 'e1')).toHaveLength(10)
    expect(r.novas.filter((n) => n.employee_id === 'e2')).toHaveLength(10)

    // E as duas faixas informadas chegam inteiras, não só a primeira.
    expect(r.novas.filter((n) => n.start_time === '09:00' && n.end_time === '12:00')).toHaveLength(10)
    expect(r.novas.filter((n) => n.start_time === '14:00' && n.end_time === '18:00')).toHaveLength(10)
  })

  it('uma faixa só: o produto cai pela metade, e isso prova que a 3ª dimensão é a lista', () => {
    // O espelho do caso acima. Sem ele, "20 itens" ficaria verde num módulo que ignorasse
    // `faixas` e gravasse sempre duas linhas fixas por par.
    const r = aceita(montarGrade({
      profissionais: ['e1', 'e2'],
      dias: [SEG, TER, QUA, QUI, SEX],
      faixas: [MANHA],
      modo: 'substituir',
      existentes: [],
    }))
    expect(r.novas).toHaveLength(10)
  })

  it('o INTERVALO DE ALMOÇO do dia: as duas faixas convivem no mesmo (profissional, dia)', () => {
    // É o caso que originou a rodada inteira. Até 07/10 não havia como montá-lo.
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [MANHA, TARDE],
      modo: 'substituir',
      existentes: [],
    }))
    expect(r.novas).toEqual([
      { employee_id: 'e1', weekday: SEG, start_time: '09:00', end_time: '12:00' },
      { employee_id: 'e1', weekday: SEG, start_time: '14:00', end_time: '18:00' },
    ])
  })
})

describe('substituir — `idsParaRemover` pega SÓ os pares (profissional, dia) marcados', () => {
  // Um id por par, todos distintos, para que qualquer filtro frouxo mude a lista afirmada.
  const EXISTENTES: FaixaExistente[] = [
    { id: 'e1-seg', employee_id: 'e1', weekday: SEG, start_time: '08:00', end_time: '09:00' },
    { id: 'e1-ter', employee_id: 'e1', weekday: TER, start_time: '08:00', end_time: '09:00' },
    { id: 'e1-sab', employee_id: 'e1', weekday: SAB, start_time: '08:00', end_time: '09:00' },
    { id: 'e2-seg', employee_id: 'e2', weekday: SEG, start_time: '08:00', end_time: '09:00' },
    { id: 'e3-seg', employee_id: 'e3', weekday: SEG, start_time: '08:00', end_time: '09:00' },
    { id: 'e3-sab', employee_id: 'e3', weekday: SAB, start_time: '08:00', end_time: '09:00' },
  ]

  const r = () => aceita(montarGrade({
    profissionais: ['e1', 'e2'],
    dias: [SEG, TER],
    faixas: [MANHA],
    modo: 'substituir',
    existentes: EXISTENTES,
  }))

  it('leva os três pares marcados — e `e2` não tem terça, então são três e não quatro', () => {
    expect([...r().idsParaRemover].sort()).toEqual(['e1-seg', 'e1-ter', 'e2-seg'])
  })

  it('faixa de profissional NÃO marcado não entra — `e3` fica intacto', () => {
    // Uma das duas proteções. Tirar o filtro de profissional faz `e3-seg` entrar: montar a
    // grade de dois barbeiros apagaria a do terceiro.
    expect(r().idsParaRemover).not.toContain('e3-seg')
    expect(r().idsParaRemover).not.toContain('e3-sab')
  })

  it('faixa de dia NÃO marcado não entra — o sábado de `e1` fica intacto', () => {
    // A outra proteção, e ela é independente: `e1-sab` é de um profissional MARCADO. Um filtro
    // só por profissional passaria no caso acima e falharia aqui.
    expect(r().idsParaRemover).not.toContain('e1-sab')
  })

  it('`puladas` é SEMPRE vazio em substituir — o dia é limpo, não há com o que colidir', () => {
    // Afirmado com existentes que COLIDIRIAM no modo adicionar (08:00–09:00 contra 09:00–12:00
    // não colide; este caso usa uma que colide de verdade).
    const comColisao = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [MANHA],
      modo: 'substituir',
      existentes: [
        { id: 'x', employee_id: 'e1', weekday: SEG, start_time: '10:00', end_time: '11:00' },
      ],
    }))
    expect(comColisao.puladas).toEqual([])
    expect(comColisao.novas).toHaveLength(1)
    expect(comColisao.idsParaRemover).toEqual(['x'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ADICIONAR — a ação de AJUSTE
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('adicionar — `idsParaRemover` é SEMPRE vazio', () => {
  it('sem colisão: vazio', () => {
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [TARDE],
      modo: 'adicionar',
      existentes: [
        { id: 'e1-seg', employee_id: 'e1', weekday: SEG, start_time: '09:00', end_time: '12:00' },
      ],
    }))
    expect(r.idsParaRemover).toEqual([])
  })

  it('COM colisão: continua vazio — é a invariante, não a consequência', () => {
    // >>> É O CASO QUE A MUTAÇÃO M7 MATA <<<
    // Um `adicionar` que preenchesse `idsParaRemover` apagaria a manhã ao acrescentar a tarde,
    // que é exatamente o defeito que esta rodada existe para corrigir. A fixture COLIDE de
    // propósito: se o caso usasse dados sem colisão, um `idsParaRemover` que só se enchesse na
    // colisão passaria verde.
    const r = aceita(montarGrade({
      profissionais: ['e1', 'e2'],
      dias: [SEG, TER],
      faixas: [MANHA],
      modo: 'adicionar',
      existentes: [
        { id: 'a', employee_id: 'e1', weekday: SEG, start_time: '10:00', end_time: '11:00' },
        { id: 'b', employee_id: 'e2', weekday: TER, start_time: '08:00', end_time: '20:00' },
      ],
    }))
    expect(r.idsParaRemover).toEqual([])
    expect(r.puladas).toHaveLength(2) // as duas colidem, e isso NÃO virou remoção
  })
})

describe('adicionar — a colisão PULA a combinação, e só ela', () => {
  const EXISTENTES: FaixaExistente[] = [
    // só a SEGUNDA de `e1` tem faixa, e ela colide com a manhã informada
    { id: 'e1-seg', employee_id: 'e1', weekday: SEG, start_time: '10:00', end_time: '11:00' },
  ]

  const r = () => aceita(montarGrade({
    profissionais: ['e1', 'e2'],
    dias: [SEG, TER],
    faixas: [MANHA],
    modo: 'adicionar',
    existentes: EXISTENTES,
  }))

  it('a combinação que colide SOME de `novas`', () => {
    expect(r().novas).not.toContainEqual(
      { employee_id: 'e1', weekday: SEG, start_time: '09:00', end_time: '12:00' },
    )
  })

  it('ela aparece em `puladas`, com profissional, dia e as horas', () => {
    expect(r().puladas).toEqual([
      { employee_id: 'e1', weekday: SEG, inicio: '09:00', fim: '12:00' },
    ])
  })

  it('as OUTRAS TRÊS combinações continuam em `novas` — não é tudo-ou-nada', () => {
    // 2 profissionais × 2 dias × 1 faixa = 4; uma pulada, três entram. Sem esta asserção,
    // "pula a que colide" ficaria verde num módulo que recusasse o lote inteiro — que é o
    // comportamento ANTIGO, e o que esta rodada desfaz.
    const n = r().novas
    expect(n).toHaveLength(3)
    expect(n).toContainEqual({ employee_id: 'e1', weekday: TER, start_time: '09:00', end_time: '12:00' })
    expect(n).toContainEqual({ employee_id: 'e2', weekday: SEG, start_time: '09:00', end_time: '12:00' })
    expect(n).toContainEqual({ employee_id: 'e2', weekday: TER, start_time: '09:00', end_time: '12:00' })
  })

  it('a colisão é por (profissional, dia): a faixa de `e1` não bloqueia `e2` no mesmo dia', () => {
    // Afirmado pelo caso acima, dito pelo outro lado para que fique explícito: `e2` na SEGUNDA
    // entra, apesar de `e1` ter faixa naquele mesmo dia e horário.
    expect(r().novas).toContainEqual(
      { employee_id: 'e2', weekday: SEG, start_time: '09:00', end_time: '12:00' },
    )
  })

  it('das DUAS faixas informadas, só a que colide é pulada', () => {
    // A manhã colide com 10:00–11:00; a tarde não. O par distingue "pula a combinação" de
    // "pula o dia".
    const r2 = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [MANHA, TARDE],
      modo: 'adicionar',
      existentes: EXISTENTES,
    }))
    expect(r2.novas).toEqual([
      { employee_id: 'e1', weekday: SEG, start_time: '14:00', end_time: '18:00' },
    ])
    expect(r2.puladas).toEqual([
      { employee_id: 'e1', weekday: SEG, inicio: '09:00', fim: '12:00' },
    ])
  })
})

describe('adicionar — ENCOSTAR não é colisão: o barbeiro de dois turnos', () => {
  it('existe 09:00–12:00, entra 12:00–18:00, e ela ENTRA', () => {
    // Não há um minuto de interseção. Trocar qualquer um dos dois `<` de `sobrepoe` por `<=`
    // recusaria exatamente o caso que o intervalo de almoço precisa.
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [{ inicio: '12:00', fim: '18:00' }],
      modo: 'adicionar',
      existentes: [
        { id: 'e1-seg', employee_id: 'e1', weekday: SEG, start_time: '09:00', end_time: '12:00' },
      ],
    }))
    expect(r.novas).toEqual([
      { employee_id: 'e1', weekday: SEG, start_time: '12:00', end_time: '18:00' },
    ])
    expect(r.puladas).toEqual([])
  })

  it('encostar pelo OUTRO lado também entra: 06:00–09:00 antes de 09:00–12:00', () => {
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [{ inicio: '06:00', fim: '09:00' }],
      modo: 'adicionar',
      existentes: [
        { id: 'e1-seg', employee_id: 'e1', weekday: SEG, start_time: '09:00', end_time: '12:00' },
      ],
    }))
    expect(r.novas).toHaveLength(1)
    expect(r.puladas).toEqual([])
  })

  it('e UM MINUTO de invasão É colisão — o par que prova que o critério não é frouxo', () => {
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [{ inicio: '11:59', fim: '18:00' }],
      modo: 'adicionar',
      existentes: [
        { id: 'e1-seg', employee_id: 'e1', weekday: SEG, start_time: '09:00', end_time: '12:00' },
      ],
    }))
    expect(r.novas).toEqual([])
    expect(r.puladas).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// AS VALIDAÇÕES, NA ORDEM DO COMANDO
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('as duas faixas informadas se sobrepondo ENTRE SI', () => {
  it('09:00–13:00 e 12:00–18:00 → ok:false', () => {
    // >>> É O CASO QUE A MUTAÇÃO M9 MATA <<<
    // Sem a validação 5, as duas entram e o dia fica com a hora das 12 contada duas vezes.
    const r = montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [{ inicio: '09:00', fim: '13:00' }, { inicio: '12:00', fim: '18:00' }],
      modo: 'substituir',
      existentes: [],
    })
    expect(r.ok).toBe(false)
    expect(recusa(r).erro).toBe(ERRO_FAIXAS_SOBREPOSTAS)
  })

  it('a recusa vale nos DOIS modos — não é regra só da montagem', () => {
    const r = montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [{ inicio: '09:00', fim: '13:00' }, { inicio: '12:00', fim: '18:00' }],
      modo: 'adicionar',
      existentes: [],
    })
    expect(recusa(r).erro).toBe(ERRO_FAIXAS_SOBREPOSTAS)
  })

  it('a ordem em que as duas são informadas não muda a recusa', () => {
    // Um laço que só comparasse `i` com `i+1` numa direção passaria com a ordem invertida.
    const r = montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [{ inicio: '12:00', fim: '18:00' }, { inicio: '09:00', fim: '13:00' }],
      modo: 'substituir',
      existentes: [],
    })
    expect(recusa(r).erro).toBe(ERRO_FAIXAS_SOBREPOSTAS)
  })

  it('ENCOSTAR entre as duas informadas é PERMITIDO: 09:00–12:00 e 12:00–18:00', () => {
    // O espelho obrigatório. Sem ele, a validação 5 ficaria verde recusando o intervalo de
    // almoço — o caso que a rodada existe para permitir.
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [{ inicio: '09:00', fim: '12:00' }, { inicio: '12:00', fim: '18:00' }],
      modo: 'substituir',
      existentes: [],
    }))
    expect(r.novas).toHaveLength(2)
  })

  it('uma faixa só nunca cai na validação 5 — não há par para comparar', () => {
    const r = aceita(montarGrade({
      profissionais: ['e1'], dias: [SEG], faixas: [MANHA], modo: 'substituir', existentes: [],
    }))
    expect(r.novas).toHaveLength(1)
  })
})

describe('as validações 1 a 4, cada uma com a sua mensagem', () => {
  const base = {
    profissionais: ['e1'],
    dias: [SEG],
    faixas: [MANHA],
    modo: 'substituir' as const,
    existentes: [] as FaixaExistente[],
  }

  it('1 — profissionais vazio', () => {
    expect(recusa(montarGrade({ ...base, profissionais: [] })).erro).toBe(ERRO_SEM_PROFISSIONAL)
  })

  it('2 — dias vazio', () => {
    expect(recusa(montarGrade({ ...base, dias: [] })).erro).toBe(ERRO_SEM_DIA)
  })

  it('3 — faixas vazio', () => {
    expect(recusa(montarGrade({ ...base, faixas: [] })).erro).toBe(ERRO_SEM_FAIXA)
  })

  it('4 — fim ANTES do início', () => {
    expect(recusa(montarGrade({
      ...base, faixas: [{ inicio: '18:00', fim: '09:00' }],
    })).erro).toBe(ERRO_HORA_INVERTIDA)
  })

  it('4 — fim IGUAL ao início: faixa de duração zero', () => {
    expect(recusa(montarGrade({
      ...base, faixas: [{ inicio: '10:00', fim: '10:00' }],
    })).erro).toBe(ERRO_HORA_INVERTIDA)
  })

  it('4 — a SEGUNDA faixa invertida também recusa, não só a primeira', () => {
    // Um laço que só olhasse `faixas[0]` passaria com a primeira válida.
    expect(recusa(montarGrade({
      ...base, faixas: [MANHA, { inicio: '18:00', fim: '14:00' }],
    })).erro).toBe(ERRO_HORA_INVERTIDA)
  })

  it('4 — hora impossível cai aqui: 25:00 e 09:70', () => {
    // A comparação é por MINUTOS, não por string. `'25:00' < '26:00'` seria `true` em texto.
    for (const f of [{ inicio: '25:00', fim: '26:00' }, { inicio: '09:70', fim: '10:00' }]) {
      expect(recusa(montarGrade({ ...base, faixas: [f] })).erro).toBe(ERRO_HORA_INVERTIDA)
    }
  })

  it('sem zero à esquerda NÃO inverte a comparação: 9:30 contra 10:00 é válido', () => {
    const r = aceita(montarGrade({
      ...base, faixas: [{ inicio: '9:30', fim: '10:00' }],
    }))
    expect(r.novas).toHaveLength(1)
  })

  it('A ORDEM das validações: sem profissional E sem dia, a queixa é do PROFISSIONAL', () => {
    // A tela decide de cima para baixo. Trocar a ordem mandaria o usuário olhar a linha errada.
    expect(recusa(montarGrade({
      ...base, profissionais: [], dias: [],
    })).erro).toBe(ERRO_SEM_PROFISSIONAL)
  })

  it('A ORDEM: sem dia E com hora invertida, a queixa é do DIA', () => {
    expect(recusa(montarGrade({
      ...base, dias: [], faixas: [{ inicio: '18:00', fim: '09:00' }],
    })).erro).toBe(ERRO_SEM_DIA)
  })

  it('nenhuma recusa carrega `novas` nem `idsParaRemover`', () => {
    // `teste-que-nao-exercita.md`: afirmar `ok: false` não afirma que nada vai ser gravado nem
    // apagado. Quem grava lê as duas listas — se elas viessem preenchidas numa recusa, a tela
    // recusaria na mensagem e escreveria no banco.
    const r = montarGrade({ ...base, profissionais: [] })
    expect((r as any).novas).toBeUndefined()
    expect((r as any).idsParaRemover).toBeUndefined()
    expect((r as any).puladas).toBeUndefined()
  })
})

describe('os SETE dias e o domingo = 0', () => {
  it('os sete entram, e o DOMINGO não é confundido com "não informado"', () => {
    // `[0]` é uma lista com um elemento, não vazia. Um `if (!dia)` trataria domingo como
    // ausência de dia — e um `if (!f.weekday)` no filtro deixaria o domingo fora de
    // `idsParaRemover`, que é o mesmo erro do outro lado.
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [DOM, SEG, TER, QUA, QUI, SEX, SAB],
      faixas: [MANHA],
      modo: 'substituir',
      existentes: [
        { id: 'dom', employee_id: 'e1', weekday: DOM, start_time: '08:00', end_time: '09:00' },
      ],
    }))
    expect(r.novas.map((n) => n.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(r.idsParaRemover).toEqual(['dom'])
  })

  it('só o domingo marcado: a faixa de domingo sai, e a de segunda fica', () => {
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [DOM],
      faixas: [MANHA],
      modo: 'substituir',
      existentes: [
        { id: 'dom', employee_id: 'e1', weekday: DOM, start_time: '08:00', end_time: '09:00' },
        { id: 'seg', employee_id: 'e1', weekday: SEG, start_time: '08:00', end_time: '09:00' },
      ],
    }))
    expect(r.idsParaRemover).toEqual(['dom'])
  })
})

describe('faixa existente SEM id não vira string vazia no delete', () => {
  it('o id ausente é filtrado fora de `idsParaRemover`', () => {
    // `.in('id', [undefined])` viraria `null` no filtro e o delete sairia diferente do
    // pretendido. A faixa some da lista; o par continua sendo substituído.
    const r = aceita(montarGrade({
      profissionais: ['e1'],
      dias: [SEG],
      faixas: [MANHA],
      modo: 'substituir',
      existentes: [
        { id: undefined as any, employee_id: 'e1', weekday: SEG, start_time: '08:00', end_time: '09:00' },
        { id: 'bom', employee_id: 'e1', weekday: SEG, start_time: '19:00', end_time: '20:00' },
      ],
    }))
    expect(r.idsParaRemover).toEqual(['bom'])
  })
})
