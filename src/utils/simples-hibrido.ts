/**
 * simples-hibrido.ts — a CONSTRUÇÃO do preço no Simples Nacional Híbrido, e a ficha que a
 * decomposição LÊ dela.
 *
 * O QUE É O HÍBRIDO, E DE ONDE VEM O FORMATO
 * -------------------------------------------
 * LC 214/2025 art. 41 §3º e LC 123 art. 13 §10: o optante do Simples pode apurar **só IBS e
 * CBS** pelo regime regular, e o resto segue no DAS. O formato que sai daí, e que esta
 * página implementa:
 *
 *   DAS REDUZIDO (por dentro)  +  IBS · CBS · IS (por fora)
 *
 * - **DAS reduzido** — a alíquota efetiva do anexo menos as parcelas que passaram a ser
 *   apuradas por fora naquele ano. Mora em `simples-anexos.ts`, com o cronograma.
 * - **IS sempre por fora** — LC 123 art. 13 §1º XIV-A tira o IS do DAS para qualquer
 *   optante, e ele só existe em industrialização de produto listado (regra 5 do comando).
 * - **IPI NUNCA por fora** — no Simples ele está dentro do DAS do Anexo II. Não há IPI
 *   destacado nem ICMS complementar.
 * - **IRPJ, CSLL e CPP ficam no DAS** — por isso o RRO se reparte só entre comissão e lucro,
 *   e as linhas de IRPJ/CSLL somem da decomposição.
 *
 * A BASE DE IBS/CBS NÃO É O PREÇO POR DENTRO
 * -------------------------------------------
 * LC 214 art. 12 §2º V: não integra a base o montante de ICMS/ISS (e IPI, no Anexo II)
 * incidente na operação. Para o optante esse montante é a parcela CONTIDA NO DAS, e é por
 * isso que a base é `P × (1 − dedução)` e não `P`. Deduzir IRPJ/CSLL/CPP junto seria deduzir
 * o que a lei não manda — a conta fecharia igual e o número seria outro, que é a forma
 * exata de `regime-e-segmento-determinam-a-construcao.md`.
 *
 * POR QUE A CONSTRUÇÃO E A DECOMPOSIÇÃO SAEM DAQUI, JUNTAS
 * --------------------------------------------------------
 * A `ficha` que esta função devolve é o que a decomposição consome — frações do total geral,
 * exatamente como o Lucro Real já faz. A decomposição **não recalcula** base nem dedução: ela
 * multiplica o total pós-desconto pelas frações que a construção gravou. Um segundo cálculo
 * do outro lado seria a cópia divergente que `copia-divergente.md` cataloga, e ela fecharia
 * consigo mesma sem sintoma.
 *
 * O cálculo por fora é DELEGADO a `computeIvaDualFromBase` (`iva-dual-outside.ts`), que é a
 * fonte única das bases do art. 12 — reimplementá-lo aqui está proibido pelo comando e pela
 * regra do módulo.
 */
import { calculatePricing } from '@/utils/pricing-engine'
import { computeIvaDualFromBase } from '@/utils/iva-dual-outside'
import {
  dasHibridoPct, deducaoBaseIbsCbsPct, normalizeAnexoSimples, type AnexoSimples,
} from '@/utils/simples-anexos'
import type { SegmentoDaConstrucao } from '@/utils/despesas-do-segmento'

/**
 * O IS POR SEGMENTO — regra 5 do comando.
 *
 * Industrialização lê o `is_pct` do item (padrão 0,00%: só NCM listado tem). Revenda é
 * monofásica — o IS já veio no custo, e cobrá-lo de novo é bitributar. Serviço não tem IS.
 *
 * Fora da industrialização o valor cadastrado é **forçado a zero COM aviso**, e não zerado em
 * silêncio: zerar calado afirmaria que o cadastro está certo. O aviso é a diferença entre
 * `ausente-vs-falso.md` e um número que ninguém sabe de onde veio.
 */
