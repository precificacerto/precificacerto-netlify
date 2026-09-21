/**
 * credito-previsto-e-confirmado.ts — os DOIS números de crédito de uma nota.
 *
 * Comando do PO de 21/09/2026, §5.
 *
 * >>> PREVISTO E CONFIRMADO NÃO SÃO DUAS VERSÕES DO MESMO NÚMERO <<<
 *
 * | | o que é | quando muda |
 * |---|---|---|
 * | **previsto** | o crédito da nota, no mês da DATA DE ENTRADA | quando a nota muda |
 * | **confirmado** | a parte proporcional às parcelas PAGAS | quando uma parcela é paga |
 *
 * O previsto é o número FISCAL: o crédito nasce da entrada da mercadoria e não espera
 * pagamento (LC 87/1996 arts. 19, 20 e 23; Leis 10.637/2002 e 10.833/2003 art. 3º). O
 * confirmado é o número de CAIXA, e existe porque o usuário precisa saber quanto do crédito
 * projetado já está amarrado a dinheiro que saiu.
 *
 * >>> ONDE CADA UM VALE É REGRA, NÃO PREFERÊNCIA <<<
 *
 * A tabela mora em `numeroOficialDaApuracao` abaixo, e ela é a razão de este módulo existir:
 * sem uma fonte única, cada tela escolheria o número que parece mais prudente — e "prudente"
 * aqui significa recolher imposto que não se devia, ou precificar com um custo que não é o do
 * item.
 *
 * Formulação do dono do produto, §5: *"Quando o número oficial diferir do confirmado, mostrar
 * os dois lado a lado com uma linha de explicação. Nunca trocar um pelo outro em silêncio."*
 */
import type { TributoDoCredito } from '@/utils/creditos-do-periodo'

/** Uma parcela do pagamento da nota. `paidDate` ausente = não paga. */
export interface ParcelaDaNota {
  amount: number
  paidDate?: string | null
}

export interface CreditoDaNota {
  /** O crédito fiscal da nota — o que a apuração usa nos tributos do mês da entrada. */
  previsto: number
  /** A parte proporcional às parcelas pagas. */
  confirmado: number
  /** `previsto − confirmado`. */
  aConfirmar: number
  /**
   * `confirmado ÷ previsto`, em PERCENTUAL.
   *
   * `null` quando o previsto é zero — 0% ali afirmaria que nada foi confirmado de um crédito
   * que não existe (`ausente-vs-falso.md`). E 100% seria pior: afirmaria tudo confirmado.
   */
  percentualConfirmado: number | null
  parcelasPagas: number
  parcelasTotal: number
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Os dois números de uma nota.
 *
 * >>> A PROPORÇÃO É POR VALOR PAGO, NÃO POR CONTAGEM DE PARCELAS <<<
 *
 * Com três parcelas IGUAIS as duas contas dão o mesmo — que é o caso A do §7, e é por isso
 * que ele sozinho não distingue as duas implementações. Com parcelas desiguais elas divergem,
 * e a certa é por valor: o crédito confirmado acompanha o dinheiro que saiu, não o número de
 * linhas quitadas. Há caso medindo a divergência.
 *
 * SEM PARCELAS o confirmado é ZERO, e zero aqui é apurado: não há pagamento nenhum a
 * proporcionalizar. Não é `null` — a pergunta "quanto já foi pago?" tem resposta.
 */
export function creditoPrevistoEConfirmado(args: {
  creditoPrevisto: number
  parcelas: ParcelaDaNota[]
}): CreditoDaNota {
  const previsto = num(args.creditoPrevisto)
  const parcelas = args.parcelas ?? []

  const totalParcelas = parcelas.reduce((a, p) => a + num(p.amount), 0)
  const totalPago = parcelas.reduce((a, p) => a + (p.paidDate ? num(p.amount) : 0), 0)

  const razao = totalParcelas > 0 ? totalPago / totalParcelas : 0
  const confirmado = Math.round(previsto * razao * 100) / 100

  return {
    previsto,
    confirmado,
    aConfirmar: Math.round((previsto - confirmado) * 100) / 100,
    percentualConfirmado: previsto === 0 ? null : Math.round(razao * 10000) / 100,
    parcelasPagas: parcelas.filter((p) => !!p.paidDate).length,
    parcelasTotal: parcelas.length,
  }
}

export type SituacaoDaConfirmacao = 'CONFIRMADO' | 'PARCIAL' | 'A_CONFIRMAR'

export function situacaoDaConfirmacao(c: CreditoDaNota): SituacaoDaConfirmacao {
  if (c.parcelasTotal === 0 || c.confirmado === 0) return 'A_CONFIRMAR'
  if (c.aConfirmar === 0) return 'CONFIRMADO'
  return 'PARCIAL'
}

/**
 * O rótulo da situação — "Parcial 2/3" traz a fração, e ela é a informação.
 *
 * "Parcial" sozinho não diz se falta uma parcela ou nove, e é justamente isso que o usuário
 * precisa saber para decidir se espera ou cobra.
 */
export function rotuloDaSituacao(c: CreditoDaNota): string {
  const s = situacaoDaConfirmacao(c)
  if (s === 'CONFIRMADO') return 'Confirmado'
  if (s === 'A_CONFIRMAR') return 'A confirmar'
  return `Parcial ${c.parcelasPagas}/${c.parcelasTotal}`
}

export type NumeroOficial = 'PREVISTO' | 'CONFIRMADO'

/**
 * QUAL NÚMERO A APURAÇÃO USA, por tributo — a tabela do §5.
 *
 * ICMS, IPI e PIS/COFINS usam SEMPRE o previsto: o crédito nasce da entrada e não espera
 * pagamento. CBS e IBS usam o previsto enquanto o split payment não operar (LC 214/2025
 * art. 48) e o CONFIRMADO quando ele operar (arts. 27 e 47) — ali o crédito passa a
 * depender da liquidação.
 *
 * A chave nasce DESLIGADA, e a função a lê em vez de a supor.
 */
export function numeroOficialDaApuracao(
  tributo: TributoDoCredito,
  splitAtivo: boolean,
): NumeroOficial {
  const ehIva = tributo === 'CBS' || tributo === 'IBS'
  return ehIva && splitAtivo ? 'CONFIRMADO' : 'PREVISTO'
}

/**
 * O número que vale para a apuração, já escolhido — e a informação de que houve divergência.
 *
 * `divergem` é o que a tela lê para exibir os dois lado a lado. Sem ele, trocar um pelo outro
 * seria silencioso, que é o que o §5 proíbe com todas as letras.
 */
export function valorParaApuracao(
  tributo: TributoDoCredito,
  c: CreditoDaNota,
  splitAtivo: boolean,
): { oficial: NumeroOficial; valor: number; divergem: boolean } {
  const oficial = numeroOficialDaApuracao(tributo, splitAtivo)
  const valor = oficial === 'PREVISTO' ? c.previsto : c.confirmado
  return { oficial, valor, divergem: c.previsto !== c.confirmado }
}

/**
 * O CUSTO LÍQUIDO da precificação usa o PREVISTO. Sempre.
 *
 * *"O custo do item não muda por causa de data de pagamento"* (§5). É a mesma disciplina de
 * `fato-vs-referencia.md`: o custo formado é memória de uma compra que aconteceu, e amarrá-lo
 * ao calendário de pagamento o faria mudar sozinho a cada boleto quitado.
 *
 * A função existe para que essa regra tenha ONDE ser afirmada por um caso, em vez de viver
 * como ausência de código.
 */
export function creditoParaOCustoLiquido(c: CreditoDaNota): number {
  return c.previsto
}
