import React, { useState, useEffect, useMemo } from 'react'
import { Table, Tag, DatePicker, message, Button, Card, Empty, Tooltip, Drawer } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useDevice } from '@/contexts/device.context'
// Exports pesados carregados via dynamic import nos handlers (padrão da tela
// Comissão de Vendedor). Reduz First Load JS.
import {
  FileExcelOutlined,
  FilePdfOutlined,
  DollarOutlined,
  PercentageOutlined,
  DownloadOutlined,
  SplitCellsOutlined,
  EyeOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { formatBRL } from '@/utils/formatters'
import { PAGE_SIZE } from '@/constants/pagination'

const formatCurrency = formatBRL

// Métodos que exigem confirmação manual de recebimento antes de entrar na RT confirmada
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

// Linha horizontal de KPI no mobile: [ícone · label/valor · seta ›]
function KpiRow({ icon, label, value, accent, border, valueColor, iconColor }: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
  border: string
  valueColor: string
  iconColor: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: accent, border: `1px solid ${border}`, borderRadius: 10,
      padding: '10px 12px', minHeight: 56,
    }}>
      <span style={{ fontSize: 18, color: iconColor, display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontSize: 12, color: iconColor, lineHeight: 1.2 }}>{label}</div>
        {/* Revisão 03/08 (#8/#11): valor inteiro em UMA linha, sem quebrar no meio do
            número. Fonte reduz o quanto for preciso (min 9px) e nowrap garante a linha
            única — a quebra anterior (word-break/overflow-wrap) cortava "R$ 130.220,\n00". */}
        <div style={{ fontSize: 'clamp(9px, 3.4vw, 18px)', fontWeight: 700, color: valueColor, whiteSpace: 'nowrap', overflow: 'visible', overflowWrap: 'normal', wordBreak: 'keep-all' }}>{value}</div>
      </div>
      <RightOutlined style={{ fontSize: 12, color: iconColor, flexShrink: 0 }} />
    </div>
  )
}

