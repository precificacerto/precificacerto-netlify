import type { NextApiRequest, NextApiResponse } from 'next'
import { runReminderCycle } from '@/pages/api/whatsapp/send-reminder'

const CRON_SECRET = process.env.CRON_SECRET

function checkCronAuth(req: NextApiRequest): boolean {
  if (!CRON_SECRET) return true
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7) === CRON_SECRET
  return false
}

/**
 * GET/POST /api/cron/whatsapp-reminders
 *
 * Chamado a cada minuto pela Vercel Cron (* * * * *).
 * Executa a lógica de envio de lembretes diretamente (sem fetch interno).
 * tenantId = null para processar todos os tenants.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!checkCronAuth(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const result = await runReminderCycle(null)
    return res.status(200).json(result)
  } catch (error: any) {
    console.error('[CRON] Erro:', error?.message || 'Cron failed')
    return res.status(500).json({ error: error.message || 'Cron failed' })
  }
}
