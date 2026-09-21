/**
 * O ORÁCULO DO COMANDO DE 21/09/2026 — §7, casos A a G.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR <<<
 *
 * O caso A do §7 tem TRÊS PARCELAS IGUAIS, e com parcelas iguais "proporcional ao VALOR pago"
 * e "proporcional à CONTAGEM de parcelas pagas" dão o MESMO número. Ele sozinho não distingue
 * as duas implementações, e a certa é por valor. Por isso há um caso com parcelas DESIGUAIS,
 * medindo a divergência. (`teste-que-nao-exercita.md`, variante 2.)
 */
import {
  creditoPrevistoEConfirmado, situacaoDaConfirmacao, rotuloDaSituacao,
  numeroOficialDaApuracao, valorParaApuracao, creditoParaOCustoLiquido,
} from '@/utils/credito-previsto-e-confirmado'
import { mesDoCredito, type NotaDeCompra } from '@/utils/creditos-do-periodo'
import {
  resumirVencidos, chaveDeDispensa, textoDaFaixa, diasEntre, type EntradaBruta,
} from '@/utils/vencidos-do-tenant'
import { deveAbrirSozinho } from '@/components/cashflow/vencidos-modal.component'
import { LARGURA_MODAL_50, LARGURA_MODAL_75 } from '@/utils/largura-de-modal'

// ─────────────────────────────────────────────────────────────────────────────────────────
// A e B — previsto × confirmado
// ─────────────────────────────────────────────────────────────────────────────────────────

const TRES_IGUAIS = (pagas: number) =>
  [0, 1, 2].map((i) => ({ amount: 10000 / 3, paidDate: i < pagas ? '2026-09-10' : null }))

describe('A — nota de 10.000,00 com crédito 1.800,00, 2 de 3 parcelas pagas', () => {
  const c = creditoPrevistoEConfirmado({ creditoPrevisto: 1800, parcelas: TRES_IGUAIS(2) })

  it('>>> previsto 1.800,00 · confirmado 1.200,00 · a confirmar 600,00 · 66,67% <<<', () => {
    expect(c.previsto).toBeCloseTo(1800, 2)
    expect(c.confirmado).toBeCloseTo(1200, 2)
    expect(c.aConfirmar).toBeCloseTo(600, 2)
    expect(c.percentualConfirmado).toBeCloseTo(66.67, 2)
  })

  it('a situação é PARCIAL, e o rótulo traz a fração', () => {
    expect(situacaoDaConfirmacao(c)).toBe('PARCIAL')
    expect(rotuloDaSituacao(c)).toBe('Parcial 2/3')
  })

  it('com as três pagas, confirmado = previsto e a situação vira CONFIRMADO', () => {
    const t = creditoPrevistoEConfirmado({ creditoPrevisto: 1800, parcelas: TRES_IGUAIS(3) })
    expect(t.confirmado).toBeCloseTo(1800, 2)
    expect(t.aConfirmar).toBeCloseTo(0, 2)
    expect(rotuloDaSituacao(t)).toBe('Confirmado')
  })
})

describe('>>> A PROPORÇÃO É POR VALOR PAGO, NÃO POR CONTAGEM <<<', () => {
  /**
   * Três parcelas DESIGUAIS: 8.000 + 1.000 + 1.000. Pagando as duas pequenas, a contagem diz
   * 2/3 (1.200,00) e o valor diz 20% (360,00). O caso A do §7 não separa as duas, porque
   * lá as parcelas são iguais — este separa.
   */
  const desiguais = [
    { amount: 8000, paidDate: null },
    { amount: 1000, paidDate: '2026-09-10' },
    { amount: 1000, paidDate: '2026-09-11' },
  ]
  const c = creditoPrevistoEConfirmado({ creditoPrevisto: 1800, parcelas: desiguais })

  it('confirma 360,00 — os 20% do dinheiro que saiu, e não os 66,67% das linhas', () => {
    expect(c.confirmado).toBeCloseTo(360, 2)
    expect(c.confirmado).not.toBeCloseTo(1200, 2)
    expect(c.percentualConfirmado).toBeCloseTo(20, 2)
  })

  it('e o rótulo continua dizendo 2/3 — a fração é das PARCELAS, o número é do dinheiro', () => {
    expect(rotuloDaSituacao(c)).toBe('Parcial 2/3')
  })
})

