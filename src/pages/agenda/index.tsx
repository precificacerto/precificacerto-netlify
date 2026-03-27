import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
    Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Tag, TimePicker,
    DatePicker, message, Popconfirm, Tooltip, Avatar, Empty, Modal, Divider,
    Checkbox, Alert, Radio, Upload, Switch,
} from 'antd'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/pt-br'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import type { CalendarEvent, Customer, EventStatus, Employee } from '@/supabase/types'
import {
    PlusOutlined, LeftOutlined, RightOutlined, UserOutlined, ArrowLeftOutlined,
    ClockCircleOutlined, DeleteOutlined, CheckCircleOutlined,
    UserAddOutlined, CalendarOutlined, DollarOutlined,
    ShoppingOutlined, PercentageOutlined, FilterOutlined,
    PaperClipOutlined, UploadOutlined, SyncOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useAuth } from '@/hooks/use-auth.hook'
import { useRouter } from 'next/router'
import { calculateDiscountedPrice } from '@/utils/calculate-discount'
import { getEffectiveCommissionPercent } from '@/utils/get-effective-commission'

dayjs.extend(isoWeek)
dayjs.locale('pt-br')

const statusCfg: Record<EventStatus, { label: string; color: string; tagColor: string }> = {
    SCHEDULED: { label: 'Agendado', color: '#12B76A', tagColor: 'success' },
    CONFIRMED: { label: 'Confirmado', color: '#2E90FA', tagColor: 'processing' },
    COMPLETED: { label: 'Concluído', color: '#12B76A', tagColor: 'success' },
    CANCELLED: { label: 'Cancelado', color: '#667085', tagColor: 'default' },
}

const WEEK_DAYS_FULL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const WEEK_DAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const EMP_COLORS = ['#7A5AF8', '#2E90FA', '#12B76A', '#F79009', '#F04438', '#EE46BC', '#0BA5EC', '#15B79E', '#FF692E', '#7C3AED']
const PAYMENT_METHODS = [
    { value: 'PIX', label: 'PIX' }, { value: 'DINHEIRO', label: 'Dinheiro' },
    { value: 'CARTAO_CREDITO', label: 'Cartão Crédito' }, { value: 'CARTAO_DEBITO', label: 'Cartão Débito' },
    { value: 'TRANSFERENCIA', label: 'Transferência' }, { value: 'BOLETO', label: 'Boleto' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: 'Cheque Pré-datado' },
    { value: 'LANCAMENTOS_A_RECEBER', label: 'Lançamentos a Receber' },
]

const CHEQUE_PRE_DATADO_CONDITIONS = [
    { value: '30', label: '30 dias' },
    { value: '30_60', label: '30/60 dias' },
    { value: '30_60_90', label: '30/60/90 dias' },
]

// Horários de 00:00 até 24:00 (intervalos de 30 min)
const TIME_SLOTS: string[] = []
for (let h = 0; h < 24; h++) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 23) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}
const SLOT_HEIGHT = 48 // px por slot de 30 min

const DAY_TIME_SLOTS: string[] = []
for (let h = 6; h < 22; h++) {
    DAY_TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
    DAY_TIME_SLOTS.push(`${String(h).padStart(2, '0')}:15`)
    DAY_TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
    DAY_TIME_SLOTS.push(`${String(h).padStart(2, '0')}:45`)
}
const DAY_SLOT_HEIGHT = 32

