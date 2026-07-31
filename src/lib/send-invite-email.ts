/**
 * FEAT-INVITE-EMAIL (30/07/2026).
 *
 * Envia ao funcionário convidado o e-mail de CONVITE para acessar a tenant, com o
 * link de aceite (definição de senha em /aceitar-convite).
 *
 * Antes, o convite dependia do Supabase Auth (inviteUserByEmail), que só dispara
 * e-mail se houver Custom SMTP configurado no Dashboard do Supabase — o que não
 * estava ativo, então o e-mail nunca chegava. Agora o link é gerado via
 * admin.generateLink({ type: 'invite' }) e o envio usa a MESMA infra SMTP das
 * demais mensagens do sistema (SMTP_HOST/PORT/USER/PASS/FROM), sob nosso controle.
 *
 * Retorna { sent } — quando `sent` é false (SMTP ausente ou falha), o chamador
 * deve expor o `inviteLink` ao admin para envio manual (WhatsApp, etc.).
 */

const SUPPORT_EMAIL = process.env.SALES_NOTIFY_EMAIL || 'precificacerto@gmail.com'

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendInviteEmail(params: {
  to: string
  name?: string
  inviteLink: string
  tenantName?: string
}): Promise<{ sent: boolean }> {
  const host = process.env.SMTP_HOST
  if (!host) {
    console.log('[invite-email] SMTP_HOST not set — skipping invite e-mail (admin deve enviar o link manualmente)')
    return { sent: false }
  }
  if (!params.to) {
    console.warn('[invite-email] destinatário sem e-mail — skip')
    return { sent: false }
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

    const nome = escapeHtml((params.name || '').trim() || 'você')
    const empresa = params.tenantName ? escapeHtml(params.tenantName) : null
    const link = params.inviteLink

    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.6">` +
      `<h2 style="margin:0 0 12px">Você foi convidado(a) para o Precifica Certo 🎉</h2>` +
      `<p>Olá, ${nome}.</p>` +
      `<p>${empresa ? `A empresa <strong>${empresa}</strong> convidou` : 'Você foi convidado(a)'} ` +
      `para acessar o Precifica Certo. Para ativar seu acesso e definir sua senha, ` +
      `clique no botão abaixo:</p>` +
      `<p style="margin:24px 0">` +
      `<a href="${link}" style="background:#12B76A;color:#fff;text-decoration:none;` +
      `padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">` +
      `Aceitar convite e definir senha</a></p>` +
      `<p style="color:#555;font-size:13px">Se o botão não funcionar, copie e cole este link no navegador:<br/>` +
      `<a href="${link}" style="color:#12B76A;word-break:break-all">${escapeHtml(link)}</a></p>` +
      `<hr style="border:none;border-top:1px solid #eee;margin:16px 0" />` +
      `<p>Qualquer dúvida, fale com a gente em ` +
      `<a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>` +
      `<p style="color:#888;font-size:12px">Precifica Certo — precifique com precisão.</p>` +
      `</div>`

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@precificacerto.com',
      to: params.to,
      subject: 'Seu convite de acesso — Precifica Certo',
      html,
    })

    return { sent: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn('[invite-email] envio falhou:', msg)
    return { sent: false }
  }
}
