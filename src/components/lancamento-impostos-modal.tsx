import { FC, useEffect, useState } from 'react'
import { Modal, Form, InputNumber, Button, Divider, Row, Col, Typography, Spin, message } from 'antd'
import { supabase } from '@/supabase/client'

const { Text } = Typography

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

// ICMS e PIS/COFINS agora vêm do cadastro do produto/serviço (preenchidos na aba de precificação)
function calcTaxes(salePrice: number, icmsPct: number, pisCofinsFixed: number, isPct: number, ibsPct: number, cbsPct: number, ipiPct: number) {
  const denominator = (100 - icmsPct - pisCofinsFixed) / 100
  const priceGrossed = denominator > 0 ? salePrice / denominator : salePrice
  const isValue = salePrice * (isPct / 100)
  const ibsValue = (salePrice + isValue) * (ibsPct / 100)
  const cbsValue = (salePrice + isValue) * (cbsPct / 100)
  const ipiValue = priceGrossed * (ipiPct / 100)
  const finalPrice = priceGrossed + isValue + ibsValue + cbsValue + ipiValue
  return { pisCofins: pisCofinsFixed, priceGrossed, isValue, ibsValue, cbsValue, ipiValue, finalPrice }
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

  // ICMS e PIS/COFINS são gerenciados no cadastro do produto/serviço
  const [storedIcmsPct, setStoredIcmsPct] = useState(0)
  const [storedPisCofinsLRPct, setStoredPisCofinsLRPct] = useState(0)

  const [calc, setCalc] = useState(() => calcTaxes(salePrice, 0, 0, 0, 0, 0, 0))

  const table = entityType === 'product' ? 'products' : 'services'

  useEffect(() => {
    if (!open) return
    setLoading(true)
    ;(async () => {
      const { data } = await (supabase as any)
        .from(table)
        .select('icms_pct, pis_cofins_pct, is_pct, ibs_pct, cbs_pct, ipi_pct, taxes_launched')
        .eq('id', entityId)
        .single()
      if (data) {
        const icms = Number(data.icms_pct) || 0
        const pisCofins = Number(data.pis_cofins_pct) || 0
        setStoredIcmsPct(icms)
        setStoredPisCofinsLRPct(pisCofins)
        const vals = {
          is_pct: Number(data.is_pct) || 0,
          ibs_pct: Number(data.ibs_pct) || 0,
          cbs_pct: Number(data.cbs_pct) || 0,
          ipi_pct: Number(data.ipi_pct) || 0,
        }
        form.setFieldsValue(vals)
        setCalc(calcTaxes(salePrice, icms, pisCofins, vals.is_pct, vals.ibs_pct, vals.cbs_pct, vals.ipi_pct))
      } else {
        form.resetFields()
        setStoredIcmsPct(0)
        setStoredPisCofinsLRPct(0)
        setCalc(calcTaxes(salePrice, 0, 0, 0, 0, 0, 0))
      }
      setLoading(false)
    })()
  }, [open, entityId])

  const handleValuesChange = () => {
    const v = form.getFieldsValue()
    setCalc(calcTaxes(
      salePrice,
      storedIcmsPct,
      storedPisCofinsLRPct,
      Number(v.is_pct) || 0,
      Number(v.ibs_pct) || 0,
      Number(v.cbs_pct) || 0,
      Number(v.ipi_pct) || 0,
    ))
  }

  const handleConfirm = async () => {
    const v = form.getFieldsValue()
    const isPct = Number(v.is_pct) || 0
    const ibsPct = Number(v.ibs_pct) || 0
    const cbsPct = Number(v.cbs_pct) || 0
    const ipiPct = Number(v.ipi_pct) || 0
    const { priceGrossed, isValue, ibsValue, cbsValue, ipiValue, finalPrice } =
      calcTaxes(salePrice, storedIcmsPct, storedPisCofinsLRPct, isPct, ibsPct, cbsPct, ipiPct)

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

        {(storedIcmsPct > 0 || storedPisCofinsLRPct > 0) && (
          <div style={{
            background: '#1e293b', padding: '8px 14px', borderRadius: 6,
            fontSize: 12, color: '#94a3b8', marginBottom: 14,
            display: 'flex', gap: 24, alignItems: 'center',
          }}>
            {storedIcmsPct > 0 && (
              <span>ICMS: <strong style={{ color: '#e2e8f0' }}>
                {storedIcmsPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
              </strong></span>
            )}
            {storedPisCofinsLRPct > 0 && (
              <span>PIS/COFINS: <strong style={{ color: '#e2e8f0' }}>
                {storedPisCofinsLRPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
              </strong></span>
            )}
            <span style={{ color: '#64748b', fontSize: 11 }}>(configurados no produto — edite na aba de precificação)</span>
          </div>
        )}

        <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="IS — Imposto Seletivo (%)" name="is_pct">
                <InputNumber min={0} max={100} step={0.01} precision={2} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="IBS — Imposto sobre Bens e Serv. (%)" name="ibs_pct">
                <InputNumber min={0} max={100} step={0.01} precision={2} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="CBS — Contrib. sobre Bens e Serv. (%)" name="cbs_pct">
                <InputNumber min={0} max={100} step={0.01} precision={2} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="IPI (%)" name="ipi_pct">
                <InputNumber min={0} max={100} step={0.01} precision={2} style={{ width: '100%' }} placeholder="0,00" />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ background: '#1a1a2e', padding: 14, borderRadius: 8, fontSize: 13 }}>
          <Row gutter={8} style={{ marginBottom: 6 }}>
            <Col span={14}><Text type="secondary">Preço grosseado (base + ICMS + PIS/COFINS)</Text></Col>
            <Col span={10} style={{ textAlign: 'right' }}><Text>{fmt(calc.priceGrossed)}</Text></Col>
          </Row>
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
