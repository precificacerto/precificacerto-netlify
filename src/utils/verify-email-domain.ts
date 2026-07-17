import { promises as dns } from 'dns'
import { getEmailDomain } from './contact-validation'

/**
 * Verificação SERVER-ONLY do domínio de um e-mail: confere se o domínio possui
 * registro MX (ou, em fallback, registro A/AAAA) — ou seja, se é um domínio capaz
 * de RECEBER e-mails. Rejeita domínios inexistentes / com erro de digitação
 * (ex.: "gmial.com"). NÃO garante que a caixa específica existe (isso exigiria
 * serviço externo), mas elimina domínios falsos.
 *
 * Best-effort: em caso de falha de rede/timeout inesperada, retorna { ok: true }
 * para NÃO bloquear cadastros legítimos por instabilidade de DNS. Só retorna
 * inválido quando o DNS responde de forma conclusiva que o domínio não existe /
 * não tem como receber e-mail.
 */
export async function verifyEmailDomainHasMx(
  email: string,
): Promise<{ ok: boolean; reason?: string }> {
  const domain = getEmailDomain(email)
  if (!domain || !domain.includes('.')) return { ok: false, reason: 'invalid_domain' }

  try {
    const mx = await dns.resolveMx(domain)
    if (mx && mx.length > 0 && mx.some(r => r.exchange)) return { ok: true }
    // Sem MX: alguns domínios aceitam e-mail via registro A (RFC 5321 §5). Tenta fallback.
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    // Domínio não existe / sem registros → conclusivamente inválido.
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      // Ainda tenta A/AAAA antes de reprovar (domínio pode receber via A).
    } else {
      // Erro transitório de DNS (timeout, servfail…): não bloqueia.
      return { ok: true }
    }
  }

  try {
    const a = await dns.resolve(domain)
    if (a && a.length > 0) return { ok: true }
  } catch {
    // ignora
  }

  try {
    const aaaa = await dns.resolve6(domain)
    if (aaaa && aaaa.length > 0) return { ok: true }
  } catch {
    // ignora
  }

  return { ok: false, reason: 'no_mx' }
}
