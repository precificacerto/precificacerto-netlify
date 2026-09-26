/**
 * A PROJEÇÃO DE CAIXA SOMA OS DOIS LADOS — oráculos A–H do comando do PO de 25/09/2026.
 *
 * >>> A FIXTURE É PRODUÇÃO, NÃO UM CENÁRIO INVENTADO <<<
 *
 * Os números abaixo foram medidos no banco em 25/09/2026, tenant Esquadrias De Paula Ltda,
 * setembro/2026, com o mesmo filtro que a tela usa (`is_active`, sem `PREV_MONTH_BALANCE`).
 * As cinco receitas são as linhas reais; as despesas estão agregadas por dia em duas linhas
 * — a paga e a não paga —, o que reproduz as três curvas ao centavo e mantém o arquivo
 * legível.
 *
 * Um cenário inventado provaria que a função soma; a fixture medida prova que ela soma o
 * que estava faltando, e quanto.
 *
 * >>> SEIS CASOS SAÍRAM EM 26/09/2026, COM O MODO CONFIRMADO <<<
 *
 * Eles exercitavam um comportamento que o produto não tem mais. Adaptá-los — trocar o
 * `'CONFIRMADO'` por `'PREVISTO'` e ajustar o número esperado — manteria verde um caminho
 * inexistente, que é a pior forma do verde decorativo: ele afirma que algo foi verificado e
 * o que foi verificado não existe. A lista está no corpo do PR.
 *
 * As DUAS DIVERGÊNCIAS que o #79 registrou entre o enunciado dos oráculos e a medição
 * morreram junto com o modo: as duas eram sobre o CONFIRMADO.
 */
import {
  ehRecebimentoPrevisto, entraNaProjecao, efeitoNoSaldo, saldoAcumuladoPorDia,
  rotuloDaFaixaDePrevisto,
} from '@/utils/projecao-de-caixa'
import { readFileSync } from 'fs'
import { join } from 'path'

type Linha = {
  type: string; amount: number; due_date: string
  paid_date?: string | null; payment_method?: string | null; is_split_remaining?: boolean
}

const dia = (n: number) => `2026-09-${String(n).padStart(2, '0')}`
const d = (n: number, type: string, amount: number, pago: boolean, pm?: string): Linha => ({
  type, amount, due_date: dia(n), paid_date: pago ? dia(n) : null, payment_method: pm ?? 'PIX',
})
const boleto = (n: number, amount: number): Linha => ({
  type: 'INCOME', amount, due_date: dia(n), paid_date: null, payment_method: 'BOLETO',
})

/** Os cinco recebimentos previstos, como estão no banco. */
const RECEBIMENTOS_PREVISTOS = [
  boleto(15, 16666.66), boleto(18, 17641.75), boleto(24, 25000),
  boleto(28, 1424.09), boleto(30, 8193.49),
]
const TOTAL_PREVISTO = 68925.99

const DESPESAS: Linha[] = [
  d( 1, 'EXPENSE',   4072.05, true),
  d( 2, 'EXPENSE',   2834.80, true),
  d( 3, 'EXPENSE',   3928.63, true),
  d( 4, 'EXPENSE',   4380.57, true),
  d( 5, 'EXPENSE',   7208.21, true),
  d( 6, 'EXPENSE',    553.79, true),
  d( 7, 'EXPENSE',   4416.92, true),
  d( 8, 'EXPENSE',  12552.82, true),
  d( 8, 'EXPENSE',    406.72, false),
  d( 9, 'EXPENSE',   2595.44, true),
  d( 9, 'EXPENSE',    757.60, false),
  d(10, 'EXPENSE',   1005.35, true),
  d(10, 'EXPENSE',   5353.55, false),
  d(11, 'EXPENSE',   4023.28, true),
  d(12, 'EXPENSE',   1212.80, true),
  d(12, 'EXPENSE',    705.33, false),
  d(15, 'EXPENSE',   5192.78, true),
  d(15, 'EXPENSE',   2092.99, false),
  d(16, 'EXPENSE',    991.62, true),
  d(16, 'EXPENSE',    517.65, false),
  d(17, 'EXPENSE',   7974.34, true),
  d(17, 'EXPENSE',   1200.00, false),
  d(18, 'EXPENSE',   4711.32, true),
  d(18, 'EXPENSE',   7897.92, false),
  d(19, 'EXPENSE',    851.50, false),
  d(20, 'EXPENSE',    538.59, true),
  d(20, 'EXPENSE',    545.42, false),
  d(21, 'EXPENSE',   1471.67, true),
  d(21, 'EXPENSE',   1038.23, false),
  d(22, 'EXPENSE',    756.14, false),
  d(23, 'EXPENSE',   2104.67, true),
  d(24, 'EXPENSE',   3669.00, false),
  d(25, 'EXPENSE',   9392.95, false),
  d(27, 'EXPENSE',  23515.68, false),
  d(28, 'EXPENSE',  20591.94, false),
  d(30, 'EXPENSE',   3460.42, false),
]

