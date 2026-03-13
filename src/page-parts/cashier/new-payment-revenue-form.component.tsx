import { Input, Form, Select, FormInstance, DatePicker, Button } from 'antd'
import { currencyDotMask } from '@/utils/currency-mask'
import {
  CASHIER_CATEGORY,
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

        <Form.Item name="category" label="Categoria" rules={[{ required: true }]}>
          <Select showSearch filterOption onChange={handleCategoryChange}>
            {Object.values(CASHIER_CATEGORY[type]).map(({ value, key }) => (
              <Select.Option key={key} value={key}>
                {value}
              </Select.Option>
            ))}
          </Select>
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
              allowClear
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
