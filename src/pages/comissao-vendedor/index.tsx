import React, { useState, useEffect, useMemo } from 'react'
import { Select, Table, Tag, DatePicker, Space, message, Button, Statistic, Card, Empty, Tooltip, Drawer } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { exportCommissionToExcel } from '@/utils/export-commission-excel'
import { exportCommissionToPdf } from '@/utils/export-commission-pdf'
import {
  FileExcelOutlined,
  FilePdfOutlined,
  TeamOutlined,
  DollarOutlined,
  PercentageOutlined,
  DownloadOutlined,
  SplitCellsOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { formatBRL } from '@/utils/formatters'

const formatCurrency = formatBRL

// Métodos que exigem confirmação manual de recebimento antes de entrar na comissão confirmada
const PENDING_PAYMENT_METHODS = ['BOLETO', 'CHEQUE_PRE_DATADO']

function isPendingEntry(e: { paid_date?: string | null; payment_method?: string | null }): boolean {
  return PENDING_PAYMENT_METHODS.includes((e.payment_method || '').toUpperCase()) && !e.paid_date
}

interface CommissionDetailRow {
  key: string
  type: 'VENDA' | 'SERVIÇO'
  description: string
  client_name: string
  date: string
  value: number
  commission_percent: number
  commission_amount: number
  is_installment?: boolean
  pending?: boolean
  installment_label?: string
  sale_code?: string
}

interface CommissionRow {
  employee_id: string
  name: string
  commission_percent: number
  avg_commission_percent: number
  base_revenue: number
  commission_value: number
  pending_revenue: number
  pending_commission: number
  payment_mode: 'FULL' | 'INSTALLMENT'
  detail_rows: CommissionDetailRow[]
}

export default function CommissionPage() {
  const { canView } = usePermissions()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(dayjs())
  const [employees, setEmployees] = useState<{ id: string; name: string; commission_percent: number }[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>(undefined)
  const [commissionData, setCommissionData] = useState<CommissionRow[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRow, setDrawerRow] = useState<CommissionRow | null>(null)
  const [saleDrawerOpen, setSaleDrawerOpen] = useState(false)
  const [saleDrawerData, setSaleDrawerData] = useState<any>(null)
  const [saleDrawerLoading, setSaleDrawerLoading] = useState(false)

  // Fetch employees list for the filter dropdown (all active)
  useEffect(() => {
    ;(async () => {
      const tenantId = await getTenantId()
      if (!tenantId) return
      const { data: emps } = await supabase
        .from('employees')
        .select('id, name, commission_percent')
        .eq('status', 'ACTIVE')
        .eq('is_active', true)
      setEmployees((emps || []).map((e: any) => ({ id: e.id, name: e.name, commission_percent: Number(e.commission_percent) || 0 })))
    })()
  }, [])

  // Fetch commission data whenever selected month changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const tenantId = await getTenantId()
        if (!tenantId) return

        const start = month.startOf('month').format('YYYY-MM-DD')
        const end = month.endOf('month').format('YYYY-MM-DD')

        // Fetch employees including commission_payment_mode
        const { data: emps } = await supabase
          .from('employees')
          .select('id, name, commission_percent, commission_payment_mode')
          .eq('status', 'ACTIVE')
          .eq('is_active', true)

        const allEmployees = (emps || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          commission_percent: Number(e.commission_percent) || 0,
          payment_mode: (e.commission_payment_mode as 'FULL' | 'INSTALLMENT') || 'FULL',
        }))

        if (allEmployees.length === 0) {
          if (!cancelled) setCommissionData([])
          return
        }

        const empMap = new Map(
          allEmployees.map((e) => [
            e.id,
            {
              name: e.name,
              commission_percent: e.commission_percent,
              payment_mode: e.payment_mode,
              base_revenue: 0,
              commission_value: 0,
              pending_revenue: 0,
              pending_commission: 0,
              sum_weighted_pct: 0,
              sum_value: 0,
              detail_rows: [] as CommissionDetailRow[],
            },
          ]),
        )

        // ── Completed services (original select — safe) ──
        const { data: services } = await supabase
          .from('completed_services')
          .select('id, employee_id, total_revenue, service_id, discount_percent')
          .eq('is_active', true)
          .gte('service_date', start)
          .lte('service_date', end)

        const serviceIds = [...new Set((services || []).map((s: any) => s.service_id).filter(Boolean))]
        let svcCommMap = new Map<string, number>()
        let svcProfitMap = new Map<string, number>()
        let svcNameMap = new Map<string, string>()
        if (serviceIds.length > 0) {
          const { data: svcs } = await supabase.from('services').select('id, commission_percent, profit_percent, name').in('id', serviceIds)
          svcCommMap = new Map((svcs || []).map((s: any) => [s.id, Number(s.commission_percent) || 0]))
          svcProfitMap = new Map((svcs || []).map((s: any) => [s.id, Number(s.profit_percent) || 0]))
          svcNameMap = new Map((svcs || []).map((s: any) => [s.id, s.name || 'Serviço']))
        }

        // ── Sales (original select — safe) ──
        let salesData: any[] = []
        try {
          const { data } = await supabase
            .from('sales')
            .select('id, sale_code, final_value, budget_id, employee_id, sale_date, sale_type, commission_amount, installments')
            .eq('is_active', true)
          salesData = data || []
        } catch {
          const { data } = await supabase
            .from('sales')
            .select('id, sale_code, final_value, budget_id, sale_date, installments')
            .eq('is_active', true)
          salesData = (data || []).map((s: any) => ({ ...s, employee_id: null }))
        }

        const saleCodeMap = new Map<string, string>()
        for (const s of salesData) {
          saleCodeMap.set(s.id, s.sale_code || s.id.slice(0, 8))
        }

        // Get all sale_items for product commission lookup
        const allSaleIds = salesData.map((s: any) => s.id)
        let allSaleItemRows: any[] = []
        let allProdCommMap = new Map<string, number>()
        let prodNameMap = new Map<string, string>()
        if (allSaleIds.length > 0) {
          const { data: saleItemRows } = await supabase.from('sale_items').select('sale_id, product_id').in('sale_id', allSaleIds)
          allSaleItemRows = saleItemRows || []
          const productIds = [...new Set(allSaleItemRows.map((si: any) => si.product_id).filter(Boolean))]
          if (productIds.length > 0) {
            const { data: prods } = await supabase.from('products').select('id, commission_percent, name').in('id', productIds)
            allProdCommMap = new Map((prods || []).map((p: any) => [p.id, Number(p.commission_percent) || 0]))
            prodNameMap = new Map((prods || []).map((p: any) => [p.id, p.name || 'Produto']))
          }
        }

        // Map sale_id → max product commission & product names
        const saleProdCommMap = new Map<string, number>()
        const saleItemNamesMap = new Map<string, string[]>()
        for (const si of allSaleItemRows) {
          const cur = saleProdCommMap.get(si.sale_id) || 0
          const pComm = si.product_id ? (allProdCommMap.get(si.product_id) || 0) : 0
          if (pComm > cur) saleProdCommMap.set(si.sale_id, pComm)
          if (si.product_id) {
            const names = saleItemNamesMap.get(si.sale_id) || []
            const pName = prodNameMap.get(si.product_id) || 'Produto'
            if (!names.includes(pName)) names.push(pName)
            saleItemNamesMap.set(si.sale_id, names)
          }
        }

        // Fetch cash_entries for all sales (to support INSTALLMENT distribution + pending detection)
        let cashEntriesBySale = new Map<string, { due_date: string; amount: number; paid_date: string | null; payment_method: string | null }[]>()
        if (allSaleIds.length > 0) {
          try {
            const { data: ceRows } = await supabase
              .from('cash_entries')
              .select('origin_id, amount, due_date, paid_date, payment_method')
              .eq('origin_type', 'SALE')
              .eq('type', 'INCOME')
              .in('origin_id', allSaleIds)
            for (const ce of ceRows || []) {
              if (!ce.origin_id || !ce.due_date) continue
              const existing = cashEntriesBySale.get(ce.origin_id) || []
              existing.push({
                due_date: ce.due_date,
                amount: Number(ce.amount) || 0,
                paid_date: (ce as any).paid_date || null,
                payment_method: (ce as any).payment_method || null,
              })
              cashEntriesBySale.set(ce.origin_id, existing)
            }
          } catch {
            // Fallback to FULL mode
          }
        }

        // Budget sales / direct sales split
        const budgetSales = salesData.filter((s: any) => s.budget_id)
        const directSales = salesData.filter((s: any) => !s.budget_id && s.employee_id)

        // ── Optional: fetch client names via separate queries (safe — errors ignored) ──
        // These use separate queries so failures do NOT break the main calculation
        const clientNameMap = new Map<string, string>()
        const budgetClientRefMap = new Map<string, string>() // budget_id → customer_id
        const saleClientRefMap = new Map<string, string>()   // sale_id → customer_id
        const svcClientRefMap = new Map<string, string>()    // completed_service id → customer_id

        try {
          const allClientIds = new Set<string>()

          // Budget customer_ids
          if (budgetSales.length > 0) {
            const bIds = [...new Set(budgetSales.map((s: any) => s.budget_id).filter(Boolean))]
            const { data: bData, error: bErr } = await supabase.from('budgets').select('id, customer_id').in('id', bIds)
            if (!bErr && bData) {
              for (const b of bData) {
                if (b.customer_id) { budgetClientRefMap.set(b.id, b.customer_id); allClientIds.add(b.customer_id) }
              }
            }
          }

          // Direct sale customer_ids
          if (directSales.length > 0) {
            const sIds = directSales.map((s: any) => s.id).filter(Boolean)
            const { data: sData, error: sErr } = await supabase.from('sales').select('id, customer_id').in('id', sIds)
            if (!sErr && sData) {
              for (const s of sData) {
                if (s.customer_id) { saleClientRefMap.set(s.id, s.customer_id); allClientIds.add(s.customer_id) }
              }
            }
          }

          // Completed service customer_ids
          const svcRowIds = (services || []).map((s: any) => s.id).filter(Boolean)
          if (svcRowIds.length > 0) {
            const { data: csData, error: csErr } = await supabase.from('completed_services').select('id, customer_id').in('id', svcRowIds)
            if (!csErr && csData) {
              for (const cs of csData) {
                if (cs.customer_id) { svcClientRefMap.set(cs.id, cs.customer_id); allClientIds.add(cs.customer_id) }
              }
            }
          }

          // Resolve customer names
          if (allClientIds.size > 0) {
            const { data: customers } = await supabase.from('customers').select('id, name').in('id', [...allClientIds])
            for (const c of customers || []) { if (c.id) clientNameMap.set(c.id, c.name || '-') }
          }
        } catch { /* customer names are optional — commission calculation continues */ }

        // ── Budgets (original select — safe) ──
        let budgetEmp = new Map<string, string>()
        let budgetCommMap = new Map<string, number>()

        if (budgetSales.length) {
          const budgetIds = [...new Set(budgetSales.map((s: any) => s.budget_id).filter(Boolean))]
          const { data: budgets } = await supabase.from('budgets').select('id, employee_id, commission_amount').in('id', budgetIds)
          budgetEmp = new Map((budgets || []).map((b: any) => [b.id, b.employee_id]))
          budgetCommMap = new Map((budgets || []).map((b: any) => [b.id, Number(b.commission_amount) || 0]))

          for (const sale of budgetSales as any[]) {
            const empId = budgetEmp.get(sale.budget_id) || sale.employee_id
            if (!empId) continue
            const emp = empMap.get(empId)
            if (!emp) continue

            const storedCommission = Number(sale.commission_amount || 0) || budgetCommMap.get(sale.budget_id) || 0
            const finalValue = Number(sale.final_value) || 0
            const saleDate = (sale.sale_date || '').substring(0, 10)
            const productNames = saleItemNamesMap.get(sale.id) || []
            const description = productNames.length > 0 ? productNames.join(', ') : 'Venda'
            const clientId = budgetClientRefMap.get(sale.budget_id)
            const clientName = clientId ? (clientNameMap.get(clientId) || '-') : '-'
            const saleInstallments = Number(sale.installments) || 1
            // Usa distribuição por parcelas se: (1) funcionário configurado como INSTALLMENT, OU (2) venda foi registrada como parcelada
            const useInstallment = emp.payment_mode === 'INSTALLMENT' || saleInstallments > 1

            if (storedCommission > 0 && sale.sale_type === 'FROM_BUDGET') {
              const effPct = finalValue > 0 ? (storedCommission / finalValue) * 100 : 0

              if (!useInstallment) {
                if (saleDate >= start && saleDate <= end) {
                  emp.base_revenue += finalValue
                  emp.commission_value += storedCommission
                  emp.sum_weighted_pct += effPct * finalValue
                  emp.sum_value += finalValue
                  emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedCommission, sale_code: saleCodeMap.get(sale.id) })
                }
              } else {
                const entries = cashEntriesBySale.get(sale.id)
                if (!entries || entries.length === 0) {
                  if (saleDate >= start && saleDate <= end) {
                    emp.base_revenue += finalValue
                    emp.commission_value += storedCommission
                    emp.sum_weighted_pct += effPct * finalValue
                    emp.sum_value += finalValue
                    emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedCommission, sale_code: saleCodeMap.get(sale.id) })
                  }
                } else {
                  const totalAmt = entries.reduce((s, e) => s + e.amount, 0)
                  if (totalAmt <= 0) { continue }
                  const monthlyEntries = entries.filter(e => e.due_date >= start && e.due_date <= end)
                  const confirmedMonthly = monthlyEntries.filter(e => !isPendingEntry(e))
                  const pendingMonthly = monthlyEntries.filter(e => isPendingEntry(e))
                  const confirmedAmt = confirmedMonthly.reduce((s, e) => s + e.amount, 0)
                  const pendingAmt = pendingMonthly.reduce((s, e) => s + e.amount, 0)
                  if (confirmedAmt > 0) {
                    const prop = confirmedAmt / totalAmt
                    const creditedValue = finalValue * prop
                    const creditedComm = storedCommission * prop
                    emp.base_revenue += creditedValue
                    emp.commission_value += creditedComm
                    emp.sum_weighted_pct += effPct * creditedValue
                    emp.sum_value += creditedValue
                    emp.detail_rows.push({ key: `${sale.id}-bc`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: creditedValue, commission_percent: effPct, commission_amount: creditedComm, is_installment: true, pending: false, sale_code: saleCodeMap.get(sale.id), installment_label: `${confirmedMonthly.length}/${entries.length}` })
                  }
                  if (pendingAmt > 0) {
                    const prop = pendingAmt / totalAmt
                    const pendingValue = finalValue * prop
                    const pendingComm = storedCommission * prop
                    emp.pending_revenue += pendingValue
                    emp.pending_commission += pendingComm
                    emp.detail_rows.push({ key: `${sale.id}-bp`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: pendingValue, commission_percent: effPct, commission_amount: pendingComm, is_installment: true, pending: true, sale_code: saleCodeMap.get(sale.id), installment_label: `${pendingMonthly.length}/${entries.length}` })
                  }
                }
              }
              continue
            }

            // Fallback: use product commission %
            const prodComm = saleProdCommMap.get(sale.id) || 0
            if (prodComm <= 0 || finalValue <= 0) continue

            if (!useInstallment) {
              if (saleDate >= start && saleDate <= end) {
                const commAmount = finalValue * (prodComm / 100)
                emp.base_revenue += finalValue
                emp.commission_value += commAmount
                emp.sum_weighted_pct += prodComm * finalValue
                emp.sum_value += finalValue
                emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: prodComm, commission_amount: commAmount, sale_code: saleCodeMap.get(sale.id) })
              }
            } else {
              const entries = cashEntriesBySale.get(sale.id)
              if (!entries || entries.length === 0) {
                if (saleDate >= start && saleDate <= end) {
                  const commAmount = finalValue * (prodComm / 100)
                  emp.base_revenue += finalValue
                  emp.commission_value += commAmount
                  emp.sum_weighted_pct += prodComm * finalValue
                  emp.sum_value += finalValue
                  emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: prodComm, commission_amount: commAmount, sale_code: saleCodeMap.get(sale.id) })
                }
              } else {
                const totalInstallments = entries.reduce((s, e) => s + e.amount, 0)
                if (totalInstallments <= 0) continue
                const monthlyEntries = entries.filter(e => e.due_date >= start && e.due_date <= end)
                const confirmedMonthly = monthlyEntries.filter(e => !isPendingEntry(e))
                const pendingMonthly = monthlyEntries.filter(e => isPendingEntry(e))
                const confirmedAmt = confirmedMonthly.reduce((s, e) => s + e.amount, 0)
                const pendingAmt = pendingMonthly.reduce((s, e) => s + e.amount, 0)
                if (confirmedAmt > 0) {
                  const proportion = confirmedAmt / totalInstallments
                  const creditedValue = finalValue * proportion
                  const commAmount = creditedValue * (prodComm / 100)
                  emp.base_revenue += creditedValue
                  emp.commission_value += commAmount
                  emp.sum_weighted_pct += prodComm * creditedValue
                  emp.sum_value += creditedValue
                  emp.detail_rows.push({ key: `${sale.id}-bc`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: creditedValue, commission_percent: prodComm, commission_amount: commAmount, is_installment: true, pending: false, sale_code: saleCodeMap.get(sale.id), installment_label: `${confirmedMonthly.length}/${entries.length}` })
                }
                if (pendingAmt > 0) {
                  const proportion = pendingAmt / totalInstallments
                  const pendingValue = finalValue * proportion
                  const pendingComm = pendingValue * (prodComm / 100)
                  emp.pending_revenue += pendingValue
                  emp.pending_commission += pendingComm
                  emp.detail_rows.push({ key: `${sale.id}-bp`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: pendingValue, commission_percent: prodComm, commission_amount: pendingComm, is_installment: true, pending: true, sale_code: saleCodeMap.get(sale.id), installment_label: `${pendingMonthly.length}/${entries.length}` })
                }
              }
            }
          }
        }

        // ── Process completed services ──
        for (const s of services || []) {
          if (!s.employee_id) continue
          const emp = empMap.get(s.employee_id)
          if (!emp) continue

          const rev = Number(s.total_revenue) || 0
          const svcComm = s.service_id ? (svcCommMap.get(s.service_id) || 0) : 0
          if (svcComm <= 0) continue

          // Discount proportionally reduces commission: factor = applied% / (commission% + profit%)
          const svcProfit = s.service_id ? (svcProfitMap.get(s.service_id) || 0) : 0
          const discPct = Number((s as any).discount_percent) || 0
          const maxDiscPct = svcComm + svcProfit
          const discountFactor = maxDiscPct > 0 ? discPct / maxDiscPct : 0
          const effectiveSvcComm = svcComm * (1 - discountFactor)

          emp.base_revenue += rev
          const commAmount = rev * (effectiveSvcComm / 100)
          emp.commission_value += commAmount
          emp.sum_weighted_pct += effectiveSvcComm * rev
          emp.sum_value += rev

          const clientId = svcClientRefMap.get(s.id)
          const clientName = clientId ? (clientNameMap.get(clientId) || '-') : '-'
          const svcName = s.service_id ? (svcNameMap.get(s.service_id) || 'Serviço') : 'Serviço'
          // service_date may not be in select; use empty string as fallback
          const svcDate = (s.service_date || '').substring(0, 10)
          emp.detail_rows.push({
            key: s.id || `svc-${s.service_id}-${Math.random()}`,
            type: 'SERVIÇO',
            description: svcName,
            client_name: clientName,
            date: svcDate,
            value: rev,
            commission_percent: effectiveSvcComm,
            commission_amount: commAmount,
          })
        }

        // ── Direct sales ──
        if (directSales.length) {
          for (const sale of directSales as any[]) {
            const empId = sale.employee_id
            if (!empId) continue
            const emp = empMap.get(empId)
            if (!emp) continue

            const finalValue = Number(sale.final_value) || 0
            const saleDate = (sale.sale_date || '').substring(0, 10)
            const productNames = saleItemNamesMap.get(sale.id) || []
            const description = productNames.length > 0 ? productNames.join(', ') : 'Venda Direta'
            const clientId = saleClientRefMap.get(sale.id)
            const clientName = clientId ? (clientNameMap.get(clientId) || '-') : '-'
            const saleInstallments = Number(sale.installments) || 1
            // Usa distribuição por parcelas se: (1) funcionário configurado como INSTALLMENT, OU (2) venda foi registrada como parcelada
            const useInstallment = emp.payment_mode === 'INSTALLMENT' || saleInstallments > 1

            const storedCommission = Number(sale.commission_amount || 0)
            if (storedCommission > 0) {
              const effPct = finalValue > 0 ? (storedCommission / finalValue) * 100 : 0

              if (!useInstallment) {
                if (saleDate >= start && saleDate <= end) {
                  emp.base_revenue += finalValue
                  emp.commission_value += storedCommission
                  emp.sum_weighted_pct += effPct * finalValue
                  emp.sum_value += finalValue
                  emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedCommission, sale_code: saleCodeMap.get(sale.id) })
                }
              } else {
                const entries = cashEntriesBySale.get(sale.id)
                if (!entries || entries.length === 0) {
                  if (saleDate >= start && saleDate <= end) {
                    emp.base_revenue += finalValue
                    emp.commission_value += storedCommission
                    emp.sum_weighted_pct += effPct * finalValue
                    emp.sum_value += finalValue
                    emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedCommission, sale_code: saleCodeMap.get(sale.id) })
                  }
                } else {
                  const totalAmt = entries.reduce((s, e) => s + e.amount, 0)
                  if (totalAmt <= 0) { continue }
                  const monthlyEntries = entries.filter(e => e.due_date >= start && e.due_date <= end)
                  const confirmedMonthly = monthlyEntries.filter(e => !isPendingEntry(e))
                  const pendingMonthly = monthlyEntries.filter(e => isPendingEntry(e))
                  const confirmedAmt = confirmedMonthly.reduce((s, e) => s + e.amount, 0)
                  const pendingAmt = pendingMonthly.reduce((s, e) => s + e.amount, 0)
                  if (confirmedAmt > 0) {
                    const prop = confirmedAmt / totalAmt
                    const creditedValue = finalValue * prop
                    const creditedComm = storedCommission * prop
                    emp.base_revenue += creditedValue
                    emp.commission_value += creditedComm
                    emp.sum_weighted_pct += effPct * creditedValue
                    emp.sum_value += creditedValue
                    emp.detail_rows.push({ key: `${sale.id}-dc`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: creditedValue, commission_percent: effPct, commission_amount: creditedComm, is_installment: true, pending: false, sale_code: saleCodeMap.get(sale.id), installment_label: `${confirmedMonthly.length}/${entries.length}` })
                  }
                  if (pendingAmt > 0) {
                    const prop = pendingAmt / totalAmt
                    const pendingValue = finalValue * prop
                    const pendingComm = storedCommission * prop
                    emp.pending_revenue += pendingValue
                    emp.pending_commission += pendingComm
                    emp.detail_rows.push({ key: `${sale.id}-dp`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: pendingValue, commission_percent: effPct, commission_amount: pendingComm, is_installment: true, pending: true, sale_code: saleCodeMap.get(sale.id), installment_label: `${pendingMonthly.length}/${entries.length}` })
                  }
                }
              }
              continue
            }

            const prodComm = saleProdCommMap.get(sale.id) || 0
            if (prodComm <= 0 || finalValue <= 0) continue

            if (!useInstallment) {
              if (saleDate >= start && saleDate <= end) {
                const commAmount = finalValue * (prodComm / 100)
                emp.base_revenue += finalValue
                emp.commission_value += commAmount
                emp.sum_weighted_pct += prodComm * finalValue
                emp.sum_value += finalValue
                emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: prodComm, commission_amount: commAmount, sale_code: saleCodeMap.get(sale.id) })
              }
            } else {
              const entries = cashEntriesBySale.get(sale.id)
              if (!entries || entries.length === 0) {
                if (saleDate >= start && saleDate <= end) {
                  const commAmount = finalValue * (prodComm / 100)
                  emp.base_revenue += finalValue
                  emp.commission_value += commAmount
                  emp.sum_weighted_pct += prodComm * finalValue
                  emp.sum_value += finalValue
                  emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: prodComm, commission_amount: commAmount, sale_code: saleCodeMap.get(sale.id) })
                }
              } else {
                const totalInstallments = entries.reduce((s, e) => s + e.amount, 0)
                if (totalInstallments <= 0) continue
                const monthlyEntries = entries.filter(e => e.due_date >= start && e.due_date <= end)
                const confirmedMonthly = monthlyEntries.filter(e => !isPendingEntry(e))
                const pendingMonthly = monthlyEntries.filter(e => isPendingEntry(e))
                const confirmedAmt = confirmedMonthly.reduce((s, e) => s + e.amount, 0)
                const pendingAmt = pendingMonthly.reduce((s, e) => s + e.amount, 0)
                if (confirmedAmt > 0) {
                  const proportion = confirmedAmt / totalInstallments
                  const creditedValue = finalValue * proportion
                  const commAmount = creditedValue * (prodComm / 100)
                  emp.base_revenue += creditedValue
                  emp.commission_value += commAmount
                  emp.sum_weighted_pct += prodComm * creditedValue
                  emp.sum_value += creditedValue
                  emp.detail_rows.push({ key: `${sale.id}-dc`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: creditedValue, commission_percent: prodComm, commission_amount: commAmount, is_installment: true, pending: false, sale_code: saleCodeMap.get(sale.id), installment_label: `${confirmedMonthly.length}/${entries.length}` })
                }
                if (pendingAmt > 0) {
                  const proportion = pendingAmt / totalInstallments
                  const pendingValue = finalValue * proportion
                  const pendingComm = pendingValue * (prodComm / 100)
                  emp.pending_revenue += pendingValue
                  emp.pending_commission += pendingComm
                  emp.detail_rows.push({ key: `${sale.id}-dp`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: pendingValue, commission_percent: prodComm, commission_amount: pendingComm, is_installment: true, pending: true, sale_code: saleCodeMap.get(sale.id), installment_label: `${pendingMonthly.length}/${entries.length}` })
                }
              }
            }
          }
        }

        if (!cancelled) {
          const rows = allEmployees
            .filter((e) => {
              const emp = empMap.get(e.id)
              return emp && (emp.base_revenue > 0 || emp.pending_revenue > 0)
            })
            .map((e) => {
              const emp = empMap.get(e.id)!
              const avg = emp.sum_value > 0 ? emp.sum_weighted_pct / emp.sum_value : 0
              return {
                employee_id: e.id,
                name: e.name,
                commission_percent: emp.commission_percent,
                avg_commission_percent: Math.round(avg * 100) / 100,
                base_revenue: emp.base_revenue,
                commission_value: emp.commission_value,
                pending_revenue: emp.pending_revenue,
                pending_commission: emp.pending_commission,
                payment_mode: emp.payment_mode,
                detail_rows: emp.detail_rows,
              }
            })
          setCommissionData(rows)
        }
      } catch {
        messageApi.error('Erro ao carregar comissões.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [month])

  const handleOpenSaleDrawer = async (saleCode: string | undefined, saleKey: string) => {
    if (!saleCode) return
    setSaleDrawerOpen(true)
    setSaleDrawerLoading(true)
    try {
      const tenantId = await getTenantId()
      const { data: sale } = await (supabase as any)
        .from('sales')
        .select('*, customer:customers(name, phone), employee:employees(name)')
        .eq('sale_code', saleCode)
        .single()
      const { data: saleItems } = await (supabase as any)
        .from('sale_items')
        .select('quantity, unit_price, total_price, product:products(name), service:services(name)')
        .eq('sale_id', sale?.id || saleKey)
      setSaleDrawerData({ ...sale, items: saleItems || [] })
    } catch {
      setSaleDrawerData(null)
    } finally {
      setSaleDrawerLoading(false)
    }
  }

  // Filter by selected employee
  const filteredData = useMemo(() => {
    if (!selectedEmployee) return commissionData
    return commissionData.filter(r => r.employee_id === selectedEmployee)
  }, [commissionData, selectedEmployee])

  // Flat detail rows for main view (all employees, all detail rows)
  const allDetailRows = useMemo(() =>
    filteredData.flatMap(r =>
      r.detail_rows.map(d => ({ ...d, employee_name: r.name, employee_id: r.employee_id }))
    ),
    [filteredData]
  )

  // Totals (from flat detail rows)
  const totalBase = useMemo(() => filteredData.reduce((s, r) => s + r.base_revenue, 0), [filteredData])
  const totalCommission = useMemo(() => filteredData.reduce((s, r) => s + r.commission_value, 0), [filteredData])
  const totalPendingRevenue = useMemo(() => filteredData.reduce((s, r) => s + r.pending_revenue, 0), [filteredData])
  const totalPendingCommission = useMemo(() => filteredData.reduce((s, r) => s + r.pending_commission, 0), [filteredData])
  const detailTotalValue = useMemo(() => allDetailRows.reduce((s, r) => s + r.value, 0), [allDetailRows])
  const detailTotalCommission = useMemo(() => allDetailRows.reduce((s, r) => s + r.commission_amount, 0), [allDetailRows])

  const detailColumns: ColumnsType<CommissionDetailRow & { employee_name?: string; employee_id?: string }> = [
    {
      title: 'Vendedor',
      dataIndex: 'employee_name',
      key: 'employee_name',
      width: 150,
      ellipsis: true,
      render: (v: string, row: any) => (
        <span
          style={{ fontWeight: 600, color: '#a78bfa', cursor: 'pointer', textDecoration: 'underline dotted' }}
          onClick={() => {
            const vendorRow = filteredData.find(r => r.employee_id === row.employee_id)
            if (vendorRow) { setDrawerRow(vendorRow); setDrawerOpen(true) }
          }}
        >
          {v || '—'}
        </span>
      ),
    },
    {
      title: 'Cliente',
      dataIndex: 'client_name',
      key: 'client_name',
      ellipsis: true,
    },
    {
      title: 'Parcela',
      dataIndex: 'installment_label',
      key: 'installment_label',
      width: 90,
      align: 'center' as const,
      render: (v: string | undefined) => v ? <Tag color="blue">{v}</Tag> : <span style={{ color: '#64748b' }}>—</span>,
    },
    {
      title: 'Nº da Venda',
      dataIndex: 'sale_code',
      key: 'sale_code',
      width: 130,
      render: (v: string | undefined, row: CommissionDetailRow) => v ? (
        <span
          style={{ fontFamily: 'monospace', fontWeight: 600, color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => handleOpenSaleDrawer(v, row.key)}
        >
          {v}
        </span>
      ) : <span style={{ color: '#64748b' }}>—</span>,
    },
    {
      title: 'Valor Base',
      dataIndex: 'value',
      key: 'value',
      align: 'right',
      width: 130,
      render: (v: number) => formatCurrency(v),
    },
    {
      title: 'Comissão %',
      dataIndex: 'commission_percent',
      key: 'commission_percent',
      width: 110,
      align: 'center',
      render: (v: number) => <Tag color="purple">{v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</Tag>,
    },
    {
      title: 'Comissão Valor',
      dataIndex: 'commission_amount',
      key: 'commission_amount',
      align: 'right',
      width: 130,
      render: (v: number) => <strong style={{ color: '#7C3AED' }}>{formatCurrency(v)}</strong>,
    },
  ]

  const columns: ColumnsType<CommissionRow> = [
    {
      title: 'Vendedor',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record: CommissionRow) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 600, color: '#a78bfa' }}
          icon={<EyeOutlined />}
          onClick={() => { setDrawerRow(record); setDrawerOpen(true) }}
        >
          {v}
        </Button>
      ),
    },
    {
      title: '% Comissão Média',
      dataIndex: 'avg_commission_percent',
      key: 'avg_commission_percent',
      width: 160,
      align: 'center',
      render: (v: number) => (
        <Tooltip title="Média ponderada das % de comissão dos produtos/serviços lançados">
          <Tag color="purple">{v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Modo Pagamento',
      dataIndex: 'payment_mode',
      key: 'payment_mode',
      width: 160,
      align: 'center',
      render: (v: 'FULL' | 'INSTALLMENT') =>
        v === 'INSTALLMENT' ? (
          <Tooltip title="Comissão distribuída conforme parcelamento do cliente">
            <Tag color="orange" icon={<SplitCellsOutlined />}>Parcelado</Tag>
          </Tooltip>
        ) : (
          <Tooltip title="Comissão paga integralmente no mês da venda">
            <Tag color="green">Mês da Venda</Tag>
          </Tooltip>
        ),
    },
    {
      title: (
        <Tooltip title="Boleto/Cheque parcelado aguardando entrada no fluxo de caixa">
          <span>Receita Aguardando</span>
        </Tooltip>
      ),
      dataIndex: 'pending_revenue',
      key: 'pending_revenue',
      width: 160,
      align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: '#B45309' }}>{formatCurrency(v)}</span> : <span style={{ color: '#6B7280' }}>—</span>,
    },
    {
      title: (
        <Tooltip title="Comissão vinculada a boleto/cheque aguardando confirmação">
          <span>Comissão Aguardando</span>
        </Tooltip>
      ),
      dataIndex: 'pending_commission',
      key: 'pending_commission',
      width: 160,
      align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: '#B45309', fontWeight: 600 }}>{formatCurrency(v)}</span> : <span style={{ color: '#6B7280' }}>—</span>,
    },
    {
      title: 'Base (Receita)',
      dataIndex: 'base_revenue',
      key: 'base_revenue',
      width: 140,
      align: 'right',
      render: (v: number) => formatCurrency(v),
    },
    {
      title: 'Comissão Calculada',
      dataIndex: 'commission_value',
      key: 'commission_value',
      width: 155,
      align: 'right',
      render: (v: number) => <strong style={{ color: '#7C3AED' }}>{formatCurrency(v)}</strong>,
    },
  ]

  const [exportModalOpen, setExportModalOpen] = useState(false)

  const handleExportExcel = () => {
    if (!filteredData.length) {
      messageApi.warning('Nenhum dado para exportar.')
      return
    }
    exportCommissionToExcel(filteredData, month)
    messageApi.success('Excel exportado com sucesso!')
  }

  const handleExportPdf = () => {
    if (!filteredData.length) {
      messageApi.warning('Nenhum dado para exportar.')
      return
    }
    const selectedEmpName = selectedEmployee
      ? employees.find(e => e.id === selectedEmployee)?.name
      : undefined
    exportCommissionToPdf(filteredData, month.month(), month.year(), selectedEmpName)
    messageApi.success('PDF exportado com sucesso!')
  }

  if (!canView(MODULES.COMMISSION)) {
    return (
      <Layout title={PAGE_TITLES.COMMISSION}>
        <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
      </Layout>
    )
  }

  return (
    <Layout title={PAGE_TITLES.COMMISSION} subtitle="Gerencie e exporte comissões dos vendedores">
      {contextHolder}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Mês/Ano</label>
          <DatePicker
            picker="month"
            value={month}
            onChange={(v) => v && setMonth(v)}
            format="MM/YYYY"
            allowClear={false}
            style={{ width: '100%', maxWidth: 180, minWidth: 140 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Vendedor</label>
          <Select
            placeholder="Todos os vendedores"
            allowClear
            value={selectedEmployee}
            onChange={(v) => setSelectedEmployee(v)}
            style={{ width: '100%', maxWidth: 260, minWidth: 180 }}
            options={[
              ...employees.map(e => ({ label: e.name, value: e.id })),
            ]}
          />
        </div>
        <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)} disabled={!filteredData.length}
            style={{ background: '#7C3AED', borderColor: '#7C3AED', color: '#fff' }}>
            Exportar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card size="small" style={{ background: '#1e1b4b', border: '1px solid #312e81' }}>
          <Statistic
            title={<span style={{ color: '#a5b4fc' }}><TeamOutlined /> Vendedores</span>}
            value={filteredData.length}
            valueStyle={{ color: '#e0e7ff', fontSize: 24 }}
          />
        </Card>
        <Card size="small" style={{ background: '#1e1b4b', border: '1px solid #312e81' }}>
          <div style={{ fontSize: 14, color: '#a5b4fc', marginBottom: 4 }}><DollarOutlined /> Receita Base</div>
          <div style={{ color: '#e0e7ff', fontSize: 24, fontWeight: 600 }}>{formatCurrency(totalBase)}</div>
        </Card>
        <Card size="small" style={{ background: '#1e1b4b', border: '1px solid #312e81' }}>
          <div style={{ fontSize: 14, color: '#c4b5fd', marginBottom: 4 }}><PercentageOutlined /> Total Comissões</div>
          <div style={{ color: '#a78bfa', fontSize: 24, fontWeight: 700 }}>{formatCurrency(totalCommission)}</div>
        </Card>
        {totalPendingRevenue > 0 && (
          <Card size="small" style={{ background: '#451a03', border: '1px solid #92400e' }}>
            <Statistic
              title={<Tooltip title="Boleto/Cheque aguardando confirmação no fluxo de caixa"><span style={{ color: '#fcd34d' }}>⏳ Receita Aguardando</span></Tooltip>}
              value={totalPendingRevenue}
              precision={2}
              prefix="R$"
              valueStyle={{ color: '#fbbf24', fontSize: 24 }}
            />
          </Card>
        )}
        {totalPendingCommission > 0 && (
          <Card size="small" style={{ background: '#451a03', border: '1px solid #92400e' }}>
            <Statistic
              title={<Tooltip title="Comissão vinculada a boleto/cheque aguardando recebimento"><span style={{ color: '#fcd34d' }}>⏳ Comissão Aguardando</span></Tooltip>}
              value={totalPendingCommission}
              precision={2}
              prefix="R$"
              valueStyle={{ color: '#fbbf24', fontSize: 24, fontWeight: 700 }}
            />
          </Card>
        )}
      </div>

      {/* Main detail table — todas as vendas/serviços com comissão */}
      {allDetailRows.length > 0 ? (
        <Table
          columns={detailColumns}
          dataSource={allDetailRows}
          rowKey="key"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} lançamentos` }}
          size="small"
          scroll={{ x: 1200 }}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#1e1b4b' }}>
                <Table.Summary.Cell index={0} colSpan={8}>
                  <strong style={{ color: '#e2e8f0' }}>TOTAL</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong style={{ color: '#e2e8f0' }}>{formatCurrency(detailTotalValue)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right">
                  <strong style={{ color: '#a78bfa' }}>{formatCurrency(detailTotalCommission)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : (
        <Empty
          description={loading ? 'Carregando...' : 'Nenhuma comissão encontrada para este período.'}
          style={{ padding: 60 }}
        />
      )}

      {/* Drawer de detalhes do vendedor */}
      <Drawer
        title={
          <div>
            <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 16 }}>{drawerRow?.name}</div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
              Detalhamento de lançamentos — {month.format('MM/YYYY')}
            </div>
          </div>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="min(1200px, 95vw)"
        styles={{ body: { padding: 16 } }}
        extra={
          drawerRow && (
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#9ca3af', fontSize: 11 }}>% Comissão Média</div>
                <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 18 }}>
                  {drawerRow.avg_commission_percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#9ca3af', fontSize: 11 }}>Receita Base</div>
                <div style={{ color: '#e0e7ff', fontWeight: 700, fontSize: 18 }}>
                  {formatCurrency(drawerRow.base_revenue)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#9ca3af', fontSize: 11 }}>Total Comissão</div>
                <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 18 }}>
                  {formatCurrency(drawerRow.commission_value)}
                </div>
              </div>
            </div>
          )
        }
      >
        {drawerRow && (
          <Table
            columns={detailColumns}
            dataSource={drawerRow.detail_rows}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: 1100 }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#1e1b4b' }}>
                  <Table.Summary.Cell index={0} colSpan={7}>
                    <strong style={{ color: '#e2e8f0' }}>TOTAL</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <strong style={{ color: '#e2e8f0' }}>
                      {formatCurrency(drawerRow.detail_rows.reduce((s, r) => s + r.value, 0))}
                    </strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    <strong style={{ color: '#a78bfa' }}>
                      {formatCurrency(drawerRow.detail_rows.reduce((s, r) => s + r.commission_amount, 0))}
                    </strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        )}
      </Drawer>

      <ExportFormatModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        skipDateRange
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        title="Exportar Comissão de Vendedor"
      />

      {/* Drawer de detalhes da venda */}
      <Drawer
        title={
          <div>
            <div style={{ color: '#60a5fa', fontWeight: 700, fontSize: 16 }}>
              Venda {saleDrawerData?.sale_code || '—'}
            </div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
              Detalhes da venda
            </div>
          </div>
        }
        open={saleDrawerOpen}
        onClose={() => { setSaleDrawerOpen(false); setSaleDrawerData(null) }}
        width={520}
        styles={{ body: { padding: 24 } }}
        loading={saleDrawerLoading}
      >
        {saleDrawerData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Nº da Venda', value: saleDrawerData.sale_code },
              { label: 'Cliente', value: saleDrawerData.customer?.name || saleDrawerData.client_name },
              { label: 'Telefone Cliente', value: saleDrawerData.customer?.phone },
              { label: 'Vendedor', value: saleDrawerData.employee?.name },
              { label: 'Data da Venda', value: saleDrawerData.sale_date ? saleDrawerData.sale_date.substring(0, 10) : undefined },
              { label: 'Valor Final', value: saleDrawerData.final_value != null ? formatCurrency(Number(saleDrawerData.final_value)) : undefined },
              { label: 'Desconto', value: saleDrawerData.discount_percent ? `${saleDrawerData.discount_percent}%` : undefined },
              { label: 'Forma de Pagamento', value: saleDrawerData.payment_method },
              { label: 'Parcelas', value: saleDrawerData.installments ? `${saleDrawerData.installments}x` : undefined },
              { label: 'Status', value: saleDrawerData.status },
              { label: 'Observações', value: saleDrawerData.notes },
            ]
              .filter(f => f.value != null && f.value !== '' && f.value !== undefined)
              .map(f => (
                <div key={f.label} style={{ display: 'flex', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                  <span style={{ minWidth: 160, color: '#94a3b8', fontSize: 13 }}>{f.label}</span>
                  <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, flex: 1 }}>{f.value}</span>
                </div>
              ))
            }

            {saleDrawerData.items && saleDrawerData.items.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: '#a5b4fc', fontWeight: 600, marginBottom: 8 }}>Itens da Venda</div>
                {saleDrawerData.items.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 6, marginBottom: 6 }}>
                    <span style={{ color: '#e2e8f0', fontSize: 13 }}>
                      {item.product?.name || item.service?.name || 'Item'}
                      {item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ''}
                    </span>
                    <span style={{ color: '#a78bfa', fontSize: 13, fontWeight: 600 }}>
                      {item.total_price != null ? formatCurrency(Number(item.total_price)) : item.unit_price != null ? formatCurrency(Number(item.unit_price)) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!saleDrawerData && !saleDrawerLoading && (
          <Empty description="Dados da venda não encontrados" />
        )}
      </Drawer>
    </Layout>
  )
}
