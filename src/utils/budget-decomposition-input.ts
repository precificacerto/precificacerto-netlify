/**
 * budget-decomposition-input.ts — do ORÇAMENTO para a DECOMPOSIÇÃO.
 *
 * O módulo `decomposition-dre.ts` é puro e não sabe o que é um `budgetItem`. Este aqui faz a
 * travessia, e existe separado do componente pelo mesmo motivo de sempre: é onde o teste
 * consegue afirmar EFEITO em vez de passagem (`.claude/rules/teste-que-nao-exercita.md`).
 *
 * >>> A FICHA SAI DA MESMA FUNÇÃO QUE O RATEIO USA <<<
 * `resolveItemFicha` e `pisCofinsNominalFromEffective` são as mesmas que `orcamentos/index.tsx`
 * chama para ratear o frete. Uma segunda montagem de ficha aqui seria `copia-divergente.md`
 * entre duas leituras da MESMA matriz — e o campo esquecido seria uma alíquota.
 *
 * >>> ITEM MANUAL NÃO É COLUNA <<<
 * R13: item manual é repasse SEM tributo, e não tem ficha, custo nem margem. Ele entra na
 * decomposição como `itensManuaisComAcrescimos`, que a linha "(−) Itens manuais + frete
 * neles" desconta da receita após desconto. Dar-lhe uma coluna o faria parecer um produto que
 * não gera lucro, em vez de um valor que atravessa o documento inteiro.
 */

import {
  type DecompositionCategories,
  type DecompositionInput,
  type DecompositionItem,
} from './decomposition-dre'
import { resolveItemFicha } from './budget-accessories'
import { resolveFichaHibrida } from './simples-hibrido'
import { pisCofinsNominalFromEffective } from './sale-context'
import {
  resolveDespesasOperacionaisPct,
  resolveSegmentoDaConstrucao,
  resolveSegmentoDaDespesa,
  type BaldesDeDespesa,
} from './despesas-do-segmento'
import {
  CSLL_RATE_ON_PROFIT,
  IRPJ_RATE_ON_PROFIT,
  pctToFraction,
  pisCofinsFractionFromItem,
} from './rate-scale'

/** As alíquotas do item, como o documento as guarda (base 100 ou fração conforme o campo). */
export interface BudgetItemRates {
  icms_pct?: number | null
  iss_pct?: number | null
  pis_pct?: number | null
  cofins_pct?: number | null
  ipi_pct?: number | null
  is_pct?: number | null
  ibs_pct?: number | null
  cbs_pct?: number | null
  /** DAS (Simples/MEI), em PERCENTUAL — `custom_tax_percent` / `taxable_regime_percent`. Ver `item-tax-rates.ts`. */
  das_pct?: number | null
  /**
   * Dedução da base de IBS/CBS no Simples Híbrido, em PERCENTUAL (LC 214 art. 12 §2º V).
   *
   * É POR ITEM pelo mesmo motivo que `das_pct` é: um tenant com mais de uma atividade tem
   * anexos diferentes, e a dedução sai do anexo. Ausente, cai no parâmetro do documento —
   * que é o caso do tenant de atividade única.
   */
  deducao_base_pct?: number | null
}