export function isPctDoSegmento(
  segmento: SegmentoDaConstrucao,
  isPctCadastrado: number | null | undefined,
): { isPct: number; aviso?: string } {
  const cadastrado = Number(isPctCadastrado) || 0
  if (segmento === 'INDUSTRIALIZACAO') return { isPct: cadastrado }
  if (cadastrado <= 0) return { isPct: 0 }
  const onde = segmento === 'REVENDA'
    ? 'revenda (o IS é monofásico e já veio no custo)'
    : 'prestação de serviço (não há IS)'
  return {
    isPct: 0,
    aviso: `Imposto Seletivo cadastrado foi desconsiderado: não incide em ${onde}.`,
  }
}

/**
 * A ficha por fora do item, em FRAÇÕES DO TOTAL GERAL — o formato que a decomposição lê.
 *
 * É o mesmo contrato do Lucro Real (`resolveItemFicha`), e é deliberado: a decomposição não
 * precisa saber que regime produziu estes números, só que são frações do total. Trocar o
 * formato aqui obrigaria a decomposição a distinguir regimes, que é o oposto do que
 * `regime-e-segmento-determinam-a-construcao.md` pede.
 */
export interface FichaHibrida {
  /** `c` — a parcela do total geral que é operação externa. */
  externalOpsCoefficient: number
  /** VALOR de cada tributo por fora, como fração do total geral. */
  externalByTax: { ibs: number; cbs: number; is: number; ipi: number }
  /** BASE de cada um, como fração do total geral — a do art. 12, já deduzida. */
  externalBaseByTax: { ibs: number; cbs: number; is: number; ipi: number }
  /** Alíquota de cada um, em fração. É a NOMINAL: no híbrido não há redutor de IVA Dual. */
  externalRateByTax: { ibs: number; cbs: number; is: number; ipi: number }
}

export interface ConstrucaoHibridaInput {
  /** CMV do item — material + MO produtiva, conforme o segmento já resolveu. */
  custoTotal: number
  /** Despesa operacional do SEGMENTO, em fração (`resolveDespesasOperacionaisPct`). */
  despesasPct: number
  rtPct: number
  comissaoPct: number
  lucroPct: number
  /** DAS híbrido do item, em fração (`dasHibridoPct`). */
  dasHibridoPct: number
  /** Dedução da base de IBS/CBS, em fração (`deducaoBaseIbsCbsPct`). */
  deducaoBasePct: number
  /** Alíquotas por fora, em fração. O `isPct` ainda NÃO passou pelo filtro do segmento. */
  isPct: number
  ibsPct: number
  cbsPct: number
  segmento: SegmentoDaConstrucao
  /** Frete, seguro e despesas acessórias cobrados do adquirente. Entram nas bases por fora. */
  despAcessorias?: number
}

export interface ConstrucaoHibrida {
  /** P — o preço por dentro, `Custo ÷ (1 − Σ)`. */
  precoPorDentro: number
  /** X — a base econômica do art. 12: `P × (1 − dedução)`. */
  baseIVA: number
  baseIS: number
  baseIbsCbs: number
  isValue: number
  ibsValue: number
  cbsValue: number
  /** `P + IS + CBS + IBS (+ despesas acessórias)` — o que o cliente paga. */
  totalACobrar: number
  /** `total ÷ P` — o coeficiente por fora DO ITEM, na forma que a seção 4 do comando usa. */
  k: number
  /** As parcelas da operação interna, em R$, na ordem do DRE. */
  despesas: number
  das: number
  rt: number
  comissao: number
  lucro: number
  /** O DAS efetivamente aplicado, em fração — o que vai para `custom_tax_percent`. */
  dasHibridoPct: number
  /**
   * A dedução da base usada, em fração — o que precisa ser CONGELADO junto com o item.
   *
   * Ela é por ITEM, e não por documento, pela mesma razão do DAS: um tenant com mais de uma
   * atividade tem anexos diferentes, e o caso D do gabarito é exatamente isso — uma revenda
   * do Anexo I ao lado de um serviço do Anexo III, no mesmo orçamento. Um número único para
   * o documento daria ao serviço a dedução da revenda, e a conta fecharia consigo mesma.
   */
  deducaoBasePct: number
  /** O IS depois do filtro do segmento, em fração. */
  isPctAplicado: number
  ficha: FichaHibrida
  /** Avisos de cadastro — hoje, só o IS desconsiderado fora da industrialização. */
  avisos: string[]
}

