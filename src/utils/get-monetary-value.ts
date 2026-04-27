export function getMonetaryValue(value: number): string {
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : 0
  return Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    num
  )
}

export function revertMonetaryValue(value: string): number {
  const s = String(value || '').trim().replace(/\s/g, '')
  if (!s) return 0
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

/** Formata valor para exibição em Input (padrão Brasil: 1.000,00). Use com InputNumber formatter. */
export function formatCurrencyInput(value: number | string | undefined): string {
  if (value === undefined || value === null) return ''
  let num: number
  if (typeof value === 'string') {
    // String com vírgula = formato BR ("63.050,43") → remove pontos de milhar, troca vírgula por ponto
    // String sem vírgula = formato EN do Ant Design ("63050.43") → converte diretamente
    num = value.includes(',')
      ? parseFloat(value.replace(/\./g, '').replace(',', '.'))
      : Number(value)
  } else {
    num = Number(value)
  }
  if (Number.isNaN(num)) return ''
  return getMonetaryValue(num)
}

/** Converte string digitada (Brasil: 1.000,00 ou 297,60) para número. Use com InputNumber parser. */
export function parseCurrencyInput(displayValue: string | undefined): number {
  if (displayValue === undefined || displayValue === null) return 0
  const s = String(displayValue).replace(/R\$\s?/g, '').trim()
  return revertMonetaryValue(s)
}
