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
 * >>> DUAS DIVERGÊNCIAS ENTRE O ENUNCIADO DOS ORÁCULOS E A MEDIÇÃO <<<
 *
 * Estão registradas nos casos A e C, com o número dos dois lados. Elas não são defeito do
 * comando: são o que acontece quando o oráculo é escrito antes de a régua existir — e a
 * régua, aqui, é a própria simetria que o §2 exige.
 */
import {
  ehRecebimentoPrevisto, entraNaProjecao, efeitoNoSaldo, saldoAcumuladoPorDia,
  rotuloDaFaixaDePrevisto, MODO_PADRAO,
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

const previsto = (linhas = SETEMBRO) => saldoAcumuladoPorDia(linhas, { ...OPCOES, modo: 'PREVISTO' })
const confirmado = (linhas = SETEMBRO) => saldoAcumuladoPorDia(linhas, { ...OPCOES, modo: 'CONFIRMADO' })

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

describe('A — a diferença é exatamente o previsto', () => {
  /**
   * >>> DIVERGÊNCIA COM O ENUNCIADO, REGISTRADA COM OS DOIS NÚMEROS <<<
   *
   * O §5 A diz "PREVISTO menos CONFIRMADO = 68.925,99". Medido, essa diferença é
   * −13.827,05 — e ela NÃO poderia ser 68.925,99, porque o §2 manda o CONFIRMADO tirar
   * também a despesa não paga, que em setembro é R$ 82.753,04.
   *
   * O 68.925,99 é a diferença entre o PREVISTO e o saldo de HOJE, que é o que o §1 mede e
   * o que prova que os cinco recebimentos entraram. Os dois casos abaixo afirmam os dois
   * números, porque o enunciado queria o primeiro e escreveu o nome do segundo.
   */
  it('>>> PREVISTO menos a REGRA ANTIGA = 68.925,99, no dia 30 <<<', () => {
    const antes = saldoComARegraAntiga(SETEMBRO)
    const depois = previsto().saldoAcumulado
    expect(depois[30] - antes[30]).toBeCloseTo(TOTAL_PREVISTO, 2)
    // E os dois números, para que a tabela do PR seja conferível.
    expect(antes[30]).toBeCloseTo(-154522.69, 2)
    expect(depois[30]).toBeCloseTo(-85596.70, 2)
  })

  it('>>> e PREVISTO menos CONFIRMADO é −13.827,05, porque a despesa não paga também sai <<<', () => {
    const p = previsto().saldoAcumulado
    const c = confirmado().saldoAcumulado
    expect(c[30]).toBeCloseTo(-71769.65, 2)
    expect(p[30] - c[30]).toBeCloseTo(-13827.05, 2)
    // A decomposição: +68.925,99 de receita prevista, −82.753,04 de despesa não paga.
    const naoPaga = DESPESAS.filter((e) => !e.paid_date).reduce((s, e) => s + e.amount, 0)
    expect(naoPaga).toBeCloseTo(82753.04, 2)
    expect(TOTAL_PREVISTO - naoPaga).toBeCloseTo(-13827.05, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — DIA A DIA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — o dia em que os dois se separam', () => {
  it('>>> o dia 15 em PREVISTO é o dia 14 mais o movimento do dia, com o boleto dentro <<<', () => {
    const p = previsto()
    expect(p.saldoAcumulado[14]).toBeCloseTo(-56007.86, 2)
    // Movimento do dia 15: +16.666,66 do boleto, −7.285,77 de despesa.
    expect(p.movimento[15]).toBeCloseTo(16666.66 - 7285.77, 2)
    expect(p.saldoAcumulado[15]).toBeCloseTo(-46626.97, 2)
    expect(p.saldoAcumulado[15] - p.saldoAcumulado[14]).toBeCloseTo(p.movimento[15], 2)
  })

  it('>>> PREVISTO e a REGRA ANTIGA coincidem até o dia 14 e divergem a partir do 15 <<<', () => {
    // É o par que localiza o defeito no tempo: antes do primeiro boleto não há o que somar.
    const antes = saldoComARegraAntiga(SETEMBRO)
    const depois = previsto().saldoAcumulado
    for (let i = 1; i <= 14; i++) expect(depois[i]).toBeCloseTo(antes[i], 2)
    expect(depois[15] - antes[15]).toBeCloseTo(16666.66, 2)
  })

  it('>>> e CONFIRMADO já difere no dia 8, porque a primeira despesa não paga é lá <<<', () => {
    // A segunda metade do §5 B dizia que os dois modos coincidem até o 14. Não coincidem:
    // o CONFIRMADO também larga a despesa não paga, e a primeira é do dia 8 (R$ 406,72).
    const p = previsto().saldoAcumulado
    const c = confirmado().saldoAcumulado
    for (let i = 1; i <= 7; i++) expect(c[i]).toBeCloseTo(p[i], 2)
    expect(c[8] - p[8]).toBeCloseTo(406.72, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — O CONFIRMADO MUDA OS DOIS LADOS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — CONFIRMADO não mistura os lados', () => {
  it('>>> despesa não paga SAI, e recebimento previsto também <<<', () => {
    const naoPaga = d(10, 'EXPENSE', 1000, false)
    const paga = d(10, 'EXPENSE', 1000, true)
    expect(efeitoNoSaldo(naoPaga, 'CONFIRMADO')).toBe(0)
    expect(efeitoNoSaldo(paga, 'CONFIRMADO')).toBe(-1000)
    expect(efeitoNoSaldo(boleto(10, 500), 'CONFIRMADO')).toBe(0)
    // E em PREVISTO os três contam, com o sinal deles.
    expect(efeitoNoSaldo(naoPaga, 'PREVISTO')).toBe(-1000)
    expect(efeitoNoSaldo(paga, 'PREVISTO')).toBe(-1000)
    expect(efeitoNoSaldo(boleto(10, 500), 'PREVISTO')).toBe(500)
  })

  /**
   * >>> A SEGUNDA DIVERGÊNCIA COM O ENUNCIADO <<<
   *
   * O §5 C diz que o CONFIRMADO "reproduz o de hoje do lado da receita". Sob o §2 — "só o
   * que tem `paid_date`, dos DOIS lados" — ele não reproduz: hoje uma receita em PIX sem
   * baixa conta na competência, e aqui ela não conta.
   *
   * Implementei o §2, que é a REGRA, e não o §5 C, que descreve uma consequência esperada.
   * Manter a exceção do lado da receita seria a assimetria de novo, em miniatura.
   *
   * O tamanho disso está medido: 13 linhas em toda a base, R$ 102.690,00 — pequeno porque o
   * lançamento em PIX com vencimento passado já nasce com `paid_date`.
   */
  it('>>> receita SEM baixa não entra no CONFIRMADO, nem em PIX <<<', () => {
    const pixSemBaixa: Linha = { type: 'INCOME', amount: 900, due_date: dia(9), paid_date: null, payment_method: 'PIX' }
    expect(efeitoNoSaldo(pixSemBaixa, 'CONFIRMADO')).toBe(0)
    expect(efeitoNoSaldo(pixSemBaixa, 'PREVISTO')).toBe(900)
    // E ela NÃO é "recebimento previsto": a faixa amarela é de boleto, cheque e split.
    expect(ehRecebimentoPrevisto(pixSemBaixa)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — SEM PREVISTO, OS DOIS COINCIDEM
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — sem recebimento previsto e sem despesa em aberto', () => {
  it('>>> PREVISTO e CONFIRMADO dão o mesmo número, ao centavo <<<', () => {
    const soPago = [...DESPESAS.filter((e) => e.paid_date)]
    const p = previsto(soPago).saldoAcumulado
    const c = confirmado(soPago).saldoAcumulado
    for (let i = 1; i <= 30; i++) expect(p[i]).toBeCloseTo(c[i], 2)
    expect(p[30]).toBeCloseTo(-71769.65, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — A FAIXA NÃO DUPLICA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — a faixa amarela é decomposição, não um total paralelo', () => {
  it('>>> o previsto entra UMA vez: o movimento do dia 15 é 9.380,89, não 26.047,55 <<<', () => {
    // Somar a faixa ao acumulado daria 16.666,66 a mais — o número que não existe em
    // lugar nenhum do sistema, e que o rótulo da faixa existe para impedir.
    const p = previsto()
    expect(p.movimento[15]).toBeCloseTo(9380.89, 2)
    expect(p.movimento[15]).not.toBeCloseTo(9380.89 + 16666.66, 2)
  })

  it('>>> e o rótulo diz, em cada modo, o que a faixa é <<<', () => {
    expect(rotuloDaFaixaDePrevisto('PREVISTO')).toBe('já somado no saldo previsto')
    expect(rotuloDaFaixaDePrevisto('CONFIRMADO')).toBe('não entra no saldo confirmado')
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

  it('>>> ele conta no PREVISTO e não no CONFIRMADO <<<', () => {
    expect(ehRecebimentoPrevisto(split)).toBe(true)
    expect(efeitoNoSaldo(split, 'PREVISTO')).toBe(3200)
    expect(efeitoNoSaldo(split, 'CONFIRMADO')).toBe(0)
  })

  it('>>> e com baixa ele conta nos dois <<<', () => {
    const baixado = { ...split, paid_date: dia(19) }
    expect(ehRecebimentoPrevisto(baixado)).toBe(false)
    expect(efeitoNoSaldo(baixado, 'CONFIRMADO')).toBe(3200)
  })

  it('>>> e ele move o saldo de setembro como um boleto moveria <<<', () => {
    const semSplit = previsto().saldoAcumulado[30]
    const comSplit = previsto([...SETEMBRO, split]).saldoAcumulado[30]
    expect(comSplit - semSplit).toBeCloseTo(3200, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — UMA PORTA SÓ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G — a guarda contra a quinta cópia', () => {
  const pagina = readFileSync(join(process.cwd(), 'src', 'pages', 'fluxo-de-caixa', 'index.tsx'), 'utf-8')
  const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('>>> `is_split_remaining` não aparece MAIS na tela — a condição inteira saiu <<<', () => {
    // É o marcador da condição de projeção: as quatro cópias o continham, e nenhuma outra
    // coisa na página o usa. Zero ocorrências é a prova de que nenhuma sobrou.
    expect(semComentario(pagina)).not.toContain('is_split_remaining')
  })

  /**
   * ACRESCENTADO DEPOIS DE UMA MUTAÇÃO SOBREVIVER.
   *
   * Fixar o modo numa das três leituras — trocar `modoDaProjecao` por `'CONFIRMADO'` no
   * total diário — passava por todos os casos: eles medem o MÓDULO, e o módulo continuava
   * certo. O §4.3 existe justamente contra isso: três leituras da mesma tela em modos
   * diferentes é o bug de hoje com outra roupa.
   *
   * Afirma CAMINHO, e é o caso-limite que a regra admite: o efeito só aparece renderizando
   * a página, que exige sessão.
   */
  it('>>> e TODA leitura recebe `modoDaProjecao` — nenhuma fixa o modo <<<', () => {
    const codigo = semComentario(pagina)
    const chamadas = codigo.match(/(?:efeitoNoSaldo|entraNaProjecao)\([^)]*\)/g) ?? []
    // As DUAS chamadas diretas — o total diário e o resumo do DFC. A terceira leitura, o
    // saldo, entra pela dobra, logo abaixo.
    expect(chamadas.length).toBe(2)
    for (const c of chamadas) expect(c).toContain('modoDaProjecao')
    expect(codigo).toMatch(/saldoAcumuladoPorDia\([\s\S]{0,200}modo: modoDaProjecao/)
    // Nenhum dos dois modos aparece como literal fora do seletor e da legenda dele.
    expect((codigo.match(/'CONFIRMADO'/g) ?? []).length).toBe(0)
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

describe('H — o padrão e as bordas', () => {
  it('>>> o padrão é PREVISTO <<<', () => {
    expect(MODO_PADRAO).toBe('PREVISTO')
  })

  it('>>> o saldo inicial entra no dia 1, e o dia sem lançamento repete o anterior <<<', () => {
    const r = saldoAcumuladoPorDia([d(2, 'EXPENSE', 100, true)], { diasNoMes: 3, saldoInicial: 500, modo: 'PREVISTO' })
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
    const r = saldoAcumuladoPorDia(lixo, { diasNoMes: 30, saldoInicial: 0, modo: 'PREVISTO' })
    expect(r.saldoAcumulado[30]).toBe(0)
  })

  it('>>> a antecipação de cartão continua vindo de `getEffectiveIncomeAmount` <<<', () => {
    // Reimplementá-la no módulo faria o saldo e a tabela divergirem no único caso em que
    // elas não podem divergir.
    const cartao = {
      type: 'INCOME', amount: 1000, due_date: dia(5), paid_date: dia(5),
      payment_method: 'CARTAO_CREDITO', anticipated_amount: 400,
    }
    expect(efeitoNoSaldo(cartao, 'PREVISTO')).toBe(600)
    expect(efeitoNoSaldo(cartao, 'CONFIRMADO')).toBe(600)
  })

  it('>>> e `entraNaProjecao` é a única porta: PREVISTO não filtra nada <<<', () => {
    for (const e of SETEMBRO) expect(entraNaProjecao(e, 'PREVISTO')).toBe(true)
  })
})
