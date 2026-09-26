/**
 * gravar-item.ts — a gravação de um ITEM do cadastro.
 *
 * Comando do PO de 26/09/2026, §2: o Estoque ganha "+ Adicionar item", e ele abre o MESMO
 * formulário com a MESMA gravação da tela de Itens.
 *
 * >>> POR QUE A GRAVAÇÃO VIROU MÓDULO, E NÃO SÓ O FORMULÁRIO <<<
 *
 * O comando diz "mesmo componente, mesma gravação". `NewItemForm` já era um componente
 * compartilhável; o `handleSaveItem` eram 304 linhas dentro de `itens/index.tsx`. Copiá-las
 * para o Estoque daria dois caminhos de gravação para o mesmo cadastro, e o próprio comando
 * diz por que isso não serve: *"eles divergem na primeira mudança fiscal — e a mudança
 * fiscal acontece toda semana neste produto"*. É `copia-divergente.md` com data marcada.
 *
 * NÃO É CÓPIA: a versão de `itens/index.tsx` foi removida no mesmo commit, e as duas telas
 * chamam daqui.
 *
 * >>> O QUE FICOU DE FORA, E POR QUÊ <<<
 *
 * `messageApi`, `setSaving`, `onClose` e o recarregamento dos caches continuam na TELA: um
 * módulo que conhece o `message` do antd não é chamável de um teste, e as duas telas
 * recarregam caches diferentes. O que sai daqui é o RESULTADO, e cada uma decide o que
 * fazer com ele.
 *
 * O aviso de impacto do crédito sobe por `aoMudarCredito` em vez de abrir modal: quem
 * decide se há modal é a tela que o tem.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { houveMudancaDeCredito } from '@/utils/impacto-do-credito'

export interface ContextoDaGravacaoDeItem {
  supabase: SupabaseClient<any, any, any>
  tenantId: string
  createdBy: string
  /** O regime do tenant — decide quais colunas de alíquota são gravadas. */
  taxableRegime?: string | null
  /**
   * Chamado quando uma bandeira de crédito mudou de valor na gravação.
   *
   * É informação, e não efeito: nenhum produto é tocado aqui. A tela de Itens usa isto para
   * abrir o modal de impacto; a de Estoque, que não o tem, simplesmente não passa nada.
   */
  aoMudarCredito?: (info: { itemId: string; nome: string; custoAntes: number; custoDepois: number }) => void
}

export type ResultadoDaGravacaoDeItem =
  | { estado: 'OK'; itemId: string; mensagem: string }
  | { estado: 'ERRO'; erro: string }

/**
 * Grava (cria ou atualiza) um item, com estoque, produto de revenda e crédito de ICMS.
 *
 * O corpo é o de `itens/index.tsx`, movido sem alteração de comportamento: mesma ordem de
 * escrita, mesmas contas, mesmas colunas.
 */