/**
 * A construção do item no híbrido.
 *
 * Σ = despesas + DAS + RT + comissão + lucro, e `P = Custo ÷ (1 − Σ)` — a mesma conta de
 * sempre, pelo MESMO motor (`calculatePricing`), com o DAS ocupando o lugar do `taxPct`.
 * Não há `profitTaxPct`: IRPJ e CSLL estão dentro do DAS.
 */
export function construirPrecoHibrido(input: ConstrucaoHibridaInput): ConstrucaoHibrida {
  const avisos: string[] = []
  const { isPct, aviso } = isPctDoSegmento(input.segmento, input.isPct)
  if (aviso) avisos.push(aviso)

  const despAcessorias = Number(input.despAcessorias) || 0

  const preco = calculatePricing({
    calcType: input.segmento as never,
    totalItemsCost: Number(input.custoTotal) || 0,
    yieldQuantity: 1,
    laborCostMonthly: 0,
    numProductiveEmployees: 0,
    monthlyWorkloadMinutes: 0,
    productWorkloadMinutes: 0,
    structurePct: input.despesasPct,
    taxPct: input.dasHibridoPct,
    // SEM `profitTaxPct`, e não com zero: o próprio motor recusa o campo quando não há
    // `taxBreakdown` — "o taxPct agregado já carrega IRPJ e CSLL, e somar os dois conta duas
    // vezes". No híbrido isso é literalmente verdade: os dois estão dentro do DAS.
    commissionPct: input.comissaoPct,
    profitPct: input.lucroPct,
    rtReservePct: input.rtPct,
  })
  /**
   * P EM PRECISÃO PLENA, e não `priceUnit`.
   *
   * `calculatePricing` arredonda `priceUnit` a centavos, e isso está certo para o preço que
   * se exibe. Mas aqui P é insumo de uma cadeia — `X → IS → base IBS/CBS → total` — e
   * arredondar no meio dela propaga: medido contra o gabarito do PO, o total do caso B com
   * 10% de desconto sai R$ 171,51 com P arredondado e R$ 171,52 com P inteiro. O gabarito
   * traz 171,52.
   *
   * O motor continua sendo a FONTE do coeficiente — `1 − Σ` é dele, não recalculado aqui.
   * O que muda é só onde o arredondamento acontece: no fim, na exibição, em vez de no meio.
   */
  const P = preco.coefficient > 0 ? preco.cmvUnit / preco.coefficient : 0

  // X = P × (1 − dedução) — art. 12 §2º V. A dedução é sobre P, não sobre o total: o que a
  // lei exclui é o tributo INCIDENTE NA OPERAÇÃO, e a operação é a interna.
  const baseIVA = P * (1 - (Number(input.deducaoBasePct) || 0))

  // As alíquotas por fora chegam em FRAÇÃO aqui e o núcleo as quer em base 100.
  const fora = computeIvaDualFromBase({
    baseIVA,
    // Sem IPI por fora no Simples: a base fiscal dele não existe nesta operação.
    ipiBase: 0,
    despAcessorias,
    isPct: isPct * 100,
    ibsPct: (Number(input.ibsPct) || 0) * 100,
    cbsPct: (Number(input.cbsPct) || 0) * 100,
    ipiPct: 0,
    icmsComplApplies: false,
  })

  const totalACobrar = P + despAcessorias + fora.totalOutside
  const fracao = (v: number) => (totalACobrar > 0 ? v / totalACobrar : 0)

  return {
    precoPorDentro: P,
    baseIVA,
    baseIS: fora.baseIS,
    baseIbsCbs: fora.baseIbsCbs,
    isValue: fora.isValue,
    ibsValue: fora.ibsValue,
    cbsValue: fora.cbsValue,
    totalACobrar,
    k: P > 0 ? totalACobrar / P : 0,
    despesas: P * input.despesasPct,
    das: P * input.dasHibridoPct,
    rt: P * input.rtPct,
    comissao: P * input.comissaoPct,
    lucro: P * input.lucroPct,
    dasHibridoPct: input.dasHibridoPct,
    deducaoBasePct: Number(input.deducaoBasePct) || 0,
    isPctAplicado: isPct,
    ficha: {
      externalOpsCoefficient: fracao(fora.totalOutside),
      externalByTax: {
        ibs: fracao(fora.ibsValue), cbs: fracao(fora.cbsValue), is: fracao(fora.isValue), ipi: 0,
      },
      externalBaseByTax: {
        ibs: fracao(fora.baseIbsCbs), cbs: fracao(fora.baseIbsCbs), is: fracao(fora.baseIS), ipi: 0,
      },
      externalRateByTax: {
        ibs: Number(input.ibsPct) || 0, cbs: Number(input.cbsPct) || 0, is: isPct, ipi: 0,
      },
    },
    avisos,
  }
}

