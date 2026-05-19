import type { NextApiRequest, NextApiResponse } from 'next'
import { checkCronAuth } from '@/lib/cron-helpers'
import {
  checkAndAlertDivergences,
  DEFAULT_ALERT_CONFIG,
} from '@/lib/mrm-divergence-alerts'

/**
 * GET/POST /api/cron/check-mrm-divergences
 *
 * Schedule sugerido (vercel.json): "0,15,30,45 * * * *" (a cada 15min).
 *
 * Verifica divergências MRM cliente vs edge na janela rolante de 1h e dispara
 * alertas (Slack/email) se thresholds forem violados em 2 janelas consecutivas
 * (anti-flapping).
 *
 * Auth: CRON_SECRET via header `Authorization: Bearer <secret>`. Mesmo padrão
 * dos demais crons do projeto (cron-helpers.ts).
 *
 * Best effort: se nenhum canal de alerta estiver configurado, retorna 200
 * com `channels.logOnly = true` (não falha).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!checkCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await checkAndAlertDivergences()
    return res.status(200).json({
      ok: true,
      config: DEFAULT_ALERT_CONFIG,
      ...result,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'cron failed'
    console.error('[cron/check-mrm-divergences] error:', msg)
    return res.status(500).json({ error: msg })
  }
}
