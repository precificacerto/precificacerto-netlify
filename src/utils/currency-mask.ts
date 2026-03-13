export function currencyMask(value: string) {
  return value.replace(/\D/g, '').replace(/(\d)(\d{2})$/, '$1,$2')
}

export function currencyDotMask(value: string) {
  const cleaned = value.replace(/[^\d,]/g, '');

  const [integerPart, decimalPart] = cleaned.split(',');

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return decimalPart !== undefined
    ? `${formattedInteger},${decimalPart}`
    : formattedInteger;
}
