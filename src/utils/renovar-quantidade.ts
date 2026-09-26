/**
 * renovar-quantidade.ts — a operação "Renovar quantidade" de um ITEM.
 *
 * Comando do PO de 26/09/2026: a operação MUDA DE TELA. Ela morava no cadastro de Itens e
 * passa para o Estoque, porque quantidade é fato de estoque — entra, sai, e tem saldo. O
 * cadastro diz o que o item É e como será usado; o saldo é outro assunto.
 *
 * >>> POR QUE ELA VIROU MÓDULO NA TRAVESSIA <<<
 *
 * Eram ~200 linhas dentro de `itens/index.tsx`. Movê-las para dentro de `estoque/index.tsx`
 * seria trocar o endereço do problema: a lógica continuaria sem nome, sem contrato, e
 * mensurável só clicando. O oráculo D do comando pede que o caso afirme A LINHA GRAVADA em
 * `stock_movements`, não o clique — e isso exige que a operação seja chamável de fora de um
 * componente.
 *
 * NÃO É CÓPIA: a versão da tela de Itens foi REMOVIDA no mesmo commit. `copia-divergente.md`
 * manda apagar uma das duas, e a que ficou é esta.
 *
 * >>> O QUE ESTE MÓDULO NÃO É <<<
 *
 * Ele não é a renovação de PRODUTO nem a de SERVIÇO. As duas existem, em
 * `produtos/index.tsx` e `servicos/index.tsx`, e fazem coisas diferentes: lá o saldo vem de
 * produção e de venda, não de recompra de insumo. Unificá-las seria inventar um parentesco
 * que o domínio não tem.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Os MOTIVOS gravados em `stock_movements`, nomeados.
 *
 * Eles são os textos EXATOS que a tela de Itens gravava. O comando fala em
 * "Renovar quantidade — N un.", que é o motivo da tela de PRODUTOS; preservar o texto de
 * antes é o que a regra pede — mudá-lo aqui quebraria a leitura do histórico já gravado,
 * que é onde esses textos viram relatório.
 */
export const MOTIVO_DA_ENTRADA = 'Recompra - renovar quantidade'
export const MOTIVO_DA_BAIXA = 'Baixa de quantidade (exclusão parcial via Renovar)'

export type ModoDaRenovacao = 'include' | 'partial_delete'

export interface EntradaDaRenovacao {
  itemId: string
  modo: ModoDaRenovacao
  /** Quantidade a somar (include) ou a remover (partial_delete). */
  quantidade: number
  /** Preço por embalagem, já numérico. Só no modo `include`. */
  precoUnitario?: number
  fornecedorNome?: string | null
  fornecedorUf?: string | null
}

export interface ContextoDaRenovacao {
  supabase: SupabaseClient<any, any, any>
  tenantId: string
  createdBy: string
}

/**
 * O discriminante é STRING, e não um `ok: boolean`.
 *
 * Este `tsconfig` roda com `strictNullChecks: false`, e ali o estreitamento de união por
 * discriminante booleano não acontece — `if (!r.ok)` compilava para o ramo ERRADO e o
 * `tsc` acusava `erro` inexistente. Com `'OK' | 'ERRO'` o estreitamento é confiável, e o
 * chamador não precisa de cast.
 */
export type ResultadoDaRenovacao =
  | { estado: 'OK'; mensagem: string }
  | { estado: 'ERRO'; erro: string }

/**
 * Renova (ou baixa parcialmente) a quantidade de um item.
 *
 * O corpo é o da tela de Itens, movido sem alteração de comportamento: mesma ordem de
 * escrita, mesmas contas, mesmos motivos. O que mudou foi de onde ele é chamado e o fato de
 * as mensagens saírem como valor de retorno em vez de `messageApi` — um módulo que conhece o
 * `message` do antd não é chamável de um teste.
 */
