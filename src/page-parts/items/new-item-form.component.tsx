import { Input, Form, InputNumber, Select, FormInstance, Divider, Tooltip, Tag, AutoComplete, Spin, Switch } from 'antd'
import { InfoCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { currencyMask } from '@/utils/currency-mask'
import { useEffect, useState, useRef, useCallback } from 'react'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'

type Props = {
  form: FormInstance
  taxableRegime?: string | null
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

const formatBRL3 = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

// Lucro Real — base PIS+COFINS não-cumulativo (1,65% + 7,6% = 9,25%)
const PIS_COFINS_BASE = 9.25

const NewItemForm = ({ form, taxableRegime }: Props) => {
  const isLucroReal = taxableRegime === 'LUCRO_REAL'
  const isLucroPresumido = taxableRegime === 'LUCRO_PRESUMIDO'
  const isSimplesHibrido = taxableRegime === 'SIMPLES_HIBRIDO'
  const isLucroRealOrLP = isLucroReal || isLucroPresumido || isSimplesHibrido
  const { currentUser } = useAuth()
  const isRevenda = currentUser?.calcType === 'RESALE'

  const [costPerUnit, setCostPerUnit] = useState<string | null>(null)
  const [baseUnitLabel, setBaseUnitLabel] = useState<string>('un')
  const [ncmSuggestions, setNcmSuggestions] = useState<NcmSuggestion[]>([])
  const [ncmSearching, setNcmSearching] = useState(false)
  const [ncmOptions, setNcmOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [ncmFieldSearching, setNcmFieldSearching] = useState(false)
  const [productTables, setProductTables] = useState<{ id: string; name: string }[]>([])
  const itemTypeWatch = Form.useWatch('item_type', form)
  const [netCostDisplay, setNetCostDisplay] = useState<string | null>(null)
  const [impostosRecuperaveisDisplay, setImpostosRecuperaveisDisplay] = useState<number>(0)
  // Lucro Real — quando o usuário edita PIS/COFINS manualmente, o auto-cálculo é suspenso
  const [pisCofinsManuallyEdited, setPisCofinsManuallyEdited] = useState(false)
  const nameDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const ncmDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Lê diretamente do form para evitar dependência de estado
  const icmsDeferidoEnabled = Form.useWatch('icms_deferido_enabled', form) ?? false
  const difalOrigemWatch = Form.useWatch('difal_origem_pct', form) ?? 0
  const difalDestinoWatch = Form.useWatch('difal_destino_pct', form) ?? 0
  const icmsStWatch = Form.useWatch('icms_st_value', form) ?? 0
  const ipiNrWatch = Form.useWatch('ipi_nr_value', form) ?? 0
  const priceWatch = Form.useWatch('price', form) ?? '0'

  const recalcNetCost = useCallback(() => {
    if (!isLucroRealOrLP) return
    const values = form.getFieldsValue()
    const isDeferidoEnabled = Boolean(values.icms_deferido_enabled)
    const priceStr = String(values.price || '0').replace(/\./g, '').replace(',', '.')
    const priceNum = parseFloat(priceStr) || 0
    const icms = Number(values.icms_rate) || 0
    const icmsDeferido = isDeferidoEnabled ? (Number(values.icms_deferido_rate) || 0) : 0

    // Impostos/ICMS recuperáveis: quando deferido ativo = ICMS% × (1 - deferido%); senão = ICMS%
    const impostosRec = isDeferidoEnabled ? icms * (1 - icmsDeferido / 100) : icms
    setImpostosRecuperaveisDisplay(parseFloat(impostosRec.toFixed(4)))

    // Lucro Real: campo único pis_cofins_rate. Padrão fixo 9,25% (1,65% + 7,6%) — editável.
    // Simples Híbrido: dois campos separados (pis_rate + cofins_rate).
    let pisCofinsTotal = 0
    if (isLucroReal) {
      if (!pisCofinsManuallyEdited) {
        form.setFieldsValue({ pis_cofins_rate: PIS_COFINS_BASE })
        pisCofinsTotal = PIS_COFINS_BASE
      } else {
        pisCofinsTotal = Number(values.pis_cofins_rate) || 0
      }
    } else if (isSimplesHibrido) {
      pisCofinsTotal = (Number(values.pis_rate) || 0) + (Number(values.cofins_rate) || 0)
    }

    if (priceNum > 0) {
      // Deduções para chegar no valor custo líquido
      // deducao1: usa ICMS recuperáveis (impostosRec) — considera toggle deferido quando ativo
      // deducao2: PIS+COFINS sobre (valor unitário − deducao1)
      const deducao1 = priceNum * impostosRec / 100
      const deducao2 = (priceNum - deducao1) * pisCofinsTotal / 100
      const valorLiquido = priceNum - deducao1 - deducao2

      setNetCostDisplay(getMonetaryValue(valorLiquido))
      form.setFieldsValue({ cost_net: valorLiquido })
    } else {
      setNetCostDisplay(null)
      form.setFieldsValue({ cost_net: 0 })
    }
  }, [form, isLucroReal, isLucroPresumido, isLucroRealOrLP, isSimplesHibrido, pisCofinsManuallyEdited])

  const fetchAndFillNcmRates = useCallback(async (code: string) => {
    // Lucro Real: PIS/COFINS é fixo em 9,25% (não usa NCM).
    // Apenas Simples Híbrido busca alíquotas no NCM.
    if (!code || !isSimplesHibrido) return
    const digits = code.replace(/\D/g, '')
    if (digits.length < 4) return
    const formatted = digits.length >= 8
      ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
      : digits.length >= 6
        ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}`
        : digits
    try {
      const { data: rows } = await supabase
        .from('ncm_codes')
        .select('pis_rate_nao_cumulativo, cofins_rate_nao_cumulativo')
        .in('code', [formatted, digits])
        .limit(1)
      const data = rows?.[0]
      if (data) {
        const toPercent = (v: any) => v != null ? parseFloat((Number(v) * 100).toFixed(2)) : 0
        form.setFieldsValue({
          pis_rate: toPercent(data.pis_rate_nao_cumulativo),
          cofins_rate: toPercent(data.cofins_rate_nao_cumulativo),
        })
        setTimeout(recalcNetCost, 50)
      }
    } catch { /* silent */ }
  }, [form, isSimplesHibrido, recalcNetCost])

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
    fetchAndFillNcmRates(code)
  }, [form, fetchAndFillNcmRates])

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

  const handleNcmFieldSelect = useCallback((value: string) => {
    form.setFieldsValue({ ncm_code: value })
    fetchAndFillNcmRates(value)
  }, [form, fetchAndFillNcmRates])

  const handleChangePrice = (value: string) => {
    form.setFieldsValue({ price: currencyMask(value) })
    recalcCostPerUnit()
    setTimeout(recalcNetCost, 50)
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

    if (unitPrice > 0 && measureQty > 0) {
      const costPerBase = unitPrice / measureQty
      setCostPerUnit(`R$ ${getMonetaryValue(costPerBase)}`)
    } else {
      setCostPerUnit(null)
    }
  }

  useEffect(() => {
    recalcCostPerUnit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const tenantId = currentUser?.tenant_id
      if (!tenantId) return
      const { data } = await supabase
        .from('commission_tables')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('type', 'PRODUCT')
        .order('name')
      if (!cancelled) setProductTables((data as any[]) || [])
    })()
    return () => { cancelled = true }
  }, [currentUser?.tenant_id])

  // Recalcula impostos recuperáveis e custo líquido na montagem do form
  // Necessário para edição de itens existentes (form já preenchido pelo componente pai)
  useEffect(() => {
    if (!isLucroRealOrLP) return
    // Lucro Real: se o item editado tem pis_cofins_rate ≠ 9,25% padrão,
    // o usuário editou manualmente — preservar e suspender auto-fill.
    if (isLucroReal) {
      const values = form.getFieldsValue()
      const saved = Number(values.pis_cofins_rate) || 0
      // tolerância 0,001% para arredondamentos
      if (saved > 0 && Math.abs(saved - PIS_COFINS_BASE) > 0.001) {
        setPisCofinsManuallyEdited(true)
      }
    }
    setTimeout(recalcNetCost, 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLucroRealOrLP])

  const handleDeferidoToggle = (checked: boolean) => {
    form.setFieldsValue({
      icms_deferido_enabled: checked,
      ...(checked ? {} : { icms_deferido_rate: undefined }),
    })
    setTimeout(recalcNetCost, 50)
  }

  // Campos reutilizados nos dois layouts
  const quantidadeField = (
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
  )

  const estoqueField = (
    <Form.Item
      name="min_limit"
      label="Estoque mínimo Alerta"
      initialValue={0}
      tooltip="Abaixo deste valor o item aparecerá em status Baixo/Crítico na aba Estoque."
      style={{ marginBottom: 24 }}
    >
      <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" />
    </Form.Item>
  )

  const priceForDifal = parseFloat(String(priceWatch || '0').replace(/\./g, '').replace(',', '.')) || 0
  const difalCalc = (() => {
    if (!difalOrigemWatch && !difalDestinoWatch) return 0
    const base = priceForDifal
    const icmsOrigem = base * ((difalOrigemWatch as number) / 100)
    const baseAposOrigem = base - icmsOrigem
    const destPct = (difalDestinoWatch as number) / 100
    if (destPct >= 1) return 0
    const grossed = baseAposOrigem / (1 - destPct)
    const impostoDestino = grossed * destPct
    return Math.max(0, impostoDestino - icmsOrigem)
  })()
  const totalNaoRec = ((icmsStWatch as number) || 0) + ((ipiNrWatch as number) || 0) + difalCalc
  const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <Form layout="vertical" form={form}>
      <Form.Item name="id" hidden><Input /></Form.Item>
      <Form.Item name="cost_net" hidden><InputNumber /></Form.Item>
      <Form.Item name="icms_deferido_enabled" hidden><Input /></Form.Item>
      <Form.Item name="pis_cofins_rate" hidden><InputNumber /></Form.Item>

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
        initialValue={isRevenda ? 'REVENDA' : 'INSUMO'}
      >
        <Select>
          {!isRevenda && <Select.Option value="INSUMO">🧪 Insumos para beneficiamento</Select.Option>}
          <Select.Option value="REVENDA">📦 Mercadoria para revenda</Select.Option>
        </Select>
      </Form.Item>

      {itemTypeWatch === 'REVENDA' && (
        <Form.Item
          name="product_table_id"
          label={
            <span>
              Escolher Tabela&nbsp;
              <Tooltip title="Item de revenda entrará nesta tabela de produto como 'aguardando precificação'. Ao precificar, os dados (NCM, descrição, custo) já virão preenchidos.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
        >
          <Select
            allowClear
            placeholder={productTables.length === 0 ? 'Nenhuma tabela de produto cadastrada' : 'Selecione a tabela de produto'}
            disabled={productTables.length === 0}
            options={productTables.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Form.Item>
      )}

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
          onSelect={handleNcmFieldSelect}
          placeholder="Digite o NCM ou pesquise (ex: farinha, 1901...)"
          notFoundContent={ncmFieldSearching ? <Spin size="small" /> : null}
          allowClear
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

      <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>
        Dados da Compra
      </Divider>

      {/* Linha 1: Unidade de medida | QTD. Medida | Valor unitário */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
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
              <Tooltip title="Valor unitário do item (por unidade de medida). O valor custo líquido será calculado automaticamente.">
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

      {/* Linha de impostos 1 (Lucro Real / Lucro Presumido): ICMS | ICMS Deferido | Impostos Recuperáveis */}
      {isLucroRealOrLP && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
            <Form.Item
              name="icms_rate"
              label={
                <span>
                  ICMS (%)&nbsp;
                  <Tooltip title="Alíquota ICMS de entrada. Preencha manualmente conforme a nota fiscal do fornecedor.">
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
              rules={[{ required: true, message: REQUIRED }]}
              initialValue={undefined}
              style={{ marginBottom: 24 }}
            >
              <InputNumber
                min={0}
                max={100}
                step={0.01}
                precision={2}
                style={{ width: '100%' }}
                placeholder="Ex: 17"
                suffix="%"
                formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                parser={(v) => Number((v || '0').replace(',', '.'))}
                onChange={() => setTimeout(recalcNetCost, 50)}
              />
            </Form.Item>

            <Form.Item
              label={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Switch
                    size="small"
                    checked={icmsDeferidoEnabled}
                    onChange={handleDeferidoToggle}
                  />
                  <span>ICMS Deferido (%)&nbsp;</span>
                  <Tooltip title="Ative para informar o percentual de diferimento do ICMS. Quando ativo, os impostos recuperáveis são recalculados automaticamente.">
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
              name="icms_deferido_rate"
              style={{ marginBottom: 24 }}
            >
              <InputNumber
                min={0}
                max={100}
                step={0.001}
                precision={3}
                style={{ width: '100%' }}
                placeholder="Ex: 29,411"
                suffix="%"
                disabled={!icmsDeferidoEnabled}
                formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                parser={(v) => Number((v || '0').replace(',', '.'))}
                onChange={() => setTimeout(recalcNetCost, 50)}
              />
            </Form.Item>

            <Form.Item
              label={
                <span>
                  {isLucroReal ? 'ICMS recuperáveis (%)' : isLucroPresumido ? 'ICMS recuperável (%)' : 'Impostos recuperáveis (%)'}&nbsp;
                  <Tooltip title={isLucroPresumido ? 'ICMS recuperável na entrada: quando Deferido ativo = ICMS% × (1 - Deferido%); caso contrário = ICMS%.' : 'Calculado automaticamente: quando ICMS Deferido ativo = ICMS% × (1 - Deferido%); caso contrário = ICMS%.'}>
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
              style={{ marginBottom: 24 }}
            >
              <InputNumber
                value={impostosRecuperaveisDisplay}
                min={0}
                max={100}
                precision={3}
                style={{ width: '100%' }}
                suffix="%"
                disabled
                formatter={(v) => v != null ? String(v).replace('.', ',') : '0'}
              />
            </Form.Item>
          </div>

          {/* Linha de impostos 2 (Lucro Real): PIS/COFINS unificado, padrão 9,25% (1,65% + 7,6%), editável */}
          {isLucroReal && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' }}>
              <Form.Item
                label={
                  <span>
                    PIS/COFINS (%)&nbsp;
                    <Tooltip title="Padrão: 9,25% (PIS 1,65% + COFINS 7,6%, regime não-cumulativo). Pode ser editado manualmente; após edição, o auto-preenchimento fica suspenso até você limpar o campo.">
                      <InfoCircleOutlined style={{ color: '#64748b' }} />
                    </Tooltip>
                  </span>
                }
                style={{ marginBottom: 24 }}
              >
                <InputNumber
                  value={Form.useWatch('pis_cofins_rate', form) ?? 0}
                  min={0}
                  max={100}
                  step={0.0001}
                  precision={4}
                  style={{ width: '100%' }}
                  placeholder="0,0000"
                  suffix="%"
                  formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                  parser={(v) => Number((v || '0').replace(',', '.'))}
                  onChange={(v) => {
                    const numeric = Number(v) || 0
                    if (numeric === 0) {
                      // valor zerado/limpo → reativa auto-cálculo
                      setPisCofinsManuallyEdited(false)
                    } else {
                      setPisCofinsManuallyEdited(true)
                    }
                    form.setFieldsValue({ pis_cofins_rate: numeric })
                    setTimeout(recalcNetCost, 50)
                  }}
                />
              </Form.Item>
            </div>
          )}

          {/* Linha de impostos 2 (Simples Híbrido): PIS | COFINS não-cumulativo (vindos do NCM) */}
          {isSimplesHibrido && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' }}>
              <Form.Item
                name="pis_rate"
                label={
                  <span>
                    PIS (%)&nbsp;
                    <Tooltip title="Alíquota PIS não-cumulativo. Preenchida automaticamente ao selecionar o NCM (1,65%), mas pode ser editada manualmente conforme a nota fiscal.">
                      <InfoCircleOutlined style={{ color: '#64748b' }} />
                    </Tooltip>
                  </span>
                }
                initialValue={0}
                style={{ marginBottom: 24 }}
              >
                <InputNumber
                  min={0}
                  max={100}
                  step={0.01}
                  precision={2}
                  style={{ width: '100%' }}
                  placeholder="0,00"
                  suffix="%"
                  formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                  parser={(v) => Number((v || '0').replace(',', '.'))}
                  onChange={() => setTimeout(recalcNetCost, 50)}
                />
              </Form.Item>

              <Form.Item
                name="cofins_rate"
                label={
                  <span>
                    COFINS (%)&nbsp;
                    <Tooltip title="Alíquota COFINS não-cumulativo. Preenchida automaticamente ao selecionar o NCM (7,6%), mas pode ser editada manualmente conforme a nota fiscal.">
                      <InfoCircleOutlined style={{ color: '#64748b' }} />
                    </Tooltip>
                  </span>
                }
                initialValue={0}
                style={{ marginBottom: 24 }}
              >
                <InputNumber
                  min={0}
                  max={100}
                  step={0.01}
                  precision={2}
                  style={{ width: '100%' }}
                  placeholder="0,00"
                  suffix="%"
                  formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                  parser={(v) => Number((v || '0').replace(',', '.'))}
                  onChange={() => setTimeout(recalcNetCost, 50)}
                />
              </Form.Item>
            </div>
          )}

          {/* Linha de impostos 3 (Lucro Real / Lucro Presumido): Valor custo líquido | QTD. Comprado | Estoque mínimo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
            <Form.Item
              label={
                <span>
                  Valor custo líquido&nbsp;
                  <Tooltip title={isLucroPresumido ? 'Calculado: Valor unit. − (Valor unit. × ICMS%).' : 'Calculado: Valor unit. − (Valor unit. × ICMS%) − ((Valor unit. − ICMS) × PIS+COFINS%).'}>
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
              style={{ marginBottom: 24 }}
            >
              <Input
                prefix="R$"
                value={netCostDisplay || ''}
                disabled
                placeholder="Preencha valor e impostos"
                style={{ background: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#22C55E', fontWeight: 600 }}
              />
            </Form.Item>

            {quantidadeField}
            {estoqueField}
          </div>
        </>
      )}

      {/* Linha QTD + Estoque para não-Lucro Real e não-Lucro Presumido */}
      {!isLucroRealOrLP && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
          {quantidadeField}
          {estoqueField}
        </div>
      )}

      {/* Observação */}
      {isLucroRealOrLP ? (() => {
        const vals = form.getFieldsValue()
        const priceStr = String(vals.price || '0').replace(/\./g, '').replace(',', '.')
        const priceNum = parseFloat(priceStr) || 0
        const costNet = Number(vals.cost_net) || 0
        const qty = Number(vals.quantity) || 0
        const totalNet = costNet * qty
        return (
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
            <strong>Valor Unitário cheio:&nbsp;</strong>
            <Tag color="blue" style={{ fontSize: 13, fontWeight: 600 }}>
              R$&nbsp;{priceNum > 0 ? getMonetaryValue(priceNum) : '—'}
            </Tag>
            <br />
            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'inline-block' }}>
              {costNet > 0 && qty > 0
                ? `Ex: valor custo líquido R$ ${formatBRL3(costNet)} × ${qty} un = Valor total R$ ${getMonetaryValue(totalNet)}`
                : 'Preencha o valor unitário e os impostos para calcular o custo líquido total.'
              }
            </span>
          </div>
        )
      })() : (
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
      )}

      {/* Impostos não recuperáveis */}
      <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 10 }}>
          Impostos não recuperáveis
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Form.Item name="icms_st_value" label="ICMS-ST (R$)" initialValue={0} style={{ marginBottom: 0 }}>
            <InputNumber
              min={0} step={0.01} precision={2} style={{ width: '100%' }}
              placeholder="0,00"
              formatter={(v: any) => { const n = Number(v ?? 0); return 'R$ ' + (isNaN(n) ? '0,00' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) }}
              parser={(v: any) => { const r = String(v || '0').replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim(); return isNaN(Number(r)) ? 0 : Number(r) }}
            />
          </Form.Item>
          <Form.Item name="ipi_nr_value" label="IPI (R$)" initialValue={0} style={{ marginBottom: 0 }}>
            <InputNumber
              min={0} step={0.01} precision={2} style={{ width: '100%' }}
              placeholder="0,00"
              formatter={(v: any) => { const n = Number(v ?? 0); return 'R$ ' + (isNaN(n) ? '0,00' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) }}
              parser={(v: any) => { const r = String(v || '0').replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim(); return isNaN(Number(r)) ? 0 : Number(r) }}
            />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginTop: 12, alignItems: 'end' }}>
          <Form.Item name="difal_origem_pct" label={<span>DIFAL — Alíq. origem (%)<Tooltip title="Alíquota de ICMS interestadual do estado de origem do fornecedor."><InfoCircleOutlined style={{ color: '#64748b', marginLeft: 4 }} /></Tooltip></span>} initialValue={0} style={{ marginBottom: 0 }}>
            <InputNumber
              min={0} max={100} step={0.01} precision={2} style={{ width: '100%' }}
              placeholder="0,00"
              formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
              parser={(v: any) => Number(String(v || '0').replace(',', '.'))}
            />
          </Form.Item>
          <Form.Item name="difal_destino_pct" label={<span>DIFAL — Alíq. destino (%)<Tooltip title="Alíquota de ICMS do estado de destino da venda."><InfoCircleOutlined style={{ color: '#64748b', marginLeft: 4 }} /></Tooltip></span>} initialValue={0} style={{ marginBottom: 0 }}>
            <InputNumber
              min={0} max={100} step={0.01} precision={2} style={{ width: '100%' }}
              placeholder="0,00"
              formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
              parser={(v: any) => Number(String(v || '0').replace(',', '.'))}
            />
          </Form.Item>
          <div style={{ paddingBottom: 1 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>DIFAL calculado</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: difalCalc > 0 ? '#fca5a5' : '#64748b' }}>{fmtBRL(difalCalc)}</div>
          </div>
        </div>
        {totalNaoRec > 0 && (
          <div style={{ borderTop: '1px solid rgba(239,68,68,0.2)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#94a3b8' }}>Total impostos não recuperáveis</span>
            <span style={{ fontWeight: 700, color: '#fca5a5' }}>{fmtBRL(totalNaoRec)}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <Form.Item name="supplier_name" label="Fornecedor">
          <Input placeholder="Nome do fornecedor" onChange={(e) => form.setFieldsValue({ supplier_name: capitalizeFirst(e.target.value) })} />
        </Form.Item>

        <Form.Item
          name="supplier_state"
          label={
            <span>
              Estado do fornecedor&nbsp;
              <Tooltip title={isLucroRealOrLP ? 'Usado para calcular ICMS na entrada (crédito) e o Valor Custo Líquido' : 'Usado para calcular ICMS na entrada (crédito)'}>
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
        >
          <Select
            placeholder="UF"
            showSearch
            allowClear
          >
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
