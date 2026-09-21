/**
 * creditos-do-periodo.ts — a aba CRÉDITOS: quais notas creditam, quanto, e EM QUE MÊS.
 *
 * Comando do PO de 21/09/2026, §4.
 *
 * >>> O MOMENTO DO CRÉDITO NÃO É O MESMO PARA OS CINCO TRIBUTOS <<<
 *
 * | tributo | quando credita | base |
 * |---|---|---|
 * | ICMS, IPI, PIS/COFINS | mês da NOTA | regime de competência da entrada |
 * | CBS e IBS | mês da NOTA **enquanto o split payment não operar** | LC 214/2025 art. 48 |
 * | CBS e IBS | mês da LIQUIDAÇÃO, quando ele operar | LC 214/2025 arts. 27 e 47 |
 *
 * O split payment é PARÂMETRO com data de início, e ele nasce DESLIGADO. Está assim porque a
 * data não é conhecida: fixá-la no código afirmaria uma vigência que ninguém publicou, e a
 * apuração mudaria sozinha no dia em que o calendário a alcançasse.
 */

export type TributoDoCredito = 'ICMS' | 'PIS_COFINS' | 'IPI' | 'CBS' | 'IBS'

export const TRIBUTOS_DO_CREDITO: readonly TributoDoCredito[] =
  ['ICMS', 'PIS_COFINS', 'IPI', 'CBS', 'IBS'] as const

export type SituacaoDoCredito = 'APROPRIADO' | 'A_APROPRIAR' | 'LEGADO'

export interface NotaDeCompra {
  id: string
  invoiceNumber: string | null
  supplierName: string | null
  expenseNature: string | null
  expenseCategory: string | null
  totalAmount: number | null
  /** A data que MANDA na apuração dos tributos do mês da nota. */
  creditDate: string | null
  /** `true` quando a data foi deduzida (no legado, do vencimento) e não informada. */
  creditDateEstimated: boolean
  /** A data em que a nota foi LIQUIDADA — só ela importa quando o split payment operar. */
  settlementDate?: string | null
  origin: 'NOVO' | 'LEGADO'
  creditos: Partial<Record<TributoDoCredito, number | null>>
}

/**
 * O parâmetro do split payment — LC 214/2025 art. 48.
 *
 * `inicio` é `null` enquanto ninguém publicar a data. Não é uma data no futuro distante:
 * `null` não afirma nada, e uma data inventada afirmaria uma vigência.
 */
export interface ParametroSplitPayment {
  ativo: boolean
  inicio: string | null
}

export const SPLIT_PAYMENT_DESLIGADO: ParametroSplitPayment = { ativo: false, inicio: null }

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const mesDe = (data: string | null | undefined): string | null =>
  data ? String(data).slice(0, 7) : null

/**
 * Em que MÊS o crédito daquele tributo, naquela nota, entra na apuração.
 *
 * `null` quando não dá para dizer — nota sem data de crédito, ou CBS/IBS sob split payment
 * sem data de liquidação. `null` NÃO é "no mês da nota": chutar o mês põe crédito numa
 * competência que ninguém apurou, e o quadro fecharia com um número inventado.
 */
export function mesDoCredito(
  nota: NotaDeCompra,
  tributo: TributoDoCredito,
  split: ParametroSplitPayment = SPLIT_PAYMENT_DESLIGADO,
): string | null {
  const ehIva = tributo === 'CBS' || tributo === 'IBS'
  if (!ehIva) return mesDe(nota.creditDate)

  const splitOpera = split.ativo
    && split.inicio != null
    && nota.creditDate != null
    && String(nota.creditDate) >= String(split.inicio)

  if (!splitOpera) return mesDe(nota.creditDate)
  return mesDe(nota.settlementDate)
}

/** O crédito total de uma nota, somando só os tributos apurados. */
export function creditoTotalDaNota(nota: NotaDeCompra): number {
  return TRIBUTOS_DO_CREDITO.reduce((acc, t) => acc + num(nota.creditos[t]), 0)
}

