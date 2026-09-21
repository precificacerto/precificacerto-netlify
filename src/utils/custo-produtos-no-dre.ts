/**
 * custo-produtos-no-dre.ts — o bloco CUSTO DOS PRODUTOS da Análise Financeira.
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > Hoje o DRE é por caixa e registra as guias pagas (que já são débito − crédito); por
 *   > isso o custo bruto NÃO duplica imposto. Nesta etapa NÃO mude a base de cálculo do
 *   > resultado. Mude só a apresentação.
 *
 * >>> A RESTRIÇÃO QUE GOVERNA ESTE ARQUIVO INTEIRO <<<
 *
 * O bloco tem três linhas:
 *
 *     Custo dos produtos (bruto)              ....
 *     (−) Créditos recuperáveis sobre compras ....
 *     = Custo dos produtos líquido            ....
 *
 * e **só a primeira entra no resultado do mês**. As outras duas são APRESENTAÇÃO.
 *
 * A razão não é de layout, é de conta: o crédito da compra JÁ está no caixa, porque a guia
 * paga no mês é `débito − crédito`. Deduzi-lo outra vez aqui o contaria DUAS VEZES, e o lucro
 * do mês subiria por um crédito que já tinha sido aproveitado. É por isso que
 * `apenasApresentacao` existe como campo e não como convenção: quem somar as linhas sem
 * olhá-lo produz um resultado errado, e o erro fecha consigo mesmo.
 *
 * >>> POR QUE ESTE MÓDULO EXISTE <<<
 *
 * A mesma regra estava escrita DUAS VEZES — em `hub-engine.ts` e em `pages/dre/[year].tsx`,
 * cada uma somando os seis `valor_*` à mão e montando a linha "Impostos Recuperáveis sobre
 * Compras" do seu jeito. É `copia-divergente.md` literal, e o remédio dela não é conferir as
 * duas: é apagar uma. Acrescentar um tributo ao crédito passa a valer para as duas leituras.
 */

/** Os seis tributos que a entrada de caixa pode trazer abertos. */
export interface TributosDaCompra {
  icms?: number | null
  pis?: number | null
  cofins?: number | null
  ipi?: number | null
  cbs?: number | null
  ibs?: number | null
}

export type RegimeDoBloco = string | null | undefined

/**
 * Quais tributos entram na DEDUÇÃO, por regime.
 *
 * No Simples e no MEI o bloco não aparece: o imposto da compra está dentro do DAS do
 * fornecedor e não há crédito a recuperar. No Híbrido só CBS e IBS são apurados pelo regime
 * regular — ICMS, PIS/COFINS e IPI seguem no DAS e COMPÕEM O CUSTO, então ficam de fora da
 * dedução mesmo quando a entrada de caixa os traz preenchidos.
 *
 * Ler o `valor_icms` de uma entrada do Híbrido e deduzi-lo seria a decomposição inferindo o
 * formato em vez de lê-lo — `regime-e-segmento-determinam-a-construcao.md`, no DRE.
 */
export function tributosCreditaveisDoRegime(regime: RegimeDoBloco): (keyof TributosDaCompra)[] {
  const r = String(regime ?? '').trim().toUpperCase()
  if (r === 'SIMPLES_NACIONAL' || r === 'MEI') return []
  if (r === 'SIMPLES_HIBRIDO') return ['cbs', 'ibs']
  return ['icms', 'pis', 'cofins', 'ipi', 'cbs', 'ibs']
}

