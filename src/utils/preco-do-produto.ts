/**
 * A FORMAÇÃO DO PREÇO DO PRODUTO — o que a tela de Produtos (`ProductPrice`) calcula, num módulo PURO (sem React, sem banco), para que o
 * servidor (a cadeia do "sim" do orçamento I.A., dono do produto, 11/11/2026) forme o MESMO preço que a tela, sem uma terceira cópia do motor
 * (a primeira divergente já existe: o `calc-tax-engine`). `copia-divergente.md`: a fórmula mora AQUI e em lugar nenhum mais; o `ProductPrice`
 * chama e desestrutura, não recalcula.
 *
 * O corpo de `formarPrecoDoProduto` é o bloco que estava no `ProductPrice` (de `isCalcTypeResale` a `finalPriceWithTaxes`), MOVIDO sem
 * alteração — os comentários vieram junto, porque a razão de cada restrição mora no ponto de declaração (`razao-longe-da-restricao.md`). A
 * única linha nova é `formado` (que estava como fórmula dentro do efeito de emissão do componente). Ficaram no componente só as leituras de
 * TELA: o rendimento e a unidade do formulário (`productForm`, `fractionByYield`).
 *
 * A prova de que Produtos não mudou é a trava `a-trava-de-produtos-no-product-price.test.tsx` (intacta, byte a byte); a cobertura DESTE módulo
 * é `preco-do-produto.test.ts`.
 *
 * A entrada é OBRIGATÓRIA campo a campo (`construtor-empobrecido.md`): os padrões (0, nulo, falso) são do chamador — o componente aplica os
 * das props dele, e o servidor os da empresa —, nunca escolhidos aqui em silêncio.
 */
import { resolveProductTaxPercent } from '@/utils/product-tax-percent'
import { resolveIndirectLaborPct } from '@/utils/indirect-labor-grouping'
import { computeIvaDualOutside } from '@/utils/iva-dual-outside'
import { resolveIvaDualEffectiveRate } from '@/utils/item-tax-rates'
import { buildProductConstruction } from '@/utils/product-price-construction'
import { buildProductPriceRows, type PriceRowInput } from '@/utils/product-price-rows'
import { toBaseCode } from '@/utils/sale-context'
import { tributoExisteNoSegmento } from '@/utils/campos-do-segmento'
import { divisorDaEstruturaPct, resolveSegmentoDaConstrucao } from '@/utils/despesas-do-segmento'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import type { CalcBaseType } from '@/types/calc-base.type'
import type { LoggedUser } from '@/types/logged-user.type'
import type { ProductPriceInfoType } from '@/page-parts/products/content.component'

export type EntradaDoPrecoDoProduto = {
  currentUser: Pick<LoggedUser, 'taxableRegime' | 'calcType'> | null | undefined
  calcBase: CalcBaseType
  productPriceInfo: Pick<ProductPriceInfoType, 'totalProductPrice' | 'taxesPrice' | 'salesCommissionPercent' | 'salesCommissionPrice'
    | 'productProfitPercent' | 'productProfitPrice' | 'rtReservePercent' | 'productCost'>
  customTaxPercent: number | null | undefined
  additionalIrpjPercent: number | undefined
  icmsPct: number
  pisCofinsLRPct: number
  freightValue: number
  insuranceValue: number
  accessoryExpensesValue: number
  /** `null` = a alíquota não existe para quem precifica: não entra, nem como zero. */
  ibsPct: number | null
  cbsPct: number | null
  isPct: number
  ipiPct: number
  ibsBaseCode: number | null | undefined
  cbsBaseCode: number | null | undefined
  isBaseCode: number | null | undefined
  ipiBaseCode: number | null | undefined
  ivaReductionIbsPct: number | null
  ivaReductionCbsPct: number | null
  isResaleProduct: boolean
}

