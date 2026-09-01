/**
 * expense-destination.ts — para CADA ITEM, o destino de cada categoria de despesa:
 * CUSTO ou MARGEM DE CONTRIBUIÇÃO. Nunca os dois.
 *
 * PRINCÍPIO (regra canônica do dono do produto):
 *   O destino NÃO é propriedade da categoria — é propriedade da CONSTRUÇÃO daquele item.
 *   A mesma categoria (MO Produtiva, MO Indireta, Despesa Fixa) pode ser custo num item e
 *   margem noutro, DENTRO DO MESMO ORÇAMENTO.
 *
 * COROLÁRIO: a cascata não pode decidir o destino olhando o nome da categoria nem a
 * segmentação do tenant — tem que ler a construção de cada item. É por isso que este
 * módulo recebe o ITEM, e usa a segmentação do tenant apenas na exceção declarada abaixo.
 *
 * TABELA DE DESTINOS
 * ┌──────────────────────┬───────────────────┬──────────────────────┬─────────────────────┐
 * │ Categoria            │ Industrialização  │ Revenda              │ Prestação de Serviço│
 * ├──────────────────────┼───────────────────┼──────────────────────┼─────────────────────┤
 * │ Custo do item        │ CUSTO             │ CUSTO                │ CUSTO               │
 * │ MO Produtiva         │ CUSTO (por tempo) │ MC (c/ Indireta)     │ CUSTO (por tempo)   │
 * │ MO Indireta          │ MC                │ MC (c/ Produtiva)    │ CUSTO               │
 * │ Despesa Fixa         │ MC                │ MC                   │ CUSTO               │
 * │ Despesa Variável     │ MC                │ MC                   │ MC                  │
 * │ Despesa Financeira   │ MC                │ MC                   │ MC                  │
 * │ Impostos / RT        │ MC                │ MC                   │ MC                  │
 * │ Comissão / Lucro     │ MC                │ MC                   │ MC                  │
 * └──────────────────────┴───────────────────┴──────────────────────┴─────────────────────┘
 *
 * EXCEÇÃO DECLARADA: em tenant de segmentação SERVIÇO, produto de REVENDA não recebe MO
 * Administrativa nem Despesa Fixa — as duas já estão dentro do custo por minuto da
 * prestação de serviço. Cobrá-las de novo no produto é dupla contagem.
 *
 * ESCOPO deste módulo: os QUATRO baldes de despesa operacional (DOP) que a Etapa 5
 * consolida — MO Administrativa (= MO Indireta), Despesa Fixa, Despesa Variável e Despesa
 * Financeira. MO Produtiva e Custo do item não passam por aqui: eles já entram pela Etapa 4
 * (CMV), que não é o objeto desta correção.
 *
 * O QUE ISTO NÃO FAZ: não toca a fórmula do RRO, a redistribuição por pesos estruturais, o
 * tratamento de Operação Externa, nem as regras de regime (MEI zera imposto por item;
 * Simples puxa do onboarding com edição manual).
 */

/** Destino de uma categoria PARA UM ITEM. */
export type ExpenseDestination = 'CUSTO' | 'MARGEM'

/**
 * Construção do item — a coluna da tabela de destinos.
 *
 * Não é o segmento do tenant: um tenant de serviço vende produto de revenda, e cada um dos
 * dois itens tem a sua própria construção dentro do mesmo orçamento.
 */
export type ItemConstruction = 'INDUSTRIALIZACAO' | 'REVENDA' | 'SERVICO'

/** Os quatro baldes que a Etapa 5 consolida. */
export interface DopDestinations {
  /** MO Administrativa / MO Indireta. */
  mo_admin: ExpenseDestination
  fixa: ExpenseDestination
  variavel: ExpenseDestination
  financeira: ExpenseDestination
}

export interface DopComponents {
  mo_admin: number
  fixa: number
  variavel: number
  financeira: number
}

export interface ItemConstructionInput {
  /** Item de serviço (`budget_items.service_id` / `sale_items.service_id`). */
  service_id?: string | null
  /** `products.product_type` — 'PRODUZIDO' ⇒ industrialização; 'REVENDA' ⇒ revenda. */
  product_type?: string | null
}

