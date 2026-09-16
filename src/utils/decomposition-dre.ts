/**
 * decomposition-dre.ts — a DECOMPOSIÇÃO, com COLUNA POR PRODUTO.
 *
 * Regra do cálculo: `.claude/rules/cascata-lucro-real.md` R15 a R20.
 * Regra da apresentação: `.claude/rules/decomposicao-na-tela.md` — inclusive o "% médio", que
 * `isDerivedAverage` alimenta, e a linha LUCRO DA VENDA, ainda PENDENTE aqui (ver a regra).
 * ORÁCULOS: planilha "Cascata Lucro Real", aba "Orçamento", linhas 62 a 88.
 *
 * >>> A DECOMPOSIÇÃO NÃO INFERE, ELA LÊ <<<
 * Parte 0: "A construção lê a matriz. A decomposição lê A MESMA matriz." Cada coluna recebe a
 * FICHA que a construção daquele item produziu — `c`, ICMS, ISS, PIS/COFINS — em vez de
 * redescobrir a proporção dividindo dois preços. É a violação que
 * `regime-e-segmento-determinam-a-construcao.md` cataloga como aparição 2, e o sintoma dela
 * é justamente não ter sintoma: os dois lados fecham entre si.
 *
 * >>> COLUNA TOTAL = SOMA DAS COLUNAS DE PRODUTO <<<
 * R16, e é inviolável. NUNCA um percentual aplicado sobre o total: cada produto calcula com
 * os próprios parâmetros, e com produtos heterogêneos o percentual da linha de total é MÉDIA
 * PONDERADA DERIVADA — que a tela tem de rotular como "% médio" (seção 6.4). Um percentual
 * derivado exibido como se fosse alíquota cadastrada é um número que a construção nunca usou.
 *
 * >>> CONGELADOS <<<
 * R18: custos, despesas, acréscimos e itens manuais são valores em R$ herdados da construção
 * e NÃO encolhem com o desconto. É exatamente isso que revela a corrosão da margem — se
 * encolhessem junto, a margem pareceria intacta.
 */

/** A ficha tributária que a CONSTRUÇÃO daquele item produziu. Nada aqui é derivado. */
export interface DecompositionItemTaxes {
  /** ICMS NOMINAL sobre o total geral (R17: os percentuais aplicados são os % Originais). */
  icmsPct: number
  /** ISS NOMINAL sobre P. */
  issPct: number
  /** PIS/COFINS NOMINAL, que incide sobre `P − ICMS − ISS`. */
  pisCofinsPct: number
  /** O `c` da R3 DESTE item. Individual, nunca global. */
  externalOpsCoefficient: number
  /**
   * O `c` aberto por tributo, cada um como FRAÇÃO do total geral. A soma é o `c`.
   *
   * A R19 pede UMA LINHA POR TRIBUTO: IBS, CBS, IS e IPI são quatro deduções. Ausente = cai
   * na linha agregada, que é o estado dos testes que nasceram antes desta distinção.
   */
  externalByTax?: { ibs: number; cbs: number; is: number; ipi: number }
}

/** Uma coluna de produto da decomposição. */
export interface DecompositionItem {
  id: string
  label: string
  /**
   * TOTAL DO PRODUTO — `P ÷ (1 − c)` (R8), SEM os acréscimos.
   *
   * >>> NÃO CONFUNDIR COM A RECEITA BRUTA DA COLUNA <<<
   * A receita bruta é `totalProduto + acrescimos`. O peso do rateio da receita de produtos,
   * porém, é o `totalProduto` SOZINHO — é assim na planilha (`E69 = G69 × E41 ÷ G41`, e a
   * linha 41 é o total do produto, não a 59). Usar a receita bruta como peso desloca a
   * repartição em décimos de por cento e passa despercebido: foi o erro que os oráculos da
   * planilha pegaram nesta rodada, e é o motivo de os dois campos serem separados.
   */
  totalProduto: number
  /** R18 — custo CONGELADO, em R$, herdado da construção. */
  custo: number
  /** R13 — total dos acréscimos deste item, COM tributo. */
  acrescimos: number
  taxes: DecompositionItemTaxes
  /**
   * As categorias DESTE item, quando ele tem as suas.
   *
   * Comissão, lucro e RT são cadastrados POR PRODUTO — dois itens no mesmo orçamento têm
   * pesos de RRO diferentes, e distribuir o RRO de um deles pelos pesos do outro devolveria
   * um percentual que a construção nunca usou (`regime-e-segmento-determinam-a-construcao.md`).
   * Ausente = usa as do documento, que é o caso de um orçamento homogêneo e o dos testes que
   * nasceram antes desta distinção.
   */
  categories?: DecompositionCategories
}

