import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'

const WUZAPI_BASE = (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

// Intervalo mínimo entre disparos de lembrete (em segundos)
const THROTTLE_SECONDS = 60

/**
 * Tenta obter o tenant_id do chamador sem forçar erro 401.
 */
async function getCallerTenantSilent(req: NextApiRequest): Promise<string | null> {
    try {
        const token = req.cookies.token
        if (!token) return null
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
        if (error || !user) return null
        const { data: profile } = await supabaseAdmin
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single()
        return profile?.tenant_id || null
    } catch {
        return null
    }
}

/**
 * Normaliza telefone brasileiro para formato internacional.
 * Retorna variantes com e sem 9° dígito para retry.
 */
function normalizePhoneBR(raw: string): string[] {
    const digits = raw.replace(/\D/g, '')
    if (!digits.length) return []

    let withDdi = digits
    if (digits.length <= 11 && !digits.startsWith('55')) {
        withDdi = '55' + digits
    }

    const variants: string[] = [withDdi]

    if (withDdi.length === 13 && withDdi.startsWith('55')) {
        const ddd = withDdi.slice(2, 4)
        const ninthDigit = withDdi[4]
        const rest = withDdi.slice(5)
        if (ninthDigit === '9') {
            variants.push('55' + ddd + rest)
        }
    }

    if (withDdi.length === 12 && withDdi.startsWith('55')) {
        const ddd = withDdi.slice(2, 4)
        const number = withDdi.slice(4)
        variants.push('55' + ddd + '9' + number)
    }

    return variants
}

/**
 * Tenta enviar mensagem WhatsApp via WUZAPI, com retry de variantes de telefone.
 */
async function sendWhatsAppWithRetry(
    token: string,
    phoneVariants: string[],
    text: string
): Promise<{ sent: boolean; phone_used?: string; reason?: string }> {
    let lastError = ''

    for (const phoneVariant of phoneVariants) {
        if (process.env.NODE_ENV === 'development') console.log(`[Reminder] Tentando enviar para: ***${phoneVariant.slice(-4)}`)
        const sendRes = await fetch(`${WUZAPI_BASE}/chat/send/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token },
            body: JSON.stringify({ Phone: phoneVariant, Body: text }),
        })

        if (sendRes.ok) {
            if (process.env.NODE_ENV === 'development') console.log(`[Reminder] ✅ Sucesso com número: ***${phoneVariant.slice(-4)}`)
            return { sent: true, phone_used: phoneVariant }
        }

        const errText = await sendRes.text()
        console.warn(`[Reminder] ❌ Falha com ***${phoneVariant.slice(-4)}: ${sendRes.status}`)
        lastError = errText

        if (errText.includes('no LID found') || errText.includes('not registered') || errText.includes('not on WhatsApp')) {
            continue
        }

        return { sent: false, reason: lastError }
    }

    return { sent: false, reason: `Número não encontrado no WhatsApp (${phoneVariants.length} tentativas)` }
}

export type ReminderCycleResult =
    | { sent: 0; reason: string; error?: string; next_send_in_seconds?: number; next_send_at?: string }
    | { event_id: string; sent: boolean; reason?: string }

/**
 * Executa um ciclo de envio: busca 1 lembrete pendente, respeita throttle, reserva e envia.
 * Usado tanto pelo handler HTTP quanto pelo cron (sem depender de fetch interno).
 * @param tenantId - se fornecido, só considera eventos desse tenant; null = todos os tenants
 */
export async function runReminderCycle(tenantId: string | null): Promise<ReminderCycleResult> {
    const now = new Date()
    const nowISO = now.toISOString()

    let query = supabaseAdmin
        .from('calendar_events')
        .select('id, tenant_id, start_time, customer_id, reminder_send_at')
        .lte('reminder_send_at', nowISO)
        .gt('start_time', nowISO)
        .not('customer_id', 'is', null)
        .eq('whatsapp_reminder_sent', false)
        .in('status', ['SCHEDULED', 'CONFIRMED'])
        .order('reminder_send_at', { ascending: true })
        .limit(1)

    if (tenantId) {
        query = query.eq('tenant_id', tenantId)
    }

    const { data: events, error: evError } = await query

    if (evError) {
        console.error('[Reminder] Erro na query:', evError?.message)
        return { sent: 0, reason: 'query_error', error: evError.message }
    }

    if (!events || events.length === 0) {
        return { sent: 0, reason: 'no_pending_reminders' }
    }

    const ev = events[0]

    const { data: settings } = await supabaseAdmin
        .from('tenant_settings')
        .select('last_whatsapp_send_at')
        .eq('tenant_id', ev.tenant_id)
        .single()

    const lastSend = settings?.last_whatsapp_send_at ? new Date(settings.last_whatsapp_send_at).getTime() : 0
    const throttleMs = THROTTLE_SECONDS * 1000
    if (lastSend && now.getTime() - lastSend < throttleMs) {
        const nextSendAt = new Date(lastSend + throttleMs)
        const secondsLeft = Math.ceil((nextSendAt.getTime() - now.getTime()) / 1000)
        console.log(`[Reminder] Throttle ativo. Próximo envio em ${secondsLeft}s.`)
        return {
            sent: 0,
            reason: 'throttle',
            next_send_in_seconds: secondsLeft,
            next_send_at: nextSendAt.toISOString(),
        }
    }

    const { data: claimed, error: claimError } = await supabaseAdmin
        .from('calendar_events')
        .update({ whatsapp_reminder_sent: true })
        .eq('id', ev.id)
        .eq('whatsapp_reminder_sent', false)
        .select('id, tenant_id')
        .single()

    if (claimError || !claimed) {
        console.log('[Reminder] Evento já processado por outra execução:', ev.id)
        return { sent: 0, reason: 'already_processed' }
    }

    if (process.env.NODE_ENV === 'development') console.log(`[Reminder] Processando evento ${ev.id}`)
    return await processReminderEvent(ev as any)
}

/**
 * POST /api/whatsapp/send-reminder
 *
 * Dispara lembretes pendentes de agendamento.
 * Chamado pela agenda (polling) e pelo cron (que chama runReminderCycle diretamente).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const tenantId = await getCallerTenantSilent(req)

    try {
        const result = await runReminderCycle(tenantId)
        return res.status(200).json(result)
    } catch (error: any) {
        console.error('[Reminder] Erro:', error?.message || 'Unknown error')
        return res.status(500).json({ error: error.message || 'Erro ao processar lembrete' })
    }
}

type EventRow = { id: string; tenant_id: string; start_time: string; customer_id: string }

async function processReminderEvent(ev: EventRow): Promise<{ event_id: string; sent: boolean; reason?: string }> {
    try {
        const { data: customer } = await supabaseAdmin
            .from('customers')
            .select('id, name, whatsapp_phone, phone')
            .eq('id', ev.customer_id)
            .single()

        const rawPhone = (customer?.whatsapp_phone || customer?.phone || '').trim()
        if (!rawPhone) {
            return { event_id: ev.id, sent: false, reason: 'no_phone' }
        }

        const phoneVariants = normalizePhoneBR(rawPhone)
        if (phoneVariants.length === 0) {
            return { event_id: ev.id, sent: false, reason: 'invalid_phone' }
        }

        const customerName = customer?.name || 'Cliente'

        const { data: settings } = await supabaseAdmin
            .from('tenant_settings')
            .select('whatsapp_reminder_message, whatsapp_instance_mode, whatsapp_shared_instance_user_id')
            .eq('tenant_id', ev.tenant_id)
            .single()

        if (!settings) {
            return { event_id: ev.id, sent: false, reason: 'no_settings' }
        }

        const template = (settings.whatsapp_reminder_message || 'Olá, {{nome_cliente}}! Lembrete do seu agendamento.').trim()
        const startDate = new Date(ev.start_time)
        const dateFormatted = startDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        const timeFormatted = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
        const text = template
            .replace(/\{\{nome_cliente\}\}/gi, customerName)
            .replace(/\{\{data_agendamento\}\}/gi, dateFormatted)
            .replace(/\{\{horario_agendamento\}\}/gi, timeFormatted)

        const mode = settings.whatsapp_instance_mode || 'OWN'
        const sharedOwnerId = settings.whatsapp_shared_instance_user_id ?? null
        const effectiveUserId = mode === 'SHARED' && sharedOwnerId ? sharedOwnerId : null

        let token: string | null = null
        if (effectiveUserId) {
            const { data: userRow } = await supabaseAdmin.from('users').select('wuzapi_token').eq('id', effectiveUserId).eq('tenant_id', ev.tenant_id).single()
            token = userRow?.wuzapi_token ?? null
        }
        if (!token) {
            const { data: anyUser } = await supabaseAdmin
                .from('users')
                .select('id, wuzapi_token')
                .eq('tenant_id', ev.tenant_id)
                .not('wuzapi_token', 'is', null)
                .limit(1)
                .single()
            token = anyUser?.wuzapi_token ?? null
        }

        if (!token) {
            return { event_id: ev.id, sent: false, reason: 'no_whatsapp_token' }
        }

        const sendResult = await sendWhatsAppWithRetry(token, phoneVariants, text)

        if (sendResult.sent) {
            await supabaseAdmin
                .from('tenant_settings')
                .update({ last_whatsapp_send_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('tenant_id', ev.tenant_id)
            return { event_id: ev.id, sent: true }
        }

        return { event_id: ev.id, sent: false, reason: sendResult.reason }
    } catch (error: any) {
        console.error(`[Reminder] Erro evento ${ev.id}:`, error?.message || 'Unknown error')
        return { event_id: ev.id, sent: false, reason: error.message }
    }
}