export async function renovarQuantidade(
  ctx: ContextoDaRenovacao,
  entrada: EntradaDaRenovacao,
): Promise<ResultadoDaRenovacao> {
  const { supabase, tenantId, createdBy } = ctx
  const { itemId, modo } = entrada

  const { data: currentItem, error: fetchError } = await supabase
    .from('items')
    .select('id, quantity, cost_price, cost_per_base_unit, unit, item_type, measure_quantity')
    .eq('id', itemId)
    .single()

  if (fetchError || !currentItem) return { estado: 'ERRO', erro: 'Item não encontrado.' }

  // ── Modo: Excluir parcialmente ──
  if (modo === 'partial_delete') {
    const qtyToRemove = Number(entrada.quantidade) || 0
    const currentQty = Number(currentItem.quantity) || 0
    const unitCost = Number((currentItem as any).cost_per_base_unit) || 0

    if (qtyToRemove <= 0) return { estado: 'ERRO', erro: 'Informe uma quantidade válida para remover.' }
    if (qtyToRemove > currentQty) {
      return { estado: 'ERRO', erro: `Máximo permitido: ${currentQty} ${currentItem.unit || 'UN'}.` }
    }

    const newItemQty = Math.max(0, currentQty - qtyToRemove)
    const newCostTotal = newItemQty * unitCost

    await supabase
      .from('items')
      .update({ quantity: newItemQty, cost_price: newCostTotal, updated_at: new Date().toISOString() })
      .eq('id', itemId)

    const { data: st } = await supabase
      .from('stock')
      .select('id, quantity_current')
      .eq('item_id', itemId)
      .eq('stock_type', 'ITEM')
      .maybeSingle()

    if (st) {
      const newStockQty = Math.max(0, (Number(st.quantity_current) || 0) - qtyToRemove)
      await supabase
        .from('stock')
        .update({ quantity_current: newStockQty, updated_at: new Date().toISOString() })
        .eq('id', st.id)
      await supabase.from('stock_movements').insert({
        stock_id: st.id,
        delta_quantity: -qtyToRemove,
        reason: MOTIVO_DA_BAIXA,
        created_by: createdBy,
      })
    }

    return { estado: 'OK', mensagem: 'Quantidade removida com sucesso!' }
  }

  // ── Modo: Adicionar quantidade ──
  const newQty = Number(entrada.quantidade) || 0
  const unitPrice = Number(entrada.precoUnitario) || 0
  const addedCost = unitPrice > 0 ? unitPrice * newQty : 0

  if (newQty < 0.001) return { estado: 'ERRO', erro: 'Informe uma quantidade válida.' }

  const currentQty = Number(currentItem.quantity) || 0
  const currentCost = Number(currentItem.cost_price) || 0
  const totalQty = currentQty + newQty
  const totalCost = currentCost + addedCost
  const measureQtyForItem = Number((currentItem as any).measure_quantity) || 1
  // custo por unidade base = preço por embalagem ÷ measure_quantity
  const newUnitCost = unitPrice > 0
    ? unitPrice / measureQtyForItem
    : (totalQty > 0 ? totalCost / (totalQty * measureQtyForItem) : 0)
  const oldCost = Number((currentItem as any).cost_per_base_unit) || 0
  const costChanged = Math.abs(newUnitCost - oldCost) > 0.0001

  await supabase
    .from('items')
    .update({
      quantity: totalQty,
      cost_price: totalCost,
      cost_per_base_unit: newUnitCost,
      supplier_name: entrada.fornecedorNome || null,
      supplier_state: entrada.fornecedorUf || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)

  const { data: stockRow } = await supabase
    .from('stock')
    .select('id')
    .eq('item_id', itemId)
    .eq('stock_type', 'ITEM')
    .maybeSingle()

  if (stockRow) {
    await supabase
      .from('stock')
      .update({
        quantity_current: totalQty,
        unit: currentItem.unit || 'UN',
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockRow.id)

    await supabase.from('stock_movements').insert({
      stock_id: stockRow.id,
      delta_quantity: newQty,
      reason: MOTIVO_DA_ENTRADA,
      created_by: createdBy,
    })
  } else {
    await supabase.from('stock').insert({
      tenant_id: tenantId,
      item_id: itemId,
      stock_type: 'ITEM',
      quantity_current: totalQty,
      min_limit: 0,
      unit: currentItem.unit || 'UN',
    })

    const { data: newStock } = await supabase
      .from('stock')
      .select('id')
      .eq('item_id', itemId)
      .eq('stock_type', 'ITEM')
      .single()

    if (newStock) {
      await supabase.from('stock_movements').insert({
        stock_id: newStock.id,
        delta_quantity: newQty,
        reason: MOTIVO_DA_ENTRADA,
        created_by: createdBy,
      })
    }
  }

  // Marcar produtos como needs_cost_update = true
  const { data: affectedProductItems } = await supabase
    .from('product_items')
    .select('product_id')
    .eq('item_id', itemId)
  const { data: revendaProds } = await supabase
    .from('products')
    .select('id')
    .eq('base_item_id', itemId)
  const productIds = [...new Set([
    ...((affectedProductItems || []) as any[]).map((r: any) => r.product_id),
    ...((revendaProds || []) as any[]).map((r: any) => r.id),
  ])]
  if (productIds.length > 0) {
    await supabase.from('products').update({ needs_cost_update: true }).in('id', productIds)
  }

  // Marcar serviços como needs_cost_update = true (somente se custo mudou)
  if (costChanged) {
    const { data: affectedServiceItems } = await supabase
      .from('service_items')
      .select('service_id')
      .eq('item_id', itemId)
    const serviceIds = [...new Set(((affectedServiceItems || []) as any[]).map((r: any) => r.service_id))]
    if (serviceIds.length > 0) {
      await supabase.from('services').update({ needs_cost_update: true }).in('id', serviceIds)
    }
  }

  return { estado: 'OK', mensagem: 'Quantidade renovada! Custo unitário atualizado.' }
}

/**
 * As LINHAS do relatório de quantidades, a partir do que a aba já tem na tela.
 *
 * §5 do comando: a fonte é a MESMA que desenha a tabela. Uma segunda consulta para o mesmo
 * relatório é `copia-divergente.md` com a pior assinatura — a tela mostra um número e o PDF
 * mostra outro, e ninguém confere.
 */
export interface LinhaDoRelatorioDeQuantidades {
  name: string
  currentQty: number
  unit: string
  costGross: number | null
  costNet: number | null
}

export function linhasDoRelatorioDeQuantidades(
  linhas: readonly LinhaDoRelatorioDeQuantidades[],
  brl: (v: number) => string,
): string[][] {
  return linhas.map((l) => [
    l.name,
    `${l.currentQty} ${l.currentQty === 1 ? 'unidade' : 'unidades'}`,
    l.costGross == null ? '—' : brl(l.costGross),
    l.costNet == null ? '—' : brl(l.costNet),
  ])
}
