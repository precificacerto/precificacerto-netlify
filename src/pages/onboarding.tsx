import { useState, useCallback, useEffect } from 'react'
import { Button, Form, Input, Select, Steps, message, InputNumber, Radio, Spin, Tag, Checkbox, Alert } from 'antd'
import {
  BankOutlined,
  EnvironmentOutlined,
  CalculatorOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import Head from 'next/head'
import Image from 'next/image'
import { useAuth } from '@/hooks/use-auth.hook'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import { supabase } from '@/supabase/client'

function maskCnpjCpf(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function maskCep(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,3})$/, '$1-$2')
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

function maskCnae(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits
    .replace(/(\d{4})(\d)/, '$1-$2')
    .replace(/(-\d)(\d{2})$/, '$1/$2')
}

const SEGMENTS = [
  'Alimentação e Bebidas',
  'Beleza e Estética',
  'Comércio Varejista',
  'Comércio Atacadista',
  'Confecção e Moda',
  'Construção Civil',
  'Consultoria',
  'Educação',
  'Indústria',
  'Marcenaria e Móveis',
  'Metalurgia',
  'Saúde',
  'Serviços Gerais',
  'Tecnologia',
  'Outro',
]

const STATES = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
]

const TAX_REGIMES = [
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_PRESUMIDO_RET', label: 'Lucro Presumido RET' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
  { value: 'MEI', label: 'MEI' },
]

const CALC_TYPES = [
  { value: 'INDUSTRIALIZACAO', label: 'Industrialização', desc: 'Transformação de matérias-primas em produtos acabados (fábricas, panificadoras, marcenarias, etc.)' },
  { value: 'SERVICO', label: 'Prestação de Serviço', desc: 'Entrega de serviços ao cliente (consultoria, salões, oficinas, etc.)' },
  { value: 'REVENDA', label: 'Revenda', desc: 'Compra e revenda de produtos prontos (lojas, e-commerce, distribuidoras, etc.)' },
]

const PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
  { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'BOLETO', label: 'Boleto Bancário' },
  { value: 'TRANSFERENCIA', label: 'Transferência Bancária' },
]

const SIMPLES_ANEXOS = [
  { value: 'ANEXO_I', label: 'Anexo I - Comércio' },
  { value: 'ANEXO_II', label: 'Anexo II - Indústria' },
  { value: 'ANEXO_III', label: 'Anexo III - Serviços (instalação, reparos, etc.)' },
  { value: 'ANEXO_IV', label: 'Anexo IV - Serviços (limpeza, vigilância, etc.)' },
  { value: 'ANEXO_V', label: 'Anexo V - Serviços (engenharia, TI, etc.)' },
]

const ANEXO_I_PREFIXES = ['45', '46', '47']
const ANEXO_II_PREFIXES = [
  '10', '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33',
]
const ANEXO_IV_CNAES = [
  '8011', '8012', '8020', '8030',
  '8111', '8112', '8121', '8122', '8129', '8130',
]
const ANEXO_V_CNAES = [
  '6201', '6202', '6203', '6204', '6209',
  '6911', '6912', '6920',
  '7111', '7112', '7119', '7120',
  '7210', '7220',
  '7410', '7420',
  '7490',
  '8599',
  '8630', '8640', '8650', '8660',
  '9001', '9002', '9003',
]
const ANEXO_III_CNAES = [
  '3511', '3512', '3513', '3514', '3515', '3516', '3517', '3519', '3521', '3522', '3523',
  '3530', '3600', '3700', '3811', '3812', '3821', '3822', '3900',
  '4110', '4120', '4211', '4212', '4213', '4221', '4222', '4223', '4291', '4292', '4299',
  '4311', '4312', '4313', '4319', '4321', '4322', '4329', '4391', '4399',
  '4911', '4912', '4921', '4922', '4923', '4924', '4929', '4930',
  '5011', '5012', '5021', '5022', '5030', '5091', '5099',
  '5111', '5112', '5120', '5130', '5191', '5199',
  '5510', '5590', '5611', '5612', '5620',
  '5811', '5812', '5813', '5819', '5821', '5822', '5823', '5829',
  '6010', '6021', '6022', '6110', '6120', '6130', '6141', '6142', '6143', '6190',
  '6201', '6202', '6203', '6204', '6209',
  '6391', '6399',
  '7111', '7112', '7119', '7120',
  '7210', '7220',
  '8011', '8012', '8020', '8030',
  '8111', '8112', '8121', '8122', '8129', '8130',
]

