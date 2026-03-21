import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Drawer, Form, Input, Select, Space, Table, message, Alert, Spin, Tag } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { Months } from '@/components/months/months.component'
import { Month, MonthObjectType, monthObjects } from '@/constants/month'
import { PAGE_TITLES } from '@/constants/page-titles'
import { PAYMENT_REVENUE_TITLE_TYPE } from '@/constants/payment-revenue-title'
import { NewPaymentRevenueForm } from '@/page-parts/cashier/new-payment-revenue-form.component'
import { IPaymentRevenueTitleModel } from '@/server/model/payment-revenue-title'
import { getFormattedDate } from '@/utils/get-formatted-date'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import Link from 'next/link'
import { currencyMask } from '@/utils/currency-mask'
import { getCategoryName } from '@/utils/get-category-name.util'
import { ROUTES } from '@/constants/routes'
import {
  ALL_CASHIER_CATEGORIES,
  CASHIER_CATEGORY,
  CASHIER_CATEGORY_EXPENSE_OBJECT,
  CASHIER_CATEGORY_INCOME_OBJECT,
  EXPENSE_GROUPS,
  getExpenseGroupLabel,
  getExpenseGroupColor,
} from '@/constants/cashier-category'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'

type DataItem = {
  category: string
  accPrice: number
}

const incomeColumns: ColumnsType<IPaymentRevenueTitleModel> = [
  {
    title: 'Data',
    dataIndex: 'date',
    key: 'date',
    render: (value) => getFormattedDate(new Date(value)),
    sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
    defaultSortOrder: 'ascend',
  },
  {
    title: 'Valor',
    dataIndex: 'price',
    key: 'price',
    width: '120px',
    render: (value) => `R$ ${getMonetaryValue(value)}`,
  },
  {
    title: 'Categoria',
    dataIndex: 'category',
    key: 'category',
    render: (value) => getCategoryName(value),
  },
]

const expenseColumns: ColumnsType<IPaymentRevenueTitleModel> = [
  {
    title: 'Data',
    dataIndex: 'date',
    key: 'date',
    render: (value) => getFormattedDate(new Date(value)),
    sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
    defaultSortOrder: 'ascend',
  },
  {
    title: 'Valor',
    dataIndex: 'price',
    key: 'price',
    width: '110px',
    render: (value) => `R$ ${getMonetaryValue(value)}`,
  },
  {
    title: 'Categoria',
    dataIndex: 'category',
    key: 'category',
    render: (value) => getCategoryName(value),
  },
  {
    title: 'Tipo',
    dataIndex: 'expense_group',
    key: 'expense_group',
    width: '140px',
    render: (value) => value ? (
      <Tag color={getExpenseGroupColor(value)} style={{ fontSize: 11 }}>
        {getExpenseGroupLabel(value)}
      </Tag>
    ) : <span style={{ color: '#98A2B3', fontSize: 11 }}>—</span>,
    filters: Object.values(EXPENSE_GROUPS).map(g => ({ text: g.label, value: g.key })),
    onFilter: (value, record) => record.expense_group === value,
  },
]

type GoalPrice = {
  value: number
  formattedValue: string
}

const DAY_OF_MONTH_LIMIT = 25

