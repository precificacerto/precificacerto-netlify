/**
 * cascade-display-view.ts — o que a cascata EXIBE, etapa a etapa.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` R19, e a aba "Orçamento" da planilha, linhas
 * 64 a 88. Cada dedução é uma LINHA PRÓPRIA, com base, percentual e valor visíveis: IBS, CBS,
 * IS e IPI são quatro; ICMS, ISS e PIS/COFINS são três. Agrupá-las esconde exatamente o que a
 * decomposição existe para mostrar.
 *
 * >>> A CASCATA TEM DUAS METADES, E ELAS RESPONDEM PERGUNTAS DIFERENTES <<<
 *
 *   etapas 1 a 11  — a CONSTRUÇÃO: como o preço se formou. Saem do `cascade_trace` do motor,
 *                    com os números que sempre tiveram.
 *   da 12 em diante — a DECOMPOSIÇÃO: como o preço se reparte. Sai de `buildDecomposition`,
 *                    a MESMA que o PDF imprime em colunas.
 *
 >>> TODAS AS LINHAS SÃO NUMERADAS, E A NUMERAÇÃO DA DECOMPOSIÇÃO É DE EXIBIÇÃO <<<
 *
 * Eu argumentei que numerar as linhas da decomposição seria inventar número, e o dono do
 * produto concordou com o argumento — e decidiu o contrário: **numere em sequência**. Fica
 * registrado assim porque a decisão é dele e o argumento era meu; suavizar qualquer um dos
 * dois apagaria por que a escolha foi consciente.
 *
 * A numeração continua depois da última etapa da construção, e é de APRESENTAÇÃO: ela não
 * volta para o `cascade_trace`, não é gravada e não é citável. As citações já escritas — "a
 * Etapa 16 é a fonte de verdade de Comissão e Lucro", em regra, em ADR e em comentário —
 * seguem falando do trace que o MOTOR emite, e ele continua com as 17 etapas, os mesmos
 * números, valores e filhos. Nada em `cascade-trace.ts`, `absorption.ts` ou `motor-rro.ts` é
 * tocado: o que muda é a LEITURA, como no caso da ordem do por fora.
 *
 * >>> UMA FONTE, DOIS FORMATOS <<<
 * A tela lê as mesmas linhas que o PDF imprime em colunas. Duas LEITURAS do mesmo cálculo não
 * são duas contas — e é a segunda conta que `copia-divergente.md` proíbe.
 */

import type { CascadeStep } from '@/types/mrm'
import type { DecompositionResult } from './decomposition-dre'

/** A última etapa da CONSTRUÇÃO. Da seguinte em diante, quem manda é a decomposição. */
export const ULTIMA_ETAPA_DA_CONSTRUCAO = 11

/**
 * As linhas em que o percentual sobre o total geral responde OUTRA pergunta que o `pct`.
 *
 * São as quatro da distribuição do RRO (R20): ali o `pct` é o peso sobre a sobra, e o
 * percentual sobre o total é o que se confere contra o cadastro do produto.
 */
export const LINHAS_COM_DOIS_PERCENTUAIS = new Set(['comissao', 'lucro', 'irpj', 'csll'])

/**
 * A etapa da CONSTRUÇÃO que exibe o BLOCO POR FORA — IBS + CBS + IS + IPI.
 *
 * >>> ELA NÃO LIA TRIBUTO NENHUM, E O NÚMERO QUE EXIBIA ERA DERIVADO POR DIVISÃO <<<
 *
 * O motor a emite como `rb_total × (1 − peso_op_interna)` (`cascade-trace.ts:326`), e o
 * `peso_op_interna` do item é redescoberto por `(sale_price_base − terceirizadas) ÷
 * (unit_price − terceirizadas)` (`legacy-adapter.ts:776`), com FALLBACK `= 1` quando o
 * produto não tem `sale_price_base` gravado. Medido nos dois lados, com o motor real:
 *
 *   produto COM `sale_price_base` e SEM IBS/CBS  → etapa exibia R$ 69,00; apurado R$ 0,00
 *   produto SEM `sale_price_base` e COM IBS/CBS  → etapa exibia R$ 0,00;  apurado > 0
 *
 * É a aparição 2 de `.claude/rules/regime-e-segmento-determinam-a-construcao.md`: a
 * decomposição REDESCOBRE a proporção em vez de LER o que a construção usou. E não é o caso
 * da etapa 17: a Camada 2 (`absorption.ts`) reescreve as etapas 9, 11, 12, 16 e 17 — a 8
 * nunca. Ela não é placeholder; é um número calculado de outra coisa.
 *
 * A correção lê as QUATRO linhas por fora da decomposição, que saem da mesma ficha
 * (`resolveItemFicha`) que a construção usou. O motor não é tocado: os pesos continuam sendo
 * calculados e usados, e o que muda é a LEITURA.
 */
