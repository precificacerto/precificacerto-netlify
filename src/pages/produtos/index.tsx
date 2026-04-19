import { useState, useMemo, useEffect } from 'react'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { Button, Empty, Form, Input, InputNumber, message, Modal, Radio, Select, Space, Table, Tag, Tooltip, Drawer, Spin } from 'antd'
import type { FormInstance } from 'antd'
import { ColumnsType } from 'antd/es/table'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  ExclamationCircleOutlined, MinusCircleOutlined, AppstoreAddOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { supabase } from '@/supabase/client'
import { useProducts, useStock } from '@/hooks/use-data.hooks'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import { calculateItemPrice } from '@/utils/calculate-item-price'

const UNIT_LABELS: Record<string, string> = {
  G: 'g', KG: 'kg', ML: 'ml', L: 'l', UN: 'un', M: 'm', CM: 'cm', MM: 'mm',
}

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

type ProductRow = {
  key: string
  id: string
  code: string
  section_id: string | null
  commission_table_id: string | null
  name: string
  description: string
  sale_price: number
  cost_total: number
  unit: string
  yield_quantity: number
  status: string
  stock_quantity: number | null
  stock_unit: string
  profit_percent: number | null
  needs_cost_update: boolean
  product_type: string
  taxes_launched: boolean | null
  pending_item_id?: string | null
}

type RenewProductOption = {
  id: string
  name: string
  code: string
  yield_unit: string
  product_type: 'PRODUZIDO' | 'REVENDA'
  profit_percent?: number
  commission_percent?: number
  product_items: Array<{
    item_id: string
    quantity_needed: number
    items?: { id: string; name: string; unit: string; cost_price: number; quantity: number; cost_per_base_unit?: number }
  }>
  pricing_calculations?: Array<{ profit_percent?: number; commission_percent?: number; product_workload?: number }>
}

