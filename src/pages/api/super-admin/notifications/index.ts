import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

/**
 * FEAT-SALES-NOTIFICATIONS — feed de eventos de venda/pagamento (super-admin).
 *
 * GET   → lista as notificações mais recentes + contagem de não lidas.
 *         Query: ?limit=50 (default 50, máx 200)
 * PATCH → marca como lida. Body: { id } (uma) ou { markAll: true } (todas).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  try {
    if (req.method === 'GET') {
      const limit = Math.min(Number(req.query.limit) || 50, 200)
      const [{ data: rows, error }, { count }] = await Promise.all([
        supabaseAdmin
          .from('admin_notifications')
          .select('id, type, severity, title, message, tenant_id, amount, metadata, is_read, created_at')
          .order('created_at', { ascending: false })
          .limit(limit),
        supabaseAdmin
          .from('admin_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('is_read', false),
      ])
      if (error) throw error
      return res.status(200).json({ notifications: rows ?? [], unread: count ?? 0 })
    }

    if (req.method === 'PATCH') {
      const { id, markAll } = req.body ?? {}
      if (markAll) {
        const { error } = await supabaseAdmin
          .from('admin_notifications')
          .update({ is_read: true })
          .eq('is_read', false)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }
      if (!id) return res.status(400).json({ error: 'id ou markAll é obrigatório' })
      const { error } = await supabaseAdmin
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('id', id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    console.error('super-admin notifications:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao processar notificações' })
  }
}