/** O bloco aparece? Em Simples e MEI, não. */
export function blocoDeCreditoVisivel(regime: RegimeDoBloco): boolean {
  return tributosCreditaveisDoRegime(regime).length > 0
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * O CRÉDITO RECUPERÁVEL de uma entrada de caixa de CUSTO_PRODUTOS.
 *
 * Zero quando o regime não credita — e zero aqui é apurado, não ausente: o regime foi lido e
 * a resposta é que nada daquela compra credita.
 */
export function creditoRecuperavelDaCompra(
  tributos: TributosDaCompra | null | undefined,
  regime: RegimeDoBloco,
): number {
  if (!tributos) return 0
  return tributosCreditaveisDoRegime(regime).reduce((acc, k) => acc + num(tributos[k]), 0)
}

/**
 * A entrada TEM breakdown de tributos?
 *
 * `null` em todos os seis é "não informado" e mantém a entrada fora do bloco — ela entra
 * como custo cheio, que é o que ela é. Um zero EXPLÍCITO em qualquer um já conta como
 * breakdown, porque alguém afirmou que aquele tributo deu zero.
 */
export function temBreakdownDeCompra(tributos: TributosDaCompra | null | undefined): boolean {
  if (!tributos) return false
  return (['icms', 'pis', 'cofins', 'ipi', 'cbs', 'ibs'] as const)
    .some((k) => tributos[k] != null)
}

/**
 * As DUAS LINHAS DE APRESENTAÇÃO do bloco, com a chave e o rótulo que as duas leituras usam.
 *
 * Elas estão aqui, e não escritas em cada tela, porque era exatamente assim que a divergência
 * nascia: a mesma linha com um nome no Hub e outro no DRE do ano. `copia-divergente.md`.
 *
 * `ordem` põe as duas DEPOIS das categorias reais do grupo — o bloco só se lê de cima para
 * baixo se o bruto vier antes da dedução e o líquido por último.
 */
export const LINHAS_DE_APRESENTACAO_DO_CUSTO = {
  bruto: {
    key: 'CUSTO_PRODUTOS_BRUTO',
    label: 'Custo bruto',
    ordem: 9_990,
  },
  creditos: {
    key: 'CUSTO_PRODUTOS_CREDITOS',
    label: '(−) Créditos recuperáveis sobre compras',
    ordem: 9_991,
  },
  liquido: {
    key: 'CUSTO_PRODUTOS_LIQUIDO',
    label: '= Custo dos produtos líquido',
    // >>> A MENOR ORDEM DO BLOCO — ele é a CABEÇA, não o rodapé <<<
    // Comando do PO de 21/09/2026, §2: *"quem usa o cabeçalho para conferir preço usa o
    // número errado: o que forma preço é o líquido"*. Na leitura do ano não há linha de
    // cabeçalho de grupo, então a inversão é a ORDEM: o líquido vem primeiro e as parcelas
    // que o explicam vêm abaixo.
    ordem: 9_989,
  },
} as const

/**
 * O DETALHE POR TRIBUTO da linha de créditos — a pendência que o #68 deixou aberta.
 *
 * Cada uma é uma sub-linha de apresentação, NEGATIVA como a linha-mãe, e nenhuma entra em
 * soma: elas decompõem um número que já está na linha acima, que por sua vez decompõe um que
 * já está no cabeçalho. Somar qualquer uma delas conta o mesmo crédito três vezes.
 *
 * A ordem segue a da apuração, e os `key`s existem para que as duas leituras (Hub e ano)
 * nomeiem a MESMA linha — foi a divergência de nome que criou este módulo.
 */
export const DETALHE_DO_CREDITO_POR_TRIBUTO = {
  icms:      { key: 'CUSTO_PRODUTOS_CRED_ICMS',       label: 'ICMS',       ordem: 9_992, campos: ['icms'] },
  pisCofins: { key: 'CUSTO_PRODUTOS_CRED_PIS_COFINS', label: 'PIS/COFINS', ordem: 9_993, campos: ['pis', 'cofins'] },
  ipi:       { key: 'CUSTO_PRODUTOS_CRED_IPI',        label: 'IPI',        ordem: 9_994, campos: ['ipi'] },
  cbs:       { key: 'CUSTO_PRODUTOS_CRED_CBS',        label: 'CBS',        ordem: 9_995, campos: ['cbs'] },
  ibs:       { key: 'CUSTO_PRODUTOS_CRED_IBS',        label: 'IBS',        ordem: 9_996, campos: ['ibs'] },
} as const

/**
 * O crédito de cada tributo, separado, para as sub-linhas.
 *
 * >>> ELE OBEDECE AO REGIME, E ISSO NÃO É DETALHE <<<
 * No Simples Híbrido `tributosCreditaveisDoRegime` devolve só CBS e IBS. Uma sub-linha de
 * ICMS com valor ali afirmaria um crédito que o regime não dá — a decomposição INFERINDO o
 * formato em vez de lê-lo (`regime-e-segmento-determinam-a-construcao.md`).
 *
 * Tributo cujo crédito é ZERO **não devolve linha**: uma linha "IPI R$ 0,00" afirma que houve
 * IPI e ele deu zero (`ausente-vs-falso.md`).
 */
export function detalheDoCreditoPorTributo(
  tributos: TributosDaCompra | null | undefined,
  regime: RegimeDoBloco,
): { key: string; label: string; ordem: number; valor: number }[] {
  if (!tributos) return []
  const permitidos = new Set(tributosCreditaveisDoRegime(regime))
  const linhas: { key: string; label: string; ordem: number; valor: number }[] = []

  for (const d of Object.values(DETALHE_DO_CREDITO_POR_TRIBUTO)) {
    const valor = d.campos
      .filter((c) => permitidos.has(c as keyof TributosDaCompra))
      .reduce((acc, c) => acc + num(tributos[c as keyof TributosDaCompra]), 0)
    if (valor === 0) continue
    linhas.push({ key: d.key, label: d.label, ordem: d.ordem, valor })
  }
  return linhas
}

/** A ordem de exibição de uma categoria do bloco, ou `null` quando ela não é do bloco. */
export function ordemDaLinhaDeApresentacao(categoryKey: string): number | null {
  for (const l of Object.values(LINHAS_DE_APRESENTACAO_DO_CUSTO)) {
    if (l.key === categoryKey) return l.ordem
  }
  for (const d of Object.values(DETALHE_DO_CREDITO_POR_TRIBUTO)) {
    if (d.key === categoryKey) return d.ordem
  }
  return null
}

/** A categoria é uma das duas linhas de apresentação? */
export function ehLinhaDeApresentacao(categoryKey: string): boolean {
  return ordemDaLinhaDeApresentacao(categoryKey) != null
}

export interface LinhaDoBlocoDeCusto {
  key: 'custo_bruto' | 'creditos_recuperaveis' | 'custo_liquido'
  label: string
  valor: number
  /**
   * `true` = a linha NÃO entra no total do grupo nem no resultado do mês.
   *
   * É o campo que impede a dupla contagem descrita no cabeçalho. Quem montar o total somando
   * as linhas precisa filtrar por ele — e há caso afirmando que o total não muda.
   */
  apenasApresentacao: boolean
}

export interface BlocoDeCustoDosProdutos {
  /** As três linhas, na ordem do DRE. Vazio quando o bloco não se aplica. */
  linhas: LinhaDoBlocoDeCusto[]
  /** O que de fato entra no resultado: SEMPRE o bruto pago. Não muda com esta etapa. */
  totalNoResultado: number
  /**
   * O que o CABEÇALHO exibe: o LÍQUIDO quando há crédito, o bruto quando não há.
   *
   * >>> ELE É DIFERENTE DE `totalNoResultado`, E É ESSA A ENTREGA DO §2 <<<
   *
   * O cabeçalho responde *"quanto este custo pesa no preço?"* e a resposta é o líquido: o
   * crédito volta para a empresa. O resultado do mês responde *"quanto saiu do caixa?"* e a
   * resposta é o bruto, porque a guia paga já é `débito − crédito` e deduzir outra vez
   * contaria o mesmo crédito duas vezes.
   *
   * As duas perguntas têm respostas diferentes, e o defeito que o §2 corrige era exibir a
   * segunda no lugar onde se lê a primeira — na De Paula, 51,66% onde o que forma preço é
   * 41,71%.
   */
  totalExibidoNoCabecalho: number
  /** O crédito, separado, para quem quiser exibi-lo sem montar as linhas. */
  creditoRecuperavel: number
}

/**
 * Monta o bloco a partir do que foi PAGO e do crédito daquelas compras.
 *
 * `valorBrutoPago` é a soma dos `amount` das entradas de CUSTO_PRODUTOS do período — o que
 * saiu do caixa. É ele, e só ele, que compõe o resultado.
 */
export function montarBlocoDeCustoDosProdutos(args: {
  valorBrutoPago: number
  creditoRecuperavel: number
  regime: RegimeDoBloco
}): BlocoDeCustoDosProdutos {
  const bruto = num(args.valorBrutoPago)
  const credito = blocoDeCreditoVisivel(args.regime) ? num(args.creditoRecuperavel) : 0

  // Sem crédito a apresentar, o bloco não tem o que decompor: uma linha só, e ela é o total.
  if (credito === 0) {
    return {
      linhas: [{ key: 'custo_bruto', label: 'Custo dos produtos', valor: bruto, apenasApresentacao: false }],
      totalNoResultado: bruto,
      // Sem crédito, as duas perguntas têm a MESMA resposta — e é por isso que o caso que
      // discrimina o cabeçalho precisa de um mês COM crédito.
      totalExibidoNoCabecalho: bruto,
      creditoRecuperavel: 0,
    }
  }

  return {
    linhas: [
      { key: 'custo_bruto', label: 'Custo dos produtos (bruto)', valor: bruto, apenasApresentacao: false },
      {
        key: 'creditos_recuperaveis',
        label: LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.label,
        // NEGATIVO, porque é dedução. A linha antiga era positiva e ficava DENTRO do custo;
        // o sinal é o que transforma "mais uma parcela do custo" em "abatimento dele".
        valor: -credito,
        apenasApresentacao: true,
      },
      {
        key: 'custo_liquido',
        label: LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.label,
        valor: bruto - credito,
        apenasApresentacao: true,
      },
    ],
    totalNoResultado: bruto,
    totalExibidoNoCabecalho: bruto - credito,
    creditoRecuperavel: credito,
  }
}