const SETEMBRO = [...DESPESAS, ...RECEBIMENTOS_PREVISTOS]
const OPCOES = { diasNoMes: 30, saldoInicial: 0 }

const fluxo = (linhas = SETEMBRO) => saldoAcumuladoPorDia(linhas, OPCOES)

/**
 * A REGRA ANTIGA, reproduzida para servir de RÉGUA — e só para isso.
 *
 * Receita: só a confirmada. Despesa: toda lançada. É o comentário que estava no arquivo, em
 * código. Sem ela não há como medir o tamanho do defeito: o "depois" sozinho é um número
 * sem contraste.
 */
function saldoComARegraAntiga(linhas: readonly Linha[]): Record<number, number> {
  const mov: Record<number, number> = {}
  for (let i = 1; i <= 30; i++) mov[i] = 0
  for (const e of linhas) {
    const n = parseInt(e.due_date.substring(8, 10), 10)
    if (e.type === 'INCOME') {
      const esperaBaixa = (e.payment_method === 'BOLETO' || e.payment_method === 'CHEQUE_PRE_DATADO' || e.is_split_remaining) && !e.paid_date
      if (!esperaBaixa) mov[n] += e.amount
    } else {
      mov[n] -= e.amount
    }
  }
  const acc: Record<number, number> = {}
  let corrente = 0
  for (let i = 1; i <= 30; i++) { corrente += mov[i]; acc[i] = corrente }
  return acc
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — O TAMANHO DO DEFEITO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — o saldo é o do #79, e continua 68.925,99 acima do de antes dele', () => {
  /**
   * >>> O CASO AFIRMA O NÚMERO, NÃO A AUSÊNCIA DO BOTÃO <<<
   *
   * Tirar um seletor é o tipo de mudança que passa em qualquer caso de ausência e quebra o
   * número sem ninguém ver: bastaria a leitura remanescente ter herdado o filtro errado.
   * −85.596,70 é o que o modo Previsto do #79 produzia, ao centavo.
   */
  it('>>> o acumulado do dia 30 é −85.596,70, e a régua antiga dava −154.522,69 <<<', () => {
    const antes = saldoComARegraAntiga(SETEMBRO)
    const agora = fluxo().saldoAcumulado
    expect(antes[30]).toBeCloseTo(-154522.69, 2)
    expect(agora[30]).toBeCloseTo(-85596.70, 2)
    expect(agora[30] - antes[30]).toBeCloseTo(TOTAL_PREVISTO, 2)
  })

  it('>>> e a despesa não paga CONTINUA no saldo — os dois lados são lançados <<<', () => {
    // O par que separa "tirei o seletor" de "fiquei com o Confirmado por engano". Sem ele,
    // uma leitura que exigisse `paid_date` dos dois lados daria −71.769,65 e nenhum caso de
    // ausência de botão notaria.
    const naoPaga = DESPESAS.filter((e) => !e.paid_date).reduce((s, e) => s + e.amount, 0)
    expect(naoPaga).toBeCloseTo(82753.04, 2)
    expect(fluxo().saldoAcumulado[30]).not.toBeCloseTo(-71769.65, 2)
    expect(efeitoNoSaldo(d(10, 'EXPENSE', 1000, false))).toBe(-1000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — DIA A DIA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — o dia em que os dois se separam', () => {
  it('>>> o dia 15 é o dia 14 mais o movimento do dia, com o boleto dentro <<<', () => {
    const p = fluxo()
    expect(p.saldoAcumulado[14]).toBeCloseTo(-56007.86, 2)
    // Movimento do dia 15: +16.666,66 do boleto, −7.285,77 de despesa.
    expect(p.movimento[15]).toBeCloseTo(16666.66 - 7285.77, 2)
    expect(p.saldoAcumulado[15]).toBeCloseTo(-46626.97, 2)
    expect(p.saldoAcumulado[15] - p.saldoAcumulado[14]).toBeCloseTo(p.movimento[15], 2)
  })

  it('>>> o fluxo e a REGRA ANTIGA coincidem até o dia 14 e divergem a partir do 15 <<<', () => {
    // É o par que localiza o defeito no tempo: antes do primeiro boleto não há o que somar.
    const antes = saldoComARegraAntiga(SETEMBRO)
    const depois = fluxo().saldoAcumulado
    for (let i = 1; i <= 14; i++) expect(depois[i]).toBeCloseTo(antes[i], 2)
    expect(depois[15] - antes[15]).toBeCloseTo(16666.66, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — SÓ O QUE TEM BAIXA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — um mês só com lançamentos baixados', () => {
  /**
   * O que era "os dois modos coincidem" virou um caso de VALOR: sem nada em aberto, o
   * fluxo é a soma do que foi pago, e o número é o mesmo que o antigo CONFIRMADO dava no
   * mês inteiro. Ele fica porque prova que a leitura única não inventou nada — não porque
   * um modo sobreviveu.
   */
  it('>>> o acumulado é −71.769,65, a soma das despesas pagas <<<', () => {
    const soPago = DESPESAS.filter((e) => e.paid_date)
    expect(fluxo(soPago).saldoAcumulado[30]).toBeCloseTo(-71769.65, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — A FAIXA NÃO DUPLICA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — a faixa amarela é decomposição, não um total paralelo', () => {
  it('>>> o previsto entra UMA vez: o movimento do dia 15 é 9.380,89, não 26.047,55 <<<', () => {
    // Somar a faixa ao acumulado daria 16.666,66 a mais — o número que não existe em
    // lugar nenhum do sistema, e que o rótulo da faixa existe para impedir.
    const p = fluxo()
    expect(p.movimento[15]).toBeCloseTo(9380.89, 2)
    expect(p.movimento[15]).not.toBeCloseTo(9380.89 + 16666.66, 2)
  })

  it('>>> e o rótulo é ÚNICO, agora que a leitura é uma só <<<', () => {
    expect(rotuloDaFaixaDePrevisto()).toBe('já somado no saldo')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — SPLIT
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — o resto de split é previsto, igual ao boleto', () => {
  const split: Linha = {
    type: 'INCOME', amount: 3200, due_date: dia(19), paid_date: null,
    payment_method: 'PIX', is_split_remaining: true,
  }

  it('>>> ele conta no saldo, sem baixa — como qualquer lançamento <<<', () => {
    expect(ehRecebimentoPrevisto(split)).toBe(true)
    expect(efeitoNoSaldo(split)).toBe(3200)
  })

  it('>>> e com baixa ele conta igual: o valor não muda, só o selo da faixa <<<', () => {
    // O par que mantém `ehRecebimentoPrevisto` honesta depois que o modo saiu: ela decide
    // a FAIXA, e não o saldo. Se ela voltasse a decidir o saldo, este caso quebraria.
    const baixado = { ...split, paid_date: dia(19) }
    expect(ehRecebimentoPrevisto(baixado)).toBe(false)
    expect(efeitoNoSaldo(baixado)).toBe(3200)
  })

  it('>>> e ele move o saldo de setembro como um boleto moveria <<<', () => {
    const semSplit = fluxo().saldoAcumulado[30]
    const comSplit = fluxo([...SETEMBRO, split]).saldoAcumulado[30]
    expect(comSplit - semSplit).toBeCloseTo(3200, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — UMA PORTA SÓ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G — a guarda contra a quinta cópia', () => {
  const pagina = readFileSync(join(process.cwd(), 'src', 'pages', 'fluxo-de-caixa', 'index.tsx'), 'utf-8')
  const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  /**
   * §4 A — O SELETOR NÃO EXISTE.
   *
   * A tela não é renderizável daqui (a página exige sessão), então o caso lê o arquivo — e
   * é por isso que ele não se contenta com a ausência do texto: ele afirma a ausência do
   * CONTROLE e a do estado que o guardava. Um botão removido com o `useState` esquecido
   * deixaria o modo vivo para o próximo que precisasse dele.
   *
   * O par que o torna discriminante está no bloco A: o NÚMERO. Ausência de botão sozinha
   * passaria com a leitura errada no lugar.
   */
  it('>>> o seletor de modo saiu: nem controle, nem estado, nem literal <<<', () => {
    const codigo = semComentario(pagina)
    expect(codigo).not.toContain('setModoDaProjecao')
    expect(codigo).not.toContain('ModoDaProjecao')
    expect(codigo).not.toContain('MODO_PADRAO')
    expect(codigo).not.toMatch(/Radio\.Button value="(PREVISTO|CONFIRMADO)"/)
    // E o módulo não exporta mais o conceito.
    // Sem comentário: a prosa do módulo EXPLICA por que o modo saiu, e citá-lo lá não o
    // traz de volta. O que não pode voltar é código.
    const modulo = semComentario(readFileSync(join(process.cwd(), 'src', 'utils', 'projecao-de-caixa.ts'), 'utf-8'))
    expect(modulo).not.toMatch(/export (type|const) (ModoDaProjecao|MODO_PADRAO)/)
    // Nem deixou o parâmetro com valor padrão, que é o caminho morto que ninguém testa.
    expect(modulo).not.toMatch(/modo\s*[:=]/)
  })

  it('>>> a FAIXA continua, com o rótulo fixo — ela é o que impede a leitura em dobro <<<', () => {
    expect(pagina).toContain('rotuloDaFaixaDePrevisto()')
    expect(pagina).toContain('__PENDING_INCOME__')
    expect(pagina).toContain('A Receber (Boleto/Cheque)')
    // E `ehRecebimentoPrevisto` continua sendo quem a separa.
    expect(semComentario(pagina)).toContain('ehRecebimentoPrevisto(entry)')
  })

  it('>>> `is_split_remaining` não aparece MAIS na tela — a condição inteira saiu <<<', () => {
    // É o marcador da condição de projeção: as quatro cópias o continham, e nenhuma outra
    // coisa na página o usa. Zero ocorrências é a prova de que nenhuma sobrou.
    expect(semComentario(pagina)).not.toContain('is_split_remaining')
  })

  /**
   * HERDADO DO #79, onde ele nasceu para matar uma mutação que fixava o modo numa das
   * leituras. Sem modo, ele afirma o que sobrou: NENHUMA leitura filtra por conta própria.
   *
   * O par `'PREVISTO'`/`'CONFIRMADO'` não pode reaparecer na página nem como string —
   * é assim que um modo volta pela porta dos fundos, numa leitura só, e as quatro
   * discordam de novo.
   */
  it('>>> nenhuma leitura reintroduz modo, nem como literal <<<', () => {
    const codigo = semComentario(pagina)
    const chamadas = codigo.match(/(?:efeitoNoSaldo|entraNaProjecao)\([^)]*\)/g) ?? []
    // As DUAS chamadas diretas — o total diário e o resumo do DFC. A terceira leitura, o
    // saldo, entra pela dobra, logo abaixo.
    expect(chamadas.length).toBe(2)
    for (const c of chamadas) expect(c).toMatch(/\((entry|e)\)$/)
    expect(codigo).toMatch(/saldoAcumuladoPorDia\(regularData, \{/)
    expect((codigo.match(/'CONFIRMADO'/g) ?? []).length).toBe(0)
    expect((codigo.match(/'PREVISTO'/g) ?? []).length).toBe(0)
    expect(codigo).not.toContain('modoDaProjecao')
  })

  it('>>> e a tela chama as três funções do módulo <<<', () => {
    for (const f of ['ehRecebimentoPrevisto(', 'entraNaProjecao(', 'efeitoNoSaldo(']) {
      expect(pagina).toContain(f)
    }
    expect(pagina).toContain("from '@/utils/projecao-de-caixa'")
  })

  /**
   * O QUE ESTE CASO NÃO BARRA, e está declarado para não virar descoberta tardia.
   *
   * Sobram na página OITO usos de `CHEQUE_PRE_DATADO` que respondem a OUTRA pergunta, e a
   * contagem está fixada aqui para que uma nona precise ser justificada:
   *
   *   2 — as listas de forma de pagamento (receita e despesa), que são rótulos;
   *   4 — decisões de GRAVAÇÃO: se o lançamento nasce com `paid_date`, se o modal pede a
   *       baixa, se o parcelamento é de boleto;
   *   2 — `needsConfirmation`, que decide se a LINHA ganha botão de confirmar.
   *
   * Nenhuma delas decide quem entra no saldo.
   *
   * O `needsConfirmation` é o mais próximo e NÃO foi trocado: ele omite o split, e incluí-lo
   * daria à linha de split um selo que ela não tem hoje. É mudança de comportamento que o
   * comando não pediu, e fica registrada para o PO decidir.
   */
  it('>>> e o que sobra é de outra natureza — a contagem fica fixada <<<', () => {
    const ocorrencias = (semComentario(pagina).match(/CHEQUE_PRE_DATADO/g) ?? []).length
    expect(ocorrencias).toBe(8)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// H — O CONTRATO DO MÓDULO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('H — as bordas do módulo', () => {
  it('>>> o saldo inicial entra no dia 1, e o dia sem lançamento repete o anterior <<<', () => {
    const r = saldoAcumuladoPorDia([d(2, 'EXPENSE', 100, true)], { diasNoMes: 3, saldoInicial: 500 })
    expect(r.saldoDiaAnterior[1]).toBe(500)
    expect(r.saldoAcumulado[1]).toBe(500)
    expect(r.saldoAcumulado[2]).toBe(400)
    expect(r.saldoAcumulado[3]).toBe(400)
  })

  it('>>> linha sem data, fora do mês ou de tipo desconhecido não move nada <<<', () => {
    const lixo = [
      { type: 'EXPENSE', amount: 999, due_date: null as unknown as string },
      { type: 'EXPENSE', amount: 999, due_date: '2026-09-31' },
      { type: 'OUTRA_COISA', amount: 999, due_date: dia(2) },
    ] as Linha[]
    const r = saldoAcumuladoPorDia(lixo, { diasNoMes: 30, saldoInicial: 0 })
    expect(r.saldoAcumulado[30]).toBe(0)
  })

  it('>>> a antecipação de cartão continua vindo de `getEffectiveIncomeAmount` <<<', () => {
    // Reimplementá-la no módulo faria o saldo e a tabela divergirem no único caso em que
    // elas não podem divergir.
    const cartao = {
      type: 'INCOME', amount: 1000, due_date: dia(5), paid_date: dia(5),
      payment_method: 'CARTAO_CREDITO', anticipated_amount: 400,
    }
    expect(efeitoNoSaldo(cartao)).toBe(600)
  })

  it('>>> `entraNaProjecao` aceita todo lançamento e recusa o que não é lançamento <<<', () => {
    for (const e of SETEMBRO) expect(entraNaProjecao(e)).toBe(true)
    // O par que impede a função de virar `() => true`: ela ainda recusa o que não é
    // receita nem despesa — o `PREV_MONTH_BALANCE` e o que vier depois dele.
    expect(entraNaProjecao({ type: 'PREV_MONTH_BALANCE', amount: 100 })).toBe(false)
    expect(entraNaProjecao({} as never)).toBe(false)
  })
})
