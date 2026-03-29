import React, { useState, useMemo } from 'react'
import { Modal, Select, Input, Button, DatePicker, message, Table, Steps, Alert } from 'antd'
import { PlusOutlined, DeleteOutlined, ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { EXPENSE_SETUP_BLOCKS, EXPENSE_SETUP_BLOCKS_SN, EXPENSE_SETUP_BLOCKS_LP } from '@/constants/expense-setup-blocks'
import type { ExpenseGroupKey } from '@/constants/cashier-category'

interface ExpenseRow {
  key: string
  categoryLabel: string
  expense_group: ExpenseGroupKey
  description: string
  amount: string
  recurrence: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  start_month: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  end_month: any
  isManual?: boolean
}

const currencyMask = (value: string) => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const num = parseInt(digits, 10) / 100
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const parseCurrency = (val: string) =>
  parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0

const RECURRENCE_OPTIONS = [
  { label: '1 única vez', value: 'ONCE' },
  { label: 'Semanal', value: 'WEEKLY' },
  { label: 'Quinzenal', value: 'BIWEEKLY' },
  { label: 'Mensal', value: 'MONTHLY' },
  { label: 'Trimestral', value: 'QUARTERLY' },
]

const SN_REGIMES = ['SIMPLES_NACIONAL', 'MEI']
const LP_REGIMES = ['LUCRO_PRESUMIDO']

function getBlocksForRegime(regime: string | null): typeof EXPENSE_SETUP_BLOCKS {
  if (regime && SN_REGIMES.includes(regime)) return EXPENSE_SETUP_BLOCKS_SN
  if (regime && LP_REGIMES.includes(regime)) return EXPENSE_SETUP_BLOCKS_LP
  return EXPENSE_SETUP_BLOCKS
}

function buildInitialRowsForBlocks(blocks: typeof EXPENSE_SETUP_BLOCKS): Record<number, ExpenseRow[]> {
  const initial: Record<number, ExpenseRow[]> = {}
  blocks.forEach(block => {
    initial[block.id] = block.items.map((item, idx) => ({
      key: `block-${block.id}-${item.key}-${idx}`,
      categoryLabel: block.categoryLabel,
      expense_group: block.expense_group,
      description: item.label,
      amount: '',
      recurrence: 'MONTHLY',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      start_month: null as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      end_month: null as any,
      isManual: false,
    }))
  })
  return initial
}

export function CashflowSetupModal({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { currentUser, refreshUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const [currentStep, setCurrentStep] = useState(0)
  const [taxRegime, setTaxRegime] = useState<string | null>(null)

  const activeBlocks = getBlocksForRegime(taxRegime)

  const [blockRows, setBlockRows] = useState<Record<number, ExpenseRow[]>>(() =>
    buildInitialRowsForBlocks(EXPENSE_SETUP_BLOCKS)
  )

  // Fetch regime and reset rows when modal opens
  React.useEffect(() => {
    if (!open) return
    const tenantId = currentUser?.tenant_id
    if (!tenantId) return
    supabase.from('tenant_settings').select('tax_regime').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => {
        const regime = data?.tax_regime ?? null
        setTaxRegime(regime)
        setBlockRows(buildInitialRowsForBlocks(getBlocksForRegime(regime)))
        setCurrentStep(0)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const currentBlock = activeBlocks[currentStep]
  const rows = currentBlock ? blockRows[currentBlock.id] ?? [] : []

  const addManualRow = () => {
    if (!currentBlock) return
    const newRow: ExpenseRow = {
      key: `manual-${currentBlock.id}-${Date.now()}`,
      categoryLabel: currentBlock.categoryLabel,
      expense_group: currentBlock.expense_group,
      description: '',
      amount: '',
      recurrence: 'MONTHLY',
      start_month: null,
      end_month: null,
      isManual: true,
    }
    setBlockRows(prev => ({
      ...prev,
      [currentBlock.id]: [...(prev[currentBlock.id] ?? []), newRow],
    }))
  }

  const removeRow = (key: string) => {
    if (!currentBlock) return
    const row = rows.find(r => r.key === key)
    if (!row?.isManual) return
    setBlockRows(prev => ({
      ...prev,
      [currentBlock.id]: (prev[currentBlock.id] ?? []).filter(r => r.key !== key),
    }))
  }

  const capitalizeFirst = (s: string) => {
    const t = s.trim()
    if (!t) return t
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateRow = (key: string, field: keyof ExpenseRow, value: any) => {
    if (!currentBlock) return
    setBlockRows(prev => ({
      ...prev,
      [currentBlock.id]: (prev[currentBlock.id] ?? []).map(r => {
        if (r.key !== key) return r
        return { ...r, [field]: value }
      }),
    }))
  }

  const allValidRows = useMemo(() => {
    const collected: ExpenseRow[] = []
    activeBlocks.forEach(block => {
      const blockList = blockRows[block.id] ?? []
      const withValue = blockList.filter(
        r => r.description && r.amount && parseCurrency(r.amount) > 0 && r.recurrence
      )
      collected.push(...withValue)
    })
    return collected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockRows, activeBlocks])

  const handleSave = async () => {
    const rowsWithAmount = activeBlocks.flatMap(
      block => (blockRows[block.id] ?? []).filter(r => parseCurrency(r.amount) > 0)
    )
    const missingFrequency = rowsWithAmount.some(r => !r.recurrence)
    if (missingFrequency) {
      messageApi.warning('Preencha a frequência para as despesas que possuem valor.')
      return
    }

    setSaving(true)
    try {
      const tenantId = currentUser?.tenant_id
      if (!tenantId) throw new Error('Tenant não identificado')

      const now = new Date()
      const curYear = now.getFullYear()
      const curMonth = now.getMonth()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEntries: any[] = []

      for (const r of allValidRows) {
        const amountNum = parseCurrency(r.amount)
        const desc = r.description.trim() || r.categoryLabel
        const recurrence = r.recurrence || 'MONTHLY'

        let startY = curYear, startM = curMonth
        if (r.start_month) { startY = r.start_month.year(); startM = r.start_month.month() }

        let endY = curYear, endM = 11
        if (r.end_month) { endY = r.end_month.year(); endM = r.end_month.month() }

        if (recurrence === 'ONCE') {
          allEntries.push({
            tenant_id: tenantId,
            type: 'EXPENSE' as const,
            origin_type: 'MANUAL',
            recurrence_type: 'ONCE',
            description: desc,
            amount: amountNum,
            due_date: `${startY}-${String(startM + 1).padStart(2, '0')}-01`,
            expense_group: r.expense_group,
          })
        } else if (recurrence === 'WEEKLY' || recurrence === 'BIWEEKLY') {
          const daysStep = recurrence === 'WEEKLY' ? 7 : 14
          const cursor = new Date(startY, startM, 1)
          const endDate = new Date(endY, endM + 1, 0)
          while (cursor <= endDate) {
            allEntries.push({
              tenant_id: tenantId,
              type: 'EXPENSE' as const,
              origin_type: 'FIXED_EXPENSE',
              recurrence_type: recurrence,
              description: desc,
              amount: amountNum,
              due_date: cursor.toISOString().substring(0, 10),
              expense_group: r.expense_group,
            })
            cursor.setDate(cursor.getDate() + daysStep)
          }
        } else {
          const monthStep = recurrence === 'QUARTERLY' ? 3 : 1
          let y = startY, m = startM
          while (y < endY || (y === endY && m <= endM)) {
            allEntries.push({
              tenant_id: tenantId,
              type: 'EXPENSE' as const,
              origin_type: 'FIXED_EXPENSE',
              recurrence_type: recurrence,
              description: desc,
              amount: amountNum,
              due_date: `${y}-${String(m + 1).padStart(2, '0')}-01`,
              expense_group: r.expense_group,
            })
            m += monthStep
            while (m > 11) { m -= 12; y++ }
          }
        }
      }

      if (allEntries.length > 0) {
        const { error } = await supabase.from('cash_entries').insert(allEntries)
        if (error) throw error
      }

      await mergeExpenseConfig(tenantId)

      await supabase
        .from('tenant_settings')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ cashflow_setup_done: true, expense_setup_done: true } as any)
        .eq('tenant_id', tenantId)

      await refreshUser()
      messageApi.success('Configuração salva com sucesso!')
      onDone()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      messageApi.error('Erro ao salvar: ' + (err.message || 'Tente novamente'))
    } finally {
      setSaving(false)
    }
  }

  const goNext = () => {
    if (currentStep < activeBlocks.length - 1) {
      setCurrentStep(s => s + 1)
    }
  }

  const goPrev = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1)
  }

  const isLastStep = currentStep === activeBlocks.length - 1

  return (
    <Modal
      open={open}
      width={960}
      title={
        <span style={{ fontSize: 18, fontWeight: 700 }}>
          Configure os custos da sua empresa
        </span>
      }
      closable={false}
      maskClosable={false}
      footer={null}
    >
      {contextHolder}

      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
      >
        {activeBlocks.map((b, i) => (
          <Steps.Step
            key={b.id}
            title={b.title}
            status={i < currentStep ? 'finish' : i === currentStep ? 'process' : 'wait'}
            icon={i < currentStep ? <CheckOutlined /> : undefined}
          />
        ))}
      </Steps>

      {currentBlock && (
        <>
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              {currentBlock.title}
            </p>
            <p style={{ color: '#94a3b8', marginBottom: 12, fontSize: 13 }}>
              {currentBlock.subtitle}
            </p>
            {isLastStep && (
              <Alert
                type="warning"
                showIcon
                message="Mantenha sempre atualizado!"
                description="Sempre que houver mudança nos seus custos, atualize no fluxo de caixa para que a precificação continue precisa."
                style={{ marginBottom: 12 }}
              />
            )}
          </div>

          <Table<ExpenseRow>
            dataSource={rows}
            rowKey="key"
            pagination={false}
            size="middle"
            scroll={{ x: 1000, y: 320 }}
            columns={[
              {
                title: 'Categoria',
                key: 'category',
                width: 160,
                render: (_, record) => record.categoryLabel,
              },
              {
                title: 'Despesa',
                key: 'description',
                width: 240,
                render: (_, record) => {
                  if (record.isManual) {
                    return (
                      <Input
                        placeholder="Nome da despesa"
                        value={record.description}
                        onChange={(e) => updateRow(record.key, 'description', e.target.value)}
                        onBlur={(e) => updateRow(record.key, 'description', capitalizeFirst(e.target.value))}
                        style={{ width: '100%', minWidth: 180 }}
                      />
                    )
                  }
                  return record.description
                },
              },
              {
                title: 'Valor',
                key: 'amount',
                width: 140,
                render: (_, record) => (
                  <Input
                    placeholder="0,00"
                    prefix="R$"
                    value={record.amount}
                    onChange={(e) => updateRow(record.key, 'amount', currencyMask(e.target.value))}
                    style={{ width: '100%', minWidth: 110 }}
                  />
                ),
              },
              {
                title: 'Mês início',
                key: 'start_month',
                width: 130,
                render: (_, record) => (
                  <DatePicker
                    picker="month"
                    placeholder="Opcional"
                    value={record.start_month ? dayjs(record.start_month) : null}
                    onChange={(v) => updateRow(record.key, 'start_month', v)}
                    format="MM/YYYY"
                    style={{ width: '100%', minWidth: 110 }}
                  />
                ),
              },
              {
                title: 'Mês final',
                key: 'end_month',
                width: 130,
                render: (_, record) => (
                  <DatePicker
                    picker="month"
                    placeholder="Sem fim"
                    value={record.end_month ? dayjs(record.end_month) : null}
                    onChange={(v) => updateRow(record.key, 'end_month', v)}
                    format="MM/YYYY"
                    style={{ width: '100%', minWidth: 110 }}
                  />
                ),
              },
              {
                title: 'Frequência',
                key: 'recurrence',
                width: 130,
                render: (_, record) => (
                  <Select
                    placeholder={record.amount ? 'Obrigatório' : 'Opcional'}
                    value={record.recurrence || undefined}
                    onChange={(v) => updateRow(record.key, 'recurrence', v)}
                    options={RECURRENCE_OPTIONS}
                    style={{ width: '100%', minWidth: 110 }}
                    status={record.amount && !record.recurrence ? 'error' : undefined}
                  />
                ),
              },
              {
                title: '',
                key: 'actions',
                width: 40,
                render: (_, record) =>
                  record.isManual ? (
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeRow(record.key)}
                    />
                  ) : null,
              },
            ]}
          />

          <Button
            icon={<PlusOutlined />}
            onClick={addManualRow}
            style={{
              marginTop: 12,
              marginBottom: 20,
              backgroundColor: 'rgba(34, 197, 94, 0.12)',
              color: '#22C55E',
              borderColor: '#22C55E',
              fontWeight: 600,
            }}
          >
            Adicionar manualmente
          </Button>

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
            <Button
              onClick={goPrev}
              disabled={currentStep === 0}
            >
              Voltar
            </Button>
            {!isLastStep ? (
              <Button type="primary" icon={<ArrowRightOutlined />} onClick={goNext}>
                Próximo bloco
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                onClick={handleSave}
                loading={saving}
                icon={<CheckOutlined />}
              >
                Finalizar e entrar na plataforma
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