export const ETAPA_DA_OPERACAO_POR_FORA = 8

/** As chaves das linhas da decomposição que compõem o bloco por fora. */
const LINHAS_DO_BLOCO_POR_FORA = new Set([
  'por_fora', 'por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi',
])

/** O bloco por fora apurado, pronto para substituir o número derivado da etapa 8. */
export interface BlocoPorFora {
  /** Σ |IBS| + |CBS| + |IS| + |IPI|, em R$. */
  valor: number
  /** A base das linhas por fora — a receita de produtos. */
  base: number | null
  /** `valor ÷ base`. `null` quando não há base: nunca zero. */
  pct: number | null
  /** O bloco POR PRODUTO, paralelo aos rótulos das colunas. */
  perItem: number[]
}

/**
 * Soma as linhas por fora da decomposição.
 *
 * As linhas saem NEGATIVAS (são deduções do DRE) e o bloco é exibido como VALOR, igual às
 * demais etapas da construção — daí o `Math.abs`. `null` quando a decomposição não tem
 * nenhuma delas, porque bloco ausente é ausência, não R$ 0,00.
 */
export function blocoPorForaDaDecomposicao(decomposition: DecompositionResult): BlocoPorFora | null {
  const linhas = decomposition.rows.filter((r) => LINHAS_DO_BLOCO_POR_FORA.has(r.key))
  if (linhas.length === 0) return null
  const valor = linhas.reduce((s, r) => s + Math.abs(r.total), 0)
  const base = linhas.find((r) => r.base != null)?.base ?? null
  const colunas = linhas.reduce((m, r) => Math.max(m, r.perItem.length), 0)
  const perItem = Array.from({ length: colunas }, (_, k) =>
    linhas.reduce((s, r) => s + Math.abs(r.perItem[k] ?? 0), 0))
  return { valor, base, pct: base != null && base !== 0 ? valor / base : null, perItem }
}

/** Uma linha da cascata, já pronta para a tela. */
export interface CascadeViewRow {
  /** O número exibido. `null` só nos sub-itens indentados da construção. */
  numero: number | null
  label: string
  base: number | null
  /** Fração. `null` = não se aplica, nunca zero. */
  pct: number | null
  valor: number
  /** Agrupamento/subtotal: a tela o destaca. */
  isSubtotal: boolean
  /** Sub-item indentado de uma etapa da construção. */
  isChild: boolean
  /** `true` quando `pct` é média ponderada derivada — a tela rotula "% médio" (6.4). */
  isDerivedAverage: boolean
  /** Peso estrutural, quando a etapa o traz (etapa 10). `null` = não se aplica. */
  peso: number | null
  /** Alíquota EFETIVA do tributo por fora, quando a etapa a traz. `null` = não se aplica. */
  effectiveRatePct: number | null
  /** Tooltip: a fórmula da etapa, quando existe. */
  formula: string
  /**
   * O valor da linha POR PRODUTO, paralelo aos rótulos das colunas.
   *
   * R16 e teste 10 do checklist: cada linha congelada — custos, despesas, acréscimos, itens
   * manuais — é o AGRUPAMENTO dos valores de cada produto, e a coluna Total é a SOMA das
   * colunas, nunca um cálculo próprio. Exibir só o total esconde qual produto carregou o
   * custo, que é a correção inteira da coluna por produto.
   *
   * Vazio nas etapas da CONSTRUÇÃO: o `cascade_trace` é consolidado e não tem abertura por
   * item. Vazio é ausência de dado, e a tela exibe travessão — nunca R$ 0,00.
   */
  perItem: number[]
  /**
   * O percentual da linha sobre o TOTAL GERAL, quando ele responde OUTRA pergunta que o
   * `pct`. `null` quando os dois seriam o mesmo número.
   *
   * É o caso das quatro linhas do RRO: `pct` é o PESO — "quanto desta sobra é comissão",
   * 28,74% — e este é "quanto do PREÇO é comissão", que tem de voltar como os 5% e os 10%
   * CADASTRADOS. Exibir só o peso esconde justamente o número que se confere contra o
   * cadastro; exibir só o percentual esconde a repartição da R20. Os dois, lado a lado.
   */
  pctSobreTotalGeral: number | null
  /** Chave estável para o React. */
  key: string
}

/**
 * Monta a visão completa: construção numerada + decomposição rotulada.
 *
 * Sem `decomposition`, devolve o trace INTEIRO como está hoje — é o caminho de pedido e venda,
 * que ainda não a montam. Melhor a cascata antiga que cascata nenhuma, e a condição é
 * explícita para não ser lida como "as duas coisas sempre".
 */
