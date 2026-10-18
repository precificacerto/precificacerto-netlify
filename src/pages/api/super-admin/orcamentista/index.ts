/**
 * GET /api/super-admin/orcamentista — a configuração do Orçamentista de TODAS as contas.
 *
 * Só o super admin (`requireSuperAdmin`, o mesmo de `/api/super-admin/tenants`). Lê com
 * `supabaseAdmin` porque a lista atravessa contas; a política de SELECT da tabela também deixa o
 * super admin ler, mas a rota não depende dela. Conta sem linha = Orçamentista desligado.
 *
 * DEPENDE DA MIGRAÇÃO `20261018000001` APLICADA. Sem a tabela, o PostgREST devolve erro e a
 * rota responde 500 — a coluna da tela mostra "indisponível", e NÃO "desligado": não saber não
 * é saber que está desligado (`ausente-vs-falso.md`).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  try {
    const { data, error } = await supabaseAdmin.from('orcamentista_config').select('*')
    if (error) throw error
    return res.status(200).json(data ?? [])
  } catch (err: unknown) {
    console.error('super-admin orcamentista:', (err as { message?: string })?.message ?? 'erro')
    return res.status(500).json({ error: 'Não foi possível ler a configuração do Orçamentista.' })
  }
}
