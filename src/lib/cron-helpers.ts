import type { NextApiRequest } from 'next'
import type Stripe from 'stripe'

export type PlanStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

/**
 * Verifica autenticação do Vercel Cron via CRON_SECRET (FAIL-CLOSED).
 *
 * Em produção, o Vercel Cron envia automaticamente
 * `Authorization: Bearer ${CRON_SECRET}` quando a env está setada no projeto.
 *
 * Política (CRÍT-4, Founder 2026-05-27):
 *   - Se CRON_SECRET NÃO estiver setado em qualquer environment (prod/preview/dev),
 *     REJEITA o acesso. Antes da mudança o helper liberava com `return true`,
 *     o que tornava o endpoint público em qualquer deploy/ambiente sem a env.
 *   - Para dev local, configure `CRON_SECRET=qualquer-valor` no `.env.local`
 *     e envie `Authorization: Bearer qualquer-valor` no curl.
 */
export function checkCronAuth(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error('[cron] CRON_SECRET não configurado — recusando acesso (fail-closed)')
    return false
  }
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7) === secret
  return false
}

/**
 * Mapeia o status de uma Subscription do Stripe para o enum plan_status do banco.
 * - trialing → TRIAL
 * - active   → ACTIVE
 * - past_due | unpaid | incomplete | paused → SUSPENDED
 * - canceled | incomplete_expired → CANCELLED
 */
export function mapStripeStatusToPlanStatus(status: Stripe.Subscription.Status): PlanStatus {
  switch (status) {
    case 'trialing':
      return 'TRIAL'
    case 'active':
      return 'ACTIVE'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return 'SUSPENDED'
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELLED'
    default:
      return 'SUSPENDED'
  }
}
