import { Input, Form, InputNumber, Select, FormInstance, Divider, Tooltip, Tag, AutoComplete, Spin } from 'antd'
import { InfoCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { currencyMask } from '@/utils/currency-mask'
import { useEffect, useState, useRef, useCallback } from 'react'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { supabase } from '@/supabase/client'

type Props = {
  form: FormInstance
}

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const REQUIRED = 'Campo obrigatório!'

const capitalizeFirst = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

const UNIT_CONVERSIONS: Record<string, { base: string; factor: number }> = {
  KG: { base: 'g', factor: 1000 },
  G: { base: 'g', factor: 1 },
  L: { base: 'ml', factor: 1000 },
  ML: { base: 'ml', factor: 1 },
  M: { base: 'cm', factor: 100 },
  CM: { base: 'cm', factor: 1 },
  MM: { base: 'mm', factor: 1 },
  KM: { base: 'm', factor: 1000 },
  M2: { base: 'm²', factor: 1 },
  M3: { base: 'm³', factor: 1 },
  UN: { base: 'un', factor: 1 },
  W: { base: 'w', factor: 1 },
}

interface NcmSuggestion {
  code: string
  description: string
}

const NewItemForm = ({ form }: Props) => {
  const [costPerUnit, setCostPerUnit] = useState<string | null>(null)
  const [baseUnitLabel, setBaseUnitLabel] = useState<string>('un')
  const [ncmSuggestions, setNcmSuggestions] = useState<NcmSuggestion[]>([])
  const [ncmSearching, setNcmSearching] = useState(false)
  const [ncmOptions, setNcmOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [ncmFieldSearching, setNcmFieldSearching] = useState(false)
  const nameDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const ncmDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const searchNcmByName = useCallback(async (name: string) => {
    if (name.length < 2) { setNcmSuggestions([]); return }
    setNcmSearching(true)
    try {
      const { data, error } = await supabase.functions.invoke('lookup-ncm', {
        body: { search: name },
      })
      if (!error && data?.success && data.results) {
        setNcmSuggestions(data.results.slice(0, 8).map((r: any) => ({
          code: r.code,
          description: r.description,
        })))
      } else {
        setNcmSuggestions([])
      }
    } catch { setNcmSuggestions([]) }
    finally { setNcmSearching(false) }
  }, [])

  const handleNameChange = useCallback((value: string) => {
    form.setFieldsValue({ name: capitalizeFirst(value) })
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current)
    nameDebounceRef.current = setTimeout(() => searchNcmByName(value), 280)
  }, [form, searchNcmByName])

  const handleSelectNcm = useCallback((code: string) => {
    form.setFieldsValue({ ncm_code: code })
    setNcmSuggestions([])
  }, [form])

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
              <span style={{ fontSize: 13, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
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

  const handleChangePrice = (value: string) => {
    form.setFieldsValue({ price: currencyMask(value) })
    recalcCostPerUnit()
  }

  const recalcCostPerUnit = () => {
    const values = form.getFieldsValue()
    const priceStr = String(values.price || '0').replace(/\./g, '').replace(',', '.')
    const unitPrice = parseFloat(priceStr)
    const qty = parseFloat(values.quantity)
    const measureQty = parseFloat(values.measure_quantity) || 1
    const unit = values.unitType || 'UN'

    const conv = UNIT_CONVERSIONS[unit] || { base: 'un', factor: 1 }
    setBaseUnitLabel(conv.base)

    if (unitPrice > 0 && qty > 0) {
      const totalValue = unitPrice * qty * measureQty
      setCostPerUnit(`R$ ${getMonetaryValue(totalValue)}`)
    } else {
      setCostPerUnit(null)
    }
  }

  useEffect(() => {
    recalcCostPerUnit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Form layout="vertical" form={form}>
      <Form.Item name="id" hidden><Input /></Form.Item>

      <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>
        Identificação
      </Divider>

      <Form.Item
        name="name"
        label="Nome do item / insumo"
        rules={[{ required: true, message: REQUIRED }]}
      >
        <Input
          placeholder="Ex: Farinha de trigo, Açúcar, Parafuso M6..."
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </Form.Item>

      {(ncmSearching || ncmSuggestions.length > 0) && (
        <div style={{
          marginTop: -12, marginBottom: 12, padding: '8px 12px',
          background: '#0a1628', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <SearchOutlined style={{ fontSize: 10 }} />
            Sugestões de NCM para o nome digitado:
          </div>
          {ncmSearching ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ncmSuggestions.map((s) => (
                <div
                  key={s.code}
                  onClick={() => handleSelectNcm(s.code)}
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
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

      <Form.Item
        name="item_type"
        label={
          <span>
            Tipo do item&nbsp;
            <Tooltip title="Insumos para beneficiamento: materiais utilizados na produção. Revenda: produto acabado comprado para revender.">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </span>
        }
        rules={[{ required: true, message: REQUIRED }]}
        initialValue="INSUMO"
      >
        <Select>
          <Select.Option value="INSUMO">🧪 Insumos para beneficiamento</Select.Option>
          <Select.Option value="REVENDA">📦 Mercadoria para revenda</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item
        name="ncm_code"
        label={
          <span>
            NCM&nbsp;
            <Tooltip title="Nomenclatura Comum do Mercosul — digite o código ou pesquise por nome do produto">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </span>
        }
      >
        <AutoComplete
          options={ncmOptions}
          onSearch={handleNcmSearch}
          onSelect={(value: string) => form.setFieldsValue({ ncm_code: value })}
          placeholder="Digite o NCM ou pesquise (ex: farinha, 1901...)"
          notFoundContent={ncmFieldSearching ? <Spin size="small" /> : null}
          allowClear
        />
      </Form.Item>

      <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>
        Dados da Compra
      </Divider>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'end' }}>
        <Form.Item
          name="unitType"
          label="Unidade de medida"
          rules={[{ required: true, message: REQUIRED }]}
          initialValue="UN"
          style={{ marginBottom: 24 }}
        >
          <Select onChange={() => setTimeout(recalcCostPerUnit, 50)}>
            <Select.Option value="G">Gramas (g)</Select.Option>
            <Select.Option value="KG">Quilos (kg)</Select.Option>
            <Select.Option value="ML">Mililitros (ml)</Select.Option>
            <Select.Option value="L">Litros (l)</Select.Option>
            <Select.Option value="MM">Milímetros (mm)</Select.Option>
            <Select.Option value="CM">Centímetros (cm)</Select.Option>
            <Select.Option value="M">Metros (m)</Select.Option>
            <Select.Option value="M2">Área (m²)</Select.Option>
            <Select.Option value="M3">Volume (m³)</Select.Option>
            <Select.Option value="UN">Unidade (un)</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="measure_quantity"
          label={
            <span>
              QTD. Medida&nbsp;
              <Tooltip title="Volume ou medida de cada unidade comprada (ex: 900 para uma garrafa de 900ml). Usado para fracionar o custo na precificação.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
          initialValue={1}
          style={{ marginBottom: 24 }}
        >
          <InputNumber
            min={0.001}
            step="any"
            style={{ width: '100%' }}
            placeholder="Ex: 900"
            onChange={() => setTimeout(recalcCostPerUnit, 50)}
          />
        </Form.Item>

        <Form.Item
          name="price"
          label={
            <span>
              Valor unitário&nbsp;
              <Tooltip title="Valor unitário do item (por unidade de medida). O valor total será calculado automaticamente.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
          rules={[{ required: true, message: REQUIRED }]}
          style={{ marginBottom: 24 }}
        >
          <Input
            prefix="R$"
            autoComplete="off"
            placeholder="0,00"
            onChange={({ target }) => handleChangePrice(target.value)}
          />
        </Form.Item>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, alignItems: 'start' }}>
        <Form.Item
          name="quantity"
          label="QTD. Comprado"
          rules={[{ required: true, message: REQUIRED }]}
          tooltip="Quantidade total que você comprou (ex: 1 para 1kg, 500 para 500ml)"
          style={{ marginBottom: 24 }}
        >
          <Input
            type="number"
            min="0.001"
            step="any"
            placeholder="Ex: 1"
            onChange={() => setTimeout(recalcCostPerUnit, 50)}
          />
        </Form.Item>

        <Form.Item
          name="min_limit"
          label="Estoque mínimo Alerta"
          initialValue={0}
          tooltip="Abaixo deste valor o item aparecerá em status Baixo/Crítico na aba Estoque."
          style={{ marginBottom: 24 }}
        >
          <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" />
        </Form.Item>
      </div>

      <div style={{
        background: 'rgba(34, 197, 94, 0.12)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 12,
        color: '#e2e8f0',
        marginBottom: 16,
      }}>
        <InfoCircleOutlined style={{ color: '#22C55E', marginRight: 6 }} />
        <strong>Valor total (auto calculado):</strong>{' '}
        {costPerUnit ? (
          <Tag color="green" style={{ fontSize: 13, fontWeight: 600 }}>
            {costPerUnit}
          </Tag>
        ) : (
          <span style={{ color: '#64748b' }}>Preencha valor unitário e quantidade para calcular</span>
        )}
        <br />
        <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'inline-block' }}>
          Ex: valor unitário R$&nbsp;5,00 × 10&nbsp;un = Valor total R$&nbsp;50,00.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        <Form.Item name="supplier_name" label="Fornecedor">
          <Input placeholder="Nome do fornecedor" onChange={(e) => form.setFieldsValue({ supplier_name: capitalizeFirst(e.target.value) })} />
        </Form.Item>

        <Form.Item
          name="supplier_state"
          label={
            <span>
              Estado do fornecedor&nbsp;
              <Tooltip title="Usado para calcular ICMS na entrada (crédito)">
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

      <Form.Item name="observation" label="Observação">
        <Input.TextArea rows={3} style={{ resize: 'none' }} placeholder="Informações adicionais..." />
      </Form.Item>
    </Form>
  )
}

export { NewItemForm }
