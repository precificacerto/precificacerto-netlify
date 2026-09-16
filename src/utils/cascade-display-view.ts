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
  const doTrace = (steps: CascadeStep[]): CascadeViewRow[] => {
    const out: CascadeViewRow[] = []
    for (const step of steps) {
      out.push({
        numero: Number(step.step),
        label: step.label ?? '',
        base: step.base ?? null,
        pct: step.rate ?? null,
        valor: Number(step.amount) || 0,
        isSubtotal: false,
        isChild: false,
        isDerivedAverage: false,
        peso: step.peso ?? null,
        effectiveRatePct: step.effective_rate_pct ?? null,
        formula: step.formula ?? '',
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
          key: `t-${step.step}-c-${out.length}-${child.source}`,
        })
      }
    }
    return out
  }

  if (!decomposition || decomposition.rows.length === 0) return doTrace(trace)

  const construcao = trace.filter((s) => Number(s.step) <= ULTIMA_ETAPA_DA_CONSTRUCAO)

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
      key: 'd-lucro-da-venda',
    })
  }

  return [...doTrace(construcao), ...decomposta]
}