/** Os percentuais % ORIGINAIS das categorias, sobre o total geral (R17). Comuns ao documento. */
export interface DecompositionCategories {
  /** Soma das despesas operacionais (MO administrativa, fixa, variável, financeira). */
  despesasOperacionaisPct: number
  rtPct: number
  comissaoPct: number
  lucroPct: number
  /** IRPJ como % do total geral — tipicamente `alíquota IRPJ × % Lucro` (R6). */
  irpjPct: number
  csllPct: number
}

export interface DecompositionInput {
  items: DecompositionItem[]
  categories: DecompositionCategories
  /** Desconto global como fração [0, 1). Incide sobre o total geral (R14). */
  discountPct: number
  /** R18 — itens manuais + a parcela de acréscimo que caiu neles. Repasse SEM tributo. */
  itensManuaisComAcrescimos: number
}

/** Uma linha do DRE. `perItem` é paralelo a `input.items`. */
export interface DecompositionRow {
  key: string
  label: string
  /** Agrupamento/subtotal (as linhas com ►). Muda como a tela a apresenta. */
  isSubtotal: boolean
  /**
   * Base de cálculo sobre a qual o percentual incide, no TOTAL. `null` quando a linha não
   * tem percentual — e `null` é "não se aplica", nunca zero.
   */
  base: number | null
  /**
   * O percentual da linha, no total. Quando `isDerivedAverage`, é MÉDIA PONDERADA derivada
   * dos produtos — a tela precisa rotulá-lo "% médio" (seção 6.4).
   */
  pct: number | null
  /** `true` quando `pct` é média ponderada derivada e NÃO uma alíquota cadastrada. */
  isDerivedAverage: boolean
  /**
   * `true` nas linhas de TRIBUTO — IBS, CBS, IS, IPI, ICMS, ISS, PIS/COFINS.
   *
   * A tela as exibe como SUB-ITEM, em fonte menor, como já faz com os filhos das etapas da
   * construção: são o detalhamento de uma dedução, e lê-las com o mesmo peso dos
   * agrupamentos achata a hierarquia que a R19 tem.
   */
  isTaxDetail: boolean
  perItem: number[]
  /** R16 — soma das colunas de produto. Nunca percentual sobre o total. */
  total: number
  /**
   * O percentual da linha sobre a RECEITA DE PRODUTOS — o total geral dos produtos.
   *
   * É o que a R17 chama de "% Original com base no total geral", e é por isso que ele existe
   * ao lado de `pct`: nas quatro linhas do RRO o `pct` é o PESO da R20 (base RRO), e o peso
   * responde "quanto desta sobra é comissão"; este responde "quanto do preço é comissão" — e
   * é este que tem de voltar como os 5% e os 10% CADASTRADOS.
   *
   * `null` quando a base é zero. Nunca 0%.
   */
  pctSobreTotalGeral: number | null
}

/**
 * A linha final do DRE (relatório, seção 6.2). Os DOIS números juntos são o ponto da
 * decomposição inteira: o lucro sozinho não diz nada; o par diz QUANTO do lucro cadastrado o
 * desconto consumiu — e a coluna por produto diz EM QUAL produto.
 */
/**
 * O INVARIANTE DO RRO — o que a decomposição apurou contra o que a construção reservou.
 *
 * A construção reserva `(% Comissão + % Lucro + % IRPJ + % CSLL) × TOTAL GERAL` para o RRO.
 * A decomposição chega nele por SUBTRAÇÃO: receita menos tudo. Os dois têm de dar o MESMO
 * número, ao centavo — e quando não dão, há um valor SEM DONO na conta.
 *
 * Foi o que faltava: nenhum caso afirmava essa igualdade, e por isso um CMV que chega zerado
 * (produto com `cost_total = 0` e preço digitado) inflava o RRO em silêncio. O residual
 * continuava R$ 0,00 — ele fecha por construção, porque distribui o RRO INTEIRO, seja ele
 * qual for. Um residual zerado NÃO prova que o RRO está certo, e essa é a distinção que este
 * invariante existe para fazer.
 */