export interface BudgetDecompositionItem {
  key: string
  label: string
  isManual?: boolean
  isService?: boolean
  /**
   * `products.product_type` (`REVENDA` | `PRODUZIDO`). É o que distingue REVENDA de
   * INDUSTRIALIZACAO, e sem ele a decomposição INFERE o segmento — ver
   * `despesas-do-segmento.ts`. Ausente cai na segmentação do tenant.
   */
  productType?: string | null
  /**
   * A despesa CONGELADA na gravação do documento, em fração. Quando presente, VENCE
   * o cálculo por segmento — R18 e `fato-vs-referencia.md`: o preço foi formado com
   * ela, e recalculá-la contra a configuração de hoje reescreve o passado.
   *
   * Só a venda gravada a tem. Orçamento, pedido e venda de balcão resolvem do
   * segmento, porque ainda estão sendo formados.
   */
  despesasOperacionaisPctCongelado?: number | null
  quantity: number
  /** Preço unitário GRAVADO — é o total geral do item por unidade. */
  unitPrice: number
  /**
   * Custo unitário congelado (R18) — a parcela de MATERIAL.
   *
   * NÃO é o CMV inteiro: `resolveProductCostAndLabor` devolve
   * `costTotal = CMV consolidado − MO produtiva`, e a MO vem em `productiveLaborUnit`. Somar
   * só este campo deixa a MO de fora do custo e joga a diferença no RRO.
   */
  costUnit?: number | null
  /**
   * MO produtiva por unidade — a outra metade do CMV.
   *
   * Medido no ATeste1509: material R$ 7.985,99 + MO R$ 2.576,58 = R$ 10.562,57, que é o
   * "Custo produto" que a construção exibe. Sem ela, faltavam R$ 2.576,58 na decomposição.
   */
  productiveLaborUnit?: number | null
  /** Percentuais do item, base 100. */
  commissionPct?: number | null
  profitPct?: number | null
  rtPct?: number | null
  /** Alíquotas do item. `null` = sem ficha própria; cai em zero, que é o estado de hoje. */
  rates?: BudgetItemRates | null
  /** Acréscimos deste item, em R$ TOTAL (parcela rateada ou o do cadastro × quantidade). */
  acrescimos?: number | null
  /**
   * R13 — o que a CONSTRUÇÃO apurou de tributo por dentro sobre o acréscimo deste item.
   *
   * Vem de `allocateAccessories`, que é onde a R13 mora. A decomposição LÊ; derivar aqui,
   * mesmo com a fórmula certa, seria a segunda conta que
   * `regime-e-segmento-determinam-a-construcao.md` proíbe.
   */
  acrescimosFiscais?: { base: number; icms: number; iss: number; pisCofins: number } | null
}

export interface BudgetDecompositionParams {
  items: BudgetDecompositionItem[]
  /** Desconto do documento, FRAÇÃO [0, 1). */
  discountPct: number
  /**
   * Os QUATRO BALDES de despesa do tenant, em fração — não o total agregado.
   *
   * Era um escalar até 17/09/2026, e o escalar era a causa: o serviço recebia
   * `fixa + variável + financeira + MOI` quando a construção dele usa só
   * `variável + financeira`, porque fixa e MO indireta já estão no custo em R$.
   * Dupla contagem de R$ 1.205,98 no tenant medido, com o RRO indo a NEGATIVO.
   *
   * O total não permite desfazer a soma, então o contrato passa a pedir as partes.
   * `construtor-empobrecido.md`: campo de cálculo é obrigatório, e o custo de
   * torná-lo obrigatório é exatamente o benefício — o compilador enumerou os 17
   * chamadores de uma vez.
   */
  despesas: BaldesDeDespesa
  /**
   * `tenant_settings.calc_type`. Decide o segmento quando o item não é serviço nem
   * produto de revenda. Ausente cai em INDUSTRIALIZACAO, que é o default da
   * construção.
   */
  tenantCalcType?: string | null
  /**
   * `tenant_settings.tax_regime` (ou o `mrmConfig.regime` da tela). Decide a GUIA ÚNICA:
   * em SIMPLES_NACIONAL e MEI o DAS substitui ICMS + ISS + PIS/COFINS, não há tributo por
   * fora, e IRPJ/CSLL entram com peso zero (R2, R5 e R7 do Motor 2). Ausente = regime
   * discriminado (Lucro Real/Presumido), que é o comportamento de antes, bit-exact.
   *
   * `SIMPLES_HIBRIDO` é guia única **com operação externa**: DAS reduzido por dentro, IBS,
   * CBS e IS por fora (LC 214 art. 41 §3º). Ver `simples-hibrido.ts`.
   */
  regime?: string | null
  /**
   * Dedução da base de IBS/CBS no híbrido, em FRAÇÃO — `deducaoBaseIbsCbsPct()` de
   * `simples-anexos.ts`, com o anexo, o RBT12 e o ano do tenant. Só é lida quando
   * `regime === 'SIMPLES_HIBRIDO'`; nos demais regimes é ignorada.
   *
   * LIMITE CONHECIDO, e ele é de schema: este número é REFERÊNCIA VIVA, não fato congelado.
   * `das_pct` do item vem do cadastro e sobrevive à mudança de faixa; a dedução não tem
   * coluna onde ser gravada, então um documento antigo reaberto a recalcula pelo RBT12 de
   * hoje. É `fato-vs-referencia.md` à espera da sétima aparição, e a correção é uma coluna
   * ao lado de `custom_tax_percent`, congelada na gravação. Registrado como pendência em vez
   * de resolvido por invenção de campo.
   */
  deducaoBaseIbsCbsPct?: number | null
  /**
   * @deprecated As alíquotas legais saem de `rate-scale.ts`, não do tenant. Os campos
   * permanecem aceitos para não quebrar os chamadores, e são IGNORADOS — ver o comentário em
   * `categories.irpjPct`. Passá-los não muda resultado nenhum.
   */
  irpjAliquota?: number
  csllAliquota?: number
}

