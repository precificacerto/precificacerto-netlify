import type { NextApiRequest, NextApiResponse } from 'next'
import Stripe from 'stripe'
import { handleCheckoutCompleted } from './webhook'

// Usa a versão padrão da API Stripe configurada na conta.
// Removemos o apiVersion explícito para evitar erros de versão inválida.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { sessionId } = req.body as { sessionId?: string }

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId é obrigatório' })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' })
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Pagamento ainda não foi confirmado pela Stripe.' })
    }

    await handleCheckoutCompleted(session as any)

    return res.status(200).json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown'
    console.error('confirm-checkout-session error:', message)
    return res.status(500).json({ error: message })
  }
}