export interface RroInvariante {
  /** O RRO que a decomposição apurou por subtração. */
  apurado: number
  /** `Σ % cadastrados × total geral` — o que a construção reservou. */
  esperado: number
  /** `apurado − esperado`. */
  divergencia: number
  /**
   * `true` quando a divergência denuncia VALOR SEM DONO.
   *
   * >>> OS DOIS SINAIS NÃO SIGNIFICAM A MESMA COISA, e tratá-los igual seria errado <<<
   *
   * **Sobra** (`apurado > esperado`) é sempre defeito: entrou no RRO dinheiro que nenhuma
   * dedução reclamou — um CMV que chegou zerado, uma despesa que não foi lançada.
   *
   * **Falta** (`apurado < esperado`) COM DESCONTO é o comportamento correto, e é o ponto da
   * cascata inteira: custos, despesas e acréscimos são CONGELADOS (R18) e não encolhem com o
   * desconto, então o RRO encolhe mais que proporcionalmente. Chamar isso de divergência
   * transformaria a corrosão da margem — que a decomposição existe para mostrar — em erro de
   * cálculo. Ela aparece no LUCRO DA VENDA, que é o lugar dela.
   *
   * SEM desconto não há corrosão a explicar, e aí qualquer diferença nos dois sentidos é
   * defeito.
   */
  foraDeZero: boolean
}

export interface LucroDaVenda {
  /** Por produto — é o que diz EM QUAL produto o desconto corroeu. */
  perItem?: number[]
  /** O lucro apurado, em R$. É a soma da linha `lucro`. */
  valor: number
  /**
   * O lucro apurado como fração da RECEITA APÓS DESCONTO. É o número que a seção 6.2
   * publica (6,79% no cenário de referência).
   *
   * >>> NÃO É COMPARÁVEL DIRETAMENTE COM O CADASTRADO <<<
   * A receita após desconto inclui itens manuais e acréscimos, que são REPASSE e não geram
   * lucro. Mesmo com desconto ZERO este percentual fica abaixo do cadastrado — medido:
   * 7,7158% contra 8,00%, e os 0,2842 pontos são os R$ 12.895,87 de repasse, não desconto.
   * Para comparar com o cadastrado, use `pctSobreProdutos`.
   */
  pctApurado: number | null
  /**
   * O lucro apurado como fração da RECEITA DE PRODUTOS. É ESTE que é comparável com o
   * cadastrado: com desconto zero ele devolve exatamente o % cadastrado, e é o teste 3 do
   * checklist ("a decomposição com desconto zero devolve os % Originais").
   */
  pctSobreProdutos: number | null
  /** O % de lucro CADASTRADO, tal como veio das categorias. */
  pctCadastrado: number
  /**
   * `pctSobreProdutos − pctCadastrado` — a corrosão que o DESCONTO causou, e só ela.
   *
   * Contra `pctApurado` a diferença misturaria desconto e repasse, e a tela atribuiria ao
   * desconto uma perda que não é dele. `null` quando não é calculável.
   */
  diferenca: number | null
}

export interface DecompositionResult {
  rows: DecompositionRow[]
  /** Seção 6.2 — o objetivo final. Ausente só quando não há linhas. */
  lucroDaVenda: LucroDaVenda | null
  /** R20 — o residual, no total e por item. Deve ser zero. */
  residual: { perItem: number[]; total: number }
  /** A receita após desconto, base da análise vertical (seção 6.4). */
  receitaAposDesconto: number
  /**
   * O RRO apurado contra o reservado pela construção. `null` só quando não há linhas.
   *
   * O RESIDUAL não substitui isto: ele fecha por construção, porque distribui o RRO inteiro
   * seja ele qual for. Ver `RroInvariante`.
   */
  rro: RroInvariante | null
  /**
   * Os % ORIGINAIS das quatro categorias do RRO, ponderados pela receita de produtos.
   *
   * É o CADASTRADO — o que o usuário digitou no produto —, e é o par do apurado nos cards de
   * Comissão e Lucro: sem desconto os dois coincidem, e com desconto a diferença é a corrosão.
   * Com itens de percentuais diferentes, a ponderação é pela receita de produtos de cada um,
   * que é a base sobre a qual os % originais incidem (R17).
   *
   * `null` quando não há produto: zero afirmaria que a comissão cadastrada é zero.
   */
  rroCadastrado: { comissaoPct: number; lucroPct: number; irpjPct: number; csllPct: number } | null
  errors: string[]
}

const soma = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/**
 * A tolerância do invariante do RRO: um centavo, OU um centésimo de milésimo do valor — o que
 * for maior.
 *
 * O limiar absoluto de R$ 0,01 é estreito demais para documentos grandes. Medido no
 * ATeste1509: o RRO apurado sai R$ 6.395,8447 contra R$ 6.395,8346 esperados — uma diferença
 * de R$ 0,0101, que é ACÚMULO DE ARREDONDAMENTO das alíquotas em quatro casas, não defeito.
 * Um alerta disparando ali seria `portao-que-nao-alcanca.md` pelo avesso: o aviso perde o
 * sentido quando aparece em documento são, e quem o vê aprende a ignorá-lo.
 *
 * A proporção é conservadora de propósito: 0,001% de R$ 6.395 são seis centavos, e o defeito
 * que este invariante existe para pegar — o CMV ausente do ATeste1509 — era de R$ 10.562,58,
 * cinco ordens de grandeza acima.
 */
