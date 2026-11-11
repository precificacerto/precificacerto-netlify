/**
 * A CONTA DO MOTOR DO PRODUTO — o que o `doProductCalc` da tela de Produtos (`content.component.tsx`) calcula, num módulo PURO (sem React, sem
 * banco), para que o servidor (a cadeia do "sim" do orçamento I.A., dono do produto, 11/11/2026) chegue à MESMA entrada do `ProductPrice` que a
 * tela, sem uma terceira cópia do motor. `copia-divergente.md`: a conta mora AQUI e em lugar nenhum mais; o `doProductCalc` chama e grava no
 * estado.
 *
 * O corpo de `calcularNoMotorDoProduto` é o bloco que estava no `doProductCalc` (de `isCalcService` ao segundo `calculatePricing`), MOVIDO sem
 * alteração — os comentários vieram junto. O que ficou de fora, de propósito: `priceTotal` (calculado e nunca usado) e a leitura do rendimento
 * que só ele usava — código morto, e removê-lo não muda número nenhum (as duas travas de Produtos o confirmam). Os dois campos que dependem do
 * estado ANTERIOR (o "por produto" do serviço) saem como função desse estado, `porProdutoDoServico`, para que nenhuma conta fique na tela.
 *
 * As provas: as travas `a-trava-de-produtos-no-content.test.tsx` e `a-trava-de-produtos-no-product-price.test.tsx` protegem Produtos (intactas);
 * a cobertura DESTE módulo é `motor-do-produto.test.ts`.
 *
 * A entrada é OBRIGATÓRIA campo a campo (`construtor-empobrecido.md`). `isLRorLP` entra pronto, do chamador, para que a guarda de regime não
 * ganhe uma segunda definição.
 */
import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'
import { resolveIndirectLaborPct } from '@/utils/indirect-labor-grouping'
import { divisorDaEstruturaPct, custoMensalDeMaoDeObraDoProduto } from '@/utils/despesas-do-segmento'
import { resolveProductTaxPercent } from '@/utils/product-tax-percent'
import { calculatePricing } from '@/utils/pricing-engine'
import { entradaDoMotor, type ModoDaPrecificacao } from '@/lib/atendimentos-ia/precificacao-do-orcamento'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import type { CalcBaseType } from '@/types/calc-base.type'
import type { LoggedUser } from '@/types/logged-user.type'
import type { ProductPriceInfoType } from '@/page-parts/products/content.component'

export type EntradaDoMotorDoProduto = {
  currentUser: Pick<LoggedUser, 'calcType' | 'taxableRegime' | 'monthlyWorkloadInMinutes' | 'unitMeasure' | 'numProductiveSectorEmployee'>
  calcBase: CalcBaseType
  productType: 'PRODUZIDO' | 'REVENDA'
  productPriceInfo: Pick<ProductPriceInfoType, 'productProfitPercent' | 'salesCommissionPercent' | 'rtReservePercent' | 'productWorkloadInMinutes'
    | 'salesCommissionPercentByProduct' | 'productProfitPercentByProduct'>
  additionalIrpjPercent: number | undefined
  customTaxPercent: number | null | undefined
  /** Lucro Real ou Presumido — a guarda do chamador, entregue pronta. */
  isLRorLP: boolean
  modo: ModoDaPrecificacao
  itemsPriceSum: number
}

/**
 * O TIPO DE CÁLCULO EFETIVO do produto: o produto de REVENDA é sempre REVENDA (sem mão de obra produtiva no custo), independente do tenant; os
 * outros seguem o tenant. FONTE ÚNICA: o motor (`calcularNoMotorDoProduto`) e o bloqueio de salvar por carga horária da tela (`content.component`)
 * leem DAQUI — era o mesmo ternário escrito duas vezes no componente (`copia-divergente.md`).
 */
