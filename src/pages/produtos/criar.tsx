import { useEffect, useState } from 'react'
import { message, Spin } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { Content } from '@/page-parts/products/content.component'
import { IItemModel } from '@/server/model/item'
import { CalcBaseType } from '@/types/calc-base.type'
import { useAuth } from '@/hooks/use-auth.hook'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { calculateItemPrice } from '@/utils/calculate-item-price'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { buildCalcBase } from '@/utils/build-calc-base'

const NewProduct = () => {
  const [messageApi, contextHolder] = message.useMessage()
  const { currentUser, tenantId, loading: authLoading } = useAuth()
  const [items, setItems] = useState<IItemModel[]>([])
  const [calcBase, setCalcBase] = useState<CalcBaseType | null>(null)
  const [loading, setLoading] = useState(true)

  const effectiveTenantId = tenantId ?? currentUser?.tenant_id

  // Se auth terminou mas não há tenantId, encerrar loading para não ficar em Spin infinito
  useEffect(() => {
    if (!authLoading && !effectiveTenantId) {
      setLoading(false)
    }
  }, [authLoading, effectiveTenantId])

  useEffect(() => {
    if (!effectiveTenantId) return

    async function loadData() {
      setLoading(true)
      try {
        const tenantId = await getTenantId()
        if (!tenantId) return

        await mergeExpenseConfig(tenantId)

        const [itemsRes, stockRes, expenseRes, taxPreview] = await Promise.all([
          supabase.from('items').select('*').eq('tenant_id', tenantId).order('name'),
          supabase.from('stock').select('item_id, quantity_current, unit').eq('stock_type', 'ITEM'),
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

        const base = buildCalcBase(expenseRes.data, taxPreview)
        setCalcBase(base)
      } catch (err) {
        console.error('Erro ao carregar dados:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [effectiveTenantId])

  // Se auth ainda está carregando, aguardar — não ficamos presos se effectiveTenantId for null
  if (authLoading || loading || !calcBase) {
    return (
      <Layout tabTitle={PAGE_TITLES.NEW_PRODUCT}>
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      </Layout>
    )
  }

  if (!effectiveTenantId) {
    return (
      <Layout tabTitle={PAGE_TITLES.NEW_PRODUCT}>
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--color-neutral-500)' }}>Não foi possível identificar o tenant. Tente recarregar a página.</div>
      </Layout>
    )
  }

  return (
    <Layout tabTitle={PAGE_TITLES.NEW_PRODUCT}>
      {contextHolder}
      <Content
        messageApi={messageApi}
        isEditingMode={false}
        itemsFromApi={items}
        calcBase={calcBase}
        currentUser={currentUser}
      />
    </Layout>
  )
}

export default NewProduct
