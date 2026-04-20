import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { sendWuzapiText } from '@/lib/wuzapi-send'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Dispatch window: 09:00 - 17:00 Brasilia time (UTC-3)
const DISPATCH_START_HOUR = 9
const DISPATCH_END_HOUR = 17
const DISPATCH_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes between messages

function isWithinDispatchWindow(): boolean {
    const now = new Date()
    // Brasilia is UTC-3
    const brasiliaHour = (now.getUTCHours() - 3 + 24) % 24
    return brasiliaHour >= DISPATCH_START_HOUR && brasiliaHour < DISPATCH_END_HOUR
}

function replacePlaceholders(template: string, clientName: string, itemName: string): string {
    return template
        .replace(/\{\{nome_cliente\}\}/g, clientName)
        .replace(/\{\{nome_produto\}\}/g, itemName)
        .replace(/\{\{nome_servico\}\}/g, itemName)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    if (!isWithinDispatchWindow()) {
        return res.status(200).json({ message: 'Outside dispatch window (09:00-17:00 BRT)', dispatched: 0 })
    }

    try {
        const now = new Date()
        const nowIso = now.toISOString()

        // Check if last dispatch was less than 30 minutes ago (throttle: 1 per 30min)
        const { data: lastSent } = await supabaseAdmin
            .from('recurrence_dispatch_queue')
            .select('sent_at')
            .eq('status', 'SENT')
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (lastSent?.sent_at) {
            const lastSentTime = new Date(lastSent.sent_at).getTime()
            const elapsed = now.getTime() - lastSentTime
            if (elapsed < DISPATCH_INTERVAL_MS) {
                return res.status(200).json({ message: 'Throttled: waiting 30min between dispatches', dispatched: 0 })
            }
        }

        // Get next pending dispatch (1 at a time, ordered by scheduled_at)
        const { data: queue, error: qErr } = await supabaseAdmin
            .from('recurrence_dispatch_queue')
            .select(`
                id,
                recurrence_record_id,
                user_id,
                tenant_id,
                recurrence_records(
                    id, customer_id, product_id, service_id, type, amount, custom_message,
                    customers(name, whatsapp_phone, phone),
                    products(name),
                    services(name)
                )
            `)
            .eq('status', 'PENDING')
            .lte('scheduled_at', nowIso)
            .order('scheduled_at', { ascending: true })
            .limit(1)

        if (qErr || !queue?.length) {
            return res.status(200).json({ message: 'No pending dispatches', dispatched: 0 })
        }

        const dispatch = queue[0] as any
        const record = dispatch.recurrence_records
        if (!record) {
            await supabaseAdmin.from('recurrence_dispatch_queue').update({ status: 'FAILED', error_message: 'Record not found' }).eq('id', dispatch.id)
            return res.status(200).json({ message: 'Record not found', dispatched: 0 })
        }

        // Mark as processing
        await supabaseAdmin.from('recurrence_dispatch_queue').update({ status: 'PROCESSING' }).eq('id', dispatch.id)

        // Get user's WuzAPI token
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('wuzapi_token')
            .eq('id', dispatch.user_id)
            .single()

        if (!user?.wuzapi_token) {
            await supabaseAdmin.from('recurrence_dispatch_queue').update({
                status: 'FAILED',
                error_message: 'User has no WhatsApp connected',
            }).eq('id', dispatch.id)
            return res.status(200).json({ message: 'No WhatsApp token for user', dispatched: 0 })
        }

        const customerName = record.customers?.name || 'Cliente'

        let messageText: string
        if (record.type === 'CUSTOMER') {
            const template = record.custom_message || 'Olá {{nome_cliente}}, sentimos sua falta! Passando para manter o contato.'
            messageText = template.replace(/\{\{nome_cliente\}\}/g, customerName)
        } else {
            // Get message template for product/service dispatches
            const { data: msgTemplate } = await supabaseAdmin
                .from('recurrence_messages')
                .select('message_products, message_services')
                .eq('tenant_id', dispatch.tenant_id)
                .eq('user_id', dispatch.user_id)
                .maybeSingle()

            const template = record.type === 'PRODUCT'
                ? (msgTemplate?.message_products || 'Olá {{nome_cliente}}, gostaríamos de lembrá-lo sobre {{nome_produto}}.')
                : (msgTemplate?.message_services || 'Olá {{nome_cliente}}, gostaríamos de lembrá-lo sobre {{nome_servico}}.')

            const itemName = record.type === 'PRODUCT'
                ? (record.products?.name || 'produto')
                : (record.services?.name || 'serviço')

            messageText = replacePlaceholders(template, customerName, itemName)
        }

        const phone = record.customers?.whatsapp_phone || record.customers?.phone
        if (!phone) {
            await supabaseAdmin.from('recurrence_dispatch_queue').update({
                status: 'FAILED',
                error_message: 'Customer has no phone number',
            }).eq('id', dispatch.id)
            return res.status(200).json({ message: 'No phone for customer', dispatched: 0 })
        }

        // Send via WuzAPI
        const result = await sendWuzapiText(user.wuzapi_token, phone, messageText)

        if (result.success) {
            await supabaseAdmin.from('recurrence_dispatch_queue').update({
                status: 'SENT',
                sent_at: new Date().toISOString(),
            }).eq('id', dispatch.id)

            // Update recurrence record status
            await supabaseAdmin.from('recurrence_records').update({
                status: 'SENT',
                updated_at: new Date().toISOString(),
            }).eq('id', record.id)

            return res.status(200).json({ message: 'Dispatched successfully', dispatched: 1 })
        } else {
            await supabaseAdmin.from('recurrence_dispatch_queue').update({
                status: 'FAILED',
                error_message: result.error || 'Send failed',
            }).eq('id', dispatch.id)

            return res.status(200).json({ message: 'Send failed', dispatched: 0, error: result.error })
        }
    } catch (err: any) {
        console.error('[send-recurrence] Error:', err)
        return res.status(500).json({ error: err.message || 'Internal error' })
    }
}
