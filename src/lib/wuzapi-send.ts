const WUZAPI_BASE = (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

/**
 * Normaliza telefone brasileiro para formato internacional (DDI 55 + DDD + número).
 * Retorna até 2 variantes para tentar envio (com e sem 9° dígito).
 */
export function normalizePhoneBR(raw: string): string[] {
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

export type WuzapiSendResult = { success: true; usedPhone: string } | { success: false; error: string }

/**
 * Envia documento (ex.: PDF) via WUZAPI. Tenta variantes de telefone.
 */
export async function sendWuzapiDocument(
  token: string,
  phone: string,
  fileName: string,
  documentBase64OrDataUri: string
): Promise<WuzapiSendResult> {
  const variants = normalizePhoneBR(phone)
  if (!variants.length) return { success: false, error: 'Número de telefone inválido.' }
  // API exige prefixo "data:application/octet-stream;base64,"
  const base64Only = documentBase64OrDataUri.startsWith('data:')
    ? documentBase64OrDataUri.replace(/^data:[^;]+;base64,/, '')
    : documentBase64OrDataUri
  const documentPayload = `data:application/octet-stream;base64,${base64Only}`
  let lastError = ''
  for (const phoneVariant of variants) {
    const res = await fetch(`${WUZAPI_BASE}/chat/send/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ Phone: phoneVariant, FileName: fileName, Document: documentPayload }),
    })
    if (res.ok) return { success: true, usedPhone: phoneVariant }
    const errText = await res.text()
    lastError = errText
    if (
      errText.includes('no LID found') ||
      errText.includes('not registered') ||
      errText.includes('not on WhatsApp')
    ) {
      continue
    }
    try {
      const errJson = JSON.parse(errText)
      return { success: false, error: errJson.message || errJson.error || errText }
    } catch {
      return { success: false, error: errText || 'Falha ao enviar documento.' }
    }
  }
  return { success: false, error: lastError || 'Número não encontrado no WhatsApp.' }
}

/**
 * Envia mensagem de texto via WUZAPI. Tenta variantes de telefone.
 */
export async function sendWuzapiText(
  token: string,
  phone: string,
  text: string
): Promise<WuzapiSendResult> {
  const variants = normalizePhoneBR(phone)
  if (!variants.length) return { success: false, error: 'Número de telefone inválido.' }
  let lastError = ''
  for (const phoneVariant of variants) {
    const res = await fetch(`${WUZAPI_BASE}/chat/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ Phone: phoneVariant, Body: text }),
    })
    if (res.ok) return { success: true, usedPhone: phoneVariant }
    const errText = await res.text()
    lastError = errText
    if (
      errText.includes('no LID found') ||
      errText.includes('not registered') ||
      errText.includes('not on WhatsApp')
    ) {
      continue
    }
    try {
      const errJson = JSON.parse(errText)
      return { success: false, error: errJson.message || errJson.error || errText }
    } catch {
      return { success: false, error: errText || 'Falha ao enviar mensagem.' }
    }
  }
  return { success: false, error: lastError || 'Número não encontrado no WhatsApp.' }
}
