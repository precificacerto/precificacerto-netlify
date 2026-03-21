import { useState } from 'react'
import { Input, Form, Select, FormInstance, DatePicker, Button } from 'antd'
import { currencyDotMask } from '@/utils/currency-mask'
import {
  CASHIER_CATEGORY,
  EXPENSE_CATEGORY_OPTIONS,
  EXPENSE_GROUP_OPTIONS,
  getDefaultGroupForCategory,
} from '@/constants/cashier-category'
import { PAYMENT_REVENUE_TITLE_TYPE } from '@/constants/payment-revenue-title'
import { Month, monthObjects } from '@/constants/month'
import dayjs from 'dayjs'

type Props = {
  form: FormInstance
  year: number
  month: Month
  type: PAYMENT_REVENUE_TITLE_TYPE
  onClickDelete: (titleId: string) => void
}

const dateFormat = 'DD/MM/YYYY'

const NewPaymentRevenueForm = ({ form, year, month, type, onClickDelete }: Props) => {
  const [groupAutoSet, setGroupAutoSet] = useState(false)
  const handleChangePrice = (value: string) => form.setFieldsValue({ price: currencyDotMask(value) })
  const monthNumber = Object.values(monthObjects).find(
    (monthObj) => monthObj.short.toUpperCase() === month
  ).number
  const firstDayOfSelectedMonth = new Date(year, monthNumber, 1)

  const isExpense = type === PAYMENT_REVENUE_TITLE_TYPE.EXPENSE

  function disabledDate(current: dayjs.Dayjs) {
    const startOfMonth = new Date(
      firstDayOfSelectedMonth.getFullYear(),
      firstDayOfSelectedMonth.getMonth(),
      1
    )
    const endOfMonth = new Date(
      firstDayOfSelectedMonth.getFullYear(),
      firstDayOfSelectedMonth.getMonth() + 1,
      0
    )

    return current.toDate() < startOfMonth || current.toDate() > endOfMonth
  }

  const handleCategoryChange = (categoryKey: string) => {
    form.setFieldsValue({ category: categoryKey })
    if (isExpense) {
      const defaultGroup = getDefaultGroupForCategory(categoryKey)
      if (defaultGroup) {
        form.setFieldsValue({ expense_group: defaultGroup })
        setGroupAutoSet(true)
      } else {
        setGroupAutoSet(false)
      }
    }
  }

  const titleId = form.getFieldValue('id')

  return (
    <>
      <Form layout="vertical" form={form}>
        <Form.Item name="id" label="Id" hidden>
          <Input />
        </Form.Item>

        <Form.Item name="category" label={isExpense ? 'Categoria de Despesa' : 'Categoria'} rules={[{ required: true }]}>
          {isExpense ? (
            <Select
              showSearch
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              onChange={handleCategoryChange}
              listHeight={320}
              options={EXPENSE_CATEGORY_OPTIONS}
              placeholder="Selecione a categoria de despesa"
            />
          ) : (
            <Select showSearch filterOption onChange={handleCategoryChange} listHeight={320}>
              {Object.values(CASHIER_CATEGORY[type]).map(({ value, key }) => (
                <Select.Option key={key} value={key}>
                  {value}
                </Select.Option>
              ))}
            </Select>
          )}
        </Form.Item>

        {isExpense && (
          <Form.Item
            name="expense_group"
            label="Tipo de Despesa"
            rules={[{ required: true, message: 'Selecione o tipo de despesa' }]}
          >
            <Select
              placeholder="Selecione o tipo"
              options={EXPENSE_GROUP_OPTIONS}
              disabled={groupAutoSet}
            />
          </Form.Item>
        )}

        <Form.Item 
          name="price" 
          label="Valor" 
          rules={[{ required: true }]}
          getValueProps={(value) => ({
            value: currencyDotMask(String(value ?? '')),
          })}
        >
          <Input
            prefix="R$"
            autoComplete="off"
            onChange={({ target }) => handleChangePrice(target.value)}
          />
        </Form.Item>

        <Form.Item name="description" label="Descrição">
          <Input.TextArea rows={4} style={{ resize: 'none' }} />
        </Form.Item>

        <Form.Item name="date" label="Data" rules={[{ required: true }]}>
          <DatePicker
            defaultPickerValue={dayjs(firstDayOfSelectedMonth)}
            disabledDate={disabledDate}
            format={dateFormat}
            className="w-full"
          />
        </Form.Item>

        {isExpense && !titleId && (
          <>
            <Form.Item name="recurrence" label="Recorrência" initialValue="ONCE">
              <Select
                options={[
                  { label: '1 única vez', value: 'ONCE' },
                  { label: 'Semanal', value: 'WEEKLY' },
                  { label: 'Quinzenal', value: 'BIWEEKLY' },
                  { label: 'Mensal', value: 'MONTHLY' },
                  { label: 'Trimestral', value: 'QUARTERLY' },
                ]}
              />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="start_month" label="Mês início">
                <DatePicker picker="month" placeholder="Mês atual" format="MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="end_month" label="Mês fim">
                <DatePicker picker="month" placeholder="Dezembro" format="MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </>
        )}
      </Form>
      {titleId && (
        <Button type="primary" danger onClick={() => onClickDelete(titleId)}>
          Excluir
        </Button>
      )}
    </>
  )
}

export { NewPaymentRevenueForm }
