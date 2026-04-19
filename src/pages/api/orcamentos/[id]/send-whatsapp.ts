import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'
import { createBudgetPdf } from '@/lib/create-budget-pdf'
import { sendWuzapiDocument, sendWuzapiText } from '@/lib/wuzapi-send'
import { formatBRL } from '@/utils/formatters'

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
      .select('quantity, unit_price, discount, manual_description, products(id, name, code)')
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
