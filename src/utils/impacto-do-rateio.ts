/**
 * impacto-do-rateio.ts — quem sente quando a BASE do rateio de despesa fixa muda.
 *
 * Comando do PO de 21/09/2026, §9:
 *
 *   > Mudar a base do rateio muda o percentual de despesa fixa e, portanto, o preço sugerido
 *   > de todos os produtos. Regras: **nada é regravado em massa**; ao recalcular a
 *   > configuração de despesas, mostrar "% antes × % depois" e a lista de produtos afetados
 *   > com preço atual × recalculado; o que já foi precificado mantém o custo e o percentual
 *   > congelados até ser remargeado.
 *
 * >>> ESTE MÓDULO CALCULA E NÃO ESCREVE <<<
 *
 * É a mesma disciplina de `impacto-do-credito.ts`, e a razão é `fato-vs-referencia.md`: o
 * preço formado é memória de um cálculo que aconteceu. Regravá-lo em massa porque o
 * percentual de hoje é outro reescreve o passado, e o usuário perde a chance de decidir
 * produto a produto.
 */

export interface ProdutoAfetado {
  id: string
  nome: string
  /** `products.cost_total`, como está GRAVADO. */
  custoAtual: number
  /** `products.sale_price`, como está GRAVADO. */
  precoAtual: number
}

export interface ImpactoDoRateio extends ProdutoAfetado {
  /**
   * A margem de contribuição que o preço gravado REVELA — `custo ÷ preço`.
   *
   * `null` quando não é apurável (preço ou custo não positivos). Não é zero: zero seria uma
   * MC de 0%, que significa preço infinito (`ausente-vs-falso.md`).
   */
  mcAtual: number | null
  /** `mcAtual − Δ`, onde Δ é a variação do percentual em decimal. `null` junto com `mcAtual`. */
  mcNova: number | null
  /** `custo ÷ mcNova`. `null` quando a MC nova é zero ou negativa — não há preço ali. */
  precoNovo: number | null
  /** `precoNovo − precoAtual`. */
  variacao: number | null
}

/**
 * O preço novo sai de `P = Custo ÷ MC`, que é a construção (R7), e não uma dedução sobre ela.
 *
 * A MC atual é LIDA do par (custo, preço) do próprio produto — os dois gravados, os dois
 * fatos. Quando só o percentual de despesa fixa se move, a MC nova é `MC − Δ`, e o preço sai
 * da mesma identidade.
 *
 * >>> A RESSALVA, E ELA VALE PARA O NÚMERO INTEIRO <<<
 *
 * Em Lucro Real com operação POR FORA, o percentual entra no coeficiente EFETIVADO
 * (`% Efetivada = % Original ÷ (1 − c)`, R5), e aí a MC não anda exatamente Δ: anda
 * `Δ ÷ (1 − c)`. Este número é uma ESTIMATIVA para o usuário escolher o que remargear, e é
 * por isso que ele não é gravado em lugar nenhum. Quem remargeia roda a construção de
 * verdade.
 */
export function calcularImpactoDoRateio(args: {
  /** O percentual de despesa fixa ANTES, em PERCENTUAL (22,00 e não 0,22). */
  pctAntes: number
  /** O percentual DEPOIS, em PERCENTUAL. */
  pctDepois: number
  produtos: ProdutoAfetado[]
}): ImpactoDoRateio[] {
  const delta = (Number(args.pctDepois) - Number(args.pctAntes)) / 100

  return args.produtos.map((p) => {
    const custo = Number(p.custoAtual)
    const preco = Number(p.precoAtual)
    const apuravel = Number.isFinite(custo) && custo > 0 && Number.isFinite(preco) && preco > 0
    const mcAtual = apuravel ? custo / preco : null
    const mcNova = mcAtual == null ? null : mcAtual - delta
    const precoNovo = mcNova == null || mcNova <= 0 ? null : custo / mcNova
    return {
      ...p,
      mcAtual,
      mcNova,
      precoNovo,
      variacao: precoNovo == null ? null : precoNovo - preco,
    }
  })
}

/**
 * O percentual mudou o bastante para valer o aviso?
 *
 * O limiar é o CENTÉSIMO, que é a casa em que `tenant_expense_config` guarda o número: uma
 * diferença menor que isso não existe no dado, e avisar sobre ela treinaria o usuário a
 * ignorar o aviso.
 */
export function houveMudancaDoPercentual(antes: number | null | undefined, depois: number | null | undefined): boolean {
  // >>> `== null` ANTES do `Number()` <<<
  // `Number(null)` é ZERO, e zero é finito: sem esta linha, um percentual AUSENTE viraria
  // "era zero e agora é 24,50" e dispararia um aviso sobre uma mudança que ninguém fez.
  // `ausente-vs-falso.md`, e foi um caso deste arquivo que apontou.
  if (antes == null || depois == null) return false
  const a = Number(antes)
  const d = Number(depois)
  if (!Number.isFinite(a) || !Number.isFinite(d)) return false
  return Math.abs(d - a) >= 0.005
}