function Products() {
  const { data: rawProducts, isLoading, mutate: reloadProducts } = useProducts()
  const { data: rawStock, mutate: reloadStock } = useStock()
  const { tenantId: contextTenantId, currentUser } = useAuth()
  const { canView, canEdit } = usePermissions()
  const [searchText, setSearchText] = useState('')
  const router = useRouter()
  const [renewDrawerOpen, setRenewDrawerOpen] = useState(false)
  const [renewForm] = Form.useForm()
  const [savingRenew, setSavingRenew] = useState(false)
  const [renewProductList, setRenewProductList] = useState<RenewProductOption[]>([])
  const [loadingProduzido, setLoadingProduzido] = useState(false)
  const [renewProductDetail, setRenewProductDetail] = useState<RenewProductOption | null>(null)
  const [deleteQtyDrawerOpen, setDeleteQtyDrawerOpen] = useState(false)
  const [selectedProductForDelete, setSelectedProductForDelete] = useState<ProductRow | null>(null)
  const [deleteQtyForm] = Form.useForm()
  const [savingDeleteQty, setSavingDeleteQty] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null)
  const [updatingAllProductsFlag, setUpdatingAllProductsFlag] = useState(false)
  const effectiveTenantId = contextTenantId ?? currentUser?.tenant_id

  // Product sections state
  const [sectionModalOpen, setSectionModalOpen] = useState(false)
  const [sections, setSections] = useState<{ id: string; name: string }[]>([])
  const [loadingSections, setLoadingSections] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [savingSection, setSavingSection] = useState(false)

  // Commission tables state
  const [commissionTablesLoaded, setCommissionTablesLoaded] = useState(false)
  const [commissionTables, setCommissionTables] = useState<{ id: string; name: string; commission_percent: number }[]>([])
  const [pendingRevendaItems, setPendingRevendaItems] = useState<{ id: string; name: string; product_table_id: string; unit: string; cost_price: number | null }[]>([])
  const [tableFilter, setTableFilter] = useState<string | null>(null)
  const [calcType, setCalcType] = useState<string | null>(null)
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableNotes, setNewTableNotes] = useState<string>('')
  const [savingTable, setSavingTable] = useState(false)
  // Edit table name state
  const [editTableModalOpen, setEditTableModalOpen] = useState(false)
  const [editingTableId, setEditingTableId] = useState<string | null>(null)
  const [editTableName, setEditTableName] = useState('')
  const [savingEditTable, setSavingEditTable] = useState(false)

  const loadSections = async () => {
    const tenantId = await getTenantId()
    if (!tenantId) return
    setLoadingSections(true)
    try {
      const { data, error } = await supabase
        .from('product_sections')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
      if (!error && data) setSections(data)
    } finally {
      setLoadingSections(false)
    }
  }

  const handleCreateSection = async () => {
    const name = newSectionName.trim()
    if (!name) { message.warning('Informe o nome da seção.'); return }

    const tenantId = await getTenantId()
    if (!tenantId) {
      message.error('Sessão inválida. Recarregue a página.')
      return
    }

    setSavingSection(true)
    try {
      const { data, error } = await supabase
        .from('product_sections')
        .insert({ tenant_id: tenantId, name })
        .select()
        .single()

      if (error) {
        console.error('Erro ao criar seção:', error)
        message.error('Erro ao salvar seção: ' + error.message)
        return
      }

      setNewSectionName('')
      setSections(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)))
      message.success('Seção criada com sucesso!')
    } catch (ex: any) {
      message.error('Erro inesperado: ' + ex.message)
    } finally {
      setSavingSection(false)
    }
  }

  const handleDeleteSection = async (id: string) => {
    try {
      const { error } = await supabase.from('product_sections').delete().eq('id', id)
      if (error) throw error
      setSections(prev => prev.filter(s => s.id !== id))
      message.success('Seção removida.')
    } catch (err: any) {
      message.error(`Erro ao remover seção: ${err.message}`)
    }
  }

  const loadCommissionTables = async () => {
    const tenantId = await getTenantId()
    if (!tenantId) return
    const { data } = await (supabase as any)
      .from('commission_tables')
      .select('id, name, commission_percent')
      .eq('type', 'PRODUCT')
      .order('name')
    if (data) {
      setCommissionTables(data.map((t: any) => ({ ...t, commission_percent: Number(t.commission_percent) })))
      if (data.length > 0) setTableFilter(data[0].id)
    }
    setCommissionTablesLoaded(true)
  }

  useEffect(() => { loadCommissionTables() }, [])

  useEffect(() => {
    const fetchCalcType = async () => {
      const tenantId = await getTenantId()
      if (!tenantId) return
      const { data } = await (supabase as any)
        .from('tenant_settings')
        .select('calc_type')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (data?.calc_type) setCalcType(data.calc_type)
    }
    fetchCalcType()
  }, [])

  const handleCreateTable = async () => {
    const name = newTableName.trim()
    if (!name) { message.warning('Informe o nome da tabela.'); return }
    const tenantId = await getTenantId()
    if (!tenantId) { message.error('Sessão inválida.'); return }
    setSavingTable(true)
    try {
      const { data, error } = await (supabase as any)
        .from('commission_tables')
        .insert({ tenant_id: tenantId, type: 'PRODUCT', name, commission_percent: 0, notes: newTableNotes.trim() || null })
        .select()
        .single()
      if (error) { message.error('Erro ao criar tabela: ' + error.message); return }
      setCommissionTables(prev => [...prev, { id: data.id, name: data.name, commission_percent: Number(data.commission_percent) }].sort((a, b) => a.name.localeCompare(b.name)))
      setNewTableName('')
      setNewTableNotes('')
      setTableModalOpen(false)
      message.success('Tabela criada!')
    } finally {
      setSavingTable(false)
    }
  }

  const handleOpenEditTable = (id: string, currentName: string) => {
    setEditingTableId(id)
    setEditTableName(currentName)
    setEditTableModalOpen(true)
  }

  const handleSaveEditTable = async () => {
    const name = editTableName.trim()
    if (!name || !editingTableId) { message.warning('Informe o nome da tabela.'); return }
    setSavingEditTable(true)
    try {
      const { error } = await (supabase as any)
        .from('commission_tables')
        .update({ name })
        .eq('id', editingTableId)
      if (error) { message.error('Erro ao atualizar tabela: ' + error.message); return }
      setCommissionTables(prev => prev.map(t => t.id === editingTableId ? { ...t, name } : t))
      setEditTableModalOpen(false)
      message.success('Nome da tabela atualizado!')
    } finally {
      setSavingEditTable(false)
    }
  }

  const stockByProductId = useMemo(() => {
    const map: Record<string, { qty: number; unit: string }> = {}
    if (!rawStock) return map
    for (const s of rawStock as any[]) {
      if (s.product_id && s.stock_type === 'PRODUCT') {
        map[s.product_id] = {
          qty: Number(s.quantity_current) || 0,
          unit: (s.unit || 'UN').toString(),
        }
      }
    }
    return map
  }, [rawStock])

  const stockIdByProductId = useMemo(() => {
    const map: Record<string, string> = {}
    if (!rawStock) return map
    for (const s of rawStock as any[]) {
      if (s.product_id && s.stock_type === 'PRODUCT' && s.id) {
        map[s.product_id] = s.id
      }
    }
    return map
  }, [rawStock])

  // Carrega itens de revenda vinculados a uma tabela de produto que ainda não viraram produto.
  useEffect(() => {
    if (!effectiveTenantId) { setPendingRevendaItems([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await (supabase as any)
        .from('items')
        .select('id, name, product_table_id, unit, cost_price, item_type')
        .eq('tenant_id', effectiveTenantId)
        .eq('item_type', 'REVENDA')
        .not('product_table_id', 'is', null)
        .or('is_active.is.null,is_active.eq.true')
      if (cancelled || !data) return
      const linkedIds = new Set<string>()
      for (const p of (rawProducts || []) as any[]) {
        for (const pi of (p.product_items || []) as any[]) {
          if (pi.item_id) linkedIds.add(pi.item_id)
        }
      }
      const pending = (data as any[]).filter((i: any) => !linkedIds.has(i.id))
      setPendingRevendaItems(pending)
    })()
    return () => { cancelled = true }
  }, [effectiveTenantId, rawProducts])

  const data = useMemo<ProductRow[]>(() => {
    return (rawProducts || []).map((p: any) => {
      const pricing = p.pricing_calculations?.[0]
      const stock = stockByProductId[p.id]
      const salePrice = Number(p.sale_price) ?? (pricing?.sale_price_per_unit ? Number(pricing.sale_price_per_unit) : 0)
      const costTotal = Number(p.cost_total) ?? (pricing?.cmv != null ? Number(pricing.cmv) : 0)
      return {
        key: p.id,
        id: p.id,
        code: p.code || '',
        section_id: p.section_id || null,
        commission_table_id: p.commission_table_id || null,
        name: p.name,
        description: p.description || '',
        sale_price: salePrice,
        cost_total: costTotal,
        unit: p.unit || 'UN',
        yield_quantity: Number(p.yield_quantity) || 1,
        status: p.status || 'ACTIVE',
        stock_quantity: stock ? stock.qty : null,
        stock_unit: stock?.unit || p.unit || 'UN',
        profit_percent: pricing?.pct_profit_margin != null ? Number(pricing.pct_profit_margin) : null,
        needs_cost_update: Boolean(p.needs_cost_update),
        product_type: p.product_type || 'PRODUZIDO',
        taxes_launched: p.taxes_launched ?? null,
      }
    })
  }, [rawProducts, stockByProductId])

  const filteredData = useMemo<ProductRow[]>(() => {
    if (!tableFilter) return []
    let result = data.filter(p => p.commission_table_id === tableFilter)
    // Para regime Prestação de Serviço, exibir apenas produtos que possuem itens com item_type = 'REVENDA'
    if (calcType === 'SERVICO') {
      result = result.filter(p => {
        const rawP = (rawProducts || []).find((r: any) => r.id === p.id)
        const productItems = rawP?.product_items || []
        return productItems.some((pi: any) => pi.items?.item_type === 'REVENDA')
      })
    }

    // Itens de revenda vinculados a esta tabela mas ainda não precificados → rows virtuais pendentes.
    const pendingRows: ProductRow[] = pendingRevendaItems
      .filter((it) => it.product_table_id === tableFilter)
      .map((it) => ({
        key: `pending-item-${it.id}`,
        id: it.id,
        code: '',
        section_id: null,
        commission_table_id: tableFilter,
        name: it.name,
        description: '',
        sale_price: 0,
        cost_total: Number(it.cost_price) || 0,
        unit: it.unit || 'UN',
        yield_quantity: 1,
        status: 'PENDING',
        stock_quantity: null,
        stock_unit: it.unit || 'UN',
        profit_percent: null,
        needs_cost_update: false,
        product_type: 'REVENDA',
        taxes_launched: null,
        pending_item_id: it.id,
      }))
    result = [...pendingRows, ...result]

    if (!searchText) return result
    const s = searchText.toLowerCase()
    return result.filter(p => p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s))
  }, [data, rawProducts, searchText, tableFilter, calcType, pendingRevendaItems])

  useEffect(() => {
    if (!renewDrawerOpen || !effectiveTenantId) return
    setLoadingProduzido(true)
    ;(async () => {
      try {
        const { data: productsList, error: errProducts } = await supabase
          .from('products')
          .select('id, name, code, yield_unit, profit_percent, commission_percent, product_type')
          .eq('tenant_id', effectiveTenantId)
          .in('product_type', ['PRODUZIDO', 'REVENDA'])
        if (errProducts || !productsList?.length) {
          setRenewProductList([])
          setRenewProductDetail(null)
          renewForm.resetFields()
          return
        }
        const productIds = productsList.map((p: any) => p.id)
        const { data: itemsRows, error: errItems } = await supabase
          .from('product_items')
          .select(`
            product_id, item_id, quantity_needed,
            items ( id, name, unit, cost_price, quantity, cost_per_base_unit )
          `)
          .in('product_id', productIds)
        const itemsByProductId: Record<string, any[]> = {}
        if (!errItems && itemsRows) {
          for (const row of itemsRows as any[]) {
            const pid = row.product_id
            if (!itemsByProductId[pid]) itemsByProductId[pid] = []
            itemsByProductId[pid].push({
              item_id: row.item_id,
              quantity_needed: row.quantity_needed,
              items: row.items,
            })
          }
        }
        const { data: pricingRows } = await supabase
          .from('pricing_calculations')
          .select('product_id, pct_profit_margin, pct_commission, product_workload, created_at')
          .in('product_id', productIds)
          .order('created_at', { ascending: false })
        const pricingByProductId: Record<string, any> = {}
        if (pricingRows) {
          for (const row of pricingRows as any[]) {
            if (row.product_id && !pricingByProductId[row.product_id]) {
              pricingByProductId[row.product_id] = {
                ...row,
                profit_percent: row.pct_profit_margin,
                commission_percent: row.pct_commission,
              }
            }
          }
        }
        const withItems: RenewProductOption[] = productsList.map((p: any) => ({
          id: p.id,
          name: p.name,
          code: p.code || '',
          yield_unit: p.yield_unit || 'UN',
          product_type: p.product_type || 'PRODUZIDO',
          profit_percent: p.profit_percent,
          commission_percent: p.commission_percent,
          product_items: itemsByProductId[p.id] || [],
          pricing_calculations: pricingByProductId[p.id] ? [pricingByProductId[p.id]] : [],
        }))
        setRenewProductList(withItems)
        setRenewProductDetail(null)
        renewForm.resetFields()
      } finally {
        setLoadingProduzido(false)
      }
    })()
  }, [renewDrawerOpen, effectiveTenantId, renewForm])

  const selectedProductId = Form.useWatch('product_id', renewForm)
  useEffect(() => {
    if (!selectedProductId || !renewProductList.length) {
      setRenewProductDetail(null)
      return
    }
    const detail = renewProductList.find((p) => p.id === selectedProductId) || null
    setRenewProductDetail(detail)
  }, [selectedProductId, renewProductList])

  const handleSaveRenew = async () => {
    try {
      const values = await renewForm.validateFields()
      const productId = values.product_id
      const quantityProduced = Number(values.quantity) || 0
      const product = renewProductList.find((p) => p.id === productId)
      if (!product) {
        message.error('Produto não encontrado.')
        return
      }
      if (quantityProduced < 0.001) {
        message.error('Informe uma quantidade válida.')
        return
      }
      const tenantId = await getTenantId()
      if (!tenantId) {
        message.error('Não foi possível identificar o tenant.')
        return
      }
      setSavingRenew(true)
      const createdBy = await getCurrentUserId()
      if (!createdBy) {
        message.error('Sessão inválida. Faça login novamente.')
        setSavingRenew(false)
        return
      }

      const isRevenda = product.product_type === 'REVENDA' || !product.product_items?.length

      if (isRevenda) {
        // Revenda: apenas adicionar quantidade ao estoque do produto (sem ingredientes)
        const { data: productStock } = await supabase
          .from('stock')
          .select('id, quantity_current')
          .eq('product_id', productId)
          .eq('stock_type', 'PRODUCT')
          .maybeSingle()
        let newProductQty = quantityProduced
        if (productStock) {
          const current = Number(productStock.quantity_current) || 0
          newProductQty = current + quantityProduced
          await supabase.from('stock').update({ quantity_current: newProductQty, updated_at: new Date().toISOString() }).eq('id', productStock.id)
          await supabase.from('stock_movements').insert({ stock_id: productStock.id, delta_quantity: quantityProduced, reason: `Renovar quantidade — ${quantityProduced} un.`, created_by: createdBy })
        } else {
          await supabase.from('stock').insert({
            tenant_id: tenantId,
            product_id: productId,
            stock_type: 'PRODUCT',
            quantity_current: quantityProduced,
            min_limit: 0,
            unit: product.yield_unit || 'UN',
          })
          const { data: newSt } = await supabase.from('stock').select('id').eq('product_id', productId).eq('stock_type', 'PRODUCT').single()
          if (newSt) {
            await supabase.from('stock_movements').insert({ stock_id: newSt.id, delta_quantity: quantityProduced, reason: `Renovar quantidade — ${quantityProduced} un.`, created_by: createdBy })
          }
        }
        await supabase.from('products').update({ quantity: newProductQty, updated_at: new Date().toISOString() }).eq('id', productId)
        message.success(`Quantidade de ${quantityProduced} un. adicionada ao produto!`)
        setRenewDrawerOpen(false)
        renewForm.resetFields()
        setRenewProductDetail(null)
        await Promise.all([reloadProducts(), reloadStock()])
        setSavingRenew(false)
        return
      }

      const pc = product.pricing_calculations?.[0]
      const profitPercent = Number(pc?.profit_percent ?? product.profit_percent) ?? 0
      const commissionPercent = Number(pc?.commission_percent ?? product.commission_percent) ?? 0

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
        required.push({ item_id: pi.item_id, name: itemName, required: requiredTotal, available })
        if (available < requiredTotal) {
          message.error(`Estoque insuficiente de "${itemName}": necessário ${requiredTotal}, disponível ${available}.`)
          setSavingRenew(false)
          return
        }
      }

      const { data: production, error: errProd } = await supabase
        .from('productions')
        .insert({ tenant_id: tenantId, product_id: productId, quantity: quantityProduced })
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
          await supabase.from('stock').update({ quantity_current: newQty, updated_at: new Date().toISOString() }).eq('id', st.id)
          await supabase.from('stock_movements').insert({ stock_id: st.id, delta_quantity: -quantityUsed, reason: `Produção — ${product.name}`, created_by: createdBy })
        }
        const { data: itemRow } = await supabase.from('items').select('quantity, cost_per_base_unit').eq('id', r.item_id).single()
        if (itemRow) {
          const newItemQty = Math.max(0, (Number(itemRow.quantity) || 0) - quantityUsed)
          const unitCost = Number(itemRow.cost_per_base_unit) || 0
          const newCostTotal = newItemQty * unitCost
          await supabase.from('items').update({ quantity: newItemQty, cost_price: newCostTotal, updated_at: new Date().toISOString() }).eq('id', r.item_id)
        }
      }

      const { data: productStock } = await supabase
        .from('stock')
        .select('id, quantity_current')
        .eq('product_id', productId)
        .eq('stock_type', 'PRODUCT')
        .maybeSingle()
      let newProductQty = quantityProduced
      if (productStock) {
        const current = Number(productStock.quantity_current) || 0
        newProductQty = current + quantityProduced
        await supabase.from('stock').update({ quantity_current: newProductQty, updated_at: new Date().toISOString() }).eq('id', productStock.id)
        await supabase.from('stock_movements').insert({ stock_id: productStock.id, delta_quantity: quantityProduced, reason: `Produção — ${quantityProduced} un.`, created_by: createdBy })
      } else {
        await supabase.from('stock').insert({
          tenant_id: tenantId,
          product_id: productId,
          stock_type: 'PRODUCT',
          quantity_current: quantityProduced,
          min_limit: 0,
          unit: product.yield_unit || 'UN',
        })
        const { data: newSt } = await supabase.from('stock').select('id').eq('product_id', productId).eq('stock_type', 'PRODUCT').single()
        if (newSt) {
          await supabase.from('stock_movements').insert({ stock_id: newSt.id, delta_quantity: quantityProduced, reason: `Produção — ${quantityProduced} un.`, created_by: createdBy })
        }
      }
      await supabase.from('products').update({ quantity: newProductQty, updated_at: new Date().toISOString() }).eq('id', productId)

      // Recalcular custo do produto com valor unitário atual dos ingredientes e atualizar preço de venda (lucro e comissão já cadastrados)
      const itemIdsRenew = product.product_items.map((pi: any) => pi.item_id)
      const { data: itemsCurrent } = await supabase
        .from('items')
        .select('id, cost_per_base_unit')
        .in('id', itemIdsRenew)
      const unitCostByItemId = (itemsCurrent || []).reduce((acc: Record<string, number>, i: any) => {
        acc[i.id] = Number(i.cost_per_base_unit) || 0
        return acc
      }, {})
      let batchCost = 0
      for (const pi of product.product_items) {
        const qty = Number(pi.quantity_needed) || 0
        const unitCost = unitCostByItemId[pi.item_id] ?? 0
        batchCost += qty * unitCost
      }
      const costUnit = batchCost
      await supabase
        .from('products')
        .update({ cost_total: costUnit, updated_at: new Date().toISOString() })
        .eq('id', productId)

      const workloadMinutes = Number(product?.pricing_calculations?.[0]?.product_workload) || 0
      const { data: calcResult } = await supabase.functions.invoke('calc-tax-engine', {
        body: {
          tenant_id: tenantId,
          product_id: productId,
          sale_scope: 'DOMESTIC',
          buyer_type: 'FINAL_CONSUMER',
          commission_percent: commissionPercent,
          profit_percent: profitPercent,
          product_workload_minutes: workloadMinutes,
        },
      })
      if (calcResult?.success && calcResult?.sale_price_per_unit != null) {
        await supabase.from('products').update({
          sale_price: Number(calcResult.sale_price_per_unit) || 0,
          updated_at: new Date().toISOString(),
        }).eq('id', productId)
      }

      message.success(`Produção de ${quantityProduced} un. registrada! Preço de venda mantido com os percentuais já cadastrados.`)
      setRenewDrawerOpen(false)
      renewForm.resetFields()
      setRenewProductDetail(null)
      await Promise.all([reloadProducts(), reloadStock()])
    } catch (e: any) {
      message.error(e?.message || 'Erro ao renovar quantidade.')
    } finally {
      setSavingRenew(false)
    }
  }

  const handleUpdateProduct = async (productId: string) => {
    const tenantId = await getTenantId()
    if (!tenantId) { message.error('Sessão inválida.'); return }
    setUpdatingProductId(productId)
    try {
      const { data: prod } = await supabase
        .from('products')
        .select('id, yield_quantity, profit_percent, commission_percent, product_type, base_item_id')
        .eq('id', productId)
        .single()
      if (!prod) return

      let costTotal = 0

      if ((prod as any).product_type === 'REVENDA' && (prod as any).base_item_id) {
        const { data: baseItem } = await supabase
          .from('items')
          .select('cost_per_base_unit')
          .eq('id', (prod as any).base_item_id)
          .single()
        if (baseItem) {
          const yieldQty = Number((prod as any).yield_quantity) || 1
          costTotal = (Number(baseItem.cost_per_base_unit) || 0) * yieldQty
        }
      } else {
        const { data: recipe } = await supabase
          .from('product_items')
          .select('item_id, quantity_needed')
          .eq('product_id', productId)
        if (recipe?.length) {
          const itemIds = recipe.map((r: any) => r.item_id)
          const { data: itemsCosts } = await supabase
            .from('items')
            .select('id, cost_per_base_unit')
            .in('id', itemIds)
          const costByItem = (itemsCosts || []).reduce((acc: Record<string, number>, i: any) => {
            acc[i.id] = Number(i.cost_per_base_unit) || 0
            return acc
          }, {})
          for (const r of recipe) {
            costTotal += (Number(r.quantity_needed) || 0) * (costByItem[r.item_id] ?? 0)
          }
        }
      }

      await supabase
        .from('products')
        .update({ cost_total: costTotal, updated_at: new Date().toISOString() })
        .eq('id', productId)

      const { data: pricingRow } = await supabase
        .from('pricing_calculations')
        .select('product_workload')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const workloadMinutes = Number((pricingRow as any)?.product_workload) || 0

      const { data: calcResult } = await supabase.functions.invoke('calc-tax-engine', {
        body: {
          tenant_id: tenantId,
          product_id: productId,
          sale_scope: 'INTRAESTADUAL',
          buyer_type: 'CONSUMIDOR_FINAL',
          commission_percent: Number((prod as any).commission_percent) || 0,
          profit_percent: Number((prod as any).profit_percent) || 0,
          product_workload_minutes: workloadMinutes,
        },
      })
      if (calcResult?.success && calcResult?.sale_price_per_unit != null) {
        await supabase
          .from('products')
          .update({ sale_price: Number(calcResult.sale_price_per_unit) || 0, updated_at: new Date().toISOString() })
          .eq('id', productId)
      }

      await supabase
        .from('products')
        .update({ needs_cost_update: false })
        .eq('id', productId)

      await Promise.all([reloadProducts(), reloadStock()])
    } catch (e: any) {
      message.error(e?.message || 'Erro ao atualizar produto.')
    } finally {
      setUpdatingProductId(null)
    }
  }

  const handleUpdateAllProducts = async () => {
    setUpdatingAllProductsFlag(true)
    try {
      const toUpdate = data.filter(p => p.needs_cost_update)
      for (const p of toUpdate) {
        await handleUpdateProduct(p.id)
      }
      message.success('Todos os produtos foram atualizados!')
    } catch (e: any) {
      message.error(e?.message || 'Erro ao atualizar produtos.')
    } finally {
      setUpdatingAllProductsFlag(false)
    }
  }

  const handleDelete = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/delete/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const result = await res.json()
      if (!res.ok) {
        const msg = result?.error || 'Erro ao excluir'
        message.error({ content: msg, duration: 8 })
        return false
      }
      await reloadProducts()
      message.success('Produto excluído.')
      return true
    } catch (error: any) {
      message.error({ content: error?.message || 'Erro ao excluir produto', duration: 6 })
      return false
    }
  }

  const handleOpenDeleteQty = (record: ProductRow) => {
    setSelectedProductForDelete(record)
    const currentQty = record.stock_quantity ?? 0
    deleteQtyForm.resetFields()
    deleteQtyForm.setFieldsValue({
      scope: currentQty > 0 ? 'partial' : 'total',
      quantity: Math.min(1, currentQty),
    })
    setDeleteQtyDrawerOpen(true)
  }

  const handleConfirmDeleteQty = async () => {
    if (!selectedProductForDelete) return
    try {
      const values = await deleteQtyForm.validateFields()
      const currentQty = selectedProductForDelete.stock_quantity ?? 0
      const unit = UNIT_LABELS[selectedProductForDelete.stock_unit] || selectedProductForDelete.stock_unit

      if (currentQty <= 0) {
        message.error('Este produto não possui estoque para baixa. Para remover o cadastro (apenas revenda), use o botão "Remover cadastro" no quadro abaixo.')
        return
      }

      const qtyToRemove = values.scope === 'total'
        ? currentQty
        : Math.min(Number(values.quantity) || 0, currentQty)

      if (qtyToRemove <= 0) {
        message.error('Informe uma quantidade válida para excluir.')
        return
      }
      if (qtyToRemove > currentQty) {
        message.error(`Máximo permitido: ${currentQty} ${unit}.`)
        return
      }

      const stockId = stockIdByProductId[selectedProductForDelete.id]
      if (!stockId) {
        message.error('Registro de estoque não encontrado para este produto.')
        return
      }

      const newQty = Math.max(0, currentQty - qtyToRemove)
      setSavingDeleteQty(true)
      const createdBy = await getCurrentUserId()
      if (!createdBy) {
        message.error('Sessão inválida. Faça login novamente.')
        setSavingDeleteQty(false)
        return
      }
      await supabase
        .from('stock')
        .update({ quantity_current: newQty, updated_at: new Date().toISOString() })
        .eq('id', stockId)
      await supabase.from('stock_movements').insert({
        stock_id: stockId,
        delta_quantity: -qtyToRemove,
        reason: values.reason || 'Baixa de quantidade (exclusão parcial/total)',
        created_by: createdBy,
      })
      await supabase.from('products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', selectedProductForDelete.id)

      message.success(`Quantidade de ${qtyToRemove} ${unit} excluída do produto.`)
      setDeleteQtyDrawerOpen(false)
      setSelectedProductForDelete(null)
      await Promise.all([reloadProducts(), reloadStock()])
    } catch (e: any) {
      if (e?.errorFields) return
      message.error(e?.message || 'Erro ao excluir quantidade.')
    } finally {
      setSavingDeleteQty(false)
    }
  }

  if (!canView(MODULES.PRODUCTS)) {
    return <Layout title={PAGE_TITLES.PRODUCTS}><div style={{ padding: 40, textAlign: 'center' }}>Sem acesso.</div></Layout>
  }

  const columns: ColumnsType<ProductRow> = [
    {
      title: 'Código', dataIndex: 'code', key: 'code', width: 90,
      render: (v: string) => v ? <Tag>{v}</Tag> : <span style={{ color: '#D0D5DD' }}>—</span>,
    },
    {
      title: 'Produto', dataIndex: 'name', key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (n: string) => (
        <span style={{ fontWeight: 600, fontSize: 14 }}>{n}</span>
      ),
    },
    {
      title: 'Seção', key: 'section_name', width: 120,
      render: (_: any, record: ProductRow) => {
        const section = sections.find(s => s.id === record.section_id)
        return section ? <span>{section.name}</span> : <span style={{ color: '#D0D5DD' }}>—</span>
      },
    },
    {
      title: 'Qtd. estoque', key: 'stock_quantity', width: 110, align: 'center',
      render: (_: any, r: ProductRow) => (
        <span style={{ fontSize: 13 }}>
          {r.stock_quantity != null
            ? `${r.stock_quantity} ${UNIT_LABELS[r.stock_unit] || r.stock_unit}`
            : '—'}
        </span>
      ),
    },
    {
      title: 'Margem de Lucro',
      key: 'profit_percent',
      width: 130,
      align: 'center',
      render: (_: any, r: ProductRow) => {
        const margin = r.profit_percent
        if (margin == null) return <span style={{ fontSize: 13, color: '#94a3b8' }}>—</span>
        const color = margin >= 30 ? '#12B76A' : margin >= 15 ? '#F79009' : '#F04438'
        return <span style={{ fontWeight: 600, color, fontSize: 13 }}>{margin.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</span>
      },
    },
    {
      title: 'Preço Venda', dataIndex: 'sale_price', key: 'price', width: 130, align: 'right',
      render: (v: number) => {
        return <span style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>{fmt(v)}</span>
      },
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100, align: 'center',
      render: (s: string) => s === 'PENDING'
        ? <Tag icon={<ExclamationCircleOutlined />} color="warning">Pendente</Tag>
        : <Tag color="success">Ativo</Tag>,
    },
    ...(canEdit(MODULES.PRODUCTS)
      ? [{
          title: '', key: 'act', width: 160, align: 'center' as const,
          render: (_: any, r: ProductRow) => (
            <Space size={4} wrap>
              {r.needs_cost_update && (
                <Button
                  type="link"
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={updatingProductId === r.id}
                  onClick={() => handleUpdateProduct(r.id)}
                  style={{ color: '#16a34a' }}
                >
                  Atualizar produto
                </Button>
              )}
              {r.status === 'PENDING' ? (
                <Tooltip title="Completar cadastro">
                  <Button type="primary" size="small"
                    style={{ background: '#FA8C16', borderColor: '#FA8C16', fontSize: 12 }}
                    onClick={() => router.push(`${ROUTES.PRODUCTS}/${r.id}`)}>
                    Completar
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="Editar">
                  <Button type="text" size="small" icon={<EditOutlined />}
                    onClick={() => router.push(`${ROUTES.PRODUCTS}/${r.id}`)} />
                </Tooltip>
              )}
              <Tooltip title="Excluir quantidade do estoque">
                <Button type="text" size="small" icon={<MinusCircleOutlined style={{ color: '#faad14' }} />} onClick={() => handleOpenDeleteQty(r)} />
              </Tooltip>
              <Tooltip title="Excluir produto">
                <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setConfirmDeleteId(r.id)} />
              </Tooltip>
            </Space>
          ),
        }]
      : []),
  ]

  return (
    <Layout title={PAGE_TITLES.PRODUCTS} subtitle="Gerencie seus produtos cadastrados">
      {commissionTablesLoaded && commissionTables.length === 0 && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ color: '#92400e', fontSize: 13 }}>
            Para criar um produto, primeiro crie uma <strong>Tabela de Comissão</strong> clicando no botão ao lado.
          </span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder="Buscar produto..."
            prefix={<SearchOutlined style={{ color: '#D0D5DD' }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Select
            allowClear
            placeholder="Filtrar por tabela..."
            style={{ width: 200 }}
            value={tableFilter}
            onChange={v => setTableFilter(v || null)}
            options={commissionTables.map(t => ({ value: t.id, label: t.name }))}
          />
          {tableFilter && commissionTables.find(t => t.id === tableFilter) && (
            <Tooltip title="Editar nome da tabela">
              <Button
                icon={<EditOutlined />}
                size="small"
                onClick={() => {
                  const t = commissionTables.find(x => x.id === tableFilter)
                  if (t) handleOpenEditTable(t.id, t.name)
                }}
              />
            </Tooltip>
          )}
        </div>
        <Space>
          {canEdit(MODULES.PRODUCTS) && (
            <>
              {data.some(p => p.needs_cost_update) && (
                <Button
                  icon={<ReloadOutlined />}
                  loading={updatingAllProductsFlag}
                  onClick={handleUpdateAllProducts}
                  style={{ background: '#16a34a', borderColor: '#15803d', color: 'white' }}
                >
                  Atualizar todos os produtos
                </Button>
              )}
              <Button
                onClick={() => setTableModalOpen(true)}
                style={commissionTablesLoaded && commissionTables.length === 0 ? {
                  background: '#16a34a', borderColor: '#16a34a', color: 'white',
                  animation: 'pulse-green 1.5s infinite',
                } : {}}
              >
                Criar Tabela
              </Button>
              <Button
                icon={<AppstoreAddOutlined />}
                onClick={() => { setSectionModalOpen(true); loadSections() }}
              >
                Criar Seção
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  if (commissionTablesLoaded && commissionTables.length === 0) {
                    message.warning('Crie uma Tabela de Comissão antes de adicionar produtos.')
                    return
                  }
                  router.push(ROUTES.NEW_PRODUCT)
                }}
              >
                Adicionar produto
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* Sections Modal */}
      <Modal
        title="Gerenciar Seções"
        open={sectionModalOpen}
        onCancel={() => { setSectionModalOpen(false); setNewSectionName('') }}
        footer={null}
        width={480}
      >
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Seção é um grupo, usado como filtro ao qual o produto pertence.
        </p>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              placeholder="Nome da nova seção"
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              onPressEnter={handleCreateSection}
              maxLength={80}
            />
            <Button type="primary" icon={<PlusOutlined />} loading={savingSection} onClick={handleCreateSection}>
              Criar
            </Button>
          </div>
        </div>
        {loadingSections ? (
          <div style={{ textAlign: 'center', padding: 16 }}><Spin /></div>
        ) : sections.length === 0 ? (
          <Empty description="Nenhuma seção cadastrada" />
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {sections.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{s.name}</span>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteSection(s.id)}
                />
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Commission Table Modal */}
      <Modal
        title="Criar Tabela de Comissão"
        open={tableModalOpen}
        onCancel={() => { setTableModalOpen(false); setNewTableName(''); setNewTableNotes('') }}
        onOk={handleCreateTable}
        okText="Criar"
        okButtonProps={{ loading: savingTable }}
        width={460}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#f59e0b' }}>
            ⚠️ <strong>Importante:</strong> Nomeie as tabelas de forma bem específica (ex: &quot;Linha Premium – Bolos&quot;, &quot;Atacado Geral&quot;) para não confundir na hora de vincular funcionários e produtos.
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Nome da Tabela <span style={{ color: '#f04438' }}>*</span></label>
            <Input
              placeholder="Nome específico da tabela"
              value={newTableName}
              onChange={e => setNewTableName(e.target.value)}
              onPressEnter={handleCreateTable}
              maxLength={100}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Observações</label>
            <Input.TextArea
              rows={3}
              placeholder="Observações sobre esta tabela (opcional)"
              value={newTableNotes}
              onChange={e => setNewTableNotes(e.target.value)}
              maxLength={500}
              showCount
            />
          </div>
        </div>
      </Modal>

      {/* Edit Commission Table Name Modal */}
      <Modal
        title="Editar Nome da Tabela de Comissão"
        open={editTableModalOpen}
        onCancel={() => setEditTableModalOpen(false)}
        onOk={handleSaveEditTable}
        okText="Salvar"
        okButtonProps={{ loading: savingEditTable }}
        width={400}
      >
        <div style={{ padding: '8px 0' }}>
          <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Nome da Tabela <span style={{ color: '#f04438' }}>*</span></label>
          <Input
            placeholder="Nome da tabela"
            value={editTableName}
            onChange={e => setEditTableName(e.target.value)}
            onPressEnter={handleSaveEditTable}
            maxLength={100}
          />
        </div>
      </Modal>

      <Drawer
        title="Renovar quantidade"
        open={renewDrawerOpen}
        onClose={() => { setRenewDrawerOpen(false); renewForm.resetFields(); setRenewProductDetail(null) }}
        width={520}
        footer={
          <div style={{ textAlign: 'right' }}>
            <Button onClick={() => setRenewDrawerOpen(false)} style={{ marginRight: 8 }}>Cancelar</Button>
            <Button type="primary" loading={savingRenew} onClick={handleSaveRenew}>Salvar</Button>
          </div>
        }
      >
        {loadingProduzido ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : renewProductList.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>Nenhum produto cadastrado. Cadastre produtos (Produzido ou Revenda) para renovar estoque.</div>
        ) : (
          <Form form={renewForm} layout="vertical">
            <Form.Item name="product_id" label="Produto" rules={[{ required: true, message: 'Selecione o produto' }]}>
              <Select
                placeholder="Selecione o produto"
                showSearch
                optionFilterProp="label"
                options={renewProductList.map((p) => ({ value: p.id, label: `${p.name} (Cód: ${p.code})${p.product_type === 'REVENDA' ? ' — Revenda' : ''}` }))}
              />
            </Form.Item>
            {renewProductDetail?.product_items?.length > 0 && (
              <>
                <div style={{ marginBottom: 12, fontSize: 12, color: '#94a3b8' }}>Ingredientes (somente leitura)</div>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={renewProductDetail.product_items.map((pi, i) => {
                    const item = pi.items
                    const refQty = item ? Number(item.quantity) || 1 : 1
                    const refPrice = item ? Number(item.cost_price) || 0 : 0
                    const unit = (item?.unit || 'UN').toString()
                    const unitCost = (item?.cost_per_base_unit != null && item?.cost_per_base_unit !== '')
                      ? Number(item.cost_per_base_unit)
                      : (refQty > 0 ? refPrice / refQty : 0)
                    const qtyNeeded = Number(pi.quantity_needed) || 0
                    const cost = qtyNeeded * unitCost
                    return {
                      key: pi.item_id + i,
                      name: item?.name || '—',
                      qty_needed: pi.quantity_needed,
                      unit,
                      unit_value: unitCost,
                      cost,
                    }
                  })}
                  columns={[
                    { title: 'Insumo', dataIndex: 'name', key: 'name', width: 140 },
                    { title: 'Qtd. por un.', dataIndex: 'qty_needed', key: 'qty', width: 90, align: 'right' },
                    { title: 'Un.', dataIndex: 'unit', key: 'unit', width: 50 },
                    { title: 'Valor un.', key: 'unit_value', width: 90, align: 'right', render: (_: any, r: any) => fmt(r.unit_value) },
                    { title: 'Custo', key: 'cost', width: 90, align: 'right', render: (_: any, r: any) => fmt(r.cost) },
                  ]}
                />
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#0a1628', borderRadius: 6, fontSize: 12, color: '#94a3b8' }}>
                  Impostos e preço de venda: calculados ao salvar com os percentuais de lucro e comissão já cadastrados no produto (motor fiscal).
                </div>
              </>
            )}
            {renewProductDetail?.product_type === 'REVENDA' && (
              <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 6, fontSize: 12, color: '#4ade80' }}>
                Produto de revenda: informe a quantidade a adicionar ao estoque. Sem consumo de ingredientes.
              </div>
            )}
            <Form.Item name="quantity" label={renewProductDetail?.product_type === 'REVENDA' ? 'Quantidade a adicionar' : 'Quantidade adicionada'} rules={[{ required: true, message: 'Obrigatório' }, { type: 'number', min: 0.001, message: 'Maior que zero' }]} style={{ marginTop: 16 }}>
              <InputNumber min={0.01} step={1} style={{ width: '100%' }} placeholder="Ex: 10" />
            </Form.Item>
          </Form>
        )}
      </Drawer>

      <Drawer
        title="Excluir quantidade do estoque"
        open={deleteQtyDrawerOpen}
        onClose={() => { setDeleteQtyDrawerOpen(false); setSelectedProductForDelete(null); deleteQtyForm.resetFields() }}
        width={420}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span />
            <Space>
              <Button onClick={() => setDeleteQtyDrawerOpen(false)}>Cancelar</Button>
              {selectedProductForDelete && (selectedProductForDelete.stock_quantity ?? 0) > 0 ? (
                <Button type="primary" danger loading={savingDeleteQty} onClick={handleConfirmDeleteQty}>
                  Confirmar baixa
                </Button>
              ) : (
                <Button
                  type="primary"
                  danger
                  loading={savingDeleteQty}
                  onClick={async () => {
                    if (!selectedProductForDelete) return
                    setSavingDeleteQty(true)
                    const ok = await handleDelete(selectedProductForDelete.id)
                    setSavingDeleteQty(false)
                    if (ok) {
                      setDeleteQtyDrawerOpen(false)
                      setSelectedProductForDelete(null)
                    }
                  }}
                >
                  Remover cadastro
                </Button>
              )}
            </Space>
          </div>
        }
      >
        {selectedProductForDelete && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedProductForDelete.name}</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                Estoque atual: <strong>{selectedProductForDelete.stock_quantity ?? 0} {UNIT_LABELS[selectedProductForDelete.stock_unit] || selectedProductForDelete.stock_unit}</strong>
              </div>
            </div>
            {(selectedProductForDelete.stock_quantity ?? 0) > 0 ? (
              <Form form={deleteQtyForm} layout="vertical" initialValues={{ scope: 'partial', quantity: 1 }}>
                <Form.Item name="scope" label="Tipo de baixa">
                  <Radio.Group>
                    <Radio value="partial">Parcial (informe a quantidade)</Radio>
                    <Radio value="total">Total (zerar estoque)</Radio>
                  </Radio.Group>
                </Form.Item>
                <Form.Item
                  noStyle
                  shouldUpdate={(prev, curr) => prev.scope !== curr.scope}
                >
                  {({ getFieldValue }) =>
                    getFieldValue('scope') === 'partial' ? (
                      <Form.Item
                        name="quantity"
                        label="Quantidade a excluir"
                        rules={[
                          { required: true, message: 'Obrigatório' },
                          {
                            validator: (_, val) => {
                              const n = Number(val)
                              const max = selectedProductForDelete.stock_quantity ?? 0
                              if (n < 1) return Promise.reject(new Error('Mínimo 1'))
                              if (n > max) return Promise.reject(new Error(`Máximo ${max}`))
                              return Promise.resolve()
                            },
                          },
                        ]}
                      >
                        <InputNumber min={1} max={selectedProductForDelete.stock_quantity ?? 0} step={1} style={{ width: '100%' }} />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>
                <Form.Item name="reason" label="Motivo (opcional)">
                  <Input.TextArea rows={2} placeholder="Ex: baixa por perda, venda fora do sistema..." />
                </Form.Item>
              </Form>
            ) : (
              <div style={{ padding: '12px 0', color: '#94a3b8' }}>
                Este produto está com estoque zero. Para remover o cadastro do produto da lista (apenas produtos de revenda; produtos produzidos com receita não podem ser excluídos), use o botão &quot;Remover cadastro&quot; abaixo.
              </div>
            )}
          </>
        )}
      </Drawer>

      <div className="pc-card" style={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 15 }}
          locale={{ emptyText: <Empty description={tableFilter ? "Nenhum produto cadastrado nesta tabela" : "Selecione uma tabela para ver os produtos"} /> }}
          size="middle"
        />
      </div>
      <Modal
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        title="Excluir produto"
        okText="Sim, excluir"
        cancelText="Cancelar"
        okButtonProps={{ danger: true, loading: deletingProduct }}
        onOk={async () => {
          if (!confirmDeleteId) return
          setDeletingProduct(true)
          await handleDelete(confirmDeleteId)
          setDeletingProduct(false)
          setConfirmDeleteId(null)
        }}
      >
        <p>Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.</p>
      </Modal>
    </Layout>
  )
}

export default Products