export function formarPrecoDoProduto({
  currentUser, calcBase, productPriceInfo, customTaxPercent, additionalIrpjPercent, icmsPct, pisCofinsLRPct, freightValue, insuranceValue,
  accessoryExpensesValue, ibsPct, cbsPct, isPct, ipiPct, ibsBaseCode, cbsBaseCode, isBaseCode, ipiBaseCode, ivaReductionIbsPct,
  ivaReductionCbsPct, isResaleProduct,
}: EntradaDoPrecoDoProduto) {
  const isCalcTypeResale = currentUser?.calcType === CALC_TYPE_ENUM.RESALE
  const isCalcTypeService = currentUser?.calcType === CALC_TYPE_ENUM.SERVICE
  const isMei = !!calcBase.isMei
  const isLucroReal = currentUser?.taxableRegime === 'LUCRO_REAL'
  const isLucroPresumed = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
  const isLpRet = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO_RET'
  const isSimplesHibrido = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'
  const showIrpjCsll = isLucroReal || isLucroPresumed

  const totalPrice = productPriceInfo.totalProductPrice
  // MESMA expressão do cálculo (`doProductCalc`): em segmentação REVENDA a MO Produtiva é
  // somada aqui e as duas aparecem numa linha só. Exibição e cálculo saindo de um ponto só é
  // o que faz a soma das linhas fechar com o preço por construção — invariante do #17/#23.
  const laborPct = resolveIndirectLaborPct({
    tenantCalcType: isCalcTypeResale && isResaleProduct ? 'REVENDA' : null,
    indirectLaborPct: calcBase.indirectLaborPct,
    productiveLaborPct: calcBase.laborPercent,
  })
  const fixedPct = calcBase.fixedExpensePct
  /*
    COMPROMISSOS FINANCEIROS — §0 e §6.1 do comando de 02/10/2026.

    Ele SAIU de `fixedExpensePct` e precisa voltar em DOIS lugares desta tela, ou ela deixa de
    fechar:

      1. no `structurePct` que forma o preço (abaixo) — sem ele o preço EXIBIDO cai;
      2. como LINHA própria da tabela — sem ela a soma das linhas não fecha com o preço, que é
         o invariante do #17/#23 que esta tela mantém por construção.

    Mostrar uma e esquecer a outra é o pior dos casos: a tela fecharia errado e ninguém saberia
    qual metade está certa.
  */
  const financialCommitmentsPct = calcBase.financialCommitmentsPct
  const variablePct = calcBase.variableExpensePct
  const financialPct = calcBase.financialExpensePct

  // MESMA função que `doProductCalc` usa em `effectiveTaxPct`: exibição e cálculo saem
  // de um ponto só, então a soma das linhas exibidas fecha com o preço por construção.
  // Em MEI devolve 0 — o DAS é fixo mensal e não incide por item.
  const taxPctDisplay = resolveProductTaxPercent({
    isMei,
    customTaxPercent,
    autoTaxPercent: calcBase.taxPct,
  })
  const taxValDisplay = productPriceInfo.taxesPrice
  // O MEI NÃO É CATEGORIA DE IMPOSTO — decisão do PO, 05/10/2026.
  //
  // O rótulo nomeava o MEI entre parênteses na linha de Impostos, e isso afirmava um
  // enquadramento que o próprio sistema contradiz: o DAS do MEI é DESPESA FIXA, e é lá que
  // ele está lançado (`expense-setup-blocks.ts:116,274`, com
  // `expense_group: 'DESPESA_FIXA'`). Nomear o MEI
  // na linha de Impostos põe na tela uma classificação que o cadastro não usa.
  //
  // O ALERTA que explica por que a linha vem zerada CONTINUA — ele diz por que o número é
  // zero, não em que categoria o DAS entra.
  const taxLabel = calcBase.taxLabel
    ? `Impostos (${calcBase.taxLabel})`
    : 'Impostos'

  const commissionPct = productPriceInfo.salesCommissionPercent
  const commissionVal = productPriceInfo.salesCommissionPrice
  const profitPct = productPriceInfo.productProfitPercent
  const profitVal = productPriceInfo.productProfitPrice
  // EPIC-RT v8: RT (Comissão Reserva Técnica) — dedução gerencial paralela a comissão/lucro.
  const rtReservePct = Number(productPriceInfo.rtReservePercent) || 0

  const pricePerUnit = totalPrice

  // LUCRO_REAL / LUCRO_PRESUMIDO: IRPJ = 15% do lucro, CSLL = 9% do lucro
  const irpjVal = showIrpjCsll ? profitVal * 0.15 : 0
  const csllVal = showIrpjCsll ? profitVal * 0.09 : 0
  const irpjPct = showIrpjCsll && pricePerUnit > 0 ? (irpjVal / pricePerUnit) * 100 : 0
  const csllPct = showIrpjCsll && pricePerUnit > 0 ? (csllVal / pricePerUnit) * 100 : 0
  const adicionalIrpjPct = (isLucroReal || isLucroPresumed) ? (additionalIrpjPercent || 0) : 0

  const costTotal = productPriceInfo.productCost

  // Atividades Terceirizadas (apenas LUCRO_REAL / LUCRO_PRESUMIDO / SIMPLES_HIBRIDO)
  const terceirizadasTotal = (isLucroReal || isLucroPresumed || isSimplesHibrido)
    ? (freightValue || 0) + (insuranceValue || 0) + (accessoryExpensesValue || 0)
    : 0

  // ─── R3 · R5 · R8 · R9 — a matriz forma o preço; o `c` NÃO é somado por cima ───
  //
  // Quando a matriz governa (Lucro Real, sem acréscimos gravados no produto), P e o total
  // geral vêm do motor: IBS/CBS/IS/IPI entram no `c` da R3, o `c` converte cada % Original
  // em % Efetivada (R5) e a margem de contribuição encolhe. A R9 diz por quê: "Somar o IPI
  // por cima do preço sem IPI é erro, não atalho."
  //
  // Sem tributo por fora, `c = 0`, as efetivadas são iguais às originais e o número sai BIT
  // A BIT igual ao de antes — é o teste 1 da Parte 5, o que protege a base instalada.
  //
  // Produto é mercadoria: o segmento nunca é SERVICO aqui (a tela força `REVENDA` em tenant
  // de serviço), e o ISS é INEXISTENTE — `null`, nunca zero.
  // O SEGMENTO SAI DA FONTE ÚNICA. A expressão que estava inline aqui era a TERCEIRA
  // cópia do mesmo critério — `copia-divergente.md` entre a tela, a decomposição e o
  // gravador. `isProduct` é o que impede uma mercadoria de virar SERVICO pelo tenant.
  const _segmento = resolveSegmentoDaConstrucao({
    isService: false,
    isProduct: true,
    productType: isResaleProduct ? 'REVENDA' : null,
    tenantCalcType: isCalcTypeResale ? 'REVENDA' : isCalcTypeService ? 'SERVICO' : 'INDUSTRIALIZACAO',
  })

  const _matriz = buildProductConstruction({
    taxableRegime: currentUser?.taxableRegime,
    segment: _segmento,
    // O cadastro forma a FICHA TRIBUTÁRIA; o contexto da venda de fato é aplicado no
    // orçamento (R9). Aqui vale a linha geral da tabela, que é o comportamento de hoje.
    buyerType: 'CONSUMIDOR_FINAL',
    saleScope: 'INTRAESTADUAL',
    costTotal,
    // O compromisso acompanha a `fixa`: fora do serviço entra, no serviço fica fora — ele
    // estava DENTRO dela, e no serviço a fixa já está no custo por minuto.
    // O MESMO divisor que o motor usa, pela MESMA função — era a segunda das quatro escritas
    // do critério. ADENDO 3: no SERVIÇO o compromisso entra; a fixa e a MO não, porque são
    // numerador. Ver o cabeçalho de `divisorDaEstruturaPct`.
    structurePct: divisorDaEstruturaPct({
      segmentoDaDespesa: isCalcTypeService ? 'SERVICO' : 'INDUSTRIALIZACAO',
      fixaPct: fixedPct,
      variavelPct: variablePct,
      financeiraPct: financialPct,
      compromissoPct: financialCommitmentsPct,
      indiretaAgrupadaPct: laborPct,
    }) / 100,
    rtReservePct: rtReservePct / 100,
    commissionPct: commissionPct / 100,
    profitPct: profitPct / 100,
    profitTaxPct: (irpjPct + csllPct + adicionalIrpjPct) / 100,
    rates: {
      icmsPct: icmsPct / 100,
      issPct: null,
      pisCofinsEffectivePct: pisCofinsLRPct / 100,
      ipiPct: (ipiPct || 0) / 100,
      isPct: (isPct || 0) / 100,
      ibsPct: (ibsPct || 0) / 100,
      cbsPct: (cbsPct || 0) / 100,
      // Os DOIS, separados. A fração vem da mesma travessia que o motor usa, para
      // que a tela e o cálculo não possam divergir na origem do número.
      ivaReductionIbs: ivaReductionIbsPct != null ? ivaReductionIbsPct / 100 : null,
      ivaReductionCbs: ivaReductionCbsPct != null ? ivaReductionCbsPct / 100 : null,
    },
    // Override manual do código de base (7.5, item 6). `null` = não classificado, cai no
    // padrão da R3 — jamais no código 1 por omissão.
    baseCodes: {
      ibs: toBaseCode(ibsBaseCode),
      cbs: toBaseCode(cbsBaseCode),
      is: toBaseCode(isBaseCode),
      ipi: toBaseCode(ipiBaseCode),
    },
    despAcessorias: terceirizadasTotal,
    // SIMPLES HÍBRIDO — o DAS reduzido e a dedução da base, do anexo/faixa do tenant.
    // Lidos só pelo ramo do híbrido; nos demais regimes a função os ignora.
    // `taxPctDisplay` é o MESMO número que a linha "Impostos" exibe: exibição e formação
    // saem de um ponto só, que é o que `product-price-rows.ts` existe para garantir.
    dasHibridoPct: taxPctDisplay / 100,
    deducaoBaseIbsCbsPct: calcBase.deducaoBaseIbsCbsPct,
  })

  // ─── R5 · R8 · Parte 5 teste 2 — as LINHAS, com a % EFETIVA ao lado da ORIGINAL ───
  //
  // A tela exibia as % ORIGINAIS e derivava os R$ delas, enquanto o PREÇO já vinha do motor
  // com as EFETIVADAS. A diferença não aparecia em lugar nenhum: medido num produto de custo
  // R$ 798,60 com IBS 1,00% + CBS 8,80%, custo + linhas exibidas dava R$ 1.564,74 contra um
  // preço de R$ 1.609,63 — R$ 44,89 de lacuna, que é o teste 2 do checklist falhando na
  // APRESENTAÇÃO (ele existia no motor e não aqui).
  //
  // As efetivas são LIDAS de `_matriz.resolved`, nunca recalculadas: `÷ (1 − c)` não vale
  // para PIS/COFINS (exceção 2 da R5, que incide sobre `P − ICMS − ISS`), e reescrever essa
  // fórmula aqui seria a `copia-divergente.md` entre construção e apresentação.
  const linhasInput: PriceRowInput[] = [
    ...(!isCalcTypeService ? [
      { key: 'labor', originalPct: laborPct },
      { key: 'fixed', originalPct: fixedPct },
    ] : []),
    { key: 'variable', originalPct: variablePct },
    { key: 'financial', originalPct: financialPct },
    // ADENDO 2 §1 — a POSIÇÃO é a regra: IMEDIATAMENTE DEPOIS de 'Despesas financeiras' e
    // antes de 'RT'. A ordem desta lista NÃO muda nenhum número (`buildProductPriceRows`
    // soma e mapeia, não ordena) — ela existe para que a declaração e o JSX abaixo sejam
    // lidos na mesma ordem. Quem mudar uma e esquecer a outra cai no caso de ordem.
    // ADENDO 3: a linha existe também no SERVIÇO, porque lá o compromisso passou a ser
    // dedução de verdade do divisor. Era a única das cinco que o serviço não tinha.
    { key: 'compromissosFinanceiros', originalPct: financialCommitmentsPct },
    ...(!showIrpjCsll && !isLpRet && !isSimplesHibrido ? [{ key: 'tax', originalPct: taxPctDisplay }] : []),
    { key: 'rt', originalPct: rtReservePct },
    { key: 'commission', originalPct: commissionPct },
    { key: 'profit', originalPct: profitPct },
    ...(isLpRet || isSimplesHibrido ? [{ key: 'taxUnificado', originalPct: taxPctDisplay }] : []),
    ...(showIrpjCsll ? [
      { key: 'irpj', originalPct: irpjPct },
      { key: 'csll', originalPct: csllPct },
    ] : []),
    ...((isLucroReal || isLucroPresumed) ? [{ key: 'adicionalIrpj', originalPct: adicionalIrpjPct }] : []),
    // O ICMS também é decidido pela MATRIZ, não por `!isCalcTypeService`. A condição
    // antiga acertava por coincidência — mercadoria em tenant de serviço cai em REVENDA,
    // onde o ICMS existe. Ler a matriz faz a tela seguir a Parte 0 se uma célula mudar.
    ...((isLucroReal || isLucroPresumed) && tributoExisteNoSegmento(_segmento, 'ICMS')
      ? [{ key: 'icms', originalPct: icmsPct, kind: 'ICMS' as const }] : []),
    ...((isLucroReal || isLucroPresumed)
      ? [{ key: 'pisCofins', originalPct: pisCofinsLRPct, kind: 'PIS_COFINS' as const }] : []),
  ]

  // A base: com a matriz, P é o do motor. Sem ela e em LR/LP, é o divisor de sempre —
  // `null` manda o módulo derivá-lo de `custo ÷ MC`, que é a fórmula que estava aqui. Fora de
  // LR/LP a base continua sendo a do motor da tela, sem mudança de comportamento.
  const _baseInformada = (isLucroReal || isLucroPresumed)
    ? (_matriz.applied ? _matriz.opInterna : null)
    : pricePerUnit
  const linhas = buildProductPriceRows({
    rows: linhasInput,
    costTotal,
    opInterna: _baseInformada,
    resolved: _matriz.applied ? _matriz.resolved : null,
  })
  const linhaPor = (key: string) => linhas.rows.find((r) => r.key === key)
  const valorDa = (key: string) => linhaPor(key)?.value ?? 0

  // A MC EXIBIDA passa a ser a que PRODUZIU o preço: `100 − Σ efetivas`. Antes era
  // `100 − Σ originais`, e por isso ela prometia um preço que a tela não mostrava.
  const mcPct = linhas.mcAplicadaPct
  const valorPrecificado = linhas.opInterna
  const icmsValDisplay = valorDa('icms')
  const pisCofinsValDisplay = valorDa('pisCofins')

  const displayBase = linhas.opInterna
  const laborValDisplay = valorDa('labor')
  const fixedValDisplay = valorDa('fixed')
  const compromissosFinanceirosValDisplay = valorDa('compromissosFinanceiros')
  const variableValDisplay = valorDa('variable')
  const financialValDisplay = valorDa('financial')
  const commissionValDisplay = valorDa('commission')
  const profitValDisplay = valorDa('profit')
  const rtReserveValDisplay = valorDa('rt')
  const irpjValDisplay = valorDa('irpj')
  const csllValDisplay = valorDa('csll')
  const adicionalIrpjValDisplay = valorDa('adicionalIrpj')
  // A linha de imposto agregado (Simples, RET, Simples Híbrido) sai da MESMA fonte: o valor
  // do motor em `productPriceInfo.taxesPrice` ignorava a efetivação.
  const taxesTotal = valorDa('tax') + valorDa('taxUnificado')
  // O compromisso entra na barra de "Despesas" junto com a fixa de onde ele saiu: fora dela, a
  // barra deixaria de somar o preço e sobraria uma fatia sem dono.
  const expensesTotalDisplay = isCalcTypeService
    ? variableValDisplay + financialValDisplay + compromissosFinanceirosValDisplay
    : laborValDisplay + fixedValDisplay + compromissosFinanceirosValDisplay + variableValDisplay + financialValDisplay

  /**
   * A base que a tela EXIBE como operação interna — e ela segue a MESMA FONTE do preço final.
   *
   * >>> DEIXOU DE NOMEAR REGIME NO PASSO XI-3 (11/10/2026), E A RAZÃO É UM DEFEITO MEDIDO <<<
   *
   * Era `(isLucroReal || isLucroPresumed) ? valorPrecificado : pricePerUnit`. Enquanto só o
   * Lucro Real tinha matriz, essa condição e a de `_ivaApplies` (abaixo) **concordavam por
   * COINCIDÊNCIA** — os mesmos dois regimes respondiam sim às duas perguntas, que são
   * diferentes.
   *
   * O XI-3 admitiu Presumido e RET em `REGIMES_COM_MATRIZ`, e a coincidência quebrou: o RET
   * passou a ter `_matriz.applied === true`, logo `finalPriceWithTaxes = _matriz.totalGeral`,
   * enquanto esta linha continuava devolvendo `pricePerUnit`. **Medido: a tela mostrava
   * interna R$ 2.500,00 e final R$ 1.498,28** — o final 40% ABAIXO da interna, porque as duas
   * linhas do resumo liam preços de origens diferentes.
   *
   * A correção não é acrescentar o RET à lista de nomes: é a base LER A MESMA FONTE que o
   * final. Quando a matriz governou, a interna é a dela (`opInterna`, R7,
   * `product-price-construction.ts:90`); quando não governou, segue o preço de antes.
   * Medido no Lucro Real: `_matriz.opInterna === valorPrecificado`, 1405.28 = 1405.28 —
   * **zero centavos de diferença no modelo de referência.**
   *
   * >>> NÃO UNIFIQUE COM `_ivaApplies` <<<
   * Elas respondem perguntas diferentes, e reuni-las outra vez reabre o defeito dos
   * R$ 1.498,28. Ver o comentário de `_ivaApplies`, que aponta para cá.
   * A invariante `precoFinalAbaixoDaInterna` é a rede: ela fica vermelha se isto for desfeito.
   */
  const baseForSalePrice = _matriz.applied ? _matriz.opInterna : pricePerUnit
  const finalSalePrice = baseForSalePrice + terceirizadasTotal

  // Impostos "por fora" (IBS/CBS/IS/IPI) — bases individualizadas da Conferência Fiscal.
  // OpDentro = preço por dentro SEM Desp. Acessórias. As terceirizadas (frete + seguro +
  // despesas acessórias) entram como Desp. Acessórias: compõem a base de IBS/CBS e do IPI,
  // mas NÃO a base do IS nem sofrem dedução de ICMS/PIS. ICMS Complementar não se aplica no
  // cadastro (depende do destinatário — só em orçamento/pedido/venda).
  /**
   * Quais tributos POR DENTRO existem neste regime — e por isso ela É específica de regime.
   *
   * Zerar `icmsPct` e `pisCofinsPct` no RET está **CERTO**: o RET não tem esses dois em
   * separado, tem alíquota única de 4% (XIV.6 da especificação). Decisão do dono do produto,
   * e a proibição de mexer aqui continua valendo.
   *
   * >>> ELA COMPARTILHAVA A CONDIÇÃO COM `baseForSalePrice` POR COINCIDÊNCIA <<<
   *
   * Até 11/10/2026 as duas eram `isLucroReal || isLucroPresumed`, e pareciam a mesma regra.
   * Não são: esta pergunta é *"quais tributos por dentro existem?"*, e a de lá é *"qual base
   * a tela exibe como operação interna?"*. Elas coincidiam porque **só o Lucro Real tinha
   * matriz** — e o XI-3, ao admitir Presumido e RET, quebrou a coincidência.
   *
   * `baseForSalePrice` passou a ler a matriz; esta **continua nomeando regime**, e isso é
   * correto. Unificá-las outra vez reabre o defeito medido de R$ 1.498,28 na tela do RET.
   * Ver o comentário de `baseForSalePrice`, que aponta para cá.
   */
  const _ivaApplies = isLucroReal || isLucroPresumed
  // PC-BUG-FATOR-REDUCAO-002 Ponto 1: aplica a redução SOBRE a alíquota bruta de IBS/CBS
  // (efetiva = bruta × (1 − redução)). IPI e IS NÃO a sofrem. É o que faz o valor de
  // IBS/CBS reduzir já na tela de construção do produto ao classificar o item.
  // CADA UM COM A SUA — era aqui que o fator único se copiava para os dois.
  const _ibsEffective = resolveIvaDualEffectiveRate(ibsPct, ivaReductionIbsPct) || 0
  const _cbsEffective = resolveIvaDualEffectiveRate(cbsPct, ivaReductionCbsPct) || 0
  const _iva = computeIvaDualOutside({
    opInterna: baseForSalePrice,
    despAcessorias: terceirizadasTotal,
    icmsPct: _ivaApplies ? icmsPct : 0,
    pisCofinsPct: _ivaApplies ? pisCofinsLRPct : 0,
    issPct: 0, // produtos não têm ISS (industrialização/revenda)
    isPct: isPct || 0,
    ibsPct: _ibsEffective,
    cbsPct: _cbsEffective,
    ipiPct: ipiPct || 0,
  })

  const _ext = _matriz.resolved?.externalTaxes

  const ibsCbsBase = _ext?.ibs?.baseValue ?? _ext?.cbs?.baseValue ?? _iva.baseIbsCbs
  const taxIsValue = _matriz.applied ? (_ext?.is?.value ?? 0) : _iva.isValue
  const taxIbsValue = _matriz.applied ? (_ext?.ibs?.value ?? 0) : _iva.ibsValue
  const taxCbsValue = _matriz.applied ? (_ext?.cbs?.value ?? 0) : _iva.cbsValue
  const taxIpiValue = _matriz.applied ? (_ext?.ipi?.value ?? 0) : _iva.ipiValue
  const totalInlineTax = _matriz.applied ? (_matriz.resolved?.externalValue ?? 0) : _iva.totalOutside
  // Preço de Venda por Unidade = Operação Interna + Operação Externa (IS+IBS+CBS+IPI)
  const finalPriceWithTaxes = _matriz.applied ? _matriz.totalGeral : _iva.finalPrice

  // FORMADO: um preço positivo e — no Lucro Real e no Presumido — a operação por dentro (ICMS e PIS/COFINS) com valor. Sem isso a margem acabou
  // e o preço que sobra seria o do motor sem esses tributos. (Era a fórmula de dentro do efeito de emissão do `ProductPrice`; o rendimento,
  // que só divide, não muda o sinal.)
  const formado = finalPriceWithTaxes > 0 && (!(isLucroReal || isLucroPresumed) || valorPrecificado > 0)

  return {
    isCalcTypeResale,
    isCalcTypeService,
    isMei,
    isLucroReal,
    isLucroPresumed,
    isLpRet,
    isSimplesHibrido,
    showIrpjCsll,
    totalPrice,
    laborPct,
    fixedPct,
    financialCommitmentsPct,
    variablePct,
    financialPct,
    taxPctDisplay,
    taxValDisplay,
    taxLabel,
    commissionPct,
    commissionVal,
    profitPct,
    profitVal,
    rtReservePct,
    pricePerUnit,
    irpjVal,
    csllVal,
    irpjPct,
    csllPct,
    adicionalIrpjPct,
    costTotal,
    terceirizadasTotal,
    _segmento,
    _matriz,
    linhasInput,
    _baseInformada,
    linhas,
    linhaPor,
    valorDa,
    mcPct,
    valorPrecificado,
    icmsValDisplay,
    pisCofinsValDisplay,
    displayBase,
    laborValDisplay,
    fixedValDisplay,
    compromissosFinanceirosValDisplay,
    variableValDisplay,
    financialValDisplay,
    commissionValDisplay,
    profitValDisplay,
    rtReserveValDisplay,
    irpjValDisplay,
    csllValDisplay,
    adicionalIrpjValDisplay,
    taxesTotal,
    expensesTotalDisplay,
    baseForSalePrice,
    finalSalePrice,
    _ivaApplies,
    _ibsEffective,
    _cbsEffective,
    _iva,
    _ext,
    ibsCbsBase,
    taxIsValue,
    taxIbsValue,
    taxCbsValue,
    taxIpiValue,
    totalInlineTax,
    finalPriceWithTaxes,
    formado,
  }
}

export type PrecoDoProduto = ReturnType<typeof formarPrecoDoProduto>
