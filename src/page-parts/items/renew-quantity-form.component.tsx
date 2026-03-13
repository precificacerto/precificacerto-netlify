import { Input, Form, Select, FormInstance, Divider, Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { currencyMask } from '@/utils/currency-mask'
import { UNIT_TYPE } from '@/constants/item-unit-types'

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const REQUIRED = 'Campo obrigatório!'

const ncmMask = (value: string) => {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
}

const capitalizeFirst = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

export type ItemOption = {
  id: string
  name: string
  ncm_code: string
  unitType: string
  quantity: number
  cost_price: number
}

type Props = {
  form: FormInstance
  items: ItemOption[]
}

const RenewQuantityForm = ({ form, items }: Props) => {
  const selectedItemId = Form.useWatch('item_id', form)
  const selectedItem = items.find(i => i.id === selectedItemId)

  const handleChangePrice = (value: string) => {
    form.setFieldsValue({ price: currencyMask(value) })
  }

  return (
    <Form layout="vertical" form={form}>
      <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>
        Item
      </Divider>

      <Form.Item
        name="item_id"
        label="Selecione o item"
        rules={[{ required: true, message: REQUIRED }]}
      >
        <Select
          placeholder="Buscar e escolher o item..."
          showSearch
          optionFilterProp="label"
          filterOption={(input, opt) =>
            (opt?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
          }
          options={items.map(item => ({
            value: item.id,
            label: item.name,
          }))}
        />
      </Form.Item>

      {selectedItem && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          background: '#0a1628',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>NCM</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{ncmMask(selectedItem.ncm_code)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, marginBottom: 4 }}>Unidade de medida</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {(UNIT_TYPE as Record<string, string>)[selectedItem.unitType] || selectedItem.unitType}
          </div>
        </div>
      )}

      <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>
        Dados da recompra
      </Divider>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item name="supplier_name" label="Fornecedor">
          <Input
            placeholder="Nome do fornecedor"
            onChange={e => form.setFieldsValue({ supplier_name: capitalizeFirst(e.target.value) })}
          />
        </Form.Item>

        <Form.Item
          name="supplier_state"
          label={
            <span>
              Estado do fornecedor&nbsp;
              <Tooltip title="UF do fornecedor desta compra">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
        >
          <Select placeholder="UF" showSearch allowClear>
            {STATES.map(s => (
              <Select.Option key={s} value={s}>{s}</Select.Option>
            ))}
          </Select>
        </Form.Item>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Form.Item
          name="quantity"
          label="Quantidade comprada"
          rules={[
            { required: true, message: REQUIRED },
            () => ({
              validator(_, value) {
                const n = parseFloat(value)
                if (value == null || value === '') return Promise.reject(new Error(REQUIRED))
                if (isNaN(n) || n < 0.001) return Promise.reject(new Error('Informe uma quantidade válida (maior que zero)'))
                return Promise.resolve()
              },
            }),
          ]}
          tooltip="Quantidade que está entrando nesta recompra"
        >
          <Input type="number" min="0.001" step="any" placeholder="Ex: 20" />
        </Form.Item>

        <Form.Item
          name="price"
          label="Valor pago (R$)"
          rules={[{ required: true, message: REQUIRED }]}
          tooltip="Valor total pago nesta recompra"
        >
          <Input
            prefix="R$"
            autoComplete="off"
            placeholder="0,00"
            onChange={({ target }) => handleChangePrice(target.value)}
          />
        </Form.Item>
      </div>
    </Form>
  )
}

export { RenewQuantityForm }
