/**
 * nota-de-compra.ts — O DESCASCAMENTO: do TOTAL DIGITADO até a BASE, degrau por degrau.
 *
 * Comando do dono do produto de 24/09/2026, registrado como está:
 *
 *   > O total da nota é o que influencia na parcela de cada vencimento. Então tem que
 *   > considerar o valor total. Primeira coisa, a gente vai fazer o abatimento daquilo que
 *   > não gera crédito. E depois, com esse saldo, a gente define qual é a nossa base, a
 *   > âncora para cálculo dos demais.
 *
 * Até 23/09/2026 este módulo SOMAVA: o usuário digitava o valor dos produtos e o total era
 * calculado. Agora ele DESCASCA — e a inversão não é de gosto: o total é o número que vira
 * as parcelas e entra no caixa, e ele não pode ficar refém do arredondamento de cinco
 * campos.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * AS NATUREZAS — e a ordem NÃO é escolha
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * | natureza                | quem                                   | base      | crédito        |
 * |---|---|---|---|
 * | componente da operação  | frete, seguro                          | **FICA**  | credita junto  |
 * | não credita e SAI       | IPI por fora s/ crédito, ST, DIFAL, FCP| **SAI**   | nunca          |
 * | não credita e FICA      | IS                                     | **FICA**  | nunca          |
 * | credita por fora        | IPI creditável, CBS, IBS               | **SAI**   | sim            |
 * | credita por dentro      | ICMS, PIS/COFINS                       | é a base  | sim            |
 *
 * **Frete e seguro cobrados na nota INTEGRAM a base e geram crédito** — LC 87/1996 art. 13
 * §1º II; RIPI art. 190 §1º; LC 214/2025 art. 12 §1º. Abatê-los jogaria crédito legítimo
 * fora e faria a aba Créditos divergir da guia.
 *
 * **O IS integra a base do ICMS, do ISS, do IBS e da CBS por determinação expressa** — EC
 * 132/2023 art. 153 §6º V; LC 214/2025. Por isso ele aparece entre os destacados e **não
 * reduz**. CBS e IBS são o oposto: não integram a base dos demais, e por isso saem.
 *
 * **POR FORA antes de POR DENTRO.** Os por fora se SOMARAM ao preço, então para achar a
 * base é preciso RETIRÁ-LOS. Os por dentro já ESTÃO no preço: eles se calculam SOBRE a base
 * e não a alteram. Inverter faria o ICMS incidir sobre base que ainda carrega CBS e IBS, e
 * o erro sairia como **CRÉDITO A MAIS** — o pior lugar para ele sair, porque ninguém
 * reclama de crédito sobrando. Na apresentação a ordem pode ser outra; no cálculo, não.
 *
 * **PIS/COFINS por último**, porque a base dele depende do ICMS já apurado.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE MÓDULO NÃO FAZ
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ele **não calcula imposto**. O ICMS efetivo vem de `icmsEfetivoPctDe`, as bases vêm de
 * `baseDoTributo` e os créditos vêm de `calcularCustoDoItem` — todos de
 * `custo-liquido-do-item.ts`. Repetir qualquer um deles aqui seria a cópia divergente com a
 * assinatura que ela sempre tem: os dois lados fechariam consigo mesmos, e a diferença
 * apareceria como crédito errado (`copia-divergente.md`).
 *
 * O que ele faz é achar a BASE que o motor recebe.
 */
import {
  calcularCustoDoItem,
  baseDoTributo,
  type BandeirasDeCredito,
  type ValoresDaCompra,
} from '@/utils/custo-liquido-do-item'

/** Um tributo informado em percentual OU em valor — nunca nos dois. */
export interface EntradaDeTributo {
  pct?: number | null
  brl?: number | null
}

