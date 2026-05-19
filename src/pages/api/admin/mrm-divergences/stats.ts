import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { supabaseAdmin } from '@/supabase/admin'

/**
 * GET /api/admin/mrm-divergences/stats?from=ISO&to=ISO
 *
 * Super-admin only. Retorna agregados consumidos pelo dashboard
 * /admin/mrm-divergences (S3.2):
 *   - totalCount
 *   - p50 / p95 / p99 de diff_percent
 *   - top 10 tenants por contagem de divergências
 *   - últimas 100 divergências
 *
 * Por padrão, janela = últimos 7 dias.
 * Performance alvo: <500ms para 7 dias de dados — index parcial
 * idx_mrm_divergences_critical + idx_mrm_divergences_tenant_diff cobrem
 * o caso comum.
 */

type DivergenceRow = {
  id: string
  tenant_id: string | null
  document_id: string | null
  document_type: string | null
  divergence_type: string
  motor_version_client: string | null
  motor_version_edge: string | null
  diff_amount: number | null
  diff_percent: number | null
  fields_diverged: string[] | null
  edge_error: string | null
  shadow_duration_ms: number | null
  created_at: string
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1] ?? sorted[base]
  return sorted[base] + rest * (next - sorted[base])
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const now = Date.now()
  const defaultFromIso = new Date(now - 7 * 24 * 3600_000).toISOString()
  const fromIso = typeof req.query.from === 'string' ? req.query.from : defaultFromIso
  const toIso =
    typeof req.query.to === 'string' ? req.query.to : new Date(now).toISOString()

  try {
    // Query única paginada — limitamos a 50k para safety em janelas grandes.
    // Para shadow-mode (volumes baixos) isso é mais que suficiente.
    const { data, error } = await supabaseAdmin
      .from('mrm_engine_divergences')
      .select(
        'id, tenant_id, document_id, document_type, divergence_type, motor_version_client, motor_version_edge, diff_amount, diff_percent, fields_diverged, edge_error, shadow_duration_ms, created_at'
      )
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(50_000)

    if (error) {
      console.error('[admin/mrm-divergences/stats] query error:', error.message)
      return res.status(500).json({ error: error.message })
    }

    const rows = (data ?? []) as DivergenceRow[]
    const numeric = rows.filter((r) => r.divergence_type === 'numeric_divergence')

    const percentsSorted = numeric
      .map((r) => Number(r.diff_percent ?? 0))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)

    const stats = {
      total: rows.length,
      numericCount: numeric.length,
      edgeUnavailableCount: rows.filter(
        (r) => r.divergence_type === 'edge_unavailable'
      ).length,
      shadowExceptionCount: rows.filter(
        (r) => r.divergence_type === 'shadow_exception'
      ).length,
      p50: quantile(percentsSorted, 0.5),
      p95: quantile(percentsSorted, 0.95),
      p99: quantile(percentsSorted, 0.99),
    }

    // Top 10 tenants por contagem
    const tenantStats = new Map<
      string,
      { count: number; max_diff_percent: number; max_diff_amount: number }
    >()
    for (const r of rows) {
      const tid = r.tenant_id ?? '__null__'
      const cur = tenantStats.get(tid) ?? {
        count: 0,
        max_diff_percent: 0,
        max_diff_amount: 0,
      }
      cur.count += 1
      cur.max_diff_percent = Math.max(
        cur.max_diff_percent,
        Number(r.diff_percent ?? 0)
      )
      cur.max_diff_amount = Math.max(
        cur.max_diff_amount,
        Number(r.diff_amount ?? 0)
      )
      tenantStats.set(tid, cur)
    }
    const topTenants = Array.from(tenantStats.entries())
      .map(([tenant_id, s]) => ({
        tenant_id: tenant_id === '__null__' ? null : tenant_id,
        ...s,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Últimas 100 divergências (rows já vem ordenado desc)
    const recent = rows.slice(0, 100)

    return res.status(200).json({
      window: { from: fromIso, to: toIso },
      stats,
      topTenants,
      recent,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[admin/mrm-divergences/stats] error:', msg)
    return res.status(500).json({ error: msg })
  }
}
