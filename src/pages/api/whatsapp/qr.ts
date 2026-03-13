import type { NextApiRequest, NextApiResponse } from 'next'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

const WUZAPI_BASE = (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')
const WUZAPI_ADMIN_TOKEN = process.env.WUZAPI_ADMIN_TOKEN

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!WUZAPI_ADMIN_TOKEN) {
    return res.status(503).json({ error: 'WUZAPI não configurado. Defina WUZAPI_ADMIN_TOKEN no servidor.' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  try {
    const { tenant_id, user_id } = caller

    const { data: settings } = await supabaseAdmin
      .from('tenant_settings')
      .select('whatsapp_instance_mode, whatsapp_shared_instance_user_id')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    const mode = settings?.whatsapp_instance_mode || 'OWN'
    const sharedOwnerId = settings?.whatsapp_shared_instance_user_id ?? null

    if (mode === 'SHARED' && sharedOwnerId && sharedOwnerId !== user_id) {
      return res.status(200).json({
        useShared: true,
        message: 'Disparos usam o WhatsApp do administrador. Conecte o WhatsApp na conta do super admin.',
      })
    }

    const targetUserId = mode === 'SHARED' && sharedOwnerId ? sharedOwnerId : user_id

    const clearStoredToken = async () => {
      await supabaseAdmin.from('users').update({ wuzapi_token: null }).eq('id', targetUserId).eq('tenant_id', tenant_id)
    }

    let retried = false
    let wuzapiToken: string | null = null
    let qrRes: Response
    let isLoggedIn = false

    while (true) {
      const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('wuzapi_token, email')
        .eq('id', targetUserId)
        .eq('tenant_id', tenant_id)
        .single()

      wuzapiToken = targetUser?.wuzapi_token ?? null

      // Se não tem token, cria o usuário na WUZAPI
      if (!wuzapiToken) {
        wuzapiToken = crypto.randomUUID().replace(/-/g, '') + '_' + Date.now().toString(36)
        const name = (targetUser?.email || `user-${targetUserId.slice(0, 8)}`) as string

        const createRes = await fetch(`${WUZAPI_BASE}/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: WUZAPI_ADMIN_TOKEN!,
          },
          body: JSON.stringify({ name, token: wuzapiToken }),
        })

        if (!createRes.ok) {
          const errText = await createRes.text()
          console.error('WUZAPI create user failed:', createRes.status)
          const hint = createRes.status === 401 || createRes.status === 403
            ? ' Token de admin inválido ou expirado.'
            : createRes.status >= 500
              ? ' Serviço WUZAPI indisponível.'
              : ''
          return res.status(502).json({
            error: `Falha ao criar instância WhatsApp (${createRes.status}). Verifique o WUZAPI_ADMIN_TOKEN e a WUZAPI_BASE_URL no .env.${hint}`,
            details: process.env.NODE_ENV === 'development' ? errText.slice(0, 200) : undefined,
          })
        }

        const { error: updateErr } = await supabaseAdmin
          .from('users')
          .update({ wuzapi_token: wuzapiToken })
          .eq('id', targetUserId)
          .eq('tenant_id', tenant_id)

        if (updateErr) {
          console.error('Failed to save wuzapi_token:', updateErr?.message)
          return res.status(500).json({ error: 'Erro ao salvar configuração.' })
        }
      }

      // Verificar status da sessão
      const statusRes = await fetch(`${WUZAPI_BASE}/session/status`, {
        method: 'GET',
        headers: { token: wuzapiToken },
      })

      if (statusRes.status === 401 || statusRes.status === 403) {
        console.warn('WUZAPI session/status 401/403 - token antigo (outro servidor?). Limpando e recriando.')
        await clearStoredToken()
        if (!retried) {
          retried = true
          continue
        }
        return res.status(502).json({
          error: 'Token da instância era do servidor antigo. Clique em "Conectar via QR Code" novamente.',
        })
      }

      let sessionAlive = false
      if (statusRes.ok) {
        const statusBody = await statusRes.json()
        const statusCode = statusBody?.data?.Status
        sessionAlive = statusCode === 1 || statusCode === 2 || statusCode === 3
        isLoggedIn = statusBody?.data?.loggedIn === true || statusBody?.data?.LoggedIn === true || statusCode === 3
      }

      let connectQr: string | null = null

      // Se sessão não está ativa OU não está logada (Conectado mas Entrou: Não), pedir conexão/QR
      if (!sessionAlive || !isLoggedIn) {
        const connectRes = await fetch(`${WUZAPI_BASE}/session/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: wuzapiToken,
          },
          body: JSON.stringify({
            Subscribe: ['Message', 'ReadReceipt', 'Presence', 'HistorySync', 'ChatPresence'],
            Immediate: true,
          }),
        })

        if (connectRes.status === 401 || connectRes.status === 403) {
          console.warn('WUZAPI session/connect 401/403 - token antigo. Limpando e recriando.')
          await clearStoredToken()
          if (!retried) {
            retried = true
            continue
          }
          return res.status(502).json({
            error: 'Token da instância era do servidor antigo. Clique em "Conectar via QR Code" novamente.',
          })
        }
        if (connectRes.ok) {
          const connectBody = await connectRes.json().catch(() => null)
          if (connectBody) {
            const qrFromConnect =
              connectBody?.data?.qrcode ?? connectBody?.data?.QRCode ?? connectBody?.data?.qrCode ?? connectBody?.data?.qr
              ?? connectBody?.qrcode ?? connectBody?.QRCode ?? connectBody?.qrCode ?? connectBody?.qr
            if (typeof qrFromConnect === 'string' && qrFromConnect.trim()) {
              connectQr = qrFromConnect.startsWith('data:') || qrFromConnect.startsWith('http')
                ? qrFromConnect
                : `data:image/png;base64,${qrFromConnect.trim()}`
            }
          }
        } else {
          const errText = await connectRes.text()
          console.error('WUZAPI session/connect failed:', connectRes.status)
        }
      }

      if (connectQr) {
        return res.status(200).json({ qr: connectQr })
      }

      // Dar tempo ao servidor gerar o QR após o connect (instância "Conectado" mas "Entrou: Não")
      if (!sessionAlive || !isLoggedIn) {
        await new Promise(r => setTimeout(r, 800))
      }

      // Pegar QR code
      qrRes = await fetch(`${WUZAPI_BASE}/session/qr`, {
        method: 'GET',
        headers: { token: wuzapiToken },
      })

      if (qrRes.status === 401 || qrRes.status === 403) {
        console.warn('WUZAPI session/qr 401/403 - token antigo. Limpando e recriando.')
        await clearStoredToken()
        if (!retried) {
          retried = true
          continue
        }
        return res.status(502).json({
          error: 'Token da instância era do servidor antigo. Clique em "Conectar via QR Code" novamente.',
        })
      }

      if (!qrRes.ok) {
        const errText = await qrRes.text()
        console.error('WUZAPI session/qr failed:', qrRes.status)
        const hint = qrRes.status >= 500 ? ' Serviço WUZAPI indisponível ou timeout.' : ''
        return res.status(502).json({
          error: `Falha ao obter QR Code (${qrRes.status}).${hint} Tente novamente.`,
          details: process.env.NODE_ENV === 'development' ? errText.slice(0, 200) : undefined,
        })
      }

      break
    }

    const contentType = qrRes.headers.get('content-type') || ''

    if (contentType.includes('image/')) {
      const buf = await qrRes.arrayBuffer()
      const base64 = Buffer.from(buf).toString('base64')
      const mime = contentType.split(';')[0].trim() || 'image/png'
      return res.status(200).json({ qr: `data:${mime};base64,${base64}` })
    }

    if (contentType.includes('application/json')) {
      const body = await qrRes.json()

      function extractQr(obj: unknown): string | null {
        if (typeof obj === 'string' && obj.trim()) {
          return obj.startsWith('data:') || obj.startsWith('http') ? obj : `data:image/png;base64,${obj.trim()}`
        }
        if (obj && typeof obj === 'object') {
          const o = obj as Record<string, unknown>
          for (const k of ['QRCode', 'qrCode', 'qrcode', 'qr', 'QR', 'qrcodeBase64', 'image']) {
            const v = o[k]
            if (typeof v === 'string' && v.trim()) return extractQr(v)
          }
          if (o.data) return extractQr(o.data)
        }
        return null
      }

      // WUZAPI / ZuckZapGo: várias formas de retorno (data.QRCode, data.qrcode, qrCode no topo, etc.)
      const qrValue =
        body?.data?.QRCode ?? body?.data?.qrCode ?? body?.data?.qrcode ?? body?.data?.qr
        ?? body?.qrCode ?? body?.qrcode ?? body?.qr
        ?? (typeof body?.data === 'string' ? body.data : null)

      if (typeof qrValue === 'string' && qrValue) {
        const normalized = qrValue.startsWith('data:') || qrValue.startsWith('http')
          ? qrValue
          : `data:image/png;base64,${qrValue}`
        return res.status(200).json({ qr: normalized })
      }

      const extracted = extractQr(body)
      if (extracted) return res.status(200).json({ qr: extracted })

      // QRCode vazio = só considerar "já conectado" se a sessão estiver realmente logada (Entrou: Sim)
      if (body?.success && (qrValue === '' || qrValue === null || qrValue === undefined)) {
        if (isLoggedIn) {
          return res.status(200).json({ alreadyConnected: true, message: 'WhatsApp já está conectado.' })
        }
        const rawHint = process.env.NODE_ENV === 'development'
          ? JSON.stringify(body).slice(0, 300)
          : undefined
        return res.status(502).json({
          error: 'QR não disponível. Clique em "Conectar via QR Code" novamente para gerar o QR e escanear no WhatsApp.',
          details: rawHint,
        })
      }

      return res.status(200).json(body)
    }

    const text = await qrRes.text()
    if (text.startsWith('data:') || text.startsWith('http')) {
      return res.status(200).json({ qr: text })
    }
    return res.status(200).json({ qr: text })
  } catch (error: any) {
    console.error('WhatsApp QR error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao obter QR Code.' })
  }
}
