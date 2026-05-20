import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'
import { createBudgetPdf } from '@/lib/create-budget-pdf'
import { sendWuzapiDocument, sendWuzapiText } from '@/lib/wuzapi-send'
import { formatBRL } from '@/utils/formatters'
import { extractEffectiveTaxComponents } from '@/utils/tax-sync'
import {
  computeResidualDistribution,
  formatResidualLine,
  type ResidualItemInput,
} from '@/utils/residual-distribution'
import type { TaxBreakdown, TaxRegime } from '@/types/mrm'

/**
 * EPIC-RR-DISPLAY S7: Carrega componentes tributários do tenant via supabaseAdmin.
 * Réplica server-side de `loadTenantTaxComponents` (que usa client-side supabase).
 */
async function loadTaxComponentsServer(tenantId: string) {
  const [settingsRes, statesRes, expenseRes] = await Promise.all([
    supabaseAdmin.from('tenant_settings').select('*').eq('tenant_id', tenantId).single(),
    supabaseAdmin.from('brazilian_states').select('code, icms_internal_rate'),
    supabaseAdmin.from('tenant_expense_config').select('profit_margin_percent').eq('tenant_id', tenantId).maybeSingle(),
  ])

  const ts = (settingsRes.data as any) || null
  if (!ts) return null

  const regime: string = ts.tax_regime || 'SIMPLES_NACIONAL'
  const calcType: string = ts.calc_type || 'INDUSTRIALIZACAO'
  const originState: string = ts.state_code || 'SP'
  const stateRow = ((statesRes.data as any[]) || []).find((s) => s.code === originState) as { icms_internal_rate?: number } | undefined
  const icmsRateRaw = Number(stateRow?.icms_internal_rate) || 0.18
  const icmsRateDecimal = icmsRateRaw > 0 && icmsRateRaw < 1 ? icmsRateRaw : icmsRateRaw / 100

  let simplesBracket: any = null
  if (regime === 'SIMPLES_NACIONAL') {
    const anexo = String(ts.simples_anexo || '').replace(/^ANEXO_/i, '') || 'I'
    const revenue12m = Number(ts.simples_revenue_12m) || 0
    const { data: brackets } = await supabaseAdmin.from('simples_nacional_brackets').select('*').eq('anexo', anexo).order('bracket_order', { ascending: true })
    if (brackets && brackets.length > 0) {
      simplesBracket = brackets.find((b: any) => revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) ?? brackets[0]
    }
  }

  let lpRate: any = null
  if (regime === 'LUCRO_PRESUMIDO') {
    const activity = ts.lucro_presumido_activity || 'COMERCIO'
    const { data } = await supabaseAdmin.from('lucro_presumido_rates').select('*').eq('activity_type', activity).maybeSingle()
    lpRate = data
  }

  return extractEffectiveTaxComponents({
    tenantSettings: ts,
    calcType,
    icmsRateDecimal,
    expenseConfig: expenseRes.data as any,
    lpRate,
    simplesBracket,
  })
}

const THROTTLE_SECONDS = 60