export default function RtCommissionPage() {
  const { canView } = usePermissions()
  const { isMobile } = useDevice()
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

  // Fetch RT data whenever selected month changes
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
        // calendar_event_id é necessário para deduplicar contra a venda AG-XXXXXX
        // gerada pela mesma Agenda e evitar contagem dupla de receita.
        const { data: services } = await supabase
          .from('completed_services')
          .select('id, employee_id, total_revenue, service_id, discount_percent, calendar_event_id')
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
            .select('id, sale_code, final_value, budget_id, employee_id, sale_date, sale_type, commission_amount, rt_amount, installments')
            .eq('is_active', true)
          salesData = data || []
        } catch {
          const { data } = await supabase
            .from('sales')
            .select('id, sale_code, final_value, budget_id, sale_date, rt_amount, installments')
            .eq('is_active', true)
          salesData = (data || []).map((s: any) => ({ ...s, employee_id: null }))
        }

        const saleCodeMap = new Map<string, string>()
        for (const s of salesData) {
          saleCodeMap.set(s.id, s.sale_code || s.id.slice(0, 8))
        }

        // Get all sale_items — usados para (1) descrição (nome do produto) e
        // (2) cálculo da RT ponderada por venda a partir de products.rt_reserve_percent.
        const allSaleIds = salesData.map((s: any) => s.id)
        let allSaleItemRows: any[] = []
        let prodNameMap = new Map<string, string>()
        // Mapa sale_id → { rtWeighted, valorItens } acumulados a partir dos itens.
        const rtBySale = new Map<string, { rtWeighted: number; valorItens: number }>()
        if (allSaleIds.length > 0) {
          const { data: saleItemRows } = await supabase
            .from('sale_items')
            .select('sale_id, quantity, unit_price, product:products(id, rt_reserve_percent)')
            .in('sale_id', allSaleIds)
          allSaleItemRows = saleItemRows || []

          const productIds = [...new Set(allSaleItemRows.map((si: any) => si.product?.id).filter(Boolean))]
          if (productIds.length > 0) {
            const { data: prods } = await supabase.from('products').select('id, name').in('id', productIds)
            prodNameMap = new Map((prods || []).map((p: any) => [p.id, p.name || 'Produto']))
          }

          for (const si of allSaleItemRows) {
            const qty = Number(si.quantity) || 0
            const unit = Number(si.unit_price) || 0
            const lineValue = qty * unit
            const rtPct = Number(si.product?.rt_reserve_percent) || 0
            const acc = rtBySale.get(si.sale_id) || { rtWeighted: 0, valorItens: 0 }
            acc.rtWeighted += lineValue * (rtPct / 100)
            acc.valorItens += lineValue
            rtBySale.set(si.sale_id, acc)
          }
        }

        // Calcula a RT armazenada por venda: alíquota efetiva de RT × valor final da venda.
        // Substitui o commission_amount usado na tela de Comissão de Vendedor.
        function computeStoredRt(saleId: string, finalValue: number): number {
          const acc = rtBySale.get(saleId)
          if (!acc || acc.valorItens <= 0) return 0
          const rtEffective = acc.rtWeighted / acc.valorItens
          return rtEffective * finalValue
        }

        // Map sale_id → product names (apenas para descrição dos lançamentos)
        const saleItemNamesMap = new Map<string, string[]>()
        for (const si of allSaleItemRows) {
          const pId = si.product?.id
          if (pId) {
            const names = saleItemNamesMap.get(si.sale_id) || []
            const pName = prodNameMap.get(pId) || 'Produto'
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
        } catch { /* customer names are optional — RT calculation continues */ }

        // ── Budgets (original select — safe) ──
        let budgetEmp = new Map<string, string>()

        if (budgetSales.length) {
          const budgetIds = [...new Set(budgetSales.map((s: any) => s.budget_id).filter(Boolean))]
          const { data: budgets } = await supabase.from('budgets').select('id, employee_id').in('id', budgetIds)
          budgetEmp = new Map((budgets || []).map((b: any) => [b.id, b.employee_id]))

          for (const sale of budgetSales as any[]) {
            const empId = budgetEmp.get(sale.budget_id) || sale.employee_id
            if (!empId) continue
            const emp = empMap.get(empId)
            if (!emp) continue

            const finalValue = Number(sale.final_value) || 0
            // RT: valor calculado a partir dos itens × alíquota de RT do produto.
            // Sem fallback de budget (não há coluna de RT no budget); se 0, ignora.
            // EPIC-RT v8 (3.9): prioriza o RT CONGELADO gravado na venda; fallback on-the-fly (produto vivo).
            const storedRt = Number((sale as any).rt_amount) > 0 ? Number((sale as any).rt_amount) : computeStoredRt(sale.id, finalValue)
            const saleDate = (sale.sale_date || '').substring(0, 10)
            const productNames = saleItemNamesMap.get(sale.id) || []
            const description = productNames.length > 0 ? productNames.join(', ') : 'Venda'
            const clientId = budgetClientRefMap.get(sale.budget_id)
            const clientName = clientId ? (clientNameMap.get(clientId) || '-') : '-'
            const saleInstallments = Number(sale.installments) || 1
            // Usa distribuição por parcelas se: (1) funcionário configurado como INSTALLMENT, OU (2) venda foi registrada como parcelada
            const useInstallment = emp.payment_mode === 'INSTALLMENT' || saleInstallments > 1

            // Alíquota efetiva de RT (storedRt ÷ valor final). A RT por parcela é
            // proporcional ao valor da parcela e a soma fecha com a RT total da venda.
            if (storedRt > 0) {
              const effPct = finalValue > 0 ? (storedRt / finalValue) * 100 : 0

              if (!useInstallment) {
                if (saleDate >= start && saleDate <= end) {
                  emp.base_revenue += finalValue
                  emp.commission_value += storedRt
                  emp.sum_weighted_pct += effPct * finalValue
                  emp.sum_value += finalValue
                  emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedRt, sale_code: saleCodeMap.get(sale.id) })
                }
              } else {
                const entries = cashEntriesBySale.get(sale.id)
                if (!entries || entries.length === 0) {
                  if (saleDate >= start && saleDate <= end) {
                    emp.base_revenue += finalValue
                    emp.commission_value += storedRt
                    emp.sum_weighted_pct += effPct * finalValue
                    emp.sum_value += finalValue
                    emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedRt, sale_code: saleCodeMap.get(sale.id) })
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
                    const creditedComm = storedRt * prop
                    emp.base_revenue += creditedValue
                    emp.commission_value += creditedComm
                    emp.sum_weighted_pct += effPct * creditedValue
                    emp.sum_value += creditedValue
                    emp.detail_rows.push({ key: `${sale.id}-bc`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: creditedValue, commission_percent: effPct, commission_amount: creditedComm, is_installment: true, pending: false, sale_code: saleCodeMap.get(sale.id), installment_label: `${confirmedMonthly.length}/${entries.length}` })
                  }
                  if (pendingAmt > 0) {
                    const prop = pendingAmt / totalAmt
                    const pendingValue = finalValue * prop
                    const pendingComm = storedRt * prop
                    emp.pending_revenue += pendingValue
                    emp.pending_commission += pendingComm
                    emp.detail_rows.push({ key: `${sale.id}-bp`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: pendingValue, commission_percent: effPct, commission_amount: pendingComm, is_installment: true, pending: true, sale_code: saleCodeMap.get(sale.id), installment_label: `${pendingMonthly.length}/${entries.length}` })
                  }
                }
              }
              continue
            }

            // Sem RT efetiva (venda sem itens de produto com rt_reserve_percent), o
            // lançamento é ignorado (RT 0) — não há fallback de budget para RT.
          }
        }

        // ── Dedup Agenda: a venda AG-XXXXXX já carrega a receita efetiva. Quando ela
        // existe COM commission_amount > 0, pulamos o completed_services correspondente
        // para não contar receita 2×. Mantém a mesma mecânica da tela de comissão.
        const agSaleCodesWithComm = new Set(
          salesData
            .filter((s: any) => Number(s.commission_amount) > 0 && String(s.sale_code || '').startsWith('AG-'))
            .map((s: any) => String(s.sale_code)),
        )
        const coveredEventIds = new Set<string>()
        if (agSaleCodesWithComm.size > 0) {
          const svcEventIds = [...new Set((services || []).map((s: any) => s.calendar_event_id).filter(Boolean))]
          if (svcEventIds.length > 0) {
            try {
              const { data: evRows } = await supabase
                .from('calendar_events')
                .select('id, agenda_code')
                .in('id', svcEventIds)
              for (const ev of evRows || []) {
                if (ev.agenda_code && agSaleCodesWithComm.has(String(ev.agenda_code))) {
                  coveredEventIds.add(ev.id)
                }
              }
            } catch { /* sem agenda_code → não deduplica (mantém comportamento) */ }
          }
        }

        // ── Process completed services ──
        for (const s of services || []) {
          if (!s.employee_id) continue
          const emp = empMap.get(s.employee_id)
          if (!emp) continue
          // Dedup: serviço já contabilizado pela venda AG correspondente.
          if (s.calendar_event_id && coveredEventIds.has(s.calendar_event_id)) continue

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

            // EPIC-RT v8 (3.9): prioriza o RT CONGELADO gravado na venda; fallback on-the-fly (produto vivo).
            const storedRt = Number((sale as any).rt_amount) > 0 ? Number((sale as any).rt_amount) : computeStoredRt(sale.id, finalValue)
            if (storedRt > 0) {
              const effPct = finalValue > 0 ? (storedRt / finalValue) * 100 : 0

              if (!useInstallment) {
                if (saleDate >= start && saleDate <= end) {
                  emp.base_revenue += finalValue
                  emp.commission_value += storedRt
                  emp.sum_weighted_pct += effPct * finalValue
                  emp.sum_value += finalValue
                  emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedRt, sale_code: saleCodeMap.get(sale.id) })
                }
              } else {
                const entries = cashEntriesBySale.get(sale.id)
                if (!entries || entries.length === 0) {
                  if (saleDate >= start && saleDate <= end) {
                    emp.base_revenue += finalValue
                    emp.commission_value += storedRt
                    emp.sum_weighted_pct += effPct * finalValue
                    emp.sum_value += finalValue
                    emp.detail_rows.push({ key: sale.id, type: 'VENDA', description, client_name: clientName, date: saleDate, value: finalValue, commission_percent: effPct, commission_amount: storedRt, sale_code: saleCodeMap.get(sale.id) })
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
                    const creditedComm = storedRt * prop
                    emp.base_revenue += creditedValue
                    emp.commission_value += creditedComm
                    emp.sum_weighted_pct += effPct * creditedValue
                    emp.sum_value += creditedValue
                    emp.detail_rows.push({ key: `${sale.id}-dc`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: creditedValue, commission_percent: effPct, commission_amount: creditedComm, is_installment: true, pending: false, sale_code: saleCodeMap.get(sale.id), installment_label: `${confirmedMonthly.length}/${entries.length}` })
                  }
                  if (pendingAmt > 0) {
                    const prop = pendingAmt / totalAmt
                    const pendingValue = finalValue * prop
                    const pendingComm = storedRt * prop
                    emp.pending_revenue += pendingValue
                    emp.pending_commission += pendingComm
                    emp.detail_rows.push({ key: `${sale.id}-dp`, type: 'VENDA', description, client_name: clientName, date: saleDate, value: pendingValue, commission_percent: effPct, commission_amount: pendingComm, is_installment: true, pending: true, sale_code: saleCodeMap.get(sale.id), installment_label: `${pendingMonthly.length}/${entries.length}` })
                  }
                }
              }
              continue
            }

            // Sem RT efetiva na venda direta, o lançamento é ignorado (RT 0).
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
        messageApi.error('Erro ao carregar RT.')
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
  const totalPendingCommission = useMemo(() => filteredData.reduce((s, r) => s + r.pending_commission, 0), [filteredData])
  // PC-FEAT-RT-LIQUIDACAO-001 (Seção 3): RT Total (Geral) = Liquidada + Aguardando.
  // "RT Liquidada" (totalCommission) = já disponível p/ repasse (parcela recebida);
  // "RT Aguardando" (totalPendingCommission) = ainda em aberto (parcela não liquidada).
  const totalRtGeral = useMemo(() => totalCommission + totalPendingCommission, [totalCommission, totalPendingCommission])
  const detailTotalValue = useMemo(() => allDetailRows.reduce((s, r) => s + r.value, 0), [allDetailRows])
  const detailTotalCommission = useMemo(() => allDetailRows.reduce((s, r) => s + r.commission_amount, 0), [allDetailRows])
  // PC-FEAT-RT-EXPORTACAO-002 (Seção 4): rodapé com 3 totalizadores por status de liquidação.
  // Liquidado = parcela recebida (não pendente); Aberto = boleto/cheque aguardando no Fluxo de Caixa.
  const detailLiquidadoValue = useMemo(() => allDetailRows.filter(r => !r.pending).reduce((s, r) => s + r.value, 0), [allDetailRows])
  const detailLiquidadoCommission = useMemo(() => allDetailRows.filter(r => !r.pending).reduce((s, r) => s + r.commission_amount, 0), [allDetailRows])
  const detailAbertoValue = useMemo(() => allDetailRows.filter(r => r.pending).reduce((s, r) => s + r.value, 0), [allDetailRows])
  const detailAbertoCommission = useMemo(() => allDetailRows.filter(r => r.pending).reduce((s, r) => s + r.commission_amount, 0), [allDetailRows])

  const detailColumns: ColumnsType<CommissionDetailRow & { employee_name?: string; employee_id?: string }> = [
    {
      title: 'Vendedor',
      dataIndex: 'employee_name',
      key: 'employee_name',
      width: 150,
      ellipsis: true,
      render: (v: string, row: any) => (
        <span
          style={{ fontWeight: 600, color: '#22d3ee', cursor: 'pointer', textDecoration: 'underline dotted' }}
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
      title: 'RT %',
      dataIndex: 'commission_percent',
      key: 'commission_percent',
      width: 110,
      align: 'center',
      render: (v: number) => <Tag color="cyan">{v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</Tag>,
    },
    {
      title: 'RT Valor',
      dataIndex: 'commission_amount',
      key: 'commission_amount',
      align: 'right',
      width: 130,
      render: (v: number) => <strong style={{ color: '#06B6D4' }}>{formatCurrency(v)}</strong>,
    },
    {
      // PC-FEAT-RT-EXPORTACAO-002 (Seção 4): status de liquidação por parcela.
      title: 'Status',
      dataIndex: 'pending',
      key: 'status',
      width: 110,
      align: 'center' as const,
      render: (pending: boolean | undefined) => pending
        ? <Tag color="orange">Aberto</Tag>
        : <Tag color="green">Liquidado</Tag>,
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
          style={{ padding: 0, fontWeight: 600, color: '#22d3ee' }}
          icon={<EyeOutlined />}
          onClick={() => { setDrawerRow(record); setDrawerOpen(true) }}
        >
          {v}
        </Button>
      ),
    },
    {
      title: '% RT Média',
      dataIndex: 'avg_commission_percent',
      key: 'avg_commission_percent',
      width: 160,
      align: 'center',
      render: (v: number) => (
        <Tooltip title="Média ponderada das % de RT dos produtos lançados">
          <Tag color="cyan">{v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</Tag>
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
          <Tooltip title="RT distribuída conforme parcelamento do cliente">
            <Tag color="orange" icon={<SplitCellsOutlined />}>Parcelado</Tag>
          </Tooltip>
        ) : (
          <Tooltip title="RT paga integralmente no mês da venda">
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
        <Tooltip title="RT vinculada a boleto/cheque aguardando confirmação">
          <span>RT Aguardando</span>
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
      title: 'RT Calculada',
      dataIndex: 'commission_value',
      key: 'commission_value',
      width: 155,
      align: 'right',
      render: (v: number) => <strong style={{ color: '#06B6D4' }}>{formatCurrency(v)}</strong>,
    },
  ]

  const [exportModalOpen, setExportModalOpen] = useState(false)

  const handleExportExcel = async () => {
    if (!filteredData.length) {
      messageApi.warning('Nenhum dado para exportar.')
      return
    }
    try {
      const selectedEmpName = selectedEmployee
        ? employees.find(e => e.id === selectedEmployee)?.name
        : undefined
      const { exportRtToExcel } = await import('@/utils/export-rt-excel')
      await exportRtToExcel(filteredData, month, selectedEmpName)
      messageApi.success('Excel exportado com sucesso!')
    } catch (err: any) {
      console.error('Erro ao exportar Excel RT', err)
      messageApi.error('Erro ao exportar Excel: ' + (err?.message || 'Erro desconhecido'))
    }
  }

  const handleExportPdf = async () => {
    if (!filteredData.length) {
      messageApi.warning('Nenhum dado para exportar.')
      return
    }
    try {
      const selectedEmpName = selectedEmployee
        ? employees.find(e => e.id === selectedEmployee)?.name
        : undefined
      const { exportRtToPdf } = await import('@/utils/export-rt-pdf')
      exportRtToPdf(filteredData, month.month(), month.year(), selectedEmpName)
      messageApi.success('PDF exportado com sucesso!')
    } catch (err: any) {
      console.error('Erro ao exportar PDF RT', err)
      messageApi.error('Erro ao exportar PDF: ' + (err?.message || 'Erro desconhecido'))
    }
  }

  // Correções de Menu V9 (item 2): "RT Comissões" tem módulo próprio (rt_commission),
  // restringível isoladamente. Antes compartilhava `commission` com "Comissão de Vendedor".
  if (!canView(MODULES.RT_COMMISSION)) {
    return (
      <Layout title="RT Comissões">
        <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div>
      </Layout>
    )
  }

  return (
    <Layout title="RT Comissões" subtitle="Gerencie e exporte a RT (Comissão Reserva Técnica) dos vendedores">
      {contextHolder}

      {/* Filters — on mobile they sit on a single compact line (Mês/Ano · Vendedor · Exportar) */}
      <div style={{ display: 'flex', gap: isMobile ? 8 : 16, flexWrap: 'wrap', marginBottom: isMobile ? 16 : 24, alignItems: isMobile ? 'center' : 'center' }}>
        <div style={isMobile ? { flex: '0 0 auto' } : undefined}>
          {!isMobile && <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Mês/Ano</label>}
          <DatePicker
            picker="month"
            value={month}
            onChange={(v) => v && setMonth(v)}
            format="MM/YYYY"
            allowClear={false}
            size={isMobile ? 'small' : 'middle'}
            style={isMobile ? { width: 110 } : { width: '100%', maxWidth: 180, minWidth: 140 }}
          />
        </div>
        <div style={isMobile ? { flex: '1 1 120px', minWidth: 0 } : undefined}>
          {!isMobile && <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#9ca3af' }}>Vendedor</label>}
          <Select
            placeholder="Vendedores"
            allowClear
            value={selectedEmployee}
            onChange={(v) => setSelectedEmployee(v)}
            size={isMobile ? 'small' : 'middle'}
            style={isMobile ? { width: '100%' } : { width: '100%', maxWidth: 260, minWidth: 180 }}
            options={[
              ...employees.map(e => ({ label: e.name, value: e.id })),
            ]}
          />
        </div>
        <div style={{ marginLeft: isMobile ? 0 : 'auto', alignSelf: isMobile ? 'center' : 'flex-end', flex: '0 0 auto' }}>
          <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)} disabled={!filteredData.length}
            size={isMobile ? 'small' : 'middle'}
            style={{ background: '#06B6D4', borderColor: '#06B6D4', color: '#fff' }}>
            {isMobile ? '' : 'Exportar'}
          </Button>
        </div>
      </div>

      {/* KPI Cards — mobile renders horizontal rows [ícone · label/valor · seta] */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {/* PC-UI-RTCOMISSOES-CARDS-002 (mobile): mesma ordem/cards do desktop. */}
          <KpiRow icon={<DollarOutlined />} label="Receita Base" value={formatCurrency(totalBase)} accent="#083344" border="#155e75" valueColor="#cffafe" iconColor="#67e8f9" />
          <KpiRow icon={<PercentageOutlined />} label="RT Total (Geral)" value={formatCurrency(totalRtGeral)} accent="#083344" border="#155e75" valueColor="#22d3ee" iconColor="#67e8f9" />
          {totalPendingCommission > 0 && (
            <KpiRow icon={<span>⏳</span>} label="RT Aguardando (em aberto)" value={formatCurrency(totalPendingCommission)} accent="#451a03" border="#92400e" valueColor="#fbbf24" iconColor="#fcd34d" />
          )}
          <KpiRow icon={<span>✅</span>} label="RT Liquidada — Disponível p/ Pagamento" value={formatCurrency(totalCommission)} accent="#042f2e" border="#0f766e" valueColor="#2dd4bf" iconColor="#5eead4" />
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* PC-UI-RTCOMISSOES-CARDS-002: sem card "Vendedores"/"Receita Aguardando".
            Ordem fixa: Receita Base -> RT Total (Geral) -> RT Aguardando -> RT Liquidada (último).
            BUG-RTCOMISSOES-FORMATO-MONETARIO-003: todos os valores via formatCurrency (pt-BR),
            nunca via Statistic do antd (que renderiza no formato americano, ex.: "R$ 20,219.99"). */}
        <Card size="small" style={{ background: '#083344', border: '1px solid #155e75' }}>
          <div style={{ fontSize: 14, color: '#67e8f9', marginBottom: 4 }}><DollarOutlined /> Receita Base</div>
          <div style={{ color: '#cffafe', fontSize: 24, fontWeight: 600 }}>{formatCurrency(totalBase)}</div>
        </Card>
        <Card size="small" style={{ background: '#083344', border: '1px solid #155e75' }}>
          <Tooltip title="RT total do período — liquidada + aguardando">
            <div style={{ fontSize: 14, color: '#a5f3fc', marginBottom: 4 }}><PercentageOutlined /> RT Total (Geral)</div>
          </Tooltip>
          <div style={{ color: '#22d3ee', fontSize: 24, fontWeight: 700 }}>{formatCurrency(totalRtGeral)}</div>
        </Card>
        {totalPendingCommission > 0 && (
          <Card size="small" style={{ background: '#451a03', border: '1px solid #92400e' }}>
            <Tooltip title="RT vinculada a boleto/cheque aguardando recebimento">
              <div style={{ fontSize: 14, color: '#fcd34d', marginBottom: 4 }}>⏳ RT Aguardando (em aberto)</div>
            </Tooltip>
            <div style={{ color: '#fbbf24', fontSize: 24, fontWeight: 700 }}>{formatCurrency(totalPendingCommission)}</div>
          </Card>
        )}
        <Card size="small" style={{ background: '#042f2e', border: '1px solid #0f766e' }}>
          <Tooltip title="RT já disponível para repasse ao vendedor (parcela liquidada no Fluxo de Caixa)">
            <div style={{ fontSize: 14, color: '#5eead4', marginBottom: 4 }}>✅ RT Liquidada — Disponível para Pagamento</div>
          </Tooltip>
          <div style={{ color: '#2dd4bf', fontSize: 24, fontWeight: 700 }}>{formatCurrency(totalCommission)}</div>
        </Card>
      </div>
      )}

      {/* Main detail table — todas as vendas/serviços com RT */}
      {allDetailRows.length > 0 ? (
        <Table
          columns={detailColumns}
          dataSource={allDetailRows}
          rowKey="key"
          loading={loading}
          pagination={{ pageSize: PAGE_SIZE, showSizeChanger: true, showTotal: (t) => `${t} lançamentos` }}
          size="small"
          style={{ width: '100%' }}
          // PC-UI-RT-LAYOUT-003 — em desktop a tabela ocupa 100% da largura (colunas
          // flexíveis distribuem o espaço, sem sobra à direita); o scroll horizontal
          // fica restrito ao mobile, onde as colunas não cabem.
          scroll={isMobile ? { x: 1200 } : undefined}
          summary={() => (
            <Table.Summary fixed>
              {/* PC-FEAT-RT-EXPORTACAO-002 (Seção 4): rodapé com 3 totalizadores.
                  Colunas: 0-3 rótulo · 4 Valor Base · 5 RT % · 6 RT Valor · 7 Status */}
              <Table.Summary.Row style={{ background: '#083344' }}>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <strong style={{ color: '#e2e8f0' }}>TOTAL GERAL</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <strong style={{ color: '#e2e8f0' }}>{formatCurrency(detailTotalValue)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} />
                <Table.Summary.Cell index={6} align="right">
                  <strong style={{ color: '#22d3ee' }}>{formatCurrency(detailTotalCommission)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
              </Table.Summary.Row>
              <Table.Summary.Row style={{ background: '#042f2e' }}>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <strong style={{ color: '#5eead4' }}>TOTAL LIQUIDADO — Disponível para o pagamento</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <span style={{ color: '#5eead4' }}>{formatCurrency(detailLiquidadoValue)}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} />
                <Table.Summary.Cell index={6} align="right">
                  <strong style={{ color: '#2dd4bf' }}>{formatCurrency(detailLiquidadoCommission)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
              </Table.Summary.Row>
              <Table.Summary.Row style={{ background: '#451a03' }}>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <strong style={{ color: '#fcd34d' }}>TOTAL EM ABERTO — Ainda não disponível</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <span style={{ color: '#fbbf24' }}>{formatCurrency(detailAbertoValue)}</span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} />
                <Table.Summary.Cell index={6} align="right">
                  <strong style={{ color: '#fbbf24' }}>{formatCurrency(detailAbertoCommission)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : (
        <Empty
          description={loading ? 'Carregando...' : 'Nenhuma RT encontrada para este período.'}
          style={{ padding: 60 }}
        />
      )}

      {/* Drawer de detalhes do vendedor */}
      <Drawer
        title={
          <div>
            <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: 16 }}>{drawerRow?.name}</div>
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
                <div style={{ color: '#9ca3af', fontSize: 11 }}>% RT Média</div>
                <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: 18 }}>
                  {drawerRow.avg_commission_percent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#9ca3af', fontSize: 11 }}>Receita Base</div>
                <div style={{ color: '#cffafe', fontWeight: 700, fontSize: 18 }}>
                  {formatCurrency(drawerRow.base_revenue)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#9ca3af', fontSize: 11 }}>Total RT</div>
                <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: 18 }}>
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
                <Table.Summary.Row style={{ background: '#083344' }}>
                  <Table.Summary.Cell index={0} colSpan={7}>
                    <strong style={{ color: '#e2e8f0' }}>TOTAL</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <strong style={{ color: '#e2e8f0' }}>
                      {formatCurrency(drawerRow.detail_rows.reduce((s, r) => s + r.value, 0))}
                    </strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    <strong style={{ color: '#22d3ee' }}>
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
        title="Exportar RT Comissões"
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
                <div style={{ color: '#67e8f9', fontWeight: 600, marginBottom: 8 }}>Itens da Venda</div>
                {saleDrawerData.items.map((item: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 6, marginBottom: 6 }}>
                    <span style={{ color: '#e2e8f0', fontSize: 13 }}>
                      {item.product?.name || item.service?.name || 'Item'}
                      {item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ''}
                    </span>
                    <span style={{ color: '#22d3ee', fontSize: 13, fontWeight: 600 }}>
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