/**
 * Construção do item, na ordem em que o dado é confiável.
 *
 * Item com `service_id` é prestação de serviço — nenhum outro campo pode contradizer isso.
 * Sem `service_id`, `product_type = 'PRODUZIDO'` é industrialização.
 *
 * DEFAULT REVENDA (e não industrialização) quando o tipo não chegou: entre as duas colunas,
 * os quatro baldes têm destinos IDÊNTICOS, então a escolha só é observável dentro da exceção
 * do tenant SERVIÇO — e ali o comportamento seguro é aplicar a exceção, não escapar dela.
 */
export function resolveItemConstruction(item: ItemConstructionInput): ItemConstruction {
  if (item.service_id) return 'SERVICO'
  const t = String(item.product_type ?? '').trim().toUpperCase()
  if (t === 'PRODUZIDO') return 'INDUSTRIALIZACAO'
  return 'REVENDA'
}

/**
 * Destino dos quatro baldes de DOP para um item.
 *
 * @param construction construção do item (não do tenant)
 * @param tenantCalcType segmentação do tenant (`tenant_settings.calc_type`) — usada
 *        EXCLUSIVAMENTE na exceção declarada do produto de revenda em tenant SERVIÇO.
 */
export function resolveDopDestinations(
  construction: ItemConstruction,
  tenantCalcType?: string | null,
): DopDestinations {
  // Variável e financeira são MC nas três construções, sem exceção.
  const base = { variavel: 'MARGEM', financeira: 'MARGEM' } as const

  if (construction === 'SERVICO') {
    // O custo por minuto da prestação já embute MO administrativa e despesas fixas
    // (ver `compute-service-price.ts`): repeti-las na MC é contar duas vezes.
    return { mo_admin: 'CUSTO', fixa: 'CUSTO', ...base }
  }

  const tenantIsServico = String(tenantCalcType ?? '').trim().toUpperCase() === 'SERVICO'
  if (construction === 'REVENDA' && tenantIsServico) {
    // Exceção declarada: mesma razão do serviço — as duas categorias já estão no custo por
    // minuto da prestação, que é como este tenant forma preço.
    return { mo_admin: 'CUSTO', fixa: 'CUSTO', ...base }
  }

  return { mo_admin: 'MARGEM', fixa: 'MARGEM', ...base }
}

/**
 * Zera os baldes cujo destino é CUSTO.
 *
 * "Contribui com ZERO para aquela linha da MC" é literal: não é o percentual médio, não é o
 * percentual do tenant — é zero. É isto que faz a Etapa 5 ser uma SOMA DE VALORES POR ITEM
 * (cada item já respeitando o seu destino) em vez de uma alíquota única sobre a base
 * consolidada, que trataria itens de construções diferentes como se fossem iguais.
 */
export function applyDopDestinations(
  components: DopComponents,
  destinations: DopDestinations,
): DopComponents {
  return {
    mo_admin: destinations.mo_admin === 'CUSTO' ? 0 : components.mo_admin,
    fixa: destinations.fixa === 'CUSTO' ? 0 : components.fixa,
    variavel: destinations.variavel === 'CUSTO' ? 0 : components.variavel,
    financeira: destinations.financeira === 'CUSTO' ? 0 : components.financeira,
  }
}

/** Atalho: resolve a construção, resolve os destinos e aplica, em uma chamada. */
export function resolveItemDopComponents(args: {
  item: ItemConstructionInput
  components: DopComponents
  tenantCalcType?: string | null
}): { components: DopComponents; construction: ItemConstruction; destinations: DopDestinations } {
  const construction = resolveItemConstruction(args.item)
  const destinations = resolveDopDestinations(construction, args.tenantCalcType)
  return {
    components: applyDopDestinations(args.components, destinations),
    construction,
    destinations,
  }
}

/** Soma dos quatro baldes — o `dop_pct` do item depois de aplicados os destinos. */
export function sumDopComponents(c: DopComponents): number {
  return c.mo_admin + c.fixa + c.variavel + c.financeira
}
