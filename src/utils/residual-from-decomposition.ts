/**
 * residual-from-decomposition.ts — OS CARDS LEEM A DECOMPOSIÇÃO.
 *
 * >>> O DEFEITO, MEDIDO NA TELA PELO DONO DO PRODUTO <<<
 *
 *   cards:      Comissão R$ 2.117,59 (6,188%) · Lucro R$ 4.235,18 (12,377%)
 *   cadastrado: 5,00% e 10,00%
 *   construção: R$ 1.837,88 e R$ 3.675,77            divergência: R$ 279,71
 *
 * "Os cards leem a Etapa 16 do cascade_trace — você mediu isso e está certo. Mas a Etapa 16
 *  do motor é calculada com a RECEITA LÍQUIDA da cascata antiga, não com a decomposição
 *  corrigida. Ou seja: os cards e a decomposição agora são DUAS FONTES, e divergem."
 *
 * >>> POR QUE ISTO NÃO CONTRADIZ O BUG-CARDS-RRO-001 <<<
 *
 * Aquela regra dizia "a Etapa 16 é a FONTE DE VERDADE ABSOLUTA de Comissão e Lucro", e ela
 * estava CERTA PARA A ÉPOCA (`.claude/rules/decisao-sob-regra-da-epoca.md`): o que ela
 * proibia era o card RECALCULAR por conta própria, e naquele momento a Etapa 16 era a única
 * apuração do RRO que existia. A decomposição não existia. Hoje existe, e ela corrige três
 * coisas que a Etapa 16 não corrige — a ordem das deduções da R19, o CMV do item e a escala
 * do PIS/COFINS. O princípio é o mesmo, com outra fonte: o card continua NÃO calculando.
 *
 * >>> UMA FONTE, NÃO DUAS CONFERIDAS <<<
 * `.claude/rules/copia-divergente.md`: "o remédio não é conferir as duas, é apagar uma".
 * Por isso a substituição é do VALOR e dos DOIS percentuais — deixar o percentual vindo da
 * Etapa 16 e o valor da decomposição devolveria um par que nenhum dos dois lados produziu.
 */

import type { DecompositionResult } from './decomposition-dre'
import type { ResidualDistribution, ResidualLine } from './residual-distribution'

/** O rótulo da base dos percentuais efetivos, quando eles vêm da decomposição. */
export const BASE_DOS_PERCENTUAIS_DA_DECOMPOSICAO = 'a receita de produtos'

/**
 * A nota de rodapé do bloco quando os cards leem a decomposição.
 *
 * Ela NOMEIA A BASE, e é por isso que substituir a fonte obriga a substituir a nota: a de
 * sempre fala da Âncora Gerencial, que é a base da Etapa 16 e não a destes números. Deixá-la
 * seria exibir uma legenda que o número não usou.
 */
export const NOTA_DA_DECOMPOSICAO =
  'Percentuais calculados sobre a RECEITA DE PRODUTOS — a mesma base dos percentuais cadastrados, e a única em que a diferença entre o original e o apurado é a corrosão do desconto. Itens manuais e acréscimos saem inteiros (R14) e não entram no denominador. Comissão, lucro, IRPJ e CSLL são a repartição proporcional do Resultado Residual Operacional (R20).'

/** As quatro linhas do RRO, e a chave de cada uma na decomposição. */
const CHAVE_DA_LINHA = {
  commission: 'comissao',
  profit: 'lucro',
  irpj: 'irpj',
  csll: 'csll',
} as const

type Rubrica = keyof typeof CHAVE_DA_LINHA

/**
 * Substitui as quatro rubricas do RRO pelo que a decomposição apurou.
 *
 * Devolve a distribuição INTACTA quando não há decomposição utilizável — é o caminho de
 * pedido e venda, que ainda não a montam, e o de um documento sem produto. Melhor a Etapa 16
 * que card nenhum, e a condição é explícita para não ser lida como "sempre as duas".
 */
export function applyDecompositionToResidual(
  distribution: ResidualDistribution,
  decomposition: DecompositionResult | null | undefined,
): ResidualDistribution {
  if (!decomposition || decomposition.rows.length === 0) return distribution
  const cadastrado = decomposition.rroCadastrado
  if (!cadastrado) return distribution

  const linhaDe = (rubrica: Rubrica): ResidualLine | null => {
    const row = decomposition.rows.find((r) => r.key === CHAVE_DA_LINHA[rubrica])
    if (!row || row.pctSobreTotalGeral == null) return null
    return {
      // As linhas do RRO saem POSITIVAS do DRE (são repartição, não dedução); o `Math.abs`
      // é defesa de contrato, não conversão de sinal.
      amount: Math.abs(row.total),
      // O % ORIGINAL é o CADASTRADO — o que o usuário digitou —, e é contra ele que o
      // apurado se compara. Base 100, como todo `ResidualLine`.
      originalPct: cadastradoDe(rubrica) * 100,
      // O APURADO sobre a RECEITA DE PRODUTOS: a mesma base do cadastrado, e a única em que
      // a diferença entre os dois é a corrosão do desconto. Sobre a receita após desconto o
      // número já sai abaixo do cadastrado COM DESCONTO ZERO, porque ela inclui repasse —
      // medido e registrado em `hipotese-derrubada-pela-propria-medicao.md`, aparição 4.
      effectivePct: row.pctSobreTotalGeral * 100,
      baseLabel: BASE_DOS_PERCENTUAIS_DA_DECOMPOSICAO,
    }
  }

  function cadastradoDe(rubrica: Rubrica): number {
    const c = cadastrado!
    return rubrica === 'commission' ? c.comissaoPct
      : rubrica === 'profit' ? c.lucroPct
        : rubrica === 'irpj' ? c.irpjPct
          : c.csllPct
  }

  const commission = linhaDe('commission')
  const profit = linhaDe('profit')
  const irpj = linhaDe('irpj')
  const csll = linhaDe('csll')
  // Tudo ou nada: com uma rubrica faltando, o bloco voltaria a ser duas fontes misturadas —
  // três cards da decomposição e um da Etapa 16, sem nada na tela dizendo qual é qual.
  if (!commission || !profit || !irpj || !csll) return distribution

  const totalRro = commission.amount + profit.amount + irpj.amount + csll.amount
  return {
    ...distribution,
    commission,
    profit,
    irpj,
    csll,
    total: {
      amount: totalRro,
      originalPct: commission.originalPct + profit.originalPct + irpj.originalPct + csll.originalPct,
      effectivePct: commission.effectivePct + profit.effectivePct + irpj.effectivePct + csll.effectivePct,
      baseLabel: BASE_DOS_PERCENTUAIS_DA_DECOMPOSICAO,
    },
  }
}
