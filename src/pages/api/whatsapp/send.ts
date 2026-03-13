import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

const WUZAPI_BASE = process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop'

/**
 * Normaliza telefone brasileiro para formato internacional (DDI 55 + DDD + número).
 * Retorna até 2 variantes para tentar envio (com e sem 9° dígito).
 * Ex: "48984529779" → ["5548984529779", "554898452977"]
 */
function normalizePhoneBR(raw: string): string[] {
  const digits = raw.replace(/\D/g, '')
  if (!digits.length) return []

  // Adiciona DDI 55 se necessário
  let withDdi = digits
  if (digits.length <= 11 && !digits.startsWith('55')) {
    withDdi = '55' + digits
  }

  const variants: string[] = [withDdi]

  // Celulares brasileiros: 55 + DDD(2) + 9 + número(8) = 13 dígitos
  // Alguns números no WhatsApp podem estar registrados sem o 9° dígito (formato antigo: 12 dígitos)
  if (withDdi.length === 13 && withDdi.startsWith('55')) {
    const ddd = withDdi.slice(2, 4)
    const ninthDigit = withDdi[4]
    const rest = withDdi.slice(5)
    // Se o 5° dígito é "9" (indicador de celular), criar variante sem ele
    if (ninthDigit === '9') {
      variants.push('55' + ddd + rest) // 12 dígitos (formato antigo)
    }
  }

  // Se já tem 12 dígitos (sem 9°), criar variante COM o 9
  if (withDdi.length === 12 && withDdi.startsWith('55')) {
    const ddd = withDdi.slice(2, 4)
    const number = withDdi.slice(4)
    variants.push('55' + ddd + '9' + number) // 13 dígitos
  }

  return variants
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  try {
    const { tenant_id, user_id } = caller
    const { phone, text } = req.body || {}

    if (!phone || typeof text !== 'string') {
      return res.status(400).json({ error: 'Envie phone e text no body (JSON).' })
    }

    const phoneVariants = normalizePhoneBR(String(phone))
    if (phoneVariants.length === 0) {
      return res.status(400).json({ error: 'Número de telefone inválido.' })
    }

    const { data: settings } = await supabaseAdmin
      .from('tenant_settings')
      .select('whatsapp_instance_mode, whatsapp_shared_instance_user_id, last_whatsapp_send_at')
      .eq('tenant_id', tenant_id)
      .single()

    const THROTTLE_SECONDS = 60
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
      .eq('tenant_id', tenant_id)
      .single()

    const token = userRow?.wuzapi_token
    if (!token) {
      return res.status(409).json({
        error: mode === 'SHARED'
          ? 'O administrador ainda não conectou o WhatsApp.'
          : 'Conecte seu WhatsApp via QR Code antes de enviar.',
      })
    }

    // Tentar enviar com cada variante de telefone (com/sem 9° dígito)
    let lastError = ''
    for (const phoneVariant of phoneVariants) {
      if (process.env.NODE_ENV === 'development') console.log(`[WhatsApp Send] Tentando enviar para: ***${phoneVariant.slice(-4)}`)
      const sendRes = await fetch(`${WUZAPI_BASE}/chat/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token,
        },
        body: JSON.stringify({ Phone: phoneVariant, Body: text }),
      })

      if (sendRes.ok) {
        const result = await sendRes.json().catch(() => ({}))
        if (process.env.NODE_ENV === 'development') console.log(`[WhatsApp Send] ✅ Sucesso com número: ***${phoneVariant.slice(-4)}`)
        await supabaseAdmin
          .from('tenant_settings')
          .update({ last_whatsapp_send_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id)
        return res.status(200).json(result)
      }

      const errText = await sendRes.text()
      console.warn(`[WhatsApp Send] ❌ Falha com ***${phoneVariant.slice(-4)}: ${sendRes.status}`)
      lastError = errText

      // Se o erro é "no LID found" ou similar, tenta a próxima variante
      if (errText.includes('no LID found') || errText.includes('not registered') || errText.includes('not on WhatsApp')) {
        continue
      }

      // Para outros erros (ex: não conectado), não adianta tentar outra variante
      try {
        const errJson = JSON.parse(errText)
        return res.status(sendRes.status >= 500 ? 502 : sendRes.status).json({
          error: errJson.message || errJson.error || errText,
        })
      } catch {
        return res.status(502).json({ error: errText || 'Falha ao enviar mensagem.' })
      }
    }

    // Todas as variantes falharam
    console.error(`[WhatsApp Send] Todas as variantes falharam (${phoneVariants.length} tentativas)`)
    try {
      const errJson = JSON.parse(lastError)
      return res.status(502).json({
        error: `Número não encontrado no WhatsApp. Tentamos: ${phoneVariants.join(', ')}. Erro: ${errJson.message || errJson.error || lastError}`,
      })
    } catch {
      return res.status(502).json({
        error: `Número não encontrado no WhatsApp. Tentamos: ${phoneVariants.join(', ')}. Verifique se o número está correto e se tem WhatsApp.`,
      })
    }
  } catch (error: any) {
    console.error('WhatsApp send error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao enviar mensagem.' })
  }
}
