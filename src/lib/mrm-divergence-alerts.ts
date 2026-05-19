/**
 * MRM S3.2 — Divergence Alerting (best effort).
 *
 * Verifica se as divergências entre motor cliente V2 e edge legado excederam
 * thresholds na janela rolante configurada. Dispara webhook Slack (se
 * `SLACK_WEBHOOK_URL` env existir) e/ou email Nodemailer (se
 * `MRM_ALERT_EMAIL_TO` + SMTP configurados).
 *
 * Anti-padrão: NUNCA enviar PII fiscal nos payloads (apenas IDs e métricas
 * agregadas, com link para o dashboard).
 *
 * Anti-flapping: a checagem é feita em DUAS janelas consecutivas; só dispara
 * alerta se AMBAS violarem (vide /api/cron/check-mrm-divergences).
 *
 * Falha silenciosa: se nenhum canal estiver configurado, faz console.log e
 * retorna { triggered: false, reason: 'no_channels_configured' }.
 */

import { supabaseAdmin } from '@/supabase/admin'

export interface AlertingConfig {
  /** Janela de análise em horas (default: 1) */
  windowHours: number
  /** Limite de divergência média (em %). Ex.: 0.5 = 0.5% */
  thresholdAvgPercent: number
  /** Limite de p99 de diff_amount em R$. Ex.: 5.0 = R$5,00 */
  thresholdP99Amount: number
}

export const DEFAULT_ALERT_CONFIG: AlertingConfig = {
  windowHours: 1,
  thresholdAvgPercent: 0.5,
  thresholdP99Amount: 5.0,
}

export interface WindowStats {
  count: number
  avg_percent: number
  p99_amount: number
  max_amount: number
  top_tenant_id: string | null
  top_tenant_count: number
}

export interface AlertCheckResult {
  triggered: boolean
  reason: string
  stats: WindowStats
  channels: { slack: boolean; email: boolean; logOnly: boolean }
}

const EMPTY_STATS: WindowStats = {
  count: 0,
  avg_percent: 0,
  p99_amount: 0,
  max_amount: 0,
  top_tenant_id: null,
  top_tenant_count: 0,
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

/**
 * Carrega divergências numéricas de uma janela (last `windowHours` ending now
 * minus `offsetHours`). Calcula estatísticas em memória — volumes esperados
 * são baixos durante shadow-mode.
 */
export async function loadWindowStats(
  windowHours: number,
  offsetHours = 0
): Promise<WindowStats> {
  const now = Date.now()
  const endIso = new Date(now - offsetHours * 3600_000).toISOString()
  const startIso = new Date(
    now - (offsetHours + windowHours) * 3600_000
  ).toISOString()

  const { data, error } = await supabaseAdmin
    .from('mrm_engine_divergences')
    .select('tenant_id, diff_amount, diff_percent')
    .eq('divergence_type', 'numeric_divergence')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .limit(50_000)

  if (error) {
    console.error('[mrm-divergence-alerts] loadWindowStats error:', error.message)
    return EMPTY_STATS
  }

  const rows = data ?? []
  if (rows.length === 0) return EMPTY_STATS

  const percents = rows
    .map((r) => Number(r.diff_percent ?? 0))
    .filter((n) => Number.isFinite(n))
  const amounts = rows
    .map((r) => Number(r.diff_amount ?? 0))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)

  const tenantCounts = new Map<string, number>()
  for (const r of rows) {
    const tid = r.tenant_id ?? '__null__'
    tenantCounts.set(tid, (tenantCounts.get(tid) ?? 0) + 1)
  }
  let topTenant: string | null = null
  let topCount = 0
  for (const [tid, c] of tenantCounts) {
    if (c > topCount) {
      topCount = c
      topTenant = tid === '__null__' ? null : tid
    }
  }

  return {
    count: rows.length,
    avg_percent:
      percents.length > 0
        ? percents.reduce((s, n) => s + n, 0) / percents.length
        : 0,
    p99_amount: quantile(amounts, 0.99),
    max_amount: amounts.length > 0 ? amounts[amounts.length - 1] : 0,
    top_tenant_id: topTenant,
    top_tenant_count: topCount,
  }
}

function statsViolatesThresholds(
  stats: WindowStats,
  config: AlertingConfig
): { violates: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (stats.count === 0) return { violates: false, reasons }
  if (stats.avg_percent > config.thresholdAvgPercent) {
    reasons.push(
      `avg_percent ${stats.avg_percent.toFixed(4)}% > threshold ${config.thresholdAvgPercent}%`
    )
  }
  if (stats.p99_amount > config.thresholdP99Amount) {
    reasons.push(
      `p99_amount R$${stats.p99_amount.toFixed(2)} > threshold R$${config.thresholdP99Amount.toFixed(2)}`
    )
  }
  return { violates: reasons.length > 0, reasons }
}

