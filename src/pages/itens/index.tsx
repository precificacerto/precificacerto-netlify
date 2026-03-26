import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Space, Table, Input, Drawer, message, Form, Spin, Tag, Radio, InputNumber, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { NewItemForm } from '@/page-parts/items/new-item-form.component'
import { RenewQuantityForm, type ItemOption } from '@/page-parts/items/renew-quantity-form.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { UNIT_TYPE } from '@/constants/item-unit-types'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { getCurrentUserId } from '@/utils/get-tenant-id'
import { supabase } from '@/supabase/client'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useAuth } from '@/hooks/use-auth.hook'
import { useItems } from '@/hooks/use-data.hooks'
import { useRouter } from 'next/router'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { computeServiceSellingPrice } from '@/utils/compute-service-price'

const ITEM_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  INSUMO: { label: '🧪 Insumos para beneficiamento', color: 'blue' },
  REVENDA: { label: '📦 Revenda', color: 'orange' },
}

type ItemRow = {
  key: string
  id: string
  name: string
  code: string
  item_type: string
  ncm_code: string
  quantity: number
  measure_quantity: number
  unitType: string
  price: number
  cost_per_base_unit: number
  has_st: boolean
  is_monofasico: boolean
  supplier_name: string
  supplier_state: string
  observation: string
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

const ncmMask = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
}

