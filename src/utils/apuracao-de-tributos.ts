/**
 * apuracao-de-tributos.ts — o QUADRO DE APURAÇÃO, por tributo e por mês.
 *
 * Comando do PO de 21/09/2026, §5:
 *
 *   > Débito da competência = Guia (competência do mês) + Créditos do mês
 *   >                         + (Saldo credor anterior − Saldo credor atual)
 *   > A recolher = Débito − Crédito − Saldo credor anterior
 *
 * >>> ELE NÃO É LINHA DO DRE, E ISSO É A REGRA, NÃO O LAYOUT <<<
 *
 * Formulação do dono do produto, §6: *"Crédito NUNCA é categoria de despesa no DRE — é
 * redução do custo/despesa. Ele só é independente no quadro de apuração e na aba Créditos."*
 *
 * O DRE mede resultado; o quadro mede uma CONTA CORRENTE com o fisco, que atravessa meses
 * pelo saldo credor. Pôr o crédito como linha do DRE o contaria duas vezes — ele já está
 * deduzido do custo — e pôr o saldo credor lá afirmaria um resultado que não aconteceu.
 *
 * >>> O DÉBITO É DEDUZIDO, E É POR ISSO QUE A FÓRMULA TEM ESSA CARA <<<
 *
 * O sistema não conhece o débito: ele conhece a GUIA (o que se recolheu) e os CRÉDITOS. O
 * débito é `guia + crédito`, ajustado pelo que entrou e saiu do saldo credor. Enquanto as
 * guias por competência não existirem, o número não é apurável — e `null` é o que se devolve,
 * nunca zero (`ausente-vs-falso.md`): zero afirmaria que não houve operação no mês.
 */

export type TributoApuravel = 'ICMS' | 'PIS' | 'COFINS' | 'IPI' | 'CBS' | 'IBS'

export const TRIBUTOS_APURAVEIS: readonly TributoApuravel[] =
  ['ICMS', 'PIS', 'COFINS', 'IPI', 'CBS', 'IBS'] as const

/**
 * Os tipos de guia que ENTRAM na apuração — §5.
 *
 * `retificadora` fica de fora porque ela SUBSTITUI outra: somá-la contaria o mesmo período
 * duas vezes. `multa_juros` e `parcelamento` são despesa, não tributo da competência.
 */
export const TIPOS_QUE_APURAM: readonly string[] = ['principal', 'complementar'] as const

/**
 * O que NÃO entra na apuração, por tributo — §5. São despesa.
 *
 * A lista é por NOME e não por exclusão de `TRIBUTOS_APURAVEIS`, de propósito: quem cadastrar
 * "ICMS-ST" esperando que ele apure precisa encontrar a resposta escrita, e não deduzi-la da
 * ausência.
 */
export const TRIBUTOS_QUE_SAO_DESPESA: readonly string[] = [
  'DAS', 'IRPJ', 'CSLL', 'ICMS_ST', 'DIFAL', 'FCP', 'INSS', 'FGTS', 'IPTU', 'IPVA', 'TAXAS',
] as const

export function guiaEntraNaApuracao(
  tributo: string | null | undefined,
  tipo: string | null | undefined,
): boolean {
  const t = String(tributo ?? '').trim().toUpperCase()
  const k = String(tipo ?? '').trim().toLowerCase()
  if (!(TRIBUTOS_APURAVEIS as readonly string[]).includes(t)) return false
  return TIPOS_QUE_APURAM.includes(k)
}

/**
 * A COMPETÊNCIA sugerida para uma guia: o mês ANTERIOR ao vencimento — §5.
 *
 * É sugestão da TELA, e por isso ela vive numa função e não num `DEFAULT` do banco: um
 * default afirmaria a competência de toda guia antiga. `null` entra e `null` sai — não se
 * sugere competência para uma guia sem vencimento.
 */
export function competenciaSugerida(vencimento: string | null | undefined): string | null {
  if (!vencimento) return null
  const m = /^(\d{4})-(\d{2})/.exec(String(vencimento))
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return null
  const d = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }
  return `${d.ano}-${String(d.mes).padStart(2, '0')}`
}

export interface EntradaDaApuracao {
  /** O que a guia daquela competência trouxe. `null` = NÃO HÁ GUIA — e isso não é zero. */
  guia: number | null
  /** O crédito do mês, vindo da aba Créditos. */
  credito: number
  /** Saldo credor transportado do mês anterior. */
  saldoCredorAnterior: number
  /** Saldo credor ao fim do mês, quando informado. Ausente, assume-se que não houve. */
  saldoCredorAtual?: number | null
}

