import { Button, DatePicker, InputNumber, Radio } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { formatBRL as _formatBRLCentral } from '@/utils/formatters'

export type InstallmentPresetValue =
    | 'customizado'
    | '30'
    | '30_60'
    | '30_60_90'
    | '30_60_90_120'
    | '30_60_90_120_150'

export interface InstallmentRow {
    date: Dayjs | null
    amount: number
}

export const INSTALLMENT_PRESETS: { value: InstallmentPresetValue; label: string }[] = [
    { value: 'customizado', label: 'Cheque pré-datado' },
    { value: '30', label: '30' },
    { value: '30_60', label: '30/60' },
    { value: '30_60_90', label: '30/60/90' },
    { value: '30_60_90_120', label: '30/60/90/120' },
    { value: '30_60_90_120_150', label: '30/60/90/120/150' },
]

export function buildInstallmentsByPreset(preset: string, baseDate?: Dayjs): InstallmentRow[] {
    const today = baseDate || dayjs()
    if (preset === '30') return [{ date: today.add(30, 'day'), amount: 0 }]
    if (preset === '30_60') return [
        { date: today.add(30, 'day'), amount: 0 },
        { date: today.add(60, 'day'), amount: 0 },
    ]
    if (preset === '30_60_90') return [
        { date: today.add(30, 'day'), amount: 0 },
        { date: today.add(60, 'day'), amount: 0 },
        { date: today.add(90, 'day'), amount: 0 },
    ]
    if (preset === '30_60_90_120') return [
        { date: today.add(30, 'day'), amount: 0 },
        { date: today.add(60, 'day'), amount: 0 },
        { date: today.add(90, 'day'), amount: 0 },
        { date: today.add(120, 'day'), amount: 0 },
    ]
    if (preset === '30_60_90_120_150') return [
        { date: today.add(30, 'day'), amount: 0 },
        { date: today.add(60, 'day'), amount: 0 },
        { date: today.add(90, 'day'), amount: 0 },
        { date: today.add(120, 'day'), amount: 0 },
        { date: today.add(150, 'day'), amount: 0 },
    ]
    return [{ date: null, amount: 0 }]
}

export function distributeInstallmentAmounts(rows: InstallmentRow[], total: number): InstallmentRow[] {
    const n = rows.length
    if (n === 0) return rows
    const amt = total > 0 ? Math.round((total / n) * 100) / 100 : 0
    return rows.map((r) => ({ ...r, amount: amt }))
}

const formatBRL = _formatBRLCentral

interface PaymentWithInstallmentsProps {
    preset: InstallmentPresetValue
    onPresetChange: (p: InstallmentPresetValue) => void
    rows: InstallmentRow[]
    onRowsChange: (rows: InstallmentRow[]) => void
    total: number
    title?: string
    withEntry?: boolean
    onWithEntryChange?: (v: boolean) => void
    baseDate?: Dayjs
}

export function PaymentWithInstallments({
    preset,
    onPresetChange,
    rows,
    onRowsChange,
    total,
    title = 'Datas e valores de recebimento',
    withEntry = false,
    onWithEntryChange,
    baseDate,
}: PaymentWithInstallmentsProps) {
    const handlePresetChange = (p: InstallmentPresetValue) => {
        onPresetChange(p)
        const insts = buildInstallmentsByPreset(p, baseDate)
        onRowsChange(distributeInstallmentAmounts(insts, total))
    }

    const handleRowDateChange = (idx: number, d: Dayjs | null) => {
        onRowsChange(rows.map((r, i) => (i === idx ? { ...r, date: d } : r)))
    }

    const handleRowAmountChange = (idx: number, v: number | string | null) => {
        onRowsChange(rows.map((r, i) => (i === idx ? { ...r, amount: Number(v) || 0 } : r)))
    }

    const handleRowRemove = (idx: number) => {
        onRowsChange(rows.filter((_, i) => i !== idx))
    }

    const handleRowAdd = () => {
        onRowsChange([...rows, { date: null, amount: 0 }])
    }

    const sumRows = rows.reduce((s, r) => s + (r.amount || 0), 0)

    return (
        <div
            style={{
                marginBottom: 16,
                padding: 12,
                background: 'rgba(96, 165, 250, 0.08)',
                border: '1px solid rgba(96,165,250,0.25)',
                borderRadius: 8,
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 8 }}>{title}</div>
            {onWithEntryChange && (
                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Radio.Group
                        value={withEntry ? 'entrada' : 'parcelas'}
                        onChange={(e) => onWithEntryChange(e.target.value === 'entrada')}
                        size="small"
                    >
                        <Radio.Button value="parcelas">Parcelamento</Radio.Button>
                        <Radio.Button value="entrada">Com Entrada</Radio.Button>
                    </Radio.Group>
                </div>
            )}
            <div style={{ marginBottom: 10 }}>
                <Radio.Group
                    value={preset}
                    onChange={(e) => handlePresetChange(e.target.value as InstallmentPresetValue)}
                    size="small"
                >
                    {INSTALLMENT_PRESETS.map((p) => (
                        <Radio.Button key={p.value} value={p.value}>
                            {p.label}
                        </Radio.Button>
                    ))}
                </Radio.Group>
            </div>
            {rows.map((item, idx) => {
                const rowLabel = withEntry
                    ? (idx === 0 ? 'Entrada' : `Parcela ${idx}`)
                    : `Parcela ${idx + 1}`
                return (
                <div
                    key={idx}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: withEntry ? '80px 1fr 1fr auto' : '1fr 1fr auto',
                        gap: 8,
                        marginBottom: 8,
                        alignItems: 'center',
                    }}
                >
                    {withEntry && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: idx === 0 ? '#34d399' : '#93c5fd', whiteSpace: 'nowrap' }}>
                            {rowLabel}
                        </span>
                    )}
                    <DatePicker
                        placeholder="Data de recebimento"
                        format="DD/MM/YYYY"
                        value={item.date}
                        onChange={(d) => handleRowDateChange(idx, d)}
                        style={{ width: '100%' }}
                    />
                    <InputNumber
                        min={0}
                        step={0.01}
                        precision={2}
                        style={{ width: '100%' }}
                        placeholder="Valor (R$)"
                        value={item.amount || undefined}
                        addonBefore="R$"
                        onChange={(v) => handleRowAmountChange(idx, v)}
                    />
                    <Button
                        danger
                        size="small"
                        type="text"
                        disabled={preset !== 'customizado' || rows.length === 1}
                        onClick={() => handleRowRemove(idx)}
                    >
                        ✕
                    </Button>
                </div>
                )
            })}
            {preset === 'customizado' && (
                <Button type="dashed" size="small" style={{ width: '100%' }} onClick={handleRowAdd}>
                    + Adicionar data/valor
                </Button>
            )}
            {rows.length > 1 && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                    Total parcelas:{' '}
                    <strong style={{ color: '#e2e8f0' }}>{formatBRL(sumRows)}</strong>
                </div>
            )}
        </div>
    )
}
