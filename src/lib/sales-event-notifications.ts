import { supabaseAdmin } from '@/supabase/admin'

/**
 * FEAT-SALES-NOTIFICATIONS (16/07/2026).
 *
 * Notifica CADA evento de venda/pagamento do Stripe por dois canais:
 *  1. E-mail para precificacerto@gmail.com (equipe) — o QUE aconteceu (venda,
 *     falha, tentativa abandonada, cancelamento);
 *  2. Feed do painel super-admin (tabela admin_notifications).
 *
 * É BEST-EFFORT: qualquer falha é engolida e logada. NUNCA lança — o webhook do
 * Stripe não pode retornar 500 por causa de notificação (senão o Stripe re-tenta
 * o evento e reprocessa a venda).
 */

export type SalesEventKind =
  | 'SALE_SUCCESS'            // venda efetivada (novo cadastro, upgrade ou renovação paga)
  | 'PAYMENT_FAILED'         // pagamento recusado / falha de cobrança
  | 'CHECKOUT_ABANDONED'     // sessão de checkout expirou sem conclusão
  | 'SUBSCRIPTION_CANCELLED' // assinatura cancelada

type Severity = 'success' | 'error' | 'warning' | 'info'

export interface SalesEventInput {
  kind: SalesEventKind
  /** Título curto (aparece no feed e no assunto do e-mail). */
  title: string
  /** Linhas de detalhe (cliente, plano, valor, motivo etc.). */
  lines: string[]
  tenantId?: string | null
  amount?: number | null
  metadata?: Record<string, unknown>
}

const SEVERITY_BY_KIND: Record<SalesEventKind, Severity> = {
  SALE_SUCCESS: 'success',
  PAYMENT_FAILED: 'error',
  CHECKOUT_ABANDONED: 'warning',
  SUBSCRIPTION_CANCELLED: 'warning',
}

const EMOJI_BY_KIND: Record<SalesEventKind, string> = {
  SALE_SUCCESS: '✅',
  PAYMENT_FAILED: '❌',
  CHECKOUT_ABANDONED: '🕓',
  SUBSCRIPTION_CANCELLED: '⚠️',
}

/** Destinatário da equipe (override por env, default fixo do relatório). */
const TEAM_EMAIL = process.env.SALES_NOTIFY_EMAIL || 'precificacerto@gmail.com'

function formatBRL(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function insertAdminNotification(input: SalesEventInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('admin_notifications').insert({
      type: input.kind,
      severity: SEVERITY_BY_KIND[input.kind],
      title: input.title,
      message: input.lines.join('\n'),
      tenant_id: input.tenantId ?? null,
      amount: input.amount ?? null,
      metadata: input.metadata ?? {},
    })
    if (error) console.warn('[sales-notifications] insert admin_notification failed:', error.message)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn('[sales-notifications] insert admin_notification threw:', msg)
  }
}

async function sendTeamEmail(input: SalesEventInput): Promise<void> {
  const host = process.env.SMTP_HOST
  if (!host) {
    console.log('[sales-notifications] SMTP_HOST not set — skipping team e-mail')
    return
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

    const emoji = EMOJI_BY_KIND[input.kind]
    const rowsHtml = input.lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')
    const html =
      `<h2 style="margin:0 0 8px">${emoji} ${escapeHtml(input.title)}</h2>` +
      `<p style="margin:0 0 12px;color:#555">Evento Stripe — Precifica Certo</p>` +
      `<ul style="line-height:1.6">${rowsHtml}</ul>` +
      (input.amount != null ? `<p><strong>Valor:</strong> ${formatBRL(input.amount)}</p>` : '') +
      `<hr style="border:none;border-top:1px solid #eee;margin:16px 0" />` +
      `<p style="color:#888;font-size:12px">Notificação automática. Registrado também no painel super-admin.</p>`

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@precificacerto.com',
      to: TEAM_EMAIL,
      subject: `${emoji} [Precifica Certo] ${input.title}`,
      html,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn('[sales-notifications] team e-mail failed:', msg)
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Dispara e-mail para a equipe + registro no feed do super-admin, em paralelo.
 * Nunca lança — resolve mesmo se um dos canais falhar.
 */
export async function notifySalesEvent(input: SalesEventInput): Promise<void> {
  await Promise.allSettled([insertAdminNotification(input), sendTeamEmail(input)])
}
