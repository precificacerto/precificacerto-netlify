import React, { useState, useEffect, useMemo } from 'react'
import { Button, Table, Tag, Space, DatePicker, message, Empty, Tooltip, Modal, InputNumber, Input, Popconfirm } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/pt-br'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
// Onda 3 / CRÍT-perf: exportTableToPdf (jsPDF ~100KB) via dynamic import no handler.
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    PointElement,
    LineElement,
    Title,
    Tooltip as ChartTooltip,
    Legend,
    Filler,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
    CalendarOutlined,
    TeamOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    TrophyOutlined,
    DollarOutlined,
    DeleteOutlined,
    EditOutlined,
    RightOutlined,
    DownOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useDevice } from '@/contexts/device.context'
import { PAGE_SIZE } from '@/constants/pagination'

dayjs.extend(isoWeek)
dayjs.locale('pt-br')

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Title, ChartTooltip, Legend, Filler)

interface EmployeeStats {
    id: string
    name: string
    position: string
    totalServices: number
    completed: number
    cancelled: number
    scheduled: number
    totalHours: number
    completionRate: number
}

interface DayStats {
    date: string
    dayName: string
    total: number
    completed: number
    cancelled: number
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
    SCHEDULED: { label: 'Agendado', color: 'warning' },
    CONFIRMED: { label: 'Confirmado', color: 'processing' },
    COMPLETED: { label: 'Concluído', color: 'success' },
    CANCELLED: { label: 'Cancelado', color: 'default' },
}

