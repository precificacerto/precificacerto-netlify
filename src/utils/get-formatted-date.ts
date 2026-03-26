export function getFormattedDate(date: Date) {
  const day = date.getUTCDate()
  const month = date.getUTCMonth() + 1
  const year = date.getUTCFullYear()

  return `${day < 10 ? `0${day}` : day}/${month < 10 ? `0${month}` : month}/${year}`
}
