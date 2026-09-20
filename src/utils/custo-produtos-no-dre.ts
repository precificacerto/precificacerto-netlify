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
  creditos: {
    key: 'CUSTO_PRODUTOS_CREDITOS',
    label: '(−) Créditos recuperáveis sobre compras',
    ordem: 9_998,
  },
  liquido: {
    key: 'CUSTO_PRODUTOS_LIQUIDO',
    label: '= Custo dos produtos líquido',
    ordem: 9_999,
  },
} as const

/** A ordem de exibição de uma categoria do bloco, ou `null` quando ela não é do bloco. */
export function ordemDaLinhaDeApresentacao(categoryKey: string): number | null {
  for (const l of Object.values(LINHAS_DE_APRESENTACAO_DO_CUSTO)) {
    if (l.key === categoryKey) return l.ordem
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
    creditoRecuperavel: credito,
  }
}