export async function gravarItem(
  ctx: ContextoDaGravacaoDeItem,
  values: Record<string, any>,
): Promise<ResultadoDaGravacaoDeItem> {
  const { supabase, tenantId, createdBy } = ctx
  try {
    // O estado ANTES da gravação, para saber se alguma bandeira de crédito mudou. Lido do
    // banco, e não da memória: `estado-relatado-vs-real.md`.
    const { data: antesRow } = values.id
      ? await supabase.from('items')
        .select('cost_net, icms_credit_enabled, pis_cofins_credit_enabled, ipi_credit_enabled, cbs_credit_enabled, ibs_credit_enabled')
        .eq('id', values.id).maybeSingle()
      : { data: null }

    const priceNumber = parseFloat(
      String(values.price).replace(/\./g, '').replace(',', '.')
    )

    const qty = Number(values.quantity) || 1
    const measureQty = Number(values.measure_quantity) || 1
    const stockQty = qty  // Estoque em unidades compradas (não convertido para unidade base)
    const isLucroReal = ctx.taxableRegime === 'LUCRO_REAL'
    const isLucroPresumido = ctx.taxableRegime === 'LUCRO_PRESUMIDO'
    const isSimplesHibrido = ctx.taxableRegime === 'SIMPLES_HIBRIDO'
    // Regimes que possuem campos de impostos no item e calculam custo líquido
    const hasItemTaxes = isLucroReal || isLucroPresumido || isSimplesHibrido
    const isLucroRealOrLP = isLucroReal || isLucroPresumido
    const costNet = hasItemTaxes ? (Number(values.cost_net) || 0) : 0
    // Para regimes com impostos no item (LR, LP, SH): cost_per_base_unit = custo LÍQUIDO (usado na precificação)
    // Para outros regimes: usa o preço bruto
    const costPerBaseUnit = hasItemTaxes && costNet > 0
      ? (measureQty > 0 ? costNet / measureQty : costNet)
      : (measureQty > 0 ? priceNumber / measureQty : priceNumber)
    const totalCost = priceNumber * qty

    const itemData = {
      tenant_id: tenantId,
      name: values.name,
      code: values.code || null,
      item_type: values.item_type || 'INSUMO',
      product_table_id: values.item_type === 'REVENDA' ? (values.product_table_id || null) : null,
      ncm_code: values.ncm_code ? values.ncm_code.replace(/\D/g, '') : null,
      quantity: qty,
      measure_quantity: Number(values.measure_quantity) || 1,
      unit: values.unitType,
      cost_price: totalCost,
      // O BRUTO CALCULADO, e não mais o preço unitário.
      //
      // `cost_gross` já existia e valia `priceNumber` — o que É o bruto enquanto não há
      // IPI, ICMS-ST nem DIFAL na compra. Quem o consome (`services/content.component.tsx`)
      // já o trata como "BRUTO de referência", então a mudança ALINHA a coluna com o que o
      // leitor dela sempre acreditou. Medido em 20/09/2026: ZERO dos 72 itens tem IPI, ST
      // ou DIFAL, logo o número gravado é BIT-IDÊNTICO ao de antes em toda a base.
      cost_gross: values.cost_gross != null ? Number(values.cost_gross) : priceNumber,
      cost_net: costNet,
      // ── Crédito por tributo (comando do PO, 20/09/2026) ──
      // `?? null` e NÃO `Boolean(...)`: null = "o usuário nunca decidiu" e cai no padrão da
      // destinação na próxima leitura. Achatar aqui apagaria a distinção que a coluna
      // nullable existe para preservar (`ausente-vs-falso.md`).
      destination: values.destination ?? null,
      icms_credit_enabled: values.icms_credit_enabled ?? null,
      pis_cofins_credit_enabled: values.pis_cofins_credit_enabled ?? null,
      ipi_credit_enabled: values.ipi_credit_enabled ?? null,
      cbs_credit_enabled: values.cbs_credit_enabled ?? null,
      ibs_credit_enabled: values.ibs_credit_enabled ?? null,
      cbs_rate: Number(values.cbs_rate) || 0,
      ibs_rate: Number(values.ibs_rate) || 0,
      cst_icms: values.cst_icms || null,
      cst_ipi: values.cst_ipi || null,
      cst_pis_cofins: values.cst_pis_cofins || null,
      // LC 214/2025 art. 47 §9º II. `?? null` — não informado não é "não é do Simples".
      supplier_simples_sem_regime_regular: values.supplier_simples_sem_regime_regular ?? null,
      cost_per_base_unit: costPerBaseUnit,
      icms_rate: hasItemTaxes ? (Number(values.icms_rate) || 0) : 0,
      // Lucro Real: campo único pis_cofins_rate dividido proporcionalmente (1,65/9,25 e 7,6/9,25).
      // Simples Híbrido: pis_rate e cofins_rate gravados como vieram do form (campos separados).
      // Outros regimes: zera (comportamento original).
      ...(isLucroReal
        ? (() => {
            const total = Number(values.pis_cofins_rate) || 0
            const pisShare = 1.65 / 9.25
            const cofinsShare = 7.60 / 9.25
            return {
              pis_rate: parseFloat((total * pisShare).toFixed(4)),
              cofins_rate: parseFloat((total * cofinsShare).toFixed(4)),
            }
          })()
        : isSimplesHibrido
          ? {
              pis_rate: Number(values.pis_rate) || 0,
              cofins_rate: Number(values.cofins_rate) || 0,
            }
          : { pis_rate: 0, cofins_rate: 0 }
      ),
      icms_deferido_rate: hasItemTaxes ? (Number(values.icms_deferido_rate) || null) : null,
      has_st: values.has_st || false,
      is_monofasico: values.is_monofasico || false,
      supplier_name: values.supplier_name || null,
      supplier_state: values.supplier_state || null,
      observation: values.observation || null,
      updated_at: new Date().toISOString(),
    }

    let savedItem: any

    if (values.id) {
      const { data: updated, error } = await supabase
        .from('items')
        .update(itemData)
        .eq('id', values.id)
        .select()
        .single()
      if (error) throw error
      savedItem = updated
    } else {
      const { data: created, error } = await supabase
        .from('items')
        .insert(itemData)
        .select()
        .single()
      if (error) throw error
      savedItem = created
    }

    /*
     * O AVISO DE IMPACTO — depois de gravar o ITEM, e só ele.
     *
     * `houveMudancaDeCredito` compara sem achatar: sair de `null` para `true` É mudança,
     * porque o padrão virou decisão. A lista que sobe é INFORMAÇÃO — nenhum produto é
     * tocado aqui, e o modal diz isso com todas as letras.
     */
    if (antesRow && houveMudancaDeCredito(antesRow as never, itemData as never)) {
      ctx.aoMudarCredito?.({
        itemId: String(savedItem.id),
        nome: String(values.name ?? ''),
        custoAntes: Number((antesRow as { cost_net?: number }).cost_net) || 0,
        custoDepois: Number(costNet) || 0,
      })
    }

    // ── Criar/atualizar estoque automaticamente ──
    // REVENDA não cria stock de ITEM — vai direto para PRODUCT
    if (values.item_type !== 'REVENDA') {
      if (!values.id) {
        await supabase.from('stock').insert({
          tenant_id: tenantId,
          item_id: savedItem.id,
          stock_type: 'ITEM',
          quantity_current: stockQty,
          min_limit: values.min_limit ?? 0,
          unit: values.unitType || 'UN',
        })

        const { data: stockRec } = await supabase
          .from('stock')
          .select('id')
          .eq('item_id', savedItem.id)
          .single()

        if (stockRec) {
          await supabase.from('stock_movements').insert({
            stock_id: stockRec.id,
            delta_quantity: stockQty,
            reason: 'Entrada inicial — cadastro do item',
            created_by: createdBy,
          })
        }
      } else {
        const { data: existingStock } = await supabase
          .from('stock')
          .select('id')
          .eq('item_id', savedItem.id)
          .single()

        if (existingStock) {
          await supabase.from('stock')
            .update({
              quantity_current: stockQty,
              min_limit: values.min_limit ?? 0,
              unit: values.unitType || 'UN',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingStock.id)
        }
      }
    }

    // REVENDA editado: manter estoque do produto acabado sincronizado com a quantidade do item
    if (values.id && values.item_type === 'REVENDA' && savedItem) {
      const { data: revendaProduct } = await supabase
        .from('products')
        .select('id')
        .eq('base_item_id', savedItem.id)
        .maybeSingle()
      if (revendaProduct) {
        const { data: productStock } = await supabase
          .from('stock')
          .select('id')
          .eq('product_id', revendaProduct.id)
          .eq('stock_type', 'PRODUCT')
          .maybeSingle()
        if (productStock) {
          await supabase
            .from('stock')
            .update({
              quantity_current: qty,
              min_limit: values.min_limit ?? 0,
              unit: values.unitType || 'UN',
              updated_at: new Date().toISOString(),
            })
            .eq('id', productStock.id)
          await supabase.from('products').update({ quantity: qty, updated_at: new Date().toISOString() }).eq('id', revendaProduct.id)
        }
      }
    }

    // Se item REVENDA novo, criar produto automaticamente
    if (!values.id && (values.item_type === 'REVENDA') && savedItem) {
      const { data: lastProducts } = await supabase
        .from('products')
        .select('code')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)
      let maxNum = 1000
      if (lastProducts) {
        for (const p of lastProducts) {
          const num = parseInt(p.code, 10)
          if (!isNaN(num) && num > maxNum) maxNum = num
        }
      }
      const autoCode = String(maxNum + 1)
      const { data: newProduct } = await supabase.from('products').insert({
        tenant_id: tenantId,
        name: savedItem.name,
        code: autoCode,
        product_type: 'REVENDA',
        base_item_id: savedItem.id,
        ncm_code: savedItem.ncm_code || values.ncm_code?.replace(/\D/g, '') || null,
        sale_price: 0,
        cost_total: priceNumber,
        status: 'PENDING',
        unit: values.unitType || 'UN',
        yield_quantity: qty,
        yield_unit: values.unitType || 'UN',
        quantity: qty,
      }).select().single()

      if (newProduct) {
        await supabase.from('stock').insert({
          tenant_id: tenantId,
          product_id: newProduct.id,
          stock_type: 'PRODUCT',
          quantity_current: qty,
          min_limit: values.min_limit ?? 0,
          unit: values.unitType || 'UN',
        })
      }

      if (newProduct) {
        return { estado: 'OK' as const, itemId: String(savedItem.id), mensagem: 'Item salvo! Para precificar, acesse Produtos quando quiser.' }
      }
    }

    // Salvar crédito de ICMS em item_tax_credits para regimes com impostos no item
    if (hasItemTaxes && savedItem && Number(savedItem.icms_rate) > 0) {
      const costNetVal = Number(savedItem.cost_net) || 0
      const icmsRateVal = Number(savedItem.icms_rate) || 0
      const icmsCredit = costNetVal * (icmsRateVal / 100)
      if (icmsCredit > 0) {
        await (supabase as any).from('item_tax_credits').upsert({
          item_id: savedItem.id,
          tenant_id: tenantId,
          tax_type: 'ICMS',
          credit_value: icmsCredit,
          is_active: true,
        }, { onConflict: 'item_id,tax_type' })
      }
    }

    return { estado: 'OK' as const, itemId: String(savedItem.id), mensagem: 'Item salvo!' }
  } catch (ex: any) {
    return { estado: 'ERRO', erro: ex?.message || 'Não foi possível salvar o item.' }
  }
}