export function tipoDeCalculoEfetivo(productType: 'PRODUZIDO' | 'REVENDA', calcType: string | null | undefined): 'REVENDA' | 'INDUSTRIALIZACAO' | 'SERVICO' {
  return productType === 'REVENDA'
    ? 'REVENDA'
    : calcType === CALC_TYPE_ENUM.INDUSTRIALIZATION ? 'INDUSTRIALIZACAO'
      : calcType === CALC_TYPE_ENUM.RESALE ? 'REVENDA'
        : 'SERVICO'
}

/** A conta do `doProductCalc`. `null` quando o motor não forma preço (`isValid` falso): a tela fica como estava, como antes. */
export function calcularNoMotorDoProduto({
  currentUser, calcBase, productType, productPriceInfo, additionalIrpjPercent, customTaxPercent, isLRorLP, modo, itemsPriceSum,
}: EntradaDoMotorDoProduto) {
    const isCalcService = currentUser.calcType === CALC_TYPE_ENUM.SERVICE

    // Carga horária resolvida pela fonte única (`resolve-monthly-workload`). Sem
    // configuração, `monthlyWorkloadMinutes` é 0 — sem o antigo default silencioso de
    // 176h. O motor trata divisor 0 (MO produtiva vira 0); o bloqueio de save e o
    // alerta na UI ficam em `isWorkloadBlocking` e `workloadAlert` (`:795-840`), que só
    // disparam quando o divisor de fato importa (produto com tempo de MO e calcType
    // diferente de REVENDA).
    //
    // NOME CORRIGIDO em 11/10/2026: esta linha citava `workloadBlock`, símbolo que NUNCA
    // existiu. Um `grep` por ele devolvia só este comentário e sugeria portão ausente onde
    // há portão — registrado por decisão do dono do produto, e nenhuma linha de código
    // mudou junto.
    const workload = resolveMonthlyWorkload(
      currentUser.monthlyWorkloadInMinutes,
      currentUser.unitMeasure,
      currentUser.numProductiveSectorEmployee,
    )
    const totalEmployees = workload.totalEmployees
    // Total productive minutes available per month (company-wide)
    const monthlyWorkloadMinutes = workload.monthlyWorkloadMinutes

    // REGRA (segmentação SERVIÇO): produto de revenda NÃO recebe MO Administrativa
    // nem Despesa Fixa. Elas já estão embutidas no custo POR MINUTO da prestação de
    // serviço (services/content.component.tsx: combinedLaborCostMonthly =
    // MO Produtiva + MO Administrativa + Despesas Fixas). Somá-las de novo aqui,
    // como percentual no coeficiente, seria dupla contagem: o mesmo dinheiro
    // cobrado duas vezes, uma no minuto e outra no markup.
    // Por isso, quando o tenant é SERVIÇO, o coeficiente leva apenas despesa
    // variável + financeira. Nos demais segmentos (industrialização/revenda pura),
    // onde não existe custo por minuto diluindo estrutura, o coeficiente carrega
    // fixo + variável + financeiro + MO administrativa.
    // Segmentação que decide o AGRUPAMENTO. A matriz cobre o item do MESMO TIPO da
    // segmentação (core business), então o agrupamento vale para o item de revenda de um
    // tenant de revenda. Item produzido em tenant de revenda é combinação ainda não definida
    // pela regra: fica como está, sem agrupar.
    const tenantSegmentForGrouping =
      currentUser.calcType === CALC_TYPE_ENUM.RESALE && productType === 'REVENDA'
        ? 'REVENDA'
        : null

    // Em segmentação REVENDA a MO Produtiva é MC agrupada com a Indireta: sem tempo de
    // produção não há minuto sobre o qual ratear, então ela só pode entrar como percentual.
    // Fora de REVENDA devolve a Indireta intacta. Ver `indirect-labor-grouping.ts`.
    const indirectLaborPctForEngine = resolveIndirectLaborPct({
      tenantCalcType: tenantSegmentForGrouping,
      indirectLaborPct: calcBase.indirectLaborPct,
      productiveLaborPct: calcBase.laborPercent,
    })
    /*
      O DIVISOR SAI DA FONTE ÚNICA — `divisorDaEstruturaPct`.

      ADENDO 3 (02/10/2026): no SERVIÇO o COMPROMISSO entra no divisor; a fixa e a MO não, porque
      são numerador (custo por minuto, em R$). Fora do serviço a soma `fixa + compromisso` é a
      fixa de antes ao centavo, e é isso que mantém a trava do §0.

      O ternário que morava aqui era a primeira de quatro escritas do mesmo critério, e a mutação
      que somava o compromisso duas vezes neste ponto sobrevivia à suíte inteira — ver o
      cabeçalho de `despesas-do-segmento.ts`.

      A MO indireta chega JÁ AGRUPADA: o agrupamento REVENDA daqui é mais estreito que o de
      `resolveSegmentoDaDespesa`, e unificá-los mudaria preço.
    */
    const structurePctForEngine = divisorDaEstruturaPct({
      segmentoDaDespesa: isCalcService ? 'SERVICO' : 'INDUSTRIALIZACAO',
      fixaPct: calcBase.fixedExpensePct,
      variavelPct: calcBase.variableExpensePct,
      financeiraPct: calcBase.financialExpensePct,
      compromissoPct: calcBase.financialCommitmentsPct,
      indiretaAgrupadaPct: indirectLaborPctForEngine,
    }) / 100
    const isLucroRealProd = currentUser.taxableRegime === 'LUCRO_REAL'
    const isLucroPresumidoProd = currentUser.taxableRegime === 'LUCRO_PRESUMIDO' || currentUser.taxableRegime === 'LUCRO_PRESUMIDO_RET'
    let effectiveTaxPct: number
    if (isLucroRealProd || isLucroPresumidoProd) {
      const nonRegimeTaxPct = calcBase.taxesPercent || 0
      const irpjPct = productPriceInfo.productProfitPercent * 0.15
      const csllPct = productPriceInfo.productProfitPercent * 0.09
      const adicionalPct = isLRorLP ? (additionalIrpjPercent || 0) : 0
      effectiveTaxPct = nonRegimeTaxPct + irpjPct + csllPct + adicionalPct
    } else {
      // MEI: DAS é fixo mensal e NÃO incide por item — imposto zero, sempre. Um
      // `custom_tax_percent` gravado (dado legado) é ignorado aqui, e a linha da tela
      // usa a MESMA função, então exibição e cálculo continuam batendo.
      effectiveTaxPct = resolveProductTaxPercent({
        isMei: !!calcBase.isMei,
        customTaxPercent,
        autoTaxPercent: calcBase.taxPct,
      })
    }
    const taxPctDecimal = effectiveTaxPct / 100

    // Produto REVENDA usa sempre calcType REVENDA (sem MO produtiva no CMV), independente do tenant — `tipoDeCalculoEfetivo`, a fonte única
    const effectiveCalcType = tipoDeCalculoEfetivo(productType, currentUser.calcType)

    // A ENTRADA DO MOTOR é o único ponto do cálculo em que os dois modos divergem (`entradaDoMotor`): no produto, a soma dos itens e os
    // minutos digitados, como sempre; no orçamento, o líquido dos materiais e os minutos da fabricação dos itens (a forma da D2).
    const entrada = entradaDoMotor(modo, {
      itemsPriceSum, workloadMinutes: productPriceInfo.productWorkloadInMinutes || 0,
    })
    const engineResult = calculatePricing({
      calcType: effectiveCalcType,
      totalItemsCost: entrada.totalItemsCost,
      yieldQuantity: 1,
      // 11/10/2026: era `effectiveCalcType === 'REVENDA' ? 0 : calcBase.laborCostMonthly`,
      // inline. Extraído para `custoMensalDeMaoDeObraDoProduto` para que um caso possa
      // afirmar o NÚMERO — ver o cabeçalho da função.
      laborCostMonthly: custoMensalDeMaoDeObraDoProduto({
        effectiveCalcType,
        segmentoDaDespesa: isCalcService ? 'SERVICO' : 'INDUSTRIALIZACAO',
        produtivaMensal: calcBase.laborCostMonthly,
        adminMensal: calcBase.adminLaborCostMonthly,
        fixaMensal: calcBase.fixedExpenseMonthly,
      }),
      numProductiveEmployees: totalEmployees,
      monthlyWorkloadMinutes,
      productWorkloadMinutes: effectiveCalcType === 'REVENDA' ? 0 : entrada.productWorkloadMinutes,
      structurePct: structurePctForEngine,
      taxPct: taxPctDecimal,
      commissionPct: productPriceInfo.salesCommissionPercent / 100,
      profitPct: productPriceInfo.productProfitPercent / 100,
      rtReservePct: (productPriceInfo.rtReservePercent || 0) / 100,
    })

    // Para SERVICE + produto com itens (não REVENDA): calcula preço separado do produto
    let resultProductService = 0
    if (isCalcService && productType !== 'REVENDA' && itemsPriceSum > 0) {
      const prodEngine = calculatePricing({
        calcType: 'REVENDA',
        totalItemsCost: itemsPriceSum,
        yieldQuantity: 1,
        laborCostMonthly: 0,
        numProductiveEmployees: totalEmployees,
        monthlyWorkloadMinutes,
        productWorkloadMinutes: 0,
        structurePct: 0,
        taxPct: taxPctDecimal,
        commissionPct: (productPriceInfo.salesCommissionPercentByProduct || 0) / 100,
        profitPct: (productPriceInfo.productProfitPercentByProduct || 0) / 100,
      })
      resultProductService = prodEngine.isValid ? prodEngine.priceUnit : 0
    }


    if (!engineResult.isValid) return null
    const priceUnit = engineResult.priceUnit
    return {
      campos: {
        indirectLaborExpensePercent: calcBase.indirectLaborPct,
        productProfitPrice: engineResult.profitValue,
        salesCommissionPrice: engineResult.commissionValue,
        rtReservePrice: engineResult.rtReserveValue,
        indirectLaborExpensePrice: engineResult.laborValue,
        laborPctShown: Number((engineResult.laborPctShown * 100).toFixed(3)),
        fixedExpensePrice: priceUnit * (calcBase.fixedExpensePct / 100),
        financialCommitmentsPrice: priceUnit * (calcBase.financialCommitmentsPct / 100),
        variableExpensePrice: priceUnit * (calcBase.variableExpensePct / 100),
        financialExpensePrice: priceUnit * (calcBase.financialExpensePct / 100),
        taxesPrice: engineResult.taxValue,
        taxesPriceByProduct: resultProductService * taxPctDecimal || 0,
        productWorkloadInMinutesPrice: engineResult.productiveLaborCost,
        productCost: engineResult.cmvUnit,
        totalServicePrice: isCalcService ? engineResult.priceUnit : 0,
        totalServiceProductPrice: resultProductService,
        totalProductPrice: priceUnit,
      },
      /** Os dois valores "por produto" do serviço, que dependem do estado ANTERIOR da tela (os percentuais que ela tinha ao gravar). */
      porProdutoDoServico: (prev: Pick<ProductPriceInfoType, 'productProfitPercentByProduct' | 'salesCommissionPercentByProduct'>) => ({
        productProfitPriceByProduct: resultProductService * (prev.productProfitPercentByProduct / 100) || 0,
        salesCommissionPriceByProduct: resultProductService * (prev.salesCommissionPercentByProduct / 100) || 0,
      }),
    }
}

export type ContaDoMotorDoProduto = NonNullable<ReturnType<typeof calcularNoMotorDoProduto>>