function Items() {
  const { data: rawItems, isLoading, mutate: reloadItems } = useItems()
  const { currentUser, tenantId: contextTenantId } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [titleDrawer, setTitleDrawer] = useState('Novo Item')
  const [saving, setSaving] = useState(false)
  const [renewDrawerOpen, setRenewDrawerOpen] = useState(false)
  const [savingRenew, setSavingRenew] = useState(false)
  const [renewMode, setRenewMode] = useState<'include' | 'partial_delete'>('include')
  const [deleteQtyDrawerOpen, setDeleteQtyDrawerOpen] = useState(false)
  const [selectedItemForDelete, setSelectedItemForDelete] = useState<ItemRow | null>(null)
  const [updatingProductsForItemId, setUpdatingProductsForItemId] = useState<string | null>(null)
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [savedCostMap, setSavedCostMap] = useState<Record<string, number>>({})
  const [savedServiceItems, setSavedServiceItems] = useState<Array<{ item_id: string; cost_per_base_unit: number | null; item_quantity_snapshot: number | null }>>([])
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(new Set())
  const [updatingAllProducts, setUpdatingAllProducts] = useState(false)
  const savedCostInitializedRef = useRef(false)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ItemRow | null>(null)
  const [deletingItem, setDeletingItem] = useState(false)

  const [form] = Form.useForm()
  const [renewForm] = Form.useForm()
  const [deleteQtyForm] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()
  const router = useRouter()

  const data = useMemo<ItemRow[]>(() => {
    return (rawItems || []).map((item: any) => ({
      key: item.id,
      id: item.id,
      name: item.name,
      code: item.code || '',
      item_type: item.item_type || 'INSUMO',
      ncm_code: item.ncm_code || '',
      quantity: Number(item.quantity) || 1,
      measure_quantity: Number(item.measure_quantity) || 1,
      unitType: item.unit || 'UN',
      price: Number(item.cost_price) || 0,
      cost_per_base_unit: Number(item.cost_per_base_unit) || 0,
      has_st: item.has_st || false,
      is_monofasico: item.is_monofasico || false,
      supplier_name: item.supplier_name || '',
      supplier_state: item.supplier_state || '',
      observation: item.observation || '',
    }))
  }, [rawItems])

  useEffect(() => {
    if (!rawItems) return
    ;(async () => {
      const itemIds = rawItems.map((i: any) => i.id)
      if (itemIds.length === 0) return

      const [piRes, siRes, stockRes] = await Promise.all([
        supabase.from('product_items').select('item_id, cost_per_base_unit').in('item_id', itemIds),
        supabase.from('service_items').select('item_id, cost_per_base_unit, item_quantity_snapshot').in('item_id', itemIds),
        supabase.from('stock').select('item_id, quantity_current').eq('stock_type', 'ITEM').in('item_id', itemIds),
      ])
      const newStockMap: Record<string, number> = {}
      for (const s of (stockRes.data || [])) {
        if (s.item_id) newStockMap[s.item_id] = Number(s.quantity_current) || 0
      }
      setStockMap(newStockMap)
      const merged: Record<string, number> = {}
      for (const pi of (piRes.data || [])) {
        if (merged[pi.item_id] === undefined) {
          merged[pi.item_id] = Number(pi.cost_per_base_unit) || 0
        }
      }
      for (const si of (siRes.data || [])) {
        if (merged[si.item_id] === undefined) {
          merged[si.item_id] = Number(si.cost_per_base_unit) || 0
        }
      }
      setSavedCostMap(merged)
      setSavedServiceItems((siRes.data || []).map((si: any) => ({
        item_id: si.item_id,
        cost_per_base_unit: si.cost_per_base_unit != null ? Number(si.cost_per_base_unit) : null,
        item_quantity_snapshot: si.item_quantity_snapshot != null ? Number(si.item_quantity_snapshot) : null,
      })))
      savedCostInitializedRef.current = true
    })()
  }, [rawItems])

  useEffect(() => {
    if (!savedCostInitializedRef.current) return
    const newDirty = new Set<string>()
    data.forEach(item => {
      const productItemCost = savedCostMap[item.id]
      const costDiffers = productItemCost !== undefined && item.cost_per_base_unit !== productItemCost
      const inServiceItems = savedServiceItems.some(si => si.item_id === item.id)
      const serviceCostOrQtyDiffers = inServiceItems && savedServiceItems.some(si => {
        if (si.item_id !== item.id) return false
        const costOk = si.cost_per_base_unit == null || Number(item.cost_per_base_unit) === si.cost_per_base_unit
        const qtyOk = si.item_quantity_snapshot != null && Number(item.quantity) === si.item_quantity_snapshot
        return !costOk || !qtyOk
      })
      if (costDiffers || serviceCostOrQtyDiffers) {
        newDirty.add(item.id)
      }
    })
    setDirtyItems(newDirty)
  }, [data, savedCostMap, savedServiceItems])

  const filteredData = useMemo<ItemRow[]>(() => {
    if (!searchText) return data
    return data.filter(item => item.name.toLowerCase().includes(searchText.toLowerCase()))
  }, [data, searchText])

  const { canView, canEdit } = usePermissions()
  if (!canView(MODULES.ITEMS)) {
    return <Layout title={PAGE_TITLES.ITEMS}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
  }

  function handleOpenDeleteQty(record: ItemRow) {
    setSelectedItemForDelete(record)
    deleteQtyForm.resetFields()
    deleteQtyForm.setFieldsValue({
      scope: 'total',
      quantity: record.quantity,
    })
    setDeleteQtyDrawerOpen(true)
  }

  function handleDeleteItem(record: ItemRow) {
    setDeleteConfirmItem(record)
  }

  async function handleConfirmDeleteItem() {
    if (!deleteConfirmItem) return
    setDeletingItem(true)
    try {
      const res = await fetch('/api/delete/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirmItem.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message || `Erro ${res.status}`)
      }
      await reloadItems()
      messageApi.success('Item excluído com sucesso!')
      setDeleteConfirmItem(null)
    } catch (error: any) {
      messageApi.error('Erro ao excluir item: ' + (error?.message || 'Erro desconhecido'))
    } finally {
      setDeletingItem(false)
    }
  }

  async function handleConfirmDeleteQty() {
    if (!selectedItemForDelete) return
    try {
      const createdBy = await getCurrentUserId()
      if (!createdBy) {
        messageApi.error('Sessão inválida. Faça login novamente.')
        return
      }
      const values = await deleteQtyForm.validateFields()
      const qtyToRemove = values.scope === 'total'
        ? selectedItemForDelete.quantity
        : Math.min(Number(values.quantity) || 0, selectedItemForDelete.quantity)
      if (qtyToRemove <= 0) {
        messageApi.error('Informe uma quantidade válida para excluir.')
        return
      }
      if (qtyToRemove > selectedItemForDelete.quantity) {
        const unit = (UNIT_TYPE as Record<string, string>)[selectedItemForDelete.unitType] || selectedItemForDelete.unitType
        messageApi.error(`Máximo permitido: ${selectedItemForDelete.quantity} ${unit}.`)
        return
      }
      const itemId = selectedItemForDelete.id
      const newItemQty = Math.max(0, selectedItemForDelete.quantity - qtyToRemove)
      const unitCost = Number(selectedItemForDelete.cost_per_base_unit) || 0
      const newCostTotal = newItemQty * unitCost

      await supabase
        .from('items')
        .update({ quantity: newItemQty, cost_price: newCostTotal, updated_at: new Date().toISOString() })
        .eq('id', itemId)

      if (selectedItemForDelete.item_type === 'REVENDA') {
        const { data: product } = await supabase
          .from('products')
          .select('id')
          .eq('base_item_id', itemId)
          .maybeSingle()
        if (product) {
          const { data: st } = await supabase
            .from('stock')
            .select('id, quantity_current')
            .eq('product_id', product.id)
            .eq('stock_type', 'PRODUCT')
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
              reason: values.reason || 'Baixa de quantidade (exclusão parcial/total)',
              created_by: createdBy,
            })
          }
        }
      } else {
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
            reason: values.reason || 'Baixa de quantidade (exclusão parcial/total)',
            created_by: createdBy,
          })
        }
      }

      const unit = (UNIT_TYPE as Record<string, string>)[selectedItemForDelete.unitType] || selectedItemForDelete.unitType
      messageApi.success(`Quantidade de ${qtyToRemove} ${unit} excluída. Estoque atualizado.`)
      await reloadItems()
      setDeleteQtyDrawerOpen(false)
      setSelectedItemForDelete(null)
    } catch (error: any) {
      if (error?.errorFields) return
      messageApi.error('Erro ao excluir quantidade: ' + (error?.message || 'Preencha os campos.'))
    }
  }

  const handleEdit = async (record: ItemRow) => {
    setTitleDrawer('Editar Item')
    let minLimit = 0
    if (record.item_type === 'REVENDA') {
      const { data: prod } = await supabase.from('products').select('id').eq('base_item_id', record.id).maybeSingle()
      if (prod) {
        const { data: st } = await supabase.from('stock').select('min_limit').eq('product_id', prod.id).eq('stock_type', 'PRODUCT').maybeSingle()
        if (st) minLimit = Number(st.min_limit) || 0
      }
    } else {
      const { data: st } = await supabase.from('stock').select('min_limit').eq('item_id', record.id).eq('stock_type', 'ITEM').maybeSingle()
      if (st) minLimit = Number(st.min_limit) || 0
    }
    form.setFieldsValue({
      id: record.id,
      name: record.name,
      code: record.code,
      item_type: record.item_type,
      ncm_code: record.ncm_code ? ncmMask(record.ncm_code) : '',
      quantity: record.quantity,
      measure_quantity: record.measure_quantity,
      unitType: record.unitType,
      price: record.cost_per_base_unit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      has_st: record.has_st,
      is_monofasico: record.is_monofasico,
      supplier_name: record.supplier_name,
      supplier_state: record.supplier_state || undefined,
      observation: record.observation,
      min_limit: minLimit,
    })
    setNewItemOpen(true)
  }

  const handleAddItem = () => {
    setTitleDrawer('Novo Item')
    form.resetFields()
    setNewItemOpen(true)
  }

  const onClose = () => {
    setNewItemOpen(false)
    form.resetFields()
  }

  const openRenewDrawer = () => {
    renewForm.resetFields()
    setRenewMode('include')
    setRenewDrawerOpen(true)
  }

  const closeRenewDrawer = () => {
    setRenewDrawerOpen(false)
    renewForm.resetFields()
  }

  const handleSaveRenew = async () => {
    try {
      await renewForm.validateFields()
      setSavingRenew(true)

      const values = renewForm.getFieldsValue()
      const tenantId = contextTenantId ?? currentUser?.tenant_id
      if (!tenantId) {
        messageApi.error('Não foi possível identificar o tenant.')
        return
      }

      const itemId = values.item_id

      const { data: currentItem, error: fetchError } = await supabase
        .from('items')
        .select('id, quantity, cost_price, cost_per_base_unit, unit, item_type')
        .eq('id', itemId)
        .single()

      if (fetchError || !currentItem) {
        messageApi.error('Item não encontrado.')
        return
      }

      const createdBy = await getCurrentUserId()
      if (!createdBy) {
        messageApi.error('Sessão inválida. Faça login novamente.')
        setSavingRenew(false)
        return
      }

      // ── Modo: Excluir parcialmente ──
      if (renewMode === 'partial_delete') {
        const qtyToRemove = Number(values.quantity) || 0
        const currentQty = Number(currentItem.quantity) || 0
        const unitCost = Number((currentItem as any).cost_per_base_unit) || 0

        if (qtyToRemove <= 0) {
          messageApi.error('Informe uma quantidade válida para remover.')
          setSavingRenew(false)
          return
        }
        if (qtyToRemove > currentQty) {
          messageApi.error(`Máximo permitido: ${currentQty} ${currentItem.unit || 'UN'}.`)
          setSavingRenew(false)
          return
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
            reason: 'Baixa de quantidade (exclusão parcial via Renovar)',
            created_by: createdBy,
          })
        }

        await reloadItems()
        messageApi.success('Quantidade removida com sucesso!')
        closeRenewDrawer()
        return
      }

      // ── Modo: Adicionar quantidade ──
      const newQty = Number(values.quantity) || 0
      const unitPrice = parseFloat(
        String(values.price || '0').replace(/\./g, '').replace(',', '.')
      )
      const addedCost = unitPrice > 0 ? unitPrice * newQty : 0

      if (newQty < 0.001) {
        messageApi.error('Informe uma quantidade válida.')
        return
      }

      const currentQty = Number(currentItem.quantity) || 0
      const currentCost = Number(currentItem.cost_price) || 0
      const totalQty = currentQty + newQty
      const totalCost = currentCost + addedCost
      const newUnitCost = unitPrice > 0 ? unitPrice : (totalQty > 0 ? totalCost / totalQty : 0)
      const oldCost = Number((currentItem as any).cost_per_base_unit) || 0
      const costChanged = Math.abs(newUnitCost - oldCost) > 0.0001

      await supabase
        .from('items')
        .update({
          quantity: totalQty,
          cost_price: totalCost,
          cost_per_base_unit: newUnitCost,
          supplier_name: values.supplier_name || null,
          supplier_state: values.supplier_state || null,
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
          reason: 'Recompra - renovar quantidade',
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
            reason: 'Recompra - renovar quantidade',
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

      await reloadItems()
      messageApi.success('Quantidade renovada! Custo unitário atualizado.')
      closeRenewDrawer()
    } catch (ex: any) {
      messageApi.error(ex?.message || 'Preencha todos os campos obrigatórios.')
    } finally {
      setSavingRenew(false)
    }
  }

  const updateProductsForItemCore = async (
    itemId: string,
    tenantId: string,
    currentUserForService: { numProductiveSectorEmployee?: number; numComercialSectorEmployee?: number; numAdministrativeSectorEmployee?: number; unitMeasure?: string; monthlyWorkloadInMinutes?: number } | null
  ): Promise<number> => {
    const { data: itemRow } = await supabase
      .from('items')
      .select('id, cost_per_base_unit, cost_price, quantity')
      .eq('id', itemId)
      .single()
    if (!itemRow) return 0
    const itemCost = Number(itemRow.cost_per_base_unit) || 0

    const { data: productItemsRows } = await supabase
      .from('product_items')
      .select('product_id')
      .eq('item_id', itemId)
    const recipeProductIds = [...new Set((productItemsRows || []).map((r: any) => r.product_id))]

    const { data: revendaProducts } = await supabase
      .from('products')
      .select('id')
      .eq('base_item_id', itemId)
    const revendaProductIds = (revendaProducts || []).map((r: any) => r.id)

    const { data: serviceItemsRows } = await supabase
      .from('service_items')
      .select('service_id')
      .eq('item_id', itemId)
    const affectedServiceIds = [...new Set((serviceItemsRows || []).map((r: any) => r.service_id))]

    const allProductIds = [...new Set([...recipeProductIds, ...revendaProductIds])]
    const totalAffected = allProductIds.length + affectedServiceIds.length
    if (totalAffected === 0) return 0

    await supabase
      .from('product_items')
      .update({ cost_per_base_unit: itemCost })
      .eq('item_id', itemId)

    const itemQty = Number(itemRow.quantity) ?? 0
    await supabase
      .from('service_items')
      .update({ cost_per_base_unit: itemCost, item_quantity_snapshot: itemQty })
      .eq('item_id', itemId)

    const recalcSalePrice = async (prodId: string, profitPercent: number, commissionPercent: number) => {
      const { data: pricing } = await supabase
        .from('pricing_calculations')
        .select('product_workload')
        .eq('product_id', prodId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const workloadMinutes = Number(pricing?.product_workload) || 0
      const { data: calcResult, error: calcError } = await supabase.functions.invoke('calc-tax-engine', {
        body: {
          tenant_id: tenantId,
          product_id: prodId,
          sale_scope: 'INTRAESTADUAL',
          buyer_type: 'CONSUMIDOR_FINAL',
          commission_percent: commissionPercent || 0,
          profit_percent: profitPercent || 0,
          product_workload_minutes: workloadMinutes,
        },
      })
      if (calcError) {
        console.error(`[recalcSalePrice] Edge function error for product ${prodId}:`, calcError)
        return
      }
      if (calcResult?.success && calcResult?.sale_price_per_unit != null) {
        await supabase
          .from('products')
          .update({
            sale_price: Number(calcResult.sale_price_per_unit) || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', prodId)
      }
    }

    for (const rpId of revendaProductIds) {
      const { data: prod } = await supabase
        .from('products')
        .select('id, yield_quantity, profit_percent, commission_percent')
        .eq('id', rpId)
        .single()
      if (!prod) continue
      const yieldQty = Number(prod.yield_quantity) || 1
      const costTotal = itemCost * yieldQty
      await supabase
        .from('products')
        .update({ cost_total: costTotal, updated_at: new Date().toISOString() })
        .eq('id', rpId)
      await recalcSalePrice(rpId, Number(prod.profit_percent) ?? 0, Number(prod.commission_percent) ?? 0)
    }

    if (recipeProductIds.length > 0) {
      const { data: productsToUpdate } = await supabase
        .from('products')
        .select('id, yield_quantity, profit_percent, commission_percent')
        .in('id', recipeProductIds)
      for (const prod of productsToUpdate || []) {
        if (revendaProductIds.includes(prod.id)) continue
        const { data: recipe } = await supabase
          .from('product_items')
          .select('item_id, quantity_needed')
          .eq('product_id', prod.id)
        if (!recipe?.length) continue
        const itemIdsRecipe = recipe.map((r: any) => r.item_id)
        const { data: itemsCosts } = await supabase
          .from('items')
          .select('id, cost_per_base_unit')
          .in('id', itemIdsRecipe)
        const costByItem = (itemsCosts || []).reduce((acc: Record<string, number>, i: any) => {
          acc[i.id] = Number(i.cost_per_base_unit) || 0
          return acc
        }, {})
        let costTotal = 0
        for (const r of recipe) {
          costTotal += (Number(r.quantity_needed) || 0) * (costByItem[r.item_id] ?? 0)
        }
        await supabase
          .from('products')
          .update({ cost_total: costTotal, updated_at: new Date().toISOString() })
          .eq('id', prod.id)
        await recalcSalePrice(prod.id, Number(prod.profit_percent) ?? 0, Number(prod.commission_percent) ?? 0)
      }
    }

    if (affectedServiceIds.length > 0) {
      const [cfgRes, taxPreview] = await Promise.all([
        supabase.from('tenant_expense_config').select('*').eq('tenant_id', tenantId).single(),
        fetchTaxPreview(tenantId),
      ])
      const expenseConfig = cfgRes.data || null

      for (const serviceId of affectedServiceIds) {
        const { data: siRows } = await supabase
          .from('service_items')
          .select('item_id, quantity')
          .eq('service_id', serviceId)
        if (!siRows?.length) continue
        const itemIds = siRows.map((r: any) => r.item_id)
        const { data: itemsCosts } = await supabase
          .from('items')
          .select('id, cost_per_base_unit')
          .in('id', itemIds)
        const costByItem = (itemsCosts || []).reduce((acc: Record<string, number>, i: any) => {
          acc[i.id] = Number(i.cost_per_base_unit) || 0
          return acc
        }, {})
        let costTotal = 0
        for (const si of siRows) {
          costTotal += (Number(si.quantity) || 0) * (costByItem[si.item_id] ?? 0)
        }

        const { data: svc } = await supabase
          .from('services')
          .select('id, commission_percent, profit_percent, taxable_regime_percent')
          .eq('id', serviceId)
          .single()
        if (!svc) continue

        const { sellingPrice, laborCost } = computeServiceSellingPrice({
          materialCost: costTotal,
          commissionPercent: Number(svc.commission_percent) || 0,
          profitPercent: Number(svc.profit_percent) || 0,
          taxableRegimePercent: Number(svc.taxable_regime_percent) || 0,
          expenseConfig,
          taxPreview: taxPreview || null,
          currentUser: currentUserForService,
        })

        await supabase
          .from('services')
          .update({
            cost_total: costTotal,
            base_price: sellingPrice,
            labor_cost: laborCost,
            updated_at: new Date().toISOString(),
          })
          .eq('id', serviceId)
      }
    }

    return totalAffected
  }

  const handleUpdateProductsForItem = async (itemId: string) => {
    const tenantId = contextTenantId ?? currentUser?.tenant_id
    if (!tenantId) {
      messageApi.error('Sessão inválida.')
      return
    }
    setUpdatingProductsForItemId(itemId)
    try {
      const count = await updateProductsForItemCore(itemId, tenantId, currentUser ?? null)
      if (count === 0) {
        messageApi.info('Nenhum produto nem serviço usa este item.')
      } else {
        setSavedCostMap(prev => {
          const item = data.find(d => d.id === itemId)
          return item ? { ...prev, [itemId]: item.cost_per_base_unit } : prev
        })
        await reloadItems()
        messageApi.success('Produtos e serviços vinculados a este item foram atualizados (custo e preço de venda).')
      }
    } catch (ex: any) {
      messageApi.error(ex?.message || 'Erro ao atualizar produtos e serviços.')
    } finally {
      setUpdatingProductsForItemId(null)
    }
  }

  const handleUpdateAllProducts = async () => {
    const tenantId = contextTenantId ?? currentUser?.tenant_id
    if (!tenantId) {
      messageApi.error('Sessão inválida.')
      return
    }
    setUpdatingAllProducts(true)
    try {
      const dirtyIds = Array.from(dirtyItems)
      for (const itemId of dirtyIds) {
        await updateProductsForItemCore(itemId, tenantId, currentUser ?? null)
      }
      setSavedCostMap(prev => {
        const newMap = { ...prev }
        for (const itemId of dirtyIds) {
          const item = data.find(d => d.id === itemId)
          if (item) newMap[itemId] = item.cost_per_base_unit
        }
        return newMap
      })
      await reloadItems()
      messageApi.success('Todos os produtos e serviços foram atualizados!')
    } catch (ex: any) {
      messageApi.error(ex?.message || 'Erro ao atualizar produtos e serviços.')
    } finally {
      setUpdatingAllProducts(false)
    }
  }

  const handleSearch = (value: string) => {
    setSearchText(value)
  }

  const handleSaveItem = async () => {
    try {
      await form.validateFields()
      setSaving(true)

      const values = form.getFieldsValue()
      const tenantId = contextTenantId ?? currentUser?.tenant_id
      if (!tenantId) {
        messageApi.error('Não foi possível identificar o tenant.')
        return
      }
      const createdBy = await getCurrentUserId()
      if (!createdBy) {
        messageApi.error('Sessão inválida. Faça login novamente.')
        setSaving(false)
        return
      }

      const priceNumber = parseFloat(
        String(values.price).replace(/\./g, '').replace(',', '.')
      )

      const qty = Number(values.quantity) || 1
      const measureQty = Number(values.measure_quantity) || 1
      const stockQty = qty * measureQty
      const costPerBaseUnit = priceNumber
      const totalCost = priceNumber * qty

      const itemData = {
        tenant_id: tenantId,
        name: values.name,
        code: values.code || null,
        item_type: values.item_type || 'INSUMO',
        ncm_code: values.ncm_code ? values.ncm_code.replace(/\D/g, '') : null,
        quantity: qty,
        measure_quantity: Number(values.measure_quantity) || 1,
        unit: values.unitType,
        cost_price: totalCost,
        cost_per_base_unit: costPerBaseUnit,
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

        await reloadItems()
        onClose()

        if (newProduct) {
          messageApi.success('Item salvo! Para precificar, acesse Produtos quando quiser.')
          return
        }
      }

      await reloadItems()
      messageApi.success('Item salvo!')
      onClose()
    } catch (ex: any) {
      messageApi.error(ex?.message || 'Preencha todos os campos obrigatórios.')
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<ItemRow> = [
    {
      title: 'Nome',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => collator.compare(a.name, b.name),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Tipo',
      dataIndex: 'item_type',
      key: 'item_type',
      width: 130,
      filters: [
        { text: 'Insumos para beneficiamento', value: 'INSUMO' },
        { text: 'Revenda', value: 'REVENDA' },
      ],
      onFilter: (value, record) => record.item_type === value,
      render: (v: string) => {
        const cfg = ITEM_TYPE_LABELS[v] || ITEM_TYPE_LABELS.INSUMO
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'QTD. Medida',
      key: 'qty_medida',
      width: 110,
      render: (_, record) => `${record.measure_quantity} ${(UNIT_TYPE as any)[record.unitType] || record.unitType}`,
    },
    {
      title: 'Custo/Unid.',
      key: 'unit_price',
      width: 120,
      render: (_, record) => {
        const perUnit = record.cost_per_base_unit ?? (record.quantity > 0 ? record.price / record.quantity : 0)
        return `R$ ${getMonetaryValue(perUnit)}`
      },
    },
    {
      title: 'QTD. Estoque',
      key: 'stock_qty',
      width: 110,
      align: 'center',
      render: (_, record) => {
        const qty = stockMap[record.id]
        return qty !== undefined
          ? `${qty} ${(UNIT_TYPE as any)[record.unitType] || record.unitType}`
          : <span style={{ color: '#D0D5DD' }}>—</span>
      },
    },
    {
      title: 'Ações',
      key: 'action',
      width: 180,
      render: (_, record: ItemRow) => (
        <Space size="small" wrap>
          <Button onClick={() => handleEdit(record)} type="link" size="small">Editar</Button>
          {canEdit(MODULES.ITEMS) && (
            <Button type="link" size="small" danger onClick={() => handleDeleteItem(record)}>
              Excluir item
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Layout title={PAGE_TITLES.ITEMS}>
      {contextHolder}

      <div className="pc-card--table">
        <div className="filter-bar">
          <Input
            placeholder="Buscar item pelo nome..."
            prefix={<SearchOutlined />}
            onChange={e => handleSearch(e.target.value)}
            style={{ maxWidth: 320 }}
            allowClear
          />
          <div style={{ flex: 1 }} />
          <Space size="middle">
            {canEdit(MODULES.ITEMS) && (
              <>
                <Button
                  onClick={openRenewDrawer}
                  style={{
                    background: '#FEF08A',
                    borderColor: '#FDE047',
                    color: '#854D0E',
                  }}
                >
                  + Renovar quantidade
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem}>
                  Adicionar item
                </Button>
              </>
            )}
          </Space>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey="id"
            size="middle"
            pagination={{ pageSize: 10, showTotal: t => `${t} itens` }}
            locale={{ emptyText: 'Nenhum item cadastrado. Clique em "Adicionar item" para começar.' }}
          />
        )}
      </div>

      <Drawer
        title={titleDrawer}
        width={680}
        onClose={onClose}
        open={newItemOpen}
        extra={
          <Space>
            <Button onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSaveItem} type="primary" loading={saving}>Salvar</Button>
          </Space>
        }
      >
        <NewItemForm form={form} />
      </Drawer>

      <Drawer
        title="Renovar quantidade"
        width={680}
        onClose={closeRenewDrawer}
        open={renewDrawerOpen}
        extra={
          <Space>
            <Button onClick={closeRenewDrawer}>Cancelar</Button>
            <Button onClick={handleSaveRenew} type="primary" loading={savingRenew}>Salvar</Button>
          </Space>
        }
      >
        <RenewQuantityForm
          form={renewForm}
          mode={renewMode}
          onModeChange={setRenewMode}
          items={data.map(d => ({
            id: d.id,
            name: d.name,
            ncm_code: d.ncm_code,
            unitType: d.unitType,
            quantity: d.quantity,
            cost_price: d.price,
          }))}
        />
      </Drawer>

      <Modal
        title="Excluir item"
        open={!!deleteConfirmItem}
        onCancel={() => setDeleteConfirmItem(null)}
        onOk={handleConfirmDeleteItem}
        okText="Sim, excluir"
        cancelText="Cancelar"
        okButtonProps={{ danger: true, loading: deletingItem }}
      >
        <p>Tem certeza que deseja excluir <strong>"{deleteConfirmItem?.name}"</strong>?</p>
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Esta ação não pode ser desfeita.</p>
      </Modal>

      <Drawer
        title={`Excluir item: ${selectedItemForDelete?.name || ''}`}
        width={680}
        open={deleteQtyDrawerOpen}
        onClose={() => { setDeleteQtyDrawerOpen(false); setSelectedItemForDelete(null) }}
        extra={
          <Space>
            <Button onClick={() => { setDeleteQtyDrawerOpen(false); setSelectedItemForDelete(null) }}>Cancelar</Button>
            <Button type="primary" danger onClick={handleConfirmDeleteQty}>Excluir item</Button>
          </Space>
        }
      >
        {selectedItemForDelete && (
          <div style={{ padding: 12, background: '#0a1628', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            Quantidade atual: <strong>{selectedItemForDelete.quantity} {(UNIT_TYPE as Record<string, string>)[selectedItemForDelete.unitType] || selectedItemForDelete.unitType}</strong>
            <div style={{ marginTop: 4 }}>
              {selectedItemForDelete.item_type === 'REVENDA' ? 'Produto de revenda: a baixa será refletida no estoque de produtos acabados.' : 'Insumo: a baixa será refletida no estoque de itens/insumos.'}
            </div>
          </div>
        )}
        <Form form={deleteQtyForm} layout="vertical">
          <Form.Item name="scope" label="Excluir">
            <Radio.Group>
              <Radio value="total">
                Total ({selectedItemForDelete?.quantity ?? 0} {(UNIT_TYPE as Record<string, string>)[selectedItemForDelete?.unitType || ''] || selectedItemForDelete?.unitType})
              </Radio>
              <Radio value="parcial">Quantidade parcial</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.scope !== curr.scope}>
            {({ getFieldValue }) =>
              getFieldValue('scope') === 'parcial' ? (
                <Form.Item
                  name="quantity"
                  label="Quantidade a excluir"
                  rules={[
                    { required: true, message: 'Informe a quantidade' },
                    {
                      validator: (_, v) => {
                        const n = Number(v)
                        const max = selectedItemForDelete?.quantity ?? 0
                        if (isNaN(n) || n <= 0) return Promise.reject(new Error('Quantidade inválida'))
                        if (n > max) return Promise.reject(new Error(`Máximo: ${max}`))
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <InputNumber
                    min={0.001}
                    max={selectedItemForDelete?.quantity ?? 0}
                    step={1}
                    style={{ width: '100%' }}
                    addonAfter={(UNIT_TYPE as Record<string, string>)[selectedItemForDelete?.unitType || ''] || selectedItemForDelete?.unitType}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="reason" label="Motivo (opcional)">
            <Input placeholder="Ex: perda, vencimento..." />
          </Form.Item>
        </Form>
      </Drawer>
    </Layout>
  )
}

export default Items
