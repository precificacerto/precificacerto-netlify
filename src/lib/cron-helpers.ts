import type { NextApiRequest } from 'next'
import type Stripe from 'stripe'

export type PlanStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

/**
 * Verifica autenticação do Vercel Cron via CRON_SECRET.
 * Se a env não estiver setada, libera (útil para dev local) — em produção,
 * o Vercel Cron envia automaticamente `Authorization: Bearer ${CRON_SECRET}`.
 */
export function checkCronAuth(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
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