export interface EntradaDaNota {
  /** O TOTAL DA NOTA, digitado. É ele que vira as parcelas e entra no caixa. */
  total: number | null | undefined
  /** COMPOSIÇÃO: integra a base, credita junto, NÃO reduz. */
  composicao?: { frete?: number | null; seguro?: number | null } | null
  /** (1A) destacados que não creditam e SAEM da base, em R$. */
  reducoes?: {
    ipiCusto?: number | null
    icmsSt?: number | null
    difal?: number | null
    fcp?: number | null
  } | null
  /** (2) destacados POR FORA que creditam. % OU R$ — o R$ vence. */
  porFora?: {
    ipi?: EntradaDeTributo | null
    cbs?: EntradaDeTributo | null
    ibs?: EntradaDeTributo | null
  } | null
  /**
   * O IPI creditável está POR DENTRO do preço?
   *
   * `undefined`/`null` cai no padrão POR FORA, que é como a nota costuma vir. `false` é o
   * usuário dizendo que é por fora — e a distinção existe porque a coluna do banco é
   * nulável justamente para preservá-la (`ausente-vs-falso.md`).
   */
  ipiPorDentro?: boolean | null
  /** (2) IS destacado — NÃO reduz, NÃO credita. */
  valorIs?: number | null
  /** As FATIAS, em R$ de mercadoria. Nunca saem do total. */
  fatias?: { st?: number | null; monofasica?: number | null } | null
  /** (3) os POR DENTRO. */
  porDentro?: {
    icms?: EntradaDeTributo | null
    icmsDeferidoPct?: number | null
    icmsDeferidoAtivo?: boolean
    pisCofins?: EntradaDeTributo | null
    /** `null` = base nativa. Informada, é usada COMO ESTÁ. */
    baseManualIcms?: number | null
    baseManualPisCofins?: number | null
  } | null
  /** O CST do DOCUMENTO — quando ele veda, é o documento decidindo, não o usuário. */
  cst?: { icms?: string | null; ipi?: string | null; pisCofins?: string | null } | null
  /**
   * As bandeiras já resolvidas por `resolverFlagsDoItem`.
   *
   * Elas entram aqui, e não são recalculadas, porque a vedação por REGIME (Simples, MEI) e
   * a por CST já têm dono. Sem elas o módulo teria de decidir quem credita — e seria a
   * segunda opinião sobre uma regra que é da lei.
   */
  bandeiras?: BandeirasDeCredito | null
}

export interface NotaDescascada {
  total: number
  composicaoTotal: number
  /**
   * O que é MERCADORIA de fato: `base − frete − seguro − IS`.
   *
   * >>> ELE É DERIVADO DA BASE, E NÃO DO SALDO <<<
   * O gabarito do §2 fixa 850,00 num cenário de saldo 1.060,00 com frete 100,00 e IS 50,00 —
   * e `1.060 − 100 − 50` é 910,00. Os 850,00 só saem de `1.000 − 100 − 50`, ou seja, da
   * BASE. É coerente: o frete, o seguro e o IS acompanham a mercadoria DENTRO da base, e o
   * que sobra ao retirá-los é o valor dos produtos.
   *
   * Consequência para a tela: a leitura fica no bloco 1A, como o §7.2 pede, mas o número só
   * existe depois que a base é calculável. Sem base ele é `null` — não é zero, e não é o
   * saldo (`ausente-vs-falso.md`).
   */
  valorDasMercadorias: number | null
  reducoesTotal: number
  /** total − reduções. A ÂNCORA. */
  saldo: number
  porForaTotal: number
  valorIs: number
  /** `null` quando as alíquotas não fecham — ver `motivo`. NUNCA zero. */
  base: number | null
  motivo?: 'ALIQUOTAS_MAIORES_QUE_O_TOTAL'
  basesPorDentro: { icms: number; pisCofins: number }
  creditos: { ipi: number; cbs: number; ibs: number; icms: number; pisCofins: number }
  creditoTotal: number
  /** total − crédito total. `null` quando a base não é calculável. */
  custoLiquido: number | null
  /** Para a conferência do modo valor: crédito ÷ base, em percentual. */
  aliquotaImplicita: { icms: number | null; pisCofins: number | null }
}

const val = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const centavos = (v: number): number => Math.round(v * 100) / 100

/** O tributo foi informado, de alguma forma? Ausente NÃO é zero. */
const informado = (t: EntradaDeTributo | null | undefined): boolean =>
  !!t && (t.brl != null || t.pct != null)

/**
 * O VALOR de um por fora, quando ele veio em R$. `null` quando veio em % ou não veio.
 *
 * O R$ VENCE o % no mesmo tributo, e o módulo não reclama: é o mesmo desempate do
 * `difalValor` do #73 — quem tem o número destacado na mão não deve ser obrigado a
 * reproduzi-lo por uma fórmula.
 */
const emReais = (t: EntradaDeTributo | null | undefined): number | null =>
  t?.brl != null ? val(t.brl) : null

