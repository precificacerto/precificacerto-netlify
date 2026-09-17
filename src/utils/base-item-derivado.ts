/**
 * base-item-derivado.ts — `products.base_item_id` sem seletor na tela.
 *
 * Decisão do dono do produto, 17/09/2026, registrada como está:
 *
 *   "Remova o banner e o seletor. Ao salvar um REVENDA com composição de UM item,
 *    derive `base_item_id` desse item — os dois vínculos sobrevivem.
 *    Com dois ou mais itens não há item base a derivar: grave NULL e registre que esse
 *    produto não terá sincronização de estoque pela coluna.
 *    **Não invente um 'primeiro item' como base.**"
 *
 * ── POR QUE A COLUNA NÃO PODE SIMPLESMENTE MORRER ────────────────────────────
 *
 * `base_item_id` é lido em CINCO pontos fora da tela de produto, e dois deles não têm
 * caminho alternativo:
 *
 * | onde | o que faz | tem fallback? |
 * |---|---|---|
 * | `produtos/index.tsx:699` | recálculo de custo do produto de revenda | não |
 * | `itens/index.tsx:578-595` | marca `needs_cost_update` | **sim** — une com `product_items` |
 * | `itens/index.tsx:630-652` | conta os afetados por uma mudança de custo | **sim** — mesma união |
 * | `itens/index.tsx:245` e `:1030-1055` | sincroniza o ESTOQUE do produto com o do item | **NÃO** |
 * | `estoque/index.tsx:324` | quantidade inicial ao criar o estoque | não |
 *
 * ── O SELETOR ERA UM DE DOIS PRODUTORES, E O MINORITÁRIO ─────────────────────
 *
 * `itens/index.tsx:1079` cria o produto AUTOMATICAMENTE ao cadastrar um item do tipo
 * REVENDA, já com `base_item_id`. Essa rota não passa por tela de produto nenhuma e
 * **continua preenchendo a coluna**. Medido: **30 dos 62** produtos com base têm o nome
 * idêntico ao do item base — a assinatura daquela criação.
 *
 * ── A MEDIÇÃO QUE MUDOU A REGRA, 17/09/2026 ──────────────────────────────────
 *
 * Sobre os 77 produtos de revenda:
 *
 * | estado | produtos | o que a derivação faria |
 * |---|---:|---|
 * | com base, **1 item** na composição | **30** | deriva o MESMO valor — sem perda |
 * | com base, **ZERO** itens | **32** | derivaria `null` e **APAGARIA** o vínculo |
 * | com base, 2 ou mais itens | **0** | — |
 * | sem base, 1 item | **5** | **ganham** o vínculo que hoje não têm |
 * | sem base, 2 ou mais | 1 | segue sem |
 * | sem base, sem composição | 9 | segue sem |
 *
 * **O caso que a decisão legislou — "dois ou mais itens" — tem ZERO produtos.** O caso
 * real é "zero itens na composição", e são 32: mais da metade dos que têm base. Aplicar
 * `null` ali não é "gravar NULL num produto novo", é **apagar o vínculo de estoque de 32
 * produtos existentes na primeira vez que alguém abrir e salvar cada um** — em silêncio,
 * porque nada falha quando a coluna esvazia.
 *
 * É `hipotese-derrubada-pela-propria-medicao.md`: a razão para escolher `null` era uma
 * suposição sobre ONDE o vazio acontece, e a medição apontou outro lugar.
 *
 * ── A REGRA, ENTÃO ───────────────────────────────────────────────────────────
 *
 * A derivação só **ESCREVE** quando há exatamente um item. Com zero ou com dois e mais,
 * ela **PRESERVA o que já está gravado** — que num produto novo é `null`, exatamente o
 * que a decisão pede, e num produto existente é o vínculo que ele já tinha.
 *
 * Preservar não é inventar: o valor preservado foi gravado por alguém (o seletor de
 * ontem, ou a criação automática), não deduzido de um "primeiro item".
 */

/** Um item da composição do produto, como a tela a mantém. */
export interface ItemDaComposicao {
  id: string
}

export interface BaseItemDerivadoInput {
  /** `products.product_type`. Fora de REVENDA a coluna é sempre `null`. */
  productType: string | null | undefined
  /** A composição do produto na hora de salvar (`product_items`). */
  itens: readonly ItemDaComposicao[]
  /** O valor JÁ GRAVADO, quando se está editando. `null` num produto novo. */
  baseItemIdAtual?: string | null
}

export type OrigemDoBaseItem = 'DERIVADO_DA_COMPOSICAO' | 'PRESERVADO' | 'NAO_SE_APLICA'

export interface BaseItemDerivadoResult {
  /** O que gravar em `products.base_item_id`. */
  baseItemId: string | null
  origem: OrigemDoBaseItem
  /**
   * `true` quando o produto fica SEM vínculo pela coluna — e portanto sem sincronização
   * de estoque com o item. É o que a decisão mandou registrar; a tela usa isto para
   * dizê-lo ao usuário em vez de deixar o silêncio decidir.
   */
  semVinculoDeEstoque: boolean
}

const REVENDA = 'REVENDA'

/**
 * Deriva `base_item_id` da composição, sem seletor e sem inventar.
 *
 * Um item → é ele. Zero ou dois e mais → preserva o gravado (`null` num produto novo).
 */
export function derivarBaseItemId(input: BaseItemDerivadoInput): BaseItemDerivadoResult {
  const tipo = String(input.productType ?? '').trim().toUpperCase()
  if (tipo !== REVENDA) {
    // Produto PRODUZIDO não tem item base: a coluna é da revenda, e zerá-la aqui é o que
    // o código já fazia (`productType === 'REVENDA' ? baseItemId : null`).
    return { baseItemId: null, origem: 'NAO_SE_APLICA', semVinculoDeEstoque: false }
  }

  const ids = input.itens.map((i) => i?.id).filter((id): id is string => !!id)
  if (ids.length === 1) {
    return { baseItemId: ids[0], origem: 'DERIVADO_DA_COMPOSICAO', semVinculoDeEstoque: false }
  }

  const atual = input.baseItemIdAtual ?? null
  return {
    baseItemId: atual,
    origem: 'PRESERVADO',
    semVinculoDeEstoque: atual == null,
  }
}
