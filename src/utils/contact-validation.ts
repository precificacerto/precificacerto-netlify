/**
 * Validação de contato do pré-cadastro (nome/e-mail/telefone).
 *
 * Objetivo (diretriz 17/07/2026): aceitar apenas e-mails e telefones plausivelmente
 * REAIS — validação forte de FORMATO (isomórfica, client+server). A verificação do
 * DOMÍNIO do e-mail (registro MX) é feita à parte no servidor (verify-email-domain.ts),
 * pois depende de DNS.
 */

/** Regex de formato de e-mail razoavelmente estrita (RFC-lite). */
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

export function isValidEmailFormat(email: string): boolean {
  const e = String(email || '').trim()
  if (e.length < 5 || e.length > 254) return false
  return EMAIL_RE.test(e)
}

/** Extrai o domínio do e-mail (parte após @), em minúsculas. */
export function getEmailDomain(email: string): string {
  const e = String(email || '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  return at >= 0 ? e.slice(at + 1) : ''
}

/** Apenas os dígitos do telefone. */
export function phoneDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

/**
 * Valida celular brasileiro: 11 dígitos (DDD + 9 + 8 dígitos).
 * DDD válido (11–99) e nono dígito iniciando em 9 (celular).
 */
export function isValidBrazilianMobile(phone: string): boolean {
  const d = phoneDigits(phone)
  if (d.length !== 11) return false
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  // 3º dígito (primeiro após o DDD) deve ser 9 em celulares.
  if (d[2] !== '9') return false
  return true
}

/** Máscara de exibição: (XX) XXXXX-XXXX. */
export function maskPhoneBR(value: string): string {
  const d = phoneDigits(value).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
