/**
 * impacto-do-credito.ts — quem sente quando uma bandeira de crédito muda.
 *
 * Mudar um botão muda `cost_net`, e `cost_net` é o NUMERADOR da precificação. O preço
 * sugerido de todo produto e serviço que usa o item muda junto — e é por isso que a mudança
 * não pode ser silenciosa.
 *
 * >>> NADA É REGRAVADO <<<
 * Este módulo CALCULA e não escreve. Salvar o item muda o item, e só ele. Os produtos já
 * precificados mantêm o custo congelado até alguém os remargear, que é a regra de
 * `fato-vs-referencia.md`: o preço formado é memória de um cálculo que aconteceu, e
 * reescrevê-lo em massa por causa de uma mudança de hoje reescreve o passado.
 */

export interface UsoDoItem {
  id: string
  nome: string
  tipo: 'PRODUTO' | 'SERVICO'
  /** Quantidade do item na composição do produto/serviço. */
  quantidade: number
  /** CMV total do produto, como está GRAVADO. */
  custoTotalAtual: number
  /** Preço de venda atual, como está GRAVADO. */
  precoAtual: number
}

export interface ImpactoDoItem extends UsoDoItem {
  /** `custoTotalAtual` com a parcela deste item substituída pela nova. */
  custoTotalNovo: number
  /**
   * O preço que a construção daria com o custo novo. `null` quando não é apurável — e
   * `null` não é zero: é "não dá para dizer", e a tela exibe travessão.
   */
  precoNovo: number | null
  /** `precoNovo − precoAtual`. `null` junto com `precoNovo`. */
  variacao: number | null
}

/**
 * O preço novo sai de PROPORCIONALIDADE, e isso não é inferir parâmetro da construção.
 *
 * A construção é `P = Custo ÷ MC`. Quando só o custo se move — e aqui só ele se move, porque
 * nenhum percentual foi tocado — a MC é a MESMA, e `P_novo = P_atual × (Custo_novo ÷
 * Custo_atual)` é a própria identidade da construção, não uma dedução sobre ela.
 *
 * Com `custoTotalAtual = 0` a razão não existe. Devolver zero ali afirmaria um preço; o
 * `null` diz que não há como dizer, que é a verdade (`ausente-vs-falso.md`).
 */
export function calcularImpactoDoCredito(args: {
  /** `cost_net` do item ANTES da mudança. */
  custoLiquidoAntes: number
  /** `cost_net` do item DEPOIS. */
  custoLiquidoDepois: number
  usos: UsoDoItem[]
}): ImpactoDoItem[] {
  const delta = Number(args.custoLiquidoDepois) - Number(args.custoLiquidoAntes)

  return args.usos.map((u) => {
    const custoTotalNovo = Number(u.custoTotalAtual) + delta * Number(u.quantidade || 0)
    const base = Number(u.custoTotalAtual)
    const apuravel = Number.isFinite(base) && base > 0 && Number.isFinite(u.precoAtual)
    const precoNovo = apuravel ? u.precoAtual * (custoTotalNovo / base) : null
    return {
      ...u,
      custoTotalNovo,
      precoNovo,
      variacao: precoNovo == null ? null : precoNovo - u.precoAtual,
    }
  })
}

/**
 * A mudança de crédito aconteceu? Compara o que estava gravado com o que vai ser gravado.
 *
 * Compara `true`/`false`/`null` SEM achatar: sair de `null` para `true` É mudança — o
 * usuário decidiu o que antes era padrão —, e `Boolean(null) === Boolean(false)` esconderia
 * metade dos casos.
 */
export function houveMudancaDeCredito(
  antes: Record<string, boolean | null | undefined> | null | undefined,
  depois: Record<string, boolean | null | undefined> | null | undefined,
): boolean {
  const campos = [
    'icms_credit_enabled', 'pis_cofins_credit_enabled', 'ipi_credit_enabled',
    'cbs_credit_enabled', 'ibs_credit_enabled',
  ]
  const norm = (v: unknown) => (v === true ? 'true' : v === false ? 'false' : 'null')
  return campos.some((c) => norm(antes?.[c]) !== norm(depois?.[c]))
}