function Reports() {
    const { canView } = usePermissions()
    if (!canView(MODULES.REPORTS)) {
        return (
            <Layout title={PAGE_TITLES.REPORTS}>
                <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
            </Layout>
        )
    }

    const { isMobile } = useDevice()
    const [loading, setLoading] = useState(false)
    const [messageApi, contextHolder] = message.useMessage()
    const [periodType, setPeriodType] = useState<'week' | 'month' | 'custom'>('week')
    // Frente 3 (mobile): controla quais funcionários estão expandidos na lista compacta
    const [expandedEmp, setExpandedEmp] = useState<Set<string>>(new Set())

    // Edit/Delete lançamento states
    const [editLancOpen, setEditLancOpen] = useState(false)
    const [editLancEvt, setEditLancEvt] = useState<any>(null)
    const [editLancEntries, setEditLancEntries] = useState<any[]>([])
    const [editLancLoading, setEditLancLoading] = useState(false)
    const [editLancAmounts, setEditLancAmounts] = useState<Record<string, number>>({})
    const [editLancDescs, setEditLancDescs] = useState<Record<string, string>>({})
    const [savingLanc, setSavingLanc] = useState(false)
    const [startDate, setStartDate] = useState(dayjs().startOf('isoWeek'))
    const [endDate, setEndDate] = useState(dayjs().endOf('isoWeek'))
    const [events, setEvents] = useState<any[]>([])
    const [employees, setEmployees] = useState<any[]>([])
    const [reportExportModalOpen, setReportExportModalOpen] = useState(false)

    useEffect(() => {
        if (periodType === 'week') {
            setStartDate(dayjs().startOf('isoWeek'))
            setEndDate(dayjs().endOf('isoWeek'))
        } else if (periodType === 'month') {
            setStartDate(dayjs().startOf('month'))
            setEndDate(dayjs().endOf('month'))
        }
    }, [periodType])

    useEffect(() => {
        fetchReportData()
    }, [startDate, endDate])

    async function fetchReportData() {
        setLoading(true)
        try {
            const tenantId = await getTenantId()
            if (!tenantId) return

            const [evtsRes, empsRes] = await Promise.all([
                supabase
                    .from('calendar_events')
                    .select('*, employee:employees(id, name, position), customer:customers(id, name)')
                    .gte('start_time', startDate.toISOString())
                    .lte('start_time', endDate.toISOString())
                    .order('start_time', { ascending: true }),
                supabase
                    .from('employees')
                    .select('id, name, position, status')
                    .eq('status', 'ACTIVE')
                    .order('name'),
            ])

            setEvents(evtsRes.data || [])
            setEmployees(empsRes.data || [])
        } catch (error: any) {
            messageApi.error('Erro ao carregar relatório: ' + (error.message || ''))
        } finally {
            setLoading(false)
        }
    }

    const totalServices = events.length
    const completedServices = events.filter(e => e.status === 'COMPLETED').length
    const cancelledServices = events.filter(e => e.status === 'CANCELLED').length
    const completionRate = totalServices > 0 ? Math.round((completedServices / totalServices) * 100) : 0

    const totalHours = useMemo(() => {
        return events.reduce((acc, e) => {
            const diff = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3600000
            return acc + diff
        }, 0)
    }, [events])

    const employeeStats = useMemo<EmployeeStats[]>(() => {
        const map: Record<string, EmployeeStats> = {}
        for (const evt of events) {
            const emp = evt.employee
            if (!emp) continue
            if (!map[emp.id]) {
                map[emp.id] = {
                    id: emp.id,
                    name: emp.name,
                    position: emp.position || '—',
                    totalServices: 0,
                    completed: 0,
                    cancelled: 0,
                    scheduled: 0,
                    totalHours: 0,
                    completionRate: 0,
                }
            }
            map[emp.id].totalServices++
            const h = (new Date(evt.end_time).getTime() - new Date(evt.start_time).getTime()) / 3600000
            map[emp.id].totalHours += h
            if (evt.status === 'COMPLETED') map[emp.id].completed++
            else if (evt.status === 'CANCELLED') map[emp.id].cancelled++
            else map[emp.id].scheduled++
        }
        for (const k of Object.keys(map)) {
            const s = map[k]
            s.completionRate = s.totalServices > 0 ? Math.round((s.completed / s.totalServices) * 100) : 0
        }
        return Object.values(map).sort((a, b) => b.totalServices - a.totalServices)
    }, [events])

    const dayStats = useMemo<DayStats[]>(() => {
        const map: Record<string, DayStats> = {}
        for (const evt of events) {
            const d = dayjs(evt.start_time).format('YYYY-MM-DD')
            if (!map[d]) {
                map[d] = {
                    date: d,
                    dayName: dayjs(evt.start_time).format('ddd DD/MM'),
                    total: 0,
                    completed: 0,
                    cancelled: 0,
                }
            }
            map[d].total++
            if (evt.status === 'COMPLETED') map[d].completed++
            else if (evt.status === 'CANCELLED') map[d].cancelled++
        }
        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
    }, [events])

    const servicesByStatus = useMemo(() => {
        const map: Record<string, number> = {}
        for (const evt of events) {
            map[evt.status] = (map[evt.status] || 0) + 1
        }
        return map
    }, [events])

    const empColumns: ColumnsType<EmployeeStats> = [
        {
            title: '#',
            key: 'rank',
            width: 50,
            render: (_, __, i) => (
                <span style={{ fontWeight: 700, color: i < 3 ? '#F79009' : '#98A2B3' }}>{i + 1}</span>
            ),
        },
        {
            title: 'Funcionário',
            dataIndex: 'name',
            key: 'name',
            render: (name, r) => (
                <div>
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    <div style={{ fontSize: 11, color: '#98A2B3' }}>{r.position}</div>
                </div>
            ),
        },
        { title: 'Serviços', dataIndex: 'totalServices', key: 'totalServices', align: 'center' as const, sorter: (a: EmployeeStats, b: EmployeeStats) => a.totalServices - b.totalServices },
        { title: 'Concluídos', dataIndex: 'completed', key: 'completed', align: 'center' as const, render: (v: number) => <Tag color="success">{v}</Tag> },
        { title: 'Cancelados', dataIndex: 'cancelled', key: 'cancelled', align: 'center' as const, render: (v: number) => v > 0 ? <Tag color="default">{v}</Tag> : <span style={{ color: '#98A2B3' }}>0</span> },
        {
            title: 'Horas',
            dataIndex: 'totalHours',
            key: 'totalHours',
            align: 'center' as const,
            render: (v: number) => `${v.toFixed(1)}h`,
            sorter: (a: EmployeeStats, b: EmployeeStats) => a.totalHours - b.totalHours,
        },
        {
            title: 'Taxa Conclusão',
            dataIndex: 'completionRate',
            key: 'completionRate',
            align: 'center' as const,
            render: (v: number) => (
                <Tag color={v >= 80 ? 'success' : v >= 50 ? 'warning' : 'error'}>{v}%</Tag>
            ),
            sorter: (a: EmployeeStats, b: EmployeeStats) => a.completionRate - b.completionRate,
        },
    ]

    const eventListColumns: ColumnsType<any> = [
        {
            title: 'Código',
            key: 'agenda_code',
            width: 110,
            render: (_, r) => r.agenda_code ? (
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#7A5AF8', fontWeight: 600 }}>
                    {r.agenda_code}
                </span>
            ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>,
        },
        {
            title: 'Data / Hora',
            key: 'datetime',
            width: 140,
            render: (_, r) => (
                <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{dayjs(r.start_time).format('DD/MM/YYYY')}</div>
                    <div style={{ fontSize: 11, color: '#98A2B3' }}>
                        {dayjs(r.start_time).format('HH:mm')} — {dayjs(r.end_time).format('HH:mm')}
                    </div>
                </div>
            ),
        },
        { title: 'Serviço', dataIndex: 'title', key: 'title', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
        {
            title: 'Funcionário',
            key: 'employee',
            render: (_, r) => r.employee?.name || '—',
        },
        {
            title: 'Cliente',
            key: 'customer',
            render: (_, r) => r.customer?.name || '—',
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (s: string) => <Tag color={STATUS_MAP[s]?.color || 'default'}>{STATUS_MAP[s]?.label || s}</Tag>,
        },
        {
            title: 'Valor',
            key: 'amount_charged',
            align: 'right' as const,
            render: (_: any, r: any) => r.amount_charged != null && r.amount_charged > 0
                ? <span style={{ fontWeight: 600, color: '#12B76A' }}>{fmt(Number(r.amount_charged))}</span>
                : <span style={{ color: '#94a3b8' }}>—</span>,
        },
        {
            title: 'Ações',
            key: 'actions',
            width: 110,
            render: (_: any, r: any) => r.status === 'COMPLETED' ? (
                <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditLanc(r)}
                >
                    Editar $
                </Button>
            ) : null,
        },
    ]

    const chartColors = ['#12B76A', '#F04438', '#2E90FA', '#F79009', '#7A5AF8', '#667085']

    const barData = {
        labels: dayStats.map(d => d.dayName),
        datasets: [
            {
                label: 'Concluídos',
                data: dayStats.map(d => d.completed),
                backgroundColor: 'rgba(18, 183, 106, 0.75)',
                borderRadius: 4,
            },
            {
                label: 'Cancelados',
                data: dayStats.map(d => d.cancelled),
                backgroundColor: 'rgba(240, 68, 56, 0.6)',
                borderRadius: 4,
            },
            {
                label: 'Agendados / Confirmados',
                data: dayStats.map(d => d.total - d.completed - d.cancelled),
                backgroundColor: 'rgba(46, 144, 250, 0.6)',
                borderRadius: 4,
            },
        ],
    }

    const barOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'top' as const, labels: { usePointStyle: true, font: { size: 12 }, color: '#94a3b8' } },
        },
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, grid: { color: 'rgba(228,231,236,0.5)' }, ticks: { stepSize: 1 } },
        },
    }

    const statusLabels = Object.keys(servicesByStatus)
    const doughnutData = {
        labels: statusLabels.map(s => STATUS_MAP[s]?.label || s),
        datasets: [{
            data: statusLabels.map(s => servicesByStatus[s]),
            backgroundColor: statusLabels.map((s, i) => {
                if (s === 'COMPLETED') return 'rgba(18, 183, 106, 0.8)'
                if (s === 'CANCELLED') return 'rgba(102, 112, 133, 0.6)'
                if (s === 'CONFIRMED') return 'rgba(46, 144, 250, 0.8)'
                return 'rgba(247, 144, 9, 0.8)'
            }),
            borderWidth: 2,
            borderColor: '#FFF',
        }],
    }

    const empBarData = {
        labels: employeeStats.slice(0, 8).map(e => e.name.split(' ')[0]),
        datasets: [
            {
                label: 'Serviços',
                data: employeeStats.slice(0, 8).map(e => e.totalServices),
                backgroundColor: employeeStats.slice(0, 8).map((_, i) => chartColors[i % chartColors.length]),
                borderRadius: 6,
            },
        ],
    }

    const empBarOptions = {
        indexAxis: 'y' as const,
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color: 'rgba(228,231,236,0.4)' }, ticks: { stepSize: 1 } },
            y: { grid: { display: false } },
        },
    }

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)

    async function openEditLanc(ev: any) {
        setEditLancEvt(ev)
        setEditLancEntries([])
        setEditLancLoading(true)
        setEditLancOpen(true)
        const { data } = await (supabase as any).from('cash_entries')
            .select('id, amount, description, due_date, paid_date, payment_method, type')
            .eq('origin_id', ev.id)
            .eq('is_active', true)
            .order('due_date')
        const entries = data || []
        setEditLancEntries(entries)
        const amounts: Record<string, number> = {}
        const descs: Record<string, string> = {}
        for (const e of entries) { amounts[e.id] = Number(e.amount); descs[e.id] = e.description || '' }
        setEditLancAmounts(amounts)
        setEditLancDescs(descs)
        setEditLancLoading(false)
    }

    async function saveEditLanc(entryId: string) {
        setSavingLanc(true)
        try {
            const res = await fetch('/api/cash-entries/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: entryId, amount: editLancAmounts[entryId], description: editLancDescs[entryId] }),
            })
            if (!res.ok) throw new Error((await res.json()).error)

            const updatedEntries = editLancEntries.map(e =>
                e.id === entryId ? { ...e, amount: editLancAmounts[entryId], description: editLancDescs[entryId] } : e
            )
            setEditLancEntries(updatedEntries)

            // Sincroniza amount_charged no evento da agenda com o novo total dos lançamentos
            if (editLancEvt) {
                const newTotal = updatedEntries
                    .filter(e => e.type === 'INCOME')
                    .reduce((sum, e) => sum + Number(e.amount), 0)
                await (supabase as any).from('calendar_events')
                    .update({ amount_charged: newTotal })
                    .eq('id', editLancEvt.id)
            }

            // Recalcula hub para atualizar MO produtiva por minuto na precificação
            const tid = await getTenantId()
            if (tid) mergeExpenseConfig(tid).catch(() => {})

            messageApi.success('Lançamento editado! HUB e DRE atualizados.')
        } catch (e: any) { messageApi.error(e.message) }
        finally { setSavingLanc(false) }
    }

    async function deleteEditLanc(entryId: string) {
        setSavingLanc(true)
        try {
            const res = await fetch('/api/delete/cash-entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: entryId }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            messageApi.success('Lançamento excluído! HUB e DRE atualizados.')
            setEditLancEntries(prev => prev.filter(e => e.id !== entryId))
        } catch (e: any) { messageApi.error(e.message) }
        finally { setSavingLanc(false) }
    }

    function exportCSV() {
        if (events.length === 0) { messageApi.warning('Nenhum dado para exportar.'); return }
        const header = 'Data,Horário,Serviço,Funcionário,Cliente,Status,Duração (min)\n'
        const rows = events.map((e: any) => {
            const dur = Math.round((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000)
            return [
                dayjs(e.start_time).format('DD/MM/YYYY'),
                dayjs(e.start_time).format('HH:mm'),
                `"${e.title}"`,
                `"${e.employee?.name || ''}"`,
                `"${e.customer?.name || ''}"`,
                STATUS_MAP[e.status]?.label || e.status,
                dur,
            ].join(',')
        }).join('\n')

        const csvContent = '\ufeff' + header + rows
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `relatorio-agenda-${startDate.format('YYYY-MM-DD')}-a-${endDate.format('YYYY-MM-DD')}.csv`
        link.click()
        URL.revokeObjectURL(url)
        messageApi.success('CSV exportado!')
    }

    async function exportReportPdf() {
        if (events.length === 0) { messageApi.warning('Nenhum dado para exportar.'); return }
        const headers = ['Data', 'Horário', 'Serviço', 'Funcionário', 'Cliente', 'Status', 'Duração (min)']
        const rows = events.map((e: any) => {
            const dur = Math.round((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000)
            return [
                dayjs(e.start_time).format('DD/MM/YYYY'),
                dayjs(e.start_time).format('HH:mm'),
                e.title || '',
                e.employee?.name || '',
                e.customer?.name || '',
                STATUS_MAP[e.status]?.label || e.status,
                dur,
            ]
        })
        const { exportTableToPdf } = await import('@/utils/export-generic-pdf')
        exportTableToPdf({
            title: 'Relatório de Serviços',
            subtitle: `${startDate.format('DD/MM/YYYY')} a ${endDate.format('DD/MM/YYYY')} — ${events.length} serviços`,
            headers,
            rows,
            filename: `relatorio-agenda-${startDate.format('YYYY-MM-DD')}-a-${endDate.format('YYYY-MM-DD')}.pdf`,
            orientation: 'landscape',
            columnStyles: { 6: { halign: 'center' } },
        })
        messageApi.success('PDF exportado!')
    }

    return (
        <Layout title={PAGE_TITLES.REPORTS} subtitle="Relatório de serviços e desempenho da agenda">
            {contextHolder}

            {/* KPIs */}
            <div className="kpi-grid">
                <CardKPI title="Total de Serviços" value={totalServices} icon={<CalendarOutlined />} variant="blue" />
                <CardKPI title="Concluídos" value={completedServices} icon={<CheckCircleOutlined />} variant="green" />
                <CardKPI
                    title="Taxa de Conclusão"
                    value={`${completionRate}%`}
                    icon={<TrophyOutlined />}
                    variant={completionRate >= 70 ? 'green' : 'orange'}
                />
                <CardKPI
                    title="Receita Período"
                    value={fmt(events.filter((e: any) => e.status === 'COMPLETED' && e.amount_charged > 0).reduce((s: number, e: any) => s + Number(e.amount_charged), 0))}
                    icon={<DollarOutlined />}
                    variant="green"
                />
                <CardKPI
                    title="Horas Trabalhadas"
                    value={`${totalHours.toFixed(1)}h`}
                    icon={<ClockCircleOutlined />}
                    variant="blue"
                />
            </div>

            {/* Filters */}
            <div className="filter-bar" style={{ marginBottom: 20 }}>
                <Space>
                    <Select value={periodType} onChange={setPeriodType} style={{ width: 160 }}>
                        <Select.Option value="week">Esta Semana</Select.Option>
                        <Select.Option value="month">Este Mês</Select.Option>
                        <Select.Option value="custom">Personalizado</Select.Option>
                    </Select>
                    {periodType === 'custom' && (
                        <DatePicker.RangePicker
                            value={[startDate, endDate]}
                            onChange={(vals) => {
                                if (vals?.[0] && vals?.[1]) {
                                    setStartDate(vals[0].startOf('day'))
                                    setEndDate(vals[1].endOf('day'))
                                }
                            }}
                            format="DD/MM/YYYY"
                        />
                    )}
                </Space>
                <div style={{ flex: 1 }} />
                <Button icon={<DownloadOutlined />} onClick={() => setReportExportModalOpen(true)}>Exportar</Button>
            </div>

            {events.length === 0 ? (
                <div style={{
                    background: '#111c2e', borderRadius: 12, padding: '60px 40px',
                    border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center',
                }}>
                    <Empty description="Nenhum serviço encontrado neste período" />
                </div>
            ) : (
                <>
                    {/* Charts row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3 className="chart-card-title">Serviços por Dia</h3>
                            </div>
                            <Bar data={barData} options={barOptions} />
                        </div>
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3 className="chart-card-title">Status dos Serviços</h3>
                            </div>
                            <div style={{ maxWidth: 280, margin: '0 auto' }}>
                                <Doughnut
                                    data={doughnutData}
                                    options={{
                                        responsive: true,
                                        cutout: '60%',
                                        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 12 }, padding: 12 } } },
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Employee performance + bar chart */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3 className="chart-card-title">Desempenho por Funcionário</h3>
                            </div>
                            {isMobile ? (
                                <div className="pc-row-compact-list">
                                    {employeeStats.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 24, color: '#98A2B3' }}>Sem dados</div>
                                    ) : employeeStats.map((emp, i) => {
                                        const isOpen = expandedEmp.has(emp.id)
                                        return (
                                            <div key={emp.id} style={{ marginBottom: 8 }}>
                                                <div
                                                    className="pc-row-compact"
                                                    style={{ marginBottom: 0 }}
                                                    onClick={() => setExpandedEmp(prev => {
                                                        const next = new Set(prev)
                                                        if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id)
                                                        return next
                                                    })}
                                                >
                                                    <span style={{ flex: '0 0 auto', fontWeight: 700, color: i < 3 ? '#F79009' : '#98A2B3', minWidth: 18 }}>{i + 1}</span>
                                                    <div className="pc-row-compact__main">
                                                        <span className="pc-row-compact__title">{emp.name}</span>
                                                        <span className="pc-row-compact__sub">{emp.totalServices} serv · {emp.completed} concl · {emp.totalHours.toFixed(1)}h</span>
                                                    </div>
                                                    <Tag color={emp.completionRate >= 80 ? 'success' : emp.completionRate >= 50 ? 'warning' : 'error'} style={{ margin: 0, flexShrink: 0 }}>{emp.completionRate}%</Tag>
                                                    <span className="pc-row-compact__kebab" style={{ width: 32 }}>
                                                        {isOpen ? <DownOutlined /> : <RightOutlined />}
                                                    </span>
                                                </div>
                                                {isOpen && (
                                                    <div style={{
                                                        background: 'rgba(17, 28, 46, 0.45)', border: '1px solid rgba(255,255,255,0.08)',
                                                        borderTop: 0, borderRadius: '0 0 10px 10px', padding: '10px 12px',
                                                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12,
                                                    }}>
                                                        <span style={{ color: '#94a3b8' }}>Cargo</span><span style={{ color: '#e2e8f0', textAlign: 'right' }}>{emp.position}</span>
                                                        <span style={{ color: '#94a3b8' }}>Serviços</span><span style={{ color: '#e2e8f0', textAlign: 'right' }}>{emp.totalServices}</span>
                                                        <span style={{ color: '#94a3b8' }}>Concluídos</span><span style={{ color: '#12B76A', textAlign: 'right' }}>{emp.completed}</span>
                                                        <span style={{ color: '#94a3b8' }}>Cancelados</span><span style={{ color: emp.cancelled > 0 ? '#F04438' : '#98A2B3', textAlign: 'right' }}>{emp.cancelled}</span>
                                                        <span style={{ color: '#94a3b8' }}>Horas</span><span style={{ color: '#e2e8f0', textAlign: 'right' }}>{emp.totalHours.toFixed(1)}h</span>
                                                        <span style={{ color: '#94a3b8' }}>Taxa Conclusão</span><span style={{ color: '#e2e8f0', textAlign: 'right' }}>{emp.completionRate}%</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <Table
                                    columns={empColumns}
                                    dataSource={employeeStats}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    loading={loading}
                                />
                            )}
                        </div>
                        <div className="chart-card">
                            <div className="chart-card-header">
                                <h3 className="chart-card-title">Serviços por Funcionário</h3>
                            </div>
                            {employeeStats.length > 0 ? (
                                <Bar data={empBarData} options={empBarOptions} />
                            ) : (
                                <div style={{ textAlign: 'center', padding: 40, color: '#98A2B3' }}>Sem dados</div>
                            )}
                        </div>
                    </div>

                    {/* Event List */}
                    <div className="chart-card" style={{ marginBottom: 24 }}>
                        <div className="chart-card-header">
                            <h3 className="chart-card-title">Lista de Serviços</h3>
                        </div>
                        <Table
                            columns={eventListColumns}
                            dataSource={events}
                            rowKey="id"
                            pagination={{ pageSize: PAGE_SIZE }}
                            size="small"
                            loading={loading}
                        />
                    </div>
                </>
            )}

            {/* Modal: Editar / Excluir Lançamento */}
            <Modal
                title={<span><DollarOutlined style={{ marginRight: 8 }} />Editar Lançamento{editLancEvt ? ` — ${editLancEvt.title}` : ''}</span>}
                open={editLancOpen}
                onCancel={() => setEditLancOpen(false)}
                footer={<Button onClick={() => setEditLancOpen(false)}>Fechar</Button>}
                width="min(560px, calc(100vw - 32px))"
            >
                {editLancLoading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Buscando lançamentos...</div>
                ) : editLancEntries.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Nenhum lançamento encontrado para este agendamento.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: 12, color: '#2563eb', background: 'rgba(37,99,235,0.06)', borderRadius: 6, padding: '8px 12px', border: '1px solid rgba(37,99,235,0.2)' }}>
                            As alterações refletem automaticamente no HUB e no DRE.
                        </div>
                        {editLancEntries.map((entry) => (
                            <div key={entry.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        Vencimento: {entry.due_date ? dayjs(entry.due_date).format('DD/MM/YYYY') : '—'}
                                    </span>
                                    <Tag color={entry.paid_date ? 'success' : 'warning'} style={{ margin: 0 }}>
                                        {entry.paid_date ? `Recebido ${dayjs(entry.paid_date).format('DD/MM/YYYY')}` : 'Pendente'}
                                    </Tag>
                                </div>
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Valor</div>
                                    <InputNumber
                                        style={{ width: '100%' }}
                                        value={editLancAmounts[entry.id]}
                                        onChange={(v) => setEditLancAmounts(prev => ({ ...prev, [entry.id]: Number(v) || 0 }))}
                                        min={0}
                                        precision={2}
                                        addonBefore="R$"
                                        formatter={(v) => v != null ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                                        parser={(v) => Number((v || '0').replace(/\./g, '').replace(',', '.'))}
                                    />
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Descrição</div>
                                    <Input.TextArea
                                        rows={2}
                                        value={editLancDescs[entry.id]}
                                        onChange={(e) => setEditLancDescs(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <Popconfirm
                                        title="Excluir este lançamento?"
                                        description="O valor será removido do fluxo de caixa, HUB e DRE."
                                        onConfirm={() => deleteEditLanc(entry.id)}
                                        okText="Excluir"
                                        cancelText="Cancelar"
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button danger size="small" loading={savingLanc} icon={<DeleteOutlined />}>Excluir</Button>
                                    </Popconfirm>
                                    <Button type="primary" size="small" loading={savingLanc} onClick={() => saveEditLanc(entry.id)}>
                                        Salvar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>

            {/* Export format modal — Relatórios */}
            <ExportFormatModal
                open={reportExportModalOpen}
                onClose={() => setReportExportModalOpen(false)}
                title="Exportar Relatório de Serviços"
                skipDateRange
                onExportExcel={exportCSV}
                onExportPdf={exportReportPdf}
            />
        </Layout>
    )
}

export default Reports
