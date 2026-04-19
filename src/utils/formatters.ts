/**
 * Formatadores padrão do sistema — criados na T1 do Epic MELHORIAS-22-ABR2026.
 *
 * Regras:
 * - BRL: sempre 2 casas após vírgula, separador de milhar, prefixo "R$ "
 * - Percent: sempre 3 casas após vírgula, sufixo "%"
 */

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const PERCENT_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

export function formatBRL(value: number | null | undefined): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return 'R$ 0,00'
  return BRL_FORMATTER.format(num)
}

/**
 * Formata valor como porcentagem com 3 casas decimais.
 * Aceita valor já em forma percentual (14.524 → "14,524%") — NÃO multiplica por 100.
 */
export function formatPercent(value: number | null | undefined): string {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0,000%'
  return `${PERCENT_FORMATTER.format(num)}%`
}

/**
 * Converte fração (0.14524) para porcentagem formatada ("14,524%").
 * Use quando o dado está em forma fracionária.
 */
export function formatPercentFromFraction(
  fraction: number | null | undefined,
): string {
  const num = Number(fraction)
  if (!Number.isFinite(num)) return '0,000%'
  return formatPercent(num * 100)
}

/**
 * Parse de string BRL para number (ex: "R$ 1.234,56" → 1234.56)
 */
export function parseBRL(value: string | null | undefined): number {
  if (!value) return 0
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : 0
}
