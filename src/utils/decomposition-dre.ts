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
  perItem: number[]
  /** R16 — soma das colunas de produto. Nunca percentual sobre o total. */
  total: number
}

/**
 * A linha final do DRE (relatório, seção 6.2). Os DOIS números juntos são o ponto da
 * decomposição inteira: o lucro sozinho não diz nada; o par diz QUANTO do lucro cadastrado o
 * desconto consumiu — e a coluna por produto diz EM QUAL produto.
 */
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
  errors: string[]
}

const soma = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

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

  if (items.length === 0) return { rows: [], lucroDaVenda: null, residual: { perItem: [], total: 0 }, receitaAposDesconto: 0, errors }
  if (!(input.discountPct >= 0 && input.discountPct < 1)) {
    errors.push(`desconto fora de [0, 1): ${input.discountPct}`)
    return { rows: [], lucroDaVenda: null, residual: { perItem: [], total: 0 }, receitaAposDesconto: 0, errors }
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

  const custoPorItem = items.map((i) => -i.custo)
  const despesasPorItem = receitaProdutosPorItem.map((r) => -r * cat.despesasOperacionaisPct)
  const rtPorItem = receitaProdutosPorItem.map((r) => -r * cat.rtPct)
  const rroPorItem = items.map(
    (_, k) => receitaLiquidaPorItem[k] + custoPorItem[k] + despesasPorItem[k] + rtPorItem[k],
  )

  // R20 — as quatro categorias caem PROPORCIONALMENTE, sem hierarquia entre elas.
  // NÃO subtrair a comissão primeiro para aplicar IRPJ sobre o resto: isso quebraria a
  // engenharia reversa, e sem desconto o IRPJ voltaria diferente do cadastrado.
  const somaRRO = cat.comissaoPct + cat.lucroPct + cat.irpjPct + cat.csllPct
  if (somaRRO <= 0) {
    errors.push('soma das categorias do RRO <= 0: não há como distribuir o resultado residual.')
    return { rows: [], lucroDaVenda: null, residual: { perItem: [], total: 0 }, receitaAposDesconto, errors }
  }
  const peso = (pct: number) => pct / somaRRO
  const comissaoPorItem = rroPorItem.map((r) => r * peso(cat.comissaoPct))
  const lucroPorItem = rroPorItem.map((r) => r * peso(cat.lucroPct))
  const irpjPorItem = rroPorItem.map((r) => r * peso(cat.irpjPct))
  const csllPorItem = rroPorItem.map((r) => r * peso(cat.csllPct))

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
    perItem,
    // R16 — a coluna Total é SOMA das colunas de produto, salvo nas linhas que só existem no
    // total (desconto e repasse dos manuais), onde o valor é informado.
    total: opts.total !== undefined ? opts.total : soma(perItem),
  })

  const zeros = items.map(() => 0)
  const rp = receitaProdutosTotal

  // O percentual do TOTAL: alíquota quando todos os itens têm a mesma; média ponderada
  // derivada quando não. `pctDe` calcula sempre `valor ÷ base`, e `heterogeneo` decide o
  // rótulo — sem o rótulo, o número derivado seria lido como alíquota cadastrada.
  const pctDe = (valorTotal: number, base: number) => (base !== 0 ? -valorTotal / base : null)

  const rows: DecompositionRow[] = [
    linha('receita_bruta', 'RECEITA BRUTA (agrupamento)', receitaBrutaPorItem, { subtotal: true, total: receitaBruta }),
    linha('desconto', '(−) Desconto concedido', zeros, { pct: input.discountPct, total: desconto }),
    linha('receita_apos_desconto', '► RECEITA APÓS DESCONTO', zeros, { subtotal: true, total: receitaAposDesconto }),
    linha('repasse_manuais', '(−) Itens manuais + frete neles (sem tributo)', zeros, { total: repasseManuais }),
    linha('acrescimos', '(−) Acréscimos dos produtos (com tributo)', acrescimosPorItem),
    linha('receita_produtos', '► RECEITA DE PRODUTOS', receitaProdutosPorItem, { subtotal: true, total: rp }),
    linha('por_fora', '(−) IBS · CBS · IS · IPI', porForaPorItem, {
      base: rp,
      pct: pctDe(soma(porForaPorItem), rp),
      derived: heterogeneo(items.map((i) => i.taxes.externalOpsCoefficient)),
    }),
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
    linha('despesas', '(−) Despesas operacionais', despesasPorItem, { base: rp, pct: cat.despesasOperacionaisPct }),
    linha('rt', '(−) Comissão RT', rtPorItem, { base: rp, pct: cat.rtPct }),
    linha('rro', '► RRO — RESULTADO RESIDUAL OPERACIONAL', rroPorItem, { subtotal: true }),
    linha('comissao', 'Comissão', comissaoPorItem, { base: soma(rroPorItem), pct: peso(cat.comissaoPct) }),
    linha('lucro', 'Lucro', lucroPorItem, { base: soma(rroPorItem), pct: peso(cat.lucroPct) }),
    // A base do IRPJ e da CSLL é o LUCRO distribuído, e o percentual é a alíquota legal —
    // é essa relação que a R20 preserva e que a engenharia reversa confere.
    linha('irpj', 'IRPJ', irpjPorItem, { base: soma(lucroPorItem), pct: cat.lucroPct > 0 ? cat.irpjPct / cat.lucroPct : null }),
    linha('csll', 'CSLL', csllPorItem, { base: soma(lucroPorItem), pct: cat.lucroPct > 0 ? cat.csllPct / cat.lucroPct : null }),
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
    pctCadastrado: cat.lucroPct,
    // Contra o percentual SOBRE PRODUTOS, não contra o da receita após desconto: só assim a
    // diferença é o desconto. Ver o comentário de `pctApurado`.
    diferenca: pctSobreProdutos != null ? pctSobreProdutos - cat.lucroPct : null,
  }

  return {
    rows,
    lucroDaVenda,
    residual: { perItem: residualPorItem, total: soma(residualPorItem) },
    receitaAposDesconto,
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