const formatCurrency = formatBRL

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  const { tenant_id, user_id } = caller
  const id = req.query.id as string
  if (!id) {
    return res.status(400).json({ error: 'ID do orçamento é obrigatório.' })
  }

  try {
    // 1) Throttle: verificar uma vez, não atualizar até o fim
    const { data: settings } = await supabaseAdmin
      .from('tenant_settings')
      .select('whatsapp_instance_mode, whatsapp_shared_instance_user_id, last_whatsapp_send_at, whatsapp_budget_message')
      .eq('tenant_id', tenant_id)
      .single()

    const lastSend = settings?.last_whatsapp_send_at ? new Date(settings.last_whatsapp_send_at).getTime() : 0
    const now = Date.now()
    if (lastSend && now - lastSend < THROTTLE_SECONDS * 1000) {
      const retryAfter = Math.ceil((THROTTLE_SECONDS * 1000 - (now - lastSend)) / 1000)
      return res.status(429).json({
        error: 'Aguarde 60 segundos entre envios.',
        retry_after_seconds: retryAfter,
      })
    }

    const mode = settings?.whatsapp_instance_mode || 'OWN'
    const sharedOwnerId = settings?.whatsapp_shared_instance_user_id ?? null
    const effectiveUserId = mode === 'SHARED' && sharedOwnerId ? sharedOwnerId : user_id

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('wuzapi_token')
      .eq('id', effectiveUserId)
      .single()

    const token = userRow?.wuzapi_token
    if (!token) {
      return res.status(409).json({
        error:
          mode === 'SHARED'
            ? 'O administrador ainda não conectou o WhatsApp.'
            : 'Conecte seu WhatsApp via QR Code antes de enviar.',
      })
    }

    // 2) Buscar orçamento (escopo tenant) com customer, employee (comissão) e itens
    const { data: budget, error: budgetError } = await supabaseAdmin
      .from('budgets')
      .select('id, created_at, total_value, expiration_date, notes, customer_id, employee_id, status, customer:customers(id, name, phone, whatsapp_phone), employee:employees(id, name, commission_percent)')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single()

    if (budgetError || !budget) {
      return res.status(404).json({ error: 'Orçamento não encontrado.' })
    }

    const customer = budget.customer as { phone?: string; whatsapp_phone?: string; name?: string } | null
    const phoneRaw = customer?.whatsapp_phone || customer?.phone
    if (!phoneRaw) {
      return res.status(400).json({ error: 'Cliente sem número de telefone cadastrado.' })
    }

    const { data: items } = await supabaseAdmin
      .from('budget_items')
      .select('quantity, unit_price, discount, manual_description, commission_pct, profit_pct, tax_breakdown, products(id, name, code)')
      .eq('budget_id', id)

    const employee = budget.employee as { id?: string; name?: string; commission_percent?: number } | null
    const commissionPct = (employee?.commission_percent != null && Number(employee.commission_percent) > 0)
      ? Number(employee.commission_percent) / 100
      : 0
    const effectiveUnitPrice = (unitPrice: number) => unitPrice * (1 + commissionPct)

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name, cnpj_cpf')
      .eq('id', tenant_id)
      .single()

    // 3) Mensagem de conectividade (opcional) e mensagem padrão com orçamento
    const customerName = customer?.name ?? 'Cliente'
    const templateConectividade = (settings?.whatsapp_budget_message ?? '').trim()
    const msgConectividade = templateConectividade ? templateConectividade.replace(/\{\{nome_cliente\}\}/gi, customerName) : ''

    const budgetCode = `ORC-${budget.id.substring(0, 4).toUpperCase()}`
    const date = budget.created_at ? new Date(budget.created_at).toLocaleDateString('pt-BR') : '-'
    const validity = budget.expiration_date ? new Date(budget.expiration_date).toLocaleDateString('pt-BR') : 'Não informada'
    let msgPadrao = `📋 *ORÇAMENTO ${budgetCode}*\n`
    msgPadrao += `━━━━━━━━━━━━━━━━━━\n`
    msgPadrao += `👤 *Cliente:* ${customerName}\n`
    msgPadrao += `📅 *Data:* ${date}\n`
    msgPadrao += `⏰ *Validade:* ${validity}\n\n`
    msgPadrao += `📦 *Produtos:*\n`
    if (items && items.length > 0) {
      items.forEach((item: any, idx: number) => {
        const u = effectiveUnitPrice(Number(item.unit_price || 0))
        const itemTotal = u * item.quantity - (item.discount || 0)
        msgPadrao += `  ${idx + 1}. ${item.products?.name || item.manual_description || 'Item'}\n`
        msgPadrao += `     Qtd: ${item.quantity} × ${formatCurrency(u)}`
        if (item.discount > 0) msgPadrao += ` (-${formatCurrency(item.discount)})`
        msgPadrao += ` = *${formatCurrency(itemTotal)}*\n`
      })
    } else {
      msgPadrao += `  (Sem itens detalhados)\n`
    }
    msgPadrao += `\n━━━━━━━━━━━━━━━━━━\n`
    const totalComCommission = items && items.length > 0
      ? items.reduce((s: number, item: any) => s + (effectiveUnitPrice(Number(item.unit_price || 0)) * item.quantity - (item.discount || 0)), 0)
      : Number(budget.total_value ?? 0)
    msgPadrao += `💰 *TOTAL: ${formatCurrency(totalComCommission)}*\n\n`

    // ── EPIC-RR-DISPLAY S7: Distribuição semântica do RR ──
    // Calcula residualDistribution para popular o PDF (S6) e adicionar resumo
    // textual na mensagem. Degradação graceful: se taxComponents falhar, segue
    // sem o bloco (preservando comportamento anterior do WhatsApp).
    let residualDist: ReturnType<typeof computeResidualDistribution> | null = null
    try {
      const taxComponents = await loadTaxComponentsServer(tenant_id)
      const subtotal = (items ?? []).reduce(
        (s: number, it: any) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 0),
        0,
      )
      // Vₗ = total efetivamente faturado (após desconto). Em WhatsApp não temos
      // o discount_percent direto — usamos `budget.total_value` como Vₗ.
      const finalValue = Number(budget.total_value) || subtotal
      const residualItems: ResidualItemInput[] = (items ?? []).map((it: any) => ({
        unit_price: Number(it.unit_price) || 0,
        quantity: Number(it.quantity) || 0,
        commission_percent: it.commission_pct != null ? Number(it.commission_pct) * 100 : null,
        profit_percent: it.profit_pct != null ? Number(it.profit_pct) * 100 : null,
        tax_breakdown: (it.tax_breakdown ?? null) as TaxBreakdown | null,
      }))
      const regime: TaxRegime | null = (taxComponents?.regime as TaxRegime) ?? null
      residualDist = computeResidualDistribution(
        residualItems,
        subtotal,
        finalValue,
        regime,
        taxComponents ? { irpj: taxComponents.irpj, csll: taxComponents.csll } : undefined,
      )
      // Resumo textual no WhatsApp (4 ou 2 linhas conforme regime)
      if (residualDist.total.amount > 0) {
        msgPadrao += `📊 *Distribuição do Resultado:*\n`
        msgPadrao += `  Comissão: ${formatCurrency(residualDist.commission.amount)} (${formatResidualLine(residualDist.commission, residualDist.hasDiscount)})\n`
        msgPadrao += `  Lucro: ${formatCurrency(residualDist.profit.amount)} (${formatResidualLine(residualDist.profit, residualDist.hasDiscount)})\n`
        if (!residualDist.hidesProfitTaxes) {
          msgPadrao += `  IRPJ: ${formatCurrency(residualDist.irpj.amount)} (${formatResidualLine(residualDist.irpj, residualDist.hasDiscount)})\n`
          msgPadrao += `  CSLL: ${formatCurrency(residualDist.csll.amount)} (${formatResidualLine(residualDist.csll, residualDist.hasDiscount)})\n`
        }
        msgPadrao += `\n`
      }
    } catch {
      // graceful degradation — WhatsApp continua funcional sem o bloco
      residualDist = null
    }

    if (budget.notes) msgPadrao += `📝 *Obs:* ${budget.notes}\n\n`
    msgPadrao += `_Orçamento gerado pelo Precifica Certo_`

    // 4) Gerar PDF (total com comissão do vendedor quando aplicável)
    const pdfData = {
      id: budget.id,
      expiration_date: budget.expiration_date ?? null,
      total_value: totalComCommission,
      notes: budget.notes ?? null,
      customer: budget.customer ? { name: (budget.customer as any).name } : null,
      employee: budget.employee ? { name: (budget.employee as any).name } : null,
      company_name: tenant?.name ?? null,
      company_cnpj: tenant?.cnpj_cpf ?? null,
      items: (items ?? []).map((row: any) => ({
        quantity: row.quantity,
        unit_price: effectiveUnitPrice(Number(row.unit_price ?? 0)),
        discount: row.discount ?? 0,
        products: row.products
          ? { name: row.products.name, code: row.products.code }
          : row.manual_description
            ? { name: row.manual_description, code: null }
            : null,
      })),
      // EPIC-RR-DISPLAY S7: distribuição semântica para a seção do PDF (S6)
      residual_distribution: residualDist ?? undefined,
    }
    const pdfBuffer = createBudgetPdf(pdfData)
    const code = `ORC-${budget.id.substring(0, 4).toUpperCase()}`
    const fileName = `orcamento-${code}.pdf`
    const documentBase64 = Buffer.from(pdfBuffer).toString('base64')

    // 5) Ordem: 1) Mensagem conectividade (se houver), 2) Mensagem padrão com orçamento, 3) PDF
    if (msgConectividade) {
      const r1 = await sendWuzapiText(token, String(phoneRaw), msgConectividade)
      if (!r1.success) return res.status(502).json({ error: r1.error })
    }
    const textResult = await sendWuzapiText(token, String(phoneRaw), msgPadrao)
    if (!textResult.success) {
      return res.status(502).json({ error: textResult.error })
    }
    const docResult = await sendWuzapiDocument(token, String(phoneRaw), fileName, documentBase64)
    if (!docResult.success) {
      return res.status(502).json({ error: docResult.error })
    }

    // 7) Atualizar throttle uma vez
    await supabaseAdmin
      .from('tenant_settings')
      .update({ last_whatsapp_send_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id)

    // 8) Registrar disparo
    const fullMessage = msgConectividade ? `${msgConectividade}\n\n${msgPadrao}` : msgPadrao
    try {
      await supabaseAdmin.from('whatsapp_dispatches').insert({
        tenant_id,
        customer_id: budget.customer_id,
        type: 'BUDGET',
        message: fullMessage.substring(0, 500),
        phone: docResult.usedPhone,
        status: 'SENT',
      })
    } catch {
      /* ignore */
    }

    // 9) Se orçamento estava DRAFT, atualizar para SENT
    if (budget.status === 'DRAFT') {
      await supabaseAdmin
        .from('budgets')
        .update({ status: 'SENT', updated_at: new Date().toISOString() })
        .eq('id', id)
    }

    return res.status(200).json({ success: true, message: 'Orçamento enviado (PDF + mensagem).' })
  } catch (error: any) {
    console.error('Orçamento send WhatsApp error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao enviar orçamento.' })
  }
}