export interface ApuracaoDoMes {
  /**
   * O débito DEDUZIDO da competência. `null` quando não há guia — o débito não é apurável
   * sem ela, e zero afirmaria que não houve operação.
   */
  debito: number | null
  credito: number
  saldoCredorAnterior: number
  saldoCredorAtual: number
  /** `débito − crédito − saldo credor anterior`, nunca negativo. `null` acompanha o débito. */
  aRecolher: number | null
  /** O que sobra de crédito e transporta para o mês seguinte. */
  saldoCredorATransportar: number
  /**
   * `true` quando há crédito no mês e NENHUMA guia daquele tributo.
   *
   * É o alerta do §5, e ele existe porque a leitura natural de um débito vazio é "não houve
   * imposto". É lançamento faltando.
   */
  alertaGuiaFaltando: boolean
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * A apuração de UM tributo em UM mês.
 *
 * `saldoCredorAtual` ausente NÃO é zero por dedução: ele é DERIVADO. Quando o crédito supera
 * o débito, o que sobra transporta; quando não, não há saldo. Informá-lo explicitamente
 * permite reconciliar com a escrita fiscal do contador, que é quem tem a verdade.
 */
export function apurarMes(e: EntradaDaApuracao): ApuracaoDoMes {
  const credito = n(e.credito)
  const saldoCredorAnterior = n(e.saldoCredorAnterior)
  const guia = e.guia == null ? null : n(e.guia)

  if (guia == null) {
    return {
      debito: null,
      credito,
      saldoCredorAnterior,
      saldoCredorAtual: n(e.saldoCredorAtual),
      aRecolher: null,
      saldoCredorATransportar: saldoCredorAnterior + credito,
      // Crédito sem guia é lançamento faltando, e o alerta é a única coisa que distingue
      // isso de "o mês não teve imposto".
      alertaGuiaFaltando: credito > 0,
    }
  }

  const saldoCredorAtualInformado = e.saldoCredorAtual == null ? null : n(e.saldoCredorAtual)

  // Débito = guia + crédito + (saldo anterior − saldo atual). O termo entre parênteses é o
  // quanto do saldo credor foi CONSUMIDO no mês: consumir saldo reduz a guia sem reduzir o
  // débito, e sem ele o débito sairia menor do que foi.
  const saldoBase = saldoCredorAtualInformado ?? 0
  const debito = guia + credito + (saldoCredorAnterior - saldoBase)

  const aRecolher = Math.max(0, debito - credito - saldoCredorAnterior)
  const sobra = Math.max(0, credito + saldoCredorAnterior - debito)

  return {
    debito,
    credito,
    saldoCredorAnterior,
    saldoCredorAtual: saldoCredorAtualInformado ?? sobra,
    aRecolher,
    saldoCredorATransportar: saldoCredorAtualInformado ?? sobra,
    alertaGuiaFaltando: false,
  }
}

/** Os grupos cujo lançamento É uma guia de imposto — é neles que os campos do §5 aparecem. */
export const GRUPOS_DE_GUIA: readonly string[] = [
  'IMPOSTO', 'IMPOSTO_FATURAMENTO_DENTRO', 'IMPOSTO_LUCRO', 'REGIME_TRIBUTARIO',
] as const

export function ehGuiaDeImposto(group: string | null | undefined): boolean {
  return GRUPOS_DE_GUIA.includes(String(group ?? '').trim().toUpperCase())
}

/** As opções de `tax_kind` do seletor: os seis que apuram, mais os que são despesa. */
export const OPCOES_DE_TRIBUTO: { value: string; label: string; apura: boolean }[] = [
  ...TRIBUTOS_APURAVEIS.map((t) => ({ value: t, label: t, apura: true })),
  ...TRIBUTOS_QUE_SAO_DESPESA.map((t) => ({
    value: t, label: t.replace(/_/g, '-'), apura: false,
  })),
]

export const OPCOES_DE_TIPO_DE_GUIA: { value: string; label: string; apura: boolean }[] = [
  { value: 'principal', label: 'Principal', apura: true },
  { value: 'complementar', label: 'Complementar', apura: true },
  { value: 'retificadora', label: 'Retificadora', apura: false },
  { value: 'multa_juros', label: 'Multa / Juros', apura: false },
  { value: 'parcelamento', label: 'Parcelamento', apura: false },
]
