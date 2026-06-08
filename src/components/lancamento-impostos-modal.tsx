import { FC, useEffect, useState } from 'react'
import { Modal, Form, InputNumber, Button, Divider, Row, Col, Typography, Spin, message } from 'antd'
import { supabase } from '@/supabase/client'
import { computeIvaDualOutside } from '@/utils/iva-dual-outside'

const { Text } = Typography

/** Normaliza alíquota para base 100. Colunas S15 (iss_pct) são decimais (0.05 → 5). */
function toBase100(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 1 ? n * 100 : n
}

interface LancamentoImpostosModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  entityId: string
  entityType: 'product' | 'service'
  salePrice: number
  entityName: string
}

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

// ICMS, ISS e PIS/COFINS já estão embutidos "por dentro" no preço de venda (calculados na
// precificação). Aqui só entram os impostos "por fora" da Reforma: IS, IBS, CBS, IPI.
// Hierarquia oficial PDF: BaseIVA = salePrice − ICMS − ISS − PIS/COFINS (valores apurados
// na operação por dentro, sem gross-up); IS compõe a base de IBS/CBS; IPI destacado.
interface InsideRates {
  icmsPct: number
  issPct: number
  pisCofinsPct: number
}

function calcTaxes(
  salePrice: number,
  inside: InsideRates,
  isPct: number,
  ibsPct: number,
  cbsPct: number,
  ipiPct: number,
  despAcessorias = 0,
) {
  return computeIvaDualOutside({
    opInterna: salePrice,
    icmsPct: inside.icmsPct,
    issPct: inside.issPct,
    pisCofinsPct: inside.pisCofinsPct,
    isPct,
    ibsPct,
    cbsPct,
    ipiPct,
    despAcessorias,
  })
}

