import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button, Select, Table, Tag, Tabs, message, Empty, DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { CardKPI } from '@/components/ui/card-kpi.component'
import { supabase } from '@/supabase/client'
import { useProducts, useEmployees, useCustomers } from '@/hooks/use-data.hooks'
import { useAuth } from '@/hooks/use-auth.hook'
import {
    DollarOutlined,
    ShoppingOutlined,
    BarChartOutlined,
    FilterOutlined,
    ReloadOutlined,
    CustomerServiceOutlined,
    DownloadOutlined,
} from '@ant-design/icons'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { exportTableToPdf } from '@/utils/export-generic-pdf'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import dayjs from 'dayjs'

interface ABCReportRow {
    position: number
    productId: string
    productName: string
    qtdSold: number
    totalRevenue: number
    totalCost: number
    profitMargin: number
    marginPercent: number
    curve: 'A' | 'B' | 'C'
    employeeName: string
}

interface ABCServiceRow {
    position: number
    serviceId: string
    serviceName: string
    qtdSold: number
    totalRevenue: number
    totalCost: number
    profitMargin: number
    marginPercent: number
    curve: 'A' | 'B' | 'C'
    employeeName: string
}

const { RangePicker } = DatePicker

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function SalesReport() {
    const { tenantId, currentUser } = useAuth()
    const effectiveTenantId = tenantId ?? currentUser?.tenant_id
    const { data: employees = [] } = useEmployees()
    const { data: rawProducts } = useProducts()
    const { data: customers = [] } = useCustomers()
    const [messageApi, contextHolder] = message.useMessage()
    const { canView } = usePermissions()

    const [activeTab, setActiveTab] = useState<'PRODUCTS' | 'SERVICES'>('PRODUCTS')

    // Product ABC state
    const [abcData, setAbcData] = useState<ABCReportRow[]>([])
    const [abcLoading, setAbcLoading] = useState(false)
    const [abcDateRange, setAbcDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ])
    const [abcEmployeeFilter, setAbcEmployeeFilter] = useState<string | undefined>(undefined)
    const [abcProductFilter, setAbcProductFilter] = useState<string | undefined>(undefined)
    const [abcClientFilter, setAbcClientFilter] = useState<string | undefined>(undefined)

    // Service ABC state
    const [svcData, setSvcData] = useState<ABCServiceRow[]>([])
    const [svcLoading, setSvcLoading] = useState(false)
    const [svcDateRange, setSvcDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ])
    const [svcEmployeeFilter, setSvcEmployeeFilter] = useState<string | undefined>(undefined)
    const [svcClientFilter, setSvcClientFilter] = useState<string | undefined>(undefined)

    // Export state
    const [productExportModalOpen, setProductExportModalOpen] = useState(false)
    const [serviceExportModalOpen, setServiceExportModalOpen] = useState(false)

    const handleExportProductsExcel = () => {
        if (!abcData.length) return
        import('exceljs').then(({ Workbook }) => {
            const wb = new Workbook()
            const ws = wb.addWorksheet('Curva ABC Produtos')
            ws.addRow(['#', 'Produto', 'Qtd. Vendida', 'Receita', 'Custo', 'Margem', 'Margem %', 'Curva', 'Vendedor'])
            abcData.forEach(r => ws.addRow([r.position, r.productName, r.qtdSold, r.totalRevenue, r.totalCost, r.profitMargin, `${r.marginPercent.toFixed(1)}%`, r.curve, r.employeeName]))
            ws.getRow(1).font = { bold: true }
            wb.xlsx.writeBuffer().then(buf => {
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'curva-abc-produtos.xlsx'; a.click()
                URL.revokeObjectURL(url)
            })
        })
    }

    const handleExportProductsPdf = () => {
        if (!abcData.length) return
        exportTableToPdf({
            title: 'Curva ABC - Produtos',
            subtitle: `Período: ${abcDateRange[0].format('DD/MM/YYYY')} a ${abcDateRange[1].format('DD/MM/YYYY')}`,
            headers: ['#', 'Produto', 'Qtd.', 'Receita', 'Custo', 'Margem', '%', 'Curva', 'Vendedor'],
            rows: abcData.map(r => [r.position, r.productName, r.qtdSold, formatCurrency(r.totalRevenue), formatCurrency(r.totalCost), formatCurrency(r.profitMargin), `${r.marginPercent.toFixed(1)}%`, r.curve, r.employeeName]),
            filename: 'curva-abc-produtos.pdf',
        })
    }

    const handleExportServicesPdf = () => {
        if (!svcData.length) return
        exportTableToPdf({
            title: 'Curva ABC - Serviços',
            subtitle: `Período: ${svcDateRange[0].format('DD/MM/YYYY')} a ${svcDateRange[1].format('DD/MM/YYYY')}`,
            headers: ['#', 'Serviço', 'Qtd.', 'Receita', 'Custo', 'Margem', '%', 'Curva', 'Profissional'],
            rows: svcData.map(r => [r.position, r.serviceName, r.qtdSold, formatCurrency(r.totalRevenue), formatCurrency(r.totalCost), formatCurrency(r.profitMargin), `${r.marginPercent.toFixed(1)}%`, r.curve, r.employeeName]),
            filename: 'curva-abc-servicos.pdf',
        })
    }

    const handleExportServicesExcel = () => {
        if (!svcData.length) return
        import('exceljs').then(({ Workbook }) => {
            const wb = new Workbook()
            const ws = wb.addWorksheet('Curva ABC Serviços')
            ws.addRow(['#', 'Serviço', 'Qtd. Vendida', 'Receita', 'Custo', 'Margem', 'Margem %', 'Curva', 'Profissional'])
            svcData.forEach(r => ws.addRow([r.position, r.serviceName, r.qtdSold, r.totalRevenue, r.totalCost, r.profitMargin, `${r.marginPercent.toFixed(1)}%`, r.curve, r.employeeName]))
            ws.getRow(1).font = { bold: true }
            wb.xlsx.writeBuffer().then(buf => {
                const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'curva-abc-servicos.xlsx'; a.click()
                URL.revokeObjectURL(url)
            })
        })
    }

    // ─── Product ABC fetch ───
    const fetchAbcReport = useCallback(async () => {
        setAbcLoading(true)
        try {
            if (!effectiveTenantId) { setAbcLoading(false); return }
            const startDate = abcDateRange[0].startOf('day').toISOString()
            const endDate = abcDateRange[1].endOf('day').toISOString()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let budgetsQuery: any = (supabase
                .from('budgets') as any)
                .select('id, employee_id, customer_id, created_at')
                .eq('tenant_id', effectiveTenantId)
                .eq('status', 'PAID')
                .eq('is_active', true)
                .gte('created_at', startDate)
                .lte('created_at', endDate)

            if (abcEmployeeFilter) {
                budgetsQuery = budgetsQuery.eq('employee_id', abcEmployeeFilter)
            }
            if (abcClientFilter) {
                budgetsQuery = budgetsQuery.eq('customer_id', abcClientFilter)
            }

            const { data: budgets, error: budgetsErr } = await budgetsQuery as { data: any[] | null; error: any }
            if (budgetsErr) throw budgetsErr
            if (!budgets || budgets.length === 0) {
                setAbcData([])
                setAbcLoading(false)
                return
            }

            const budgetIds = budgets.map((b: any) => b.id)
            const employeeMap = new Map<string, string>()
            budgets.forEach((b: any) => {
                if (b.employee_id) {
                    const emp = (employees as any[]).find((e: any) => e.id === b.employee_id)
                    employeeMap.set(b.id, emp?.name || 'Desconhecido')
                } else {
                    employeeMap.set(b.id, 'Sem vendedor')
                }
            })

            let itemsQuery = supabase
                .from('budget_items')
                .select('budget_id, product_id, quantity, unit_price, discount, product:products(id, name, cost_total)')
                .in('budget_id', budgetIds)

            if (abcProductFilter) {
                itemsQuery = itemsQuery.eq('product_id', abcProductFilter)
            }

            const { data: items, error: itemsErr } = await itemsQuery
            if (itemsErr) throw itemsErr

            const productAgg = new Map<string, {
                productId: string
                productName: string
                qtdSold: number
                totalRevenue: number
                totalCost: number
                employees: Set<string>
            }>()

            for (const item of (items || [])) {
                const product = (item as any).product
                if (!product) continue
                const productId = product.id
                const productName = product.name || 'Sem nome'
                const qty = Number(item.quantity) || 1
                const unitPrice = Number(item.unit_price) || 0
                const discount = Number(item.discount) || 0
                const revenue = (unitPrice * qty) - discount
                const costPerUnit = Number(product.cost_total) || 0
                const totalCost = costPerUnit * qty

                const existing = productAgg.get(productId)
                const empName = employeeMap.get(item.budget_id) || 'Sem vendedor'

                if (existing) {
                    existing.qtdSold += qty
                    existing.totalRevenue += revenue
                    existing.totalCost += totalCost
                    existing.employees.add(empName)
                } else {
                    productAgg.set(productId, {
                        productId,
                        productName,
                        qtdSold: qty,
                        totalRevenue: revenue,
                        totalCost: totalCost,
                        employees: new Set([empName]),
                    })
                }
            }

            const sorted = Array.from(productAgg.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
            const grandTotal = sorted.reduce((sum, p) => sum + p.totalRevenue, 0)

            let cumulative = 0
            const rows: ABCReportRow[] = sorted.map((p, idx) => {
                cumulative += p.totalRevenue
                const cumulativePercent = grandTotal > 0 ? (cumulative / grandTotal) * 100 : 0
                let curve: 'A' | 'B' | 'C' = 'C'
                if (cumulativePercent <= 80) curve = 'A'
                else if (cumulativePercent <= 95) curve = 'B'

                const profitMargin = p.totalRevenue - p.totalCost
                const marginPercent = p.totalRevenue > 0 ? (profitMargin / p.totalRevenue) * 100 : 0

                return {
                    position: idx + 1,
                    productId: p.productId,
                    productName: p.productName,
                    qtdSold: p.qtdSold,
                    totalRevenue: p.totalRevenue,
                    totalCost: p.totalCost,
                    profitMargin,
                    marginPercent,
                    curve,
                    employeeName: Array.from(p.employees).join(', '),
                }
            })

            setAbcData(rows)
        } catch (error: any) {
            messageApi.error('Erro ao carregar relatório ABC: ' + (error.message || 'Erro desconhecido'))
        } finally {
            setAbcLoading(false)
        }
    }, [abcDateRange, abcEmployeeFilter, abcProductFilter, abcClientFilter, employees, effectiveTenantId, messageApi])

    // ─── Service ABC fetch ───
    const fetchSvcReport = useCallback(async () => {
        setSvcLoading(true)
        try {
            if (!effectiveTenantId) { setSvcLoading(false); return }
            const startDate = svcDateRange[0].startOf('day').format('YYYY-MM-DD')
            const endDate = svcDateRange[1].endOf('day').format('YYYY-MM-DD')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query: any = (supabase as any)
                .from('completed_services')
                .select('id, service_id, service_name, employee_id, customer_id, base_price, final_price, total_revenue, service_date')
                .eq('tenant_id', effectiveTenantId)
                .gte('service_date', startDate)
                .lte('service_date', endDate)

            if (svcEmployeeFilter) {
                query = query.eq('employee_id', svcEmployeeFilter)
            }
            if (svcClientFilter) {
                query = query.eq('customer_id', svcClientFilter)
            }

            const { data: services, error: svcErr } = await query as { data: any[] | null; error: any }
            if (svcErr) throw svcErr
            if (!services || services.length === 0) {
                setSvcData([])
                setSvcLoading(false)
                return
            }

            // Aggregate by service_id (or service_name for unlinked services)
            const serviceAgg = new Map<string, {
                serviceId: string
                serviceName: string
                qtdSold: number
                totalRevenue: number
                totalCost: number
                employees: Set<string>
            }>()

            for (const svc of services) {
                const serviceKey = svc.service_id || `name:${svc.service_name}`
                const serviceName = svc.service_name || 'Sem nome'
                const revenue = Number(svc.total_revenue) || Number(svc.final_price) || 0
                const cost = Number(svc.base_price) || 0

                const empName = svc.employee_id
                    ? ((employees as any[]).find((e: any) => e.id === svc.employee_id)?.name || 'Desconhecido')
                    : 'Sem vendedor'

                const existing = serviceAgg.get(serviceKey)
                if (existing) {
                    existing.qtdSold += 1
                    existing.totalRevenue += revenue
                    existing.totalCost += cost
                    existing.employees.add(empName)
                } else {
                    serviceAgg.set(serviceKey, {
                        serviceId: svc.service_id || svc.id,
                        serviceName,
                        qtdSold: 1,
                        totalRevenue: revenue,
                        totalCost: cost,
                        employees: new Set([empName]),
                    })
                }
            }

            const sorted = Array.from(serviceAgg.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
            const grandTotal = sorted.reduce((sum, s) => sum + s.totalRevenue, 0)

            let cumulative = 0
            const rows: ABCServiceRow[] = sorted.map((s, idx) => {
                cumulative += s.totalRevenue
                const cumulativePercent = grandTotal > 0 ? (cumulative / grandTotal) * 100 : 0
                let curve: 'A' | 'B' | 'C' = 'C'
                if (cumulativePercent <= 80) curve = 'A'
                else if (cumulativePercent <= 95) curve = 'B'

                const profitMargin = s.totalRevenue - s.totalCost
                const marginPercent = s.totalRevenue > 0 ? (profitMargin / s.totalRevenue) * 100 : 0

                return {
                    position: idx + 1,
                    serviceId: s.serviceId,
                    serviceName: s.serviceName,
                    qtdSold: s.qtdSold,
                    totalRevenue: s.totalRevenue,
                    totalCost: s.totalCost,
                    profitMargin,
                    marginPercent,
                    curve,
                    employeeName: Array.from(s.employees).join(', '),
                }
            })

            setSvcData(rows)
        } catch (error: any) {
            messageApi.error('Erro ao carregar relatório ABC de serviços: ' + (error.message || 'Erro desconhecido'))
        } finally {
            setSvcLoading(false)
        }
    }, [svcDateRange, svcEmployeeFilter, svcClientFilter, employees, effectiveTenantId, messageApi])

    // Auto-fetch on tab switch and filter change
    useEffect(() => {
        if (activeTab === 'PRODUCTS') fetchAbcReport()
    }, [activeTab, fetchAbcReport])

    useEffect(() => {
        if (activeTab === 'SERVICES') fetchSvcReport()
    }, [activeTab, fetchSvcReport])

    // ─── KPIs ───
    const abcTotalRevenue = useMemo(() => abcData.reduce((sum, r) => sum + r.totalRevenue, 0), [abcData])
    const abcTotalProducts = abcData.length
    const abcAvgMargin = useMemo(() => {
        if (abcData.length === 0) return 0
        return abcData.reduce((sum, r) => sum + r.marginPercent, 0) / abcData.length
    }, [abcData])

    const svcTotalRevenue = useMemo(() => svcData.reduce((sum, r) => sum + r.totalRevenue, 0), [svcData])
    const svcTotalServices = svcData.length
    const svcAvgMargin = useMemo(() => {
        if (svcData.length === 0) return 0
        return svcData.reduce((sum, r) => sum + r.marginPercent, 0) / svcData.length
    }, [svcData])

    // ─── Product columns ───
    const abcColumns: ColumnsType<ABCReportRow> = [
        {
            title: 'Pos.',
            dataIndex: 'position',
            key: 'position',
            width: 60,
            align: 'center',
            render: (v: number) => <strong>{v}</strong>,
        },
        {
            title: 'Produto',
            dataIndex: 'productName',
            key: 'productName',
            sorter: (a, b) => a.productName.localeCompare(b.productName),
            render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
        },
        {
            title: 'Qtd Vendida',
            dataIndex: 'qtdSold',
            key: 'qtdSold',
            width: 110,
            align: 'right',
            sorter: (a, b) => a.qtdSold - b.qtdSold,
            render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
        },
        {
            title: 'Receita Total',
            dataIndex: 'totalRevenue',
            key: 'totalRevenue',
            width: 140,
            align: 'right',
            sorter: (a, b) => a.totalRevenue - b.totalRevenue,
            render: (v: number) => <span style={{ color: '#4ade80', fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
        {
            title: 'Custo Total',
            dataIndex: 'totalCost',
            key: 'totalCost',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.totalCost - b.totalCost,
            render: (v: number) => formatCurrency(v),
        },
        {
            title: 'Margem (R$)',
            dataIndex: 'profitMargin',
            key: 'profitMargin',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.profitMargin - b.profitMargin,
            render: (v: number) => (
                <span style={{ color: v >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {formatCurrency(v)}
                </span>
            ),
        },
        {
            title: 'Margem %',
            dataIndex: 'marginPercent',
            key: 'marginPercent',
            width: 100,
            align: 'right',
            sorter: (a, b) => a.marginPercent - b.marginPercent,
            render: (v: number) => (
                <span style={{ color: v >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {v.toFixed(1)}%
                </span>
            ),
        },
        {
            title: 'Curva',
            dataIndex: 'curve',
            key: 'curve',
            width: 80,
            align: 'center',
            filters: [
                { text: 'A', value: 'A' },
                { text: 'B', value: 'B' },
                { text: 'C', value: 'C' },
            ],
            onFilter: (value, record) => record.curve === value,
            render: (curve: 'A' | 'B' | 'C') => {
                const colors = { A: 'green', B: 'orange', C: 'red' }
                return <Tag color={colors[curve]} style={{ fontWeight: 700, fontSize: 14 }}>{curve}</Tag>
            },
        },
        {
            title: 'Vendedor',
            dataIndex: 'employeeName',
            key: 'employeeName',
            width: 160,
            ellipsis: true,
        },
    ]

    // ─── Service columns ───
    const svcColumns: ColumnsType<ABCServiceRow> = [
        {
            title: 'Pos.',
            dataIndex: 'position',
            key: 'position',
            width: 60,
            align: 'center',
            render: (v: number) => <strong>{v}</strong>,
        },
        {
            title: 'Serviço',
            dataIndex: 'serviceName',
            key: 'serviceName',
            sorter: (a, b) => a.serviceName.localeCompare(b.serviceName),
            render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>,
        },
        {
            title: 'Qtd Vendida',
            dataIndex: 'qtdSold',
            key: 'qtdSold',
            width: 110,
            align: 'right',
            sorter: (a, b) => a.qtdSold - b.qtdSold,
            render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
        },
        {
            title: 'Receita Total',
            dataIndex: 'totalRevenue',
            key: 'totalRevenue',
            width: 140,
            align: 'right',
            sorter: (a, b) => a.totalRevenue - b.totalRevenue,
            render: (v: number) => <span style={{ color: '#4ade80', fontWeight: 600 }}>{formatCurrency(v)}</span>,
        },
        {
            title: 'Custo Total',
            dataIndex: 'totalCost',
            key: 'totalCost',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.totalCost - b.totalCost,
            render: (v: number) => formatCurrency(v),
        },
        {
            title: 'Margem (R$)',
            dataIndex: 'profitMargin',
            key: 'profitMargin',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.profitMargin - b.profitMargin,
            render: (v: number) => (
                <span style={{ color: v >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {formatCurrency(v)}
                </span>
            ),
        },
        {
            title: 'Margem %',
            dataIndex: 'marginPercent',
            key: 'marginPercent',
            width: 100,
            align: 'right',
            sorter: (a, b) => a.marginPercent - b.marginPercent,
            render: (v: number) => (
                <span style={{ color: v >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {v.toFixed(1)}%
                </span>
            ),
        },
        {
            title: 'Curva',
            dataIndex: 'curve',
            key: 'curve',
            width: 80,
            align: 'center',
            filters: [
                { text: 'A', value: 'A' },
                { text: 'B', value: 'B' },
                { text: 'C', value: 'C' },
            ],
            onFilter: (value, record) => record.curve === value,
            render: (curve: 'A' | 'B' | 'C') => {
                const colors = { A: 'green', B: 'orange', C: 'red' }
                return <Tag color={colors[curve]} style={{ fontWeight: 700, fontSize: 14 }}>{curve}</Tag>
            },
        },
        {
            title: 'Vendedor',
            dataIndex: 'employeeName',
            key: 'employeeName',
            width: 160,
            ellipsis: true,
        },
    ]

    // Products list for ABC filter dropdown
    const allProducts = useMemo(() => {
        return (rawProducts || []).map((p: any) => ({ value: p.id, label: p.name }))
    }, [rawProducts])

    // Customers list for filter dropdown
    const allCustomers = useMemo(() => {
        return (customers || []).map((c: any) => ({ value: c.id, label: c.name }))
    }, [customers])

    // Summary row renderer for products
    const renderProductSummary = () => {
        if (abcData.length === 0) return null
        const totalRev = abcData.reduce((s, r) => s + r.totalRevenue, 0)
        const totalCst = abcData.reduce((s, r) => s + r.totalCost, 0)
        const totalProfit = totalRev - totalCst
        const totalMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0
        return (
            <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={2}>TOTAL</Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                        {abcData.reduce((s, r) => s + r.qtdSold, 0)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                        <span style={{ color: '#4ade80' }}>{formatCurrency(totalRev)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                        {formatCurrency(totalCst)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                        <span style={{ color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}>
                            {formatCurrency(totalProfit)}
                        </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                        <span style={{ color: totalMargin >= 0 ? '#4ade80' : '#f87171' }}>
                            {totalMargin.toFixed(1)}%
                        </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} colSpan={2} />
                </Table.Summary.Row>
            </Table.Summary>
        )
    }

    // Summary row renderer for services
    const renderServiceSummary = () => {
        if (svcData.length === 0) return null
        const totalRev = svcData.reduce((s, r) => s + r.totalRevenue, 0)
        const totalCst = svcData.reduce((s, r) => s + r.totalCost, 0)
        const totalProfit = totalRev - totalCst
        const totalMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0
        return (
            <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={2}>TOTAL</Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                        {svcData.reduce((s, r) => s + r.qtdSold, 0)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                        <span style={{ color: '#4ade80' }}>{formatCurrency(totalRev)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                        {formatCurrency(totalCst)}
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                        <span style={{ color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}>
                            {formatCurrency(totalProfit)}
                        </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                        <span style={{ color: totalMargin >= 0 ? '#4ade80' : '#f87171' }}>
                            {totalMargin.toFixed(1)}%
                        </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} colSpan={2} />
                </Table.Summary.Row>
            </Table.Summary>
        )
    }

    if (!canView(MODULES.SALES_REPORT)) {
        return (
            <Layout title={PAGE_TITLES.SALES_REPORT}>
                <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
            </Layout>
        )
    }

    return (
        <Layout title={PAGE_TITLES.SALES_REPORT} subtitle="Curva ABC de produtos e serviços vendidos">
            {contextHolder}

            <div className="pc-card--table">
                <Tabs
                    activeKey={activeTab}
                    onChange={(k) => setActiveTab(k as 'PRODUCTS' | 'SERVICES')}
                    items={[
                        {
                            key: 'PRODUCTS',
                            label: (
                                <span><ShoppingOutlined style={{ marginRight: 6 }} />Curva ABC - Produtos</span>
                            ),
                        },
                        {
                            key: 'SERVICES',
                            label: (
                                <span><CustomerServiceOutlined style={{ marginRight: 6 }} />Curva ABC - Serviços</span>
                            ),
                        },
                    ]}
                />

                {activeTab === 'PRODUCTS' ? (
                    <div>
                        {/* Product KPIs */}
                        <div className="kpi-grid" style={{ marginBottom: 20 }}>
                            <CardKPI title="Receita Total" value={formatCurrency(abcTotalRevenue)} icon={<DollarOutlined />} variant="green" />
                            <CardKPI title="Total Produtos" value={abcTotalProducts} icon={<ShoppingOutlined />} variant="blue" />
                            <CardKPI title="Margem Média" value={`${abcAvgMargin.toFixed(1)}%`} icon={<BarChartOutlined />} variant="orange" />
                        </div>

                        {/* Product Filters */}
                        <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#94a3b8' }} />
                                <span style={{ color: '#94a3b8', fontSize: 13 }}>Filtros:</span>
                            </div>
                            <RangePicker
                                value={abcDateRange}
                                onChange={(dates) => {
                                    if (dates && dates[0] && dates[1]) {
                                        setAbcDateRange([dates[0], dates[1]])
                                    }
                                }}
                                format="DD/MM/YYYY"
                                allowClear={false}
                                style={{ minWidth: 260 }}
                            />
                            <Select
                                placeholder="Vendedor"
                                value={abcEmployeeFilter}
                                onChange={setAbcEmployeeFilter}
                                allowClear
                                style={{ minWidth: 200 }}
                                options={[
                                    ...(employees as any[]).map((e: any) => ({ value: e.id, label: e.name })),
                                ]}
                            />
                            <Select
                                placeholder="Produto"
                                value={abcProductFilter}
                                onChange={setAbcProductFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allProducts}
                            />
                            <Select
                                placeholder="Cliente"
                                value={abcClientFilter}
                                onChange={setAbcClientFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allCustomers}
                            />
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchAbcReport}
                                loading={abcLoading}
                            >
                                Atualizar
                            </Button>
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => setProductExportModalOpen(true)}
                                disabled={!abcData.length}
                                style={{ marginLeft: 'auto' }}
                            >
                                Exportar
                            </Button>
                        </div>

                        <ExportFormatModal
                            open={productExportModalOpen}
                            onClose={() => setProductExportModalOpen(false)}
                            onExportExcel={handleExportProductsExcel}
                            onExportPdf={handleExportProductsPdf}
                            title="Exportar Curva ABC - Produtos"
                        />

                        {/* Product Table */}
                        <Table<ABCReportRow>
                            columns={abcColumns}
                            dataSource={abcData}
                            rowKey="productId"
                            pagination={{ pageSize: 20, showTotal: (t) => `${t} produtos` }}
                            size="middle"
                            loading={abcLoading}
                            scroll={{ x: 1000 }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Nenhuma venda encontrada no período selecionado. Ajuste os filtros ou registre vendas via orçamentos."
                                    />
                                ),
                            }}
                            summary={renderProductSummary}
                        />
                    </div>
                ) : (
                    <div>
                        {/* Service KPIs */}
                        <div className="kpi-grid" style={{ marginBottom: 20 }}>
                            <CardKPI title="Receita Total" value={formatCurrency(svcTotalRevenue)} icon={<DollarOutlined />} variant="green" />
                            <CardKPI title="Total Serviços" value={svcTotalServices} icon={<CustomerServiceOutlined />} variant="blue" />
                            <CardKPI title="Margem Média" value={`${svcAvgMargin.toFixed(1)}%`} icon={<BarChartOutlined />} variant="orange" />
                        </div>

                        {/* Service Filters */}
                        <div className="filter-bar" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FilterOutlined style={{ color: '#94a3b8' }} />
                                <span style={{ color: '#94a3b8', fontSize: 13 }}>Filtros:</span>
                            </div>
                            <RangePicker
                                value={svcDateRange}
                                onChange={(dates) => {
                                    if (dates && dates[0] && dates[1]) {
                                        setSvcDateRange([dates[0], dates[1]])
                                    }
                                }}
                                format="DD/MM/YYYY"
                                allowClear={false}
                                style={{ minWidth: 260 }}
                            />
                            <Select
                                placeholder="Vendedor"
                                value={svcEmployeeFilter}
                                onChange={setSvcEmployeeFilter}
                                allowClear
                                style={{ minWidth: 200 }}
                                options={[
                                    ...(employees as any[]).map((e: any) => ({ value: e.id, label: e.name })),
                                ]}
                            />
                            <Select
                                placeholder="Cliente"
                                value={svcClientFilter}
                                onChange={setSvcClientFilter}
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                style={{ minWidth: 200 }}
                                options={allCustomers}
                            />
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={fetchSvcReport}
                                loading={svcLoading}
                            >
                                Atualizar
                            </Button>
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => setServiceExportModalOpen(true)}
                                disabled={!svcData.length}
                                style={{ marginLeft: 'auto' }}
                            >
                                Exportar
                            </Button>
                        </div>

                        <ExportFormatModal
                            open={serviceExportModalOpen}
                            onClose={() => setServiceExportModalOpen(false)}
                            onExportExcel={handleExportServicesExcel}
                            onExportPdf={handleExportServicesPdf}
                            title="Exportar Curva ABC - Serviços"
                        />

                        {/* Service Table */}
                        <Table<ABCServiceRow>
                            columns={svcColumns}
                            dataSource={svcData}
                            rowKey="serviceId"
                            pagination={{ pageSize: 20, showTotal: (t) => `${t} serviços` }}
                            size="middle"
                            loading={svcLoading}
                            scroll={{ x: 1000 }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="Nenhum serviço concluído encontrado no período selecionado. Serviços concluídos na Agenda aparecem aqui."
                                    />
                                ),
                            }}
                            summary={renderServiceSummary}
                        />
                    </div>
                )}
            </div>
        </Layout>
    )
}

export default SalesReport
