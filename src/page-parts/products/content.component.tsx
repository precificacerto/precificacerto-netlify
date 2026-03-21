import { ChangeEvent, FC, useCallback, useEffect, useRef, useState } from 'react'
import { AutoComplete, Button, Card, Form, Input, InputNumber, Popconfirm, Select, Space, Alert, Radio, Divider, Tooltip, Spin } from 'antd'
import { InfoCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { PAGE_TITLES } from '@/constants/page-titles'
import { IItemModel } from '@/server/model/item'
import { IItemProductModel, itemProductSchema } from '@/server/model/item-product-item'
import { ColumnsType } from 'antd/es/table'
import { UNIT_TYPE } from '@/constants/item-unit-types'
import { calculateItemPrice } from '@/utils/calculate-item-price'
import { MessageInstance } from 'antd/es/message/interface'
import { useRouter } from 'next/router'
import { IProductModel } from '@/server/model/product'
import { ROUTES } from '@/constants/routes'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { CalcBaseType } from '@/types/calc-base.type'
import { calculatePricing, normalizeToMinutes } from '@/utils/pricing-engine'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import { ContentIndustrialization } from './content-industrialization'
import { ContentResale } from './content-resale'
import { ContentService } from './content-service'
import { ProductPrice } from './product-price.component'
import { LoggedUser } from '@/types/logged-user.type'
import { supabase } from '@/supabase/client'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'

type ContentProps = {
  messageApi: MessageInstance
  isEditingMode: boolean
  product?: IProductModel
  itemsFromApi: IItemModel[]
  calcBase: CalcBaseType
  currentUser: LoggedUser
}

export type ProductPriceInfoType = {
  salesCommissionPercent: number
  salesCommissionPrice: number

  salesCommissionPercentByProduct: number
  salesCommissionPriceByProduct: number

  productProfitPercent: number
  productProfitPrice: number

  productProfitPercentByProduct: number
  productProfitPriceByProduct: number

  indirectLaborExpensePrice: number
  /** laborUnit/priceUnit (0-100) for display. */
  laborPctShown: number
  fixedExpensePrice: number
  variableExpensePrice: number
  financialExpensePrice: number
  taxesPrice: number

  totalProductPrice: number

  productCost: number

  productWorkloadInMinutes: number
  productWorkloadInMinutesPrice: number

  totalServicePrice: number
  totalServiceProductPrice: number

  taxesPriceByProduct: number

  taxableRegimePercent: number
  taxableRegimePrice: number

  taxableRegimePercentByProduct: number
  taxableRegimePriceByProduct: number
}

const REQUIRED_INPUT_MESSAGE = 'Campo obrigatório!'

const capitalizeFirst = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)
const PRODUCT_PRICE_INFO_BASE = {
  salesCommissionPercent: 0,
  salesCommissionPrice: 0,
  salesCommissionPercentByProduct: 0,
  salesCommissionPriceByProduct: 0,
  productProfitPercent: 0,
  productProfitPrice: 0,
  productProfitPercentByProduct: 0,
  productProfitPriceByProduct: 0,
  indirectLaborExpensePercent: 0,
  indirectLaborExpensePrice: 0,
  laborPctShown: 0,
  fixedExpensePrice: 0,
  variableExpensePrice: 0,
  financialExpensePrice: 0,
  taxesPrice: 0,
  totalProductPrice: 0,
  productCost: 0,
  productWorkloadInMinutes: 0,
  productWorkloadInMinutesPrice: 0,
  totalServicePrice: 0,
  totalServiceProductPrice: 0,
  taxesPriceByProduct: 0,
  taxableRegimePercent: 0,
  taxableRegimePrice: 0,
  taxableRegimePercentByProduct: 0,
  taxableRegimePriceByProduct: 0,
}

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const Content: FC<ContentProps> = ({
  messageApi,
  isEditingMode,
  product,
  itemsFromApi,
  calcBase,
  currentUser,
}: ContentProps) => {
  const [productItemsData, setProductItemsData] = useState<IItemProductModel[]>(
    product?.items.map((item) => ({ ...item, key: item.id })) || []
  )
  const [items, setItems] = useState<IItemModel[]>(itemsFromApi || [])

  // Sincroniza items quando itemsFromApi mudar (ex: ao navegar de itens→produtos com item novo)
  useEffect(() => {
    setItems(itemsFromApi || [])
  }, [itemsFromApi])
  const [productPriceInfo, setProductPriceInfo] = useState<ProductPriceInfoType | null>(
    PRODUCT_PRICE_INFO_BASE
  )
  const [updatedProductPriceInfoWithApi, setUpdatedProductPriceInfoWithApi] = useState<number>(1)
  const [productForm] = Form.useForm()
  const [itemsForm] = Form.useForm()

  const isRevendaFromDb = (product as any)?.productType === 'REVENDA'
  const isCalcTypeService = currentUser?.calcType === CALC_TYPE_ENUM.SERVICE

  const [productType, setProductType] = useState<'PRODUZIDO' | 'REVENDA'>(
    isCalcTypeService ? 'REVENDA' : ((product as any)?.productType || 'PRODUZIDO')
  )
  const [baseItemId, setBaseItemId] = useState<string | null>(
    (product as any)?.baseItemId || null
  )
  const [saleScope, setSaleScope] = useState<'INTRAESTADUAL' | 'INTERESTADUAL'>('INTRAESTADUAL')
  const [buyerType, setBuyerType] = useState<'CONSUMIDOR_FINAL' | 'CONTRIBUINTE_PJ'>('CONSUMIDOR_FINAL')
  const [destinationState, setDestinationState] = useState<string | null>(null)
  const [customTaxPercent, setCustomTaxPercent] = useState<number | null>(
    product?.custom_tax_percent != null ? Number(product.custom_tax_percent) : null
  )

  const [ncmSuggestions, setNcmSuggestions] = useState<{ code: string; description: string }[]>([])
  const [ncmSugLoading, setNcmSugLoading] = useState(false)
  const [ncmOptions, setNcmOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [ncmFieldSearching, setNcmFieldSearching] = useState(false)
  const ncmDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const nameDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const searchNcmByName = useCallback(async (name: string) => {
    if (name.length < 2) { setNcmSuggestions([]); return }
    setNcmSugLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('lookup-ncm', {
        body: { search: name },
      })
      if (!error && data?.success && data.results) {
        setNcmSuggestions(data.results.slice(0, 8).map((r: any) => ({
          code: r.code, description: r.description,
        })))
      } else { setNcmSuggestions([]) }
    } catch { setNcmSuggestions([]) }
    finally { setNcmSugLoading(false) }
  }, [])

  const handleProductNameChange = useCallback((name: string) => {
    productForm.setFieldsValue({ name: capitalizeFirst(name) })
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current)
    nameDebounceRef.current = setTimeout(() => searchNcmByName(name), 280)
  }, [productForm, searchNcmByName])

  const handleSelectNcmSuggestion = useCallback((code: string) => {
    productForm.setFieldsValue({ ncm_code: code })
    setNcmSuggestions([])
  }, [productForm])

  const searchNcmField = useCallback(async (term: string) => {
    const clean = term.replace(/\D/g, '')
    if (clean.length < 3 && term.length < 3) { setNcmOptions([]); return }
    setNcmFieldSearching(true)
    try {
      const isCode = clean.length >= 4 && !/[a-zA-Z]/.test(term)
      const { data, error } = await supabase.functions.invoke('lookup-ncm', {
        body: isCode ? { code: clean } : { search: term },
      })
      if (!error && data?.success && data.results) {
        setNcmOptions(data.results.map((r: any) => ({
          value: r.code,
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
              <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{r.code}</span>
            </div>
          ),
        })))
      }
    } catch { /* silent */ }
    finally { setNcmFieldSearching(false) }
  }, [])

  const handleNcmSearch = useCallback((value: string) => {
    if (ncmDebounceRef.current) clearTimeout(ncmDebounceRef.current)
    ncmDebounceRef.current = setTimeout(() => searchNcmField(value), 250)
  }, [searchNcmField])

  const router = useRouter()

  const itemsPriceSum = productItemsData.reduce(
    (prevValue: number, item: IItemProductModel) => prevValue + (Number(item.price) || 0),
    0
  )

  // Items filtrados por tipo: para Revenda, só mostrar itens do tipo REVENDA
  // Exception: SERVICE calcType uses REVENDA type but with industrialization form (all items)
  const itemsForSelection = (productType === 'REVENDA' && !isCalcTypeService)
    ? items.filter((i: any) => i.item_type === 'REVENDA' || !i.item_type)
    : items.filter((i: any) => i.item_type !== 'REVENDA')

  // Quando muda para REVENDA e seleciona item base: custo = custo por unidade do item (puxado do cadastro do item).
  useEffect(() => {
    if (productType === 'REVENDA' && baseItemId) {
      const baseItem = items.find((i) => i.id === baseItemId) as (IItemModel & { cost_per_base_unit?: number }) | undefined
      if (baseItem) {
        const qty = Number(baseItem.quantity) || 1
        const totalCost = Number(baseItem.price) ?? Number((baseItem as any).cost_price) ?? 0
        const costPerUnit = baseItem.cost_per_base_unit != null && baseItem.cost_per_base_unit !== ''
          ? Number(baseItem.cost_per_base_unit)
          : qty > 0 ? totalCost / qty : totalCost
        const newItem: IItemProductModel = {
          id: baseItem.id,
          name: baseItem.name,
          quantity: 1,
          referenceQuantity: 1,
          unitType: (baseItem.unitType || 'UN') as any,
          price: Math.max(0.01, costPerUnit),
          referencePrice: Math.max(0.01, costPerUnit),
        }
        setProductItemsData([newItem])
        setTimeout(() => setUpdatedProductPriceInfoWithApi(prev => prev + 1), 100)
      }
    }
  }, [productType, baseItemId, items])

  useEffect(() => {
    const autoTaxRegime = calcBase.taxableRegimeAutoPercent ?? 0
    const taxRegimeValue = autoTaxRegime > 0 ? autoTaxRegime : (currentUser?.taxableRegimeValue || 0)

    if (taxRegimeValue > 0 && productPriceInfo?.taxableRegimePercent === 0) {
      setProductPriceInfo((prev) => ({
        ...prev,
        taxableRegimePercent: taxRegimeValue,
        taxableRegimePercentByProduct: taxRegimeValue,
      }))
    }
  }, [calcBase.taxableRegimeAutoPercent, currentUser?.taxableRegimeValue, productPriceInfo?.taxableRegimePercent])

  useEffect(() => {
    if (isEditingMode && product) {
      productForm.setFieldsValue(product)
      setProductPriceInfo({
        ...PRODUCT_PRICE_INFO_BASE,
        ...(product?.productPriceInfo || {}),
      } as ProductPriceInfoType)
      setUpdatedProductPriceInfoWithApi((prev) => prev + 1)
      // Load custom_tax_percent from product if editing
      if (product?.custom_tax_percent != null) {
        setCustomTaxPercent(Number(product.custom_tax_percent))
      }
    }
  }, [productForm, isEditingMode, product])

  useEffect(() => {
    if (!isEditingMode && currentUser && calcBase) {
      const autoTaxRegime = calcBase.taxableRegimeAutoPercent ?? 0
      const taxRegimeValue = autoTaxRegime > 0 ? autoTaxRegime : (currentUser.taxableRegimeValue || 0)
      setProductPriceInfo({
        ...PRODUCT_PRICE_INFO_BASE,
        taxableRegimePercent: taxRegimeValue,
        taxableRegimePercentByProduct: taxRegimeValue,
      })
      setUpdatedProductPriceInfoWithApi((prev) => prev + 1)
    }
  }, [isEditingMode, currentUser, calcBase])


  // --- Pricing Engine (V2) ---------------------------------------------------
  const doProductCalc = useCallback(() => {
    const yieldQty = Number(productForm.getFieldValue('quantity')) || 1
    const isCalcService = currentUser.calcType === CALC_TYPE_ENUM.SERVICE

    const totalEmployees =
      (currentUser.numProductiveSectorEmployee ?? 0) || 1
    const hoursPerMonth =
      currentUser.unitMeasure === 'HOURS'
        ? (currentUser.monthlyWorkloadInMinutes || 0)
        : currentUser.unitMeasure === 'DAYS'
          ? (currentUser.monthlyWorkloadInMinutes || 0) * 8
          : (currentUser.monthlyWorkloadInMinutes || 0) / 60
    const hoursPerMonthSafe = hoursPerMonth > 0 ? hoursPerMonth : 176
    // Total productive minutes available per month (company-wide)
    const monthlyWorkloadMinutes = totalEmployees * hoursPerMonthSafe * 60

    // Estrutura para o motor: fixo + variável + financeiro + MO administrativa (%)
    // SERVICE + REVENDA: excluir MO administrativa e despesas fixas do coeficiente
    const structurePctForEngine = isCalcService
      ? (calcBase.variableExpensePct + calcBase.financialExpensePct) / 100
      : (calcBase.structurePct + (Number(calcBase.indirectLaborPct) || 0)) / 100
    const effectiveTaxPct = customTaxPercent != null ? customTaxPercent : calcBase.taxPct
    const taxPctDecimal = effectiveTaxPct / 100

    // Produto REVENDA usa sempre calcType REVENDA (sem MO produtiva no CMV), independente do tenant
    const effectiveCalcType = productType === 'REVENDA'
      ? 'REVENDA'
      : currentUser.calcType === CALC_TYPE_ENUM.INDUSTRIALIZATION ? 'INDUSTRIALIZACAO'
        : currentUser.calcType === CALC_TYPE_ENUM.RESALE ? 'REVENDA'
        : 'SERVICO'

    const engineResult = calculatePricing({
      calcType: effectiveCalcType,
      totalItemsCost: itemsPriceSum,
      yieldQuantity: 1,
      laborCostMonthly: effectiveCalcType === 'REVENDA' ? 0 : calcBase.laborCostMonthly,
      numProductiveEmployees: totalEmployees,
      monthlyWorkloadMinutes,
      productWorkloadMinutes: effectiveCalcType === 'REVENDA' ? 0 : (productPriceInfo.productWorkloadInMinutes || 0),
      structurePct: structurePctForEngine,
      taxPct: taxPctDecimal,
      commissionPct: productPriceInfo.salesCommissionPercent / 100,
      profitPct: productPriceInfo.productProfitPercent / 100,
    })

    // Para SERVICE + produto com itens (não REVENDA): calcula preço separado do produto
    let resultProductService = 0
    if (isCalcService && productType !== 'REVENDA' && itemsPriceSum > 0) {
      const prodEngine = calculatePricing({
        calcType: 'REVENDA',
        totalItemsCost: itemsPriceSum,
        yieldQuantity: 1,
        laborCostMonthly: 0,
        numProductiveEmployees: totalEmployees,
        monthlyWorkloadMinutes,
        productWorkloadMinutes: 0,
        structurePct: 0,
        taxPct: taxPctDecimal,
        commissionPct: (productPriceInfo.salesCommissionPercentByProduct || 0) / 100,
        profitPct: (productPriceInfo.productProfitPercentByProduct || 0) / 100,
      })
      resultProductService = prodEngine.isValid ? prodEngine.priceUnit : 0
    }

    if (engineResult.isValid) {
      const priceUnit = engineResult.priceUnit
      const priceTotal = isCalcService
        ? (resultProductService * yieldQty) + engineResult.priceTotal
        : engineResult.priceTotal

      setProductPriceInfo((prev) => ({
        ...prev,
        indirectLaborExpensePercent: calcBase.indirectLaborPct,
        productProfitPrice: engineResult.profitValue,
        salesCommissionPrice: engineResult.commissionValue,
        productProfitPriceByProduct: resultProductService * (prev.productProfitPercentByProduct / 100) || 0,
        salesCommissionPriceByProduct: resultProductService * (prev.salesCommissionPercentByProduct / 100) || 0,
        indirectLaborExpensePrice: engineResult.laborValue,
        laborPctShown: Number((engineResult.laborPctShown * 100).toFixed(2)),
        fixedExpensePrice: priceUnit * (calcBase.fixedExpensePct / 100),
        variableExpensePrice: priceUnit * (calcBase.variableExpensePct / 100),
        financialExpensePrice: priceUnit * (calcBase.financialExpensePct / 100),
        taxesPrice: engineResult.taxValue,
        taxesPriceByProduct: resultProductService * taxPctDecimal || 0,
        productWorkloadInMinutesPrice: engineResult.productiveLaborCost,
        productCost: engineResult.cmvUnit,
        totalServicePrice: isCalcService ? engineResult.priceUnit : 0,
        totalServiceProductPrice: resultProductService,
        totalProductPrice: priceUnit,
      }))
    }
  }, [
    currentUser,
    calcBase.laborCostMonthly,
    calcBase.structurePct,
    calcBase.taxPct,
    calcBase.indirectLaborPct,
    calcBase.fixedExpensePct,
    calcBase.variableExpensePct,
    calcBase.financialExpensePct,
    itemsPriceSum,
    productPriceInfo.productWorkloadInMinutes,
    productPriceInfo.productProfitPercent,
    productPriceInfo.productProfitPercentByProduct,
    productPriceInfo.salesCommissionPercent,
    productPriceInfo.salesCommissionPercentByProduct,
    productForm,
    customTaxPercent,
  ])

  useEffect(() => {
    if (currentUser) {
      doProductCalc()
    }
  }, [currentUser, product, updatedProductPriceInfoWithApi, productItemsData, doProductCalc])

  const handleQuantityChange = (id: string, value: string) => {
    const updatedProductItemsData = productItemsData.map((item) => {
      if (item.id === id) {
        const newQuantity = parseFloat(value) || null

        return {
          ...item,
          quantity: newQuantity,
          price: calculateItemPrice(newQuantity, item.referencePrice, item.referenceQuantity),
        }
      }
      return item
    })

    setProductItemsData(updatedProductItemsData)
  }

  const goBack = () => {
    router.back()
  }

  const handleClickAddItem = async (value: { item: string }) => {
    const itemAlreadyAdd = productItemsData.find(({ id }) => id === value.item)

    if (itemAlreadyAdd) {
      return messageApi.open({
        type: 'error',
        content: 'Item já adicionado ao produto.',
      })
    }

    const selectedItem = items.find(({ id }) => id === value.item)
    if (!selectedItem) return

    const unitType = (selectedItem.unitType || 'UN').toString().toUpperCase()
    const recipeQty = 1
    const costPerUnitRaw = Number(selectedItem.price) ?? Number((selectedItem as any).cost_per_base_unit) ?? 0
    const costPerUnit = Math.max(0.01, costPerUnitRaw)
    // Custo do item na receita = quantidade × custo por unidade do item. referenceQuantity=1 para não dividir pela qtd em estoque.
    const priceForSchema = Math.max(0.01, recipeQty * costPerUnit)

    const newItem = await itemProductSchema.validate({
      ...selectedItem,
      unitType,
      quantity: recipeQty,
      price: priceForSchema,
      referencePrice: costPerUnit,
      referenceQuantity: 1,
    }) as IItemProductModel & { stockQuantity?: number | null; stockUnit?: string }

    newItem.stockQuantity = (selectedItem as any).stockQuantity ?? null
    newItem.stockUnit = (selectedItem as any).stockUnit ?? unitType

    setProductItemsData((prev: IItemProductModel[]) => [...prev, newItem])
    setItems((prev: IItemModel[]) => prev.filter((item: IItemModel) => item.id !== value.item))

    itemsForm.resetFields()
  }

  const validateProductItems = () => {
    if (productType === 'REVENDA' && !isCalcTypeService) {
      if (!baseItemId) {
        return 'Selecione o item de revenda como base do custo.'
      }
      return undefined
    }

    if (!productItemsData.length) {
      return 'Adicione pelo menos um item ao produto.'
    }

    const allItemsValid = productItemsData.every(({ quantity }) => quantity > 0)

    if (!allItemsValid) {
      return 'O campo "Quantidade" é obrigatório em todos os itens'
    }
  }

  const handleSaveProduct = async () => {
    doProductCalc()

    try {
      const validateProductItemsError = validateProductItems()

      if (validateProductItemsError) {
        return messageApi.open({
          type: 'error',
          content: validateProductItemsError,
        })
      }

      await productForm.validateFields()

      const values = productForm.getFieldsValue()
      const tenantId = await getTenantId()
      if (!tenantId) {
        return messageApi.error('Não foi possível identificar o tenant.')
      }

      const yieldQty = Number(values.quantity) || 1
      const isCalcService = currentUser?.calcType === CALC_TYPE_ENUM.SERVICE

      // DIRETO: salvar exatamente o valor que aparece em "Preço de Venda por Unidade" na tela
      // Sem recalcular — o valor já foi calculado pelo doProductCalc (preview)
      const salePriceToSave = Number(productPriceInfo.totalProductPrice) || 0
      const costTotalToSave = Number(productPriceInfo.productCost) || 0

      let autoCode = values.code
      if (!autoCode) {
        const { data: lastProduct } = await supabase
          .from('products')
          .select('code')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(50)

        let maxNum = 1000
        if (lastProduct) {
          for (const p of lastProduct) {
            const num = parseInt(p.code, 10)
            if (!isNaN(num) && num > maxNum) maxNum = num
          }
        }
        autoCode = String(maxNum + 1)
      }

      const productData: Record<string, any> = {
        tenant_id: tenantId,
        code: autoCode,
        name: values.name,
        description: values.description || null,
        yield_quantity: yieldQty,
        yield_unit: values.unitType || 'UN',
        unit: values.unitType || 'UN',
        sale_price: salePriceToSave,
        cost_total: costTotalToSave,
        profit_percent: Number(productPriceInfo.productProfitPercent) || 0,
        commission_percent: Number(productPriceInfo.salesCommissionPercent) || 0,
        product_type: productType,
        base_item_id: productType === 'REVENDA' ? baseItemId : null,
        ncm_code: values.ncm_code || null,
        nbs_code: values.nbs_code || null,
        max_discount_percent: values.max_discount_percent != null && values.max_discount_percent !== '' ? Number(values.max_discount_percent) : null,
        updated_at: new Date().toISOString(),
      }

      if (isRevendaFromDb) {
        productData.status = 'ACTIVE'
      }

      let productId = values.id

      if (productId) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId)

        if (error) throw error
      } else {
        const { data: created, error } = await supabase
          .from('products')
          .insert(productData)
          .select('id')
          .single()

        if (error) throw error
        productId = created.id
      }

      // Try to save columns that may not exist yet (pending migration)
      const extraFields: Record<string, any> = {}
      if (customTaxPercent != null) extraFields.custom_tax_percent = customTaxPercent
      else extraFields.custom_tax_percent = null
      if (values.recurrence_days != null && values.recurrence_days !== '') extraFields.recurrence_days = Number(values.recurrence_days)
      else extraFields.recurrence_days = null
      if (Object.keys(extraFields).length > 0) {
        const { error: extraErr } = await supabase.from('products').update(extraFields).eq('id', productId)
        if (extraErr) console.warn('Could not save custom_tax_percent/recurrence_days (columns may not exist yet):', extraErr.message)
      }

      await supabase.from('product_items').delete().eq('product_id', productId)

      if (productItemsData.length > 0) {
        const itemIdsForCost = productItemsData.map(i => i.id)
        const { data: itemsCostData } = await supabase
          .from('items')
          .select('id, cost_per_base_unit')
          .in('id', itemIdsForCost)
        const costByItemId: Record<string, number> = {}
        for (const ic of (itemsCostData || [])) {
          costByItemId[ic.id] = Number(ic.cost_per_base_unit) || 0
        }

        const productItems = productItemsData.map((item) => ({
          product_id: productId,
          item_id: item.id,
          quantity_needed: item.quantity,
          item_cost_gross: item.referencePrice || 0,
          item_cost_net: item.price || 0,
          cost_per_base_unit: costByItemId[item.id] || 0,
        }))

        const { error: piError } = await supabase.from('product_items').insert(productItems)
        if (piError) throw piError
      }

      // Produto PRODUZIDO: garantir registro em estoque (Produtos acabados); quantidade inicial = quantidade de produção
      if (productType === 'PRODUZIDO') {
        const yieldQty = Number(values.quantity) || 0
        const productName = values.name || 'Produto'
        const { data: existingProductStock } = await supabase
          .from('stock')
          .select('id, quantity_current')
          .eq('product_id', productId)
          .eq('stock_type', 'PRODUCT')
          .maybeSingle()
        if (!existingProductStock) {
          await supabase.from('stock').insert({
            tenant_id: tenantId,
            product_id: productId,
            stock_type: 'PRODUCT',
            quantity_current: yieldQty,
            min_limit: values.minLimit ?? 0,
            unit: values.unitType || 'UN',
          })
          await supabase.from('products').update({ quantity: yieldQty, updated_at: new Date().toISOString() }).eq('id', productId)

          // Baixar insumos: dar baixa nos itens e no estoque de itens/insumos
          if (productItemsData.length > 0 && yieldQty > 0) {
            const createdBy = await getCurrentUserId()
            for (const pi of productItemsData) {
              const quantityUsed = (Number(pi.quantity) || 0) * yieldQty
              if (quantityUsed <= 0) continue
              const itemId = pi.id
              const { data: st } = await supabase
                .from('stock')
                .select('id, quantity_current')
                .eq('item_id', itemId)
                .eq('stock_type', 'ITEM')
                .maybeSingle()
              if (st) {
                const newQty = Math.max(0, (Number(st.quantity_current) || 0) - quantityUsed)
                await supabase.from('stock').update({ quantity_current: newQty, updated_at: new Date().toISOString() }).eq('id', st.id)
                if (createdBy) {
                  await supabase.from('stock_movements').insert({
                    stock_id: st.id,
                    delta_quantity: -quantityUsed,
                    reason: `Produção — ${productName}`,
                    created_by: createdBy,
                  })
                }
              }
              const { data: itemRow } = await supabase.from('items').select('quantity, cost_per_base_unit').eq('id', itemId).single()
              if (itemRow) {
                const newItemQty = Math.max(0, (Number(itemRow.quantity) || 0) - quantityUsed)
                const unitCost = Number(itemRow.cost_per_base_unit) || 0
                const newCostTotal = newItemQty * unitCost
                await supabase.from('items').update({ quantity: newItemQty, cost_price: newCostTotal, updated_at: new Date().toISOString() }).eq('id', itemId)
              }
            }
          }
        } else {
          await supabase.from('stock').update({
            min_limit: values.minLimit ?? 0,
            updated_at: new Date().toISOString(),
          }).eq('id', existingProductStock.id)
          await supabase.from('products').update({ quantity: Number(existingProductStock.quantity_current) || 0, updated_at: new Date().toISOString() }).eq('id', productId)
        }
      }

      // Produto REVENDA: atualizar min_limit do estoque do produto
      if (productType === 'REVENDA') {
        const { data: revendaStock } = await supabase
          .from('stock')
          .select('id')
          .eq('product_id', productId)
          .eq('stock_type', 'PRODUCT')
          .maybeSingle()
        if (revendaStock) {
          await supabase.from('stock').update({
            min_limit: values.minLimit ?? 0,
            updated_at: new Date().toISOString(),
          }).eq('id', revendaStock.id)
        }
      }

      // Normalize workload to minutes before sending to edge (same normalization as preview)
      const unitMeasure = (currentUser.unitMeasure || 'MINUTES') as 'MINUTES' | 'HOURS' | 'DAYS' | 'ACTIVITIES'
      const normalizedWorkloadMinutes = normalizeToMinutes(
        productPriceInfo.productWorkloadInMinutes || 0,
        unitMeasure,
        isCalcService,
      )

      const { data: calcResult, error: calcError } = await supabase.functions.invoke('calc-tax-engine', {
        body: {
          tenant_id: tenantId,
          product_id: productId,
          sale_scope: saleScope,
          buyer_type: buyerType,
          destination_state: destinationState,
          commission_percent: productPriceInfo.salesCommissionPercent || 0,
          profit_percent: productPriceInfo.productProfitPercent || 0,
          product_workload_minutes: normalizedWorkloadMinutes,
        },
      })

      const calcFailed = !!calcError || !calcResult?.success
      if (calcFailed) {
        const is401 =
          typeof (calcError as any)?.context?.status === 'number' &&
          (calcError as any).context.status === 401
        const rawMsg =
          (calcResult as any)?.error || calcError?.message || 'Erro no motor fiscal.'
        const friendlyMsg = is401
          ? 'Não autorizado (sessão expirada?). Faça login novamente.'
          : rawMsg.includes('non-2xx') || rawMsg.includes('401')
            ? 'Servidor retornou erro. Se persistir, faça login novamente.'
            : rawMsg
        messageApi.open({
          type: 'warning',
          content: `Produto e itens salvos. Não foi possível atualizar o cálculo de impostos: ${friendlyMsg}`,
          duration: 8,
        })
      } else {
        messageApi.open({
          type: 'success',
          content: 'Produto salvo!',
        })
      }

      router.push(ROUTES.PRODUCTS)
    } catch (ex: any) {
      console.error('Erro ao salvar produto:', ex)
      messageApi.open({
        type: 'error',
        content: ex?.message || 'Preencha todos os campos corretamente para salvar o produto.',
      })
    }
  }

  const handleClickRemoveItem = (id: string) => {
    setProductItemsData((prev: IItemProductModel[]) =>
      prev.filter((item: IItemProductModel) => item.id !== id)
    )
  }

  const handleClickUpdateItemPrice = async (id: string) => {
    try {
      const updatedItem = items.find((item) => id === item.id)
      if (!updatedItem) return

      const costPerUnit = Number(updatedItem.price) ?? Number((updatedItem as any).cost_per_base_unit) ?? 0
      const refPrice = Math.max(0.01, costPerUnit)

      const updatedItemsData = productItemsData.map((item) => {
        if (item.id === id) {
          const qty = Number(item.quantity) || 1
          return {
            ...item,
            referencePrice: refPrice,
            referenceQuantity: 1,
            price: Math.max(0.01, qty * refPrice),
          }
        }

        return item
      })

      setProductItemsData(updatedItemsData)
    } catch {
      messageApi.open({
        type: 'error',
        content: 'Não foi possível atualizar o valor do item.',
      })
    }
  }

  const yieldQty = Number(productForm.getFieldValue('quantity')) || 1

  const getUnitLabel = (unitType: string | undefined) =>
    (UNIT_TYPE as Record<string, string>)[unitType?.toUpperCase() || ''] || unitType || 'Unidade'

  const columns: ColumnsType<IItemProductModel> = [
    {
      title: 'Nome',
      dataIndex: 'name',
      key: 'name',
      width: '22%',
    },
    {
      title: 'Qtd. em estoque',
      key: 'stockQuantity',
      width: '14%',
      render: (_, record: IItemProductModel & { stockQuantity?: number | null; stockUnit?: string }) => {
        const qty = record.stockQuantity
        const u = getUnitLabel(record.stockUnit || record.unitType)
        if (qty == null) return <span style={{ color: '#64748b', fontSize: 12 }}>—</span>
        return (
          <span style={{ fontSize: 13 }}>
            {Number(qty) % 1 === 0 ? Number(qty) : Number(qty).toFixed(2)} {u}
          </span>
        )
      },
    },
    {
      title: 'Qtd. por unidade',
      dataIndex: 'quantity',
      key: 'quantity',
      width: '16%',
      render: (text, record) => (
        <Input
          key={record.id}
          value={text}
          type="number"
          step="0.01"
          min="0.01"
          onChange={(e) => handleQuantityChange(record.id, e.target.value)}
          suffix={getUnitLabel(record.unitType)}
        />
      ),
    },
    {
      title: 'Qtd. Total',
      key: 'totalQty',
      width: '14%',
      render: (_, record) => {
        const total = (record.quantity || 0) * yieldQty
        return (
          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}>
            {total % 1 === 0 ? total : total.toFixed(2)} {getUnitLabel(record.unitType)}
          </span>
        )
      },
    },
    {
      title: 'Valor (Custo)',
      dataIndex: 'price',
      key: 'price',
      width: '15%',
      render: (value) => `R$ ${getMonetaryValue(value)}`,
    },
    {
      title: 'Ações',
      key: 'action',
      width: '30%',
      render: (_, { id }: IItemProductModel) => (
        <Space>
          {isEditingMode && (
            <Button onClick={() => handleClickUpdateItemPrice(id)} type="link">
              Atualizar valor item
            </Button>
          )}

          <Popconfirm title="Tem certeza?" onConfirm={() => handleClickRemoveItem(id)}>
            <Button type="link">Excluir</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleChangePrecificationInputs = (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault()

    setProductPriceInfo((prev) => ({
      ...prev,
      [event.target.name]: Number(event.target.value),
    }))
  }

  const filterOption = (input: string, option: { children: string }) =>
    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())

  return (
    <>
      <header className="flex justify-between mb-4">
        <h1 className="text-3xl">{product ? PAGE_TITLES.EDIT_PRODUCT : PAGE_TITLES.NEW_PRODUCT}</h1>
      </header>

      {/* ══════════════════════════════════════════════════════
          TIPO DO PRODUTO: Produzido (receita) ou Revenda
          ══════════════════════════════════════════════════════ */}
      <Card size="small" style={{ marginBottom: 16 }}>
        {isRevendaFromDb ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
            <span style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 6,
              padding: '4px 14px', fontWeight: 600, fontSize: 13, color: '#000000',
            }}>📦 Revenda (produto acabado)</span>
          </div>
        ) : isCalcTypeService ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
            <span style={{
              background: '#E6F7FF', border: '1px solid #91D5FF', borderRadius: 6,
              padding: '4px 14px', fontWeight: 600, fontSize: 13, color: '#0a0a0a',
            }}>📦 Revenda</span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
              <Radio.Group
                value={productType}
                onChange={(e) => {
                  setProductType(e.target.value)
                  if (e.target.value === 'PRODUZIDO') {
                    setBaseItemId(null)
                    setProductItemsData([])
                  }
                }}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="PRODUZIDO">🛠️ Produzido (receita)</Radio.Button>
                <Radio.Button value="REVENDA">📦 Revenda (produto acabado)</Radio.Button>
              </Radio.Group>
            </div>

            {productType === 'REVENDA' && (
              <div style={{
                background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 8,
                padding: '10px 14px', fontSize: 12, marginBottom: 16,
              }}>
                <InfoCircleOutlined style={{ color: '#FA8C16', marginRight: 6 }} />
                <strong>Revenda:</strong> Selecione um item do tipo &ldquo;Mercadoria para revenda&rdquo; como base do custo.
                O custo do produto será o custo desse item.
              </div>
            )}

            {productType === 'REVENDA' && (
              <Form.Item label="Item base (mercadoria para revenda)" style={{ maxWidth: 400 }}>
                <Select
                  showSearch
                  placeholder="Selecione o item de revenda"
                  value={baseItemId}
                  onChange={(val) => setBaseItemId(val)}
                  filterOption={(input, option) =>
                    (option?.children as unknown as string || '').toLowerCase().includes(input.toLowerCase())
                  }
                  notFoundContent={
                    <div style={{ padding: 12, textAlign: 'center', color: '#64748b' }}>
                      Nenhum item do tipo &ldquo;Revenda&rdquo; cadastrado.
                    </div>
                  }
                >
                  {itemsForSelection.map((item) => (
                    <Select.Option key={item.id} value={item.id}>
                      {item.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            )}
          </>
        )}
      </Card>

      <Card size="small">
        <Form form={productForm} layout="vertical">
          <Form.Item name="id" label="Id" hidden>
            <Input />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: isEditingMode ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 16 }}>
            {isEditingMode && (
              <Form.Item
                name="code"
                label="Código"
                rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
              >
                <Input />
              </Form.Item>
            )}

            <Form.Item
              name="name"
              label="Nome"
              rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
            >
              <Input onChange={(e) => handleProductNameChange(e.target.value)} />
            </Form.Item>

            <Form.Item
              name="description"
              label="Descrição"
              rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
            >
              <Input onChange={(e) => productForm.setFieldsValue({ description: capitalizeFirst(e.target.value) })} />
            </Form.Item>

            <Form.Item
              name="quantity"
              label="Quantidade de produção"
              rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
            >
              <Input type="number" min="1" step="1" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              name="unitType"
              label="Unidade"
              rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
              initialValue="UN"
            >
              <Select>
                <Select.Option value="G">Gramas (g)</Select.Option>
                <Select.Option value="KG">Quilos (kg)</Select.Option>
                <Select.Option value="ML">Mililitros (ml)</Select.Option>
                <Select.Option value="L">Litros (l)</Select.Option>
                <Select.Option value="MM">Milímetros (mm)</Select.Option>
                <Select.Option value="CM">Centímetros (cm)</Select.Option>
                <Select.Option value="M">Metros (m)</Select.Option>
                <Select.Option value="KM">Quilômetros (km)</Select.Option>
                <Select.Option value="M2">Área (m²)</Select.Option>
                <Select.Option value="M3">Volume (m³)</Select.Option>
                <Select.Option value="W">Potência (w)</Select.Option>
                <Select.Option value="UN">Unidade (un)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="minLimit"
              label="Estoque mínimo (alerta)"
              initialValue={0}
              tooltip="Abaixo deste valor o produto aparecerá em status Baixo/Crítico na aba Estoque."
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>

            <Form.Item
              name="max_discount_percent"
              label="Desconto máximo (%)"
              tooltip="Limite máximo de desconto permitido para este produto em orçamentos/vendas. Deixe vazio para sem limite."
            >
              <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} placeholder="Ex: 10" addonAfter="%" />
            </Form.Item>

            <Form.Item
              name="recurrence_days"
              label={
                <span>
                  Tempo de recorrência (dias)&nbsp;
                  <Tooltip title="Opcional. Quantidade de dias para recorrência automática de contato com o cliente após a venda.">
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
            >
              <InputNumber min={1} step={1} style={{ width: '100%' }} placeholder="Ex: 30 (dias)" />
            </Form.Item>
          </div>
        </Form>

        {(ncmSugLoading || ncmSuggestions.length > 0) && (
          <div style={{
            marginTop: 8, marginBottom: 4, padding: '8px 12px',
            background: '#0a1628', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <SearchOutlined style={{ fontSize: 10 }} />
              Sugestões de NCM para o nome digitado:
            </div>
            {ncmSugLoading ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ncmSuggestions.map((s) => (
                  <div
                    key={s.code}
                    onClick={() => handleSelectNcmSuggestion(s.code)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                      background: '#111c2e', border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#111c2e'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.description}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', fontFamily: 'monospace', marginLeft: 12 }}>
                      {s.code}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
          <Form form={productForm} layout="vertical" style={{ display: 'contents' }}>
            <Form.Item
              name="ncm_code"
              label={
                <span>
                  NCM do Produto&nbsp;
                  <Tooltip title="Nomenclatura Comum do Mercosul — código fiscal do produto final. Digite o código ou pesquise pelo nome do produto.">
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
              style={{ marginBottom: 0 }}
            >
              <AutoComplete
                options={ncmOptions}
                onSearch={handleNcmSearch}
                onSelect={(value: string) => productForm.setFieldsValue({ ncm_code: value })}
                placeholder="Digite o NCM ou pesquise (ex: bolo, 1905...)"
                notFoundContent={ncmFieldSearching ? <Spin size="small" /> : null}
                allowClear
              />
            </Form.Item>
          </Form>
        </div>
      </Card>

      {/* ══════════════════════════════════════════════════════
          CONTEXTO DE VENDA — Ajuste 2
          Imposto não fica fixo no produto, fica na precificação
          ══════════════════════════════════════════════════════ */}
      <Card size="small" style={{ marginTop: 16 }}>
        <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>
          Contexto da Venda (para cálculo de impostos)
        </Divider>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
              Onde vende?&nbsp;
              <Tooltip title="Define se a venda será dentro do mesmo estado (intraestadual) ou para outro estado (interestadual). Impacta na alíquota do ICMS.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </label>
            <Select
              value={saleScope}
              onChange={(val) => setSaleScope(val)}
              style={{ width: '100%' }}
            >
              <Select.Option value="INTRAESTADUAL">🏠 Dentro do estado</Select.Option>
              <Select.Option value="INTERESTADUAL">🚛 Fora do estado</Select.Option>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
              Tipo de comprador&nbsp;
              <Tooltip title="Consumidor final (pessoa física) ou PJ contribuinte (outra empresa). Impacta no ICMS e DIFAL.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </label>
            <Select
              value={buyerType}
              onChange={(val) => setBuyerType(val)}
              style={{ width: '100%' }}
            >
              <Select.Option value="CONSUMIDOR_FINAL">👤 Consumidor final</Select.Option>
              <Select.Option value="CONTRIBUINTE_PJ">🏢 PJ Contribuinte</Select.Option>
            </Select>
          </div>

          {saleScope === 'INTERESTADUAL' && (
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                Estado de destino
              </label>
              <Select
                showSearch
                placeholder="UF destino"
                value={destinationState}
                onChange={(val) => setDestinationState(val)}
                style={{ width: '100%' }}
                allowClear
              >
                {STATES.map(s => (
                  <Select.Option key={s} value={s}>{s}</Select.Option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div style={{
          background: 'rgba(46, 144, 250, 0.12)', border: '1px solid rgba(46, 144, 250, 0.3)', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#e2e8f0', marginTop: 16,
        }}>
          <InfoCircleOutlined style={{ color: '#38bdf8', marginRight: 6 }} />
          <strong>Como funciona:</strong> O mesmo produto pode ter impostos diferentes
          dependendo de onde é vendido e para quem. Essas informações são usadas na
          simulação de preço — o imposto não fica fixo no produto.
        </div>
      </Card>

      {productType === 'PRODUZIDO' && (
        <ContentIndustrialization
          itemsForm={itemsForm}
          handleClickAddItem={handleClickAddItem}
          filterOption={filterOption}
          items={itemsForSelection}
          columns={columns}
          productItemsData={productItemsData}
          handleChangePrecificationInputs={handleChangePrecificationInputs}
          productPriceInfo={productPriceInfo}
          doProductCalc={doProductCalc}
          calcBase={calcBase}
          currentUser={currentUser}
          productForm={productForm}
          customTaxPercent={customTaxPercent}
          onCustomTaxPercentChange={setCustomTaxPercent}
        />
      )}
      {productType === 'REVENDA' && isCalcTypeService && (
        /* SERVICE segmentation: REVENDA hides mão de obra produtiva — uses resale form */
        <ContentResale
          itemsForm={itemsForm}
          handleClickAddItem={handleClickAddItem}
          filterOption={filterOption}
          items={itemsForSelection}
          columns={columns}
          productItemsData={productItemsData}
          handleChangePrecificationInputs={handleChangePrecificationInputs}
          productPriceInfo={productPriceInfo}
          doProductCalc={doProductCalc}
          calcBase={calcBase}
          currentUser={currentUser}
          productForm={productForm}
          customTaxPercent={customTaxPercent}
          onCustomTaxPercentChange={setCustomTaxPercent}
        />
      )}
      {productType === 'REVENDA' && !isCalcTypeService && (
        <ContentResale
          itemsForm={itemsForm}
          handleClickAddItem={handleClickAddItem}
          filterOption={filterOption}
          items={itemsForSelection}
          columns={columns}
          productItemsData={productItemsData}
          handleChangePrecificationInputs={handleChangePrecificationInputs}
          productPriceInfo={productPriceInfo}
          doProductCalc={doProductCalc}
          calcBase={calcBase}
          currentUser={currentUser}
          productForm={productForm}
          customTaxPercent={customTaxPercent}
          onCustomTaxPercentChange={setCustomTaxPercent}
        />
      )}
      <footer className="flex flex-row-reverse mt-5 mr-4">
        <Button onClick={handleSaveProduct} type="primary" className="ml-2">
          Salvar
        </Button>
        <Button onClick={goBack}>Cancelar</Button>
      </footer>
    </>
  )
}