/** A ALÍQUOTA de um por fora, quando ele veio só em %. */
const emPercentual = (t: EntradaDeTributo | null | undefined): number | null =>
  t?.brl == null && t?.pct != null ? val(t.pct) : null

/**
 * O DESCASCAMENTO.
 *
 * >>> A CIRCULARIDADE, RESOLVIDA EM FÓRMULA FECHADA <<<
 *
 * Quando um por fora vem em ALÍQUOTA, a base de que preciso para aplicá-la é o número que
 * estou procurando. A saída é algébrica, não iterativa:
 *
 *     base = (saldo − porForaEmReais) ÷ (1 + ipiPct/100 + cbsPct/100 + ibsPct/100)
 *
 * MISTO é caso normal — a nota traz o IPI em valor e o IVA em alíquota: subtraem-se os R$ e
 * faz-se o gross-down dos %. Iterar aqui daria o mesmo número com mais passos e um critério
 * de parada a inventar.
 *
 * O ARREDONDAMENTO FICA NA BASE, NUNCA NO TOTAL. O total é o fato digitado; a base é o
 * resultado. Se a base der dízima, ela arredonda — e a soma de volta reproduz o total.
 */
export function descascarANota(e: EntradaDaNota): NotaDescascada {
  const total = centavos(val(e.total))

  const frete = val(e.composicao?.frete)
  const seguro = val(e.composicao?.seguro)
  const composicaoTotal = centavos(frete + seguro)

  const reducoesTotal = centavos(
    val(e.reducoes?.ipiCusto) + val(e.reducoes?.icmsSt) + val(e.reducoes?.difal) + val(e.reducoes?.fcp),
  )
  const saldo = centavos(total - reducoesTotal)

  const valorIs = val(e.valorIs)
  /*
    O IS FICA. Ele aparece entre os destacados, e não entra em `reducoesTotal` nem sai do
    saldo: a lei o manda integrar a base dos demais. Tratá-lo como ST — o erro fácil, porque
    os dois estão "destacados na nota" — reduziria a base e o crédito de todo mundo.
  */

  const ipiPorDentro = e.ipiPorDentro === true
  const porForaDoIpi = ipiPorDentro ? null : (e.porFora?.ipi ?? null)

  const brlIpi = emReais(porForaDoIpi)
  const brlCbs = emReais(e.porFora?.cbs)
  const brlIbs = emReais(e.porFora?.ibs)
  const porForaEmReais = centavos((brlIpi ?? 0) + (brlCbs ?? 0) + (brlIbs ?? 0))

  const pctIpi = emPercentual(porForaDoIpi)
  const pctCbs = emPercentual(e.porFora?.cbs)
  const pctIbs = emPercentual(e.porFora?.ibs)
  const denominador = 1 + (pctIpi ?? 0) / 100 + (pctCbs ?? 0) / 100 + (pctIbs ?? 0) / 100

  const semBase: Omit<NotaDescascada, 'base' | 'motivo'> = {
    total,
    composicaoTotal,
    valorDasMercadorias: null,
    reducoesTotal,
    saldo,
    porForaTotal: 0,
    valorIs,
    basesPorDentro: { icms: 0, pisCofins: 0 },
    creditos: { ipi: 0, cbs: 0, ibs: 0, icms: 0, pisCofins: 0 },
    creditoTotal: 0,
    custoLiquido: null,
    aliquotaImplicita: { icms: null, pisCofins: null },
  }

  const baseBruta = denominador > 0 ? (saldo - porForaEmReais) / denominador : -1
  if (!(denominador > 0) || !(baseBruta > 0)) {
    /*
      NÃO DEVOLVA NÚMERO. Zero seria "a base é zero" e um número plausível seria pior: ele
      entraria no numerador do preço sem nada falhar. `null` obriga a tela a parar
      (`ausente-vs-falso.md`).
    */
    return { ...semBase, base: null, motivo: 'ALIQUOTAS_MAIORES_QUE_O_TOTAL' }
  }

  /*
    >>> O ARREDONDAMENTO FICA NA BASE, NUNCA NO TOTAL — e é aqui que isso se decide <<<

    Os por fora em percentual são calculados sobre a base BRUTA (sem arredondar) e cada um
    arredonda para o centavo, porque é assim que eles aparecem na nota. A BASE é então o que
    sobra: `saldo − porForaTotal`. Assim ela absorve o resíduo da dízima, e a volta fecha ao
    centavo — que é o invariante do oráculo C.

    Arredondar a base primeiro e multiplicar depois daria 999,99 no cenário de 1.000,00 com
    CBS 8,80% e IBS 17,70%: um centavo evaporado, que ninguém procuraria.
  */
  const ipiPorForaValor = brlIpi ?? (pctIpi != null ? centavos(baseBruta * pctIpi / 100) : 0)
  const cbsValor = brlCbs ?? (pctCbs != null ? centavos(baseBruta * pctCbs / 100) : 0)
  const ibsValor = brlIbs ?? (pctIbs != null ? centavos(baseBruta * pctIbs / 100) : 0)
  const porForaTotal = centavos(ipiPorForaValor + cbsValor + ibsValor)
  const base = centavos(saldo - porForaTotal)

  /*
    ═══════════════════════════════════════════════════════════════════════════════════════
    DAQUI PARA BAIXO QUEM CALCULA É O MOTOR.

    Monto os `ValoresDaCompra` e chamo `calcularCustoDoItem` UMA vez. As alíquotas dos
    tributos informados em R$ são derivadas por `valor ÷ base × 100` — a mesma travessia da
    borda do #72 — e o VALOR informado prevalece no crédito logo abaixo, porque o destacado
    na nota é FATO e a alíquota derivada é instrumento (`fato-vs-referencia.md`).
    ═══════════════════════════════════════════════════════════════════════════════════════
  */
  const pctDe = (t: EntradaDeTributo | null | undefined, baseDaLinha: number): number | null => {
    if (!informado(t)) return null
    if (t?.brl != null) return baseDaLinha > 0 ? val(t.brl) / baseDaLinha * 100 : 0
    return val(t?.pct)
  }

  const icmsEntrada = e.porDentro?.icms ?? null
  const pisEntrada = e.porDentro?.pisCofins ?? null

  const valoresParaOMotor: ValoresDaCompra = {
    base,
    parcelaSt: e.fatias?.st ?? null,
    parcelaMonofasica: e.fatias?.monofasica ?? null,
    baseManualIcms: e.porDentro?.baseManualIcms ?? null,
    baseManualPisCofins: e.porDentro?.baseManualPisCofins ?? null,
    icmsDeferidoAtivo: e.porDentro?.icmsDeferidoAtivo,
    icmsDeferidoPct: e.porDentro?.icmsDeferidoPct ?? null,
    ipiPct: ipiPorDentro || informado(e.porFora?.ipi)
      ? (base > 0 ? (ipiPorDentro ? val(emReais(e.porFora?.ipi) ?? 0) : ipiPorForaValor) / base * 100 : 0)
      : null,
    cbsPct: informado(e.porFora?.cbs) ? (base > 0 ? cbsValor / base * 100 : 0) : null,
    ibsPct: informado(e.porFora?.ibs) ? (base > 0 ? ibsValor / base * 100 : 0) : null,
  }

  // A base do ICMS depende da fatia em ST; a do PIS/COFINS, do ICMS destacado e da fatia
  // monofásica. As DUAS saem de `baseDoTributo`, que é a mesma função que a conta usa.
  const baseIcms = baseDoTributo(valoresParaOMotor, 'ICMS')
  valoresParaOMotor.icmsPct = pctDe(icmsEntrada, baseIcms)
  const basePis = baseDoTributo(valoresParaOMotor, 'PIS_COFINS')
  valoresParaOMotor.pisCofinsPct = pctDe(pisEntrada, basePis)

  const bandeiras = e.bandeiras ?? null
  const r = bandeiras ? calcularCustoDoItem(valoresParaOMotor, bandeiras) : null

  /** O crédito de um tributo: zero sem bandeira que o permita; o VALOR informado quando há. */
  const creditoDe = (
    chave: 'ICMS' | 'PIS_COFINS' | 'IPI' | 'CBS' | 'IBS',
    valorInformado: number | null,
  ): number => {
    if (!r || !bandeiras?.[chave]?.ativo) return 0
    // O destacado na nota é o crédito. A alíquota derivada serviu para achar a base.
    if (valorInformado != null) return centavos(valorInformado)
    return centavos(r.creditos[chave])
  }

  const creditos = {
    ipi: creditoDe('IPI', brlIpi ?? (ipiPorDentro ? emReais(e.porFora?.ipi) : null)),
    cbs: creditoDe('CBS', brlCbs),
    ibs: creditoDe('IBS', brlIbs),
    icms: creditoDe('ICMS', icmsEntrada?.brl != null ? val(icmsEntrada.brl) : null),
    pisCofins: creditoDe('PIS_COFINS', pisEntrada?.brl != null ? val(pisEntrada.brl) : null),
  }
  const creditoTotal = centavos(
    creditos.ipi + creditos.cbs + creditos.ibs + creditos.icms + creditos.pisCofins,
  )

  /*
    O CUSTO LÍQUIDO É `total − crédito`, E O QUE NÃO CREDITA PERMANECE.
    ST, FCP, DIFAL e IS foram pagos e não voltam: subtraí-los do custo seria afirmar que o
    dinheiro nunca saiu.
  */
  return {
    ...semBase,
    porForaTotal,
    base,
    valorDasMercadorias: centavos(base - composicaoTotal - valorIs),
    basesPorDentro: { icms: centavos(baseIcms), pisCofins: centavos(basePis) },
    creditos,
    creditoTotal,
    custoLiquido: centavos(total - creditoTotal),
    aliquotaImplicita: {
      icms: baseIcms > 0 ? Math.round(creditos.icms / baseIcms * 10000) / 100 : null,
      pisCofins: basePis > 0 ? Math.round(creditos.pisCofins / basePis * 10000) / 100 : null,
    },
  }
}