function inferSimplesAnexo(rawCnaeCode: string): string | null {
  const digits = (rawCnaeCode || '').replace(/\D/g, '')
  if (digits.length < 4) return null
  const prefix2 = digits.substring(0, 2)
  const prefix4 = digits.substring(0, 4)

  // Anexo IV tem prioridade
  if (ANEXO_IV_CNAES.includes(prefix4)) return 'ANEXO_IV'

  // Anexo V tem prioridade sobre III para serviços intelectuais
  if (ANEXO_V_CNAES.includes(prefix4)) return 'ANEXO_V'

  // Anexo II — indústria
  if (ANEXO_II_PREFIXES.includes(prefix2)) return 'ANEXO_II'

  // Anexo I — comércio
  if (ANEXO_I_PREFIXES.includes(prefix2)) return 'ANEXO_I'

  // Anexo III — demais serviços
  if (ANEXO_III_CNAES.includes(prefix4)) return 'ANEXO_III'

  return null
}

function inferIcmsContribuinte(data: any, calcType?: string | null): boolean {
  // MEI nunca é contribuinte de ICMS
  if (data?.mei === true) return false

  // Serviço não paga ICMS (paga ISS)
  if (calcType === 'SERVICO') return false

  // Simples Nacional Comércio/Indústria → provável contribuinte
  if (data?.simples_optant && calcType !== 'SERVICO') return true

  // Lucro Presumido / Lucro Real → contribuinte por padrão
  if (!data?.mei && !data?.simples_optant) return true

  // Fallback conservador
  return false
}

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [showCustomSegment, setShowCustomSegment] = useState(false)
  const [companyForm] = Form.useForm()
  const [addressForm] = Form.useForm()
  const [taxForm] = Form.useForm()
  const [teamForm] = Form.useForm()
  const { currentUser, setCurrentUser, logout, refreshUser } = useAuth()
  const router = useRouter()
  const [messageApi, contextHolder] = message.useMessage()
  const [icmsAutoFilled, setIcmsAutoFilled] = useState(false)
  const [anexoAutoFilled, setAnexoAutoFilled] = useState(false)

  const taxRegime = Form.useWatch('tax_regime', taxForm)
  const calcType = Form.useWatch('calc_type', taxForm)
  const icmsContribuinte = Form.useWatch('icms_contribuinte', taxForm)
  const isSimples = taxRegime === 'SIMPLES_NACIONAL'
  const isRet = taxRegime === 'LUCRO_PRESUMIDO_RET'
  const isLucroReal = taxRegime === 'LUCRO_REAL'

  const isSuperAdmin =
    currentUser?.is_super_admin ||
    (currentUser?.role && String(currentUser.role).toLowerCase() === 'super_admin')
  useEffect(() => {
    if (isSuperAdmin) {
      router.replace(ROUTES.SUPER_ADMIN_PANEL)
    }
  }, [isSuperAdmin, router])

  if (isSuperAdmin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0a1628' }}>
        <Spin size="large" />
      </div>
    )
  }

  const steps = [
    { title: 'Empresa', icon: <BankOutlined /> },
    { title: 'Endereço', icon: <EnvironmentOutlined /> },
    { title: 'Tributação', icon: <CalculatorOutlined /> },
    { title: 'Equipe', icon: <TeamOutlined /> },
  ]

  const forms = [companyForm, addressForm, taxForm, teamForm]

  async function handleNext() {
    try {
      await forms[currentStep].validateFields()
      setCurrentStep(currentStep + 1)
    } catch {
      /* validation errors shown by antd */
    }
  }

  function handlePrev() {
    setCurrentStep(currentStep - 1)
  }

  const fetchCnpjData = useCallback(async (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 14) return

    setCnpjLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        messageApi.warning('Faça login para consultar o CNPJ automaticamente.')
        setCnpjLoading(false)
        return
      }

      const { data, error } = await supabase.functions.invoke('lookup-cnpj', {
        body: { cnpj: digits, tenant_id: currentUser?.tenant_id ?? undefined },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (error || !data?.success) {
        messageApi.warning(data?.error || 'Nao foi possivel consultar o CNPJ automaticamente')
        return
      }

      const d = data.data
      companyForm.setFieldsValue({
        name: d.company_name,
      })

      addressForm.setFieldsValue({
        street: d.address.street,
        number: d.address.number,
        complement: d.address.complement,
        neighborhood: d.address.district,
        city: d.address.city,
        state_code: d.address.state,
        cep: maskCep(d.address.zip),
      })

      const taxUpdate: Record<string, any> = {}
      if (d.cnae_code) taxUpdate.cnae_code = maskCnae(d.cnae_code)
      if (d.inferred_tax_regime) taxUpdate.tax_regime = d.inferred_tax_regime
      if (Object.keys(taxUpdate).length > 0) taxForm.setFieldsValue(taxUpdate)

      const regimeParaInferencia = d.inferred_tax_regime || taxRegime
      if (d.cnae_code && regimeParaInferencia === 'SIMPLES_NACIONAL') {
        const inferredAnexo = inferSimplesAnexo(d.cnae_code)
        if (inferredAnexo) {
          setTimeout(() => {
            taxForm.setFieldsValue({ simples_anexo: inferredAnexo })
            setAnexoAutoFilled(true)
          }, 100)
        }
      }

      const inferredIcms = inferIcmsContribuinte(d, calcType)
      taxForm.setFieldsValue({ icms_contribuinte: inferredIcms })
      setIcmsAutoFilled(true)

      messageApi.success('Dados do CNPJ preenchidos automaticamente!')
    } catch {
      messageApi.warning('Servico de consulta CNPJ indisponivel')
    } finally {
      setCnpjLoading(false)
    }
  }, [companyForm, addressForm, taxForm, messageApi, currentUser?.tenant_id])

  const handleCnpjCpfChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCnpjCpf(e.target.value)
    companyForm.setFieldValue('cnpj_cpf', masked)
  }, [companyForm])

  const handleCepChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCep(e.target.value)
    addressForm.setFieldValue('cep', masked)
  }, [addressForm])

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskPhone(e.target.value)
    companyForm.setFieldValue('phone', masked)
  }, [companyForm])

  const handleCnaeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCnae(e.target.value)
    taxForm.setFieldValue('cnae_code', masked)
  }, [taxForm])

  async function fetchCep(cep: string) {
    const cleanCep = cep.replace(/\D/g, '')
    if (cleanCep.length !== 8) return

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        addressForm.setFieldsValue({
          street: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state_code: data.uf,
        })
      }
    } catch { /* silent */ }
  }

  function handleSegmentChange(value: string) {
    if (value === 'Outro') {
      setShowCustomSegment(true)
      companyForm.setFieldValue('segment', '')
    } else {
      setShowCustomSegment(false)
    }
  }

  async function handleFinish() {
    try {
      await teamForm.validateFields()
    } catch {
      return
    }

    setLoading(true)
    try {
      const company = { ...companyForm.getFieldsValue(), ...addressForm.getFieldsValue() }
      const tax = taxForm.getFieldsValue()
      const team = teamForm.getFieldsValue()

      const revenueValue = Number(tax.revenue_value) || 0
      const revenueType = tax.revenue_input_type || 'TOTAL_12M'
      // Total do período: 12 meses; média mensal = simples_revenue_12m / 12
      const simplesRevenue12m = revenueType === 'AVERAGE_MONTHLY' ? revenueValue * 12 : revenueValue

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company,
          settings: {
            tax_regime: tax.tax_regime,
            calc_type: tax.calc_type,
            simples_anexo: tax.simples_anexo,
            simples_revenue_12m: simplesRevenue12m,
            ret_rate: tax.tax_regime === 'LUCRO_PRESUMIDO_RET'
              ? (Number(tax.ret_rate) || 4) / 100
              : null,
            cnae_code: (tax.cnae_code || '').replace(/\D/g, ''),
            icms_contribuinte: tax.icms_contribuinte ?? false,
            ibs_reference_pct: tax.tax_regime === 'LUCRO_REAL' ? (tax.ibs_reference_pct ?? null) : null,
            cbs_reference_pct: tax.tax_regime === 'LUCRO_REAL' ? (tax.cbs_reference_pct ?? null) : null,
            inscricao_estadual: tax.inscricao_estadual || null,
            ie_state_code: tax.ie_state_code || null,
            sales_scope: tax.sales_scope || 'INTRAESTADUAL',
            buyer_type: tax.buyer_type || 'CONSUMIDOR_FINAL',
            workload_unit: 'HOURS',
            monthly_workload: team.productive_monthly_workload,
            num_productive_employees: team.num_productive_employees,
            num_commercial_employees: 0,
            num_administrative_employees: team.num_administrative_employees,
            administrative_monthly_workload: team.administrative_monthly_workload,
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao salvar')
      }

      const profile = await refreshUser()

      messageApi.success('Dados salvos com sucesso!')

      const target = getDefaultRouteForUser(profile ?? null)
      setTimeout(() => router.push(target), 800)
    } catch (error: any) {
      messageApi.error(error.message || 'Erro ao salvar dados. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Configuração Inicial | Precifica Certo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      {contextHolder}
      <div style={{
        minHeight: '100vh',
        background: '#0a1628',
        padding: '24px 16px',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
            <Button
              type="text"
              onClick={() => logout()}
              style={{ position: 'absolute', top: 0, right: 0, color: '#94a3b8', fontSize: 13 }}
              size="small"
            >
              Sair
            </Button>
            <Image src="/logo-dark.svg" alt="Precifica Certo" width={160} height={100} priority />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: '16px 0 4px' }}>
              Configure sua empresa
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8' }}>
              Preencha as informações abaixo para começar a usar a plataforma
            </p>
          </div>

          {/* Steps */}
          <Steps
            current={currentStep}
            items={steps}
            style={{ marginBottom: 32 }}
            size="small"
          />

          {/* Card */}
          <div style={{
            background: '#111c2e',
            borderRadius: 16,
            padding: '32px 28px',
            boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            minHeight: 400,
          }}>
            {/* Step 1: Dados da Empresa */}
            <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                Dados da Empresa
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
                Informações básicas da sua empresa
              </p>
              <Form form={companyForm} layout="vertical">
                <Form.Item
                  name="name"
                  label="Nome da Empresa"
                  rules={[{ required: true, message: 'Informe o nome da empresa' }]}
                >
                  <Input placeholder="Ex: Padaria São José" />
                </Form.Item>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item
                    name="cnpj_cpf"
                    label="CNPJ / CPF"
                    rules={[
                      { required: true, message: 'Informe o CNPJ ou CPF' },
                      {
                        validator: (_, value) => {
                          const digits = (value || '').replace(/\D/g, '')
                          if (digits.length === 11 || digits.length === 14) return Promise.resolve()
                          return Promise.reject('CNPJ deve ter 14 dígitos ou CPF 11 dígitos')
                        },
                      },
                    ]}
                    extra={cnpjLoading ? <Spin size="small" /> : null}
                  >
                    <Input
                      placeholder="00.000.000/0000-00"
                      onChange={handleCnpjCpfChange}
                      onBlur={(e) => fetchCnpjData(e.target.value)}
                      maxLength={18}
                      suffix={cnpjLoading ? <Spin size="small" /> : <SearchOutlined style={{ color: '#98A2B3' }} />}
                    />
                  </Form.Item>

                  <div>
                    <Form.Item
                      name="segment"
                      label="Segmento"
                      rules={[{ required: true, message: 'Informe o segmento' }]}
                      style={{ display: showCustomSegment ? 'none' : 'block' }}
                    >
                      <Select placeholder="Selecione" onChange={handleSegmentChange}>
                        {SEGMENTS.map(s => (
                          <Select.Option key={s} value={s}>{s}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    {showCustomSegment && (
                      <>
                        <Form.Item
                          name="segment"
                          label="Segmento"
                          rules={[{ required: true, message: 'Digite o segmento' }]}
                        >
                          <Input placeholder="Digite o segmento da sua empresa" />
                        </Form.Item>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setShowCustomSegment(false)
                            companyForm.setFieldValue('segment', undefined)
                          }}
                          style={{ padding: 0, marginTop: -16, fontSize: 12 }}
                        >
                          Voltar para a lista
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item name="email" label="Email da Empresa">
                    <Input placeholder="contato@empresa.com" />
                  </Form.Item>

                  <Form.Item name="phone" label="Telefone">
                    <Input
                      placeholder="(00) 00000-0000"
                      onChange={handlePhoneChange}
                      maxLength={15}
                    />
                  </Form.Item>
                </div>
              </Form>
            </div>

            {/* Step 2: Endereço */}
            <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                Endereço
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
                Localização da empresa — importante para cálculos de impostos regionais
              </p>
              <Form form={addressForm} layout="vertical">
                <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 120px', gap: 16 }}>
                  <Form.Item
                    name="cep"
                    label="CEP"
                    rules={[
                      { required: true, message: 'Informe o CEP' },
                      {
                        validator: (_, value) => {
                          const digits = (value || '').replace(/\D/g, '')
                          if (digits.length === 8) return Promise.resolve()
                          return Promise.reject('CEP deve ter 8 dígitos')
                        },
                      },
                    ]}
                  >
                    <Input
                      placeholder="00.000-000"
                      onChange={handleCepChange}
                      onBlur={(e) => fetchCep(e.target.value)}
                      maxLength={10}
                    />
                  </Form.Item>

                  <Form.Item
                    name="city"
                    label="Cidade"
                    rules={[{ required: true, message: 'Informe a cidade' }]}
                  >
                    <Input placeholder="Sua cidade" />
                  </Form.Item>

                  <Form.Item
                    name="state_code"
                    label="Estado"
                    rules={[{ required: true, message: 'Selecione' }]}
                  >
                    <Select placeholder="UF" showSearch optionFilterProp="children">
                      {STATES.map(s => (
                        <Select.Option key={s.code} value={s.code}>{s.code} - {s.name}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </div>

                <Form.Item name="street" label="Rua">
                  <Input placeholder="Rua / Avenida" />
                </Form.Item>

                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 16 }}>
                  <Form.Item name="number" label="Número">
                    <Input placeholder="Nº" />
                  </Form.Item>
                  <Form.Item name="complement" label="Complemento">
                    <Input placeholder="Sala, Bloco, etc." />
                  </Form.Item>
                  <Form.Item name="neighborhood" label="Bairro">
                    <Input placeholder="Bairro" />
                  </Form.Item>
                </div>
              </Form>
            </div>

            {/* Step 3: Regime Tributário */}
            <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                Tributação e Tipo de Negócio
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
                Essas informações são essenciais para calcular impostos e precificar corretamente
              </p>
              <Form form={taxForm} layout="vertical" initialValues={{ icms_contribuinte: false, sales_scope: 'INTRAESTADUAL' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item
                    name="tax_regime"
                    label="Regime Tributário"
                    rules={[{ required: true, message: 'Selecione o regime' }]}
                  >
                    <Select placeholder="Selecione">
                      {TAX_REGIMES.map(r => (
                        <Select.Option key={r.value} value={r.value}>{r.label}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="cnae_code"
                    label="CNAE Principal"
                    rules={[{ required: true, message: 'Informe o CNAE' }]}
                    tooltip="Código Nacional de Atividades Econômicas - encontre no seu cartão CNPJ"
                  >
                    <Input
                      placeholder="0000-0/00"
                      onChange={handleCnaeChange}
                      maxLength={9}
                    />
                  </Form.Item>
                </div>

                {isSimples && (
                  <Form.Item
                    name="simples_anexo"
                    label="Anexo do Simples Nacional"
                    rules={[{ required: isSimples, message: 'Selecione o anexo' }]}
                  >
                    <>
                      <Select
                        placeholder="Selecione o anexo"
                        onChange={() => {
                          if (anexoAutoFilled) setAnexoAutoFilled(false)
                        }}
                      >
                        {SIMPLES_ANEXOS.map(a => (
                          <Select.Option key={a.value} value={a.value}>{a.label}</Select.Option>
                        ))}
                      </Select>
                      {anexoAutoFilled && (
                        <div style={{ marginTop: 8 }}>
                          <Tag color="blue">
                            Inferido pelo CNAE — confirme com seu contador.
                          </Tag>
                        </div>
                      )}
                    </>
                  </Form.Item>
                )}

                {isRet && (
                  <Form.Item
                    name="ret_rate"
                    label="Alíquota RET (%)"
                    initialValue={4}
                    tooltip="Alíquota única que engloba IRPJ, CSLL, PIS e COFINS. Padrão 4% para construção civil e incorporação imobiliária. Confirme com seu contador."
                  >
                    <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} formatter={(v) => v != null ? String(v).replace('.', ',') : ''} parser={(v) => Number((v || '0').replace(',', '.'))} addonAfter="%" />
                  </Form.Item>
                )}

                {/* Panorama de Referência — Prévia de Receita (estimativa inicial, NÃO alimenta fluxo de caixa) */}
                <div style={{
                  background: 'rgba(59, 130, 246, 0.06)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 12,
                  padding: '20px',
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <DollarOutlined style={{ fontSize: 18, color: '#3B82F6' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                      Panorama de Referência — Prévia de Receita
                    </span>
                  </div>
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    style={{
                      marginBottom: 16,
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.15)',
                      borderRadius: 8,
                    }}
                    message={
                      <span style={{ color: '#93C5FD', fontSize: 13 }}>
                        Estes valores são uma <strong>estimativa inicial</strong> usada apenas para calcular tributação e precificação.
                        Eles <strong>não alimentam o fluxo de caixa</strong> — o caixa só registra movimentações reais.
                      </span>
                    }
                  />

                  <Form.Item
                    name="revenue_input_type"
                    label="Como deseja informar o faturamento?"
                    initialValue="TOTAL_12M"
                    rules={[{ required: true }]}
                    tooltip="Necessário para tributação, precificação e recálculo de despesas. Se a empresa é nova e não tem 12 meses, use a opção de faturamento médio por mês."
                  >
                    <Radio.Group>
                      <Radio value="TOTAL_12M" style={{ display: 'block', marginBottom: 6 }}>
                        Faturamento <strong>total dos últimos 12 meses</strong>
                      </Radio>
                      <Radio value="AVERAGE_MONTHLY" style={{ display: 'block' }}>
                        Faturamento <strong>médio por mês</strong> (empresa nova ou sem 12 meses de histórico)
                      </Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, curr) => prev.revenue_input_type !== curr.revenue_input_type}
                  >
                    {({ getFieldValue }) => {
                      const type = getFieldValue('revenue_input_type')
                      const isTotal12m = type !== 'AVERAGE_MONTHLY'
                      return (
                        <Form.Item
                          name="revenue_value"
                          label={isTotal12m ? 'Faturamento total dos últimos 12 meses (R$)' : 'Faturamento médio por mês (R$)'}
                          rules={[{ required: true, message: isTotal12m ? 'Informe o faturamento dos últimos 12 meses' : 'Informe o faturamento médio por mês' }, { type: 'number', min: 0, message: 'Deve ser maior ou igual a zero' }]}
                          tooltip={isTotal12m
                            ? 'Valor total faturado nos últimos 12 meses. Usado para tributação e para o recálculo de despesas na precificação.'
                            : 'Estimativa de quanto a empresa fatura em um mês. O sistema usará esse valor × 12 como base para tributação e precificação até você ter histórico no fluxo de caixa.'}
                        >
                          <InputNumber
                            style={{ width: '100%' }}
                            placeholder={isTotal12m ? 'Ex: 500.000' : 'Ex: 41.666'}
                            min={0}
                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                            parser={v => Number(String(v).replace(/\./g, '')) ?? 0}
                          />
                        </Form.Item>
                      )
                    }}
                  </Form.Item>

                  <Form.Item
                    name="estimated_payment_methods"
                    label="Principais formas de recebimento"
                    tooltip="Selecione as formas de pagamento mais comuns dos seus clientes. Isso nos ajuda a sugerir configurações iniciais."
                    style={{ marginBottom: 0 }}
                  >
                    <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {PAYMENT_METHODS.map(pm => (
                        <Checkbox key={pm.value} value={pm.value} style={{ marginInlineStart: 0 }}>
                          {pm.label}
                        </Checkbox>
                      ))}
                    </Checkbox.Group>
                  </Form.Item>
                </div>

                <Form.Item
                  name="calc_type"
                  label="Tipo de Negócio"
                  rules={[{ required: true, message: 'Selecione o tipo' }]}
                >
                  <Select placeholder="Como sua empresa opera?">
                    {CALC_TYPES.map(c => (
                      <Select.Option key={c.value} value={c.value}>{c.label}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                {calcType && (
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    fontSize: 13,
                    color: '#e2e8f0',
                    marginTop: -8,
                    marginBottom: 16,
                  }}>
                    <CheckCircleOutlined style={{ color: '#22C55E', marginRight: 8 }} />
                    {CALC_TYPES.find(c => c.value === calcType)?.desc}
                  </div>
                )}

                {/* Abrangência de vendas */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '20px',
                  marginBottom: 20,
                  marginTop: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <EnvironmentOutlined style={{ fontSize: 18, color: '#22C55E' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                      Abrangência de Vendas
                    </span>
                  </div>
                  <Form.Item
                    name="sales_scope"
                    label="Onde você vende seus produtos/serviços?"
                    rules={[{ required: true, message: 'Selecione a abrangência' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Radio.Group>
                      <Radio value="INTRAESTADUAL" style={{ display: 'block', marginBottom: 8 }}>
                        <span style={{ fontWeight: 500 }}>Dentro do estado</span>
                        <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginLeft: 24 }}>
                          Vendo apenas para clientes no meu estado
                        </span>
                      </Radio>
                      <Radio value="INTERESTADUAL" style={{ display: 'block', marginBottom: 8 }}>
                        <span style={{ fontWeight: 500 }}>Interestadual</span>
                        <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginLeft: 24 }}>
                          Vendo para clientes em outros estados
                        </span>
                      </Radio>
                      <Radio value="AMBOS" style={{ display: 'block' }}>
                        <span style={{ fontWeight: 500 }}>Ambos</span>
                        <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginLeft: 24 }}>
                          Vendo tanto dentro quanto fora do meu estado
                        </span>
                      </Radio>
                    </Radio.Group>
                  </Form.Item>
                </div>

                {/* Natureza da Venda */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '20px',
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <TeamOutlined style={{ fontSize: 18, color: '#22C55E' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                      Natureza da Venda
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
                    Isso define como o ICMS e o DIFAL são calculados nas suas vendas
                  </p>
                  <Form.Item
                    name="buyer_type"
                    label="Para quem você vende principalmente?"
                    rules={[{ required: true, message: 'Selecione o tipo de comprador' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Radio.Group>
                      <Radio value="CONSUMIDOR_FINAL" style={{ display: 'block', marginBottom: 10 }}>
                        <span style={{ fontWeight: 500 }}>Consumidor Final</span>
                        <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginLeft: 24 }}>
                          Pessoa física ou empresa que não revende o produto (ICMS integral, DIFAL aplicável)
                        </span>
                      </Radio>
                      <Radio value="EMPRESA_CONTRIBUINTE" style={{ display: 'block', marginBottom: 10 }}>
                        <span style={{ fontWeight: 500 }}>Empresas Contribuintes</span>
                        <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginLeft: 24 }}>
                          Empresas que revendem ou usam na produção — podem aproveitar crédito de ICMS
                        </span>
                      </Radio>
                      <Radio value="AMBOS" style={{ display: 'block' }}>
                        <span style={{ fontWeight: 500 }}>Ambos</span>
                        <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginLeft: 24 }}>
                          Vendo tanto para consumidores finais quanto para empresas
                        </span>
                      </Radio>
                    </Radio.Group>
                  </Form.Item>
                </div>

                {/* ICMS */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '20px',
                  marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <SafetyCertificateOutlined style={{ fontSize: 18, color: '#22C55E' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                      ICMS
                    </span>
                  </div>

                  <Form.Item
                    name="icms_contribuinte"
                    label="Sua empresa é contribuinte de ICMS?"
                    style={{ marginBottom: icmsContribuinte ? 16 : 0 }}
                  >
                    <>
                      <Radio.Group
                        onChange={() => {
                          if (icmsAutoFilled) setIcmsAutoFilled(false)
                        }}
                      >
                        <Radio value={true}>Sim</Radio>
                        <Radio value={false}>Não</Radio>
                      </Radio.Group>
                      {icmsAutoFilled && (
                        <div style={{ marginTop: 8 }}>
                          <Tag color="blue">
                            Preenchido automaticamente com base no CNPJ — confirme.
                          </Tag>
                        </div>
                      )}
                    </>
                  </Form.Item>

                  {icmsContribuinte && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      padding: '16px',
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 16 }}>
                        <Form.Item
                          name="inscricao_estadual"
                          label="Inscrição Estadual (IE)"
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="Ex: 123.456.789.012" />
                        </Form.Item>

                        <Form.Item
                          name="ie_state_code"
                          label="Estado da IE"
                          style={{ marginBottom: 0 }}
                        >
                          <Select placeholder="UF" showSearch optionFilterProp="children">
                            {STATES.map(s => (
                              <Select.Option key={s.code} value={s.code}>{s.code}</Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                      </div>
                    </div>
                  )}
                </div>
                {/* IVA DUAL — apenas Lucro Real */}
                {isLucroReal && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 12,
                    padding: '20px',
                    marginTop: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <CalculatorOutlined style={{ fontSize: 18, color: '#22C55E' }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
                        Alíquotas de Referência — IBS e CBS
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
                      Informe as alíquotas-base do IVA DUAL. Elas serão usadas como referência para calcular as alíquotas efetivas
                      de IBS e CBS nos produtos e serviços, com base no fator de redução cadastrado em cada item.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <Form.Item
                        name="ibs_reference_pct"
                        label="IBS — Imposto sobre Bens e Serviços (%)"
                        tooltip="Alíquota-base de referência para o IBS. Exemplo: 17,00%"
                      >
                        <InputNumber
                          min={0} max={100} step={0.01} style={{ width: '100%' }}
                          addonAfter="%"
                          formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                          parser={(v) => Number((v || '0').replace(',', '.'))}
                        />
                      </Form.Item>
                      <Form.Item
                        name="cbs_reference_pct"
                        label="CBS — Contribuição sobre Bens e Serviços (%)"
                        tooltip="Alíquota-base de referência para o CBS. Exemplo: 9,50%"
                      >
                        <InputNumber
                          min={0} max={100} step={0.01} style={{ width: '100%' }}
                          addonAfter="%"
                          formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                          parser={(v) => Number((v || '0').replace(',', '.'))}
                        />
                      </Form.Item>
                    </div>
                  </div>
                )}
              </Form>
            </div>

            {/* Step 4: Equipe */}
            <div style={{ display: currentStep === 3 ? 'block' : 'none' }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                Equipe e Produção
              </h2>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
                Essas informações ajudam a calcular o custo da mão de obra no preço dos seus produtos
              </p>

              <Form form={teamForm} layout="vertical" initialValues={{
                num_productive_employees: 1,
                productive_monthly_workload: 176,
                num_administrative_employees: 0,
                administrative_monthly_workload: 176,
              }}>
                {/* Card Equipe Produtiva */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '24px',
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <TeamOutlined style={{ fontSize: 20, color: '#22C55E' }} />
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                      Equipe Produtiva
                    </h3>
                  </div>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                    Funcionários que atuam diretamente na produção, fabricação ou prestação de serviço
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item
                      name="num_productive_employees"
                      label="Quantidade de pessoas"
                      rules={[{ required: true, message: 'Informe a quantidade' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        placeholder="Ex: 5"
                        addonAfter="pessoas"
                      />
                    </Form.Item>
                    <Form.Item
                      name="productive_monthly_workload"
                      label="Carga horária por pessoa"
                      rules={[{ required: true, message: 'Informe as horas mensais' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1}
                        placeholder="Ex: 176"
                        addonAfter="h/mês"
                      />
                    </Form.Item>
                  </div>
                  <p style={{ fontSize: 12, color: '#98A2B3', marginTop: 8, marginBottom: 0 }}>
                    Referência: 8h/dia × 22 dias úteis = 176h/mês
                  </p>
                </div>

                {/* Card Equipe Administrativa */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '24px',
                  marginBottom: 20,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <TeamOutlined style={{ fontSize: 20, color: '#F79009' }} />
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                      Equipe Administrativa
                    </h3>
                  </div>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                    Funcionários de apoio: financeiro, RH, recepção, gestão, etc.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item
                      name="num_administrative_employees"
                      label="Quantidade de pessoas"
                      rules={[{ required: true, message: 'Informe a quantidade' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        placeholder="Ex: 2"
                        addonAfter="pessoas"
                      />
                    </Form.Item>
                    <Form.Item
                      name="administrative_monthly_workload"
                      label="Carga horária por pessoa"
                      rules={[{ required: true, message: 'Informe as horas mensais' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1}
                        placeholder="Ex: 176"
                        addonAfter="h/mês"
                      />
                    </Form.Item>
                  </div>
                  <p style={{ fontSize: 12, color: '#98A2B3', marginTop: 8, marginBottom: 0 }}>
                    Referência: 8h/dia × 22 dias úteis = 176h/mês
                  </p>
                </div>
              </Form>
            </div>

            {/* Navigation */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 32,
              paddingTop: 24,

              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}>
              <Button
                onClick={handlePrev}
                disabled={currentStep === 0}
                style={{ visibility: currentStep === 0 ? 'hidden' : 'visible' }}
              >

                Voltar

              </Button>

              {currentStep < steps.length - 1 ? (
                <Button type="primary" onClick={handleNext} size="large">
                  Próximo
                </Button>

              ) : (
                <Button
                  type="primary"
                  onClick={handleFinish}
                  loading={loading}
                  size="large"
                  icon={<CheckCircleOutlined />}
                >
                  Concluir Configuração
                </Button>
              )}
            </div>

          </div>

          {/* Progress indicator */}
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#64748b' }}>
            Passo {currentStep + 1} de {steps.length}
          </p>

        </div>

      </div>
    </>
  )
}