export function buildCascadeView(
  trace: CascadeStep[],
  decomposition?: DecompositionResult | null,
): CascadeViewRow[] {
  const doTrace = (steps: CascadeStep[], porFora?: BlocoPorFora | null): CascadeViewRow[] => {
    const out: CascadeViewRow[] = []
    for (const step of steps) {
      // A etapa 8 exibe o BLOCO APURADO quando a decomposição existe — ver
      // `ETAPA_DA_OPERACAO_POR_FORA`. Sem decomposição (pedido e venda, que ainda não a
      // montam) fica o número do motor: melhor o derivado que nada.
      const bloco = porFora && Number(step.step) === ETAPA_DA_OPERACAO_POR_FORA ? porFora : null
      out.push({
        numero: Number(step.step),
        label: step.label ?? '',
        base: bloco ? bloco.base : (step.base ?? null),
        pct: bloco ? bloco.pct : (step.rate ?? null),
        valor: bloco ? bloco.valor : (Number(step.amount) || 0),
        isSubtotal: false,
        isChild: false,
        isDerivedAverage: false,
        peso: step.peso ?? null,
        effectiveRatePct: step.effective_rate_pct ?? null,
        formula: bloco
          ? 'IBS + CBS + IS + IPI apurados — lidos da decomposição, não do peso estrutural'
          : (step.formula ?? ''),
        perItem: bloco ? bloco.perItem : [],
        pctSobreTotalGeral: null,
        key: `t-${step.step}-${step.source}-${out.length}`,
      })
      for (const child of step.children ?? []) {
        out.push({
          numero: null,
          label: child.label ?? '',
          base: child.base ?? null,
          // V15.2: as despesas da etapa 10 não exibem percentual nos filhos.
          pct: Number(step.step) === 10 ? null : (child.rate ?? null),
          valor: Number(child.amount) || 0,
          isSubtotal: false,
          isChild: true,
          isDerivedAverage: false,
          peso: child.peso ?? null,
          effectiveRatePct: child.effective_rate_pct ?? null,
          formula: child.formula ?? '',
          perItem: [],
          pctSobreTotalGeral: null,
          key: `t-${step.step}-c-${out.length}-${child.source}`,
        })
      }
    }
    return out
  }

  if (!decomposition || decomposition.rows.length === 0) return doTrace(trace)

  const construcao = trace.filter((s) => Number(s.step) <= ULTIMA_ETAPA_DA_CONSTRUCAO)
  const porFora = blocoPorForaDaDecomposicao(decomposition)

  // A numeração continua de onde a construção parou — sequência de EXIBIÇÃO, não do motor.
  const ultimoNumero = construcao.reduce((m, s) => Math.max(m, Number(s.step) || 0), 0)

  const decomposta: CascadeViewRow[] = decomposition.rows.map((row, i) => ({
    numero: (ultimoNumero + 1 + i) as number | null,
    label: row.label,
    base: row.base,
    pct: row.pct,
    valor: row.total,
    isSubtotal: row.isSubtotal,
    // Tipografia: os tributos saem como SUB-ITEM, em fonte menor, igual aos filhos das
    // etapas da construção. É o que preserva a hierarquia da R19 na leitura.
    isChild: row.isTaxDetail,
    isDerivedAverage: row.isDerivedAverage,
    peso: null as number | null,
    effectiveRatePct: null as number | null,
    formula: '',
    perItem: row.perItem,
    // Só onde os dois números DIVERGEM. Nas demais linhas o `pct` já é o percentual sobre a
    // base delas, e repetir o mesmo número em duas colunas ensina o leitor a ignorar a
    // segunda.
    pctSobreTotalGeral: LINHAS_COM_DOIS_PERCENTUAIS.has(row.key) ? row.pctSobreTotalGeral : null,
    key: `d-${row.key}-${i}`,
  }))

  // LUCRO DA VENDA fecha a lista — e NÃO é linha do DRE: a última linha da tabela é o
  // RESIDUAL (6.4), e esta é a linha 88 da planilha, separada do DRE que termina na 86. Ela
  // entra marcada como subtotal para a tela destacá-la como o fecho que é.
  const lv = decomposition.lucroDaVenda
  if (lv) {
    decomposta.push({
      numero: ultimoNumero + 1 + decomposition.rows.length,
      label: 'LUCRO DA VENDA',
      base: null,
      pct: lv.pctSobreProdutos,
      valor: lv.valor,
      isSubtotal: true,
      isChild: false,
      isDerivedAverage: false,
      peso: null,
      effectiveRatePct: null,
      formula: 'Lucro apurado, e o percentual SOBRE PRODUTOS — o comparável com o cadastrado',
      perItem: lv.perItem ?? [],
      pctSobreTotalGeral: null,
      key: 'd-lucro-da-venda',
    })
  }

  return [...doTrace(construcao, porFora), ...decomposta]
}
