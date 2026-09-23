/**
 * nota-de-compra.ts — o TOTAL DA NOTA e o rateio dele pelas parcelas.
 *
 * Comando do dono do produto de 23/09/2026, §5, registrado como está:
 *
 *   > É O TOTAL DA NOTA que vira o `amount` dos `cash_entries` e o valor das parcelas, não o
 *   > valor digitado. Hoje o digitado vai direto para o caixa e o IPI fica só no custo
 *   > teórico — a nota e o caixa discordam sobre a mesma compra.
 *
 * >>> O QUE ESTE MÓDULO NÃO É <<<
 *
 * Ele não calcula imposto. Os cinco creditáveis continuam saindo de `calcularCustoDoItem`, e
 * os quatro do bloco de custo chegam aqui como VALOR, porque é assim que eles vêm na nota:
 * `vICMSST`, `vFCPUFDest`, o DIFAL que é resultado de base dupla, e a parcela do IPI que não
 * gera crédito. Recalcular qualquer um deles aqui seria a segunda fórmula que
 * `copia-divergente.md` proíbe.
 *
 * >>> POR QUE O RATEIO TEM SOBRA NA ÚLTIMA PARCELA <<<
 *
 * `1.172,00 ÷ 3` não é um número de duas casas. Dividir e arredondar cada parcela produz
 * `390,67 × 3 = 1.172,01`, e a nota passa a cobrar um centavo que ela não tem. A sobra vai
 * para a última parcela porque ela é a única que ninguém confere contra um boleto já
 * emitido — e porque somar a diferença em algum lugar é obrigatório: uma soma que não fecha
 * é a nota e o caixa discordando de novo, num centavo em vez de num IPI.
 */

/** Os quatro valores que compõem o custo e NUNCA o crédito. `null` = não informado. */
export interface BlocoDeCusto {
  ipiCusto?: number | null
  icmsSt?: number | null
  difal?: number | null
  fcp?: number | null
}

export interface TotalDaNota {
  /** O que o usuário digita: o valor dos produtos, SEM IPI, ST, DIFAL e FCP. */
  produtos: number
  /** A parcela do IPI que gera crédito — vem da conta, não daqui. */
  ipiCredito: number
  /** A parcela do IPI que não gera crédito. */
  ipiCusto: number
  /** `ipiCredito + ipiCusto` — o IPI da nota, que é o que o rodapé do bloco exibe. */
  ipiDaNota: number
  icmsSt: number
  difal: number
  fcp: number
  /** O que vai para o caixa. */
  total: number
}

const val = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const centavos = (v: number): number => Math.round(v * 100) / 100

/**
 * O total da nota, linha a linha — e a decomposição vai junto porque é ela que a tela exibe.
 *
 * Devolver só o número obrigaria a tela a somar de novo para mostrar as parcelas, e essa
 * segunda soma é onde a divergência nasce: basta esquecer o FCP num dos dois lados.
 */
export function totalDaNota(args: {
  produtos: number | null | undefined
  ipiCredito?: number | null
  bloco?: BlocoDeCusto | null
}): TotalDaNota {
  const produtos = val(args.produtos)
  const ipiCredito = val(args.ipiCredito)
  const ipiCusto = val(args.bloco?.ipiCusto)
  const icmsSt = val(args.bloco?.icmsSt)
  const difal = val(args.bloco?.difal)
  const fcp = val(args.bloco?.fcp)
  const ipiDaNota = centavos(ipiCredito + ipiCusto)
  return {
    produtos,
    ipiCredito,
    ipiCusto,
    ipiDaNota,
    icmsSt,
    difal,
    fcp,
    total: centavos(produtos + ipiDaNota + icmsSt + difal + fcp),
  }
}

/**
 * Rateia um total por pesos, com a SOBRA de arredondamento na última parcela.
 *
 * Os pesos são o que cada caminho do insert já tem: no parcelamento mensal são iguais; no
 * editor de vencimentos são os valores que o usuário digitou, e ratear por eles preserva a
 * PROPORÇÃO que ele escolheu — quem pôs 30% na entrada continua com 30% da nota inteira.
 *
 * A soma das parcelas devolvidas é EXATAMENTE o total. É o invariante que o caso B afirma,
 * e ele vale para 3 e para 7 parcelas justamente porque 7 é o caso em que a divisão não
 * fecha.
 */
export function ratearParcelas(total: number, pesos: number[]): number[] {
  const n = pesos.length
  if (n === 0) return []
  const alvo = centavos(total)
  const somaDosPesos = pesos.reduce((a, p) => a + val(p), 0)
  // Sem pesos utilizáveis, a divisão é igual: é o que o parcelamento mensal faz.
  const fracoes = somaDosPesos > 0
    ? pesos.map((p) => val(p) / somaDosPesos)
    : pesos.map(() => 1 / n)

  const parcelas = fracoes.map((f) => centavos(alvo * f))
  const somaMenosUltima = centavos(parcelas.slice(0, n - 1).reduce((a, v) => a + v, 0))
  parcelas[n - 1] = centavos(alvo - somaMenosUltima)
  return parcelas
}

/**
 * A linha que fecha a nota, pronta para a tela — rótulo e valor, na ordem do §5.
 *
 * Ela existe aqui, e não no JSX, para que o caso de teste possa afirmar o CONTEÚDO da
 * leitura em vez de afirmar que um `<div>` existe (`teste-que-nao-exercita.md`).
 */
export function linhasDoTotalDaNota(t: TotalDaNota): { rotulo: string; valor: number; ehTotal?: boolean }[] {
  return [
    { rotulo: 'Valor informado (produtos)', valor: t.produtos },
    { rotulo: '+ IPI (crédito + custo)', valor: t.ipiDaNota },
    { rotulo: '+ ICMS-ST', valor: t.icmsSt },
    { rotulo: '+ DIFAL', valor: t.difal },
    { rotulo: '+ FCP', valor: t.fcp },
    { rotulo: '= Total da nota', valor: t.total, ehTotal: true },
  ]
}
