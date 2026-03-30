import { useState, useEffect, useMemo } from 'react'
import { Button, Form, InputNumber, message, Spin, Card } from 'antd'
import { TeamOutlined, CheckCircleOutlined } from '@ant-design/icons'
import Head from 'next/head'
import Image from 'next/image'
import { useAuth } from '@/hooks/use-auth.hook'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import { supabase } from '@/supabase/client'

export default function OnboardingExpenses() {
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [form] = Form.useForm()
  const { currentUser, refreshUser, logout } = useAuth()
  const router = useRouter()
  const [messageApi, contextHolder] = message.useMessage()

  const [monthlyWorkload, setMonthlyWorkload] = useState<number>(176)
  const [adminMonthlyWorkload, setAdminMonthlyWorkload] = useState<number>(176)

  useEffect(() => {
    if (!currentUser) return

    async function loadSettings() {
      try {
        const tenantId = currentUser?.tenant_id
        if (!tenantId) return

        const { data: settings } = await supabase
          .from('tenant_settings')
          .select('monthly_workload, administrative_monthly_workload, expense_setup_done')
          .eq('tenant_id', tenantId)
          .single()

        if (settings) {
          setMonthlyWorkload(Number(settings.monthly_workload) || 176)
          setAdminMonthlyWorkload(Number((settings as any).administrative_monthly_workload) || 176)

          if (settings.expense_setup_done) {
            const target = getDefaultRouteForUser(currentUser)
            router.replace(target)
            return
          }
        }
      } catch {
        /* silent */
      } finally {
        setInitialLoading(false)
      }
    }

    loadSettings()
  }, [currentUser, router])

  const productiveSalary = Form.useWatch('productive_salary_total', form) || 0
  const productiveFgts = Form.useWatch('productive_fgts_total', form) || 0
  const productiveOther = Form.useWatch('productive_other_costs', form) || 0

  const adminSalary = Form.useWatch('admin_salary_total', form) || 0
  const adminFgts = Form.useWatch('admin_fgts_total', form) || 0
  const adminOther = Form.useWatch('admin_other_costs', form) || 0
  const adminDays = Form.useWatch('admin_days_per_month', form) || 22

  const productiveValuePerMinute = useMemo(() => {
    const total = productiveSalary + productiveFgts + productiveOther
    if (total <= 0 || monthlyWorkload <= 0) return 0
    return total / monthlyWorkload / 60
  }, [productiveSalary, productiveFgts, productiveOther, monthlyWorkload])

  const adminLaborPercent = useMemo(() => {
    const total = adminSalary + adminFgts + adminOther
    if (total <= 0 || adminMonthlyWorkload <= 0 || adminDays <= 0) return 0
    return total / adminMonthlyWorkload / adminDays
  }, [adminSalary, adminFgts, adminOther, adminMonthlyWorkload, adminDays])

  async function handleFinish() {
    try {
      await form.validateFields()
    } catch {
      return
    }

    setLoading(true)
    try {
      const tenantId = currentUser?.tenant_id
      if (!tenantId) throw new Error('Tenant não identificado')

      const values = form.getFieldsValue()

      const computedProductiveValuePerMinute = productiveValuePerMinute
      const computedAdminLaborPercent = adminLaborPercent

      const { data: existingConfig } = await supabase
        .from('tenant_expense_config')
        .select('id')
        .eq('tenant_id', tenantId)
        .maybeSingle()

      const expensePayload: Record<string, any> = {
        productive_salary_total: values.productive_salary_total || 0,
        productive_fgts_total: values.productive_fgts_total || 0,
        productive_other_costs: values.productive_other_costs || 0,
        productive_value_per_minute: computedProductiveValuePerMinute,
        admin_salary_total: values.admin_salary_total || 0,
        admin_fgts_total: values.admin_fgts_total || 0,
        admin_other_costs: values.admin_other_costs || 0,
        admin_days_per_month: values.admin_days_per_month || 22,
        admin_labor_percent: computedAdminLaborPercent,
        updated_at: new Date().toISOString(),
      }

      if (existingConfig) {
        const { error } = await supabase
          .from('tenant_expense_config')
          .update(expensePayload)
          .eq('id', existingConfig.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('tenant_expense_config')
          .insert({ tenant_id: tenantId, ...expensePayload })
        if (error) throw error
      }

      // Mirror onboarding values to cash_entries of previous month (for Hub baseline)
      const { data: mirrorCheck } = await supabase
        .from('tenant_settings')
        .select('onboarding_mirrored_to_cashflow')
        .eq('tenant_id', tenantId)
        .single()

      if (!mirrorCheck?.onboarding_mirrored_to_cashflow) {
        // Calculate last day of previous month
        const now = new Date()
        const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0)
        const prevMonthDateStr = prevMonthLastDay.toISOString().substring(0, 10)

        const productiveTotalCost =
          (values.productive_salary_total || 0) +
          (values.productive_fgts_total || 0) +
          (values.productive_other_costs || 0)

        const adminTotalCost =
          (values.admin_salary_total || 0) +
          (values.admin_fgts_total || 0) +
          (values.admin_other_costs || 0)

        const onboardingEntries: any[] = []

        if (productiveTotalCost > 0) {
          onboardingEntries.push({
            tenant_id: tenantId,
            type: 'EXPENSE',
            amount: productiveTotalCost,
            due_date: prevMonthDateStr,
            description: 'MO Produtiva (Onboarding)',
            expense_group: 'MAO_DE_OBRA_PRODUTIVA',
            origin_type: 'FIXED_EXPENSE',
            recurrence_type: 'MONTHLY',
            is_active: true,
          })
        }

        if (adminTotalCost > 0) {
          onboardingEntries.push({
            tenant_id: tenantId,
            type: 'EXPENSE',
            amount: adminTotalCost,
            due_date: prevMonthDateStr,
            description: 'MO Administrativa (Onboarding)',
            expense_group: 'MAO_DE_OBRA_ADMINISTRATIVA',
            origin_type: 'FIXED_EXPENSE',
            recurrence_type: 'MONTHLY',
            is_active: true,
          })
        }

        if (onboardingEntries.length > 0) {
          await supabase.from('cash_entries').insert(onboardingEntries)
        }

        // Mark as mirrored so we don't duplicate
        await supabase
          .from('tenant_settings')
          .update({ onboarding_mirrored_to_cashflow: true } as any)
          .eq('tenant_id', tenantId)
      }

      const { error: settingsError } = await supabase
        .from('tenant_settings')
        .update({ expense_setup_done: true, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
      if (settingsError) throw settingsError

      const profile = await refreshUser()
      messageApi.success('Despesas configuradas com sucesso!')
      const target = getDefaultRouteForUser(profile ?? null)
      setTimeout(() => router.push(target), 800)
    } catch (error: any) {
      messageApi.error(error.message || 'Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!currentUser || initialLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0a1628' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Despesas de Mão de Obra | Precifica Certo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      {contextHolder}
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a1628 0%, rgba(34, 197, 94, 0.1) 50%, #0a1628 100%)',
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
              Configure suas despesas de mão de obra
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8' }}>
              Essas informações são essenciais para precificar corretamente seus produtos e serviços
            </p>
          </div>

          <div style={{
            background: '#111c2e',
            borderRadius: 16,
            padding: '32px 28px',
            boxShadow: '0px 4px 24px rgba(0, 0, 0, 0.08)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{ admin_days_per_month: 22 }}
            >
              {/* Section 1: Mão de obra produtiva */}
              <Card
                size="small"
                style={{
                  borderRadius: 12,
                  marginBottom: 24,
                  border: '1px solid #D1FAE5',
                  background: 'linear-gradient(135deg, rgba(18,183,106,0.04), rgba(18,183,106,0.01))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <TeamOutlined style={{ fontSize: 20, color: '#22C55E' }} />
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                    Mão de obra produtiva
                  </h3>
                </div>
                <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                  Custos com salários e encargos da equipe que atua diretamente na produção ou serviço
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item
                    name="productive_salary_total"
                    label="Total de salários (equipe produtiva)"
                    rules={[{ required: true, message: 'Informe o total de salários' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="R$"
                      placeholder="Ex: 8.000,00"
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={v => Number(String(v).replace(/\./g, '')) ?? 0}
                    />
                  </Form.Item>
                  <Form.Item
                    name="productive_fgts_total"
                    label="Total FGTS (equipe produtiva)"
                    rules={[{ required: true, message: 'Informe o FGTS' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="R$"
                      placeholder="Ex: 640,00"
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={v => Number(String(v).replace(/\./g, '')) ?? 0}
                    />
                  </Form.Item>
                </div>

                <Form.Item
                  name="productive_other_costs"
                  label="Outros custos (equipe produtiva)"
                  style={{ marginBottom: 12 }}
                >
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    precision={2}
                    prefix="R$"
                    placeholder="Opcional — vale transporte, benefícios, etc."
                    formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                    parser={v => Number(String(v).replace(/\./g, '')) ?? 0}
                  />
                </Form.Item>

                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid #86efac',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <CheckCircleOutlined style={{ color: '#22C55E' }} />
                  <span>
                    Valor por minuto:{' '}
                    <strong>
                      R$ {productiveValuePerMinute.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </strong>
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                    (total ÷ {monthlyWorkload}h ÷ 60min)
                  </span>
                </div>
              </Card>

              {/* Section 2: Mão de obra administrativa */}
              <Card
                size="small"
                style={{
                  borderRadius: 12,
                  marginBottom: 24,
                  border: '1px solid #FEF0C7',
                  background: 'linear-gradient(135deg, rgba(247,144,9,0.04), rgba(247,144,9,0.01))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <TeamOutlined style={{ fontSize: 20, color: '#F79009' }} />
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                    Mão de obra administrativa
                  </h3>
                </div>
                <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                  Custos com salários e encargos da equipe de apoio: financeiro, RH, recepção, gestão, etc.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item
                    name="admin_salary_total"
                    label="Total de salários (equipe administrativa)"
                    rules={[{ required: true, message: 'Informe o total de salários' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="R$"
                      placeholder="Ex: 5.000,00"
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={v => Number(String(v).replace(/\./g, '')) ?? 0}
                    />
                  </Form.Item>
                  <Form.Item
                    name="admin_fgts_total"
                    label="Total FGTS (equipe administrativa)"
                    rules={[{ required: true, message: 'Informe o FGTS' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="R$"
                      placeholder="Ex: 400,00"
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={v => Number(String(v).replace(/\./g, '')) ?? 0}
                    />
                  </Form.Item>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item
                    name="admin_other_costs"
                    label="Outros custos (equipe administrativa)"
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      precision={2}
                      prefix="R$"
                      placeholder="Opcional — vale transporte, benefícios, etc."
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                      parser={v => Number(String(v).replace(/\./g, '')) ?? 0}
                    />
                  </Form.Item>
                  <Form.Item
                    name="admin_days_per_month"
                    label="Dias úteis por mês"
                    rules={[{ required: true, message: 'Informe os dias úteis' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={1}
                      max={31}
                      placeholder="22"
                      addonAfter="dias"
                    />
                  </Form.Item>
                </div>

                <div style={{
                  padding: '10px 14px',
                  background: '#FFF7E6',
                  border: '1px solid #FFD591',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <CheckCircleOutlined style={{ color: '#F79009' }} />
                  <span>
                    Percentual administrativo:{' '}
                    <strong>
                      {adminLaborPercent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </strong>
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                    (total ÷ {adminMonthlyWorkload}h ÷ {adminDays} dias)
                  </span>
                </div>
              </Card>
            </Form>

            {/* Navigation */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
              <Button
                type="primary"
                onClick={handleFinish}
                loading={loading}
                size="large"
                icon={<CheckCircleOutlined />}
              >
                Concluir Configuração
              </Button>
            </div>
          </div>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#64748b' }}>
            Etapa 2 de 2 — Despesas de Mão de Obra
          </p>
        </div>
      </div>
    </>
  )
}