/**
 * Rateia um total por pesos, com a SOBRA de arredondamento na última parcela.
 *
 * Inalterada desde o #73, e continua recebendo o TOTAL. Com o total agora DIGITADO, o
 * rateio deixa de depender de soma alguma: ele divide o fato.
 */
export function ratearParcelas(total: number, pesos: number[]): number[] {
  const n = pesos.length
  if (n === 0) return []
  const alvo = centavos(total)
  const somaDosPesos = pesos.reduce((a, p) => a + val(p), 0)
  const fracoes = somaDosPesos > 0
    ? pesos.map((p) => val(p) / somaDosPesos)
    : pesos.map(() => 1 / n)

  const parcelas = fracoes.map((f) => centavos(alvo * f))
  const somaMenosUltima = centavos(parcelas.slice(0, n - 1).reduce((a, v) => a + v, 0))
  parcelas[n - 1] = centavos(alvo - somaMenosUltima)
  return parcelas
}

export interface LinhaDoDescascamento {
  rotulo: string
  valor: number | null
  ehComposicao?: boolean
  ehMercadorias?: boolean
  ehSaldo?: boolean
  ehBase?: boolean
  ehCreditoTotal?: boolean
  ehCustoLiquido?: boolean
}

/**
 * A ESCADA do §2, pronta para a tela — e ela mora aqui, não no JSX.
 *
 * Montá-la no componente obrigaria o caso de teste a afirmar que um `<div>` existe, em vez
 * do CONTEÚDO da leitura. É a diferença entre afirmar passagem e afirmar efeito
 * (`teste-que-nao-exercita.md`).
 */
