import { buildContractPdfBuffer, type ContractParty } from '@/lib/contract-pdf'

/**
 * FEAT-CONTRACT-EMAIL (22/07/2026).
 *
 * Envia ao CLIENTE (contratante) o Contrato de Licença de Uso — Precifica Certo em
 * PDF, preenchido com seus dados. Disparado no PRIMEIRO pagamento confirmado
 * (invoice.paid). O cliente apenas recebe — não precisa assinar (aceite eletrônico
 * já ocorreu na contratação).
 *
 * Reúsa a mesma config SMTP das notificações de venda (SMTP_HOST/PORT/USER/PASS/FROM).
 * É BEST-EFFORT: retorna { sent: boolean } e NUNCA lança — o webhook do Stripe não
 * pode falhar por causa do envio de e-mail (senão o Stripe re-tenta e reprocessa).
 */

const SUPPORT_EMAIL = process.env.SALES_NOTIFY_EMAIL || 'precificacerto@gmail.com'

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendContractEmail(party: ContractParty): Promise<{ sent: boolean }> {
  const host = process.env.SMTP_HOST
  if (!host) {
    console.log('[contract-email] SMTP_HOST not set — skipping contract e-mail')
    return { sent: false }
  }
  if (!party.email) {
    console.warn('[contract-email] party sem e-mail — skip')
    return { sent: false }
  }

  try {
    const pdf = buildContractPdfBuffer(party)

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

    const nome = escapeHtml((party.name || '').trim() || 'Cliente')
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.6">` +
      `<h2 style="margin:0 0 12px">Bem-vindo(a) ao Precifica Certo! 🎉</h2>` +
      `<p>Olá, ${nome}.</p>` +
      `<p>Seu pagamento foi confirmado e sua assinatura está ativa. Em anexo segue o ` +
      `<strong>Contrato de Licença de Uso de Software SaaS – Precifica Certo</strong>, ` +
      `já preenchido com os seus dados.</p>` +
      `<p>Este é apenas a sua via documental — <strong>você não precisa assinar nada</strong>. ` +
      `O aceite eletrônico já foi realizado no momento da contratação e produz plenos efeitos ` +
      `jurídicos (Cláusula 11.7).</p>` +
      `<p>Qualquer dúvida, fale com a gente em ` +
      `<a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>` +
      `<hr style="border:none;border-top:1px solid #eee;margin:16px 0" />` +
      `<p style="color:#888;font-size:12px">Precifica Certo — precifique com precisão.</p>` +
      `</div>`

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@precificacerto.com',
      to: party.email,
      subject: 'Seu contrato — Precifica Certo',
      html,
      attachments: [
        {
          filename: 'Contrato-Precifica-Certo.pdf',
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    })

    return { sent: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn('[contract-email] envio falhou:', msg)
    return { sent: false }
  }
}