function fmt(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

interface ExtraProd {
    key: string
    product_id: string
    service_id?: string
    product_name: string
    quantity: number
    unit_price: number
    discount: number
    total: number
    cost_total: number
    commission_percent: number
    profit_percent: number
    is_manual?: boolean
    is_service?: boolean
    commission_table_id?: string | null
}

function Schedule() {
    const router = useRouter()
    const { canView, canEdit } = usePermissions()
    const { currentUser } = useAuth()
    const isAdminOrSuper = currentUser?.is_super_admin === true || (currentUser?.role && String(currentUser.role).toLowerCase() === 'admin')
    const myEmployeeId = currentUser?.employee_id ?? null
    const defaultViewMode: 'day' | 'week' = isAdminOrSuper ? 'day' : 'week'

    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [allEmployees, setAllEmployees] = useState<Employee[]>([])
    const [schedEmpIds, setSchedEmpIds] = useState<string[]>([])
    const [regServices, setRegServices] = useState<any[]>([])
    const [availProds, setAvailProds] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    const [weekStart, setWeekStart] = useState(() => dayjs().startOf('isoWeek'))
    const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'day' | 'week'>(defaultViewMode)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editingEvt, setEditingEvt] = useState<CalendarEvent | null>(null)
    const [addEmpOpen, setAddEmpOpen] = useState(false)
    const [selAddEmp, setSelAddEmp] = useState<string | null>(null)
    const [serviceInputMode, setServiceInputMode] = useState<'select' | 'custom'>('select')

    // Payment modal
    const [payOpen, setPayOpen] = useState(false)
    const [payEvt, setPayEvt] = useState<CalendarEvent | null>(null)
    const [payForm] = Form.useForm()
    const [hasDiscount, setHasDiscount] = useState(false)
    const [discountTick, setDiscountTick] = useState(0)
    const [isSplitPay, setIsSplitPay] = useState(false)
    const [extraProds, setExtraProds] = useState<ExtraProd[]>([])
    const [attachFile, setAttachFile] = useState<File | null>(null)
    const [attachDesc, setAttachDesc] = useState('')

    const [form] = Form.useForm()
    const [msgApi, ctx] = message.useMessage()

    // Recurrence state for booking form
    const [recurActive, setRecurActive] = useState(false)
    const [recurType, setRecurType] = useState<'weekly' | 'biweekly' | 'every_20_days' | 'custom' | 'weekdays'>('weekly')
    const [recurWeekdays, setRecurWeekdays] = useState<number[]>([]) // 0=Mon..6=Sun (isoWeekday-based)
    const [recurEndDate, setRecurEndDate] = useState<dayjs.Dayjs | null>(null)
    const [recurForever, setRecurForever] = useState(false)
    const [recurCustomDays, setRecurCustomDays] = useState(7)

    // Commission table states
    const [bookingEmpServiceTables, setBookingEmpServiceTables] = useState<{id: string; name: string}[]>([])
    const [bookingSelectedServiceTableId, setBookingSelectedServiceTableId] = useState<string | null>(null)
    const [bookingTablesLoading, setBookingTablesLoading] = useState(false)
    const [bookingTablesLoaded, setBookingTablesLoaded] = useState(false)
    const [payAllEmpTables, setPayAllEmpTables] = useState<{id: string; name: string; type: string}[]>([])
    const [payTableSections, setPayTableSections] = useState<{key: string; tableId: string | null}[]>([{key: 'pts-0', tableId: null}])
    const latestBookingEmpRef = useRef<string | undefined>(undefined)

    const weekEnd = weekStart.add(6, 'day').endOf('day')
    const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const tid = await getTenantId()
            if (!tid) return
            const weekEndUtc = weekStart.add(6, 'day').endOf('day')
            const sb = supabase as any
            const eventsQuery = sb
                .from('calendar_events')
                .select('*, customer:customers(id, name), employee:employees(id, name)')
                .eq('is_active', true)
                .gte('start_time', weekStart.toISOString())
                .lte('start_time', weekEndUtc.toISOString())
                .order('start_time')

            if (!isAdminOrSuper && myEmployeeId) {
                eventsQuery.eq('employee_id', myEmployeeId)
            }

            const [evR, cuR, emR, scR, svR, prR] = await Promise.all([
                eventsQuery,
                sb.from('customers').select('id, name').eq('is_active', true).order('name'),
                sb.from('employees').select('id, name, position, status, commission_percent').eq('status', 'ACTIVE').eq('is_active', true).order('name'),
                sb.from('schedule_employees').select('employee_id').eq('tenant_id', tid),
                sb.from('services').select('id, name, base_price, estimated_duration_minutes, commission_percent, profit_percent, cost_total, recurrence_days, commission_table_id').eq('status', 'ACTIVE').order('name'),
                sb.from('products').select('id, name, sale_price, cost_total, commission_percent, profit_percent, recurrence_days, commission_table_id').eq('status', 'ACTIVE').order('name'),
            ])
            setEvents(evR.data || [])
            setCustomers(cuR.data || [])
            setAllEmployees(emR.data || [])
            setSchedEmpIds((scR.data || []).map((s: any) => s.employee_id))
            setRegServices(svR.data || [])
            setAvailProds(prR.data || [])
        } catch (e: any) { msgApi.error('Erro: ' + (e.message || '')) }
        finally { setLoading(false) }
    }, [weekStart, isAdminOrSuper, myEmployeeId])

    useEffect(() => { fetchAll() }, [fetchAll])

    // Processar lembretes pendentes: ao abrir a agenda e a cada 30s enquanto estiver na página
    useEffect(() => {
        const run = () => fetch('/api/whatsapp/send-reminder', { method: 'POST' }).catch(() => {})
        run()
        const interval = setInterval(run, 30 * 1000)
        return () => clearInterval(interval)
    }, [])

    const schedEmps = useMemo(() => {
        const base = allEmployees.filter(e => schedEmpIds.includes(e.id))
        if (!isAdminOrSuper && myEmployeeId) {
            return base.filter(e => e.id === myEmployeeId)
        }
        return base
    }, [allEmployees, schedEmpIds, isAdminOrSuper, myEmployeeId])
    const availToAdd = useMemo(() => allEmployees.filter(e => !schedEmpIds.includes(e.id)), [allEmployees, schedEmpIds])
    const empColor = useMemo(() => { const m: Record<string, string> = {}; schedEmps.forEach((e, i) => { m[e.id] = EMP_COLORS[i % EMP_COLORS.length] }); return m }, [schedEmps])

    // Sync employee from URL (e.g. /agenda?employee_id=xxx) and push URL when selection changes
    useEffect(() => {
        const qId = router.query.employee_id as string | undefined
        if (qId && schedEmpIds.includes(qId) && qId !== selectedEmpId) {
            setSelectedEmpId(qId)
            setViewMode('week')
        }
    }, [router.query.employee_id, schedEmpIds])
    useEffect(() => {
        if (viewMode === 'week' && !selectedEmpId && schedEmps.length > 0) setSelectedEmpId(schedEmps[0].id)
    }, [schedEmps, selectedEmpId, viewMode])

    if (!canView(MODULES.AGENDA)) {
        return <Layout title={PAGE_TITLES.SCHEDULE}><div style={{ padding: 40, textAlign: 'center' }}>Sem acesso.</div></Layout>
    }

    const handleSelectEmployee = (empId: string | null) => {
        setSelectedEmpId(empId)
        if (empId) router.replace({ pathname: '/agenda', query: { employee_id: empId } }, undefined, { shallow: true })
        else router.replace('/agenda', undefined, { shallow: true })
    }

    // Events filtered by selected employee
    const filteredEvents = useMemo(() => {
        if (!selectedEmpId) return events
        return events.filter(e => e.employee_id === selectedEmpId)
    }, [events, selectedEmpId])

    // Map events by day
    const evtByDay = useMemo(() => {
        const m: Record<string, CalendarEvent[]> = {}
        for (const d of weekDates) m[d.format('YYYY-MM-DD')] = []
        for (const ev of filteredEvents) {
            const dk = dayjs(ev.start_time).format('YYYY-MM-DD')
            if (m[dk]) m[dk].push(ev)
        }
        return m
    }, [filteredEvents, weekDates])

    async function handleAddEmp() {
        if (!selAddEmp) return
        try { const tid = await getTenantId(); if (!tid) return; const { error } = await (supabase as any).from('schedule_employees').insert({ tenant_id: tid, employee_id: selAddEmp }); if (error) throw error; setSchedEmpIds(p => [...p, selAddEmp]); setAddEmpOpen(false); setSelAddEmp(null); msgApi.success('Adicionado!') } catch (e: any) { msgApi.error(e.message || '') }
    }
    async function handleRemoveEmp(eid: string) {
        try {
            const tid = await getTenantId()
            if (!tid) return
            await (supabase as any).from('schedule_employees').delete().eq('tenant_id', tid).eq('employee_id', eid)
            setSchedEmpIds(p => p.filter(id => id !== eid))
            if (selectedEmpId === eid) {
                setSelectedEmpId(null)
                router.replace('/agenda', undefined, { shallow: true })
            }
            msgApi.success('Removido.')
        } catch (e: any) { msgApi.error(e.message || '') }
    }

    const openNew = useCallback((empId?: string, date?: dayjs.Dayjs, time?: string) => {
        form.resetFields()
        setEditingEvt(null)
        setServiceInputMode('select')
        setRecurActive(false)
        setRecurType('weekly')
        setRecurWeekdays([])
        setRecurEndDate(null)
        setRecurForever(false)
        setRecurCustomDays(7)
        setBookingEmpServiceTables([])
        setBookingSelectedServiceTableId(null)
        setBookingTablesLoading(false)
        setBookingTablesLoaded(false)
        latestBookingEmpRef.current = undefined
        if (empId) {
            form.setFieldValue('employee_id', empId)
            fetchBookingServiceTables(empId)
        }
        if (date) form.setFieldValue('date', date)
        if (time) form.setFieldValue('time', dayjs(time, 'HH:mm'))
        setDrawerOpen(true)
    }, [])

    const openEdit = useCallback((ev: CalendarEvent) => {
        setEditingEvt(ev)
        setServiceInputMode(ev.service_id ? 'select' : 'custom')
        const dur = Math.round((new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()) / 60000)
        form.setFieldsValue({ title: ev.title, date: dayjs(ev.start_time), time: dayjs(ev.start_time), duration_minutes: String(dur), customer_id: ev.customer_id || undefined, employee_id: ev.employee_id || undefined, service_id: ev.service_id || undefined, status: ev.status, notes: ev.description || '' })
        setBookingEmpServiceTables([])
        setBookingSelectedServiceTableId(null)
        setBookingTablesLoading(false)
        setBookingTablesLoaded(false)
        latestBookingEmpRef.current = undefined
        if (ev.employee_id) fetchBookingServiceTables(ev.employee_id)
        setDrawerOpen(true)
    }, [])

    function onServiceSelect(svcId: string) {
        const svc = regServices.find((s: any) => s.id === svcId)
        if (svc) {
            form.setFieldsValue({ title: svc.name, duration_minutes: String(svc.estimated_duration_minutes || 60) })
        }
    }

    async function handleSave() {
        try {
            const v = await form.validateFields()
            const tid = await getTenantId(); if (!tid) return
            const ed = v.date?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD')
            const st = v.time?.format('HH:mm') || '09:00'
            const dur = parseInt(v.duration_minutes) || 60
            const startLocal = dayjs(`${ed}T${st}:00`)
            const s = startLocal.toISOString()
            const e = startLocal.add(dur, 'minute').toISOString()

            // Calcular horário do lembrete WhatsApp: >24h = disparo 24h antes; <24h = disparo 10 min após salvar
            const hasCustomer = !!v.customer_id
            let reminderSendAt: string | null = null
            if (hasCustomer) {
                const hoursUntilEvent = startLocal.diff(dayjs(), 'hour', true)
                if (hoursUntilEvent > 0 && hoursUntilEvent < 24) {
                    reminderSendAt = dayjs().add(10, 'minute').toISOString()
                } else if (hoursUntilEvent >= 24) {
                    reminderSendAt = startLocal.subtract(24, 'hour').toISOString()
                }
            }

            if (editingEvt) {
                const updateData: any = { title: v.title, start_time: s, end_time: e, status: v.status || 'SCHEDULED', customer_id: v.customer_id || null, employee_id: v.employee_id || null, service_id: serviceInputMode === 'select' ? (v.service_id || null) : null, description: v.notes || null }
                if (reminderSendAt && !(editingEvt as any).whatsapp_reminder_sent) {
                    updateData.reminder_send_at = reminderSendAt
                }
                const { error } = await supabase.from('calendar_events').update(updateData).eq('id', editingEvt.id)
                if (error) throw error; msgApi.success('Atualizado!')
            } else {
                const uid = currentUser?.uid ?? (await getCurrentUserId())
                const baseData: any = { tenant_id: tid, user_id: uid || null, event_type: 'SERVICE', title: v.title, status: 'SCHEDULED', customer_id: v.customer_id || null, employee_id: v.employee_id || null, service_id: serviceInputMode === 'select' ? (v.service_id || null) : null, description: v.notes || null }
                const insertData: any = { ...baseData, start_time: s, end_time: e }
                if (reminderSendAt) insertData.reminder_send_at = reminderSendAt
                const { error } = await supabase.from('calendar_events').insert([insertData])
                if (error) throw error

                // Create recurrence occurrences if active
                if (recurActive && (recurEndDate || recurForever)) {
                    const recurInserts: any[] = []
                    let cursor = startLocal.add(1, 'day')
                    const endLimit = recurForever
                        ? startLocal.add(1, 'year').endOf('day')
                        : recurEndDate!.endOf('day')
                    const isoWeekdaySet = new Set(recurWeekdays.map(d => d + 1)) // isoWeekday: 1=Mon..7=Sun

                    while (cursor.isBefore(endLimit)) {
                        let matches = false
                        const diffDays = cursor.diff(startLocal, 'day')
                        if (recurType === 'weekly') {
                            matches = cursor.isoWeekday() === startLocal.isoWeekday()
                        } else if (recurType === 'biweekly') {
                            const diffWeeks = cursor.diff(startLocal, 'week')
                            matches = diffWeeks % 2 === 0 && cursor.isoWeekday() === startLocal.isoWeekday()
                        } else if (recurType === 'every_20_days') {
                            matches = diffDays % 20 === 0
                        } else if (recurType === 'custom') {
                            matches = diffDays % Math.max(1, recurCustomDays) === 0
                        } else if (recurType === 'weekdays') {
                            matches = isoWeekdaySet.has(cursor.isoWeekday())
                        }
                        if (matches) {
                            const rStart = cursor.hour(startLocal.hour()).minute(startLocal.minute()).second(0)
                            const rEnd = rStart.add(dur, 'minute')
                            recurInserts.push({ ...baseData, start_time: rStart.toISOString(), end_time: rEnd.toISOString() })
                        }
                        cursor = cursor.add(1, 'day')
                    }
                    if (recurInserts.length > 0) {
                        await supabase.from('calendar_events').insert(recurInserts)
                        msgApi.success(`Agendado! + ${recurInserts.length} recorrência(s) criada(s).`)
                    } else {
                        msgApi.success('Agendado!')
                    }
                } else {
                    msgApi.success('Agendado!')
                }

                if (reminderSendAt) {
                    const hoursUntilEvent = startLocal.diff(dayjs(), 'hour', true)
                    const isLessThan24h = hoursUntilEvent < 24
                    const minutesMsg = isLessThan24h
                        ? 'Lembrete WhatsApp será enviado em ~10 minutos.'
                        : `Lembrete WhatsApp agendado para ${dayjs(reminderSendAt).format('DD/MM às HH:mm')} (24h antes do horário).`
                    msgApi.info(`📱 ${minutesMsg}`)
                }
            }

            await fetchAll(); setDrawerOpen(false); setEditingEvt(null)
        } catch (e: any) { msgApi.error(e.message || 'Preencha os campos.') }
    }

    async function handleDelete(id: string) {
        try {
            const res = await fetch('/api/delete/calendar-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error || 'Erro ao desativar')
            msgApi.success('Desativado!')
            await fetchAll()
        } catch (e: any) { msgApi.error(e.message || 'Erro ao desativar evento') }
    }

    // ─── Payment Modal (só abre se o agendamento ainda não foi concluído por outra pessoa) ───
    async function openPayModal(ev: CalendarEvent) {
        const { data: fresh } = await (supabase as any).from('calendar_events').select('id, status, start_time, end_time, title, service_id, employee_id, customer_id, amount_charged').eq('id', ev.id).single()
        if (fresh?.status === 'COMPLETED') {
            msgApi.info('Este agendamento já foi concluído e o pagamento lançado.')
            await fetchAll()
            return
        }
        const evToUse = fresh ? { ...ev, ...fresh } : ev
        setPayEvt(evToUse)
        const svc = regServices.find((s: any) => s.id === evToUse.service_id)
        const basePrice = evToUse.amount_charged || svc?.base_price || 0
        payForm.setFieldsValue({ base_price: basePrice, discount_percent: 0, discount_value: 0, payment_method: 'PIX', payment_notes: '', amount_paid: basePrice, remaining_due_date: null, installments: 1 })
        setHasDiscount(false)
        setIsSplitPay(false)
        setExtraProds([])
        setAttachFile(null)
        setAttachDesc('')
        setPayAllEmpTables([])
        setPayTableSections([{key: 'pts-0', tableId: null}])
        if (evToUse.employee_id) {
            const { data: tablesData } = await (supabase as any)
                .from('employee_commission_tables')
                .select('commission_tables(id, name, type)')
                .eq('employee_id', evToUse.employee_id)
            const allTables = (tablesData || []).map((r: any) => r.commission_tables).filter(Boolean)
            setPayAllEmpTables(allTables)
            const firstTable = allTables[0]
            setPayTableSections([{key: 'pts-0', tableId: firstTable?.id || null}])
        }
        setPayOpen(true)
    }

    function calcFinalPrice() {
        const base = Number(payForm.getFieldValue('base_price')) || 0
        const discPct = Number(payForm.getFieldValue('discount_percent')) || 0
        const discVal = Number(payForm.getFieldValue('discount_value')) || 0
        const extrasTotal = extraProds.reduce((s, p) => s + p.total, 0)
        // Desconto sai apenas da margem (comissão + lucro), nunca do custo
        const svc = payEvt?.service_id ? regServices.find((s: any) => s.id === payEvt.service_id) : null
        const costWithTaxes = Number(svc?.cost_total) || 0
        if (discVal > 0) {
            // Desconto em R$: limitado à margem
            const margin = Math.max(0, base - costWithTaxes)
            const clampedDisc = Math.min(discVal, margin)
            return (base - clampedDisc) + extrasTotal
        }
        const { finalPrice } = calculateDiscountedPrice(base, costWithTaxes, discPct)
        return finalPrice + extrasTotal
    }

    function handleAddExtraProduct(tableId: string) {
        const newItem: ExtraProd = {
            key: `ep-${Date.now()}`, product_id: '', product_name: '', quantity: 1,
            unit_price: 0, discount: 0, total: 0, cost_total: 0, commission_percent: 0,
            profit_percent: 0, is_manual: false, is_service: false, commission_table_id: tableId,
        }
        setExtraProds(prev => [...prev, newItem])
    }

    function handleAddExtraService(tableId: string) {
        const newItem: ExtraProd = {
            key: `es-${Date.now()}`, product_id: '', service_id: '', product_name: '', quantity: 1,
            unit_price: 0, discount: 0, total: 0, cost_total: 0, commission_percent: 0,
            profit_percent: 0, is_manual: false, is_service: true, commission_table_id: tableId,
        }
        setExtraProds(prev => [...prev, newItem])
    }

    function handleAddExtraManual() {
        const newItem: ExtraProd = {
            key: `em-${Date.now()}`, product_id: '', product_name: '', quantity: 1,
            unit_price: 0, discount: 0, total: 0, cost_total: 0, commission_percent: 0,
            profit_percent: 0, is_manual: true, is_service: false,
        }
        setExtraProds(prev => [...prev, newItem])
    }

    function handleExtraProductSelect(key: string, productId: string) {
        const p = availProds.find((x: any) => x.id === productId)
        if (!p) return
        const empId = payEvt?.employee_id
        const emp = empId ? allEmployees.find(e => e.id === empId) : null
        const effectiveComm = getEffectiveCommissionPercent(emp?.commission_percent, p.commission_percent)
        setExtraProds(prev => prev.map(ep => {
            if (ep.key !== key) return ep
            const price = Number(p.sale_price) || 0
            const total = price * ep.quantity
            return { ...ep, product_id: p.id, product_name: p.name, unit_price: price, cost_total: Number(p.cost_total) || 0, commission_percent: effectiveComm, profit_percent: Number(p.profit_percent) || 0, discount: 0, total }
        }))
    }

    function handleExtraServiceSelect(key: string, serviceId: string) {
        const s = regServices.find((x: any) => x.id === serviceId)
        if (!s) return
        const empId = payEvt?.employee_id
        const emp = empId ? allEmployees.find(e => e.id === empId) : null
        const effectiveComm = getEffectiveCommissionPercent(emp?.commission_percent, s.commission_percent)
        setExtraProds(prev => prev.map(ep => {
            if (ep.key !== key) return ep
            const price = Number(s.base_price) || 0
            const total = price * ep.quantity
            return { ...ep, service_id: s.id, product_name: s.name, unit_price: price, cost_total: Number(s.cost_total) || 0, commission_percent: effectiveComm, profit_percent: Number(s.profit_percent) || 0, discount: 0, total }
        }))
    }

    function handleExtraItemChange(key: string, field: 'quantity' | 'unit_price' | 'discount' | 'product_name', value: any) {
        setExtraProds(prev => prev.map(ep => {
            if (ep.key !== key) return ep
            const updated = { ...ep, [field]: value }
            if (field === 'discount') {
                // Discount based on margin only
                const grossTotal = updated.quantity * updated.unit_price
                const costPortion = updated.cost_total * updated.quantity
                const margin = Math.max(0, grossTotal - costPortion)
                const discPct = Math.min(Number(value) || 0, 100)
                const discAmt = margin * discPct / 100
                updated.discount = discPct
                updated.total = grossTotal - discAmt
            } else if (field === 'quantity' || field === 'unit_price') {
                const grossTotal = updated.quantity * updated.unit_price
                if (updated.discount > 0) {
                    const costPortion = updated.cost_total * updated.quantity
                    const margin = Math.max(0, grossTotal - costPortion)
                    const discAmt = margin * updated.discount / 100
                    updated.total = grossTotal - discAmt
                } else {
                    updated.total = grossTotal
                }
            }
            return updated
        }))
    }

    async function handleCompletePay() {
        if (!payEvt) return
        try {
            const v = await payForm.validateFields()
            const tid = await getTenantId(); if (!tid) return
            const createdBy = await getCurrentUserId(); if (!createdBy) { msgApi.error('Sessão inválida. Faça login novamente.'); return }

            if (v.payment_method === 'LANCAMENTOS_A_RECEBER' && !payEvt.customer_id) {
                msgApi.error('O método "Lançamentos a Receber" exige um cliente vinculado ao agendamento.')
                return
            }

            const { data: evCheck } = await supabase.from('calendar_events').select('id, status').eq('id', payEvt.id).single()
            if (evCheck?.status === 'COMPLETED') {
                msgApi.warning('Este agendamento já foi concluído por outra pessoa. Atualize a lista.')
                setPayOpen(false)
                setPayEvt(null)
                await fetchAll()
                return
            }

            const basePrice = Number(v.base_price) || 0
            const discPct = hasDiscount ? (Number(v.discount_percent) || 0) : 0
            const discVal = hasDiscount ? (Number(v.discount_value) || 0) : 0
            const prodsTotal = extraProds.reduce((s, p) => s + p.total, 0)
            // Desconto sai apenas da margem (comissão + lucro)
            const svc = payEvt?.service_id ? regServices.find((s: any) => s.id === payEvt.service_id) : null
            const costWithTaxes = Number(svc?.cost_total) || 0
            let finalPrice: number
            let discountAmt: number
            if (discVal > 0) {
                const margin = Math.max(0, basePrice - costWithTaxes)
                discountAmt = Math.min(discVal, margin)
                finalPrice = basePrice - discountAmt
            } else {
                const result = calculateDiscountedPrice(basePrice, costWithTaxes, discPct)
                finalPrice = result.finalPrice
                discountAmt = result.discountValue
            }
            const totalRevenue = finalPrice + prodsTotal

            const amountPaid = isSplitPay ? (Number(v.amount_paid) || totalRevenue) : totalRevenue
            const remaining = Math.max(0, totalRevenue - amountPaid)
            const remainingDate = isSplitPay && remaining > 0 ? v.remaining_due_date?.format('YYYY-MM-DD') || null : null

            const { data: updatedEvt } = await supabase.from('calendar_events').update({
                status: 'COMPLETED', amount_charged: totalRevenue, payment_method: v.payment_method,
                discount_percent: discPct, discount_value: discountAmt,
                payment_notes: v.payment_notes || null, amount_paid: amountPaid,
                remaining_amount: remaining, remaining_due_date: remainingDate,
                completed_at: new Date().toISOString(),
                installments: v.payment_method === 'CARTAO_CREDITO' ? (v.installments ?? 1) : null,
            }).eq('id', payEvt.id).neq('status', 'COMPLETED').select('id').single()
            if (!updatedEvt) {
                msgApi.warning('Este agendamento já foi concluído por outra pessoa. Atualize a lista.')
                setPayOpen(false)
                setPayEvt(null)
                await fetchAll()
                return
            }

            const sbp = supabase as any
            if (payEvt.customer_id && (v.payment_notes || '').trim()) {
                await sbp.from('customer_service_history').insert({
                    tenant_id: tid,
                    customer_id: payEvt.customer_id,
                    calendar_event_id: payEvt.id,
                    service_observation: (v.payment_notes || '').trim(),
                    created_by: createdBy,
                })
            }

            await sbp.from('completed_services').insert({
                tenant_id: tid, calendar_event_id: payEvt.id,
                service_id: payEvt.service_id || null, employee_id: payEvt.employee_id || null,
                customer_id: payEvt.customer_id || null, service_name: payEvt.title,
                service_date: dayjs(payEvt.start_time).format('YYYY-MM-DD'),
                start_time: payEvt.start_time, end_time: payEvt.end_time,
                base_price: basePrice, discount_percent: discPct, discount_value: discountAmt,
                final_price: finalPrice, amount_paid: amountPaid, remaining_amount: remaining,
                remaining_due_date: remainingDate, payment_method: v.payment_method,
                payment_notes: v.payment_notes || null, extra_products_total: prodsTotal,
                total_revenue: totalRevenue,
            })

            const clienteNome = payEvt.customer?.name || null
            const funcNome = payEvt.employee?.name || null
            const dataServico = dayjs(payEvt.start_time).format('DD/MM/YYYY')
            const pmLabel = PAYMENT_METHODS.find(pm => pm.value === v.payment_method)?.label || v.payment_method

            let descLines: string[] = [`Serviço: ${payEvt.title}`]
            if (funcNome) descLines.push(`Func: ${funcNome}`)
            if (clienteNome) descLines.push(`Cliente: ${clienteNome}`)
            descLines.push(`Data: ${dataServico}`)

            let descValores: string[] = [`Valor serviço: ${fmt(basePrice)}`]
            if (discountAmt > 0) {
                descValores.push(`Desconto: -${fmt(discountAmt)}${discPct > 0 ? ` (${discPct}%)` : ''}`)
                descValores.push(`Valor c/ desconto: ${fmt(finalPrice)}`)
            }
            if (extraProds.length > 0) {
                const prodsDesc = extraProds.map(ep => `${ep.product_name} x${ep.quantity} (${fmt(ep.total)})`).join(', ')
                descValores.push(`Itens adicionais: ${prodsDesc} = ${fmt(prodsTotal)}`)
            }
            descValores.push(`Total: ${fmt(totalRevenue)}`)
            descValores.push(`Pagamento: ${pmLabel}`)
            if (isSplitPay && remaining > 0) {
                descValores.push(`Pgto parcial: ${fmt(amountPaid)} agora | Restante: ${fmt(remaining)} (vence ${dayjs(remainingDate).format('DD/MM/YYYY')})`)
            }

            const descricaoCompleta = descLines.join(' | ') + ' — ' + descValores.join(' | ')

            if (amountPaid > 0) {
                const numInstallments = v.payment_method === 'CARTAO_CREDITO' ? (v.installments ?? 1) : 1
                const now = new Date()
                const curYear = now.getFullYear()
                const curMonth = now.getMonth()
                if (v.payment_method === 'LANCAMENTOS_A_RECEBER') {
                    // Lançamentos a Receber: não vai para o caixa — registra em pending_receivables
                    const empId = payEvt.employee_id || null
                    await sbp.from('pending_receivables').insert({
                        tenant_id: tid,
                        customer_id: payEvt.customer_id,
                        employee_id: empId,
                        calendar_event_id: payEvt.id,
                        amount: amountPaid,
                        description: descricaoCompleta,
                        launch_date: dayjs(payEvt.start_time).format('YYYY-MM-DD'),
                        origin_type: 'AGENDA',
                        status: 'PENDING',
                        created_by: createdBy,
                    })
                } else if (v.payment_method === 'CHEQUE_PRE_DATADO' || v.payment_method === 'BOLETO') {
                    // Cheque pré-datado / Boleto: gera cash_entries com paid_date = NULL e due_dates futuros
                    const chequeCondition = v.cheque_condition || '30'
                    const baseDate = dayjs(payEvt.start_time)
                    type ChequeEntry = { days: number; fraction: number }
                    const conditionMap: Record<string, ChequeEntry[]> = {
                        '30': [{ days: 30, fraction: 1 }],
                        '30_60': [{ days: 30, fraction: 0.5 }, { days: 60, fraction: 0.5 }],
                        '30_60_90': [{ days: 30, fraction: 1 / 3 }, { days: 60, fraction: 1 / 3 }, { days: 90, fraction: 1 / 3 }],
                    }
                    const slices = conditionMap[chequeCondition] || conditionMap['30']
                    const chequeEntries = slices.map((s, idx) => ({
                        tenant_id: tid, type: 'INCOME',
                        description: slices.length > 1
                            ? `${descricaoCompleta} (${idx + 1}/${slices.length})`
                            : descricaoCompleta,
                        amount: Math.round((totalRevenue * s.fraction) * 100) / 100,
                        due_date: baseDate.add(s.days, 'day').format('YYYY-MM-DD'),
                        paid_date: null,
                        payment_method: v.payment_method,
                        origin_type: 'SALE', origin_id: payEvt.id,
                        contact_id: payEvt.customer_id || null,
                        created_by: createdBy,
                    }))
                    await sbp.from('cash_entries').insert(chequeEntries)
                } else if (v.payment_method === 'CARTAO_CREDITO') {
                    // Cartão de crédito: receita nunca no mês atual — parcelas ou 1x a partir do próximo mês
                    const amountPerInstallment = totalRevenue / numInstallments
                    const installmentEntries = []
                    for (let i = 1; i <= numInstallments; i++) {
                        const dueDate = new Date(curYear, curMonth + i, 1)
                        installmentEntries.push({
                            tenant_id: tid, type: 'INCOME', description: descricaoCompleta,
                            amount: amountPerInstallment,
                            due_date: dayjs(dueDate).format('YYYY-MM-DD'),
                            paid_date: null,
                            payment_method: v.payment_method,
                            origin_type: 'SALE', origin_id: payEvt.id,
                            contact_id: payEvt.customer_id || null,
                            ...(numInstallments > 1 ? { installment_number: i, installment_total: numInstallments } : {}),
                            created_by: createdBy,
                        })
                    }
                    await sbp.from('cash_entries').insert(installmentEntries)
                } else {
                    await sbp.from('cash_entries').insert({
                        tenant_id: tid,
                        type: 'INCOME',
                        description: descricaoCompleta,
                        amount: amountPaid,
                        due_date: dayjs(payEvt.start_time).format('YYYY-MM-DD'),
                        paid_date: dayjs().format('YYYY-MM-DD'),
                        payment_method: v.payment_method,
                        origin_type: 'SALE',
                        origin_id: payEvt.id,
                        contact_id: payEvt.customer_id || null,
                        created_by: createdBy,
                    })
                }
            }

            if (remaining > 0 && remainingDate) {
                const remainDescParts = [`[A RECEBER] Serviço: ${payEvt.title}`]
                if (clienteNome) remainDescParts.push(`Cliente: ${clienteNome}`)
                remainDescParts.push(`Cobrar em: ${dayjs(remainingDate).format('DD/MM/YYYY')}`)
                remainDescParts.push(`Total original: ${fmt(totalRevenue)} | Pago: ${fmt(amountPaid)} | Restante: ${fmt(remaining)}`)
                if (v.payment_notes) remainDescParts.push(`Obs: ${v.payment_notes}`)

                await supabase.from('cash_entries').insert({
                    tenant_id: tid, type: 'INCOME', description: remainDescParts.join(' | '),
                    amount: remaining, due_date: remainingDate, paid_date: null,
                    payment_method: v.payment_method, origin_type: 'SALE',
                    origin_id: payEvt.id, contact_id: payEvt.customer_id || null,
                    created_by: createdBy,
                })
            }

            for (const ep of extraProds) {
                if (ep.is_manual || ep.is_service) continue // only deduct stock for catalog products
                if (!ep.product_id) continue
                const { data: st } = await supabase.from('stock').select('id, quantity_current').eq('product_id', ep.product_id).eq('stock_type', 'PRODUCT').single()
                if (st) {
                    await supabase.from('stock').update({ quantity_current: Math.max(0, (Number(st.quantity_current) || 0) - ep.quantity) }).eq('id', st.id)
                    await supabase.from('stock_movements').insert({ stock_id: st.id, delta_quantity: -ep.quantity, reason: `Venda - Serviço: ${payEvt.title}`, created_by: createdBy })
                }
            }

            if (payEvt.service_id) {
                const { data: serviceItems } = await sbp
                    .from('service_items')
                    .select('item_id, quantity')
                    .eq('service_id', payEvt.service_id)
                const qtyPerService = 1
                for (const si of serviceItems || []) {
                    const itemId = si.item_id
                    const deduct = (Number(si.quantity) || 0) * qtyPerService
                    if (deduct <= 0) continue
                    const { data: item } = await supabase.from('items').select('id, quantity').eq('id', itemId).single()
                    if (!item) continue
                    const currentQty = Number(item.quantity) ?? 0
                    const newQty = Math.max(0, currentQty - deduct)
                    await supabase
                        .from('items')
                        .update({ quantity: newQty, updated_at: new Date().toISOString() })
                        .eq('id', itemId)
                    const { data: itemStock } = await supabase
                        .from('stock')
                        .select('id, quantity_current')
                        .eq('item_id', itemId)
                        .eq('stock_type', 'ITEM')
                        .maybeSingle()
                    if (itemStock) {
                        const stCurrent = Number(itemStock.quantity_current) ?? 0
                        await supabase
                            .from('stock')
                            .update({ quantity_current: Math.max(0, stCurrent - deduct), updated_at: new Date().toISOString() })
                            .eq('id', itemStock.id)
                        await supabase.from('stock_movements').insert({
                            stock_id: itemStock.id,
                            delta_quantity: -deduct,
                            reason: `Serviço realizado: ${payEvt.title}`,
                            created_by: createdBy,
                        })
                    }
                }
            }

            if (attachFile && payEvt.customer_id) {
                const ext = attachFile.name.split('.').pop() || 'bin'
                const filePath = `${tid}/customers/${payEvt.customer_id}/${crypto.randomUUID()}.${ext}`
                const { error: uploadErr } = await supabase.storage.from('comprovantes').upload(filePath, attachFile)
                if (!uploadErr) {
                    await sbp.from('customer_attachments').insert({
                        tenant_id: tid,
                        customer_id: payEvt.customer_id,
                        origin_type: 'AGENDA',
                        origin_id: payEvt.id,
                        file_path: filePath,
                        file_name: attachFile.name,
                        file_size: attachFile.size,
                        mime_type: attachFile.type,
                        description: attachDesc || null,
                        created_by: createdBy,
                    })
                }
            }

            // ─── Recurrence records ───
            // Check if the main service has recurrence_days
            const mainSvc = payEvt.service_id ? regServices.find((s: any) => s.id === payEvt.service_id) : null
            if (mainSvc?.recurrence_days > 0 && payEvt.customer_id) {
                const saleDate = dayjs().format('YYYY-MM-DD')
                const dispatchDate = dayjs().add(mainSvc.recurrence_days, 'day').format('YYYY-MM-DD')
                const { data: recRecord } = await sbp.from('recurrence_records').insert({
                    tenant_id: tid,
                    service_id: mainSvc.id,
                    customer_id: payEvt.customer_id,
                    employee_id: payEvt.employee_id || null,
                    sale_date: saleDate,
                    dispatch_date: dispatchDate,
                    recurrence_days: mainSvc.recurrence_days,
                    amount: totalRevenue,
                    type: 'SERVICE',
                    created_by: createdBy,
                }).select('id').single()
                if (recRecord) {
                    await sbp.from('recurrence_dispatch_queue').insert({
                        tenant_id: tid,
                        recurrence_record_id: recRecord.id,
                        scheduled_at: `${dispatchDate}T12:00:00-03:00`,
                        user_id: createdBy,
                    })
                }
            }
            // Check extra items for recurrence
            for (const ep of extraProds) {
                if (ep.is_manual) continue
                const prod = ep.product_id ? availProds.find((p: any) => p.id === ep.product_id) : null
                const extraSvc = ep.service_id ? regServices.find((s: any) => s.id === ep.service_id) : null
                const recDays = prod?.recurrence_days || extraSvc?.recurrence_days || 0
                if (recDays > 0 && payEvt.customer_id) {
                    const saleDate = dayjs().format('YYYY-MM-DD')
                    const dispatchDate = dayjs().add(recDays, 'day').format('YYYY-MM-DD')
                    const recType = prod ? 'PRODUCT' : 'SERVICE'
                    const { data: recRecord } = await sbp.from('recurrence_records').insert({
                        tenant_id: tid,
                        service_id: extraSvc?.id || null,
                        product_id: prod?.id || null,
                        customer_id: payEvt.customer_id,
                        employee_id: payEvt.employee_id || null,
                        sale_date: saleDate,
                        dispatch_date: dispatchDate,
                        recurrence_days: recDays,
                        amount: ep.total,
                        type: recType,
                        created_by: createdBy,
                    }).select('id').single()
                    if (recRecord) {
                        await sbp.from('recurrence_dispatch_queue').insert({
                            tenant_id: tid,
                            recurrence_record_id: recRecord.id,
                            scheduled_at: `${dispatchDate}T12:00:00-03:00`,
                            user_id: createdBy,
                        })
                    }
                }
            }

            msgApi.success('Serviço concluído e lançado no caixa!')
            setPayOpen(false); setPayEvt(null); setExtraProds([]); setAttachFile(null); setAttachDesc(''); setPayTableSections([{key: 'pts-0', tableId: null}])
            await fetchAll()
        } catch (e: any) { msgApi.error(e.message || '') }
    }

    const payMethod = Form.useWatch('payment_method', payForm)
    const bookingEmployeeId = Form.useWatch('employee_id', form)

    async function fetchBookingServiceTables(empId: string) {
        latestBookingEmpRef.current = empId
        setBookingEmpServiceTables([])
        setBookingSelectedServiceTableId(null)
        setBookingTablesLoading(true)
        setBookingTablesLoaded(false)
        const { data } = await (supabase as any)
            .from('employee_commission_tables')
            .select('commission_tables(id, name, type)')
            .eq('employee_id', empId)
        if (empId !== latestBookingEmpRef.current) return
        const tables = (data || []).map((r: any) => r.commission_tables).filter(Boolean)
        const serviceTables = tables.filter((t: any) => t.type === 'SERVICE')
        setBookingEmpServiceTables(serviceTables)
        setBookingSelectedServiceTableId(serviceTables[0]?.id || null)
        setBookingTablesLoading(false)
        setBookingTablesLoaded(true)
    }

    // Watch form changes for when user manually selects employee in the dropdown
    useEffect(() => {
        if (!bookingEmployeeId) {
            latestBookingEmpRef.current = undefined
            setBookingEmpServiceTables([])
            setBookingSelectedServiceTableId(null)
            setBookingTablesLoading(false)
            setBookingTablesLoaded(false)
            return
        }
        fetchBookingServiceTables(bookingEmployeeId)
    }, [bookingEmployeeId])

    // Services filtered by selected SERVICE table for booking form
    const filteredBookingServices = useMemo(() => {
        if (!bookingSelectedServiceTableId) return []
        return regServices.filter((s: any) => s.commission_table_id === bookingSelectedServiceTableId)
    }, [regServices, bookingSelectedServiceTableId])

    // Used table IDs in payment sections (for availability check)
    const payUsedTableIds = payTableSections.map(s => s.tableId).filter(Boolean) as string[]

    const todayStr = dayjs().format('YYYY-MM-DD')
    const selectedEmp = schedEmps.find(e => e.id === selectedEmpId)
    const selectedEmpColor = selectedEmpId ? (empColor[selectedEmpId] || '#7A5AF8') : '#7A5AF8'
    const totalW = filteredEvents.length
    const doneW = filteredEvents.filter(e => e.status === 'COMPLETED').length

    // Day view: today's events grouped by employee
    const todayEvents = useMemo(() => {
        return events.filter(ev => dayjs(ev.start_time).format('YYYY-MM-DD') === todayStr)
    }, [events, todayStr])

    const eventsByEmployee = useMemo(() => {
        const grouped: Record<string, CalendarEvent[]> = {}
        for (const ev of todayEvents) {
            if (!ev.employee_id) continue
            if (!grouped[ev.employee_id]) grouped[ev.employee_id] = []
            grouped[ev.employee_id].push(ev)
        }
        for (const empId in grouped) {
            grouped[empId].sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())
        }
        return grouped
    }, [todayEvents])

    const empsForDayView = useMemo(() => {
        return schedEmps
    }, [schedEmps])

    const handleDayViewEmpClick = (empId: string) => {
        setViewMode('week')
        setSelectedEmpId(empId)
        router.replace({ pathname: '/agenda', query: { employee_id: empId } }, undefined, { shallow: true })
    }

    const handleBackToDay = () => {
        setViewMode('day')
        setSelectedEmpId(null)
        setWeekStart(dayjs().startOf('isoWeek'))
        router.replace('/agenda', undefined, { shallow: true })
    }

    const todayFormatted = (() => {
        const raw = dayjs().locale('pt-br').format('dddd, DD [de] MMMM [de] YYYY')
        return raw.charAt(0).toUpperCase() + raw.slice(1)
    })()

    // Helper: posição de um evento na grade de horários
    function getEventPosition(ev: CalendarEvent) {
        const evStart = dayjs(ev.start_time)
        const startMinutes = evStart.hour() * 60 + evStart.minute()
        const gridStartMinutes = 0 // 00:00
        const topOffset = ((startMinutes - gridStartMinutes) / 30) * SLOT_HEIGHT
        const evEnd = dayjs(ev.end_time)
        const durationMinutes = evEnd.diff(evStart, 'minute')
        const height = Math.max((durationMinutes / 30) * SLOT_HEIGHT, SLOT_HEIGHT * 0.8)
        return { top: Math.max(0, topOffset), height }
    }

    // Layout de eventos por dia para evitar sobreposição (lado a lado)
    function computeDayLayout(dayEvents: CalendarEvent[]) {
        const layout: Record<string, { top: number; height: number; left: string; width: string }> = {}
        if (!dayEvents.length) return layout

        const sorted = [...dayEvents].sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())

        let group: CalendarEvent[] = []
        let groupEnd: dayjs.Dayjs | null = null

        function flushGroup() {
            if (!group.length) return

            const groupSorted = [...group].sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())

            type LaneItem = { ev: CalendarEvent; laneIndex: number }
            const laneEnd: dayjs.Dayjs[] = []
            const items: LaneItem[] = []

            for (const ev of groupSorted) {
                const evStart = dayjs(ev.start_time)
                const evEnd = dayjs(ev.end_time)

                let laneIndex = 0
                while (laneIndex < laneEnd.length && evStart.isBefore(laneEnd[laneIndex])) {
                    laneIndex++
                }
                laneEnd[laneIndex] = evEnd
                items.push({ ev, laneIndex })
            }

            const laneCount = Math.max(1, laneEnd.length)

            for (const item of items) {
                const { ev, laneIndex } = item
                const { top, height } = getEventPosition(ev)
                const widthPct = 100 / laneCount
                const leftPct = laneIndex * widthPct

                layout[ev.id] = {
                    top,
                    height,
                    left: `${leftPct + 1}%`,
                    width: `${widthPct - 2}%`,
                }
            }

            group = []
            groupEnd = null
        }

        for (const ev of sorted) {
            const evStart = dayjs(ev.start_time)
            const evEnd = dayjs(ev.end_time)

            if (!groupEnd || evStart.isBefore(groupEnd)) {
                group.push(ev)
                if (!groupEnd || evEnd.isAfter(groupEnd)) groupEnd = evEnd
            } else {
                flushGroup()
                group = [ev]
                groupEnd = evEnd
            }
        }

        flushGroup()
        return layout
    }

    function getDayViewEventPosition(ev: CalendarEvent) {
        const evStart = dayjs(ev.start_time)
        const startMinutes = evStart.hour() * 60 + evStart.minute()
        const gridStartMinutes = 6 * 60
        const topOffset = ((startMinutes - gridStartMinutes) / 15) * DAY_SLOT_HEIGHT
        const evEnd = dayjs(ev.end_time)
        const durationMinutes = evEnd.diff(evStart, 'minute')
        const height = Math.max((durationMinutes / 15) * DAY_SLOT_HEIGHT, DAY_SLOT_HEIGHT * 1.5)
        return { top: Math.max(0, topOffset), height }
    }

    function computeDayLayoutForDayView(dayEvents: CalendarEvent[]) {
        const layout: Record<string, { top: number; height: number; left: string; width: string }> = {}
        if (!dayEvents.length) return layout
        const sorted = [...dayEvents].sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())
        let group: CalendarEvent[] = []
        let groupEnd: dayjs.Dayjs | null = null
        function flushGroup() {
            if (!group.length) return
            const groupSorted = [...group].sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())
            type LaneItem = { ev: CalendarEvent; laneIndex: number }
            const laneEnd: dayjs.Dayjs[] = []
            const items: LaneItem[] = []
            for (const ev of groupSorted) {
                const evStart = dayjs(ev.start_time)
                const evEnd = dayjs(ev.end_time)
                let laneIndex = 0
                while (laneIndex < laneEnd.length && evStart.isBefore(laneEnd[laneIndex])) { laneIndex++ }
                laneEnd[laneIndex] = evEnd
                items.push({ ev, laneIndex })
            }
            const laneCount = Math.max(1, laneEnd.length)
            for (const item of items) {
                const { ev, laneIndex } = item
                const { top, height } = getDayViewEventPosition(ev)
                const widthPct = 100 / laneCount
                const leftPct = laneIndex * widthPct
                layout[ev.id] = { top, height, left: `${leftPct + 1}%`, width: `${widthPct - 2}%` }
            }
            group = []
            groupEnd = null
        }
        for (const ev of sorted) {
            const evStart = dayjs(ev.start_time)
            const evEnd = dayjs(ev.end_time)
            if (!groupEnd || evStart.isBefore(groupEnd)) {
                group.push(ev)
                if (!groupEnd || evEnd.isAfter(groupEnd)) groupEnd = evEnd
            } else {
                flushGroup()
                group = [ev]
                groupEnd = evEnd
            }
        }
        flushGroup()
        return layout
    }

    const nowMinutes = dayjs().hour() * 60 + dayjs().minute()
    const nowLineTop = (nowMinutes / 30) * SLOT_HEIGHT

    return (
        <Layout title={PAGE_TITLES.SCHEDULE} subtitle="Agenda semanal de serviços">
            {ctx}

            {/* Top bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '12px 16px', background: '#111c2e', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {viewMode === 'day' ? (
                        <>
                            <CalendarOutlined style={{ fontSize: 20, color: '#22C55E' }} />
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{todayFormatted}</div>
                        </>
                    ) : (
                        <>
                            {isAdminOrSuper && (
                                <>
                                    <Button size="small" icon={<ArrowLeftOutlined />} onClick={handleBackToDay}>Voltar para vista do dia</Button>
                                    <Divider type="vertical" style={{ margin: 0 }} />
                                </>
                            )}
                            {/* Week navigation */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Button size="small" icon={<LeftOutlined />} onClick={() => setWeekStart(w => w.subtract(1, 'week'))} />
                                <div style={{ textAlign: 'center', minWidth: 170 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700 }}>{weekStart.format('DD/MM')} — {weekStart.add(6, 'day').format('DD/MM/YYYY')}</div>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>Semana {weekStart.isoWeek()}</div>
                                </div>
                                <Button size="small" icon={<RightOutlined />} onClick={() => setWeekStart(w => w.add(1, 'week'))} />
                                {!weekStart.isSame(dayjs().startOf('isoWeek'), 'day') && <Button size="small" type="link" onClick={() => setWeekStart(dayjs().startOf('isoWeek'))}>Hoje</Button>}
                            </div>
                            {/* Employee filter */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
                                <Select
                                    value={selectedEmpId}
                                    onChange={handleSelectEmployee}
                                    style={{ minWidth: 180 }}
                                    size="small"
                                    placeholder="Selecione funcionário"
                                >
                                    {schedEmps.map(emp => (
                                        <Select.Option key={emp.id} value={emp.id}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: empColor[emp.id] }} />
                                                {emp.name}
                                            </div>
                                        </Select.Option>
                                    ))}
                                </Select>
                            </div>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {viewMode === 'day' ? (
                        <>
                            <Tag color="blue" style={{ margin: 0 }}>{todayEvents.length} serviços hoje</Tag>
                            <Tag color="default" style={{ margin: 0 }}>{schedEmps.length} funcionários</Tag>
                        </>
                    ) : (
                        <>
                            <Tag color="blue" style={{ margin: 0 }}>{totalW} serviços</Tag>
                            <Tag color="green" style={{ margin: 0 }}>{doneW} concluídos</Tag>
                        </>
                    )}
                    {isAdminOrSuper && (
                        <Button size="small" icon={<UserAddOutlined />} onClick={() => setAddEmpOpen(true)}>Funcionário</Button>
                    )}
                    {canEdit(MODULES.AGENDA) && (
                        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openNew(selectedEmpId || undefined)}>Novo Serviço</Button>
                    )}
                </div>
            </div>

            {viewMode === 'day' ? (
                /* ── DAY VIEW ── */
                empsForDayView.length === 0 ? (
                    <div style={{ background: '#111c2e', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '60px 40px', textAlign: 'center' }}>
                        <Empty
                            image={<CalendarOutlined style={{ fontSize: 56, color: '#D0D5DD' }} />}
                                description={
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Nenhum funcionário na agenda</div>
                                    <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Adicione funcionários para agendar serviços.</div>
                                    {isAdminOrSuper && <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddEmpOpen(true)}>Adicionar Funcionário</Button>}
                                </div>
                            }
                        />
                    </div>
                ) : (
                    <div style={{ background: '#111c2e', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', overflow: 'auto' }}>
                            {/* Time column */}
                            <div style={{ minWidth: 56, borderRight: '1.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                                <div style={{ height: 52, borderBottom: '1.5px solid rgba(255,255,255,0.06)' }} />
                                {DAY_TIME_SLOTS.map((slot) => (
                                    <div key={slot} style={{
                                        height: DAY_SLOT_HEIGHT,
                                        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                                        padding: '2px 8px 0 0',
                                        fontSize: 10, fontWeight: slot.endsWith(':00') ? 600 : 400,
                                        color: slot.endsWith(':00') ? '#e2e8f0' : '#94a3b8',
                                        borderBottom: slot.endsWith(':00') ? '1.5px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        {slot.endsWith(':00') || slot.endsWith(':30') ? slot : ''}
                                    </div>
                                ))}
                            </div>

                            {/* Employee columns */}
                            {empsForDayView.map((emp, ei) => {
                                const empEvents = eventsByEmployee[emp.id] || []
                                const empLayout = computeDayLayoutForDayView(empEvents)
                                return (
                                    <div key={emp.id} style={{ flex: 1, minWidth: 160, borderRight: ei < empsForDayView.length - 1 ? '1.5px solid rgba(255,255,255,0.06)' : undefined }}>
                                        {/* Employee header */}
                                        <div
                                            style={{
                                                height: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                borderBottom: '1.5px solid rgba(255,255,255,0.06)',
                                                background: `${empColor[emp.id] || '#7A5AF8'}08`,
                                                cursor: 'pointer',
                                            }}
                                            onClick={() => handleDayViewEmpClick(emp.id)}
                                        >
                                            <Avatar size={20} style={{ background: empColor[emp.id] || '#7A5AF8', fontSize: 10, marginBottom: 2 }} icon={<UserOutlined />} />
                                            <div style={{ fontSize: 11, fontWeight: 700, color: empColor[emp.id] || '#7A5AF8', textAlign: 'center', lineHeight: 1.1, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
                                        </div>

                                        {/* Time slots */}
                                        <div style={{ position: 'relative' }}>
                                            {DAY_TIME_SLOTS.map((slot) => (
                                                <div
                                                    key={slot}
                                                    style={{
                                                        height: DAY_SLOT_HEIGHT,
                                                        borderBottom: slot.endsWith(':00') ? '1.5px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.04)',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.1s',
                                                    }}
                                                    onClick={() => openNew(emp.id, dayjs(), slot)}
                                                    onMouseEnter={(e) => { e.currentTarget.style.background = `${empColor[emp.id] || '#7A5AF8'}08` }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                                                />
                                            ))}

                                            {/* Now indicator */}
                                            {(() => {
                                                const nowMinLocal = dayjs().hour() * 60 + dayjs().minute()
                                                const gridStartMin = 6 * 60
                                                if (nowMinLocal >= gridStartMin && nowMinLocal <= 22 * 60) {
                                                    const nowTop = ((nowMinLocal - gridStartMin) / 15) * DAY_SLOT_HEIGHT
                                                    return (
                                                        <div style={{
                                                            position: 'absolute', top: nowTop, left: 0, right: 0,
                                                            height: 2, background: '#F04438', zIndex: 5,
                                                            pointerEvents: 'none',
                                                        }}>
                                                            {ei === 0 && <div style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#F04438' }} />}
                                                        </div>
                                                    )
                                                }
                                                return null
                                            })()}

                                            {/* Events */}
                                            {empEvents.map(ev => {
                                                const pos = empLayout[ev.id]
                                                if (!pos) return null
                                                const cfg = statusCfg[ev.status] || statusCfg.SCHEDULED
                                                const isCompleted = ev.status === 'COMPLETED'
                                                return (
                                                    <div
                                                        key={ev.id}
                                                        onClick={(e) => { e.stopPropagation(); openEdit(ev) }}
                                                        style={{
                                                            position: 'absolute',
                                                            top: pos.top,
                                                            left: pos.left,
                                                            width: pos.width,
                                                            height: Math.max(pos.height, DAY_SLOT_HEIGHT * 3),
                                                            background: isCompleted ? 'rgba(34, 197, 94, 0.1)' : '#111c2e',
                                                            border: `1px solid ${cfg.color}40`,
                                                            borderLeft: `3px solid ${cfg.color}`,
                                                            borderRadius: 6,
                                                            padding: '3px 6px',
                                                            cursor: 'pointer',
                                                            overflow: 'hidden',
                                                            zIndex: 2,
                                                            fontSize: 10,
                                                            transition: 'box-shadow 0.15s',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)' }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
                                                    >
                                                        <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 10 }}>
                                                            {dayjs(ev.start_time).format('HH:mm')}-{dayjs(ev.end_time).format('HH:mm')}
                                                        </div>
                                                        <div style={{ fontWeight: 600, color: cfg.color, fontSize: 10, lineHeight: 1.2 }}>{ev.title}</div>
                                                        {ev.customer && <div style={{ color: '#94a3b8', fontSize: 9 }}>{ev.customer.name}</div>}
                                                        {(ev.status === 'SCHEDULED' || ev.status === 'CONFIRMED') && (
                                                            <Button
                                                                type="primary"
                                                                size="small"
                                                                block
                                                                style={{ marginTop: 3, fontSize: 9, height: 22, borderRadius: 4, background: '#12B76A', borderColor: '#12B76A' }}
                                                                icon={<DollarOutlined style={{ fontSize: 9 }} />}
                                                                onClick={(e) => { e.stopPropagation(); openPayModal(ev) }}
                                                            >
                                                                Concluir
                                                            </Button>
                                                        )}
                                                        {isCompleted && (
                                                            <Tag color="success" style={{ fontSize: 8, margin: '3px 0 0', padding: '0 4px', lineHeight: '16px', alignSelf: 'flex-start' }}>Concluído</Tag>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            ) : schedEmps.length === 0 ? (
                <div style={{ background: '#111c2e', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '60px 40px', textAlign: 'center' }}>
                    <Empty image={<CalendarOutlined style={{ fontSize: 56, color: '#D0D5DD' }} />} description={<div><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Nenhum funcionário na agenda</div><div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Adicione funcionários para agendar serviços.</div>{isAdminOrSuper && <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddEmpOpen(true)}>Adicionar Funcionário</Button>}</div>} />
                </div>
            ) : !selectedEmpId ? (
                <div style={{ background: '#111c2e', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '60px 40px', textAlign: 'center' }}>
                    <Empty image={<FilterOutlined style={{ fontSize: 56, color: '#D0D5DD' }} />} description={<div><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Selecione um funcionário</div><div style={{ fontSize: 13, color: '#94a3b8' }}>Escolha um funcionário acima para visualizar a agenda.</div></div>} />
                </div>
            ) : (
                /* ── GRADE SEMANAL COM HORÁRIOS ── */
                <div style={{ background: '#111c2e', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    {/* Employee header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: `${selectedEmpColor}08`, borderBottom: `2px solid ${selectedEmpColor}30` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar size={36} style={{ background: selectedEmpColor }} icon={<UserOutlined />} />
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700 }}>
                                    <Tooltip title="Clique para ver a agenda da semana deste funcionário (link compartilhável)">
                                        <span style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }} onClick={() => handleSelectEmployee(selectedEmpId)}>{selectedEmp?.name}</span>
                                    </Tooltip>
                                </div>
                                {selectedEmp?.position && <div style={{ fontSize: 11, color: '#94a3b8' }}>{selectedEmp.position}</div>}
                            </div>
                        </div>
                        {isAdminOrSuper && (
                            <Popconfirm title="Remover da agenda?" onConfirm={() => handleRemoveEmp(selectedEmpId!)} okText="Sim" cancelText="Não">
                                <Button type="text" danger size="small" icon={<DeleteOutlined />}>Remover</Button>
                            </Popconfirm>
                        )}
                    </div>

                    {/* Grid container */}
                    <div style={{ display: 'flex', overflow: 'auto' }}>
                        {/* Time column */}
                        <div style={{ minWidth: 56, borderRight: '1.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                            {/* Header space */}
                            <div style={{ height: 52, borderBottom: '1.5px solid rgba(255,255,255,0.06)' }} />
                            {/* Time labels */}
                            {TIME_SLOTS.map((slot, i) => (
                                <div key={slot} style={{
                                    height: SLOT_HEIGHT,
                                    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                                    padding: '2px 8px 0 0',
                                    fontSize: 10, fontWeight: slot.endsWith(':00') ? 600 : 400,
                                    color: slot.endsWith(':00') ? '#e2e8f0' : '#64748b',
                                    borderBottom: slot.endsWith(':00') ? '1.5px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.04)',
                                }}>
                                    {slot}
                                </div>
                            ))}
                        </div>

                        {/* Day columns */}
                        {weekDates.map((d, di) => {
                            const dk = d.format('YYYY-MM-DD')
                            const isToday = dk === todayStr
                            const dayEvents = evtByDay[dk] || []
                            const dayLayout = computeDayLayout(dayEvents)

                            return (
                                <div key={di} style={{ flex: 1, minWidth: 120, borderRight: di < 6 ? '1.5px solid rgba(255,255,255,0.06)' : undefined }}>
                                    {/* Day header */}
                                    <div style={{
                                        height: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        borderBottom: '1.5px solid rgba(255,255,255,0.06)',
                                        background: isToday ? 'rgba(21, 112, 239, 0.15)' : '#0a1628',
                                    }}>
                                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: isToday ? '#1570EF' : '#64748b', letterSpacing: 0.5 }}>{WEEK_DAYS_SHORT[di]}</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: isToday ? '#1570EF' : '#e2e8f0', lineHeight: 1.2 }}>{d.format('DD')}</div>
                                    </div>

                                    {/* Time slots grid */}
                                    <div style={{ position: 'relative', background: isToday ? 'rgba(21, 112, 239, 0.08)' : undefined }}>
                                        {TIME_SLOTS.map((slot) => (
                                            <div
                                                key={slot}
                                                style={{
                                                    height: SLOT_HEIGHT,
                                                    borderBottom: slot.endsWith(':00') ? '1.5px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.04)',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.1s',
                                                }}
                                                onClick={() => openNew(selectedEmpId || undefined, d, slot)}
                                                onMouseEnter={(e) => { (e.currentTarget).style.background = `${selectedEmpColor}08` }}
                                                onMouseLeave={(e) => { (e.currentTarget).style.background = '' }}
                                            />
                                        ))}

                                        {/* Now indicator line */}
                                        {isToday && nowMinutes >= 0 && nowMinutes <= 24 * 60 && (
                                            <div style={{
                                                position: 'absolute', top: nowLineTop, left: 0, right: 0,
                                                height: 2, background: '#F04438', zIndex: 5,
                                                pointerEvents: 'none',
                                            }}>
                                                <div style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#F04438' }} />
                                            </div>
                                        )}

                                        {/* Events */}
                                        {dayEvents.map(ev => {
                                            const { top, height, left, width } = dayLayout[ev.id] || {
                                                ...getEventPosition(ev),
                                                left: '3%',
                                                width: '94%',
                                            }
                                            const cfg = statusCfg[ev.status] || statusCfg.SCHEDULED
                                            const isCompleted = ev.status === 'COMPLETED'
                                            const minHeight = 86
                                            return (
                                                <div
                                                    key={ev.id}
                                                    onClick={(e) => { e.stopPropagation(); openEdit(ev) }}
                                                    style={{
                                                        position: 'absolute',
                                                        top,
                                                        left,
                                                        width,
                                                        height: Math.max(height - 2, minHeight),
                                                        background: isCompleted ? 'rgba(34, 197, 94, 0.1)' : '#111c2e',
                                                        border: `1px solid ${cfg.color}40`,
                                                        borderLeft: `3px solid ${cfg.color}`,
                                                        borderRadius: 6,
                                                        padding: '4px 6px 6px',
                                                        cursor: 'pointer',
                                                        zIndex: 3,
                                                        overflow: 'hidden',
                                                        transition: 'box-shadow 0.15s, transform 0.1s',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        justifyContent: 'space-between',
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'scale(1.02)' }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'scale(1)' }}
                                                >
                                                    <div>
                                                        {ev.customer && (
                                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {ev.customer.name}
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {ev.title}
                                                        </div>
                                                        <div style={{ fontSize: 9, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 2 }}>
                                                            <ClockCircleOutlined style={{ fontSize: 8 }} />{dayjs(ev.start_time).format('HH:mm')}–{dayjs(ev.end_time).format('HH:mm')}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <Tag color={cfg.tagColor} style={{ fontSize: 8, lineHeight: '14px', padding: '0 4px', margin: 0 }}>{cfg.label}</Tag>
                                                            {ev.amount_charged != null && ev.amount_charged > 0 && <span style={{ fontSize: 9, color: '#4ade80', fontWeight: 600 }}>{fmt(ev.amount_charged)}</span>}
                                                        </div>
                                                        {(ev.status === 'SCHEDULED' || ev.status === 'CONFIRMED') && (
                                                            <Button
                                                                type="primary"
                                                                size="small"
                                                                block
                                                                style={{ marginTop: 3, fontSize: 9, height: 22, borderRadius: 4, background: '#12B76A', borderColor: '#12B76A' }}
                                                                icon={<DollarOutlined style={{ fontSize: 9 }} />}
                                                                onClick={(e) => { e.stopPropagation(); openPayModal(ev) }}
                                                            >
                                                                Concluir
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Add Employee Modal */}
            <Modal title="Adicionar Funcionário" open={addEmpOpen} onCancel={() => { setAddEmpOpen(false); setSelAddEmp(null) }} onOk={handleAddEmp} okText="Adicionar" cancelText="Cancelar" okButtonProps={{ disabled: !selAddEmp }}>
                {availToAdd.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Todos já estão na agenda.</div> : (
                    <Select placeholder="Selecione" value={selAddEmp} onChange={setSelAddEmp} style={{ width: '100%' }} showSearch optionFilterProp="children">
                        {availToAdd.map(e => <Select.Option key={e.id} value={e.id}>{e.name} {e.position ? `— ${e.position}` : ''}</Select.Option>)}
                    </Select>
                )}
            </Modal>

            {/* New/Edit Event Drawer */}
            <Drawer title={editingEvt ? 'Editar Serviço' : 'Agendar Serviço'} width={680} open={drawerOpen}
                onClose={() => { setDrawerOpen(false); setEditingEvt(null) }}
                extra={<Space>
                    {editingEvt && <Popconfirm title="Desativar?" onConfirm={() => { handleDelete(editingEvt.id); setDrawerOpen(false); setEditingEvt(null) }} okText="Sim" cancelText="Não"><Button danger size="small" icon={<DeleteOutlined />}>Desativar</Button></Popconfirm>}
                    <Button size="small" onClick={() => { setDrawerOpen(false); setEditingEvt(null) }}>Cancelar</Button>
                    <Button size="small" type="primary" onClick={handleSave} loading={loading}>Salvar</Button>
                </Space>}>
                <Form form={form} layout="vertical">
                    <Form.Item name="employee_id" label="Funcionário" rules={[{ required: true, message: 'Selecione' }]}>
                        <Select placeholder="Selecione" showSearch optionFilterProp="children">
                            {schedEmps.map(e => (
                                <Select.Option key={e.id} value={e.id}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: empColor[e.id] }} />
                                        {e.name}
                                    </div>
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {bookingEmployeeId && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tabela de Serviços</div>
                            {bookingTablesLoading ? (
                                <div style={{ fontSize: 12, color: '#94a3b8' }}>Buscando tabelas...</div>
                            ) : bookingTablesLoaded && bookingEmpServiceTables.length === 0 ? (
                                <div style={{ fontSize: 12, color: '#f59e0b', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>
                                    Este funcionário não tem tabela de serviços vinculada. Vincule uma tabela ao funcionário antes de agendar.
                                </div>
                            ) : (
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="Selecione a tabela de serviço"
                                    value={bookingSelectedServiceTableId || undefined}
                                    onChange={(val) => { setBookingSelectedServiceTableId(val); form.setFieldValue('service_id', undefined) }}
                                    options={bookingEmpServiceTables.map((t: any) => ({ value: t.id, label: t.name }))}
                                />
                            )}
                        </div>
                    )}

                    {/* Service: choose mode */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tipo de serviço</div>
                        <Radio.Group value={serviceInputMode} onChange={(e) => { setServiceInputMode(e.target.value); if (e.target.value === 'custom') form.setFieldValue('service_id', undefined) }} size="small">
                            <Radio.Button value="select">Serviço cadastrado</Radio.Button>
                            <Radio.Button value="custom">Digitar manualmente</Radio.Button>
                        </Radio.Group>
                    </div>

                    {serviceInputMode === 'select' && (
                        <Form.Item name="service_id" label="Serviço Cadastrado">
                            <Select
                                placeholder={!bookingEmployeeId ? 'Selecione o funcionário primeiro' : !bookingSelectedServiceTableId ? 'Selecione a tabela de serviço acima' : 'Escolha um serviço'}
                                allowClear
                                showSearch
                                optionFilterProp="children"
                                disabled={!bookingSelectedServiceTableId}
                                onChange={(v) => { if (v) onServiceSelect(v) }}
                            >
                                {filteredBookingServices.map((s: any) => <Select.Option key={s.id} value={s.id}>{s.name} — {fmt(s.base_price || 0)} — {s.estimated_duration_minutes || 60}min</Select.Option>)}
                            </Select>
                            {bookingSelectedServiceTableId && filteredBookingServices.length === 0 && (
                                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>Nenhum serviço cadastrado nesta tabela.</div>
                            )}
                        </Form.Item>
                    )}

                    <Form.Item name="title" label="Serviço / Título" rules={[{ required: true, message: 'Informe o serviço' }]}><Input placeholder="Ex: Corte, Tintura, Escova..." /></Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Form.Item name="date" label="Data" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
                        <Form.Item name="time" label="Horário" rules={[{ required: true }]}><TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} /></Form.Item>
                    </div>
                    <Form.Item name="duration_minutes" label="Duração" initialValue="60">
                        <Select>{[15, 30, 45, 60, 90, 120, 180, 240].map(m => <Select.Option key={m} value={String(m)}>{m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${m % 60}min`}</Select.Option>)}</Select>
                    </Form.Item>
                    <Form.Item name="customer_id" label="Cliente"><Select placeholder="(opcional)" allowClear showSearch optionFilterProp="children">{customers.map(c => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}</Select></Form.Item>
                    {editingEvt && <Form.Item name="status" label="Status"><Select>{Object.entries(statusCfg).map(([k, c]) => <Select.Option key={k} value={k}><Tag color={c.tagColor} style={{ margin: 0 }}>{c.label}</Tag></Select.Option>)}</Select></Form.Item>}
                    <Form.Item name="notes" label="Observações"><Input.TextArea rows={2} /></Form.Item>

                    {/* Recurrence section — only for new bookings */}
                    {!editingEvt && (
                        <div style={{ marginTop: 4, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: recurActive ? 14 : 0 }}>
                                <Switch
                                    size="small"
                                    checked={recurActive}
                                    onChange={setRecurActive}
                                    checkedChildren={<SyncOutlined />}
                                />
                                <span style={{ fontSize: 13, fontWeight: 600, color: recurActive ? '#e2e8f0' : '#64748b' }}>
                                    Agendar Recorrência
                                </span>
                                {recurActive && (
                                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                                        Cria múltiplos agendamentos
                                    </span>
                                )}
                            </div>
                            {recurActive && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Frequência</div>
                                        <Radio.Group value={recurType} onChange={(e) => { setRecurType(e.target.value); setRecurWeekdays([]) }} size="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            <Radio.Button value="weekly">Semanal</Radio.Button>
                                            <Radio.Button value="biweekly">Quinzenal</Radio.Button>
                                            <Radio.Button value="every_20_days">20 dias</Radio.Button>
                                            <Radio.Button value="custom">Customizado</Radio.Button>
                                            <Radio.Button value="weekdays">Dias fixos</Radio.Button>
                                        </Radio.Group>
                                    </div>
                                    {recurType === 'custom' && (
                                        <div>
                                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Repetir a cada (dias)</div>
                                            <InputNumber
                                                min={1} max={365} value={recurCustomDays}
                                                onChange={(v) => setRecurCustomDays(Number(v) || 1)}
                                                style={{ width: 120 }} addonAfter="dias"
                                            />
                                        </div>
                                    )}
                                    {recurType === 'weekdays' && (
                                        <div>
                                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Dias da semana</div>
                                            <Checkbox.Group
                                                options={WEEK_DAYS_SHORT.map((d, i) => ({ label: d, value: i }))}
                                                value={recurWeekdays}
                                                onChange={(v) => setRecurWeekdays(v as number[])}
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Período</div>
                                        <Radio.Group
                                            value={recurForever ? 'forever' : 'until_date'}
                                            onChange={(e) => { setRecurForever(e.target.value === 'forever'); if (e.target.value === 'forever') setRecurEndDate(null) }}
                                            size="small"
                                            style={{ marginBottom: 8 }}
                                        >
                                            <Radio.Button value="until_date">Até uma data</Radio.Button>
                                            <Radio.Button value="forever">Para sempre</Radio.Button>
                                        </Radio.Group>
                                        {!recurForever && (
                                            <DatePicker
                                                style={{ width: '100%' }}
                                                format="DD/MM/YYYY"
                                                value={recurEndDate}
                                                onChange={(d) => setRecurEndDate(d)}
                                                disabledDate={(c) => c.isBefore(dayjs(), 'day')}
                                                placeholder="Selecione a data final"
                                            />
                                        )}
                                        {recurForever && (
                                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                                Serão criados agendamentos por 1 ano a partir da data selecionada.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </Form>
            </Drawer>

            {/* Payment / Completion Modal */}
            <Modal
                title={<span style={{ fontSize: 16 }}><CheckCircleOutlined style={{ color: '#12B76A', marginRight: 8 }} />Lançar Pagamento do Serviço</span>}
                open={payOpen}
                onCancel={() => { setPayOpen(false); setPayEvt(null); setExtraProds([]); setAttachFile(null); setAttachDesc('') }}
                footer={[
                    <Button key="cancel" onClick={() => { setPayOpen(false); setPayEvt(null); setExtraProds([]); setAttachFile(null); setAttachDesc('') }}>Cancelar</Button>,
                    <Button key="ok" type="primary" size="large" style={{ background: '#12B76A', borderColor: '#12B76A' }} icon={<CheckCircleOutlined />} onClick={handleCompletePay}>
                        Concluir e Lançar no Caixa
                    </Button>,
                ]}
                width={680}
            >
                {payEvt && (
                    <>
                        <div style={{ padding: 12, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, marginBottom: 16, border: '1px solid #BBF7D0' }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{payEvt.title}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                {dayjs(payEvt.start_time).format('DD/MM/YYYY')} · {dayjs(payEvt.start_time).format('HH:mm')}–{dayjs(payEvt.end_time).format('HH:mm')}
                                {payEvt.employee && <span> · {payEvt.employee.name}</span>}
                                {payEvt.customer && <span> · Cliente: {payEvt.customer.name}</span>}
                            </div>
                        </div>

                        <Form form={payForm} layout="vertical">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <Form.Item name="base_price" label="Valor do Serviço (R$)" rules={[{ required: true }]}>
                                    <InputNumber style={{ width: '100%' }} min={0 as number} step={0.5} precision={2} size="large"
                                        formatter={(v) => `${v}`.replace('.', ',')} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                </Form.Item>
                                <Form.Item name="payment_method" label="Forma de Pagamento" rules={[{ required: true }]}>
                                    <Select size="large">{PAYMENT_METHODS.map(pm => <Select.Option key={pm.value} value={pm.value}>{pm.label}</Select.Option>)}</Select>
                                </Form.Item>
                            </div>
                            {payMethod === 'CARTAO_CREDITO' && (
                                <Form.Item name="installments" label="Parcelas" rules={[{ required: payMethod === 'CARTAO_CREDITO', message: 'Selecione à vista ou parcelado' }]} style={{ marginBottom: 16 }}>
                                    <Select size="large" placeholder="À vista ou parcelado">
                                        <Select.Option value={1}>À vista (1x)</Select.Option>
                                        {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                                            <Select.Option key={n} value={n}>{n}x</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            )}
                            {(payMethod === 'CHEQUE_PRE_DATADO' || payMethod === 'BOLETO') && (
                                <Form.Item name="cheque_condition" label="Condição de Pagamento" rules={[{ required: true, message: 'Selecione a condição' }]} style={{ marginBottom: 16 }}>
                                    <Select size="large" placeholder="Selecione a condição">
                                        {CHEQUE_PRE_DATADO_CONDITIONS.map(c => (
                                            <Select.Option key={c.value} value={c.value}>{c.label}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            )}
                            <div style={{ marginBottom: 16 }}>
                                <Checkbox checked={hasDiscount} onChange={(e) => { setHasDiscount(e.target.checked); if (!e.target.checked) payForm.setFieldsValue({ discount_percent: 0, discount_value: 0 }) }}>
                                    <span style={{ fontWeight: 600 }}><PercentageOutlined style={{ marginRight: 4 }} />Conceder Desconto</span>
                                </Checkbox>
                                {hasDiscount && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8, padding: 12, background: '#FFFBEB', borderRadius: 8, border: '1px solid #FEF3C7' }}>
                                        <Form.Item name="discount_percent" label={<span style={{ color: '#000' }}>Desconto (%)</span>} style={{ margin: 0 }}>
                                            <InputNumber style={{ width: '100%' }} min={0} max={100} step={1} suffix="%" onChange={(v) => { if (v && v > 0) payForm.setFieldValue('discount_value', 0); setDiscountTick(t => t + 1) }} />
                                        </Form.Item>
                                        <Form.Item name="discount_value" label={<span style={{ color: '#000' }}>Desconto (R$)</span>} style={{ margin: 0 }}>
                                            <InputNumber style={{ width: '100%' }} min={0 as number} step={0.5} precision={2}
                                                formatter={(v) => `${v}`.replace('.', ',')} parser={(v) => Number((v || '0').replace(',', '.'))}
                                                onChange={(v) => { if (v && v > 0) payForm.setFieldValue('discount_percent', 0); setDiscountTick(t => t + 1) }} />
                                        </Form.Item>
                                    </div>
                                )}
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <Checkbox checked={isSplitPay} onChange={(e) => setIsSplitPay(e.target.checked)}>
                                    <span style={{ fontWeight: 600 }}><DollarOutlined style={{ marginRight: 4 }} />Pagamento Parcelado / Dividido</span>
                                </Checkbox>
                                {isSplitPay && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8, padding: 12, background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
                                        <Form.Item name="amount_paid" label={<span style={{ color: '#000' }}>Valor pago agora (R$)</span>} style={{ margin: 0 }}>
                                            <InputNumber style={{ width: '100%' }} min={0 as number} step={0.5} precision={2}
                                                formatter={(v) => `${v}`.replace('.', ',')} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                        </Form.Item>
                                        <Form.Item name="remaining_due_date" label={<span style={{ color: '#000' }}>Data restante</span>} style={{ margin: 0 }}>
                                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Quando paga o resto" />
                                        </Form.Item>
                                    </div>
                                )}
                            </div>
                            <Form.Item name="payment_notes" label="Observação do serviço">
                                <Input.TextArea rows={2} placeholder="Ex: Cliente de confiança, parcelado em 2x, etc." />
                            </Form.Item>

                            <div style={{ padding: 12, background: '#0a1628', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                                    <PaperClipOutlined style={{ marginRight: 4 }} /> Anexar comprovante (opcional)
                                </div>
                                <Upload
                                    beforeUpload={(file: File) => { setAttachFile(file); return false }}
                                    onRemove={() => { setAttachFile(null); setAttachDesc('') }}
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    maxCount={1}
                                    fileList={attachFile ? [{ uid: '-1', name: attachFile.name, status: 'done' as const }] : []}
                                >
                                    <Button icon={<UploadOutlined />} size="small">Selecionar arquivo</Button>
                                </Upload>
                                {attachFile && (
                                    <Input
                                        placeholder="Descrição do anexo (obrigatório)"
                                        value={attachDesc}
                                        onChange={(e) => setAttachDesc(e.target.value)}
                                        style={{ marginTop: 8 }}
                                    />
                                )}
                            </div>
                        </Form>

                        <Divider style={{ margin: '12px 0' }} />

                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}><ShoppingOutlined style={{ marginRight: 6 }} />Itens Adicionais</div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Produtos e serviços por tabela + itens manuais além do serviço principal</div>

                            {payAllEmpTables.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    {payTableSections.map((section, idx) => {
                                        const table = payAllEmpTables.find(t => t.id === section.tableId)
                                        const isProduct = table?.type === 'PRODUCT'
                                        const isService = table?.type === 'SERVICE'
                                        const availableForSection = payAllEmpTables.filter(t =>
                                            t.id === section.tableId || !payUsedTableIds.includes(t.id)
                                        )
                                        const sectionItems = extraProds.filter(ep => ep.commission_table_id === section.tableId && !ep.is_manual)
                                        return (
                                            <div key={section.key} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: 'rgba(255,255,255,0.02)' }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: section.tableId ? 10 : 0 }}>
                                                    <Select
                                                        size="small"
                                                        style={{ flex: 1 }}
                                                        placeholder="Selecionar tabela..."
                                                        value={section.tableId || undefined}
                                                        onChange={(val) => {
                                                            setExtraProds(prev => prev.filter(ep => ep.commission_table_id !== section.tableId))
                                                            setPayTableSections(prev => prev.map(s => s.key === section.key ? { ...s, tableId: val } : s))
                                                        }}
                                                        options={availableForSection.map((t: any) => ({
                                                            value: t.id,
                                                            label: `${t.name} — ${t.type === 'PRODUCT' ? 'Produto' : 'Serviço'}`,
                                                        }))}
                                                    />
                                                    {idx > 0 && (
                                                        <Button size="small" danger icon={<DeleteOutlined />}
                                                            onClick={() => {
                                                                setExtraProds(prev => prev.filter(ep => ep.commission_table_id !== section.tableId))
                                                                setPayTableSections(prev => prev.filter(s => s.key !== section.key))
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                {section.tableId && (
                                                    <>
                                                        {sectionItems.length > 0 && (
                                                            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                                                                {sectionItems.map(ep => (
                                                                    <div key={ep.key} style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                                                            {ep.is_service ? (
                                                                                <Select
                                                                                    placeholder="Selecione serviço"
                                                                                    value={ep.service_id || undefined}
                                                                                    onChange={(val) => handleExtraServiceSelect(ep.key, val)}
                                                                                    size="small"
                                                                                    style={{ flex: 1 }}
                                                                                    showSearch
                                                                                    optionFilterProp="children"
                                                                                >
                                                                                    {regServices.filter((s: any) => s.commission_table_id === section.tableId).map((s: any) => (
                                                                                        <Select.Option key={s.id} value={s.id}>{s.name} — {fmt(Number(s.base_price) || 0)}</Select.Option>
                                                                                    ))}
                                                                                </Select>
                                                                            ) : (
                                                                                <Select
                                                                                    placeholder="Selecione produto"
                                                                                    value={ep.product_id || undefined}
                                                                                    onChange={(val) => handleExtraProductSelect(ep.key, val)}
                                                                                    size="small"
                                                                                    style={{ flex: 1 }}
                                                                                    showSearch
                                                                                    optionFilterProp="children"
                                                                                >
                                                                                    {availProds.filter((p: any) => p.commission_table_id === section.tableId).map((p: any) => (
                                                                                        <Select.Option key={p.id} value={p.id}>{p.name} — {fmt(Number(p.sale_price) || 0)}</Select.Option>
                                                                                    ))}
                                                                                </Select>
                                                                            )}
                                                                            <Tag color={ep.is_service ? 'blue' : 'green'} style={{ margin: 0, fontSize: 10 }}>
                                                                                {ep.is_service ? 'Serviço' : 'Produto'}
                                                                            </Tag>
                                                                            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setExtraProds(p => p.filter(x => x.key !== ep.key))} />
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                            <div style={{ flex: 0 }}>
                                                                                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Qtd</div>
                                                                                <InputNumber min={1} value={ep.quantity} onChange={(val) => handleExtraItemChange(ep.key, 'quantity', val || 1)} size="small" style={{ width: 60 }} />
                                                                            </div>
                                                                            <div style={{ flex: 1 }}>
                                                                                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Preço Un.</div>
                                                                                <InputNumber min={0} step={0.5} precision={2} value={ep.unit_price} onChange={(val) => handleExtraItemChange(ep.key, 'unit_price', val || 0)} size="small" style={{ width: '100%' }} formatter={(v) => `${v}`.replace('.', ',')} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                                                            </div>
                                                                            <div style={{ flex: 0 }}>
                                                                                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Desc.%</div>
                                                                                <InputNumber min={0} max={100} value={ep.discount} onChange={(val) => handleExtraItemChange(ep.key, 'discount', val || 0)} size="small" style={{ width: 65 }} />
                                                                            </div>
                                                                            <div style={{ flex: 0, textAlign: 'right', minWidth: 80 }}>
                                                                                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Total</div>
                                                                                <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', lineHeight: '24px' }}>{fmt(ep.total)}</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <Space size="small">
                                                            {isProduct && <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddExtraProduct(section.tableId!)}>Adicionar Produto</Button>}
                                                            {isService && <Button size="small" icon={<PlusOutlined />} onClick={() => handleAddExtraService(section.tableId!)}>Adicionar Serviço</Button>}
                                                        </Space>
                                                    </>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {payUsedTableIds.filter(Boolean).length < payAllEmpTables.length && (
                                        <Button type="dashed" size="small" style={{ width: '100%', marginBottom: 8 }}
                                            onClick={() => setPayTableSections(prev => [...prev, {key: `pts-${Date.now()}`, tableId: null}])}>
                                            + Adicionar outra tabela
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Itens manuais (fora de qualquer tabela) */}
                            {extraProds.filter(ep => ep.is_manual).map(ep => (
                                <div key={ep.key} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                        <Input
                                            placeholder="Nome do item"
                                            value={ep.product_name}
                                            onChange={(e) => handleExtraItemChange(ep.key, 'product_name', e.target.value)}
                                            size="small"
                                            style={{ flex: 1 }}
                                        />
                                        <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>Manual</Tag>
                                        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setExtraProds(p => p.filter(x => x.key !== ep.key))} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{ flex: 0 }}>
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Qtd</div>
                                            <InputNumber min={1} value={ep.quantity} onChange={(val) => handleExtraItemChange(ep.key, 'quantity', val || 1)} size="small" style={{ width: 60 }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Preço Un.</div>
                                            <InputNumber min={0} step={0.5} precision={2} value={ep.unit_price} onChange={(val) => handleExtraItemChange(ep.key, 'unit_price', val || 0)} size="small" style={{ width: '100%' }} formatter={(v) => `${v}`.replace('.', ',')} parser={(v) => Number((v || '0').replace(',', '.'))} />
                                        </div>
                                        <div style={{ flex: 0, textAlign: 'right', minWidth: 80 }}>
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Total</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', lineHeight: '24px' }}>{fmt(ep.total)}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <Button size="small" icon={<PlusOutlined />} onClick={handleAddExtraManual}>Adicionar Item Manual</Button>
                        </div>

                        <div style={{ padding: 12, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 8, border: '1px solid #BBF7D0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
                                <span>Total a Lançar</span>
                                <span style={{ color: '#4ade80' }}>{fmt(calcFinalPrice())}</span>
                            </div>
                            {isSplitPay && (
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                                    Pago agora: {fmt(Number(payForm.getFieldValue('amount_paid')) || 0)} · Restante: {fmt(Math.max(0, calcFinalPrice() - (Number(payForm.getFieldValue('amount_paid')) || 0)))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </Modal>
        </Layout>
    )
}

export default Schedule
