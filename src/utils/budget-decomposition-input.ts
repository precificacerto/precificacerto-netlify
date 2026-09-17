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

  const items: DecompositionItem[] = produtos.map((item) => {
    const r = item.rates ?? null
    // ICMS, ISS, IPI, IS, IBS e CBS vêm SEMPRE em percentual — escala conhecida, conversão
    // pura. PIS e COFINS são os únicos ambíguos, e têm função própria. Ver `rate-scale.ts`.
    const icms = item.isService ? 0 : pctToFraction(r?.icms_pct)
    const iss = item.isService ? pctToFraction(r?.iss_pct) : 0
    // O cadastro guarda PIS/COFINS já com a exclusão do ICMS/ISS; a decomposição precisa da
    // NOMINAL, porque ela reaplica a exclusão sobre a base própria (R5, exceção 2).
    const pisCofinsNominal = pisCofinsNominalFromEffective(
      pisCofinsFractionFromItem(r?.pis_pct, r?.cofins_pct),
      icms,
      iss,
    )

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
      irpjPct: lucroPct * IRPJ_RATE_ON_PROFIT,
      csllPct: lucroPct * CSLL_RATE_ON_PROFIT,
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
        externalOpsCoefficient: ficha.ficha?.externalOpsCoefficient ?? 0,
        // E aberto por tributo, para a R19 ter uma linha para cada um.
        externalByTax: ficha.ficha?.externalByTax,
        // A base do código 4, a efetiva, a nominal e o redutor — os quatro que a NT
        // 2025.002 pede e que a construção já calculava. Ver `DecompositionItemTaxes`.
        externalBaseByTax: ficha.ficha?.externalBaseByTax,
        externalRateByTax: ficha.ficha?.externalRateByTax,
        externalNominalByTax: ficha.ficha?.externalNominalByTax,
        externalReductionByTax: ficha.ficha?.externalReductionByTax,
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
    },
    itemLabels: items.map((i) => i.label),
    isEmpty: items.length === 0,
  }
}