async function sendSlackAlert(
  webhookUrl: string,
  payload: {
    reasons: string[]
    stats: WindowStats
    previousStats: WindowStats
    config: AlertingConfig
    dashboardUrl: string
  }
): Promise<boolean> {
  try {
    const text =
      `:warning: *MRM Divergence Alert* (shadow-mode)\n` +
      `Reasons: ${payload.reasons.join(' | ')}\n` +
      `Window: last ${payload.config.windowHours}h\n` +
      `Count: ${payload.stats.count} (prev ${payload.previousStats.count})\n` +
      `Avg %: ${payload.stats.avg_percent.toFixed(4)}\n` +
      `p99 R$: ${payload.stats.p99_amount.toFixed(2)}\n` +
      `Top tenant: ${payload.stats.top_tenant_id ?? '—'} (${payload.stats.top_tenant_count})\n` +
      `<${payload.dashboardUrl}|Open dashboard>`

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      console.warn(
        `[mrm-divergence-alerts] slack non-ok: ${res.status} ${res.statusText}`
      )
      return false
    }
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn(`[mrm-divergence-alerts] slack failed: ${msg}`)
    return false
  }
}

async function sendEmailAlert(payload: {
  to: string
  from: string
  reasons: string[]
  stats: WindowStats
  previousStats: WindowStats
  config: AlertingConfig
  dashboardUrl: string
}): Promise<boolean> {
  // Lazy import — nodemailer só carrega se realmente formos enviar email.
  // Falha silenciosa se SMTP não estiver configurado.
  const host = process.env.SMTP_HOST
  if (!host) {
    console.log('[mrm-divergence-alerts] SMTP_HOST not set — skipping email')
    return false
  }
  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    })
    const html =
      `<h2>MRM Divergence Alert (shadow-mode)</h2>` +
      `<p><strong>Reasons:</strong> ${payload.reasons.join(' | ')}</p>` +
      `<ul>` +
      `<li>Window: last ${payload.config.windowHours}h (2 consecutive)</li>` +
      `<li>Count: ${payload.stats.count} (prev ${payload.previousStats.count})</li>` +
      `<li>Avg %: ${payload.stats.avg_percent.toFixed(4)}</li>` +
      `<li>p99 R$: ${payload.stats.p99_amount.toFixed(2)}</li>` +
      `<li>Top tenant: ${payload.stats.top_tenant_id ?? '—'} (${payload.stats.top_tenant_count})</li>` +
      `</ul>` +
      `<p><a href="${payload.dashboardUrl}">Open dashboard</a></p>`
    await transporter.sendMail({
      from: payload.from,
      to: payload.to,
      subject: '[MRM] Divergence threshold violated (shadow-mode)',
      html,
    })
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn(`[mrm-divergence-alerts] email failed: ${msg}`)
    return false
  }
}

/**
 * Checa janela atual + janela imediatamente anterior. Dispara alerta apenas
 * se AMBAS violarem (anti-flapping). Best effort — falha silenciosa por canal.
 */
export async function checkAndAlertDivergences(
  partialConfig: Partial<AlertingConfig> = {}
): Promise<AlertCheckResult> {
  const config: AlertingConfig = { ...DEFAULT_ALERT_CONFIG, ...partialConfig }

  const currentStats = await loadWindowStats(config.windowHours, 0)
  const currentCheck = statsViolatesThresholds(currentStats, config)

  if (!currentCheck.violates) {
    return {
      triggered: false,
      reason:
        currentStats.count === 0
          ? 'no_divergences_in_window'
          : 'current_window_ok',
      stats: currentStats,
      channels: { slack: false, email: false, logOnly: false },
    }
  }

  // Janela anterior (anti-flapping)
  const previousStats = await loadWindowStats(
    config.windowHours,
    config.windowHours
  )
  const previousCheck = statsViolatesThresholds(previousStats, config)

  if (!previousCheck.violates) {
    return {
      triggered: false,
      reason: 'anti_flapping_previous_window_ok',
      stats: currentStats,
      channels: { slack: false, email: false, logOnly: false },
    }
  }

  const slackUrl = process.env.SLACK_WEBHOOK_URL
  const emailTo = process.env.MRM_ALERT_EMAIL_TO
  const emailFrom = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const dashboardUrl = `${appUrl.replace(/\/$/, '')}/admin/mrm-divergences`

  const reasons = currentCheck.reasons

  let slackSent = false
  let emailSent = false

  if (slackUrl) {
    slackSent = await sendSlackAlert(slackUrl, {
      reasons,
      stats: currentStats,
      previousStats,
      config,
      dashboardUrl,
    })
  }

  if (emailTo && emailFrom) {
    emailSent = await sendEmailAlert({
      to: emailTo,
      from: emailFrom,
      reasons,
      stats: currentStats,
      previousStats,
      config,
      dashboardUrl,
    })
  }

  const logOnly = !slackSent && !emailSent
  if (logOnly) {
    console.warn(
      '[mrm-divergence-alerts] threshold violated but no channel sent:',
      JSON.stringify({ reasons, stats: currentStats }, null, 2)
    )
  }

  return {
    triggered: true,
    reason: reasons.join(' | '),
    stats: currentStats,
    channels: { slack: slackSent, email: emailSent, logOnly },
  }
}