function Cashier() {
  const router = useRouter()
  const { canView, canEdit } = usePermissions()
  if (!canView(MODULES.CASHIER)) {
    return <Layout tabTitle={PAGE_TITLES.CASHIER}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
  }
  const { year: yearParam, month: monthParam } = router.query
  const year = Number(yearParam) || new Date().getFullYear()
  const month = (monthParam as string || 'jan').toUpperCase()

  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const previousYear = currentYear - 1
  const nextYear = currentYear + 1

  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [incomeData, setIncomeData] = useState<IPaymentRevenueTitleModel[]>([])
  const [expenseData, setExpenseData] = useState<IPaymentRevenueTitleModel[]>([])
  const [currentTitleType, setCurrentTitleType] = useState<PAYMENT_REVENUE_TITLE_TYPE>(null)
  const [goalPrice, setGoalPrice] = useState<GoalPrice>({ value: null, formattedValue: '' })
  const monthEnum = month as Month
  const [warningMessage, setWarningMessage] = useState<string>('')
  const [alertMessage, setAlertMessage] = useState<string>('')

  const [form] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()

  async function fetchCashierData() {
    setLoading(true)
    try {
      const tenantId = await getTenantId()
      if (!tenantId) return

      const monthObj = Object.values(monthObjects).find(
        (m) => m.short.toUpperCase() === monthEnum
      )
      if (!monthObj) return

      const monthDate = `${year}-${String(monthObj.number + 1).padStart(2, '0')}-01`

      const [entriesRes, monthsRes] = await Promise.all([
        supabase
          .from('cash_entries')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .gte('due_date', `${year}-${String(monthObj.number + 1).padStart(2, '0')}-01`)
          .lt('due_date', monthObj.number + 1 >= 12
            ? `${year + 1}-01-01`
            : `${year}-${String(monthObj.number + 2).padStart(2, '0')}-01`
          ),
        supabase
          .from('cashier_months')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('month_year', monthDate)
          .maybeSingle(),
      ])

      const entries = entriesRes.data || []
      const cashierMonth = monthsRes.data

      const incomes: IPaymentRevenueTitleModel[] = entries
        .filter((e: any) => e.type === 'INCOME')
        .map((e: any) => ({
          id: e.id,
          date: e.due_date ? new Date(e.due_date) : new Date(),
          price: getEffectiveIncomeAmount(e),
          category: e.description || 'RECEITA_VENDAS',
          description: e.description || '',
          expense_group: null,
        }))

      const expenses: IPaymentRevenueTitleModel[] = entries
        .filter((e: any) => e.type === 'EXPENSE')
        .map((e: any) => ({
          id: e.id,
          date: e.due_date ? new Date(e.due_date) : new Date(),
          price: Number(e.amount) || 0,
          category: e.description || 'DESPESA_GERAL',
          description: e.description || '',
          expense_group: e.expense_group || null,
        }))

      setIncomeData(incomes)
      setExpenseData(expenses)

      if (cashierMonth) {
        setGoalPrice({
          value: Number(cashierMonth.balance) || null,
          formattedValue: cashierMonth.balance ? String(cashierMonth.balance).replace('.', ',') : '',
        })
      }
    } catch (err) {
      console.error('Erro ao carregar caixa:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (yearParam && monthParam) fetchCashierData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearParam, monthParam])

  useEffect(() => {
    setWarningMessage('')
    setAlertMessage('')

    const monthSelected = Object.values(monthObjects).find(
      (m) => m.short.toUpperCase() === monthEnum
    )?.number
    if (monthSelected === undefined) return

    const isSameYearMonth = year === currentYear && monthSelected === currentDate.getMonth()
    const isAboveLimitMonthDate = currentDate.getDate() >= DAY_OF_MONTH_LIMIT

    const hasProfitDistribution = expenseData.find(
      (expense) => expense.category === CASHIER_CATEGORY.EXPENSE?.DISTRIBUICAO_DE_LUCROS?.key
    )

    if (isSameYearMonth && isAboveLimitMonthDate && !hasProfitDistribution) {
      setWarningMessage('Você deve informar a distribuição de lucro')
    }

    const incomeSum = incomeData.reduce((acc, curr) => (acc += curr.price), 0)
    const expenseSum = expenseData.reduce((acc, curr) => (acc += curr.price), 0)
    const balance = Number(incomeSum.toFixed(2)) - Number(expenseSum.toFixed(2))

    if (1 * balance !== 0) {
      setAlertMessage(
        `O seu caixa deve fechar zerado e atualmente está R$ ${getMonetaryValue(
          balance
        )} no cálculo entradas descontando saídas`
      )
    }
  }, [incomeData, expenseData, monthEnum, year])

  function handleChangeMonth(m: MonthObjectType) {
    router.push(`${ROUTES.CASHIER}/${year}/${m.short}`)
  }

  function handleChangeYearSelect(selectedYear: number) {
    router.push(`${ROUTES.CASHIER}/${selectedYear}/${monthParam}`)
  }

  function handleClickAddPaymenteRevenue(type: PAYMENT_REVENUE_TITLE_TYPE) {
    setCurrentTitleType(type)
    setFormOpen(true)
  }

  function handleClickTableItem(
    record: IPaymentRevenueTitleModel,
    type: PAYMENT_REVENUE_TITLE_TYPE
  ) {
    form.setFieldsValue({
      category: record.category,
      date: dayjs(record.date),
      description: record.description,
      id: record.id,
      price: record.price.toString().replace('.', ','),
      expense_group: record.expense_group || undefined,
    })

    setCurrentTitleType(type)
    setFormOpen(true)
  }

  function renderTable(type: PAYMENT_REVENUE_TITLE_TYPE) {
    const title = type === PAYMENT_REVENUE_TITLE_TYPE.INCOME ? 'Entradas' : 'Saídas'
    const data = type === PAYMENT_REVENUE_TITLE_TYPE.INCOME ? incomeData : expenseData
    const borderColor = type === PAYMENT_REVENUE_TITLE_TYPE.INCOME
      ? 'var(--color-success)' : 'var(--color-error)'
    const cols = type === PAYMENT_REVENUE_TITLE_TYPE.INCOME ? incomeColumns : expenseColumns

    return (
      <div className="pc-card--table" style={{ borderTop: `3px solid ${borderColor}` }}>
        <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-neutral-700)' }}>{title}</span>
          <Button type="primary" size="small" onClick={() => handleClickAddPaymenteRevenue(type)}>
            Adicionar
          </Button>
        </div>
        <Table
          columns={cols}
          expandable={{
            expandedRowRender: (record) => <p style={{ margin: 0 }}>{record.description}</p>,
            rowExpandable: (record) => !!record.description,
          }}
          rowKey={(record) => record.id}
          dataSource={data}
          pagination={false}
          size="small"
          onRow={(record) => ({
            onClick: () => handleClickTableItem(record, type),
          })}
        />
      </div>
    )
  }

  function sortDataByCategory(data: DataItem[]) {
    return data.sort((a, b) => {
      const catA = ALL_CASHIER_CATEGORIES[a.category as CASHIER_CATEGORY_EXPENSE_OBJECT | CASHIER_CATEGORY_INCOME_OBJECT]
      const catB = ALL_CASHIER_CATEGORIES[b.category as CASHIER_CATEGORY_EXPENSE_OBJECT | CASHIER_CATEGORY_INCOME_OBJECT]
      return (catA?.order || 0) - (catB?.order || 0)
    })
  }

  function renderSummaryData(title: string, items: IPaymentRevenueTitleModel[], isExpense?: boolean) {
    let total = 0
    const data: DataItem[] = items.reduce((acc: DataItem[], current) => {
      const idx = acc.findIndex((item) => item.category === current.category)
      if (idx > -1) {
        acc[idx].accPrice += current.price
      } else {
        acc.push({ category: current.category, accPrice: current.price })
      }
      total += current.price
      return acc
    }, [])

    return (
      <>
        <div className="text-sm font-bold">{title}</div>
        <div className="flex justify-between w-full my-2">
          <div className="text-sm font-bold">Categoria</div>
          <div className="text-sm font-bold">Valor acumulado</div>
        </div>
        <ul className="list-none p-0 w-full">
          {sortDataByCategory(data).map(({ category, accPrice }) => {
            const categoryName = getCategoryName(category) || category
            const groupLabel = isExpense
              ? (() => {
                  const entry = CASHIER_CATEGORY.EXPENSE[category as CASHIER_CATEGORY_EXPENSE_OBJECT]
                  if (entry && 'group' in entry) {
                    return getExpenseGroupLabel(entry.group)
                  }
                  return null
                })()
              : null

            return (
              <li className="flex justify-between w-full py-1 border-t-0 border-l-0 border-r-0 border-b border-dotted" key={category}>
                <span>
                  {categoryName}
                  {groupLabel && (
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>— {groupLabel}</span>
                  )}
                </span>
                <span className="text-sm rounded-md px-1">{`R$ ${getMonetaryValue(accPrice)}`}</span>
              </li>
            )
          })}
          <li className="flex justify-between w-full py-1 font-bold mt-1">
            <span>Total</span>
            <span style={{ fontSize: 12, backgroundColor: 'rgba(34, 197, 94, 0.18)', color: '#f1f5f9', borderRadius: 4, padding: '2px 6px' }}>{`R$ ${getMonetaryValue(total)}`}</span>
          </li>
        </ul>
      </>
    )
  }

  function renderExpenseGroupSummary() {
    const groups: Record<string, number> = {}
    let total = 0
    for (const e of expenseData) {
      const g = e.expense_group || 'SEM_TIPO'
      groups[g] = (groups[g] || 0) + e.price
      total += e.price
    }

    const hasGroups = Object.keys(groups).some(k => k !== 'SEM_TIPO')
    if (!hasGroups && !groups['SEM_TIPO']) return null

    return (
      <div style={{ marginTop: 16 }}>
        <div className="text-sm font-bold" style={{ marginBottom: 8 }}>Despesas por Tipo</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(EXPENSE_GROUPS).map(([key, grp]) => {
            const val = groups[key] || 0
            if (val === 0) return null
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0'
            return (
              <div
                key={key}
                style={{
                  flex: '1 1 140px',
                  border: `2px solid ${grp.color}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  minWidth: 140,
                }}
              >
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{grp.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: grp.color }}>
                  R$ {getMonetaryValue(val)}
                </div>
                <div style={{ fontSize: 11, color: '#98A2B3' }}>{pct}% do total</div>
              </div>
            )
          })}
          {groups['SEM_TIPO'] > 0 && (
            <div
              style={{
                flex: '1 1 140px',
                border: '2px solid #D1D5DB',
                borderRadius: 8,
                padding: '8px 12px',
                minWidth: 140,
              }}
            >
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Sem tipo</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#6B7280' }}>
                R$ {getMonetaryValue(groups['SEM_TIPO'])}
              </div>
              <div style={{ fontSize: 11, color: '#98A2B3' }}>
                {total > 0 ? ((groups['SEM_TIPO'] / total) * 100).toFixed(1) : '0.0'}% do total
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function addNewItemToTable(newItem: IPaymentRevenueTitleModel) {
    const prepareUpdate = (prev: IPaymentRevenueTitleModel[]) => {
      const idx = prev.findIndex((item) => item.id === newItem.id)
      if (idx > -1) {
        const copy = [...prev]
        copy[idx] = newItem
        return copy
      }
      return [newItem, ...prev]
    }

    if (currentTitleType === PAYMENT_REVENUE_TITLE_TYPE.INCOME) setIncomeData(prepareUpdate)
    if (currentTitleType === PAYMENT_REVENUE_TITLE_TYPE.EXPENSE) setExpenseData(prepareUpdate)
  }

  function removeItemFromTable(idKey: string) {
    const prepareUpdate = (prev: IPaymentRevenueTitleModel[]) =>
      prev.filter(({ id }) => id !== idKey)

    if (currentTitleType === PAYMENT_REVENUE_TITLE_TYPE.INCOME) setIncomeData(prepareUpdate)
    if (currentTitleType === PAYMENT_REVENUE_TITLE_TYPE.EXPENSE) setExpenseData(prepareUpdate)
  }

  async function handleSave() {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      const tenantId = await getTenantId()
      if (!tenantId) {
        messageApi.error('Não foi possível identificar o tenant.')
        return
      }

      const amount = parseFloat(
        String(values.price).replace(/\./g, '').replace(',', '.')
      )

      const isExpense = currentTitleType === PAYMENT_REVENUE_TITLE_TYPE.EXPENSE

      const entryData: any = {
        tenant_id: tenantId,
        type: isExpense ? 'EXPENSE' : 'INCOME',
        amount,
        due_date: values.date.format('YYYY-MM-DD'),
        description: values.category || null,
      }

      if (isExpense) {
        entryData.expense_group = values.expense_group || null
      }

      let savedEntry: any

      if (values.id) {
        const { data, error } = await supabase
          .from('cash_entries')
          .update(entryData)
          .eq('id', values.id)
          .select()
          .single()
        if (error) throw error
        savedEntry = data
      } else {
        const { data, error } = await supabase
          .from('cash_entries')
          .insert(entryData)
          .select()
          .single()
        if (error) throw error
        savedEntry = data
      }

      const newItem: IPaymentRevenueTitleModel = {
        id: savedEntry.id,
        date: savedEntry.due_date ? new Date(savedEntry.due_date) : new Date(),
        price: Number(savedEntry.amount) || 0,
        category: savedEntry.description || '',
        description: savedEntry.description || '',
        expense_group: savedEntry.expense_group || null,
      }

      addNewItemToTable(newItem)
      form.resetFields()
      messageApi.success('Caixa atualizado!')
      onClose()
      mergeExpenseConfig(tenantId).catch(() => {})
    } catch (ex: any) {
      messageApi.error(ex?.message || 'Preencha todos os campos corretamente para salvar.')
    }
  }

  async function handleDelete(idKey: string) {
    try {
      const res = await fetch('/api/delete/cash-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idKey }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erro ao desativar')

      removeItemFromTable(idKey)
      onClose()
      messageApi.success('Desativado com sucesso!')

      const tenantId = await getTenantId()
      if (tenantId) mergeExpenseConfig(tenantId).catch(() => {})
    } catch (ex: any) {
      messageApi.error(ex?.message || 'Erro ao desativar')
    }
  }

  function onClose() {
    setFormOpen(false)
    form.resetFields()
  }

  function handleChangeGoalPrice(value: string) {
    const formattedValue = currencyMask(value)
    setGoalPrice({
      value: parseFloat(formattedValue.replace(/\./g, '').replace(',', '.')) || 0,
      formattedValue,
    })
  }

  async function handleSetGoal() {
    if (!goalPrice?.value) return
    try {
      const tenantId = await getTenantId()
      if (!tenantId) return

      const monthObj = Object.values(monthObjects).find(
        (m) => m.short.toUpperCase() === monthEnum
      )
      if (!monthObj) return

      const monthDate = `${year}-${String(monthObj.number + 1).padStart(2, '0')}-01`

      const { data: existing } = await supabase
        .from('cashier_months')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('month_year', monthDate)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('cashier_months')
          .update({ balance: goalPrice.value, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('cashier_months').insert({
          tenant_id: tenantId,
          month_year: monthDate,
          balance: goalPrice.value,
        })
      }

      messageApi.success('Atualizada meta com sucesso!')
    } catch {
      messageApi.error('Ocorreu um erro ao definir a meta!')
    }
  }

  if (loading) {
    return (
      <Layout tabTitle={PAGE_TITLES.CASHIER}>
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      </Layout>
    )
  }

  return (
    <Layout tabTitle={PAGE_TITLES.CASHIER}>
      {contextHolder}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Caixa de <strong>{monthParam}/{year}</strong></h1>
          </div>
          <Select defaultValue={year} onChange={handleChangeYearSelect} style={{ width: 120 }}>
            <Select.Option value={previousYear}>{previousYear}</Select.Option>
            <Select.Option value={currentYear}>{currentYear}</Select.Option>
            <Select.Option value={nextYear}>{nextYear}</Select.Option>
          </Select>
        </div>

        <Months currentMonth={monthEnum} onChangeMonth={handleChangeMonth} />
      </div>

      {warningMessage && <Alert style={{ marginBottom: 8 }} message={warningMessage} type="warning" />}
      {alertMessage && <Alert style={{ marginBottom: 16 }} message={alertMessage} type="error" />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {renderTable(PAYMENT_REVENUE_TITLE_TYPE.INCOME)}
        {renderTable(PAYMENT_REVENUE_TITLE_TYPE.EXPENSE)}
      </div>

      <div className="pc-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Definir meta</h3>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input
            placeholder="Valor meta"
            prefix="R$"
            autoComplete="off"
            value={goalPrice?.formattedValue}
            onChange={({ target }) => handleChangeGoalPrice(target.value)}
            style={{ maxWidth: 250 }}
          />
          <Button onClick={handleSetGoal} type="primary">
            Definir meta
          </Button>
        </div>
      </div>

      <div className="pc-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Resumo</h3>
          <Link href={ROUTES.CASHIER_SUMMARY}>
            <span style={{ color: 'var(--color-primary-600)', fontSize: 13 }}>Ver resumo completo de {new Date().getFullYear()}</span>
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>{renderSummaryData('Receitas', incomeData)}</div>
          <div>
            {renderSummaryData('Despesas', expenseData, true)}
            {renderExpenseGroupSummary()}
          </div>
        </div>
      </div>

      <Drawer
        width={380}
        onClose={onClose}
        open={formOpen}
        extra={
          <Space>
            <Button onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} type="primary">
              Salvar
            </Button>
          </Space>
        }
      >
        <NewPaymentRevenueForm
          form={form}
          year={year}
          month={monthEnum}
          type={currentTitleType}
          onClickDelete={handleDelete}
        />
      </Drawer>
    </Layout>
  )
}

export default Cashier