export const LancamentoImpostosModal: FC<LancamentoImpostosModalProps> = ({
  open,
  onClose,
  onSuccess,
  entityId,
  entityType,
  salePrice,
  entityName,
}) => {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const ZERO_INSIDE: InsideRates = { icmsPct: 0, issPct: 0, pisCofinsPct: 0 }
  const [inside, setInside] = useState<InsideRates>(ZERO_INSIDE)
  // Desp. Acessórias (frete + seguro + despesas acessórias) — integram a base por fora (D1).
  const [despAcessorias, setDespAcessorias] = useState(0)
  const [calc, setCalc] = useState(() => calcTaxes(salePrice, ZERO_INSIDE, 0, 0, 0, 0, 0))

  const table = entityType === 'product' ? 'products' : 'services'

  useEffect(() => {
    if (!open) return
    setLoading(true)
    ;(async () => {
      const { data } = await (supabase as any)
        .from(table)
        .select('icms_pct, pis_cofins_pct, iss_pct, is_pct, ibs_pct, cbs_pct, ipi_pct, taxes_launched, freight_value, insurance_value, accessory_expenses_value')
        .eq('id', entityId)
        .single()
      if (data) {
        const insideRates: InsideRates = {
          icmsPct: Number(data.icms_pct) || 0,        // base 100 (formação de preço)
          pisCofinsPct: Number(data.pis_cofins_pct) || 0, // base 100
          issPct: toBase100(data.iss_pct),            // decimal (S15) → base 100
        }
        setInside(insideRates)
        const desp = (Number(data.freight_value) || 0) + (Number(data.insurance_value) || 0) + (Number(data.accessory_expenses_value) || 0)
        setDespAcessorias(desp)
        const vals = {
          is_pct: Number(data.is_pct) || 0,
          ibs_pct: Number(data.ibs_pct) || 0,
          cbs_pct: Number(data.cbs_pct) || 0,
          ipi_pct: Number(data.ipi_pct) || 0,
        }
        form.setFieldsValue(vals)
        setCalc(calcTaxes(salePrice, insideRates, vals.is_pct, vals.ibs_pct, vals.cbs_pct, vals.ipi_pct, desp))
      } else {
        form.resetFields()
        setInside(ZERO_INSIDE)
        setDespAcessorias(0)
        setCalc(calcTaxes(salePrice, ZERO_INSIDE, 0, 0, 0, 0, 0))
      }
      setLoading(false)
    })()
  }, [open, entityId])

  const handleValuesChange = () => {
    const v = form.getFieldsValue()
    setCalc(calcTaxes(
      salePrice,
      inside,
      Number(v.is_pct) || 0,
      Number(v.ibs_pct) || 0,
      Number(v.cbs_pct) || 0,
      Number(v.ipi_pct) || 0,
      despAcessorias,
    ))
  }

  const handleConfirm = async () => {
    const v = form.getFieldsValue()
    const isPct = Number(v.is_pct) || 0
    const ibsPct = Number(v.ibs_pct) || 0
    const cbsPct = Number(v.cbs_pct) || 0
    const ipiPct = Number(v.ipi_pct) || 0
    const { isValue, ibsValue, cbsValue, ipiValue, finalPrice } =
      calcTaxes(salePrice, inside, isPct, ibsPct, cbsPct, ipiPct, despAcessorias)

    setSaving(true)
    try {
      const { error } = await (supabase as any)
        .from(table)
        .update({
          taxes_launched: true,
          is_pct: isPct,
          is_value: isValue,
          ibs_pct: ibsPct,
          ibs_value: ibsValue,
          cbs_pct: cbsPct,
          cbs_value: cbsValue,
          ipi_pct: ipiPct,
          ipi_value: ipiValue,
          sale_price_base: salePrice,
          sale_price_after_taxes: finalPrice,
          sale_price: finalPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entityId)

      if (error) {
        message.error('Erro ao lançar impostos: ' + error.message)
        return
      }
      message.success('Impostos lançados com sucesso!')
      onSuccess()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Lançar Impostos — ${entityName}`}
      open={open}
      onCancel={onClose}
      width={560}
      footer={[
        <Button key="cancel" onClick={onClose}>Cancelar</Button>,
        <Button key="confirm" type="primary" loading={saving} onClick={handleConfirm}>
          Confirmar Lançamento
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">Preço de venda base: </Text>
          <Text strong>{fmt(salePrice)}</Text>
        </div>


        <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="IS — Imposto Seletivo (%)" name="is_pct">
                <InputNumber min={0} max={100} step={0.01} precision={4} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="IBS — Imposto sobre Bens e Serv. (%)" name="ibs_pct">
                <InputNumber min={0} max={100} step={0.01} precision={4} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="CBS — Contrib. sobre Bens e Serv. (%)" name="cbs_pct">
                <InputNumber min={0} max={100} step={0.01} precision={4} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="IPI (%)" name="ipi_pct">
                <InputNumber min={0} max={100} step={0.01} precision={4} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ background: '#1a1a2e', padding: 14, borderRadius: 8, fontSize: 13 }}>
          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={14}><Text type="secondary">Preço de venda base</Text></Col>
            <Col span={10} style={{ textAlign: 'right' }}><Text>{fmt(salePrice)}</Text></Col>
          </Row>
          {calc.baseIVA < salePrice && (
            <Row gutter={8} style={{ marginBottom: 6 }}>
              <Col span={14}><Text type="secondary" style={{ fontSize: 11 }}>Base Econômica IVA (PV − ICMS − ISS − PIS/COFINS)</Text></Col>
              <Col span={10} style={{ textAlign: 'right' }}><Text style={{ fontSize: 11 }}>{fmt(calc.baseIVA)}</Text></Col>
            </Row>
          )}
          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={14}><Text type="secondary">+ Valor IS</Text></Col>
            <Col span={10} style={{ textAlign: 'right' }}><Text>{fmt(calc.isValue)}</Text></Col>
          </Row>
          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={14}><Text type="secondary">+ Valor IBS</Text></Col>
            <Col span={10} style={{ textAlign: 'right' }}><Text>{fmt(calc.ibsValue)}</Text></Col>
          </Row>
          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={14}><Text type="secondary">+ Valor CBS</Text></Col>
            <Col span={10} style={{ textAlign: 'right' }}><Text>{fmt(calc.cbsValue)}</Text></Col>
          </Row>
          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={14}><Text type="secondary">+ Valor IPI</Text></Col>
            <Col span={10} style={{ textAlign: 'right' }}><Text>{fmt(calc.ipiValue)}</Text></Col>
          </Row>
          <Divider style={{ margin: '8px 0' }} />
          <Row gutter={8}>
            <Col span={14}><Text strong style={{ fontSize: 14 }}>Preço Final</Text></Col>
            <Col span={10} style={{ textAlign: 'right' }}>
              <Text strong style={{ fontSize: 15, color: '#4ade80' }}>{fmt(calc.finalPrice)}</Text>
            </Col>
          </Row>
        </div>
      </Spin>
    </Modal>
  )
}