/**
 * O DAS híbrido e a dedução DO TENANT — a travessia única entre `tenant_settings` e as
 * funções puras de `simples-anexos.ts`.
 *
 * Existe para que `calc-tax-preview.ts` e `tax-sync.ts` NÃO escrevam a mesma resolução duas
 * vezes. Eram justamente esses dois arquivos que carregavam o espelho do Lucro Real, cada um
 * com a sua cópia — e a segunda cópia é como `copia-divergente.md` começa.
 *
 * Devolve `null` quando o anexo não está configurado. **Não cai no Anexo I**: cada anexo tem
 * uma repartição diferente, e escolher um por default afirmaria um enquadramento que ninguém
 * declarou. O chamador trata como "não configurado", que é o que os outros regimes já fazem.
 */
export function resolveDasHibridoDoTenant(
  ts: { simples_anexo?: unknown; simples_revenue_12m?: unknown } | null | undefined,
  ano: number = new Date().getFullYear(),
): { anexo: AnexoSimples; dasPct: number; deducaoPct: number; label: string } | null {
  const anexo = normalizeAnexoSimples(ts?.simples_anexo)
  if (!anexo) return null
  const rbt12 = Number(ts?.simples_revenue_12m) || 0
  return {
    anexo,
    dasPct: dasHibridoPct(anexo, rbt12, ano),
    deducaoPct: deducaoBaseIbsCbsPct(anexo, rbt12, ano),
    label: `Simples Híbrido (Anexo ${anexo})`,
  }
}

/**
 * A ficha SEM construir o preço — para a decomposição, que já tem o total do item gravado e
 * precisa só das frações.
 *
 * As frações não dependem do custo nem das despesas: são razões entre P, IS, IBS e CBS, e
 * todas escalam com P. Por isso dá para apurá-las sobre `P = 1` e aplicá-las ao total
 * pós-desconto — que é exatamente o `P' = T' ÷ k` da seção 4 do comando.
 */
export function resolveFichaHibrida(input: {
  deducaoBasePct: number
  isPct: number
  ibsPct: number
  cbsPct: number
  segmento: SegmentoDaConstrucao
}): FichaHibrida {
  return construirPrecoHibrido({
    custoTotal: 1,
    despesasPct: 0,
    rtPct: 0,
    comissaoPct: 0,
    lucroPct: 0,
    dasHibridoPct: 0,
    deducaoBasePct: input.deducaoBasePct,
    isPct: input.isPct,
    ibsPct: input.ibsPct,
    cbsPct: input.cbsPct,
    segmento: input.segmento,
  }).ficha
}
