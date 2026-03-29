import { useEffect, useState } from 'react'
import { message, Spin } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { Content } from '@/page-parts/products/content.component'
import { IItemModel } from '@/server/model/item'
import { IProductModel } from '@/server/model/product'
import { CalcBaseType } from '@/types/calc-base.type'
import { useAuth } from '@/hooks/use-auth.hook'
import { useRouter } from 'next/router'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { buildCalcBase } from '@/utils/build-calc-base'

const ProductDetails = () => {
  const [messageApi, contextHolder] = message.useMessage()
  const { currentUser, tenantId } = useAuth()
  const router = useRouter()
  const { id } = router.query

  const [items, setItems] = useState<IItemModel[]>([])
  const [product, setProduct] = useState<IProductModel | null>(null)
  const [calcBase, setCalcBase] = useState<CalcBaseType | null>(null)
  const [loading, setLoading] = useState(true)

  const effectiveTenantId = tenantId ?? currentUser?.tenant_id

  useEffect(() => {
    if (!effectiveTenantId || !id) return

    async function loadData() {
      setLoading(true)
      try {
        const tenantId = await getTenantId()
        if (!tenantId) return

        await mergeExpenseConfig(tenantId)

        const [itemsRes, stockRes, productRes, productStockRes, expenseRes, taxPreview] = await Promise.all([
          supabase.from('items').select('*').eq('tenant_id', tenantId).order('name'),
          supabase.from('stock').select('item_id, quantity_current, unit').eq('stock_type', 'ITEM'),
          supabase
            .from('products')
            .select('*, product_items(*, items(*)), pricing_calculations(*)')
            .eq('id', id as string)
            .single(),
          supabase.from('stock').select('min_limit').eq('product_id', id as string).eq('stock_type', 'PRODUCT').maybeSingle(),
          supabase.from('tenant_expense_config').select('*').eq('tenant_id', tenantId).single(),
          fetchTaxPreview(tenantId),
        ])

        const stockByItemId = (stockRes.data || []).reduce((acc: Record<string, { quantity_current: number; unit: string }>, s: any) => {
          if (s.item_id) {
            acc[s.item_id] = {
              quantity_current: Number(s.quantity_current) || 0,
              unit: (s.unit || 'UN').toString().toUpperCase(),
            }
          }
          return acc
        }, {})

        if (itemsRes.data) {
          setItems(
            itemsRes.data.map((i: any) => {
              const unit = (i.unit || 'UN').toString().toUpperCase()
              const stock = stockByItemId[i.id]
              const qty = Number(i.quantity) || 1
              const totalCost = Number(i.cost_price) || 0
              const costPerUnit = i.cost_per_base_unit != null && i.cost_per_base_unit !== ''
                ? Number(i.cost_per_base_unit)
                : qty > 0 ? totalCost / qty : totalCost
              return {
                id: i.id,
                name: i.name,
                quantity: qty,
                unitType: unit,
                price: costPerUnit,
                observation: i.observation || '',
                item_type: i.item_type || '',
                stockQuantity: stock ? stock.quantity_current : null,
                stockUnit: stock ? stock.unit : unit,
                cost_per_base_unit: costPerUnit,
                cost_net: i.cost_net != null ? Number(i.cost_net) : 0,
                measure_quantity: Number(i.measure_quantity) || 1,
              }
            })
          )
        }

        if (productRes.data) {
          const p = productRes.data
          const pricing = p.pricing_calculations?.[0]

          const stockByItemId = (stockRes.data || []).reduce((acc: Record<string, number>, s: any) => {
            if (s.item_id) acc[s.item_id] = Number(s.quantity_current) || 0
            return acc
          }, {})

          let productItems = (p.product_items || []).map((pi: any) => {
            const item = pi.items
            const refQty = item ? Number(item.quantity) || 1 : 1
            const totalCost = item ? Number(item.cost_price) || 0 : 0
            const costPerUnit = item?.cost_per_base_unit != null && item?.cost_per_base_unit !== ''
              ? Number(item.cost_per_base_unit)
              : refQty > 0 ? totalCost / refQty : totalCost
            const qty = Number(pi.quantity_needed) || 1
            const unit = (item?.unit || 'UN').toString().toUpperCase()
            // referenceQuantity=1 para que Valor (Custo) = quantidade × custo/unidade (custo do item cadastrado).
            return {
              id: item?.id || pi.item_id,
              name: item?.name || 'Item removido',
              quantity: qty,
              referenceQuantity: 1,
              unitType: unit,
              price: qty * costPerUnit,
              referencePrice: costPerUnit,
              stockQuantity: item?.id ? stockByItemId[item.id] ?? null : null,
              cost_net: item?.cost_net != null ? Number(item.cost_net) : 0,
              measure_quantity: Number(item?.measure_quantity) || 1,
            }
          })

          // Produto REVENDA recém-criado sem product_items: preencher do base_item para custo aparecer na precificação
          let ncmFromProduct = p.ncm_code || ''
          if (p.product_type === 'REVENDA' && p.base_item_id && itemsRes.data) {
            const baseItem = itemsRes.data.find((i: any) => i.id === p.base_item_id)
            if (baseItem) {
              // Herdar NCM do item quando o produto de revenda não tiver NCM preenchido
              if (!ncmFromProduct && baseItem.ncm_code) {
                ncmFromProduct = baseItem.ncm_code
              }
              if (productItems.length === 0) {
                const refQty = Number(baseItem.quantity) || 1
                const totalCost = Number(baseItem.cost_price) || 0
                const costPerUnit = baseItem.cost_per_base_unit != null && baseItem.cost_per_base_unit !== ''
                  ? Number(baseItem.cost_per_base_unit)
                  : refQty > 0 ? totalCost / refQty : totalCost
                const unit = (baseItem.unit || 'UN').toString().toUpperCase()
                productItems = [{
                  id: baseItem.id,
                  name: baseItem.name,
                  quantity: 1,
                  referenceQuantity: 1,
                  unitType: unit,
                  price: costPerUnit,
                  referencePrice: costPerUnit,
                  stockQuantity: stockByItemId[baseItem.id] ?? null,
                  cost_net: baseItem.cost_net != null ? Number(baseItem.cost_net) : 0,
                  measure_quantity: Number(baseItem.measure_quantity) || 1,
                }]
              }
            }
          }

          const commissionPct = pricing ? Number(pricing.pct_commission) : Number(p?.commission_percent)
          const profitPct = pricing ? Number(pricing.pct_profit_margin) : Number(p?.profit_percent)
          const productPriceInfo = {
                salesCommissionPercent: Number(commissionPct) || 0,
                salesCommissionPrice: Number(pricing?.val_commission) || 0,
                salesCommissionPercentByProduct: 0,
                salesCommissionPriceByProduct: 0,
                productProfitPercent: Number(profitPct) || 0,
                productProfitPrice: Number(pricing?.val_profit) || 0,
                productProfitPercentByProduct: 0,
                productProfitPriceByProduct: 0,
                indirectLaborForcePrice: Number(pricing?.val_indirect_labor) || 0,
                feightPrice: 0,
                packagingPrice: 0,
                fixedExpensePrice: Number(pricing?.val_fixed_expense) || 0,
                variableExpensePrice: Number(pricing?.val_variable_expense) || 0,
                taxesPrice: Number(pricing?.val_taxable_regime) || 0,
                totalProductPrice: Number(pricing?.sale_price_total) || Number(p.sale_price) || 0,
                productCost: Number(pricing?.cmv) || Number(p.cost_total) || 0,
                productWorkloadInMinutes: Number(pricing?.product_workload) || 0,
                productWorkloadInMinutesPrice: Number(pricing?.product_workload_price) || 0,
                taxableRegimePercent: Number(pricing?.pct_taxable_regime) || 0,
                taxableRegimePrice: Number(pricing?.val_taxable_regime) || 0,
                taxableRegimePercentByProduct: 0,
                taxableRegimePriceByProduct: 0,
              }

          setProduct({
            id: p.id,
            code: p.code || '',
            name: p.name,
            description: p.description || '',
            unitType: p.yield_unit || p.unit || 'UN',
            quantity: Number(p.yield_quantity) || 1,
            salePrice: Number(p.sale_price) || 0,
            items: productItems,
            productPriceInfo,
            productType: p.product_type || 'PRODUZIDO',
            baseItemId: p.base_item_id || null,
            status: p.status || 'ACTIVE',
            ncm_code: ncmFromProduct,
            nbs_code: p.nbs_code || '',
            minLimit: productStockRes?.data?.min_limit != null ? Number(productStockRes.data.min_limit) : 0,
            custom_tax_percent: p.custom_tax_percent != null ? Number(p.custom_tax_percent) : null,
            recurrence_days: p.recurrence_days != null ? Number(p.recurrence_days) : null,
            section_id: p.section_id || null,
            commission_table_id: p.commission_table_id || null,
          } as any)
        }

        const base = buildCalcBase(expenseRes.data, taxPreview)
        setCalcBase(base)
      } catch (err) {
        console.error('Erro ao carregar produto:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [effectiveTenantId, id])

  if (loading || !currentUser || !calcBase || !product) {
    return (
      <Layout tabTitle={PAGE_TITLES.EDIT_PRODUCT}>
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      </Layout>
    )
  }

  return (
    <Layout tabTitle={PAGE_TITLES.EDIT_PRODUCT}>
      {contextHolder}
      <Content
        messageApi={messageApi}
        isEditingMode={true}
        itemsFromApi={items}
        product={product}
        calcBase={calcBase}
        currentUser={currentUser}
      />
    </Layout>
  )
}

export default ProductDetails