describe('B — nenhuma parcela paga', () => {
  const c = creditoPrevistoEConfirmado({ creditoPrevisto: 1800, parcelas: TRES_IGUAIS(0) })

  it('>>> previsto 1.800,00 · confirmado 0,00 <<<', () => {
    expect(c.previsto).toBeCloseTo(1800, 2)
    expect(c.confirmado).toBeCloseTo(0, 2)
    expect(rotuloDaSituacao(c)).toBe('A confirmar')
  })

  it('>>> e a APURAÇÃO DE ICMS usa 1.800,00 — o crédito não espera pagamento <<<', () => {
    const v = valorParaApuracao('ICMS', c, false)
    expect(v.oficial).toBe('PREVISTO')
    expect(v.valor).toBeCloseTo(1800, 2)
    expect(v.valor).not.toBeCloseTo(0, 2)
  })

  it('>>> e ela DECLARA a divergência — trocar um pelo outro em silêncio é o que o §5 proíbe <<<', () => {
    expect(valorParaApuracao('ICMS', c, false).divergem).toBe(true)
  })

  it('sem parcelas nenhumas, confirmado é ZERO apurado — não é `null`', () => {
    const semParcelas = creditoPrevistoEConfirmado({ creditoPrevisto: 1800, parcelas: [] })
    expect(semParcelas.confirmado).toBe(0)
    expect(semParcelas.parcelasTotal).toBe(0)
  })

  it('>>> crédito previsto ZERO devolve percentual `null`, não 0% nem 100% <<<', () => {
    // 0% afirmaria que nada foi confirmado de um crédito que não existe; 100% seria pior.
    const semCredito = creditoPrevistoEConfirmado({ creditoPrevisto: 0, parcelas: TRES_IGUAIS(3) })
    expect(semCredito.percentualConfirmado).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// C — a DATA DE ENTRADA define o mês do crédito
// ─────────────────────────────────────────────────────────────────────────────────────────

const nota = (over: Partial<NotaDeCompra> = {}): NotaDeCompra => ({
  id: 'n1', invoiceNumber: '1', supplierName: 'F', expenseNature: 'INSUMO',
  expenseCategory: 'Matéria Prima - Base dos produtos', totalAmount: 10000,
  creditDate: '2026-09-02', creditDateEstimated: false, settlementDate: null,
  origin: 'NOVO', creditos: { ICMS: 1800 }, ...over,
})

describe('C — entrada em 02/09 e emissão em 30/08: o crédito é de SETEMBRO', () => {
  it('>>> quem recebe a mercadoria lança a nota, e a ENTRADA manda <<<', () => {
    expect(mesDoCredito(nota(), 'ICMS')).toBe('2026-09')
  })

  it('>>> mudar SÓ a emissão não move o crédito — ela é informação da nota <<<', () => {
    // A emissão não entra em `mesDoCredito`: não há campo dela na conta, e é isso que o caso
    // afirma. Se alguém a introduzir ali, este caso fica vermelho.
    const comOutraEmissao = { ...nota(), issueDate: '2026-07-01' } as NotaDeCompra
    expect(mesDoCredito(comOutraEmissao, 'ICMS')).toBe('2026-09')
  })

  it('>>> mudar a ENTRADA para 30/08 move o crédito para agosto <<<', () => {
    expect(mesDoCredito(nota({ creditDate: '2026-08-30' }), 'ICMS')).toBe('2026-08')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// D — split payment ligado
// ─────────────────────────────────────────────────────────────────────────────────────────

describe('D — split payment: CBS e IBS passam a usar o CONFIRMADO', () => {
  const c = creditoPrevistoEConfirmado({
    creditoPrevisto: 890,
    parcelas: [{ amount: 5000, paidDate: '2026-09-10' }, { amount: 5000, paidDate: null }],
  })

  it('>>> com o split LIGADO a apuração usa 445,00, não 890,00 <<<', () => {
    for (const t of ['CBS', 'IBS'] as const) {
      const v = valorParaApuracao(t, c, true)
      expect(v.oficial).toBe('CONFIRMADO')
      expect(v.valor).toBeCloseTo(445, 2)
      expect(v.valor).not.toBeCloseTo(890, 2)
    }
  })

  it('>>> DESLIGADO — o padrão — os dois voltam ao previsto <<<', () => {
    expect(valorParaApuracao('CBS', c, false).valor).toBeCloseTo(890, 2)
    expect(numeroOficialDaApuracao('CBS', false)).toBe('PREVISTO')
  })

  it('>>> e o split NÃO toca ICMS, IPI nem PIS/COFINS, em nenhum dos dois estados <<<', () => {
    for (const t of ['ICMS', 'IPI', 'PIS_COFINS'] as const) {
      for (const split of [true, false]) {
        expect(numeroOficialDaApuracao(t, split)).toBe('PREVISTO')
        expect(valorParaApuracao(t, c, split).valor).toBeCloseTo(890, 2)
      }
    }
  })
})

describe('>>> O CUSTO LÍQUIDO usa o PREVISTO — preço não muda por data de pagamento <<<', () => {
  it.each([[0, 890], [1, 890], [2, 890]])('com %s parcela(s) paga(s), o custo usa 890,00', (pagas) => {
    const c = creditoPrevistoEConfirmado({
      creditoPrevisto: 890,
      parcelas: [0, 1].map((i) => ({ amount: 5000, paidDate: i < pagas ? '2026-09-10' : null })),
    })
    expect(creditoParaOCustoLiquido(c)).toBeCloseTo(890, 2)
  })

  it('e ele NÃO é o confirmado: com uma parcela paga os dois divergem em 445,00', () => {
    const c = creditoPrevistoEConfirmado({
      creditoPrevisto: 890,
      parcelas: [{ amount: 5000, paidDate: '2026-09-10' }, { amount: 5000, paidDate: null }],
    })
    expect(creditoParaOCustoLiquido(c)).not.toBeCloseTo(c.confirmado, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
// E e G — vencidos: UMA fonte para o modal e para a faixa
// ─────────────────────────────────────────────────────────────────────────────────────────

const HOJE = '2026-09-21'
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const lanc = (o: Partial<EntradaBruta>): EntradaBruta => ({
  id: 'x', type: 'EXPENSE', due_date: '2026-09-01', paid_date: null,
  description: 'Conta', amount: 100, is_active: true, ...o,
})

describe('E — o modal e a faixa leem a MESMA função', () => {
  const entradas = [
    lanc({ id: 'd1', amount: 1000, due_date: '2026-09-01' }),
    lanc({ id: 'd2', amount: 500, due_date: '2026-08-15' }),
    lanc({ id: 'r1', type: 'INCOME', amount: 2000, due_date: '2026-09-05' }),
  ]
  const r = resumirVencidos(entradas, HOJE)

  it('duas despesas (1.500,00) e um recebimento (2.000,00)', () => {
    expect(r.aPagar).toHaveLength(2)
    expect(r.totalAPagar).toBeCloseTo(1500, 2)
    expect(r.aReceber).toHaveLength(1)
    expect(r.totalAReceber).toBeCloseTo(2000, 2)
  })

  it('>>> a faixa é DERIVADA do mesmo resumo — não há segunda contagem <<<', () => {
    expect(textoDaFaixa(r, brl)).toBe('2 despesas vencidas (R$ 1.500,00) · 1 recebimento vencido (R$ 2.000,00)')
  })

  it('o mais antigo vem primeiro — é a ordem em que se resolve atraso', () => {
    expect(r.aPagar.map((v) => v.id)).toEqual(['d2', 'd1'])
    expect(r.aPagar[0].diasEmAtraso).toBe(diasEntre('2026-08-15', HOJE))
  })

  it('>>> o que vence HOJE não está vencido — o corte é `<`, não `<=` <<<', () => {
    // Listá-lo faria o usuário reagendar uma conta que ainda pode pagar.
    expect(resumirVencidos([lanc({ due_date: HOJE })], HOJE).temVencidos).toBe(false)
    expect(resumirVencidos([lanc({ due_date: '2026-09-20' })], HOJE).temVencidos).toBe(true)
  })

  it('pago e cancelado ficam de fora', () => {
    expect(resumirVencidos([lanc({ paid_date: '2026-09-02' })], HOJE).temVencidos).toBe(false)
    expect(resumirVencidos([lanc({ is_active: false })], HOJE).temVencidos).toBe(false)
  })

  it('>>> sem vencidos, a faixa é VAZIA — ela não mente exibindo zero <<<', () => {
    const vazio = resumirVencidos([], HOJE)
    expect(vazio.temVencidos).toBe(false)
    expect(textoDaFaixa(vazio, brl)).toBe('')
  })
})

describe('>>> A dispensa é por SESSÃO e por CONJUNTO, não só por tenant <<<', () => {
  const base = [lanc({ id: 'd1' })]
  const r1 = resumirVencidos(base, HOJE)

  it('a mesma lista devolve a mesma chave', () => {
    expect(chaveDeDispensa('t1', r1)).toBe(chaveDeDispensa('t1', resumirVencidos(base, HOJE)))
  })

  it('>>> um vencido NOVO muda a chave, e o modal volta a abrir <<<', () => {
    // Sem isso, dispensar uma vez calaria o modal até o próximo login, inclusive para um
    // vencido que apareceu depois — e o §3 diz "nunca suprimir para sempre".
    const r2 = resumirVencidos([...base, lanc({ id: 'd2' })], HOJE)
    expect(chaveDeDispensa('t1', r2)).not.toBe(chaveDeDispensa('t1', r1))
  })

  it('tenants diferentes nunca compartilham a dispensa', () => {
    expect(chaveDeDispensa('t2', r1)).not.toBe(chaveDeDispensa('t1', r1))
  })
})

describe('G — reagendar tira da lista sem mexer em valor nem em crédito', () => {
  const antes = [lanc({ id: 'd1', amount: 1000, due_date: '2026-09-01' })]

  it('>>> novo vencimento no futuro: sai do modal E da faixa, com o mesmo valor <<<', () => {
    const depois = [{ ...antes[0], due_date: '2026-10-05' }]
    expect(resumirVencidos(antes, HOJE).temVencidos).toBe(true)
    expect(resumirVencidos(depois, HOJE).temVencidos).toBe(false)
    expect(textoDaFaixa(resumirVencidos(depois, HOJE), brl)).toBe('')
    expect(depois[0].amount).toBe(antes[0].amount)
  })

  it('>>> e o CRÉDITO não se mexe: ele é do mês da ENTRADA, não do vencimento <<<', () => {
    // Reagendar move o caixa. O crédito segue a data de entrada da nota, e é por isso que
    // as duas coisas moram em funções diferentes.
    expect(mesDoCredito(nota(), 'ICMS')).toBe('2026-09')
  })
})

describe('>>> O modal abre UMA VEZ por sessão, e volta quando surge um vencido novo <<<', () => {
  const dispensadas = new Set<string>()
  const dispensada = (k: string) => dispensadas.has(k)
  const um = resumirVencidos([lanc({ id: 'd1' })], HOJE)

  it('com vencidos e sem dispensa, abre', () => {
    expect(deveAbrirSozinho('t1', um, dispensada)).toBe(true)
  })

  it('dispensado, não abre de novo', () => {
    dispensadas.add(chaveDeDispensa('t1', um))
    expect(deveAbrirSozinho('t1', um, dispensada)).toBe(false)
  })

  it('>>> mas um vencido NOVO faz voltar — "nunca suprimir para sempre" <<<', () => {
    const dois = resumirVencidos([lanc({ id: 'd1' }), lanc({ id: 'd2' })], HOJE)
    expect(deveAbrirSozinho('t1', dois, dispensada)).toBe(true)
  })

  it('sem vencidos nunca abre, mesmo sem dispensa', () => {
    expect(deveAbrirSozinho('t1', resumirVencidos([], HOJE), () => false)).toBe(false)
  })

  it('sem tenant não abre', () => {
    expect(deveAbrirSozinho(null, um, () => false)).toBe(false)
  })
})

describe('>>> §2 — a largura do modal de despesa é 50vw, com piso e teto <<<', () => {
  it('50vw entre 720px e 1100px; o padrão dos demais segue 75vw', () => {
    // O piso existe para que o bloco de impostos não seja espremido; o teto, para que a
    // tabela não fique com colunas perdidas numa tela larga.
    expect(LARGURA_MODAL_50.width).toBe('clamp(720px, 50vw, 1100px)')
    expect(LARGURA_MODAL_75.width).toBe('clamp(720px, 75vw, 1400px)')
  })

  it('>>> e os dois têm teto de viewport — nada é cortado fora da tela <<<', () => {
    expect(LARGURA_MODAL_50.style.maxWidth).toBe('96vw')
    expect(LARGURA_MODAL_75.style.maxWidth).toBe('96vw')
  })
})
