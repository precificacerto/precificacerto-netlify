import React, { useState, useEffect } from 'react'
import { Button, Card, Form, InputNumber, message, Select, Spin } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { ToolOutlined } from '@ant-design/icons'

type ProductOption = {
  id: string
  name: string
  code: string
  yield_quantity: number
  yield_unit: string
  product_items: Array<{
    item_id: string
    quantity_needed: number
    items?: { name: string; unit: string; quantity: number }
  }>
}

export default function ProducaoPage() {
  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()
  const { tenantId: contextTenantId, currentUser } = useAuth()
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const effectiveTenantId = contextTenantId ?? currentUser?.tenant_id

  useEffect(() => {
    if (!effectiveTenantId) return
    async function load() {
      setLoading(true)
      try {
        const tenantId = await getTenantId()
        if (!tenantId) return
        const { data, error } = await supabase
          .from('products')
          .select(`
            id,
            name,
            code,
            yield_quantity,
            yield_unit,
            product_type,
            product_items (
              item_id,
              quantity_needed,
              items ( name, unit, quantity )
            )
          `)
          .eq('tenant_id', tenantId)
          .eq('product_type', 'PRODUZIDO')

        if (error) throw error
        const withItems = (data || []).filter(
          (p: any) => p.product_items && p.product_items.length > 0
        )
        setProducts(withItems)
      } catch (e) {
        console.error(e)
        messageApi.error('Erro ao carregar produtos.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [effectiveTenantId, messageApi])

  const onFinish = async (values: { product_id: string; quantity: number }) => {
    const productId = values.product_id
    const quantityProduced = Number(values.quantity) || 0
    if (quantityProduced < 0.001) {
      messageApi.error('Informe uma quantidade válida.')
      return
    }

    const product = products.find((p) => p.id === productId)
    if (!product || !product.product_items?.length) {
      messageApi.error('Produto ou receita não encontrados.')
      return
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      messageApi.error('Não foi possível identificar o tenant.')
      return
    }
    const createdBy = await getCurrentUserId()
    if (!createdBy) {
      messageApi.error('Sessão inválida. Faça login novamente.')
      return
    }

    setSaving(true)
    try {
      const itemIds = product.product_items.map((pi) => pi.item_id)
      const { data: stockRows } = await supabase
        .from('stock')
        .select('item_id, quantity_current')
        .eq('stock_type', 'ITEM')
        .in('item_id', itemIds)

      const stockByItemId = (stockRows || []).reduce((acc: Record<string, number>, s: any) => {
        if (s.item_id) acc[s.item_id] = Number(s.quantity_current) || 0
        return acc
      }, {})

      const required: Array<{ item_id: string; name: string; required: number; available: number }> = []
      for (const pi of product.product_items) {
        const qtyNeeded = Number(pi.quantity_needed) || 0
        const requiredTotal = qtyNeeded * quantityProduced
        const available = stockByItemId[pi.item_id] ?? 0
        const itemName = (pi.items as any)?.name || pi.item_id
        required.push({
          item_id: pi.item_id,
          name: itemName,
          required: requiredTotal,
          available,
        })
        if (available < requiredTotal) {
          messageApi.error(
            `Estoque insuficiente de "${itemName}": necessário ${requiredTotal}, disponível ${available}.`
          )
          setSaving(false)
          return
        }
      }

      const { data: production, error: errProd } = await supabase
        .from('productions')
        .insert({
          tenant_id: tenantId,
          product_id: productId,
          quantity: quantityProduced,
        })
        .select('id')
        .single()

      if (errProd || !production) {
        throw new Error(errProd?.message || 'Erro ao registrar produção.')
      }

      for (const pi of product.product_items) {
        const quantityUsed = (Number(pi.quantity_needed) || 0) * quantityProduced
        await supabase.from('production_items').insert({
          production_id: production.id,
          item_id: pi.item_id,
          quantity_used: quantityUsed,
          unit: (pi.items as any)?.unit || 'UN',
        })
      }

      for (const r of required) {
        const quantityUsed = r.required
        const { data: st } = await supabase
          .from('stock')
          .select('id, quantity_current')
          .eq('item_id', r.item_id)
          .eq('stock_type', 'ITEM')
          .single()
        if (st) {
          const newQty = Math.max(0, (Number(st.quantity_current) || 0) - quantityUsed)
          await supabase
            .from('stock')
            .update({ quantity_current: newQty, updated_at: new Date().toISOString() })
            .eq('id', st.id)
          await supabase.from('stock_movements').insert({
            stock_id: st.id,
            delta_quantity: -quantityUsed,
            reason: `Produção — ${product.name}`,
            created_by: createdBy,
          })
        }
        const { data: itemRow } = await supabase
          .from('items')
          .select('quantity, cost_per_base_unit')
          .eq('id', r.item_id)
          .single()
        if (itemRow) {
          const newItemQty = Math.max(0, (Number(itemRow.quantity) || 0) - quantityUsed)
          const unitCost = Number(itemRow.cost_per_base_unit) || 0
          const newCostTotal = newItemQty * unitCost
          await supabase
            .from('items')
            .update({ quantity: newItemQty, cost_price: newCostTotal, updated_at: new Date().toISOString() })
            .eq('id', r.item_id)
        }
      }

      const { data: productStock } = await supabase
        .from('stock')
        .select('id, quantity_current')
        .eq('product_id', productId)
        .eq('stock_type', 'PRODUCT')
        .maybeSingle()

      if (productStock) {
        const current = Number(productStock.quantity_current) || 0
        await supabase
          .from('stock')
          .update({
            quantity_current: current + quantityProduced,
            updated_at: new Date().toISOString(),
          })
          .eq('id', productStock.id)
        await supabase.from('stock_movements').insert({
          stock_id: productStock.id,
          delta_quantity: quantityProduced,
          reason: `Produção — ${quantityProduced} unidades`,
          created_by: createdBy,
        })
      } else {
        await supabase.from('stock').insert({
          tenant_id: tenantId,
          product_id: productId,
          stock_type: 'PRODUCT',
          quantity_current: quantityProduced,
          min_limit: 0,
          unit: product.yield_unit || 'UN',
        })
        const { data: newSt } = await supabase
          .from('stock')
          .select('id')
          .eq('product_id', productId)
          .eq('stock_type', 'PRODUCT')
          .single()
        if (newSt) {
          await supabase.from('stock_movements').insert({
            stock_id: newSt.id,
            delta_quantity: quantityProduced,
            reason: `Produção — ${quantityProduced} unidades`,
            created_by: createdBy,
          })
        }
      }

      messageApi.success(`Produção de ${quantityProduced} unidade(s) registrada!`)
      form.resetFields()
    } catch (e: any) {
      messageApi.error(e?.message || 'Erro ao lançar produção.')
    } finally {
      setSaving(false)
    }
  }

  const { canView } = usePermissions()
  if (!canView(MODULES.STOCK)) {
    return (
      <Layout title={PAGE_TITLES.PRODUCTION}>
        <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
      </Layout>
    )
  }

  return (
    <Layout title={PAGE_TITLES.PRODUCTION}>
      {contextHolder}
      <Card
        title={
          <span>
            <ToolOutlined style={{ marginRight: 8 }} />
            Lançar produção
          </span>
        }
        style={{ maxWidth: 520 }}
      >
        <p style={{ color: '#94a3b8', marginBottom: 16 }}>
          Registre a produção de um produto. O estoque dos insumos será baixado e o estoque do produto acabado será aumentado.
        </p>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
            Nenhum produto produzido com receita cadastrada. Crie um produto do tipo Produzido com ingredientes em Produtos.
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item
              name="product_id"
              label="Produto"
              rules={[{ required: true, message: 'Selecione o produto' }]}
            >
              <Select
                placeholder="Selecione o produto a produzir"
                showSearch
                optionFilterProp="label"
                options={products.map((p) => ({
                  value: p.id,
                  label: `${p.name} (Cód: ${p.code})`,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="quantity"
              label="Quantidade produzida"
              rules={[
                { required: true, message: 'Informe a quantidade' },
                { type: 'number', min: 0.001, message: 'Quantidade deve ser maior que zero' },
              ]}
            >
              <InputNumber min={0.01} step={1} style={{ width: '100%' }} placeholder="Ex: 10" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>
                Registrar produção
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </Layout>
  )
}