const toleranciaRro = (esperado: number): number => Math.max(0.01, Math.abs(esperado) * 0.00001)

/** As linhas que são DETALHE de tributo — exibidas como sub-item (ver `isTaxDetail`). */
const LINHAS_DE_TRIBUTO = new Set([
  'por_fora', 'por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi',
  'icms', 'iss', 'pis_cofins',
])

/**
 * `true` quando os itens NÃO compartilham a mesma alíquota — é o que torna o percentual da
 * linha de total uma média ponderada em vez de uma alíquota.
 *
 * Com UM item só, ou com itens de alíquota idêntica, o percentual do total É a alíquota, e
 * rotulá-lo "% médio" seria mentir para o outro lado.
 */
function heterogeneo(valores: number[]): boolean {
  if (valores.length <= 1) return false
  return valores.some((v) => Math.abs(v - valores[0]) > 1e-12)
}

/**
 * Monta a decomposição do documento, coluna a coluna.
 *
 * R15 — ela existe APENAS em orçamento, pedido e venda. Na precificação existe só a
 * construção, e chamar isto lá produziria um DRE de uma venda que não aconteceu.
 */
export function buildDecomposition(input: DecompositionInput): DecompositionResult {
  const { items, categories: cat } = input
  const errors: string[] = []

  if (items.length === 0) return { rows: [], lucroDaVenda: null, residual: { perItem: [], total: 0 }, receitaAposDesconto: 0, rro: null, rroCadastrado: null, errors }
  if (!(input.discountPct >= 0 && input.discountPct < 1)) {
    errors.push(`desconto fora de [0, 1): ${input.discountPct}`)
    return { rows: [], lucroDaVenda: null, residual: { perItem: [], total: 0 }, receitaAposDesconto: 0, rro: null, rroCadastrado: null, errors }
  }

  const receitaBrutaPorItem = items.map((i) => i.totalProduto + i.acrescimos)
  const receitaBruta = soma(receitaBrutaPorItem) + input.itensManuaisComAcrescimos
  const desconto = -receitaBruta * input.discountPct
  const receitaAposDesconto = receitaBruta + desconto

  // R14 — o desconto incide sobre o total geral, mas itens manuais e acréscimos SAEM
  // INTEIROS: ele recai integralmente sobre os produtos. Por isso a receita de produtos é o
  // que sobra depois de tirar o repasse, e é rateada entre as colunas pelo peso de cada uma.
  const repasseManuais = -input.itensManuaisComAcrescimos
  const acrescimosPorItem = items.map((i) => -i.acrescimos)
  const receitaProdutosTotal = receitaAposDesconto + repasseManuais + soma(acrescimosPorItem)

  // O peso é o TOTAL DO PRODUTO, sem acréscimos — ver o comentário de `totalProduto`.
  const totalProdutos = soma(items.map((i) => i.totalProduto))
  const receitaProdutosPorItem = items.map((i) =>
    totalProdutos > 0 ? receitaProdutosTotal * (i.totalProduto / totalProdutos) : 0,
  )

  /**
   * R14 — O DESCONTO POR ITEM, que já existia e não tinha linha.
   *
   * Ele nunca precisou ser calculado para o DRE fechar: está EMBUTIDO em
   * `receitaProdutosPorItem`, porque a receita de produtos já é a pós-desconto rateada. Só
   * que embutido ele não serve para nada fora daqui — e na NF-e o desconto é `vDesc` POR
   * ITEM, não um abatimento global.
   *
   * O rateio é pelo TOTAL DO PRODUTO, o mesmo peso da receita de produtos, e é o que faz a
   * soma das colunas devolver o desconto inteiro: itens manuais e acréscimos saem INTEIROS
   * (R14), então o desconto que incidiria sobre eles recai sobre os produtos e já está no
   * total. Ratear pela receita bruta do item — que inclui o acréscimo — repartiria errado.
   */
  const descontoPorItem = items.map((i) =>
    totalProdutos > 0 ? desconto * (i.totalProduto / totalProdutos) : 0,
  )

  // R8 invertido: os tributos por fora são `receita de produtos × c` do PRÓPRIO item.
  const porForaPorItem = items.map((i, k) => -receitaProdutosPorItem[k] * i.taxes.externalOpsCoefficient)
  const pPorItem = items.map((_, k) => receitaProdutosPorItem[k] + porForaPorItem[k])

  // R17 — os percentuais aplicados são os % ORIGINAIS, com base no TOTAL GERAL. O ICMS incide
  // sobre a receita de produtos, não sobre P: misturar % Original com base P é o erro que a
  // R17 nomeia.
  const icmsPorItem = items.map((i, k) => -receitaProdutosPorItem[k] * i.taxes.icmsPct)
  const issPorItem = items.map((i, k) => -pPorItem[k] * i.taxes.issPct)
  const pisCofinsPorItem = items.map(
    (i, k) => -(pPorItem[k] + icmsPorItem[k] + issPorItem[k]) * i.taxes.pisCofinsPct,
  )
  const receitaLiquidaPorItem = items.map((_, k) => pPorItem[k] + icmsPorItem[k] + issPorItem[k] + pisCofinsPorItem[k])

  // As categorias DESTE item: as próprias quando ele as tem, as do documento quando não.
  const catDe = (k: number): DecompositionCategories => items[k].categories ?? cat

  // ───────────────────────────────────────────────────────────────────────────────────────
  // R18 — OS QUATRO CONGELADOS, E A UNIDADE EM QUE O PARÂMETRO CHEGA NÃO DECIDE NADA
  //
  // "Custos, despesas, acréscimos e itens manuais são valores em R$ herdados da construção e
  //  NÃO ENCOLHEM com o desconto." É exatamente isso que revela a corrosão da margem.
  //
  // >>> O DEFEITO QUE ESTA SEÇÃO EXISTE PARA IMPEDIR <<<
  // Três dos quatro chegam em R$ — `i.custo`, `i.acrescimos`, `itensManuaisComAcrescimos` — e
  // congelaram por acidente: não havia como recalculá-los. A DESPESA chega em PERCENTUAL, e
  // foi recalculada junto com as linhas de imposto, que são as vizinhas na escrita. Medido no
  // ORC-5487, 5% de desconto:
  //
  //     recalculada   34.919,79 × 22,92% = R$ 8.003,62
  //     congelada     36.757,67 × 22,92% = R$ 8.424,86     diferença R$ 421,24
  //
  // Formulação do dono do produto, registrada como está: "Não é decisão errada, é AUSÊNCIA DE
  // DECISÃO — ninguém marcou 'esta é percentual mas não recalcula'."
  //
  // >>> A DISTINÇÃO É ECONÔMICA, NÃO DE IMPLEMENTAÇÃO <<<
  // Tributo acompanha a receita — faturou menos, paga menos —, e por isso IBS, CBS, IS, IPI,
  // ICMS, ISS, PIS/COFINS e a Comissão RT recalculam MESMO, sobre a receita pós-desconto.
  // Custo e despesa não acompanham: eles já aconteceram. É essa assimetria que faz o desconto
  // doer, e se a despesa encolhesse junto a tela esconderia o estrago.
  //
  // A base congelada é a receita de produtos SEM DESCONTO, que é o `totalProduto` de cada
  // item: com `discountPct = 0`, `receitaProdutosPorItem[k]` É `items[k].totalProduto`, e é
  // por isso que os dois caminhos coincidem ali — e por isso um teste sem desconto NÃO
  // DISTINGUE congelar de recalcular (`.claude/rules/teste-que-nao-exercita.md`, variante 2).
  // ───────────────────────────────────────────────────────────────────────────────────────
  const custoPorItem = items.map((i) => -i.custo)
  const despesasPorItem = items.map((i, k) => -i.totalProduto * catDe(k).despesasOperacionaisPct)
  // A RT recalcula: é comissão sobre o que foi faturado. Ver o parágrafo acima.
  const rtPorItem = receitaProdutosPorItem.map((r, k) => -r * catDe(k).rtPct)
  const rroPorItem = items.map(
    (_, k) => receitaLiquidaPorItem[k] + custoPorItem[k] + despesasPorItem[k] + rtPorItem[k],
  )

  // R20 — as quatro categorias caem PROPORCIONALMENTE, sem hierarquia entre elas.
  // NÃO subtrair a comissão primeiro para aplicar IRPJ sobre o resto: isso quebraria a
  // engenharia reversa, e sem desconto o IRPJ voltaria diferente do cadastrado.
  //
  // A soma é POR ITEM: comissão e lucro são cadastrados por produto, e um orçamento com dois
  // produtos de margens diferentes tem dois conjuntos de pesos. Usar um só devolveria um
  // percentual que a construção daquele item nunca usou.
  const somaRROde = (k: number) => {
    const c = catDe(k)
    return c.comissaoPct + c.lucroPct + c.irpjPct + c.csllPct
  }
  if (items.some((_, k) => somaRROde(k) <= 0)) {
    errors.push('soma das categorias do RRO <= 0: não há como distribuir o resultado residual.')
    return { rows: [], lucroDaVenda: null, residual: { perItem: [], total: 0 }, receitaAposDesconto, rro: null, rroCadastrado: null, errors }
  }
  const pesoDe = (k: number, pct: number) => pct / somaRROde(k)
  const comissaoPorItem = rroPorItem.map((r, k) => r * pesoDe(k, catDe(k).comissaoPct))
  const lucroPorItem = rroPorItem.map((r, k) => r * pesoDe(k, catDe(k).lucroPct))
  const irpjPorItem = rroPorItem.map((r, k) => r * pesoDe(k, catDe(k).irpjPct))
  const csllPorItem = rroPorItem.map((r, k) => r * pesoDe(k, catDe(k).csllPct))

  const residualPorItem = rroPorItem.map(
    (r, k) => r - comissaoPorItem[k] - lucroPorItem[k] - irpjPorItem[k] - csllPorItem[k],
  )

  const linha = (
    key: string,
    label: string,
    perItem: number[],
    opts: { base?: number | null; pct?: number | null; derived?: boolean; subtotal?: boolean; total?: number } = {},
  ): DecompositionRow => ({
    key,
    label,
    isSubtotal: opts.subtotal ?? false,
    base: opts.base ?? null,
    pct: opts.pct ?? null,
    isDerivedAverage: opts.derived ?? false,
    isTaxDetail: LINHAS_DE_TRIBUTO.has(key),
    pctSobreTotalGeral: receitaProdutosTotal !== 0
      ? Math.abs(opts.total !== undefined ? opts.total : soma(perItem)) / receitaProdutosTotal
      : null,
    perItem,
    // R16 — a coluna Total é SOMA das colunas de produto, salvo nas linhas que só existem no
    // total (desconto e repasse dos manuais), onde o valor é informado.
    total: opts.total !== undefined ? opts.total : soma(perItem),
  })

  /**
   * As linhas que só existem NO TOTAL — R16: "a coluna Total é SOMA das colunas de produto,
   * salvo nas linhas que só existem no total".
   *
   * `perItem` VAZIO, e não um array de zeros: zero afirmaria que aquele produto recebeu R$
   * 0,00 de desconto, quando o desconto é do documento e não tem repartição por item. A tela
   * exibe travessão — `.claude/rules/ausente-vs-falso.md`.
   *
   * E é o que faz o invariante "total = soma das colunas" valer para TODA linha que tem
   * coluna: com zeros, essas três quebravam a igualdade e obrigariam o teste a abrir exceção
   * — exceção que, uma vez aberta, esconderia uma linha de verdade desalinhada.
   */
  const semColuna: number[] = []
  const rp = receitaProdutosTotal

  // O percentual do TOTAL: alíquota quando todos os itens têm a mesma; média ponderada
  // derivada quando não. `pctDe` calcula sempre `valor ÷ base`, e `heterogeneo` decide o
  // rótulo — sem o rótulo, o número derivado seria lido como alíquota cadastrada.
  const pctDe = (valorTotal: number, base: number) => (base !== 0 ? -valorTotal / base : null)

  const rows: DecompositionRow[] = [
    linha('receita_bruta', 'RECEITA BRUTA (agrupamento)', receitaBrutaPorItem, { subtotal: true, total: receitaBruta }),
    // A coluna existe agora: é o `vDesc` de cada item. O `total` segue sendo o valor exato do
    // documento, e não a soma das frações — os dois coincidem a menos de erro de ponto
    // flutuante, e o exato é o que o usuário digitou.
    linha('desconto', '(−) Desconto concedido', descontoPorItem, { pct: input.discountPct, total: desconto }),
    linha('receita_apos_desconto', '► RECEITA APÓS DESCONTO', semColuna, { subtotal: true, total: receitaAposDesconto }),
    linha('repasse_manuais', '(−) Itens manuais + frete neles (sem tributo)', semColuna, { total: repasseManuais }),
    linha('acrescimos', '(−) Acréscimos dos produtos (com tributo)', acrescimosPorItem),
    linha('receita_produtos', '► RECEITA DE PRODUTOS', receitaProdutosPorItem, { subtotal: true, total: rp }),
    // R19 — UMA LINHA POR TRIBUTO. A agregada só sobra quando o item não traz a abertura,
    // que é o caso do trace legado: melhor a linha agregada que nenhuma.
    ...(items.some((i) => i.taxes.externalByTax)
      ? (['ibs', 'cbs', 'is', 'ipi'] as const).map((nome) => {
        const perItemTributo = items.map((i, k) => -receitaProdutosPorItem[k] * (i.taxes.externalByTax?.[nome] ?? 0))
        return linha(`por_fora_${nome}`, `(−) ${nome.toUpperCase()}`, perItemTributo, {
          base: rp,
          pct: pctDe(soma(perItemTributo), rp),
          derived: heterogeneo(items.map((i) => i.taxes.externalByTax?.[nome] ?? 0)),
        })
      })
      : [linha('por_fora', '(−) IBS · CBS · IS · IPI', porForaPorItem, {
        base: rp,
        pct: pctDe(soma(porForaPorItem), rp),
        derived: heterogeneo(items.map((i) => i.taxes.externalOpsCoefficient)),
      })]),
    linha('operacao_por_dentro', '► OPERAÇÃO POR DENTRO (P)', pPorItem, { subtotal: true }),
    linha('icms', '(−) ICMS', icmsPorItem, {
      base: rp,
      pct: pctDe(soma(icmsPorItem), rp),
      derived: heterogeneo(items.map((i) => i.taxes.icmsPct)),
    }),
    linha('iss', '(−) ISS', issPorItem, {
      base: soma(pPorItem),
      pct: pctDe(soma(issPorItem), soma(pPorItem)),
      derived: heterogeneo(items.map((i) => i.taxes.issPct)),
    }),
    linha('pis_cofins', '(−) PIS/COFINS', pisCofinsPorItem, {
      base: soma(pPorItem) + soma(icmsPorItem) + soma(issPorItem),
      pct: pctDe(soma(pisCofinsPorItem), soma(pPorItem) + soma(icmsPorItem) + soma(issPorItem)),
      derived: heterogeneo(items.map((i) => i.taxes.pisCofinsPct)),
    }),
    linha('receita_liquida', '► RECEITA LÍQUIDA', receitaLiquidaPorItem, { subtotal: true }),
    linha('custos', '(−) Custos — congelado', custoPorItem),
    // CONGELADA: sem base e sem percentual, como as outras três. Exibir `base × 22,92%` numa
    // linha que não se calcula assim afirma um cálculo que não existe — e o número que ele
    // produziria é o errado. O rótulo diz por quê, na própria tela.
    linha('despesas', '(−) Despesas operacionais — congelado', despesasPorItem),
    linha('rt', '(−) Comissão RT', rtPorItem, {
      base: rp,
      pct: pctDe(soma(rtPorItem), rp),
      derived: heterogeneo(items.map((_, k) => catDe(k).rtPct)),
    }),
    linha('rro', '► RRO — RESULTADO RESIDUAL OPERACIONAL', rroPorItem, { subtotal: true }),
    // R17/R20 — a base é o RRO e o percentual é o PESO. NÃO a alíquota efetivada: efetivada
    // é da construção, e exibi-la aqui é o que a Memória Cascata antiga fazia (rotulava
    // "efetiva 6,1883%" na Comissão). Planilha, aba Orçamento, linhas 82 a 85.
    linha('comissao', 'Comissão', comissaoPorItem, {
      base: soma(rroPorItem),
      pct: soma(rroPorItem) !== 0 ? soma(comissaoPorItem) / soma(rroPorItem) : null,
      derived: heterogeneo(items.map((_, k) => pesoDe(k, catDe(k).comissaoPct))),
    }),
    linha('lucro', 'Lucro', lucroPorItem, {
      base: soma(rroPorItem),
      pct: soma(rroPorItem) !== 0 ? soma(lucroPorItem) / soma(rroPorItem) : null,
      derived: heterogeneo(items.map((_, k) => pesoDe(k, catDe(k).lucroPct))),
    }),
    // A base do IRPJ e da CSLL é o LUCRO distribuído, e o percentual é a alíquota legal —
    // é essa relação que a R20 preserva e que a engenharia reversa confere.
    linha('irpj', 'IRPJ', irpjPorItem, {
      base: soma(lucroPorItem),
      pct: soma(lucroPorItem) !== 0 ? soma(irpjPorItem) / soma(lucroPorItem) : null,
      derived: heterogeneo(items.map((_, k) => (catDe(k).lucroPct > 0 ? catDe(k).irpjPct / catDe(k).lucroPct : 0))),
    }),
    linha('csll', 'CSLL', csllPorItem, {
      base: soma(lucroPorItem),
      pct: soma(lucroPorItem) !== 0 ? soma(csllPorItem) / soma(lucroPorItem) : null,
      derived: heterogeneo(items.map((_, k) => (catDe(k).lucroPct > 0 ? catDe(k).csllPct / catDe(k).lucroPct : 0))),
    }),
    // A ÚLTIMA LINHA DO DRE É O RESIDUAL, e isso é requisito da seção 6.4. O LUCRO DA VENDA
    // NÃO entra aqui: na planilha ele é a linha 88, separado do DRE que termina na 86, e
    // enfiá-lo no fim da tabela tiraria do residual o lugar que a regra lhe dá. Ele sai em
    // `lucroDaVenda`, e a tela o exibe como destaque abaixo.
    linha('residual', '► RESIDUAL (deve ser zero)', residualPorItem, { subtotal: true }),
  ]

  // Seção 6.2 — LUCRO DA VENDA. O apurado é sobre a receita APÓS desconto, e o cadastrado é
  // o `% Lucro` que entrou na construção. Exibir só o primeiro esconde exatamente o que a
  // decomposição existe para mostrar.
  const lucroApurado = soma(lucroPorItem)
  const pctApurado = receitaAposDesconto !== 0 ? lucroApurado / receitaAposDesconto : null
  const pctSobreProdutos = receitaProdutosTotal !== 0 ? lucroApurado / receitaProdutosTotal : null
  const lucroDaVenda: LucroDaVenda = {
    valor: lucroApurado,
    perItem: lucroPorItem,
    pctApurado,
    pctSobreProdutos,
    // O cadastrado do DOCUMENTO. Com itens de lucros diferentes ele é uma referência única
    // que nenhum item tem — por isso a comparação por item fica na coluna, e este número é o
    // do documento, como a seção 6.2 o publica.
    pctCadastrado: cat.lucroPct,
    // Contra o percentual SOBRE PRODUTOS, não contra o da receita após desconto: só assim a
    // diferença é o desconto. Ver o comentário de `pctApurado`.
    diferenca: pctSobreProdutos != null ? pctSobreProdutos - cat.lucroPct : null,
  }

  // O invariante: a construção reservou `Σ % cadastrados × total geral` para o RRO, e a
  // decomposição chegou nele por subtração. Os dois têm de dar o mesmo número.
  //
  // O total geral de cada item é a receita de produtos DELE — é sobre ela que os % originais
  // incidem (R17). Com desconto, o reservado encolhe junto, porque a base encolheu: é o que
  // faz a corrosão aparecer no LUCRO DA VENDA em vez de virar divergência aqui.
  const rroEsperado = items.reduce((acc, _it, k) => {
    const c = catDe(k)
    return acc + receitaProdutosPorItem[k] * (c.comissaoPct + c.lucroPct + c.irpjPct + c.csllPct)
  }, 0)
  const rroApurado = soma(rroPorItem)
  const rroDivergencia = rroApurado - rroEsperado

  // O CADASTRADO das quatro categorias, ponderado pela receita de produtos de cada item —
  // a base sobre a qual os % originais incidem (R17). Ver `rroCadastrado`.
  const pctCadastrado = (pega: (c: DecompositionCategories) => number): number =>
    rp !== 0 ? items.reduce((a, _it, k) => a + receitaProdutosPorItem[k] * pega(catDe(k)), 0) / rp : 0
  const rroCadastrado = items.length > 0
    ? {
      comissaoPct: pctCadastrado((c) => c.comissaoPct),
      lucroPct: pctCadastrado((c) => c.lucroPct),
      irpjPct: pctCadastrado((c) => c.irpjPct),
      csllPct: pctCadastrado((c) => c.csllPct),
    }
    : null

  return {
    rows,
    lucroDaVenda,
    residual: { perItem: residualPorItem, total: soma(residualPorItem) },
    receitaAposDesconto,
    rroCadastrado,
    rro: {
      apurado: rroApurado,
      esperado: rroEsperado,
      divergencia: rroDivergencia,
      // Ver `RroInvariante.foraDeZero`: com desconto, só a SOBRA acusa; sem desconto, os
      // dois sentidos acusam.
      foraDeZero: input.discountPct > 0
        ? rroDivergencia > toleranciaRro(rroEsperado)
        : Math.abs(rroDivergencia) > toleranciaRro(rroEsperado),
    },
    errors,
  }
}

/**
 * Análise vertical: quanto a linha representa da RECEITA APÓS DESCONTOS (seção 6.4).
 *
 * `null` quando a base é zero — e `null` é "não apurável", jamais 0%.
 */
export function analiseVertical(valor: number, receitaAposDesconto: number): number | null {
  if (!Number.isFinite(receitaAposDesconto) || receitaAposDesconto === 0) return null
  return valor / receitaAposDesconto
}