export function linhasDoDescascamento(d: NotaDescascada): LinhaDoDescascamento[] {
  return [
    { rotulo: 'Valor total da nota', valor: d.total },
    { rotulo: '(−) Reduções que não geram crédito', valor: d.reducoesTotal },
    { rotulo: 'Frete e seguro (não reduzem — integram a base)', valor: d.composicaoTotal, ehComposicao: true },
    { rotulo: 'Valor das mercadorias', valor: d.valorDasMercadorias, ehMercadorias: true },
    { rotulo: '= Saldo', valor: d.saldo, ehSaldo: true },
    { rotulo: '(−) Destacados por fora (IPI, CBS, IBS)', valor: d.porForaTotal },
    { rotulo: 'IS (não reduz, não credita)', valor: d.valorIs },
    { rotulo: '= Base', valor: d.base, ehBase: true },
    { rotulo: 'Crédito de IPI', valor: d.creditos.ipi },
    { rotulo: 'Crédito de CBS', valor: d.creditos.cbs },
    { rotulo: 'Crédito de IBS', valor: d.creditos.ibs },
    { rotulo: 'Crédito de ICMS', valor: d.creditos.icms },
    { rotulo: 'Crédito de PIS/COFINS', valor: d.creditos.pisCofins },
    { rotulo: '= Crédito total', valor: d.creditoTotal, ehCreditoTotal: true },
    { rotulo: '= CUSTO LÍQUIDO', valor: d.custoLiquido, ehCustoLiquido: true },
  ]
}
