import React, { useState, useEffect, useCallback } from 'react'
import { Button, Card, Form, Input, InputNumber, Radio, Select, Tabs, message, Alert, Spin, Divider } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId as fetchTenantId } from '@/utils/get-tenant-id'
import type { Tenant, TenantSettings, BrazilianState } from '@/supabase/types'
import {
    ShopOutlined,
    BankOutlined,
    TeamOutlined,
    SaveOutlined,
    LockOutlined,
    SettingOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/hooks/use-auth.hook'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import { UNIT_MEASURE_ENUM } from '@/shared/enums/unit-measure-type'

// Alíquotas de presunção padrão por tipo de atividade LP (espelho de lucro_presumido_rates)
// Usadas como sugestão ao selecionar atividade; o tenant pode sobrescrever manualmente.
const LP_ACTIVITY_RATES: Record<string, { irpjPres: number; csllPres: number }> = {
    COMERCIO:                  { irpjPres: 0.08,  csllPres: 0.12 },
    INDUSTRIA:                 { irpjPres: 0.08,  csllPres: 0.12 },
    SERVICO_GERAL:             { irpjPres: 0.32,  csllPres: 0.32 },
    SERVICO_HOSPITALAR:        { irpjPres: 0.08,  csllPres: 0.12 },
    SERVICO_TRANSPORTE_CARGA:  { irpjPres: 0.08,  csllPres: 0.12 },
    SERVICO_TRANSPORTE_PASSAG: { irpjPres: 0.16,  csllPres: 0.12 },
    REVENDA_COMBUSTIVEL:       { irpjPres: 0.016, csllPres: 0.12 },
}

interface TaxTabProps {
    taxForm: ReturnType<typeof Form.useForm>[0]
    brazilianStates: BrazilianState[]
    tenantSettings: TenantSettings | null
    loading: boolean
    onSave: () => void
}

function TaxTabContent({ taxForm, brazilianStates, tenantSettings, loading, onSave }: TaxTabProps) {
    const [regime, setRegime] = useState<string>(tenantSettings?.tax_regime || '')
    const [stateCode, setStateCode] = useState<string>(tenantSettings?.state_code?.trim() || '')
    const [anexo, setAnexo] = useState<string>(tenantSettings?.simples_anexo || '')
    const [revenue12m, setRevenue12m] = useState<number>(Number(tenantSettings?.simples_revenue_12m) || 0)
    const [lpActivity, setLpActivity] = useState<string>(tenantSettings?.lucro_presumido_activity || 'COMERCIO')
    const defaultLpRates = LP_ACTIVITY_RATES[tenantSettings?.lucro_presumido_activity || 'COMERCIO'] ?? { irpjPres: 0.08, csllPres: 0.12 }
    const [lpIrpjPresumptionPct, setLpIrpjPresumptionPct] = useState<number>(
        tenantSettings?.lp_irpj_presumption_percent != null
            ? Number(tenantSettings.lp_irpj_presumption_percent) * 100
            : defaultLpRates.irpjPres * 100
    )
    const [lpCsllPresumptionPct, setLpCsllPresumptionPct] = useState<number>(
        tenantSettings?.lp_csll_presumption_percent != null
            ? Number(tenantSettings.lp_csll_presumption_percent) * 100
            : defaultLpRates.csllPres * 100
    )
    const [lpEstimatedAnnualRevenue, setLpEstimatedAnnualRevenue] = useState<number | null>(
        tenantSettings?.lp_estimated_annual_revenue != null ? Number(tenantSettings.lp_estimated_annual_revenue) : null
    )
    const [effectiveRate, setEffectiveRate] = useState<number | null>(null)
    const [ibsReferencePct, setIbsReferencePct] = useState<number | null>(
        tenantSettings?.ibs_reference_pct != null ? Number(tenantSettings.ibs_reference_pct) : null
    )
    const [cbsReferencePct, setCbsReferencePct] = useState<number | null>(
        tenantSettings?.cbs_reference_pct != null ? Number(tenantSettings.cbs_reference_pct) : null
    )

    useEffect(() => {
        if (tenantSettings) {
            const r = tenantSettings.tax_regime || ''
            const sc = tenantSettings.state_code?.trim() || ''
            setRegime(r)
            setStateCode(sc)
            setAnexo(tenantSettings.simples_anexo || '')
            setRevenue12m(Number(tenantSettings.simples_revenue_12m) || 0)
            const activity = tenantSettings.lucro_presumido_activity || 'COMERCIO'
            setLpActivity(activity)
            const actRates = LP_ACTIVITY_RATES[activity] ?? { irpjPres: 0.08, csllPres: 0.12 }
            const irpjPres = tenantSettings.lp_irpj_presumption_percent != null
                ? Number(tenantSettings.lp_irpj_presumption_percent) * 100
                : actRates.irpjPres * 100
            const csllPres = tenantSettings.lp_csll_presumption_percent != null
                ? Number(tenantSettings.lp_csll_presumption_percent) * 100
                : actRates.csllPres * 100
            setLpIrpjPresumptionPct(irpjPres)
            setLpCsllPresumptionPct(csllPres)
            // Para LP: usa o faturamento anual (simples_revenue_12m) como fonte primária.
            // lp_estimated_annual_revenue é salvo junto e serve como cache para a engine.
            const lpAnnualRev = tenantSettings.tax_regime === 'LUCRO_PRESUMIDO'
                ? (Number(tenantSettings.simples_revenue_12m) || Number(tenantSettings.lp_estimated_annual_revenue) || null)
                : null
            setLpEstimatedAnnualRevenue(lpAnnualRev)
            setIbsReferencePct(tenantSettings.ibs_reference_pct != null ? Number(tenantSettings.ibs_reference_pct) : null)
            setCbsReferencePct(tenantSettings.cbs_reference_pct != null ? Number(tenantSettings.cbs_reference_pct) : null)
            taxForm.setFieldsValue({
                regime: r,
                state_code: sc,
                simples_anexo: tenantSettings.simples_anexo || undefined,
                revenue_input_type: 'TOTAL_12M',
                revenue_value: Number(tenantSettings.simples_revenue_12m) || undefined,
                lucro_presumido_activity: tenantSettings.lucro_presumido_activity || 'COMERCIO',
                lp_irpj_presumption_percent: irpjPres,
                lp_csll_presumption_percent: csllPres,
                ret_rate: tenantSettings.ret_rate != null ? Number(tenantSettings.ret_rate) * 100 : 4,
                ibs_reference_pct: tenantSettings.ibs_reference_pct != null ? Number(tenantSettings.ibs_reference_pct) : undefined,
                cbs_reference_pct: tenantSettings.cbs_reference_pct != null ? Number(tenantSettings.cbs_reference_pct) : undefined,
            })
            if (r === 'SIMPLES_NACIONAL' && tenantSettings.simples_anexo) {
                calcSimplesRate(tenantSettings.simples_anexo, Number(tenantSettings.simples_revenue_12m) || 0)
            }
        }
    }, [tenantSettings])

    const calcSimplesRate = useCallback(async (anexoRaw: string, rev: number) => {
        const a = (anexoRaw || '').replace(/^ANEXO_/i, '') || 'I'
        const { data: brackets } = await supabase
            .from('simples_nacional_brackets')
            .select('nominal_rate, deduction, revenue_min, revenue_max')
            .eq('anexo', a)
            .order('bracket_order', { ascending: true })

        if (brackets && brackets.length > 0) {
            let bracket = brackets[0]
            for (const b of brackets) {
                if (rev >= Number(b.revenue_min) && rev <= Number(b.revenue_max)) { bracket = b; break }
            }
            const nom = Number(bracket.nominal_rate)
            const ded = Number(bracket.deduction)
            const eff = rev > 0 ? (rev * nom - ded) / rev : nom
            setEffectiveRate(Math.round(eff * 10000) / 100)
        } else {
            setEffectiveRate(null)
        }
    }, [])

    const stateData = brazilianStates.find(s => s.code?.trim() === stateCode)
    const icmsPercent = stateData?.icms_internal_rate != null ? Number(stateData.icms_internal_rate) * 100 : null
    const issPercent = tenantSettings?.iss_municipality_rate ? Number(tenantSettings.iss_municipality_rate) * 100 : 5

    // Valores de presunção em % (ex: 8, 12) para exibição/cálculo nos cards
    const lpIrpjPresPct = lpIrpjPresumptionPct  // já em %
    const lpCsllPresPct = lpCsllPresumptionPct  // já em %
    const lpIrpjDisplayPct  = lpIrpjPresPct * 0.15   // % de IRPJ sobre receita (ex: 8 * 0.15 = 1.20)
    const lpCsllDisplayPct  = lpCsllPresPct * 0.09   // % de CSLL sobre receita (ex: 12 * 0.09 = 1.08)
    const lpIrpjAdditionalDisplayPct: number | null = (() => {
        if (!lpEstimatedAnnualRevenue || lpEstimatedAnnualRevenue <= 0) return null
        const irpjBase = lpEstimatedAnnualRevenue * (lpIrpjPresPct / 100)
        const excedente = Math.max(0, irpjBase - 240000)
        if (excedente <= 0) return 0
        return (excedente * 0.10 / lpEstimatedAnnualRevenue) * 100
    })()

    const isMei = regime === 'MEI'
    const isSN = regime === 'SIMPLES_NACIONAL'
    const isLP = regime === 'LUCRO_PRESUMIDO'
    const isRet = regime === 'LUCRO_PRESUMIDO_RET'
    const isLR = regime === 'LUCRO_REAL'
    const isSH = regime === 'SIMPLES_HIBRIDO'

    return (
        <div style={{ maxWidth: 720 }}>
            <p style={{ color: 'var(--color-neutral-500)', fontSize: 13, marginBottom: 20 }}>
                Configure o regime tributário. As alíquotas são calculadas automaticamente com base no regime e UF.
            </p>
            <Form form={taxForm} layout="vertical">
                <Form.Item name="regime" label="Regime Tributário" rules={[{ required: true }]}>
                    <Select
                        onChange={(val: string) => {
                            setRegime(val)
                            setEffectiveRate(null)
                        }}
                    >
                        <Select.Option value="MEI">MEI</Select.Option>
                        <Select.Option value="SIMPLES_NACIONAL">Simples Nacional</Select.Option>
                        <Select.Option value="LUCRO_PRESUMIDO">Lucro Presumido</Select.Option>
                        <Select.Option value="LUCRO_PRESUMIDO_RET">Lucro Presumido RET</Select.Option>
                        <Select.Option value="LUCRO_REAL">Lucro Real</Select.Option>
                        <Select.Option value="SIMPLES_HIBRIDO">Simples Híbrido</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item name="state_code" label="UF da Empresa" style={{ maxWidth: 200 }}>
                    <Select
                        showSearch
                        optionFilterProp="children"
                        onChange={(val: string) => setStateCode(val)}
                    >
                        {brazilianStates.map(s => (
                            <Select.Option key={s.code} value={s.code?.trim()}>{s.code?.trim()}</Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                {isMei && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16, borderRadius: 8 }}
                        message="MEI — Tributação simplificada"
                        description="O MEI paga um valor fixo mensal (DAS) que já inclui INSS, ICMS e ISS. Não há cálculo de impostos por produto."
                    />
                )}

                {isSN && (
                    <Form.Item name="simples_anexo" label="Anexo do Simples Nacional" rules={[{ required: true, message: 'Selecione o Anexo' }]}>
                        <Select
                            placeholder="Selecione o Anexo"
                            onChange={(val: string) => {
                                setAnexo(val)
                                calcSimplesRate(val, revenue12m)
                            }}
                        >
                            <Select.Option value="ANEXO_I">Anexo I — Comércio</Select.Option>
                            <Select.Option value="ANEXO_II">Anexo II — Indústria</Select.Option>
                            <Select.Option value="ANEXO_III">Anexo III — Serviços (locação, reparação)</Select.Option>
                            <Select.Option value="ANEXO_IV">Anexo IV — Serviços (limpeza, vigilância)</Select.Option>
                            <Select.Option value="ANEXO_V">Anexo V — Serviços (TI, engenharia)</Select.Option>
                        </Select>
                    </Form.Item>
                )}

                {regime && !isMei && (
                    <>
                        <Form.Item
                            name="revenue_input_type"
                            label="Como deseja informar o faturamento?"
                            initialValue="TOTAL_12M"
                            tooltip="Usado para tributação e para o recálculo de despesas na precificação. Se não tiver 12 meses de histórico, use faturamento médio por mês."
                        >
                            <Radio.Group
                                onChange={(e) => {
                                    const newType = e.target.value
                                    const prevType = taxForm.getFieldValue('revenue_input_type')
                                    const val = Number(taxForm.getFieldValue('revenue_value')) || 0
                                    if (prevType === 'TOTAL_12M' && newType === 'AVERAGE_MONTHLY') {
                                        taxForm.setFieldValue('revenue_value', val > 0 ? Math.round(val / 12) : 0)
                                    } else if (prevType === 'AVERAGE_MONTHLY' && newType === 'TOTAL_12M') {
                                        taxForm.setFieldValue('revenue_value', val * 12)
                                    }
                                    const rev = newType === 'AVERAGE_MONTHLY' ? (Number(taxForm.getFieldValue('revenue_value')) || 0) * 12 : (Number(taxForm.getFieldValue('revenue_value')) || 0)
                                    setRevenue12m(rev)
                                    if (isSN && anexo) calcSimplesRate(anexo, rev)
                                    if (isLP) setLpEstimatedAnnualRevenue(rev)
                                }}
                            >
                                <Radio value="TOTAL_12M" style={{ display: 'block', marginBottom: 6 }}>Faturamento total dos últimos 12 meses</Radio>
                                <Radio value="AVERAGE_MONTHLY" style={{ display: 'block' }}>Faturamento médio por mês (empresa nova ou sem 12 meses)</Radio>
                            </Radio.Group>
                        </Form.Item>
                        <Form.Item
                            noStyle
                            shouldUpdate={(prev, curr) => prev.revenue_input_type !== curr.revenue_input_type || prev.revenue_value !== curr.revenue_value}
                        >
                            {({ getFieldValue }) => {
                                const type = getFieldValue('revenue_input_type')
                                return (
                                    <Form.Item
                                        name="revenue_value"
                                        label={type !== 'AVERAGE_MONTHLY' ? 'Faturamento total dos últimos 12 meses (R$)' : 'Faturamento médio por mês (R$)'}
                                        rules={[{ required: true, message: 'Informe o faturamento' }, { type: 'number', min: 0, message: 'Deve ser ≥ 0' }]}
                                        tooltip={type !== 'AVERAGE_MONTHLY'
                                            ? 'Usado para tributação e para o recálculo de despesas. Não depende do fluxo de caixa.'
                                            : 'Estimativa de faturamento mensal. O sistema usará esse valor × 12 como base até ter histórico no fluxo.'}
                                    >
                                        <InputNumber
                                            min={0}
                                            step={type === 'AVERAGE_MONTHLY' ? 500 : 1000}
                                            style={{ width: '100%' }}
                                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                                            parser={v => Number((v || '').replace(/\./g, ''))}
                                            onChange={(num) => {
                                                const rev = type === 'AVERAGE_MONTHLY' ? (Number(num) || 0) * 12 : (Number(num) || 0)
                                                setRevenue12m(rev)
                                                if (isSN && anexo) calcSimplesRate(anexo, rev)
                                                if (isLP) setLpEstimatedAnnualRevenue(rev)
                                            }}
                                        />
                                    </Form.Item>
                                )
                            }}
                        </Form.Item>
                    </>
                )}

                        {isRet && (
                    <>
                        <Form.Item
                            name="ret_activity_type"
                            label="Tipo de Atividade RET"
                            tooltip="Tipo de atividade conforme Lei 10.931/2004."
                            initialValue={tenantSettings?.ret_activity_type || 'INCORPORACAO_IMOBILIARIA'}
                        >
                            <Select style={{ width: 320 }}>
                                <Select.Option value="INCORPORACAO_IMOBILIARIA">Incorporação Imobiliária (CNAE 68xx)</Select.Option>
                                <Select.Option value="CONSTRUCAO_CIVIL">Construção Civil (CNAE 41xx, 42xx, 43xx)</Select.Option>
                                <Select.Option value="PARCELAMENTO_SOLO">Parcelamento de Solo</Select.Option>
                                <Select.Option value="CONSTRUCAO_CASAS_POPULARES">Construção de Casas Populares</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item
                            name="ret_rate"
                            label="Alíquota RET (%)"
                            tooltip="Alíquota consolidada: IRPJ 1,71% + CSLL 0,51% + PIS 0,37% + COFINS 1,41% = 4,00%."
                            initialValue={(tenantSettings?.ret_rate ?? 0.04) * 100}
                        >
                            <InputNumber min={0} max={100} step={0.01} style={{ width: 200 }} formatter={(v) => v != null ? String(v).replace('.', ',') : ''} parser={(v) => Number((v || '0').replace(',', '.'))} addonAfter="%" />
                        </Form.Item>

                        <Form.Item
                            name="iss_municipality_rate_ret"
                            label="Alíquota ISS Municipal (%)"
                            tooltip="ISS cobrado separadamente pelo município (2% a 5%). Confirme com seu contador."
                            initialValue={(tenantSettings?.iss_municipality_rate ?? 0.05) * 100}
                        >
                            <InputNumber min={0} max={10} step={0.01} style={{ width: 200 }} formatter={(v) => v != null ? String(v).replace('.', ',') : ''} parser={(v) => Number((v || '0').replace(',', '.'))} addonAfter="%" />
                        </Form.Item>

                        <Form.Item
                            name="ret_estimated_monthly_revenue"
                            label="Receita Mensal Estimada (R$)"
                            tooltip="Estimativa de faturamento mensal para planejamento e dashboard."
                            initialValue={tenantSettings?.ret_estimated_monthly_revenue ?? 0}
                        >
                            <InputNumber min={0} step={1000} style={{ width: 280 }} formatter={(v) => v != null ? `R$ ${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : 'R$ 0'} parser={(v) => Number((v || '0').replace(/[R$\s.]/g, '').replace(',', '.'))} />
                        </Form.Item>

                        {/* Cards de carga tributária LP RET */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8, marginBottom: 16 }}>
                            <Card size="small" style={{ textAlign: 'center', borderRadius: 8, background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))' }}>
                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>Carga Total LP RET</div>
                                <div style={{ fontSize: 24, fontWeight: 700, color: '#F59E0B' }}>
                                    {((tenantSettings?.ret_rate ?? 0.04) * 100 + (tenantSettings?.iss_municipality_rate ?? 0.05) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>RET + ISS Municipal</div>
                            </Card>
                            <Card size="small" style={{ borderRadius: 8 }}>
                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 6 }}>Breakdown RET</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.8 }}>
                                    <div>IRPJ: <strong style={{ color: '#e2e8f0' }}>1,71%</strong></div>
                                    <div>CSLL: <strong style={{ color: '#e2e8f0' }}>0,51%</strong></div>
                                    <div>PIS: <strong style={{ color: '#e2e8f0' }}>0,37%</strong></div>
                                    <div>COFINS: <strong style={{ color: '#e2e8f0' }}>1,41%</strong></div>
                                    <div>ISS: <strong style={{ color: '#F59E0B' }}>{((tenantSettings?.iss_municipality_rate ?? 0.05) * 100).toFixed(2)}%</strong> (municipal)</div>
                                </div>
                            </Card>
                        </div>

                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 16, borderRadius: 8 }}
                            message="LP RET — Regime Cumulativo"
                            description="PIS/COFINS não geram crédito no LP RET. ISS cobrado separadamente pelo município. O RET é aplicado por obra/incorporação — certifique-se de optar em cada SPE junto à Receita Federal."
                        />
                    </>
                )}

                {isLP && (
                    <>
                        <Form.Item name="lucro_presumido_activity" label="Tipo de Atividade (presunção IRPJ/CSLL)">
                            <Select onChange={(val: string) => {
                                setLpActivity(val)
                                const rates = LP_ACTIVITY_RATES[val] ?? { irpjPres: 0.08, csllPres: 0.12 }
                                const newIrpj = rates.irpjPres * 100
                                const newCsll = rates.csllPres * 100
                                setLpIrpjPresumptionPct(newIrpj)
                                setLpCsllPresumptionPct(newCsll)
                                taxForm.setFieldsValue({
                                    lp_irpj_presumption_percent: newIrpj,
                                    lp_csll_presumption_percent: newCsll,
                                })
                            }}>
                                <Select.Option value="COMERCIO">Comércio em geral</Select.Option>
                                <Select.Option value="INDUSTRIA">Indústria</Select.Option>
                                <Select.Option value="SERVICO_GERAL">Serviço em geral</Select.Option>
                                <Select.Option value="SERVICO_HOSPITALAR">Serviços hospitalares</Select.Option>
                                <Select.Option value="SERVICO_TRANSPORTE_CARGA">Transporte de carga</Select.Option>
                                <Select.Option value="SERVICO_TRANSPORTE_PASSAG">Transporte de passageiros</Select.Option>
                                <Select.Option value="REVENDA_COMBUSTIVEL">Revenda de combustíveis</Select.Option>
                            </Select>
                        </Form.Item>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <Form.Item
                                name="lp_irpj_presumption_percent"
                                label="Percentual de presunção para IRPJ"
                                tooltip="Percentual de presunção da base de cálculo do IRPJ, definido conforme a atividade econômica da empresa. Confirme com seu contador. Ex: Comércio/Indústria = 8%."
                            >
                                <InputNumber
                                    min={0} max={100} step={0.5} style={{ width: '100%' }}
                                    addonAfter="%"
                                    formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                    parser={(v) => Number((v || '0').replace(',', '.'))}
                                    onChange={(val) => setLpIrpjPresumptionPct(Number(val) || 0)}
                                />
                            </Form.Item>
                            <Form.Item
                                name="lp_csll_presumption_percent"
                                label="Percentual de presunção para CSLL"
                                tooltip="Percentual de presunção da base de cálculo da CSLL, definido conforme a atividade econômica da empresa. Confirme com seu contador. Ex: Comércio/Indústria = 12%."
                            >
                                <InputNumber
                                    min={0} max={100} step={0.5} style={{ width: '100%' }}
                                    addonAfter="%"
                                    formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                    parser={(v) => Number((v || '0').replace(',', '.'))}
                                    onChange={(val) => setLpCsllPresumptionPct(Number(val) || 0)}
                                />
                            </Form.Item>
                        </div>
                    </>
                )}

                {regime && !isMei && (
                    <>
                        <Divider />
                        <h4 style={{ fontWeight: 600, marginBottom: 4 }}>
                            Alíquotas de Referência
                            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-neutral-400)', marginLeft: 8 }}>
                                <LockOutlined /> Calculadas automaticamente
                            </span>
                        </h4>
                        <p style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginBottom: 16 }}>
                            Esses valores são usados automaticamente na precificação dos seus produtos.
                        </p>

                        {isSN && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8, background: 'linear-gradient(135deg, rgba(18,183,106,0.06), rgba(18,183,106,0.02))' }}>
                                    <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>Alíquota Efetiva</div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#12B76A' }}>
                                        {effectiveRate != null ? `${effectiveRate.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%` : '—'}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                                        Inclui ICMS, PIS, COFINS, ISS, IRPJ, CSLL, CPP
                                    </div>
                                </Card>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                    <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>Anexo</div>
                                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                                        {anexo ? anexo.replace('ANEXO_', '') : '—'}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-400)', marginTop: 4 }}>
                                        Faturamento: R$ {revenue12m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </div>
                        )}

                        {isLP && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>ICMS Interno ({stateCode})</div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>{icmsPercent != null ? `${icmsPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%` : '—'}</div>
                                </Card>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>PIS (cumulativo)</div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>0,65%</div>
                                </Card>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>COFINS (cumulativo)</div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>3,00%</div>
                                </Card>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>ISS Municipal</div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>{issPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</div>
                                    <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>Detectado via CNPJ</div>
                                </Card>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>IRPJ (estimativa)</div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>{lpIrpjDisplayPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                                    <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>{lpIrpjPresPct.toLocaleString('pt-BR')}% × 15%</div>
                                </Card>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>CSLL (estimativa)</div>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>{lpCsllDisplayPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                                    <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>{lpCsllPresPct.toLocaleString('pt-BR')}% × 9%</div>
                                </Card>
                                <Card size="small" style={{ textAlign: 'center', borderRadius: 8, gridColumn: lpIrpjAdditionalDisplayPct != null ? 'auto' : undefined }}>
                                    <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>Adicional IRPJ</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: lpIrpjAdditionalDisplayPct != null && lpIrpjAdditionalDisplayPct > 0 ? '#f59e0b' : undefined }}>
                                        {lpIrpjAdditionalDisplayPct == null
                                            ? '—'
                                            : lpIrpjAdditionalDisplayPct === 0
                                                ? '0,00%'
                                                : `${lpIrpjAdditionalDisplayPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>
                                        {lpIrpjAdditionalDisplayPct == null ? 'Informe a receita estimada' : '10% s/ lucro pres. acima de R$ 240K/ano'}
                                    </div>
                                </Card>
                            </div>
                        )}

                        {isLP && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-300)', marginBottom: 8 }}>
                                    IVA DUAL — Alíquotas de Referência
                                    <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-neutral-400)', marginLeft: 8 }}>
                                        Editáveis · usadas para calcular IBS e CBS por produto/serviço
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <Form.Item
                                        name="ibs_reference_pct"
                                        label="IBS — Imposto sobre Bens e Serviços"
                                        style={{ marginBottom: 0 }}
                                    >
                                        <InputNumber
                                            min={0} max={100} step={0.01}
                                            style={{ width: '100%' }}
                                            addonAfter="%"
                                            onChange={(v) => setIbsReferencePct(v ?? null)}
                                            formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                            parser={(v) => Number((v || '0').replace(',', '.'))}
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        name="cbs_reference_pct"
                                        label="CBS — Contribuição sobre Bens e Serviços"
                                        style={{ marginBottom: 0 }}
                                    >
                                        <InputNumber
                                            min={0} max={100} step={0.01}
                                            style={{ width: '100%' }}
                                            addonAfter="%"
                                            onChange={(v) => setCbsReferencePct(v ?? null)}
                                            formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                            parser={(v) => Number((v || '0').replace(',', '.'))}
                                        />
                                    </Form.Item>
                                </div>
                            </div>
                        )}

                        {isSH && (
                            <>
                                <Alert
                                    message="Simples Híbrido — Regime de Precificação Comparativa"
                                    description="⚠️ O Simples Híbrido é um regime de precificação do Precifica Certo e não substitui seu regime tributário legal. Consulte seu contador antes de usar estas alíquotas para fins fiscais."
                                    type="warning"
                                    showIcon
                                    style={{ marginBottom: 16 }}
                                />
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>ICMS Interno ({stateCode})</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>{icmsPercent != null ? `${icmsPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%` : '—'}</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>PIS (não-cumulativo)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>1,65%</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>COFINS (não-cumulativo)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>7,60%</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>ISS Municipal</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>{issPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>IRPJ (estimativa)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>1,20%</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>8% × 15%</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>CSLL (estimativa)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>1,08%</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>12% × 9%</div>
                                    </Card>
                                </div>
                                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <Form.Item name="iss_municipality_rate" label="ISS Municipal (%)">
                                        <InputNumber min={0} max={10} step={0.1} style={{ width: '100%' }} addonAfter="%" formatter={(v) => v != null ? String(v).replace('.', ',') : ''} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                    </Form.Item>
                                    <Form.Item name="lp_estimated_annual_revenue" label="Receita bruta anual estimada (R$)">
                                        <InputNumber min={0} step={10000} style={{ width: '100%' }} formatter={(v) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR')}` : 'R$ 0'} parser={(v) => Number((v || '0').replace('R$', '').replace(/\./g, '').replace(',', '.').trim())} />
                                    </Form.Item>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-300)', marginBottom: 8 }}>
                                        IVA DUAL — Alíquotas de Referência
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <Form.Item name="ibs_reference_pct" label="IBS — Imposto sobre Bens e Serviços" style={{ marginBottom: 0 }}>
                                            <InputNumber min={0} max={100} step={0.01} style={{ width: '100%' }} addonAfter="%" onChange={(v) => setIbsReferencePct(v ?? null)} formatter={(v) => v != null ? String(v).replace('.', ',') : ''} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                        </Form.Item>
                                        <Form.Item name="cbs_reference_pct" label="CBS — Contribuição sobre Bens e Serviços" style={{ marginBottom: 0 }}>
                                            <InputNumber min={0} max={100} step={0.01} style={{ width: '100%' }} addonAfter="%" onChange={(v) => setCbsReferencePct(v ?? null)} formatter={(v) => v != null ? String(v).replace('.', ',') : ''} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                        </Form.Item>
                                    </div>
                                </div>
                            </>
                        )}

                        {isLR && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>ICMS Interno ({stateCode})</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>{icmsPercent != null ? `${icmsPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%` : '—'}</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>PIS (não-cumulativo)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>1,65%</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>COFINS (não-cumulativo)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>7,60%</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>ISS Municipal</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>{issPercent.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>Detectado via CNPJ</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>IRPJ (estimativa)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>1,20%</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>8% × 15%</div>
                                    </Card>
                                    <Card size="small" style={{ textAlign: 'center', borderRadius: 8 }}>
                                        <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>CSLL (estimativa)</div>
                                        <div style={{ fontSize: 18, fontWeight: 700 }}>1,08%</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-neutral-400)' }}>12% × 9%</div>
                                    </Card>
                                </div>
                                <div style={{ marginTop: 16 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-300)', marginBottom: 8 }}>
                                        IVA DUAL — Alíquotas de Referência
                                        <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-neutral-400)', marginLeft: 8 }}>
                                            Editáveis · usadas para calcular IBS e CBS por produto/serviço
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                        <Form.Item
                                            name="ibs_reference_pct"
                                            label="IBS — Imposto sobre Bens e Serviços"
                                            style={{ marginBottom: 0 }}
                                        >
                                            <InputNumber
                                                min={0} max={100} step={0.01}
                                                style={{ width: '100%' }}
                                                addonAfter="%"
                                                onChange={(v) => setIbsReferencePct(v ?? null)}
                                                formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                                parser={(v) => Number((v || '0').replace(',', '.'))}
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            name="cbs_reference_pct"
                                            label="CBS — Contribuição sobre Bens e Serviços"
                                            style={{ marginBottom: 0 }}
                                        >
                                            <InputNumber
                                                min={0} max={100} step={0.01}
                                                style={{ width: '100%' }}
                                                addonAfter="%"
                                                onChange={(v) => setCbsReferencePct(v ?? null)}
                                                formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
                                                parser={(v) => Number((v || '0').replace(',', '.'))}
                                            />
                                        </Form.Item>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}

                <div style={{ marginTop: 20 }}>
                    <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={loading}>
                        Salvar Configurações Fiscais
                    </Button>
                </div>
            </Form>
        </div>
    )
}

const REGIME_TAXABLE_OPTIONS = { NATIONAL_SIMPLE: 'NATIONAL_SIMPLE', MEI: 'MEI' } as const
type REGIME_TAXABLE_TYPES = 'NATIONAL_SIMPLE' | 'MEI'

function Settings() {
    const [messageApi, contextHolder] = message.useMessage()
    const [businessForm] = Form.useForm()
    const [taxForm] = Form.useForm()
    const [calcForm] = Form.useForm()
    const { currentUser, setCurrentUser, refreshUser } = useAuth()
    const [activeTab, setActiveTab] = useState('business')
    const [loading, setLoading] = useState(false)
    const [savingCalc, setSavingCalc] = useState(false)
    const [taxableRegimeInput, setTaxableRegimeInput] = useState<REGIME_TAXABLE_TYPES>('NATIONAL_SIMPLE')

    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [tenantSettings, setTenantSettings] = useState<TenantSettings | null>(null)
    const [brazilianStates, setBrazilianStates] = useState<BrazilianState[]>([])

    const [teamProductive, setTeamProductive] = useState(0)
    const [teamAdministrative, setTeamAdministrative] = useState(0)
    const [hoursPerDay, setHoursPerDay] = useState(8)
    const [daysPerMonth, setDaysPerMonth] = useState(22)
    const [adminHoursPerDay, setAdminHoursPerDay] = useState(8)
    const [adminDaysPerMonth, setAdminDaysPerMonth] = useState(22)

    const getTenantId = async (): Promise<string | null> => fetchTenantId()

    const fetchAll = async () => {
        setLoading(true)
        try {
            const tenantId = await getTenantId()
            if (!tenantId) { messageApi.error('Não foi possível identificar o tenant.'); return }

            const [tenantRes, settingsRes, statesRes] = await Promise.all([
                supabase.from('tenants').select('*').eq('id', tenantId).single(),
                supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).single(),
                supabase.from('brazilian_states').select('*').order('code', { ascending: true }),
            ])

            if (tenantRes.data) {
                setTenant(tenantRes.data)
                businessForm.setFieldsValue({
                    companyName: tenantRes.data.name, cnpj: tenantRes.data.cnpj_cpf,
                    segment: tenantRes.data.segment ?? '',
                    email: tenantRes.data.email, phone: tenantRes.data.phone,
                    cep: tenantRes.data.cep, address: tenantRes.data.street,
                    number: tenantRes.data.number, complement: tenantRes.data.complement,
                    neighborhood: tenantRes.data.neighborhood, city: tenantRes.data.city,
                    state: tenantRes.data.state_code,
                })
            }

            if (settingsRes.data) {
                setTenantSettings(settingsRes.data)
                const s = settingsRes.data
                setTeamProductive(s.num_productive_employees ?? 0)
                setTeamAdministrative(s.num_administrative_employees ?? 0)
                setHoursPerDay(s.monthly_workload ? Math.round(Number(s.monthly_workload) / 22) : 8)
                setDaysPerMonth(22)
                const adminWorkload = Number((s as any).administrative_monthly_workload) || 176
                setAdminHoursPerDay(Math.round(adminWorkload / 22))
                setAdminDaysPerMonth(22)
            }

            if (statesRes.data) setBrazilianStates(statesRes.data)
        } catch (error: any) {
            console.error('Erro ao carregar configurações:', error)
            messageApi.error('Erro ao carregar configurações: ' + (error.message || 'Erro desconhecido'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchAll() }, [])

    useEffect(() => {
        if (!tenantSettings) return
        const s = tenantSettings
        const reg = (s.tax_regime === 'MEI' ? 'MEI' : 'NATIONAL_SIMPLE') as REGIME_TAXABLE_TYPES
        setTaxableRegimeInput(reg)
        calcForm.setFieldsValue({
            calcType: s.calc_type || CALC_TYPE_ENUM.SERVICE,
            unitMeasure: s.workload_unit || 'MINUTES',
            monthlyWorkloadInMinutes: Number(s.monthly_workload) || 0,
            numProductiveSectorEmployee: s.num_productive_employees ?? 1,
            numAdministrativeSectorEmployee: s.num_administrative_employees ?? 0,
            taxableRegime: reg,
            taxableRegimeValue: 0,
        })
    }, [tenantSettings, calcForm])

    async function handleSaveBusiness() {
        try {
            const values = await businessForm.validateFields()
            if (!tenant) return
            const { error } = await supabase.from('tenants').update({
                name: values.companyName, cnpj_cpf: values.cnpj, segment: values.segment || null,
                email: values.email, phone: values.phone, cep: values.cep, street: values.address,
                number: values.number, complement: values.complement,
                neighborhood: values.neighborhood, city: values.city,
                state_code: values.state, updated_at: new Date().toISOString(),
            }).eq('id', tenant.id)
            if (error) throw error
            messageApi.success('Dados da empresa salvos!')
            await fetchAll()
        } catch (error: any) {
            messageApi.error('Erro ao salvar: ' + (error.message || 'Verifique os campos'))
        }
    }

    async function handleSaveTax() {
        try {
            const values = await taxForm.validateFields()
            if (!tenantSettings) return
            const revenueVal = Number(values.revenue_value) || 0
            const revenueType = values.revenue_input_type || 'TOTAL_12M'
            const simplesRevenue12m = revenueType === 'AVERAGE_MONTHLY' ? revenueVal * 12 : revenueVal
            const updateData: Record<string, any> = {
                tax_regime: values.regime,
                state_code: values.state_code,
                simples_revenue_12m: simplesRevenue12m,
                updated_at: new Date().toISOString(),
            }
            if (values.regime === 'SIMPLES_NACIONAL') {
                updateData.simples_anexo = values.simples_anexo || null
            }
            if (values.regime === 'LUCRO_PRESUMIDO') {
                updateData.lucro_presumido_activity = values.lucro_presumido_activity || 'COMERCIO'
                updateData.lp_irpj_presumption_percent = values.lp_irpj_presumption_percent != null
                    ? Number(values.lp_irpj_presumption_percent) / 100
                    : null
                updateData.lp_csll_presumption_percent = values.lp_csll_presumption_percent != null
                    ? Number(values.lp_csll_presumption_percent) / 100
                    : null
                // Persiste o faturamento anual no campo LP para a engine de precificação usar
                updateData.lp_estimated_annual_revenue = simplesRevenue12m > 0 ? simplesRevenue12m : null
            }
            if (values.regime === 'LUCRO_PRESUMIDO_RET') {
                updateData.ret_rate = (Number(values.ret_rate) || 4) / 100
                updateData.ret_activity_type = values.ret_activity_type || 'INCORPORACAO_IMOBILIARIA'
                updateData.ret_iss_separate = true
                updateData.ret_estimated_monthly_revenue = Number(values.ret_estimated_monthly_revenue) || 0
                updateData.iss_municipality_rate = (Number(values.iss_municipality_rate_ret) || 5) / 100
            }
            if (values.regime === 'LUCRO_REAL' || values.regime === 'LUCRO_PRESUMIDO' || values.regime === 'SIMPLES_HIBRIDO') {
                updateData.ibs_reference_pct = values.ibs_reference_pct != null ? Number(values.ibs_reference_pct) : null
                updateData.cbs_reference_pct = values.cbs_reference_pct != null ? Number(values.cbs_reference_pct) : null
            }
            if (values.regime === 'SIMPLES_HIBRIDO') {
                updateData.iss_municipality_rate = values.iss_municipality_rate != null
                    ? (Number(values.iss_municipality_rate) || 0) / 100
                    : null
                updateData.lp_estimated_annual_revenue = simplesRevenue12m > 0 ? simplesRevenue12m : null
            }
            const { error } = await supabase.from('tenant_settings').update(updateData).eq('id', tenantSettings.id)
            if (error) throw error
            messageApi.success('Configurações fiscais salvas!')
            await fetchAll()
            // Refresh auth context to update taxableRegimeValue (calculated from tenant_settings)
            await refreshUser()
        } catch (error: any) {
            messageApi.error('Erro ao salvar: ' + (error.message || 'Verifique os campos'))
        }
    }

    async function handleSaveTeam() {
        try {
            if (!tenantSettings) return
            const { error } = await supabase.from('tenant_settings').update({
                num_productive_employees: teamProductive,
                num_commercial_employees: 0,
                num_administrative_employees: teamAdministrative,
                monthly_workload: hoursPerDay * daysPerMonth,
                administrative_monthly_workload: adminHoursPerDay * adminDaysPerMonth,
                updated_at: new Date().toISOString(),
            }).eq('id', tenantSettings.id)
            if (error) throw error
            messageApi.success('Equipe atualizada!')
            await refreshUser()
        } catch (error: any) {
            messageApi.error('Erro ao salvar: ' + (error.message || 'Erro'))
        }
    }

    // Map frontend enum → DB values (DB uses Portuguese names)
    const calcTypeToDb: Record<string, string> = {
        [CALC_TYPE_ENUM.INDUSTRIALIZATION]: 'INDUSTRIALIZACAO',
        [CALC_TYPE_ENUM.SERVICE]: 'SERVICO',
        [CALC_TYPE_ENUM.RESALE]: 'REVENDA',
        // Also accept DB values directly (when loaded from DB without change)
        INDUSTRIALIZACAO: 'INDUSTRIALIZACAO',
        SERVICO: 'SERVICO',
        REVENDA: 'REVENDA',
    }

    async function handleSaveCalc() {
        try {
            await calcForm.validateFields()
            setSavingCalc(true)
            const values = calcForm.getFieldsValue()
            const tenantId = await getTenantId()
            if (!tenantId) {
                messageApi.error('Não foi possível identificar o tenant.')
                return
            }
            const isIndustrialization = values.calcType === CALC_TYPE_ENUM.INDUSTRIALIZATION || values.calcType === 'INDUSTRIALIZACAO'
            const isResale = values.calcType === CALC_TYPE_ENUM.RESALE || values.calcType === 'REVENDA'
            let unitMeasure = values.unitMeasure
            if (isIndustrialization) unitMeasure = UNIT_MEASURE_ENUM.HOURS
            if (isResale) unitMeasure = UNIT_MEASURE_ENUM.MINUTES

            const dbCalcType = calcTypeToDb[values.calcType] || values.calcType

            const { error: settingsError } = await supabase
                .from('tenant_settings')
                .update({
                    calc_type: dbCalcType,
                    workload_unit: unitMeasure,
                    monthly_workload: Number(values.monthlyWorkloadInMinutes) || 0,
                    num_productive_employees: Number(values.numProductiveSectorEmployee) || 1,
                    num_commercial_employees: 0,
                    num_administrative_employees: Number(values.numAdministrativeSectorEmployee) || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('tenant_id', tenantId)
            if (settingsError) throw settingsError

            const { error: expenseError } = await supabase
                .from('tenant_expense_config')
                .update({
                    taxable_regime_percent: Number(values.taxableRegimeValue) || 0,
                    updated_at: new Date().toISOString(),
                })
                .eq('tenant_id', tenantId)
            if (expenseError) throw expenseError

            if (currentUser) {
                setCurrentUser({
                    ...currentUser,
                    calcType: values.calcType,
                    unitMeasure,
                    monthlyWorkloadInMinutes: Number(values.monthlyWorkloadInMinutes) || 0,
                    numProductiveSectorEmployee: Number(values.numProductiveSectorEmployee) || 1,
                    numComercialSectorEmployee: 0,
                    numAdministrativeSectorEmployee: Number(values.numAdministrativeSectorEmployee) || 0,
                    taxableRegime: values.taxableRegime,
                    taxableRegimeValue: Number(values.taxableRegimeValue) || 0,
                })
            }
            messageApi.success('Configurações de cálculo salvas!')
            await fetchAll()
            await refreshUser()
        } catch (err: any) {
            messageApi.error(err?.message || 'Preencha todos os campos corretamente.')
        } finally {
            setSavingCalc(false)
        }
    }


    const totalMonthlyHours = hoursPerDay * daysPerMonth
    const adminTotalMonthlyHours = adminHoursPerDay * adminDaysPerMonth
    const calcTypeValue = Form.useWatch('calcType', calcForm)
    const isIndustrialization = calcTypeValue === CALC_TYPE_ENUM.INDUSTRIALIZATION
    const isResale = calcTypeValue === CALC_TYPE_ENUM.RESALE
    const isService = calcTypeValue === CALC_TYPE_ENUM.SERVICE

    return (
        <Layout title={PAGE_TITLES.SETTINGS} subtitle="Configure sua empresa, impostos, equipe e integrações">
            {contextHolder}
            <div className="pc-card" style={{ minHeight: 500 }}>
                {loading && !tenant ? (
                    <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
                ) : (
                    <Tabs activeKey={activeTab} onChange={setActiveTab} tabPosition="left" style={{ minHeight: 450 }} destroyInactiveTabPane items={[
                        {
                            key: 'business',
                            label: (<span><ShopOutlined style={{ marginRight: 6 }} />Empresa</span>),
                            children: (
                                <div style={{ maxWidth: 680 }}>
                                    <p style={{ color: 'var(--color-neutral-500)', fontSize: 13, marginBottom: 20 }}>Informações principais da sua empresa.</p>
                                    <Form form={businessForm} layout="vertical">
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                            <Form.Item name="companyName" label="Razão Social" rules={[{ required: true }]}><Input /></Form.Item>
                                            <Form.Item name="cnpj" label="CNPJ"><Input placeholder="00.000.000/0000-00" /></Form.Item>
                                        </div>
                                        <Form.Item name="segment" label="Segmento"><Input placeholder="Ex: Beleza e Estética" /></Form.Item>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                            <Form.Item name="email" label="Email"><Input /></Form.Item>
                                            <Form.Item name="phone" label="Telefone"><Input placeholder="(00) 00000-0000" /></Form.Item>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                            <Form.Item name="cep" label="CEP"><Input /></Form.Item>
                                            <Form.Item name="neighborhood" label="Bairro"><Input /></Form.Item>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
                                            <Form.Item name="address" label="Rua"><Input /></Form.Item>
                                            <Form.Item name="number" label="Número"><Input /></Form.Item>
                                            <Form.Item name="complement" label="Complemento"><Input /></Form.Item>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                            <Form.Item name="city" label="Cidade"><Input /></Form.Item>
                                            <Form.Item name="state" label="Estado">
                                                <Select showSearch optionFilterProp="children">
                                                    {brazilianStates.map(s => <Select.Option key={s.code} value={s.code?.trim()}>{s.code?.trim()} - {s.name}</Select.Option>)}
                                                </Select>
                                            </Form.Item>
                                        </div>
                                        <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveBusiness} loading={loading}>Salvar Dados</Button>
                                    </Form>
                                </div>
                            ),
                        },
                        {
                            key: 'tax',
                            forceRender: true,
                            label: (<span><BankOutlined style={{ marginRight: 6 }} />Fiscal / Tributário</span>),
                            children: <TaxTabContent taxForm={taxForm} brazilianStates={brazilianStates} tenantSettings={tenantSettings} loading={loading} onSave={handleSaveTax} />,
                        },
                        {
                            key: 'team',
                            label: (<span><TeamOutlined style={{ marginRight: 6 }} />Equipe</span>),
                            children: (
                                <div style={{ maxWidth: 720 }}>
                                    <p style={{ color: 'var(--color-neutral-500)', fontSize: 13, marginBottom: 20 }}>Configure a equipe produtiva e administrativa com suas respectivas cargas horárias.</p>

                                    {/* Equipe Produtiva */}
                                    <Card size="small" style={{ borderRadius: 12, marginBottom: 20, border: '1px solid #D1FAE5', background: 'linear-gradient(135deg, rgba(18,183,106,0.04), rgba(18,183,106,0.01))' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                            <TeamOutlined style={{ fontSize: 18, color: '#22C55E' }} />
                                            <h4 style={{ fontWeight: 600, margin: 0, color: '#e2e8f0' }}>Equipe Produtiva</h4>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 4 }}>Quantidade de pessoas</div>
                                                <InputNumber min={0} value={teamProductive} onChange={v => setTeamProductive(v ?? 0)} style={{ width: '100%' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 4 }}>Horas por dia</div>
                                                <InputNumber min={1} max={24} value={hoursPerDay} onChange={v => setHoursPerDay(v ?? 8)} style={{ width: '100%' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 4 }}>Dias por mês</div>
                                                <InputNumber min={1} max={31} value={daysPerMonth} onChange={v => setDaysPerMonth(v ?? 22)} style={{ width: '100%' }} />
                                            </div>
                                        </div>
                                        <div style={{ padding: '8px 12px', background: 'var(--color-neutral-50)', borderRadius: 6 }}>
                                            <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Total mensal por pessoa:</span>
                                            <strong style={{ marginLeft: 8 }}>{totalMonthlyHours} horas</strong>
                                        </div>
                                    </Card>

                                    {/* Equipe Administrativa */}
                                    <Card size="small" style={{ borderRadius: 12, marginBottom: 20, border: '1px solid #FEF0C7', background: 'linear-gradient(135deg, rgba(247,144,9,0.04), rgba(247,144,9,0.01))' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                            <TeamOutlined style={{ fontSize: 18, color: '#F79009' }} />
                                            <h4 style={{ fontWeight: 600, margin: 0, color: '#e2e8f0' }}>Equipe Administrativa</h4>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 4 }}>Quantidade de pessoas</div>
                                                <InputNumber min={0} value={teamAdministrative} onChange={v => setTeamAdministrative(v ?? 0)} style={{ width: '100%' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 4 }}>Horas por dia</div>
                                                <InputNumber min={1} max={24} value={adminHoursPerDay} onChange={v => setAdminHoursPerDay(v ?? 8)} style={{ width: '100%' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginBottom: 4 }}>Dias por mês</div>
                                                <InputNumber min={1} max={31} value={adminDaysPerMonth} onChange={v => setAdminDaysPerMonth(v ?? 22)} style={{ width: '100%' }} />
                                            </div>
                                        </div>
                                        <div style={{ padding: '8px 12px', background: 'var(--color-neutral-50)', borderRadius: 6 }}>
                                            <span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>Total mensal por pessoa:</span>
                                            <strong style={{ marginLeft: 8 }}>{adminTotalMonthlyHours} horas</strong>
                                        </div>
                                    </Card>

                                    <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveTeam} loading={loading}>Salvar Equipe</Button>
                                </div>
                            ),
                        },
                        {
                            key: 'calc',
                            label: (<span><SettingOutlined style={{ marginRight: 6 }} />Configurações de Cálculo</span>),
                            children: (
                                <div style={{ maxWidth: 580 }}>
                                    <p style={{ color: 'var(--color-neutral-500)', fontSize: 13, marginBottom: 20 }}>
                                        Configure o tipo de cálculo, mão de obra e regime tributário utilizados na precificação dos seus produtos.
                                    </p>
                                    <Form form={calcForm} layout="vertical">
                                        <Form.Item name="calcType" label="Segmentação" rules={[{ required: true, message: 'Selecione a segmentação' }]}>
                                            <Select placeholder="Selecione...">
                                                <Select.Option value={CALC_TYPE_ENUM.INDUSTRIALIZATION}>Industrialização</Select.Option>
                                                <Select.Option value={CALC_TYPE_ENUM.SERVICE}>Prestação de Serviço</Select.Option>
                                                <Select.Option value={CALC_TYPE_ENUM.RESALE}>Revenda</Select.Option>
                                            </Select>
                                        </Form.Item>
                                        {(isIndustrialization || isService) && (
                                            <>
                                                <Divider orientation="left" style={{ fontSize: 14 }}>Mão de Obra</Divider>
                                                {isService && (
                                                    <Form.Item name="unitMeasure" label="Unidade de medida" rules={[{ required: true, message: 'Selecione a unidade' }]}>
                                                        <Select placeholder="Selecione...">
                                                            <Select.Option value="MINUTES">Minutos</Select.Option>
                                                            <Select.Option value="HOURS">Horas</Select.Option>
                                                            <Select.Option value="DAYS">Dias</Select.Option>
                                                            <Select.Option value="ACTIVITIES">Atendimento</Select.Option>
                                                        </Select>
                                                    </Form.Item>
                                                )}
                                                <Form.Item
                                                    name="monthlyWorkloadInMinutes"
                                                    label={isIndustrialization ? 'Horas produtivas mensais por colaborador' : 'Quantidade produtiva mensal por colaborador'}
                                                    rules={[{ required: true, message: 'Insira um valor maior que 0' }]}
                                                >
                                                    <InputNumber min={0} style={{ width: '100%' }} addonAfter={isIndustrialization ? 'Horas' : undefined} />
                                                </Form.Item>
                                            </>
                                        )}
                                        <Divider orientation="left" style={{ fontSize: 14 }}>Colaboradores</Divider>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                            <Form.Item name="numProductiveSectorEmployee" label="Setor Produtivo" rules={[{ required: true }]}>
                                                <InputNumber min={0} style={{ width: '100%' }} />
                                            </Form.Item>
                                            <Form.Item name="numAdministrativeSectorEmployee" label="Setor Administrativo" rules={[{ required: true }]}>
                                                <InputNumber min={0} style={{ width: '100%' }} />
                                            </Form.Item>
                                        </div>
                                        {/* Regime Tributário e Imposto % configurados em Configurações > Fiscal/Tributário */}
                                        <Form.Item name="taxableRegime" hidden><Input /></Form.Item>
                                        <Form.Item name="taxableRegimeValue" hidden initialValue={0}><InputNumber /></Form.Item>
                                        <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveCalc} loading={savingCalc} style={{ marginTop: 8 }}>
                                            Salvar Configurações
                                        </Button>
                                    </Form>
                                </div>
                            ),
                        },
                    ]} />
                )}
            </div>
        </Layout>
    )
}

export default Settings