/**
 * A SITUAÇÃO da nota.
 *
 * `LEGADO` vence as outras duas, e de propósito: a data do crédito ali é o vencimento, não a
 * emissão, e tratá-la como apropriada afirmaria uma competência que foi deduzida. A aba
 * mostra a situação para que o usuário saiba qual número pode levar à apuração sem conferir.
 */
export function situacaoDaNota(
  nota: NotaDeCompra,
  mesDeReferencia: string,
  split: ParametroSplitPayment = SPLIT_PAYMENT_DESLIGADO,
): SituacaoDoCredito {
  if (nota.origin === 'LEGADO' || nota.creditDateEstimated) return 'LEGADO'
  const apropriaAlgumNoMes = TRIBUTOS_DO_CREDITO.some((t) => {
    if (num(nota.creditos[t]) === 0) return false
    return mesDoCredito(nota, t, split) === mesDeReferencia
  })
  return apropriaAlgumNoMes ? 'APROPRIADO' : 'A_APROPRIAR'
}

export interface CardsDoPeriodo {
  /** O crédito que entra NESTE mês, somados os cinco. */
  total: number
  /** Por tributo, o que entra neste mês. */
  porTributo: Record<TributoDoCredito, number>
  /**
   * O que está em nota deste período mas NÃO entra neste mês — CBS/IBS aguardando liquidação,
   * ou nota sem data que permita dizer. É o card "A apropriar".
   */
  aApropriar: number
}

/**
 * Os cards do mês — §4.
 *
 * Uma nota entra no card de um tributo quando `mesDoCredito` daquele tributo é o mês pedido.
 * Os tributos da MESMA nota podem cair em meses diferentes, e é por isso que a conta é por
 * (nota, tributo) e não por nota.
 */
export function cardsDoPeriodo(
  notas: NotaDeCompra[],
  mes: string,
  split: ParametroSplitPayment = SPLIT_PAYMENT_DESLIGADO,
): CardsDoPeriodo {
  const porTributo = Object.fromEntries(
    TRIBUTOS_DO_CREDITO.map((t) => [t, 0]),
  ) as Record<TributoDoCredito, number>
  let aApropriar = 0

  for (const nota of notas) {
    for (const t of TRIBUTOS_DO_CREDITO) {
      const valor = num(nota.creditos[t])
      if (valor === 0) continue
      const m = mesDoCredito(nota, t, split)
      if (m === mes) porTributo[t] += valor
      else if (m == null) aApropriar += valor
    }
  }

  return {
    total: TRIBUTOS_DO_CREDITO.reduce((a, t) => a + porTributo[t], 0),
    porTributo,
    aApropriar,
  }
}

export interface FiltrosDaAba {
  mes?: string | null
  tributo?: TributoDoCredito | null
  fornecedor?: string | null
  natureza?: string | null
  situacao?: SituacaoDoCredito | null
}

/**
 * A lista da aba, filtrada.
 *
 * O filtro por MÊS é por `mesDoCredito` de ALGUM tributo com valor, não pela data da nota: é
 * o mês em que o crédito entra que interessa a quem está apurando.
 */
export function filtrarNotas(
  notas: NotaDeCompra[],
  filtros: FiltrosDaAba,
  split: ParametroSplitPayment = SPLIT_PAYMENT_DESLIGADO,
): NotaDeCompra[] {
  const texto = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase()

  return notas.filter((n) => {
    if (filtros.tributo && num(n.creditos[filtros.tributo]) === 0) return false

    if (filtros.mes) {
      const entraNoMes = TRIBUTOS_DO_CREDITO.some((t) => {
        if (filtros.tributo && t !== filtros.tributo) return false
        if (num(n.creditos[t]) === 0) return false
        return mesDoCredito(n, t, split) === filtros.mes
      })
      if (!entraNoMes) return false
    }

    if (filtros.fornecedor && !texto(n.supplierName).includes(texto(filtros.fornecedor))) return false
    if (filtros.natureza && texto(n.expenseNature) !== texto(filtros.natureza)) return false
    if (filtros.situacao && situacaoDaNota(n, filtros.mes ?? mesDe(n.creditDate) ?? '', split) !== filtros.situacao) return false

    return true
  })
}