export interface BudgetDecompositionResult {
  input: DecompositionInput
  /** Rótulos das colunas, paralelo a `input.items`. */
  itemLabels: string[]
  /** `true` quando não há produto nenhum — só itens manuais, ou nada. */
  isEmpty: boolean
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}


/**
 * Monta a entrada da decomposição a partir dos itens do orçamento.
 *
 * As categorias vão POR ITEM: comissão, lucro e RT são cadastrados por produto, e o IRPJ e a
 * CSLL derivam do lucro DAQUELE item (R6). Um conjunto único de pesos distribuiria o RRO de
 * um produto pelos pesos de outro.
 */
export function buildBudgetDecompositionInput(
  params: BudgetDecompositionParams,
): BudgetDecompositionResult {
  const produtos = params.items.filter((i) => !i.isManual)
  const manuais = params.items.filter((i) => i.isManual)

  const itensManuaisComAcrescimos = manuais.reduce(
    (s, i) => s + num(i.unitPrice) * num(i.quantity) + num(i.acrescimos),
    0,
  )

  // GUIA ÚNICA — Simples Nacional, MEI e o HÍBRIDO. O regime é LIDO do parâmetro; a presença
  // de `das_pct` no item não decide nada (a mesma coluna serve a RET e ao Híbrido).
  //
  // O HÍBRIDO é guia única COM OPERAÇÃO EXTERNA (LC 214 art. 41 §3º): o DAS continua
  // ocupando o lugar de ICMS/ISS/PIS-COFINS e absorvendo IRPJ/CSLL, e IBS, CBS e IS são
  // apurados por fora. São dois eixos independentes, e por isso são duas variáveis: tratar
  // "guia única" e "sem por fora" como a mesma coisa é o que impediria o híbrido de existir.
  const regimeNorm = String(params.regime ?? '').trim().toUpperCase()
  const hibrido = regimeNorm === 'SIMPLES_HIBRIDO'
  const guiaUnica = regimeNorm === 'SIMPLES_NACIONAL' || regimeNorm === 'MEI' || hibrido
  // MEI NUNCA é híbrido (regra 10 do comando): o DAS dele é fixo mensal e não há apuração
  // por fora a optar.
  const isMei = regimeNorm === 'MEI'
  const deducaoBaseHibrido = hibrido ? num(params.deducaoBaseIbsCbsPct) : 0

  const items: DecompositionItem[] = produtos.map((item) => {
    const r = item.rates ?? null
    // ICMS, ISS, IPI, IS, IBS e CBS vêm SEMPRE em percentual — escala conhecida, conversão
    // pura. PIS e COFINS são os únicos ambíguos, e têm função própria. Ver `rate-scale.ts`.
    // Na guia única os três por dentro NÃO EXISTEM: o DAS ocupa o lugar deles (R2).
    const icms = guiaUnica || item.isService ? 0 : pctToFraction(r?.icms_pct)
    const iss = !guiaUnica && item.isService ? pctToFraction(r?.iss_pct) : 0
    // O cadastro guarda PIS/COFINS já com a exclusão do ICMS/ISS; a decomposição precisa da
    // NOMINAL, porque ela reaplica a exclusão sobre a base própria (R5, exceção 2).
    const pisCofinsNominal = guiaUnica ? 0 : pisCofinsNominalFromEffective(
      pisCofinsFractionFromItem(r?.pis_pct, r?.cofins_pct),
      icms,
      iss,
    )
    // DAS do PRÓPRIO item (percentual no cadastro → fração). MEI: zero, sempre — o DAS do
    // MEI é fixo mensal e não incide por venda (D17); a linha existe com R$ 0,00.
    // No híbrido o campo é o mesmo (`custom_tax_percent`/`taxable_regime_percent`); o que
    // mudou foi o número que a construção gravou lá: o DAS REDUZIDO.
    const dasPct = guiaUnica && !isMei ? pctToFraction(r?.das_pct) : 0

    // O SEGMENTO É LIDO, não inferido. A versão anterior desta linha tinha dois
    // valores onde a matriz tem três — `item.isService ? 'SERVICO' : 'INDUSTRIALIZACAO'`
    // — e com isso um produto de REVENDA entrava como industrialização, onde o IPI é
    // POR FORA e na revenda é INEXISTENTE. Ver `despesas-do-segmento.ts`.
    //
    // E são DOIS segmentos, porque a construção decide as duas coisas por critérios
    // diferentes: a MATRIZ pelo produto (revenda é revenda em qualquer tenant), a
    // DESPESA pelo tenant (`isCalcService`, onde o tipo do produto não participa).
    const segmento = resolveSegmentoDaConstrucao({
      isService: item.isService,
      productType: item.productType,
      tenantCalcType: params.tenantCalcType,
    })
    const segmentoDaDespesa = resolveSegmentoDaDespesa({
      isService: item.isService,
      tenantCalcType: params.tenantCalcType,
    })

    const ficha = resolveItemFicha({
      segment: segmento,
      rates: {
        icmsPct: item.isService ? null : icms,
        issPct: item.isService ? iss : null,
        pisCofinsPct: pisCofinsNominal,
        ipiPct: item.isService ? null : pctToFraction(r?.ipi_pct),
        isPct: item.isService ? null : pctToFraction(r?.is_pct),
        ibsPct: pctToFraction(r?.ibs_pct),
        cbsPct: pctToFraction(r?.cbs_pct),
      },
    })

    /**
     * A ficha POR FORA do híbrido — IBS, CBS e IS sobre a base do art. 12, já deduzida.
     *
     * Ela NÃO sai de `resolveItemFicha`, e a razão é de conta: aquela função apura a base
     * econômica como `P − ICMS − ISS − PIS/COFINS`, e no híbrido os três são ZERO — a base
     * sairia igual a `P`, sem a dedução da parcela desses tributos contida no DAS. O número
     * seria plausível e maior que o devido.
     *
     * É a MESMA função que a construção usa (`simples-hibrido.ts`), e é isso que impede a
     * decomposição de inferir o formato em vez de lê-lo.
     */
    const fichaHibrida = hibrido
      ? resolveFichaHibrida({
        // A do ITEM vence a do documento — ela é o fato congelado; a do documento é o
        // fallback do tenant de atividade única.
        deducaoBasePct: r?.deducao_base_pct != null
          ? pctToFraction(r.deducao_base_pct)
          : deducaoBaseHibrido,
        isPct: pctToFraction(r?.is_pct),
        ibsPct: pctToFraction(r?.ibs_pct),
        cbsPct: pctToFraction(r?.cbs_pct),
        segmento,
      })
      : null

    const lucroPct = pctToFraction(item.profitPct)
    const categories: DecompositionCategories = {
      // POR ITEM, porque o segmento é por item: um orçamento com produto E serviço
      // tem dois percentuais de despesa, e um número só para o documento daria o do
      // primeiro a todos. A regra de qual balde entra é a MESMA da construção.
      // O CONGELADO vence. Ele é fato histórico do documento; o cálculo por segmento
      // é a regra viva, e só vale para documento que ainda está sendo formado.
      despesasOperacionaisPct: item.despesasOperacionaisPctCongelado != null
        ? num(item.despesasOperacionaisPctCongelado)
        : resolveDespesasOperacionaisPct(segmentoDaDespesa, params.despesas),
      rtPct: pctToFraction(item.rtPct),
      comissaoPct: pctToFraction(item.commissionPct),
      lucroPct,
      // R6 — a base do IRPJ e da CSLL é o VALOR DO LUCRO: `% Original = alíquota × % Lucro`,
      // com o lucro DESTE item e a ALÍQUOTA LEGAL.
      //
      // NÃO usar `mrmConfig.irpj_pct`: ele já é `% Lucro do TENANT × 15%` (ver `tax-sync.ts`,
      // `lrIrpj = profitPct * 0.15`). Multiplicá-lo pelo lucro do item aplica o lucro DUAS
      // vezes — foi o que exibiu IRPJ de 1,80% onde a construção mostra 15,00%.
      // R5 do Motor 2: na guia única IRPJ e CSLL já estão no DAS — peso ZERO, linha presente.
      irpjPct: guiaUnica ? 0 : lucroPct * IRPJ_RATE_ON_PROFIT,
      csllPct: guiaUnica ? 0 : lucroPct * CSLL_RATE_ON_PROFIT,
    }

    return {
      id: item.key,
      label: item.label,
      totalProduto: num(item.unitPrice) * num(item.quantity),
      // O CMV INTEIRO: material + MO produtiva. Ver `costUnit` e `productiveLaborUnit`.
      custo: (num(item.costUnit) + num(item.productiveLaborUnit)) * num(item.quantity),
      acrescimos: num(item.acrescimos),
      ...(item.acrescimosFiscais ? { acrescimosFiscais: item.acrescimosFiscais } : {}),
      taxes: {
        icmsPct: icms,
        issPct: iss,
        pisCofinsPct: pisCofinsNominal,
        // O `c` da construção DAQUELE item, lido da ficha — nunca um `c` global.
        // Na guia única SEM híbrido não há tributo por fora (R7): IBS, CBS, IS e IPI estão
        // todos no DAS. No híbrido os três primeiros saem, e o IPI fica (regra 6).
        externalOpsCoefficient: fichaHibrida
          ? fichaHibrida.externalOpsCoefficient
          : guiaUnica ? 0 : (ficha.ficha?.externalOpsCoefficient ?? 0),
        // E aberto por tributo, para a R19 ter uma linha para cada um.
        externalByTax: fichaHibrida
          ? fichaHibrida.externalByTax
          : guiaUnica ? undefined : ficha.ficha?.externalByTax,
        // A base do código 4, a efetiva, a nominal e o redutor — os quatro que a NT
        // 2025.002 pede e que a construção já calculava. Ver `DecompositionItemTaxes`.
        externalBaseByTax: fichaHibrida
          ? fichaHibrida.externalBaseByTax
          : guiaUnica ? undefined : ficha.ficha?.externalBaseByTax,
        externalRateByTax: fichaHibrida
          ? fichaHibrida.externalRateByTax
          : guiaUnica ? undefined : ficha.ficha?.externalRateByTax,
        // No híbrido não há redutor de IVA Dual a declarar: a alíquota exibida É a nominal,
        // e omitir os dois é dizer "não apurado" em vez de afirmar um redutor de zero.
        externalNominalByTax: guiaUnica ? undefined : ficha.ficha?.externalNominalByTax,
        externalReductionByTax: guiaUnica ? undefined : ficha.ficha?.externalReductionByTax,
        ...(guiaUnica ? { dasPct } : {}),
      },
      categories,
    }
  })

  // As categorias do DOCUMENTO são a média dos itens só para as linhas que não têm coluna.
  // Nenhum cálculo por item as usa: cada um tem as suas acima.
  const primeira = items[0]?.categories
  const categories: DecompositionCategories = primeira ?? {
    // Sem item nenhum não há segmento a ler. O default é o da construção —
    // INDUSTRIALIZACAO — e nada é calculado com ele, porque não há coluna.
    despesasOperacionaisPct: resolveDespesasOperacionaisPct('INDUSTRIALIZACAO', params.despesas),
    rtPct: 0, comissaoPct: 0, lucroPct: 0, irpjPct: 0, csllPct: 0,
  }

  return {
    input: {
      items,
      categories,
      discountPct: num(params.discountPct),
      itensManuaisComAcrescimos,
      ...(guiaUnica ? { guiaUnica: true } : {}),
      ...(hibrido ? { operacaoExternaAtiva: true } : {}),
    },
    itemLabels: items.map((i) => i.label),
    isEmpty: items.length === 0,
  }
}
